import { MENTALITY_EMOTIONS, PRE_MARKET_CHECKLIST } from './constants';
import { isClosedTrade, localDayKey, groupWinRate } from './calculations';

// Pure cross-reference between the mentality journals and the trades that were
// closed on the same day. Extracted out of useMentalStats so the AI coach can
// compute the exact same numbers outside of React — the model is never asked to
// derive a statistic, only to phrase one we already computed.
export function computeMentalStats(trades, morningEntries, eveningEntries) {
  // 1. Only closed trades
  const closed = (trades || []).filter(isClosedTrade);

  // 2. Map trades by exit date (YYYY-MM-DD, local midnight — must match the
  //    journals' entry keys)
  const tradesByDate = {};
  closed.forEach((t) => {
    // exitDate || entryDate is the app's canonical day key (planAudit and
    // useDashboardStats both use it). A closed trade with no exitDate is a
    // supported case — CSV imports write exitDate: null — and keying on
    // exitDate alone sent every one of them to '1970-01-01', where no journal
    // entry could ever match, so they vanished from the cross-reference.
    const key = localDayKey(t.exitDate || t.entryDate);
    if (!tradesByDate[key]) tradesByDate[key] = [];
    tradesByDate[key].push(t);
  });

  // 3. Map morning/evening by date
  const morningByDate = {};
  (morningEntries || []).forEach((e) => {
    morningByDate[e.date] = e;
  });
  const eveningByDate = {};
  (eveningEntries || []).forEach((e) => {
    eveningByDate[e.date] = e;
  });

  // 4. Cross days: days with morning journal + trades
  const crossDays = [];
  Object.keys(morningByDate).forEach((date) => {
    if (tradesByDate[date]?.length) {
      crossDays.push({
        date,
        morning: morningByDate[date],
        evening: eveningByDate[date] || null,
        trades: tradesByDate[date],
      });
    }
  });

  const totalCrossDays = crossDays.length;

  // Helper: calc stats for a group of trades
  const calcGroupStats = (groupTrades) => {
    const total = groupTrades.length;
    const wins = groupTrades.filter((t) => t.result === 'win').length;
    const losses = groupTrades.filter((t) => t.result === 'loss').length;
    const totalPnl = groupTrades.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);
    return {
      trades: total,
      // Decided only, like every other win rate in the app.
      winRate: Math.round(groupWinRate(wins, losses)),
      avgPnl: total > 0 ? totalPnl / total : 0,
      totalPnl,
    };
  };

  // 5. Stats by morning emotion
  const emotionStats = {};
  MENTALITY_EMOTIONS.forEach((em) => {
    emotionStats[em.key] = { ...em, trades: 0, winRate: 0, avgPnl: 0, totalPnl: 0 };
  });
  crossDays.forEach((day) => {
    const key = day.morning.emotion;
    if (key && emotionStats[key]) {
      const prev = emotionStats[key];
      const dayTrades = day.trades;
      const allTrades = [...(prev._raw || []), ...dayTrades];
      emotionStats[key]._raw = allTrades;
    }
  });
  // Finalize emotion stats
  Object.keys(emotionStats).forEach((key) => {
    const raw = emotionStats[key]._raw || [];
    const stats = calcGroupStats(raw);
    emotionStats[key] = { ...emotionStats[key], ...stats };
    delete emotionStats[key]._raw;
  });
  const emotionStatsArray = Object.values(emotionStats).filter((e) => e.trades > 0);

  // Best emotion
  const bestEmotion = emotionStatsArray.length
    ? emotionStatsArray.reduce((best, e) => (e.winRate > best.winRate ? e : best), emotionStatsArray[0])
    : null;

  // 6. Stats by readiness level groups: low (1-3), mid (4-6), high (7-10)
  const readinessGroups = {
    low: { label: 'נמוכה (1-3)', trades: [], range: [1, 3] },
    mid: { label: 'בינונית (4-6)', trades: [], range: [4, 6] },
    high: { label: 'גבוהה (7-10)', trades: [], range: [7, 10] },
  };
  crossDays.forEach((day) => {
    const level = day.morning.readinessLevel;
    if (level >= 1 && level <= 3) readinessGroups.low.trades.push(...day.trades);
    else if (level >= 4 && level <= 6) readinessGroups.mid.trades.push(...day.trades);
    else if (level >= 7 && level <= 10) readinessGroups.high.trades.push(...day.trades);
  });
  const readinessStats = Object.entries(readinessGroups).map(([key, g]) => ({
    key,
    label: g.label,
    ...calcGroupStats(g.trades),
  }));

  // Avg readiness on profitable vs losing days
  const profitDaysReadiness = [];
  const lossDaysReadiness = [];
  crossDays.forEach((day) => {
    const dayPnl = day.trades.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);
    if (dayPnl > 0) profitDaysReadiness.push(day.morning.readinessLevel);
    else if (dayPnl < 0) lossDaysReadiness.push(day.morning.readinessLevel);
  });
  const avgReadinessProfit = profitDaysReadiness.length
    ? (profitDaysReadiness.reduce((a, b) => a + b, 0) / profitDaysReadiness.length).toFixed(1)
    : '-';
  const avgReadinessLoss = lossDaysReadiness.length
    ? (lossDaysReadiness.reduce((a, b) => a + b, 0) / lossDaysReadiness.length).toFixed(1)
    : '-';

  // 7. Checklist impact
  const checklistStats = PRE_MARKET_CHECKLIST.map((item) => {
    const withItem = [];
    const withoutItem = [];
    crossDays.forEach((day) => {
      const checklist = day.morning.preMarketChecklist || [];
      if (checklist.includes(item.key)) {
        withItem.push(...day.trades);
      } else {
        withoutItem.push(...day.trades);
      }
    });
    return {
      key: item.key,
      label: item.label,
      with: calcGroupStats(withItem),
      without: calcGroupStats(withoutItem),
    };
  });

  // 8. Followed plan stats (from evening journal)
  const followedTrades = [];
  const notFollowedTrades = [];
  crossDays.forEach((day) => {
    if (day.evening) {
      if (day.evening.followedPlan === true) {
        followedTrades.push(...day.trades);
      } else if (day.evening.followedPlan === false) {
        notFollowedTrades.push(...day.trades);
      }
    }
  });
  const planStats = {
    followed: calcGroupStats(followedTrades),
    notFollowed: calcGroupStats(notFollowedTrades),
  };

  return {
    totalCrossDays,
    // Every trade that happened on a journaled day. Buckets below are only
    // meaningful as a delta against this, so it has to come from the same
    // universe of trades — not from re-summing a bucket array (days with no
    // recorded emotion would silently drop out).
    baseline: calcGroupStats(crossDays.flatMap((d) => d.trades)),
    emotionStatsArray,
    bestEmotion,
    readinessStats,
    avgReadinessProfit,
    avgReadinessLoss,
    checklistStats,
    planStats,
  };
}
