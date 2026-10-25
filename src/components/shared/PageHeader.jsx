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
//   compactMobile — journal phone header: one title row (icon, title, aside,
//           icon actions) and a wrapping segmented tab control under it (every
//           tab on screen, no horizontal scroll). From md up the header matches
//           the other pages.
export default function PageHeader({ icon: Icon, title, titleAside, subtitle, meta, tabs, tabsLead, actions, children, className = '', as = 'h1', mobileTabsFirst = false, compactMobile = false }) {
  const Title = as === 'h2' ? 'h2' : 'h1';
  const tabStrip = (variant) => tabs && (
    <TabStrip tabs={tabs.tabs} value={tabs.value} onChange={tabs.onChange} variant={variant} layoutKey={tabs.layoutKey || 'page-tab'} />
  );
  const mobileTabRow = tabs && (compactMobile ? (
    <div data-testid="mobile-tabs" dir="rtl" className="md:hidden mt-2 w-full min-w-0 overflow-x-hidden rounded-xl bg-bg-tertiary border border-border-primary p-1">
      {tabStrip('wrap')}
    </div>
  ) : (
    <div data-tab-scroller dir="rtl" className={`md:hidden w-full min-w-0 overflow-x-auto no-scrollbar rounded-xl bg-bg-tertiary border border-border-primary p-1 ${mobileTabsFirst ? '' : 'relative mt-3'}`}>
      {tabStrip('mobile')}
    </div>
  ));
  return (
    // No overflow clipping on the card itself, and a z-index above the page
    // below it: menus that open from the header (journal switcher, period)
    // must hang over the content, not get cut at the header's bottom edge.
    // Only the decorative glow is clipped to the rounded corners.
    <Card className={`relative z-20 ${compactMobile ? 'p-3 mb-3 md:p-6 md:mb-6' : 'p-4 md:p-6 mb-4 md:mb-6'} ${className}`}>
      <div aria-hidden className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(80% 140% at 100% 0%, rgba(0,123,167,0.14) 0%, transparent 60%)' }} />
      </div>
      <div className={`relative flex flex-col lg:flex-row lg:items-center ${compactMobile ? 'gap-2 md:gap-4 lg:gap-6' : 'gap-4 lg:gap-6'}`}>
        {mobileTabsFirst && mobileTabRow}
        {/* Phones: actions wrap onto their own row under the title instead of
            squeezing it (basis-full); from sm up they sit beside it.
            compactMobile keeps them on the title row as icon buttons. */}
        <div className={`flex flex-1 min-w-0 ${compactMobile ? 'flex-nowrap items-center gap-2' : `flex-wrap ${subtitle || meta ? 'items-start' : 'items-center'} gap-3`}`}>
          {Icon && (
            <span className={`${compactMobile ? 'w-8 h-8 md:w-11 md:h-11' : 'w-10 h-10 md:w-11 md:h-11'} rounded-xl bg-accent-primary/12 border border-accent-primary/20 grid place-items-center shrink-0`}>
              <Icon className={`${compactMobile ? 'w-4 h-4 md:w-5 md:h-5' : 'w-5 h-5'} text-accent-primary`} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {titleAside ? (
              <div className={`flex items-center min-w-0 ${compactMobile ? 'flex-nowrap gap-2' : 'flex-wrap gap-x-3 gap-y-2'}`}>
                <Title className={`${compactMobile ? 'text-lg md:text-2xl shrink-0' : 'text-xl md:text-2xl'} font-bold text-text-primary leading-tight`}>{title}</Title>
                <div className="min-w-0 flex-1 md:flex-none">{titleAside}</div>
              </div>
            ) : (
              <Title className={`${compactMobile ? 'text-lg md:text-2xl' : 'text-xl md:text-2xl'} font-bold text-text-primary leading-tight`}>{title}</Title>
            )}
            {subtitle && <p className="text-sm text-text-muted mt-1">{subtitle}</p>}
            {meta && <div className="mt-2">{meta}</div>}
          </div>
          {(actions || tabs || tabsLead) && (
            <div className={`flex items-center shrink-0 ${compactMobile ? 'gap-1.5 md:gap-2' : 'flex-wrap gap-2 basis-full sm:basis-auto'}`}>
              {compactMobile ? <div className="hidden md:contents">{tabsLead}</div> : tabsLead}
              {tabs && <div className="hidden md:block rounded-xl bg-bg-tertiary border border-border-primary p-1">{tabStrip('desktop')}</div>}
              {actions}
            </div>
          )}
        </div>
        {compactMobile && tabsLead && <div className="md:hidden">{tabsLead}</div>}
        {children && <div className="min-w-0 lg:max-w-[60%]">{children}</div>}
      </div>
      {!mobileTabsFirst && mobileTabRow}
    </Card>
  );
}
