// The one password policy, used by signup (live checklist + submit) and the
// profile's change-password form. Keep it in sync with the Firebase Console
// password policy (Authentication → Settings): min 8, uppercase, number.

export const PASSWORD_RULES = [
  { id: 'len', label: '8 תווים לפחות', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'אות גדולה באנגלית', test: (p) => /[A-Z]/.test(p) },
  { id: 'digit', label: 'ספרה', test: (p) => /[0-9]/.test(p) },
];

/** Hebrew reason the password is rejected, or null when it passes. */
export function passwordProblem(password) {
  const p = String(password || '');
  if (!PASSWORD_RULES[0].test(p)) return 'הסיסמה חייבת להכיל לפחות 8 תווים';
  if (!PASSWORD_RULES[1].test(p) || !PASSWORD_RULES[2].test(p)) return 'הסיסמה חייבת להכיל אות גדולה באנגלית וספרה';
  return null;
}
