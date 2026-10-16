// Admin notification planner. Pure: no Firebase, no network. The scheduled
// function and the Firestore triggers in adminNotificationRunner.js apply
// whatever this returns. Unit tests cover the same functions.
//
// Adding a type:
//   1. Add an entry to NOTIFICATION_TYPES (id, Hebrew label, description).
//   2. Add Hebrew copy in buildNotification.
//   3. Decide when it fires inside planUser (or a small detector next to
//      detectActivity) and give it a stable id `${type}_${uid}_${episode}`
//      so the same open condition is not written twice.
//   4. The admin UI lists NOTIFICATION_TYPES automatically (icon map in
//      AdminNotifications.jsx is the only other place that needs a line).

const DAY_MS = 24 * 60 * 60 * 1000;

// A signup older than this is not announced on the reconciliation scan, so the
// first deploy does not backfill every existing account. The create trigger
// announces a signup immediately and does not use this window.
const SIGNUP_LOOKBACK_DAYS = 2;

const NOTIFICATION_TYPES = {
  churn_risk: {
    id: 'churn_risk',
    label: 'סיכון נטישה',
    description: 'היה פעיל, ואז אין כניסה ואין עסקה כבר כמה ימים',
    defaultEnabled: true,
  },
  inactive_user: {
    id: 'inactive_user',
    label: 'משתמש לא פעיל',
    description: 'אין כניסה זמן ארוך (גם אם מעולם לא חזר אחרי ההרשמה)',
    defaultEnabled: true,
  },
  signup: {
    id: 'signup',
    label: 'משתמש חדש',
    description: 'הרשמה חדשה',
    defaultEnabled: true,
  },
  premium_upgrade: {
    id: 'premium_upgrade',
    label: 'שדרוג ל-Premium',
    description: 'מעבר למנוי Premium',
    defaultEnabled: true,
  },
  premium_cancel: {
    id: 'premium_cancel',
    label: 'ביטול Premium',
    description: 'מנוי Premium בוטל או שפג תוקפו',
    defaultEnabled: true,
  },
};

const DEFAULT_SETTINGS = {
  enabled: true,
  types: Object.fromEntries(Object.values(NOTIFICATION_TYPES).map((t) => [t.id, t.defaultEnabled])),
  thresholds: { churnDays: 7, inactiveDays: 30 },
};

function toMs(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof v === 'object') {
    if (typeof v.toMillis === 'function') {
      const t = v.toMillis();
      if (Number.isFinite(t)) return t;
    }
    if (typeof v.toDate === 'function') {
      const d = v.toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d.getTime();
    }
    const s = v.seconds ?? v._seconds;
    if (typeof s === 'number') return s * 1000;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(max, Math.max(min, Math.round(x)));
}

function normalizeSettings(raw) {
  const types = {};
  for (const id of Object.keys(NOTIFICATION_TYPES)) {
    const v = raw && raw.types ? raw.types[id] : undefined;
    types[id] = typeof v === 'boolean' ? v : NOTIFICATION_TYPES[id].defaultEnabled;
  }
  // Keep toggles for types this build doesn't know yet, so an older function
  // revision doesn't wipe a switch a newer admin UI saved.
  if (raw && raw.types && typeof raw.types === 'object') {
    for (const [key, value] of Object.entries(raw.types)) {
      if (!(key in types) && typeof value === 'boolean') types[key] = value;
    }
  }
  const churnDays = clampInt(raw?.thresholds?.churnDays, 1, 90, DEFAULT_SETTINGS.thresholds.churnDays);
  let inactiveDays = clampInt(raw?.thresholds?.inactiveDays, 2, 365, DEFAULT_SETTINGS.thresholds.inactiveDays);
  // Inactive is the longer silence. If an admin sets them equal or inverted,
  // push inactive one day past churn so the two alerts stay distinct.
  if (inactiveDays <= churnDays) inactiveDays = Math.min(365, churnDays + 1);
  return {
    enabled: !raw || raw.enabled !== false,
    types,
    thresholds: { churnDays, inactiveDays },
  };
}

