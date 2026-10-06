/**
 * Card — the single canonical surface primitive.
 *
 * Every panel/card in the app should use this so the glass fill, border, radius
 * and hover behaviour stay identical everywhere (previously the dashboard mixed
 * three different card systems with different padding/shadow/hover-lift).
 *
 *  - `as`        : the element/component to render (e.g. 'div', 'button', motion.div)
 *  - `hover`     : adds the standard accent border-highlight on hover
 *  - `glow`      : hover-only border beam (21st.dev-style light around the edge)
 *  - `spotlight` : a soft light that follows the cursor (21st.dev "spotlight
 *                  card"); pointer devices only, nothing on touch screens
 *  - padding/layout is passed through `className` (one base look, flexible spacing)
 *
 * The frosted-glass shadow comes from the global `[class*="bg-bg-secondary"]`
 * rule in index.css, so it's theme-aware automatically.
 */
const trackSpotlight = (e) => {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--spot-x', `${e.clientX - r.left}px`);
  el.style.setProperty('--spot-y', `${e.clientY - r.top}px`);
};

export default function Card({ as = 'div', hover = false, glow = false, spotlight = false, className = '', children, onMouseMove, ...rest }) {
  const Tag = as;
  const base = 'bg-bg-secondary border border-border-primary rounded-xl';
  const hoverCls = hover ? 'transition-colors hover:border-accent-primary/30 cursor-pointer' : '';
  const glowCls = glow ? 'relative border-beam-hover' : '';
  const spotCls = spotlight ? 'spotlight-card' : '';
  const handleMove = spotlight
    ? (e) => { trackSpotlight(e); onMouseMove?.(e); }
    : onMouseMove;
  return (
    <Tag className={`${base} ${hoverCls} ${glowCls} ${spotCls} ${className}`} onMouseMove={handleMove} {...rest}>
      {children}
    </Tag>
  );
}
