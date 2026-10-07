import { useLayoutEffect, useRef } from 'react';

// One line of text — usually a money amount — that always stays inside its
// box: when it's wider than the space it has (a long number on a phone), the
// font shrinks step by step until it fits, never below `min` px. It never
// cuts the number with "…" and never spills out of the card.
//
// Takes the full width of its container (block), so the container decides the
// space; pass text alignment / direction as usual.
export default function FitText({ as = 'span', className = '', style, min = 10, children, ...rest }) {
  const Tag = as;
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      el.style.fontSize = '';                 // back to the size the CSS gives
      let size = parseFloat(getComputedStyle(el).fontSize) || 16;
      let guard = 40;
      while (el.scrollWidth > el.clientWidth + 0.5 && size > min && guard-- > 0) {
        size = Math.max(min, size - 1);
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    // Refit when the box resizes and when the text inside changes (animated
    // counters update their digits without a new render of this component).
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const mo = new MutationObserver(fit);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [children, min]);

  return (
    <Tag ref={ref} className={`block min-w-0 max-w-full whitespace-nowrap overflow-hidden ${className}`} style={style} {...rest}>
      {children}
    </Tag>
  );
}
