// Parse a `planExpires` value into epoch milliseconds (or null if absent /
// unparseable). It can arrive in several shapes depending on the source:
//   - a Firestore Timestamp object (has .toDate()) — e.g. coupon grant writes
//     timestampValue, and the Firestore JS SDK hydrates it as a Timestamp;
//   - a plain { seconds, nanoseconds } object;
//   - an ISO string (worker REST reads return strings);
//   - a Date or epoch-ms number.
// `new Date(<Timestamp>)` yields Invalid Date → NaN, which silently broke the
// Premium gate after a coupon redeem; this helper normalizes all shapes.
export function planExpiresMs(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  if (typeof v._seconds === 'number') return v._seconds * 1000; // serialized Timestamp
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}
