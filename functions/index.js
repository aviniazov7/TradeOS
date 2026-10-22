const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const {
  runAdminNotificationScan,
  handleUserNotificationEvent,
  stampLastTradeAt,
} = require("./adminNotificationRunner");
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();

// ──────────── Google Sign-In for iOS PWA ────────────
// Bypasses Firebase's signInWithIdp endpoint which fails with auth/network-request-failed
// in iOS standalone PWAs. Exchanges a Google ID token (from GIS) for a Firebase custom token.
const GOOGLE_CLIENT_ID = "80529278454-eirltbaukcv1ftquu6uth5bbk3srnl7d.apps.googleusercontent.com";

exports.googleSignIn = onRequest({
  region: "europe-west1",
  cors: true,
  maxInstances: 10,
}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { idToken } = req.body || {};
  if (!idToken || typeof idToken !== "string") {
    res.status(400).json({ error: "Missing idToken" });
    return;
  }

  try {
    // Verify the Google ID token
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload?.email) {
      res.status(401).json({ error: "Invalid Google token" });
      return;
    }

    // Get or create a matching Firebase Auth user (keyed by email)
    const email = payload.email;
    let firebaseUid;
    try {
      const existing = await getAuth().getUserByEmail(email);
      firebaseUid = existing.uid;
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        const created = await getAuth().createUser({
          email,
          emailVerified: !!payload.email_verified,
          displayName: payload.name,
          photoURL: payload.picture,
        });
        firebaseUid = created.uid;
      } else {
        throw err;
      }
    }

    const customToken = await getAuth().createCustomToken(firebaseUid, {
      provider: "google.com",
      googleSub: payload.sub,
    });

    res.json({ customToken });
  } catch (err) {
    console.error("googleSignIn failed:", err);
    res.status(500).json({ error: err.message || "Sign-in failed" });
  }
});

