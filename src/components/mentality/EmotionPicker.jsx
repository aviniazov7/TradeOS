import { MENTALITY_EMOTIONS } from '../../utils/constants';

export default function EmotionPicker({ value, onChange, label }) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-text-primary mb-3">
          {label} <span className="text-red-400">*</span>
        </label>
      )}
      <div className="grid grid-cols-5 sm:grid-cols-5 gap-2">
        {MENTALITY_EMOTIONS.map((emotion) => (
          <button
            key={emotion.key}
            type="button"
            onClick={() => onChange(emotion.key)}
            className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border transition-all text-center ${
              value === emotion.key
                ? 'bg-accent-primary/15 border-accent-primary text-accent-primary'
                : 'bg-bg-tertiary border-border-primary text-text-secondary hover:border-border-hover'
            }`}
          >
            <span className="text-2xl">{emotion.emoji}</span>
            <span className="text-[10px] sm:text-xs leading-tight">{emotion.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
