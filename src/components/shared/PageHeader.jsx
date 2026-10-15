import Card from './Card';
import TabStrip from './TabStrip';

// The one page header: icon medallion, title, subtitle, actions, and an
// optional slot (usually a row of StatTiles) beside it on wide screens and
// below it on phones. Every top-level page uses this so titles stop coming in
// five different sizes.
//   meta  — content right under the title (e.g. a progress line)
//   titleAside — a small control on the title's own line (e.g. the journal
//           switcher), so the header stays one row tall
//   tabsLead — a control that sits just before (to the right of, in RTL) the
//           tab box, e.g. the period picker: it appears without pushing the
//           tabs sideways when it shows up on one tab only
//   tabs  — { tabs, value, onChange, layoutKey }: the page's views; beside the
//           actions on wide screens, their own row at the bottom on phones
//   mobileTabsFirst — on phones, that row is the first thing in the card
//           (one RTL scroller, full labels). From md up the tabs stay beside
//           the actions, same as every other page.
export default function PageHeader({ icon: Icon, title, titleAside, subtitle, meta, tabs, tabsLead, actions, children, className = '', as = 'h1', mobileTabsFirst = false }) {
  const Title = as === 'h2' ? 'h2' : 'h1';
  const tabStrip = (variant) => tabs && (
    <TabStrip tabs={tabs.tabs} value={tabs.value} onChange={tabs.onChange} variant={variant} layoutKey={tabs.layoutKey || 'page-tab'} />
  );
  const mobileTabRow = tabs && (
    <div data-tab-scroller dir="rtl" className={`md:hidden w-full min-w-0 overflow-x-auto no-scrollbar rounded-xl bg-bg-tertiary border border-border-primary p-1 ${mobileTabsFirst ? '' : 'relative mt-3'}`}>
      {tabStrip('mobile')}
    </div>
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
        {mobileTabsFirst && mobileTabRow}
        {/* Phones: actions wrap onto their own row under the title instead of
            squeezing it (basis-full); from sm up they sit beside it. */}
        <div className={`flex flex-wrap ${subtitle || meta ? 'items-start' : 'items-center'} gap-3 flex-1 min-w-0`}>
          {Icon && (
            <span className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-accent-primary/12 border border-accent-primary/20 grid place-items-center shrink-0">
              <Icon className="w-5 h-5 text-accent-primary" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {titleAside ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Title className="text-xl md:text-2xl font-bold text-text-primary leading-tight">{title}</Title>
                <div className="min-w-0">{titleAside}</div>
              </div>
            ) : (
              <Title className="text-xl md:text-2xl font-bold text-text-primary leading-tight">{title}</Title>
            )}
            {subtitle && <p className="text-sm text-text-muted mt-1">{subtitle}</p>}
            {meta && <div className="mt-2">{meta}</div>}
          </div>
          {(actions || tabs || tabsLead) && (
            <div className="flex flex-wrap items-center gap-2 shrink-0 basis-full sm:basis-auto">
              {tabsLead}
              {tabs && <div className="hidden md:block rounded-xl bg-bg-tertiary border border-border-primary p-1">{tabStrip('desktop')}</div>}
              {actions}
            </div>
          )}
        </div>
        {children && <div className="min-w-0 lg:max-w-[60%]">{children}</div>}
      </div>
      {!mobileTabsFirst && mobileTabRow}
    </Card>
  );
}
