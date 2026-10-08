import { useMemo, useRef, useState } from 'react';
import {
  areaRects, layoutDividers, gridTemplateAreas, gridTemplate, trackOffset, resizeTracks, minFraction, defaultSizes,
} from '../../utils/terminalLayout';

// A split-screen grid with draggable dividers, driven by a terminalLayout
// definition (named grid areas + track fractions).
//   sizes      { cols, rows } fractions (controlled)
//   onChange   (next sizes) — called when a drag ends / a key moves a divider /
//              a divider is double-clicked (reset). The live drag stays local so
//              the parent (and localStorage) only see the final value.
//   maximized  pane index shown alone, the others hidden (not unmounted, so
//              their iframes keep their state) — or null
//   renderPane (index) → the pane's content
// Dividers: pointer drag (with a transparent shield over the panes so the
// iframes don't swallow the pointer), arrow keys (Shift = bigger step),
// Home/End, Enter or double-click resets the axis. The grid is laid out LTR.

const KEY_STEP = 0.02;
const KEY_STEP_BIG = 0.1;

export default function ResizableGrid({ layout, sizes, onChange, maximized = null, renderPane, gap = 6, minPanePx = 160, className = '' }) {
  const ref = useRef(null);
  const dragRef = useRef(null);
  const frameRef = useRef(0);
  const [live, setLive] = useState(null); // { axis, index, cols?, rows? } while dragging

  const rects = useMemo(() => areaRects(layout), [layout]);
  const dividers = useMemo(() => layoutDividers(layout), [layout]);

  const cur = live ? { cols: live.cols || sizes.cols, rows: live.rows || sizes.rows } : sizes;
  const nCols = cur.cols.length;
  const nRows = cur.rows.length;
  const isMax = maximized != null && maximized < rects.length;

  const measure = (axis) => {
    const rect = ref.current?.getBoundingClientRect();
    const n = axis === 'x' ? nCols : nRows;
    const total = rect ? (axis === 'x' ? rect.width : rect.height) - (n - 1) * gap : 0;
    return { total, min: minFraction(minPanePx, total, n) };
  };
  const tracksKey = (axis) => (axis === 'x' ? 'cols' : 'rows');

  const onPointerDown = (e, d) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const { total, min } = measure(d.axis);
    if (!(total > 0)) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
    dragRef.current = {
      axis: d.axis, index: d.index, total, min,
      start: d.axis === 'x' ? e.clientX : e.clientY,
      startSizes: sizes[tracksKey(d.axis)],
      next: null,
    };
    setLive({ axis: d.axis, index: d.index });
  };

  const onPointerMove = (e) => {
    const s = dragRef.current;
    if (!s) return;
    const pos = s.axis === 'x' ? e.clientX : e.clientY;
    s.next = resizeTracks(s.startSizes, s.index, (pos - s.start) / s.total, s.min);
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const d = dragRef.current;
      if (d?.next) setLive({ axis: d.axis, index: d.index, [tracksKey(d.axis)]: d.next });
    });
  };

  const endDrag = () => {
    const s = dragRef.current;
    if (!s) return;
    dragRef.current = null;
    if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = 0; }
    setLive(null);
    if (s.next) onChange?.({ ...sizes, [tracksKey(s.axis)]: s.next });
  };

  const reset = (axis) => {
    const k = tracksKey(axis);
    onChange?.({ ...sizes, [k]: defaultSizes(layout)[k] });
  };

  const onKeyDown = (e, d) => {
    const k = tracksKey(d.axis);
    const back = d.axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const fwd = d.axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    const { min } = measure(d.axis);
    let delta = null;
    if (e.key === back) delta = -(e.shiftKey ? KEY_STEP_BIG : KEY_STEP);
    else if (e.key === fwd) delta = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    else if (e.key === 'Home') delta = -1;
    else if (e.key === 'End') delta = 1;
    else if (e.key === 'Enter') { e.preventDefault(); reset(d.axis); return; }
    if (delta == null) return;
    e.preventDefault();
    const next = resizeTracks(sizes[k], d.index, delta, min);
    if (next !== sizes[k]) onChange?.({ ...sizes, [k]: next });
  };

  // Where a boundary sits, as CSS: the fraction of the track space (container
  // minus the gaps) plus the gaps before it, centred in its gap.
  const along = (tracks, n, i) => `calc(${trackOffset(tracks, i).toFixed(5)} * (100% - ${(n - 1) * gap}px) + ${i * gap + gap / 2}px)`;
  const spanStart = (tracks, n, start) => (start === 0 ? '0px' : `calc(${trackOffset(tracks, start - 1).toFixed(5)} * (100% - ${(n - 1) * gap}px) + ${start * gap}px)`);
  const spanEnd = (tracks, n, end) => (end === n ? '0px' : `calc(${(1 - trackOffset(tracks, end - 1)).toFixed(5)} * (100% - ${(n - 1) * gap}px) + ${(n - end) * gap}px)`);

  const gridStyle = isMax
    ? { gridTemplateColumns: '1fr', gridTemplateRows: '1fr', gap }
    : {
      gridTemplateAreas: gridTemplateAreas(layout),
      gridTemplateColumns: gridTemplate(cur.cols),
      gridTemplateRows: gridTemplate(cur.rows),
      gap,
    };

  return (
    <div ref={ref} dir="ltr" className={`relative grid min-h-0 min-w-0 ${className}`} style={gridStyle}>
      {rects.map((r) => {
        const hidden = isMax && maximized !== r.index;
        return (
          <div
            key={r.index}
            className="relative min-w-0 min-h-0"
            style={{ gridArea: isMax ? '1 / 1 / 2 / 2' : r.area, display: hidden ? 'none' : undefined }}
          >
            {renderPane(r.index)}
          </div>
        );
      })}

      {/* Shield over the iframes while dragging (they'd eat pointermove). */}
      {live && (
        <div aria-hidden className="absolute inset-0 z-20" style={{ cursor: live.axis === 'x' ? 'col-resize' : 'row-resize' }} />
      )}

      {!isMax && dividers.map((d) => {
        const x = d.axis === 'x';
        const tracks = x ? cur.cols : cur.rows;
        const n = x ? nCols : nRows;
        const cross = x ? cur.rows : cur.cols;
        const nCross = x ? nRows : nCols;
        const active = live && live.axis === d.axis && live.index === d.index;
        const pos = along(tracks, n, d.index);
        const style = x
          ? { left: pos, top: spanStart(cross, nCross, d.start), bottom: spanEnd(cross, nCross, d.end), width: 12, transform: 'translateX(-50%)', cursor: 'col-resize' }
          : { top: pos, left: spanStart(cross, nCross, d.start), right: spanEnd(cross, nCross, d.end), height: 12, transform: 'translateY(-50%)', cursor: 'row-resize' };
        return (
          <div
            key={`${d.axis}${d.index}-${d.start}`}
            role="separator"
            tabIndex={0}
            aria-orientation={x ? 'vertical' : 'horizontal'}
            aria-label={x ? 'שינוי רוחב הגרפים' : 'שינוי גובה הגרפים'}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(trackOffset(tracks, d.index) * 100)}
            title="גרירה לשינוי גודל · לחיצה כפולה לאיפוס"
            onPointerDown={(e) => onPointerDown(e, d)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onDoubleClick={() => reset(d.axis)}
            onKeyDown={(e) => onKeyDown(e, d)}
            className="group absolute z-30 touch-none select-none outline-none"
            style={style}
          >
            <span
              aria-hidden
              className={`absolute rounded-full transition-colors ${
                active ? 'bg-accent-primary' : 'bg-transparent group-hover:bg-accent-primary/60 group-focus-visible:bg-accent-primary'
              } ${x ? 'inset-y-0 left-1/2 w-[2px] -translate-x-1/2' : 'inset-x-0 top-1/2 h-[2px] -translate-y-1/2'}`}
            />
          </div>
        );
      })}
    </div>
  );
}
