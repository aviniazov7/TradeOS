import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Compass, Home, ArrowRight } from 'lucide-react';
import EmptyState from './EmptyState';
import { headerPrimaryBtn, headerIconBtn } from './headerStyles';

// Shown for any in-app URL that matches no route. It used to redirect home
// silently, so a mistyped or stale link looked like the app ignored it.
export default function NotFoundPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const prev = document.title;
    document.title = 'הדף לא נמצא · TradeOS';
    return () => { document.title = prev; };
  }, []);

  return (
    <EmptyState
      icon={Compass}
      title="הדף לא נמצא"
      description="הכתובת שפתחת לא קיימת באפליקציה. ייתכן שהקישור ישן או שנפלה טעות בהקלדה."
      action={(
        <div className="flex flex-col items-center gap-3">
          <code dir="ltr" className="max-w-[90vw] truncate text-xs text-text-muted bg-bg-tertiary border border-border-primary rounded-lg px-2.5 py-1">
            {pathname}
          </code>
          <div className="flex items-center gap-2">
            <Link to="/" className={headerPrimaryBtn}>
              <Home className="w-4 h-4" /> לדף הבית
            </Link>
            <button type="button" onClick={() => navigate(-1)} className={headerIconBtn} title="חזרה" aria-label="חזרה">
              <ArrowRight className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      )}
    />
  );
}
