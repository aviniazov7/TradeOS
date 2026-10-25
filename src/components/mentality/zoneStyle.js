// Shared look of the mental-zone landing tiles (kept apart from the
// components so fast refresh keeps working).

// Accent colours per tile, mid-tones that read on both the dark and the light
// theme (icons, bars and washes only — text stays on the text tokens).
export const ZONE_COLORS = {
  morning: '#f59e0b',
  evening: '#6366f1',
  mood: '#14b8a6',
  stats: 'var(--color-accent-primary)',
  journey: 'var(--color-chart-purple)',
  breathing: '#007ba7',
};

export const tint = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

// Shared look of every interactive tile: lift of the border on hover, a slight
// press, and a visible keyboard focus ring (an outline: the global card
// box-shadow rule in index.css would override a ring).
export const tileInteractive =
  'group transition-[border-color,transform] duration-200 hover:border-border-hover active:scale-[0.99] cursor-pointer focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';

export const tileItem = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};
