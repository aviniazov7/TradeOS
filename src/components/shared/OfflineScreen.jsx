import { WifiOff, RefreshCw } from 'lucide-react';

export default function OfflineScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <svg
          width="160"
          height="100"
          viewBox="0 0 160 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ overflow: 'visible' }}
        >
          {/* Grid lines */}
          <line x1="10" y1="20" x2="150" y2="20" stroke="#1a1a1a" strokeWidth="0.5" />
          <line x1="10" y1="45" x2="150" y2="45" stroke="#1a1a1a" strokeWidth="0.5" />
          <line x1="10" y1="70" x2="150" y2="70" stroke="#1a1a1a" strokeWidth="0.5" />

          {/* Left part of chart - fading out */}
          <path
            d="M 10 75 L 25 63 L 40 68 L 55 47 L 70 52"
            stroke="#ef4444"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            style={{ opacity: 0.4, animation: 'offlinePulse 3s ease-in-out infinite' }}
          />

          {/* Gap - broken connection */}
          <line
            x1="73" y1="49" x2="87" y2="42"
            stroke="#ef4444"
            strokeWidth="2"
            strokeDasharray="3 4"
            style={{ opacity: 0.2, animation: 'offlineDash 2s linear infinite' }}
          />

          {/* Right part - flatline dropping */}
          <path
            d="M 90 40 L 105 55 L 120 70 L 135 78 L 150 85"
            stroke="#ef4444"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            style={{ opacity: 0.3, animation: 'offlinePulse 3s ease-in-out infinite 0.5s' }}
          />

          {/* X mark at break point */}
          <g style={{ animation: 'offlineX 3s ease-in-out infinite' }}>
            <line x1="76" y1="42" x2="84" y2="50" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
            <line x1="84" y1="42" x2="76" y2="50" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
          </g>
        </svg>

        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-loss/10 flex items-center justify-center" style={{ animation: 'offlinePulse 3s ease-in-out infinite' }}>
            <WifiOff className="w-6 h-6 text-loss" />
          </div>
          <h2 className="text-lg font-bold text-text-primary">אין חיבור לאינטרנט</h2>
          <p className="text-sm text-text-muted text-center max-w-[250px]">
            בדוק את החיבור שלך ונסה שוב
          </p>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-5 py-2.5 bg-accent-primary/10 text-accent-primary border border-accent-primary/30 rounded-xl text-sm font-medium hover:bg-accent-primary/20 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          נסה שוב
        </button>

        <span className="text-xs text-text-muted/50 tracking-wider mt-2">TradeOS</span>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes offlinePulse {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.6; }
        }
        @keyframes offlineX {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes offlineDash {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: 14; }
        }
      ` }} />
    </div>
  );
}
