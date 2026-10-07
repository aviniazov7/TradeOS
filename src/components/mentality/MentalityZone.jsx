import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sunrise, Moon, Route, BarChart3, Brain } from 'lucide-react';
import PageHeader from '../shared/PageHeader';
import MentalityCard from './MentalityCard';
import MoodHeatmap from './MoodHeatmap';
import BreathingExercise from './BreathingExercise';
import { useMentalityJournals } from '../../hooks/useMentalityJournals';

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

// Emotion categorization for dynamic background tint
const POSITIVE_EMOTIONS = ['inspired', 'grateful', 'excited', 'calm', 'happy'];
const NEGATIVE_EMOTIONS = ['anxious', 'frustrated'];

function getMoodCategory(morning, evening) {
  const emotions = [evening?.emotionAfter, morning?.emotion].filter(Boolean); // evening mood is stored as `emotionAfter`
  if (emotions.length === 0) return 'none';
  const pos = emotions.filter((e) => POSITIVE_EMOTIONS.includes(e)).length;
  const neg = emotions.filter((e) => NEGATIVE_EMOTIONS.includes(e)).length;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

const MOOD_GRADIENTS = {
  positive: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(34, 197, 94, 0.08), transparent 70%)',
  neutral: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(59, 130, 246, 0.07), transparent 70%)',
  negative: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(239, 68, 68, 0.07), transparent 70%)',
  none: 'transparent',
};

const MOOD_LABELS = {
  positive: { emoji: '🌱', text: 'יום טוב', color: 'text-profit' },
  neutral: { emoji: '💧', text: 'יום ניטרלי', color: 'text-blue-400' },
  negative: { emoji: '🌧️', text: 'יום מאתגר', color: 'text-loss' },
  none: null,
};

export default function MentalityZone() {
  const navigate = useNavigate();
  const { todayMorning, todayEvening } = useMentalityJournals();
  const moodCategory = getMoodCategory(todayMorning, todayEvening);
  const moodLabel = MOOD_LABELS[moodCategory];

  const cards = [
    {
      icon: Sunrise,
      title: 'יומן בוקר',
      description: 'הכנה מנטלית לפני המסחר',
      badge: 'מומלץ 5:00-11:59',
      badgeColor: 'bg-accent-primary/15 text-accent-primary',
      status: todayMorning ? 'filled' : 'pending',
      onClick: () => navigate('/mentality/morning'),
    },
    {
      icon: Moon,
      title: 'יומן ערב',
      description: 'סיכום יום המסחר, מה עבד ומה פחות',
      badge: 'מומלץ 19:00-23:59',
      badgeColor: 'bg-accent-primary/15 text-accent-primary',
      status: todayEvening ? 'filled' : 'pending',
      onClick: () => navigate('/mentality/evening'),
    },
    {
      icon: Route,
      title: 'המסע הפסיכולוגי של הסוחר',
      description: 'המסלול הקלאסי שרוב הסוחרים עוברים',
      onClick: () => navigate('/mentality/journey'),
    },
    {
      icon: BarChart3,
      title: 'סטטיסטיקות מנטליות',
      description: 'קורלציה בין רגשות, מוכנות וביצועים',
      onClick: () => navigate('/mentality/stats'),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative"
    >
      {/* Dynamic background tint based on today's mood */}
      <motion.div
        key={moodCategory}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        className="absolute inset-0 -top-4 pointer-events-none -z-10"
        style={{ background: MOOD_GRADIENTS[moodCategory] }}
        aria-hidden="true"
      />

      <PageHeader
        icon={Brain}
        title="האזור המנטלי"
        subtitle="כלים לפיתוח חוסן מנטלי והתמודדות עם אתגרי המסחר"
        actions={moodLabel && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="flex items-center gap-2 bg-bg-tertiary border border-border-primary rounded-full px-3 py-1.5"
          >
            <span className="text-base">{moodLabel.emoji}</span>
            <span className={`text-xs font-semibold ${moodLabel.color}`}>{moodLabel.text}</span>
          </motion.div>
        )}
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {cards.map((card) => (
          <MentalityCard key={card.title} {...card} />
        ))}
        <MoodHeatmap />
        <BreathingExercise />
      </motion.div>
    </motion.div>
  );
}
