import Card from './Card';

// The one page header: icon medallion, title, subtitle, actions, and an
// optional slot (usually a row of StatTiles) beside it on wide screens and
// below it on phones. Every top-level page uses this so titles stop coming in
// five different sizes.
export default function PageHeader({ icon: Icon, title, subtitle, actions, children, className = '' }) {
  return (
    <Card className={`relative overflow-hidden p-4 md:p-6 mb-4 md:mb-6 ${className}`}>
      <div aria-hidden className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(80% 140% at 100% 0%, rgba(37,99,235,0.14) 0%, transparent 60%)' }} />
      <div className="relative flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
        {/* Phones: actions wrap onto their own row under the title instead of
            squeezing it (basis-full); from sm up they sit beside it. */}
        <div className="flex flex-wrap items-start gap-3 flex-1 min-w-0">
          {Icon && (
            <span className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-accent-primary/12 border border-accent-primary/20 grid place-items-center shrink-0">
              <Icon className="w-5 h-5 text-accent-primary" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-text-primary leading-tight">{title}</h1>
            {subtitle && <p className="text-sm text-text-muted mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0 basis-full sm:basis-auto">{actions}</div>}
        </div>
        {children && <div className="min-w-0 lg:max-w-[60%]">{children}</div>}
      </div>
    </Card>
  );
}
