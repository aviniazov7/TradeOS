import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ fullScreen = false, size = 'md' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="flex flex-col items-center gap-6" style={{ animation: 'splashEntry 0.8s ease-out' }}>
          {/* Logo chart SVG */}
          <div style={{ animation: 'splashFloat 3s ease-in-out infinite' }}>
            <svg
              width="160"
              height="100"
              viewBox="0 0 140 90"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ overflow: 'visible' }}
            >
              {/* Grid lines */}
              <line x1="10" y1="20" x2="130" y2="20" stroke="#2a2a2a" strokeWidth="0.5" />
              <line x1="10" y1="40" x2="130" y2="40" stroke="#2a2a2a" strokeWidth="0.5" />
              <line x1="10" y1="60" x2="130" y2="60" stroke="#2a2a2a" strokeWidth="0.5" />

              {/* Area fill under chart */}
              <path
                d="M 10 70 L 25 58 L 40 63 L 55 42 L 70 48 L 85 28 L 100 32 L 115 12 L 130 8 L 130 80 L 10 80 Z"
                fill="url(#splashArea)"
                style={{
                  opacity: 0,
                  animation: 'splashAreaFade 2s ease-in-out 0.5s infinite',
                }}
              />
              <defs>
                {/* Cerulean, matching the app accent gradient */}
                <linearGradient id="splashLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#005e80" />
                  <stop offset="100%" stopColor="#007ba7" />
                </linearGradient>
                <linearGradient id="splashArea" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#007ba7" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#007ba7" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Chart line path */}
              <path
                d="M 10 70 L 25 58 L 40 63 L 55 42 L 70 48 L 85 28 L 100 32 L 115 12 L 130 8"
                stroke="url(#splashLine)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                style={{
                  strokeDasharray: 250,
                  strokeDashoffset: 250,
                  animation: 'chartDraw 2s ease-in-out infinite',
                }}
              />

              {/* Glow dot at the tip (cyan end of the gradient) */}
              <circle
                cx="130"
                cy="8"
                r="4"
                fill="#1496c4"
                style={{
                  opacity: 0,
                  animation: 'chartDot 2s ease-in-out infinite',
                }}
              />
              <circle
                cx="130"
                cy="8"
                r="8"
                fill="none"
                stroke="#1496c4"
                strokeWidth="1.5"
                style={{
                  opacity: 0,
                  animation: 'chartGlow 2s ease-in-out infinite',
                }}
              />
            </svg>
          </div>

          {/* Brand text */}
          <div className="flex flex-col items-center gap-2">
            <h1
              className="text-2xl font-bold text-text-primary tracking-widest"
              style={{ animation: 'splashTextIn 0.6s ease-out 0.3s both' }}
            >
              TradeOS
            </h1>
            <p
              className="text-xs text-text-muted tracking-wide"
              style={{ animation: 'splashTextIn 0.6s ease-out 0.6s both' }}
            >
              מערכת ניהול מסחר
            </p>
          </div>

          {/* Progress bar */}
          <div
            className="w-32 h-0.5 rounded-full bg-border-primary overflow-hidden"
            style={{ animation: 'splashTextIn 0.4s ease-out 0.8s both' }}
          >
            <div
              className="h-full rounded-full bg-accent-primary"
              style={{ animation: 'splashProgress 2s ease-in-out infinite' }}
            />
          </div>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes splashEntry {
            0% { opacity: 0; transform: scale(0.85); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes splashFloat {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
          }
          @keyframes splashTextIn {
            0% { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes splashAreaFade {
            0%, 45% { opacity: 0; }
            55% { opacity: 1; }
            75% { opacity: 1; }
            100% { opacity: 0; }
          }
          @keyframes splashProgress {
            0% { width: 0%; }
            50% { width: 100%; }
            100% { width: 0%; }
          }
          @keyframes chartDraw {
            0% { stroke-dashoffset: 250; }
            55% { stroke-dashoffset: 0; }
            75% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: -250; }
          }
          @keyframes chartDot {
            0%, 45% { opacity: 0; }
            55% { opacity: 1; }
            75% { opacity: 1; }
            85%, 100% { opacity: 0; }
          }
          @keyframes chartGlow {
            0%, 45% { opacity: 0; }
            55% { opacity: 0.5; }
            65% { opacity: 0; }
            70% { opacity: 0.5; }
            75% { opacity: 0; }
            85%, 100% { opacity: 0; }
          }
        ` }} />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-8">
      <Loader2
        className={`${sizeClasses[size]} text-accent-primary animate-spin`}
      />
    </div>
  );
}
