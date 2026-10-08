import {
  Sparkles, HeartHandshake, Flame, Leaf, Smile, Meh, Hourglass, BatteryLow, Activity, Frown,
} from 'lucide-react';
import { MENTALITY_EMOTIONS } from '../../../utils/constants';

// Shared look of the morning / evening journal pages (kept apart from the
// components so fast refresh keeps working).

// Stored emotion values are keys ('calm', 'tired'…); the old grid showed big
// emoji tiles. Chips now carry a small line icon + the Hebrew label instead.
const EMOTION_ICONS = {
  inspired: Sparkles,
  grateful: HeartHandshake,
  excited: Flame,
  calm: Leaf,
  happy: Smile,
  apathy: Meh,
  bored: Hourglass,
  tired: BatteryLow,
  anxious: Activity,
  frustrated: Frown,
};

export const EMOTION_OPTIONS = MENTALITY_EMOTIONS.map((e) => ({
  value: e.key,
  label: e.label,
  icon: EMOTION_ICONS[e.key],
}));

export const emotionLabel = (key) => MENTALITY_EMOTIONS.find((e) => e.key === key)?.label || '';

export const inputCls =
  'w-full bg-bg-tertiary border border-border-primary rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted ' +
  'focus:outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 transition-colors';

// Visible keyboard focus for the custom controls (outline: the global card
// box-shadow rule would override a ring on bg-* surfaces).
export const focusCls =
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';
