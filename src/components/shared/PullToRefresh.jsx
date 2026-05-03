import { useRef, useState, useCallback, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

const THRESHOLD = 80;
const MAX_PULL = 120;

export default function PullToRefresh({ children }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);

  const isAtTop = () => window.scrollY <= 0;

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
      setTimeout(() => window.location.reload(), 400);
    } else {
      setPullDistance(0);
    }
  }, [pullDistance]);

  useEffect(() => {
    // Only enable on touch devices
    const isTouchDevice = 'ontouchstart' in window;
    if (!isTouchDevice) return;

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

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
        style={{ transform: pullDistance > 0 ? `translateY(${pullDistance * 0.3}px)` : undefined, transition: pulling.current ? 'none' : 'transform 0.3s ease' }}
      >
        {children}
      </div>
    </>
  );
}
