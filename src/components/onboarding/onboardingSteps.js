import { Rocket, BookOpen, Sparkles, Brain } from 'lucide-react';

// Four short slides, one brand colour. Each one says what the user gets, in
// three concrete lines — the last slide hands off to a real first action.
export const ONBOARDING_STEPS = [
  {
    icon: Rocket,
    title: 'ברוכים הבאים ל-TradeOS',
    description: 'כל המסחר שלך במקום אחד: מתעדים, מודדים ומשתפרים — עסקה אחרי עסקה.',
    highlights: [
      'חיבור לבורסה ומשיכת עסקאות אוטומטית',
      'יומן מסחר מלא עם ניתוחים מקצועיים',
      'סוכן AI שמכיר כל עסקה שלך',
    ],
  },
  {
    icon: BookOpen,
    title: 'יומן מסחר מדויק',
    description: 'כל עסקה עם כניסה, יציאות חלקיות, סטופ ואסטרטגיה. החישובים נעשים לבד.',
    highlights: [
      'רווח/הפסד, R:R וממוצע משוקלל אוטומטית',
      'לוח חודשי, סטטיסטיקות ופילוח לפי מטבע וסשן',
      'כרטיס שיתוף מעוצב לכל עסקה',
    ],
  },
  {
    icon: Sparkles,
    title: 'סוכן AI ואנליסט אישי',
    description: 'שאל בעברית על המסחר שלך וקבל תשובה מבוססת על הנתונים שלך — לא תשובה כללית.',
    highlights: [
      'איפה אתה מפסיד ומה כן עובד לך',
      'ניתוח גרף מקצועי מצילום מסך',
      'מפקח סיכון שבודק אותך מול התוכנית',
    ],
  },
  {
    icon: Brain,
    title: 'משמעת ומנטליות',
    description: 'התוכנית והראש הם חצי מהמסחר. TradeOS מודד גם אותם.',
    highlights: [
      'יומן בוקר וערב קצר לכל יום מסחר',
      'תוכנית מסחר עם מגבלות סיכון',
      'כמה עולה לך כל סטייה מהתוכנית, בדולרים',
    ],
  },
];