// ──────────── MEXC Futures API ────────────
async function fetchMexcTrades(apiKey, apiSecret) {
  const timestamp = Date.now().toString();
  const params = `timestamp=${timestamp}`;
  const signature = crypto.createHmac("sha256", apiSecret).update(params).digest("hex");

  const url = `https://api.mexc.com/api/v3/myTrades?symbol=BTCUSDT&${params}&signature=${signature}`;

  // MEXC Futures Contract API
  const contractUrl = "https://contract.mexc.com/api/v1/private/order/list/history_orders";
  const contractParams = { page_num: 1, page_size: 100 };
  const reqTime = Date.now().toString();
  const paramStr = Object.entries(contractParams).map(([k, v]) => `${k}=${v}`).join("&");
  const signStr = `${reqTime}${paramStr}`;
  const contractSig = crypto.createHmac("sha256", apiSecret).update(signStr).digest("hex");

  const res = await fetch(contractUrl + "?" + paramStr, {
    headers: {
      "ApiKey": apiKey,
      "Request-Time": reqTime,
      "Signature": contractSig,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MEXC API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.code !== 200 && data.code !== 0) {
    throw new Error(`MEXC API error: ${data.msg || JSON.stringify(data)}`);
  }

  const orders = data.data || [];
  return orders.map((o) => ({
    pair: (o.symbol || "").replace("_USDT", "USDT"),
    direction: o.side === 1 ? "long" : "short",
    marketType: "futures",
    entryPrice: parseFloat(o.dealAvgPrice || o.price || 0),
    exitPrice: parseFloat(o.dealAvgPrice || o.price || 0),
    positionSize: parseFloat(o.dealVol || o.vol || 0),
    leverage: parseInt(o.leverage || 10),
    fees: parseFloat(o.takerFee || o.makerFee || 0),
    entryDate: new Date(o.createTime || o.updateTime),
    exitDate: new Date(o.updateTime || o.createTime),
    pnl: parseFloat(o.profit || 0),
    source: "mexc_api",
    externalId: o.orderId?.toString(),
  }));
}

// ──────────── Bybit V5 API ────────────
async function fetchBybitTrades(apiKey, apiSecret) {
  const timestamp = Date.now().toString();
  const recvWindow = "20000";
  const category = "linear";

  const params = `category=${category}&limit=100`;
  const preSign = `${timestamp}${apiKey}${recvWindow}${params}`;
  const signature = crypto.createHmac("sha256", apiSecret).update(preSign).digest("hex");

  const url = `https://api.bybit.com/v5/execution/list?${params}`;

  const res = await fetch(url, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": recvWindow,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bybit API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg}`);
  }

  const executions = data.result?.list || [];
  // Group by orderId
  const orderMap = {};
  for (const exec of executions) {
    const oid = exec.orderId;
    if (!orderMap[oid]) {
      orderMap[oid] = {
        symbol: exec.symbol,
        side: exec.side,
        fills: [],
        orderType: exec.orderType,
      };
    }
    orderMap[oid].fills.push(exec);
  }

  return Object.values(orderMap).map((order) => {
    const totalQty = order.fills.reduce((s, f) => s + parseFloat(f.execQty || 0), 0);
    const avgPrice = order.fills.reduce((s, f) => s + parseFloat(f.execPrice || 0) * parseFloat(f.execQty || 0), 0) / (totalQty || 1);
    const totalFee = order.fills.reduce((s, f) => s + parseFloat(f.execFee || 0), 0);
    const lastExec = order.fills[order.fills.length - 1];

    return {
      pair: (order.symbol || "").replace("USDT", "") + "USDT",
      direction: order.side === "Buy" ? "long" : "short",
      marketType: "futures",
      entryPrice: avgPrice,
      exitPrice: avgPrice,
      positionSize: totalQty,
      leverage: 10,
      fees: Math.abs(totalFee),
      entryDate: new Date(parseInt(lastExec.execTime)),
      exitDate: new Date(parseInt(lastExec.execTime)),
      pnl: parseFloat(lastExec.closedPnl || 0),
      source: "bybit_api",
      externalId: order.fills[0]?.orderId,
    };
  });
}

// ──────────── Binance Futures API ────────────
async function fetchBinanceTrades(apiKey, apiSecret) {
  const timestamp = Date.now().toString();
  const params = `timestamp=${timestamp}&limit=100`;
  const signature = crypto.createHmac("sha256", apiSecret).update(params).digest("hex");

  const url = `https://fapi.binance.com/fapi/v1/userTrades?${params}&signature=${signature}`;

  const res = await fetch(url, {
    headers: {
      "X-MBX-APIKEY": apiKey,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Binance API error: ${res.status} ${text}`);
  }

  const trades = await res.json();
  if (trades.code) {
    throw new Error(`Binance API error: ${trades.msg}`);
  }

  return trades.map((t) => ({
    pair: t.symbol || "",
    direction: t.side === "BUY" ? "long" : "short",
    marketType: "futures",
    entryPrice: parseFloat(t.price || 0),
    exitPrice: parseFloat(t.price || 0),
    positionSize: parseFloat(t.qty || 0),
    leverage: 10,
    fees: parseFloat(t.commission || 0),
    entryDate: new Date(t.time),
    exitDate: new Date(t.time),
    pnl: parseFloat(t.realizedPnl || 0),
    source: "binance_api",
    externalId: t.id?.toString(),
  }));
}

// ──────────── Cloud Function ────────────
exports.importTrades = onCall({
  region: "europe-west1",
  maxInstances: 10,
}, async (request) => {
  // Auth check
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "חייב להיות מחובר");
  }

  const uid = request.auth.uid;
  const { exchangeId, journalId } = request.data;

  if (!exchangeId || !journalId) {
    throw new HttpsError("invalid-argument", "חסר exchangeId או journalId");
  }

  // Get API keys from Firestore
  const settingsSnap = await db.doc(`users/${uid}/settings/exchanges`).get();
  if (!settingsSnap.exists) {
    throw new HttpsError("not-found", "לא נמצאו הגדרות בורסה");
  }

  const settings = settingsSnap.data();
  const exchangeData = settings[exchangeId];

  if (!exchangeData?.apiKey || !exchangeData?.apiSecret) {
    throw new HttpsError("not-found", `לא נמצאו מפתחות API עבור ${exchangeId}`);
  }

  // Fetch trades from exchange
  let trades;
  try {
    switch (exchangeId) {
    case "mexc":
      trades = await fetchMexcTrades(exchangeData.apiKey, exchangeData.apiSecret);
      break;
    case "bybit":
      trades = await fetchBybitTrades(exchangeData.apiKey, exchangeData.apiSecret);
      break;
    case "binance":
      trades = await fetchBinanceTrades(exchangeData.apiKey, exchangeData.apiSecret);
      break;
    default:
      throw new HttpsError("invalid-argument", `בורסה לא נתמכת: ${exchangeId}`);
    }
  } catch (err) {
    console.error(`Exchange API error (${exchangeId}):`, err);
    throw new HttpsError("internal", `שגיאה מהבורסה: ${err.message}`);
  }

  // Filter out already imported trades
  const existingSnap = await db.collection(`users/${uid}/trades`)
    .where("source", "==", `${exchangeId}_api`)
    .get();

  const existingIds = new Set(existingSnap.docs.map((d) => d.data().externalId).filter(Boolean));

  const newTrades = trades.filter((t) => t.externalId && !existingIds.has(t.externalId));

  // Save to Firestore
  let imported = 0;
  const batch = db.batch();

  for (const trade of newTrades) {
    const ref = db.collection(`users/${uid}/trades`).doc();
    batch.set(ref, {
      ...trade,
      journalId,
      createdAt: new Date(),
      stopLoss: 0,
      strategy: "",
      timeframe: "4H",
      notes: "",
      result: trade.pnl > 0 ? "win" : trade.pnl < 0 ? "loss" : "breakeven",
      netPnl: trade.pnl - trade.fees,
    });
    imported++;
    if (imported >= 500) break; // Batch limit
  }

  if (imported > 0) {
    await batch.commit();
  }

  return {
    imported,
    total: trades.length,
    skipped: trades.length - imported,
    message: imported > 0
      ? `${imported} עסקאות יובאו בהצלחה`
      : "אין עסקאות חדשות לייבוא",
  };
});

// ──────────── Admin notification center ────────────
// Signup and premium upgrade/cancel are emitted by the document triggers
// below, as the user document is written. Churn and inactive users produce
// no write, so they are reconciled once a week: Sunday 09:00 Asia/Jerusalem.
// That scan also backfills a missed signup from the last 2 days and a premium
// expiry that never wrote a user document.
const NOTIFY_REGION = "europe-west1";

exports.scanAdminNotifications = onSchedule({
  schedule: "0 9 * * 0",
  timeZone: "Asia/Jerusalem",
  region: NOTIFY_REGION,
  timeoutSeconds: 300,
  memory: "256MiB",
}, async () => {
  await runAdminNotificationScan(db);
});

exports.onUserCreatedAdminNotification = onDocumentCreated({
  document: "users/{uid}",
  region: NOTIFY_REGION,
}, async (event) => {
  const data = event.data?.data();
  if (!data) return;
  await handleUserNotificationEvent(db, event.params.uid, "create", data);
});

exports.onUserUpdatedAdminNotification = onDocumentUpdated({
  document: "users/{uid}",
  region: NOTIFY_REGION,
}, async (event) => {
  const data = event.data?.after?.data();
  if (!data) return;
  await handleUserNotificationEvent(db, event.params.uid, "update", data);
});

exports.stampLastTradeAt = onDocumentWritten({
  document: "users/{uid}/trades/{tradeId}",
  region: NOTIFY_REGION,
}, async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  await stampLastTradeAt(db, event.params.uid, after.data());
});