function isTypeEnabled(settings, type) {
  const s = normalizeSettings(settings);
  if (!s.enabled) return false;
  if (typeof s.types[type] === 'boolean') return s.types[type];
  return true;
}

function isAdminUser(user) {
  return user?.role === 'admin';
}

// Same premium rule as the admin panel: plan === 'premium' and, when an
// expiry is set, it is still in the future. A missing expiry is lifetime.
// Admins are not subscribers, so they never produce upgrade/cancel events.
function isPremiumActive(user, now) {
  if (!user || isAdminUser(user)) return false;
  if (user.plan !== 'premium') return false;
  if (user.planExpires == null || user.planExpires === '') return true;
  const exp = toMs(user.planExpires);
  if (!exp) return true;
  return exp > now;
}

function lastLoginMs(user) {
  return toMs(user?.lastActive);
}

function lastTradeMs(user) {
  return toMs(user?.lastTradeAt);
}

function createdMs(user) {
  return toMs(user?.createdAt);
}

// Latest moment a trade document proves the user was trading. Used by the
// trade trigger to maintain users/{uid}.lastTradeAt.
function tradeActivityMs(data) {
  if (!data) return 0;
  return Math.max(toMs(data.entryDate), toMs(data.exitDate), toMs(data.updatedAt), toMs(data.createdAt));
}

// "Was active" means they did more than open the app on the day they signed
// up: at least one trade, or a login on a later day. A same-day signup that
// never returned is an inactive-user problem, not churn.
function wasEngaged(user) {
  if (!user || isAdminUser(user)) return false;
  if (lastTradeMs(user) > 0) return true;
  const created = createdMs(user);
  const login = lastLoginMs(user);
  return login > 0 && created > 0 && login - created >= DAY_MS;
}

function blankState() {
  return {
    churnOpen: false,
    churnEpisode: 1,
    inactiveOpen: false,
    inactiveEpisode: 1,
    signupSeen: false,
    premiumInitialized: false,
    premiumActive: false,
    premiumRev: 0,
  };
}

/**
 * Churn risk: engaged, then no login AND no trade for >= churnDays (default
 * 7), and not yet in the long-inactive bucket.
 * Inactive: no login for >= inactiveDays (default 30). Someone who never
 * logged in is measured from createdAt.
 * The two are mutually exclusive: once the longer silence is reached, only
 * inactive_user fires, so the feed doesn't double-report the same absence.
 * Admins are never flagged.
 */
function detectActivity(user, settings, now) {
  const empty = { churn: false, inactive: false, silentLoginDays: 0, silentActivityDays: 0 };
  if (!user || isAdminUser(user)) return empty;
  const s = normalizeSettings(settings);
  const login = lastLoginMs(user);
  const trade = lastTradeMs(user);
  const created = createdMs(user);
  const activity = Math.max(login, trade);
  const loginAnchor = login || created;
  if (!loginAnchor) return empty;
  const silentLoginDays = Math.floor((now - loginAnchor) / DAY_MS);
  const silentActivityDays = Math.floor((now - (activity || loginAnchor)) / DAY_MS);
  const inactive = silentLoginDays >= s.thresholds.inactiveDays;
  const churn = !inactive
    && wasEngaged(user)
    && silentActivityDays >= s.thresholds.churnDays;
  return { churn, inactive, silentLoginDays, silentActivityDays };
}

function displayName(user) {
  const name = (user?.displayName || user?.email || 'משתמש').trim();
  return name || 'משתמש';
}

function daysPhrase(days) {
  const n = Math.max(0, Math.floor(Number(days) || 0));
  if (n === 1) return 'יום';
  return `${n} ימים`;
}

