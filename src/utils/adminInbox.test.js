import { describe, expect, it } from 'vitest';
import {
  filterInbox, inboxDocToItem, mergeInbox, noticeToInboxItem, unreadByKind, unreadInboxCount,
} from './adminInbox';

const feedback = {
  id: 'm1',
  kind: 'feedback',
  type: 'feedback',
  title: 'משוב מ-דנה',
  body: 'הגרף נתקע אחרי רענון של העמוד',
  userId: 'dana',
  userName: 'דנה',
  userEmail: 'dana@example.com',
  read: false,
  archived: false,
  createdAt: '2026-10-30T09:00:00Z',
};

const churn = {
  id: 'm2',
  kind: 'system',
  type: 'churn',
  title: 'לקוח בסיכון נטישה',
  body: 'רון לא נכנס 12 ימים',
  userId: 'ron',
  userName: 'רון',
  read: true,
  archived: false,
  createdAt: '2026-10-29T09:00:00Z',
};

describe('admin inbox view model', () => {
  it('merges mailbox rows with signup and premium notices, newest first', () => {
    const items = mergeInbox([feedback, churn], [
      {
        id: 's1',
        type: 'signup',
        title: 'משתמש חדש',
        body: 'מיכל נרשמה',
        userId: 'michal',
        userName: 'מיכל',
        read: false,
        createdAt: '2026-10-30T12:00:00Z',
      },
      {
        id: 'c1',
        type: 'churn_risk',
        title: 'לא בתיבה',
        body: 'התראת הנטישה של הפונקציה נשארת בלשונית ההתראות',
        userName: 'רון',
        read: false,
        createdAt: '2026-10-30T13:00:00Z',
      },
      {
        id: 'p1',
        type: 'premium_upgrade',
        title: 'שדרוג',
        body: 'רון שדרג',
        userName: 'רון',
        read: false,
        createdAt: '2026-10-28T09:00:00Z',
      },
    ]);
    expect(items.map((item) => item.id)).toEqual(['notif:s1', 'inbox:m1', 'inbox:m2', 'notif:p1']);
    expect(items.find((item) => item.id === 'notif:s1')).toMatchObject({ kind: 'system', type: 'signup', read: false });
    expect(items.find((item) => item.id === 'notif:p1').type).toBe('payment');
    expect(noticeToInboxItem({ id: 'x', type: 'inactive_user', body: 'שקט' })).toBeNull();
  });

  it('filters by tab and archive, and counts only open unread', () => {
    const archived = inboxDocToItem({ ...feedback, id: 'old', archived: true, read: false, createdAt: '2026-10-01T00:00:00Z' });
    const items = mergeInbox([feedback, churn], []).concat(archived);
    expect(filterInbox(items, { kind: 'feedback', archived: false }).map((i) => i.id)).toEqual(['inbox:m1']);
    expect(filterInbox(items, { kind: 'feedback', archived: true }).map((i) => i.id)).toEqual(['inbox:old']);
    expect(filterInbox(items, { kind: 'system', archived: false }).map((i) => i.id)).toEqual(['inbox:m2']);
    expect(unreadInboxCount(items)).toBe(1);
    expect(unreadByKind(items, 'feedback')).toBe(1);
    expect(unreadByKind(items, 'system')).toBe(0);
  });
});
