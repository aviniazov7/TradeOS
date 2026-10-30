const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const {
  runAdminNotificationScan,
  handleUserNotificationEvent,
  stampLastTradeAt,
} = require("./adminNotificationRunner");

initializeApp();
const db = getFirestore();

// importTrades used to read plaintext apiKey/apiSecret from
// users/{uid}/settings/exchanges and call the exchange with no rate limit.
// The live app stores those secrets only in encrypted Worker KV, and the
// callable was still deployed. It is removed so a functions deploy cannot
// publish that reader again.

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
