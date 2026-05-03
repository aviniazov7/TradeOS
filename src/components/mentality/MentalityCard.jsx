import { motion } from 'framer-motion';

export default function MentalityCard({ icon: Icon, title, description, badge, badgeColor, disabled, status, onClick }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
      onClick={disabled ? undefined : onClick}
      className={`relative bg-bg-secondary border border-border-primary rounded-xl p-6 transition-all ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer hover:border-accent-primary/30 hover:bg-bg-secondary/80'
      }`}
    >
      {badge && (
        <span
          className={`absolute top-3 left-3 text-[10px] font-semibold px-2.5 py-1 rounded-full ${
            badgeColor || 'bg-text-muted/20 text-text-muted'
          }`}
        >
          {badge}
        </span>
      )}

      <div className="flex flex-col items-center text-center gap-3">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
          disabled ? 'bg-bg-tertiary' : 'bg-accent-primary/15'
        }`}>
          <Icon className={`w-7 h-7 ${disabled ? 'text-text-muted' : 'text-accent-primary'}`} />
        </div>

        <div>
          <h3 className="text-base font-semibold text-text-primary mb-1">{title}</h3>
          <p className="text-xs text-text-secondary leading-relaxed">{description}</p>
        </div>

        {status && (
          <span className={`text-[11px] font-medium px-3 py-1 rounded-full ${
            status === 'filled'
              ? 'bg-profit/15 text-profit'
              : 'bg-accent-primary/10 text-accent-primary'
          }`}>
            {status === 'filled' ? 'מולא היום' : 'טרם מולא'}
          </span>
        )}
      </div>
    </motion.div>
  );
}