function buildNotification(type, user, extra) {
  const name = displayName(user);
  const days = daysPhrase(extra.days);
  const neverLoggedIn = extra.neverLoggedIn === true;
  const copy = {
    churn_risk: {
      title: 'סיכון נטישה',
      body: `${name} היה פעיל והפסיק — אין כניסה ואין עסקה כבר ${days}.`,
    },
    inactive_user: {
      title: 'משתמש לא פעיל',
      body: neverLoggedIn
        ? `${name} נרשם ולא נכנס כבר ${days}.`
        : `${name} לא נכנס כבר ${days}.`,
    },
    signup: {
      title: 'משתמש חדש',
      body: `${name} נרשם ל-TradeOS.`,
    },
    premium_upgrade: {
      title: 'שדרוג ל-Premium',
      body: `${name} עבר למנוי Premium.`,
    },
    premium_cancel: {
      title: 'ביטול Premium',
      body: `${name} כבר לא במנוי Premium.`,
    },
  }[type];
  if (!copy) return null;
  const episode = extra.episode || 1;
  return {
    id: `${type}_${user.uid}_${episode}`,
    type,
    userId: user.uid,
    userName: name,
    userEmail: user.email || '',
    title: copy.title,
    body: copy.body,
    episode,
    read: false,
  };
}

// Ongoing conditions (churn / inactive): a disabled type does not consume the
// episode, so turning it back on still announces someone who is quiet right
// now. Point events (signup, premium) are recorded either way so they don't
// show up later as "new" after the switch is turned back on.
function applyCondition(state, notifications, user, type, on, extra, typeEnabled, openKey, episodeKey) {
  if (on) {
    if (!state[openKey] && typeEnabled) {
      const episode = state[episodeKey] || 1;
      const note = buildNotification(type, user, { ...extra, episode });
      if (note) notifications.push(note);
      state[openKey] = true;
    }
    return;
  }
  if (state[openKey]) {
    state[openKey] = false;
    state[episodeKey] = (state[episodeKey] || 1) + 1;
  }
}

/**
 * Plan notification creates + the next dedupe state for one user.
 * `source`:
 *   - 'scan'    scheduled reconciliation (churn, inactive, recent signups,
 *               premium expiry that never wrote a document)
 *   - 'create'  users/{uid} just created
 *   - 'update'  users/{uid} changed (plan, lastActive, lastTradeAt, …)
 *
 * State fields the caller must persist (adminNotificationState/{uid}):
 *   churnOpen, churnEpisode, inactiveOpen, inactiveEpisode,
 *   signupSeen, premiumInitialized, premiumActive, premiumRev
 */
function planUser(user, prevState, settings, now, source = 'scan') {
  const state = { ...blankState(), ...(prevState || {}) };
  const notifications = [];
  if (!user?.uid || isAdminUser(user)) return { state, notifications };
  const s = normalizeSettings(settings);
  const enabled = (type) => isTypeEnabled(s, type);

  if (!state.signupSeen && (source === 'create' || source === 'scan')) {
    const created = createdMs(user);
    const ageDays = created ? (now - created) / DAY_MS : Infinity;
    const inWindow = source === 'create' || (created > 0 && ageDays <= SIGNUP_LOOKBACK_DAYS);
    if (inWindow && enabled('signup')) {
      const note = buildNotification('signup', user, { episode: 1 });
      if (note) notifications.push(note);
    }
    // Seen even when the type is off or the account is older than the
    // lookback — otherwise enabling the type later would backfill everyone.
    if (source === 'create' || created > 0) state.signupSeen = true;
  }

  const active = isPremiumActive(user, now);
  if (!state.premiumInitialized) {
    state.premiumInitialized = true;
    state.premiumActive = active;
    // First observation on a scan is a baseline (existing subscribers are not
    // "new upgrades"). A document created already-premium is a real upgrade.
    if (source === 'create' && active && enabled('premium_upgrade')) {
      state.premiumRev = (state.premiumRev || 0) + 1;
      const note = buildNotification('premium_upgrade', user, { episode: state.premiumRev });
      if (note) notifications.push(note);
    }
  } else if (state.premiumActive !== active) {
    state.premiumRev = (state.premiumRev || 0) + 1;
    const type = active ? 'premium_upgrade' : 'premium_cancel';
    if (enabled(type)) {
      const note = buildNotification(type, user, { episode: state.premiumRev });
      if (note) notifications.push(note);
    }
    state.premiumActive = active;
  }

  const det = detectActivity(user, s, now);
  applyCondition(
    state, notifications, user, 'churn_risk', det.churn,
    { days: det.silentActivityDays },
    enabled('churn_risk'), 'churnOpen', 'churnEpisode',
  );
  applyCondition(
    state, notifications, user, 'inactive_user', det.inactive,
    { days: det.silentLoginDays, neverLoggedIn: lastLoginMs(user) <= 0 },
    enabled('inactive_user'), 'inactiveOpen', 'inactiveEpisode',
  );

  return { state, notifications };
}

