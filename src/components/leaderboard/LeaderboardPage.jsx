import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Crown } from 'lucide-react';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { useAuth } from '../../contexts/AuthContext';
import LeaderboardSkeleton from './LeaderboardSkeleton';
import { pageVariants, pageTransition, staggerContainer, staggerItem, cardHover } from '../../utils/animations';
import { LRM } from '../../utils/formatters';

const SORT_OPTIONS = [
  { key: 'score', label: 'ציון כללי' },
  { key: 'winRate', label: 'אחוז הצלחה' },
  { key: 'pnlPercent', label: 'אחוז רווח' },
  { key: 'trades', label: 'מספר עסקאות' },
];

const MEDAL_COLORS = [
  'from-yellow-500/20 to-yellow-600/5 border-yellow-500/40',
  'from-gray-300/20 to-gray-400/5 border-gray-400/40',
  'from-amber-700/20 to-amber-800/5 border-amber-700/40',
];

const MEDAL_ICONS = ['text-yellow-500', 'text-gray-300', 'text-amber-600'];

function getRankDisplay(rank) {
  if (rank === 1) return '1';
  if (rank === 2) return '2';
  if (rank === 3) return '3';
  return rank;
}

export default function LeaderboardPage() {
  const { entries, loading, sortBy, setSortBy } = useLeaderboard();
  const { user } = useAuth();

  const currentUserRank = useMemo(() => {
    if (!user) return null;
    const idx = entries.findIndex((e) => e.id === user.uid);
    return idx >= 0 ? idx + 1 : null;
  }, [entries, user]);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  if (loading) return <LeaderboardSkeleton />;

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Trophy className="w-6 h-6 text-yellow-500" />
          <h1 className="text-xl font-bold text-text-primary">לוח מובילים</h1>
        </div>
        {currentUserRank && (
          <div className="bg-accent-primary/10 text-accent-primary text-xs font-semibold px-3 py-1.5 rounded-lg">
            הדירוג שלך: #{currentUserRank}
          </div>
        )}
      </div>

      {/* Sort Options */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
        {SORT_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              sortBy === key
                ? 'bg-accent-primary text-bg-primary'
                : 'bg-bg-secondary text-text-muted hover:text-text-primary border border-border-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-20">
          <Trophy className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-30" />
          <p className="text-text-muted text-sm">אין עדיין משתתפים בלוח המובילים</p>
          <p className="text-text-muted text-xs mt-1">הפעל השתתפות בהגדרות הפרופיל</p>
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {top3.length > 0 && (
            <motion.div
              className="grid grid-cols-3 gap-2 md:gap-3 mb-6"
              variants={staggerContainer}
              initial="initial"
              animate="animate"
            >
              {/* Reorder: show 2nd, 1st, 3rd for podium effect */}
              {[top3[1], top3[0], top3[2]].filter(Boolean).map((entry, visualIdx) => {
                const actualRank = visualIdx === 0 ? 2 : visualIdx === 1 ? 1 : 3;
                const medalIdx = actualRank - 1;
                const isMe = entry.id === user?.uid;

                return (
                  <motion.div
                    key={entry.id}
                    variants={staggerItem}
                    whileHover={cardHover}
                    className={`bg-gradient-to-b ${MEDAL_COLORS[medalIdx]} border rounded-xl p-3 text-center ${
                      visualIdx === 1 ? 'md:-mt-4' : 'mt-2 md:mt-4'
                    } ${isMe ? 'ring-2 ring-accent-primary' : ''}`}
                  >
                    {/* Crown for #1 */}
                    {actualRank === 1 && (
                      <Crown className="w-5 h-5 text-yellow-500 mx-auto mb-1" />
                    )}

                    {/* Avatar */}
                    {entry.photoURL ? (
                      <img src={entry.photoURL} alt="" className="w-10 h-10 md:w-12 md:h-12 rounded-full mx-auto mb-1.5 border border-border-primary" />
                    ) : (
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-bg-tertiary flex items-center justify-center text-text-muted text-sm font-bold mx-auto mb-1.5">
                        {entry.displayName?.[0] || '?'}
                      </div>
                    )}

                    {/* Rank */}
                    <div className={`text-lg font-bold ${MEDAL_ICONS[medalIdx]}`}>
                      #{getRankDisplay(actualRank)}
                    </div>

                    {/* Name */}
                    <p className="text-xs text-text-primary font-medium truncate mt-0.5">
                      {entry.displayName}
                    </p>

                    {/* Score */}
                    <div className="text-lg font-bold text-text-primary mt-1">
                      {entry.score}
                    </div>
                    <p className="text-[10px] text-text-muted">ציון</p>

                    {/* Key Stats */}
                    <div className="mt-2 space-y-0.5 text-[10px]">
                      <div className="flex items-center justify-between">
                        <span className="text-text-muted">Win</span>
                        <span className="text-text-primary font-medium">{entry.live?.winRate || 0}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-text-muted">PnL</span>
                        <span className={`font-medium ${(entry.live?.pnlPercent || 0) >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {LRM}{entry.live?.pnlPercent > 0 ? '+' : ''}{entry.live?.pnlPercent || 0}%
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}

          {/* Rest of Leaderboard */}
          {rest.length > 0 && (
            <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-primary text-text-muted">
                      <th className="px-4 py-3 text-right font-medium">#</th>
                      <th className="px-4 py-3 text-right font-medium">שם</th>
                      <th className="px-4 py-3 text-center font-medium">ציון</th>
                      <th className="px-4 py-3 text-center font-medium">Win Rate</th>
                      <th className="px-4 py-3 text-center font-medium">PnL%</th>
                      <th className="px-4 py-3 text-center font-medium">Profit Factor</th>
                      <th className="px-4 py-3 text-center font-medium">Avg RR</th>
                      <th className="px-4 py-3 text-center font-medium">עסקאות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((entry, idx) => {
                      const rank = idx + 4;
                      const isMe = entry.id === user?.uid;
                      return (
                        <tr
                          key={entry.id}
                          className={`border-b border-border-primary last:border-0 hover:bg-bg-tertiary transition-colors ${
                            isMe ? 'bg-accent-primary/5' : ''
                          }`}
                        >
                          <td className="px-4 py-3 text-text-muted font-medium">{rank}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {entry.photoURL ? (
                                <img src={entry.photoURL} alt="" className="w-6 h-6 rounded-full" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-bg-tertiary flex items-center justify-center text-text-muted text-[10px] font-bold">
                                  {entry.displayName?.[0] || '?'}
                                </div>
                              )}
                              <span className={`font-medium ${isMe ? 'text-accent-primary' : 'text-text-primary'}`}>
                                {entry.displayName}
                                {isMe && <span className="text-[10px] text-accent-primary mr-1">(אתה)</span>}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-text-primary">{entry.score}</td>
                          <td className="px-4 py-3 text-center text-text-primary">{entry.live?.winRate || 0}%</td>
                          <td className={`px-4 py-3 text-center font-medium ${(entry.live?.pnlPercent || 0) >= 0 ? 'text-profit' : 'text-loss'}`}>
                            {LRM}{entry.live?.pnlPercent > 0 ? '+' : ''}{entry.live?.pnlPercent || 0}%
                          </td>
                          <td className="px-4 py-3 text-center text-text-primary">{entry.live?.profitFactor || 0}</td>
                          <td className="px-4 py-3 text-center text-text-primary">{entry.live?.avgRR || 0}</td>
                          <td className="px-4 py-3 text-center text-text-primary">{entry.live?.totalTrades || 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-border-primary">
                {rest.map((entry, idx) => {
                  const rank = idx + 4;
                  const isMe = entry.id === user?.uid;
                  return (
                    <div
                      key={entry.id}
                      className={`px-4 py-3 ${isMe ? 'bg-accent-primary/5' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-text-muted w-6">{rank}</span>
                          {entry.photoURL ? (
                            <img src={entry.photoURL} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-text-muted text-xs font-bold">
                              {entry.displayName?.[0] || '?'}
                            </div>
                          )}
                          <div>
                            <p className={`text-sm font-medium ${isMe ? 'text-accent-primary' : 'text-text-primary'}`}>
                              {entry.displayName}
                              {isMe && <span className="text-[10px] text-accent-primary mr-1">(אתה)</span>}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-text-muted mt-0.5">
                              <span>Win {entry.live?.winRate || 0}%</span>
                              <span className={`${(entry.live?.pnlPercent || 0) >= 0 ? 'text-profit' : 'text-loss'}`}>
                                PnL {LRM}{entry.live?.pnlPercent > 0 ? '+' : ''}{entry.live?.pnlPercent || 0}%
                              </span>
                              <span>{entry.live?.totalTrades || 0} עסקאות</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-text-primary">{entry.score}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Total participants */}
          <p className="text-center text-xs text-text-muted mt-4">
            {entries.length} משתתפים בדירוג
          </p>
        </>
      )}
    </motion.div>
  );
}
