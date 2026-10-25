import { useState } from 'react';
import { stockLogoUrls, stockSymbol } from '../../utils/stocks';

// A company logo by ticker on a white rounded tile (most logos are drawn for a
// light background). Falls through the logo sources on error and ends on a
// letter badge, so a row never shows a broken image.
export default function StockLogo({ symbol, className = 'w-6 h-6', rounded = 'rounded-md' }) {
  const s = stockSymbol(symbol);
  const urls = stockLogoUrls(s);
  const [state, setState] = useState({ symbol: s, idx: 0 });
  // Reset the fallback position when the ticker changes (derived, no effect).
  const idx = state.symbol === s ? state.idx : 0;
  const url = urls[idx];

  if (!url) {
    return (
      <span className={`${className} ${rounded} shrink-0 grid place-items-center bg-gradient-to-br from-emerald-500/25 to-[#1496c4]/25 border border-emerald-400/25 text-[10px] font-extrabold text-emerald-300`}
        aria-hidden="true">
        {s.slice(0, 2) || '?'}
      </span>
    );
  }
  return (
    <span className={`${className} ${rounded} shrink-0 overflow-hidden bg-white grid place-items-center`} aria-hidden="true">
      <img
        src={url}
        alt=""
        loading="lazy"
        className="w-[86%] h-[86%] object-contain"
        onError={() => setState({ symbol: s, idx: idx + 1 })}
      />
    </span>
  );
}
