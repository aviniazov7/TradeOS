/**
 * Card — the single canonical surface primitive.
 *
 * Every panel/card in the app should use this so the glass fill, border, radius
 * and hover behaviour stay identical everywhere (previously the dashboard mixed
 * three different card systems with different padding/shadow/hover-lift).
 *
 *  - `as`     : the element/component to render (e.g. 'div', 'button', motion.div)
 *  - `hover`  : adds the standard accent border-highlight on hover
 *  - padding/layout is passed through `className` (one base look, flexible spacing)
 *
 * The frosted-glass shadow comes from the global `[class*="bg-bg-secondary"]`
 * rule in index.css, so it's theme-aware automatically.
 */
export default function Card({ as = 'div', hover = false, glow = false, className = '', children, ...rest }) {
  const Tag = as;
  const base = 'bg-bg-secondary border border-border-primary rounded-xl';
  const hoverCls = hover ? 'transition-colors hover:border-accent-primary/30 cursor-pointer' : '';
  // `glow` adds the hover-only border beam (21st.dev-style light around the edge).
  const glowCls = glow ? 'relative border-beam-hover' : '';
  return (
    <Tag className={`${base} ${hoverCls} ${glowCls} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
