import Card from './Card';
import TabStrip from './TabStrip';

// The one page header: icon medallion, title, subtitle, actions, and an
// optional slot (usually a row of StatTiles) beside it on wide screens and
// below it on phones. Every top-level page uses this so titles stop coming in
// five different sizes.
//   meta  — a control right under the title (e.g. the journal switcher)
//   tabs  — { tabs, value, onChange, layoutKey }: the page's views; beside the
//           actions on wide screens, their own row at the bottom on phones
export default function PageHeader({ icon: Icon, title, subtitle, meta, tabs, actions, children, className = '' }) {
  const tabStrip = (variant) => tabs && (
    <TabStrip tabs={tabs.tabs} value={tabs.value} onChange={tabs.onChange} variant={variant} layoutKey={tabs.layoutKey || 'page-tab'} />
  );
  return (
    // No overflow clipping on the card itself, and a z-index above the page
    // below it: menus that open from the header (journal switcher, period)
    // must hang over the content, not get cut at the header's bottom edge.
    // Only the decorative glow is clipped to the rounded corners.
    <Card className={`relative z-20 p-4 md:p-6 mb-4 md:mb-6 ${className}`}>
      <div aria-hidden className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(80% 140% at 100% 0%, rgba(37,99,235,0.14) 0%, transparent 60%)' }} />
      </div>
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
            {meta && <div className="mt-2">{meta}</div>}
          </div>
          {(actions || tabs) && (
            <div className="flex items-center gap-2 shrink-0 basis-full sm:basis-auto">
              {tabs && <div className="hidden md:block rounded-xl bg-bg-tertiary border border-border-primary p-1">{tabStrip('desktop')}</div>}
              {actions}
            </div>
          )}
        </div>
        {children && <div className="min-w-0 lg:max-w-[60%]">{children}</div>}
      </div>
      {tabs && <div className="relative md:hidden mt-3 rounded-xl bg-bg-tertiary border border-border-primary p-1">{tabStrip('mobile')}</div>}
    </Card>
  );
}