function planScan(users, states, settings, now) {
  return (users || []).map((user) => {
    const prev = states && user?.uid ? states[user.uid] : undefined;
    return { uid: user?.uid, ...planUser(user, prev, settings, now, 'scan') };
  });
}

function listNotificationTypes() {
  return Object.values(NOTIFICATION_TYPES);
}

// Sample feed for the admin UI preview (no Firestore writes). Times are
// offsets from `now` so relative labels stay honest.
function demoFeed(now = Date.now()) {
  const H = 60 * 60 * 1000;
  const rows = [
    ['churn_risk', 'דנה כהן', 'dana@example.com', false, 2 * H, 9],
    ['signup', 'יונתן לוי', 'yonatan@example.com', false, 5 * H, 0],
    ['premium_upgrade', 'מאיה ברק', 'maya@example.com', false, 26 * H, 0],
    ['inactive_user', 'עומר חדד', 'omer@example.com', false, 3 * DAY_MS, 32],
    ['premium_cancel', 'נועה אביב', 'noa@example.com', true, 4 * DAY_MS, 0],
    ['churn_risk', 'עידו מזרחי', 'ido@example.com', false, 6 * DAY_MS, 12],
    ['signup', 'שירה גולן', 'shira@example.com', true, 8 * DAY_MS, 0],
    ['inactive_user', 'רועי פרץ', 'roee@example.com', true, 12 * DAY_MS, 21],
    ['premium_upgrade', 'הילה דהן', 'hila@example.com', true, 15 * DAY_MS, 0],
    ['churn_risk', 'אורי ביטון', 'ori@example.com', false, 30 * H, 8],
    ['signup', 'תמר אלון', 'tamar@example.com', true, 18 * DAY_MS, 0],
    ['inactive_user', 'גיא סעד', 'guy@example.com', false, 20 * DAY_MS, 45],
    ['premium_cancel', 'ליאורה נחום', 'lia@example.com', true, 22 * DAY_MS, 0],
    ['premium_upgrade', 'איתי מור', 'itai@example.com', false, 9 * H, 0],
    ['churn_risk', 'רונית אוחיון', 'ronit@example.com', true, 25 * DAY_MS, 11],
    ['inactive_user', 'אלון כץ', 'alon@example.com', false, 28 * DAY_MS, 16],
  ];
  return rows.map((row, i) => {
    const [type, userName, userEmail, read, ago, days] = row;
    const built = buildNotification(type, {
      uid: `demo${i}`,
      displayName: userName,
      email: userEmail,
    }, { episode: 1, days, neverLoggedIn: type === 'inactive_user' && days >= 40 });
    return { ...built, id: `demo_${i}`, read, createdAt: now - ago };
  });
}

export {
  DAY_MS,
  SIGNUP_LOOKBACK_DAYS,
  NOTIFICATION_TYPES,
  DEFAULT_SETTINGS,
  toMs,
  normalizeSettings,
  isTypeEnabled,
  isPremiumActive,
  wasEngaged,
  tradeActivityMs,
  detectActivity,
  planUser,
  planScan,
  listNotificationTypes,
  demoFeed,
  blankState,
};
