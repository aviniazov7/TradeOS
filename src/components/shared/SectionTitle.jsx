// Section heading inside a page: title on one side, optional aside (a count,
// a link) on the other. Same size everywhere.
export default function SectionTitle({ children, aside, icon: Icon, className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-3 mb-3 ${className}`}>
      <h2 className="text-sm font-semibold text-text-primary inline-flex items-center gap-1.5">
        {Icon && <Icon className="w-4 h-4 text-accent-primary" />}
        {children}
      </h2>
      {aside}
    </div>
  );
}
