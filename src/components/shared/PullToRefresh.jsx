import { useRef, useState, useCallback, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

const THRESHOLD = 80;
const MAX_PULL = 120;

// Walk up from the content wrapper to find the nearest vertically
// scrollable ancestor. In this app the scroll happens inside a div with
// `overflow-y: auto`, not on `window`, so checking window.scrollY would
// always be 0 and falsely report "at top" mid-page.
function getScrollParent(el) {
  let node = el?.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export default function PullToRefresh({ children }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const contentRef = useRef(null);
  const reloadTimerRef = useRef(null);

  const isAtTop = () => {
    const scroller = getScrollParent(contentRef.current);
    return scroller ? scroller.scrollTop <= 0 : window.scrollY <= 0;
  };

  const handleTouchStart = useCallback((e) => {
    // Don't refresh while modal/form is open
    if (!isAtTop() || refreshing || document.body.style.overflow === 'hidden') return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, [refreshing]);

  const handleTouchMove = useCallback((e) => {
    if (!pulling.current || refreshing) return;
    const diff = e.touches[0].clientY - startY.current;
    if (diff < 0) {
      pulling.current = false;
      setPullDistance(0);
      return;
    }
    // Suppress the native iOS rubber-band bounce so our own indicator
    // is visible instead of being masked by the container overscroll.
    if (e.cancelable) e.preventDefault();
    // Damped pull effect
    const distance = Math.min(diff * 0.4, MAX_PULL);
    setPullDistance(distance);
  }, [refreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullDistance >= THRESHOLD) {
      setRefreshing(true);
      setPullDistance(THRESHOLD * 0.5);
      // Short delay for visual feedback, then reload
      reloadTimerRef.current = setTimeout(() => window.location.reload(), 400);
    } else {
      setPullDistance(0);
    }
  }, [pullDistance]);

  useEffect(() => {
    // Only enable on touch devices
    const isTouchDevice = 'ontouchstart' in window;
    if (!isTouchDevice) return;

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    // Non-passive so handleTouchMove can preventDefault the iOS overscroll.
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Cancel a pending reload if we unmount within the 400ms window (route change).
  useEffect(() => () => { if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current); }, []);

  const progress = Math.min(pullDistance / THRESHOLD, 1);

  return (
    <>
      {/* Pull indicator */}
      <div
        className="fixed top-14 left-0 right-0 z-40 flex justify-center pointer-events-none transition-opacity duration-200 lg:hidden"
        style={{ opacity: pullDistance > 10 ? 1 : 0, transform: `translateY(${pullDistance * 0.3}px)` }}
      >
        <div className="bg-bg-secondary border border-border-primary rounded-full p-2 shadow-lg">
          <RefreshCw
            className={`w-5 h-5 text-accent-primary ${refreshing ? 'animate-spin' : ''}`}
            style={{ transform: refreshing ? undefined : `rotate(${progress * 360}deg)`, transition: 'transform 0.1s ease' }}
          />
        </div>
      </div>
      {/* Content with pull offset */}
      <div
        ref={contentRef}
        style={{ transform: pullDistance > 0 ? `translateY(${pullDistance * 0.3}px)` : undefined, transition: pulling.current ? 'none' : 'transform 0.3s ease' }}
      >
        {children}
      </div>
    </>
  );
}
