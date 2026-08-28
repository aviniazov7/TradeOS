import { AlertTriangle } from 'lucide-react';
import EmptyState from './EmptyState';

// Shown when the trades listener failed before any data arrived.
//
// The alternative was a permanent skeleton — the error path could not clear
// `loading` at all, so the app spun forever and re-subscribed every five
// seconds. But simply clearing the flag would have been worse: an empty list
// with no explanation renders the ordinary "no trades yet" state, which tells
// the user their journal is empty when in fact it could not be read. A wrong
// answer about someone's own records beats a spinner only if it is honest.
//
// The permission-denied wording is specific on purpose: in this project CI
// cannot deploy Firestore rules (it lacks serviceUsageViewer and 403s), so a
// rules change that was never pushed by hand produces exactly this, and the
// message names the command that fixes it.
export default function TradesLoadError({ code }) {
  const denied = code === 'permission-denied';
  return (
    <EmptyState
      icon={AlertTriangle}
      title="לא הצלחנו לטעון את העסקאות"
      description={denied
        ? 'אין הרשאת קריאה. אם חוקי ה-Firestore עודכנו לאחרונה, יש לפרוס אותם: firebase deploy --only firestore:rules'
        : 'החיבור למסד הנתונים נכשל. אנחנו מנסים שוב ברקע — אפשר גם לרענן.'}
      actionLabel="רענון"
      onAction={() => window.location.reload()}
    />
  );
}
