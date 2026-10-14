import { forwardRef } from 'react';
import { getExchangeLogo } from '../../utils/constants';
import { formatCurrency, formatPercent, formatPrice, formatSignedR, formatDate } from '../../utils/formatters';
import { signedTradeR, tradeNetPercent } from '../../utils/calculations';
import { getCoinIcon } from '../shared/CoinIcon';

const TradeShareCard = forwardRef(function TradeShareCard({ trade, options = {} }, ref) {
  const {
    showPnl = true,
    showPercent = true,
    showPrices = true,
    showRR = true,
    showDates = true,
  } = options;

  const pnl = trade.netPnl ?? trade.pnl ?? 0;
  const netR = signedTradeR(trade);
  const isWin = pnl > 0;
  const isLong = trade.direction === 'long';
  const accentColor = isWin ? '#22c55e' : '#ef4444';
  const accentGlow = isWin ? 'rgba(34, 197, 94,' : 'rgba(239, 68, 68,';
  const dirColor = isLong ? '#22c55e' : '#ef4444';
  const dirLabel = isLong ? 'LONG' : 'SHORT';
  const exchangeLogo = trade.exchange ? getExchangeLogo(trade.exchange) : null;

  const entryDate = trade.entryDate?.toDate ? trade.entryDate.toDate() : new Date(trade.entryDate);
  const exitDate = trade.exitDate?.toDate ? trade.exitDate.toDate() : new Date(trade.exitDate);

  return (
    <div
      ref={ref}
      style={{
        width: 480,
        padding: 28,
        background: '#09090f',
        borderRadius: 16,
        border: `1px solid ${accentGlow}0.3)`,
        fontFamily: "'Heebo', 'Inter', sans-serif",
        color: '#f0f0f0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top glow */}
      <div style={{
        position: 'absolute',
        top: -80,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 300,
        height: 200,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${accentGlow}0.12) 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Bottom corner glow */}
      <div style={{
        position: 'absolute',
        bottom: -60,
        right: -40,
        width: 200,
        height: 200,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${accentGlow}0.06) 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Decorative candlestick chart */}
      <svg
        style={{
          position: 'absolute',
          right: 16,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 130,
          height: 160,
          opacity: 0.1,
          pointerEvents: 'none',
        }}
        viewBox="0 0 130 160"
      >
        {isWin ? (
          <>
            {/* Bullish candlestick pattern — trending up */}
            <line x1="13" y1="130" x2="13" y2="90" stroke={accentColor} strokeWidth="2" />
            <rect x="6" y="100" width="14" height="25" rx="2" fill={accentColor} />

            <line x1="39" y1="115" x2="39" y2="65" stroke={accentColor} strokeWidth="2" />
            <rect x="32" y="75" width="14" height="30" rx="2" fill={accentColor} />

            <line x1="65" y1="95" x2="65" y2="60" stroke="#ef4444" strokeWidth="2" />
            <rect x="58" y="65" width="14" height="20" rx="2" fill="#ef4444" />

            <line x1="91" y1="80" x2="91" y2="25" stroke={accentColor} strokeWidth="2" />
            <rect x="84" y="35" width="14" height="35" rx="2" fill={accentColor} />

            <line x1="117" y1="50" x2="117" y2="8" stroke={accentColor} strokeWidth="2" />
            <rect x="110" y="12" width="14" height="28" rx="2" fill={accentColor} />
          </>
        ) : (
          <>
            {/* Bearish candlestick pattern — trending down */}
            <line x1="13" y1="45" x2="13" y2="8" stroke="#ef4444" strokeWidth="2" />
            <rect x="6" y="12" width="14" height="25" rx="2" fill="#ef4444" />

            <line x1="39" y1="70" x2="39" y2="25" stroke="#ef4444" strokeWidth="2" />
            <rect x="32" y="35" width="14" height="28" rx="2" fill="#ef4444" />

            <line x1="65" y1="75" x2="65" y2="45" stroke="#22c55e" strokeWidth="2" />
            <rect x="58" y="50" width="14" height="18" rx="2" fill="#22c55e" />

            <line x1="91" y1="120" x2="91" y2="55" stroke="#ef4444" strokeWidth="2" />
            <rect x="84" y="65" width="14" height="42" rx="2" fill="#ef4444" />

            <line x1="117" y1="148" x2="117" y2="90" stroke="#ef4444" strokeWidth="2" />
            <rect x="110" y="100" width="14" height="38" rx="2" fill="#ef4444" />
          </>
        )}
      </svg>

      {/* Header: Logo + Pair + Direction */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {exchangeLogo && (
            <img src={exchangeLogo} alt="" style={{ width: 20, height: 20, borderRadius: 4 }} />
          )}
          {(() => { const icon = getCoinIcon(trade.pair); return icon ? <img src={icon} alt="" style={{ width: 22, height: 22, borderRadius: '50%' }} onError={(e) => { e.target.style.display = 'none'; }} /> : null; })()}
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.5px' }}>{trade.pair}</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: `${dirColor}18`,
          border: `1px solid ${dirColor}40`,
          borderRadius: 8,
          padding: '4px 12px',
        }}>
          <span style={{ color: dirColor, fontSize: 13, fontWeight: 700 }}>{dirLabel}</span>
          {trade.leverage > 1 && (
            <span style={{ color: '#a0a0b0', fontSize: 11 }}>×{trade.leverage}</span>
          )}
        </div>
      </div>

      {/* Big PnL */}
      {(showPnl || showPercent || showRR) && (
        <div style={{ textAlign: 'center', marginBottom: 20, position: 'relative' }}>
          {showPnl && (
            <div style={{ fontSize: 38, fontWeight: 800, color: accentColor, lineHeight: 1.1 }}>
              {formatCurrency(pnl)}
            </div>
          )}
          {(showPercent || showRR) && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: showPnl ? 6 : 0 }}>
              {showPercent && (
                <span style={{ fontSize: showPnl ? 15 : 32, color: accentColor, fontWeight: showPnl ? 600 : 800 }}>
                  {formatPercent(tradeNetPercent(trade))}
                </span>
              )}
              {showRR && netR != null && (
                <span style={{ fontSize: showPnl ? 15 : 32, color: accentColor, fontWeight: showPnl ? 600 : 800 }}>
                  {formatSignedR(netR)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Trade Details Grid */}
      {showPrices && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 10,
          padding: 14,
          border: '1px solid rgba(255, 255, 255, 0.06)',
          marginBottom: 16,
          position: 'relative',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#707080', marginBottom: 3 }}>כניסה</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{formatPrice(trade.entryPrice)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#707080', marginBottom: 3 }}>SL</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{trade.stopLoss ? formatPrice(trade.stopLoss) : '—'}</div>
          </div>
        </div>
      )}

      {/* Strategy + Timeframe row */}
      {(trade.strategy || trade.timeframe) && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 12,
          marginBottom: 16,
          position: 'relative',
        }}>
          {trade.strategy && (
            <span style={{
              fontSize: 11,
              color: '#38bdf8',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              borderRadius: 6,
              padding: '3px 10px',
            }}>
              {trade.strategy}
            </span>
          )}
          {trade.timeframe && (
            <span style={{
              fontSize: 11,
              color: '#a0a0b0',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 6,
              padding: '3px 10px',
            }}>
              {trade.timeframe}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 14,
        borderTop: `1px solid ${accentGlow}0.1)`,
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src="/favicon.png" alt="" style={{ width: 16, height: 16, borderRadius: 3 }} />
          <span style={{ fontSize: 11, color: '#606070' }}>Tracked with TradeOS</span>
        </div>
        {showDates && (
          <span style={{ fontSize: 10, color: '#505060' }}>
            {formatDate(entryDate)} → {formatDate(exitDate)}
          </span>
        )}
      </div>
    </div>
  );
});

export default TradeShareCard;
