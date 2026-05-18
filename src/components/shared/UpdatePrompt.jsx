import { useState, useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { onUpdateAvailable, applyUpdate } from '../../services/swUpdate';

export default function UpdatePrompt() {
  const [show, setShow] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    onUpdateAvailable(() => setShow(true));
  }, []);

  if (!show) return null;

  const handleUpdate = () => {
    setUpdating(true);
    applyUpdate();
  };

  return (
    <div
      dir="rtl"
      className="fixed left-0 right-0 z-[200] flex justify-center px-3"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
    >
      <div className="flex items-center gap-3 bg-bg-secondary border border-accent-primary/40 rounded-xl shadow-lg px-4 py-3 max-w-md w-full">
        <RefreshCw className={`w-5 h-5 text-accent-primary shrink-0 ${updating ? 'animate-spin' : ''}`} />
        <div className="flex-1 text-sm">
          <div className="font-semibold text-text-primary">גרסה חדשה זמינה</div>
          <div className="text-text-secondary">עדכן כדי לקבל את השיפורים האחרונים</div>
        </div>
        <button
          onClick={handleUpdate}
          disabled={updating}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-accent-primary text-white hover:bg-accent-hover disabled:opacity-60 cursor-pointer whitespace-nowrap"
        >
          {updating ? 'מעדכן…' : 'עדכן עכשיו'}
        </button>
        {!updating && (
          <button
            onClick={() => setShow(false)}
            aria-label="סגור"
            className="text-text-secondary hover:text-text-primary cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
