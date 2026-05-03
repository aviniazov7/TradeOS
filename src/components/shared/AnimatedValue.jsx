import { useEffect, useRef } from 'react';
import { animate } from 'framer-motion';

export default function AnimatedValue({ value, className }) {
  const ref = useRef(null);
  const prevNum = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !value) return;

    const str = String(value);

    // Find the numeric part (supports +$1,234.56, -45.2%, 3.5 etc.)
    const match = str.match(/([-+]?)([^0-9]*?)([\d,]+\.?\d*)(.*)/);
    if (!match) {
      node.textContent = str;
      return;
    }

    const [, sign, prefix, numStr, suffix] = match;
    const target = parseFloat(numStr.replace(/,/g, ''));
    if (isNaN(target)) {
      node.textContent = str;
      return;
    }

    const hasDecimals = numStr.includes('.');
    const decimals = hasDecimals ? numStr.split('.')[1].length : 0;
    const useLocale = numStr.includes(',');

    // Skip animation if same value
    if (prevNum.current === target) return;
    const from = prevNum.current ?? 0;
    prevNum.current = target;

    const controls = animate(from, target, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate(v) {
        let formatted;
        if (useLocale) {
          formatted = v.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          });
        } else {
          formatted = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString();
        }
        node.textContent = sign + prefix + formatted + suffix;
      },
    });

    return () => controls.stop();
  }, [value]);

  return <span ref={ref} className={className}>{value}</span>;
}
