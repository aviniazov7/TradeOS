export default function ReadinessSlider({ value, onChange, label, lowLabel = 'נמוכה', highLabel = 'גבוהה' }) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-text-primary mb-3">
          {label}
        </label>
      )}
      <div className="bg-bg-tertiary border border-border-primary rounded-xl p-4">
        <div className="flex items-center justify-between text-xs text-text-muted mb-2">
          <span>{highLabel}</span>
          <span>{lowLabel}</span>
        </div>
        <input
          type="range"
          min="1"
          max="10"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 bg-bg-secondary rounded-lg appearance-none cursor-pointer accent-accent-primary"
        />
        <div className="flex items-center justify-center mt-2 gap-1">
          <span className="text-2xl font-bold text-accent-primary">{value}</span>
          <span className="text-sm text-text-muted">/10</span>
        </div>
      </div>
    </div>
  );
}
