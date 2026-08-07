// Reusable button system — uniform heights, one look everywhere.
//   primary → gradient (the main call-to-action), soft → accent tint,
//   ghost → outline, danger → destructive. Pass `icon` for a leading icon.
const VARIANTS = {
  primary: 'text-[#03121f] bg-[linear-gradient(135deg,#38bdf8,#2563eb)] shadow-[0_8px_24px_-10px_rgba(56,189,248,0.9)] hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-8px_rgba(56,189,248,1)]',
  soft:    'text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20',
  ghost:   'text-text-primary shadow-[inset_0_0_0_1px_var(--color-border-primary)] hover:text-accent-primary hover:shadow-[inset_0_0_0_1px_rgba(56,189,248,0.5)]',
  danger:  'text-loss bg-loss/10 hover:bg-loss/20',
};
const SIZES = {
  sm: 'h-9 px-4 text-xs gap-1.5',
  md: 'h-11 px-5 text-[13.5px] gap-2',
};

export default function Button({ variant = 'primary', size = 'md', icon: Icon, children, className = '', ...rest }) {
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl font-bold transition-all cursor-pointer ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {Icon && <Icon className={iconSize} />}
      {children}
    </button>
  );
}
