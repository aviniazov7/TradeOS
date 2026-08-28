import { useState, useEffect, useMemo, useRef } from 'react';
import { resolveExitState } from '../../utils/exitState';
import toast from 'react-hot-toast';
import DatePicker, { registerLocale } from 'react-datepicker';
import { he } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';
import { X, Plus, AlertTriangle, ShieldAlert, Percent, TrendingUp, TrendingDown, Check, Clock, CircleDot, CheckCircle2, Target, ClipboardCheck, Gauge, ShieldCheck } from 'lucide-react';
import Modal from '../shared/Modal';
import PairSearch from './PairSearch';
import SelectDropdown from '../shared/SelectDropdown';
import NumberStepper from '../shared/NumberStepper';
import TimeframeSelector from '../shared/TimeframeSelector';
import StrategySelector from '../shared/StrategySelector';
import MultiSelector from '../shared/MultiSelector';
import { PAIRS, MISTAKE_LABELS, TAG_LABELS, SESSIONS, getSessionClasses, FUTURES_CONTRACTS, getContractSpec, DEFAULT_LEVERAGE } from '../../utils/constants';
import { useUserStrategies } from '../../hooks/useUserStrategies';
import { useUserTimeframes } from '../../hooks/useUserTimeframes';
import { useUserTriggers } from '../../hooks/useUserTriggers';
import { useUserTags } from '../../hooks/useUserTags';
import { useUserMistakes } from '../../hooks/useUserMistakes';
import { calculatePnLPercent, calculateRR, calculateNetPnL, calculatePartialPnL, calculateWeightedExitPrice, calculateFuturesContractsPnL, calculateFuturesNotional } from '../../utils/calculations';
import { getSessionFromDate } from '../../utils/sessions';
import { formatCurrency, formatPercent, formatRR } from '../../utils/formatters';

registerLocale('he', he);

const defaultForm = {
  assetClass: 'crypto',
  pair: 'BTCUSDT',
  contracts: '1',
  direction: 'long',
  orderType: 'market',
  marketType: 'futures',
  strategy: '',
  trigger: '',
  timeframe: '4H',
  customTimeframe: '',
  entryPrice: '',
  exitPrice: '',
  additionalExits: [],
  stopLoss: '',
  positionSize: '',
  riskAmount: '',
  leverage: DEFAULT_LEVERAGE,
  fees: '',
  entryDate: null,
  exitDate: null,
  entryReason: '',
  notes: '',
  tags: [],
  emotionBefore: '',
  emotionAfter: '',
  mistakes: [],
  session: '',
  tradingViewUrl: '',
  source: 'manual',
  focusRating: 3,
  planAdherenceRating: 3,
  stressRating: 3,
  confidenceRating: 3,
};

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (val?.toDate) return val.toDate();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// Color scale from low (red) to high (green), used by the mental sliders.
const RATING_COLORS = ['text-loss', 'text-orange-400', 'text-breakeven', 'text-lime-400', 'text-profit'];

const MENTAL_RATINGS = [
  { key: 'focusRating', label: 'ריכוז וחדות', Icon: Target },
  { key: 'planAdherenceRating', label: 'הצמדות לתוכנית', Icon: ClipboardCheck },
  // Stress is the one scale where 5 is the BAD answer, so the shared red-to-
  // green ramp has to run backwards for it — otherwise maximum stress renders
  // green and reads as a good day.
  { key: 'stressRating', label: 'לחץ / סטרס', Icon: Gauge, invert: true },
  { key: 'confidenceRating', label: 'ביטחון בעסקה', Icon: ShieldCheck },
];

export default function TradeForm({ isOpen, onClose, trade, onSave, riskSettings, livePrices = {}, journalAssetClass = 'crypto' }) {
  // Asset class is owned by the JOURNAL — every trade inherits it, no per-trade
  // toggle. Editing a trade keeps that trade's own stored class.
  const newTradeAssetClass = journalAssetClass === 'futures_cme' ? 'futures_cme' : 'crypto';
  const { allStrategies, addStrategy, removeStrategy } = useUserStrategies('journal');
  const { allTimeframes, addTimeframe, removeTimeframe } = useUserTimeframes();
  const { allTriggers, addTrigger, removeTrigger } = useUserTriggers();
  const { allTags, addTag, removeTag } = useUserTags();
  const { allMistakes, addMistake, removeMistake } = useUserMistakes();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const sessionManuallySet = useRef(false);
  const [activeTab, setActiveTab] = useState('trade');
  const livePricesRef = useRef(livePrices);
  useEffect(() => { livePricesRef.current = livePrices; });
  const TABS = [{ id: 'trade', label: 'עסקה' }, { id: 'mental', label: 'מנטליות' }];

  useEffect(() => {
    if (trade) {
      const ps = trade.positionSize || (trade.entryPrice && trade.quantity ? trade.entryPrice * trade.quantity : '');
      let derivedRisk = trade.riskAmount ?? '';
      if (!derivedRisk && ps && trade.entryPrice && trade.stopLoss) {
        const qty = parseFloat(ps) / parseFloat(trade.entryPrice);
        derivedRisk = (qty * Math.abs(parseFloat(trade.entryPrice) - parseFloat(trade.stopLoss))).toFixed(2);
      }

      // Combine exits (with %/contracts) + tps (price only). Futures exits also
      // carry a contract count so the editor shows contracts, not percent.
      const isFuturesTrade = trade.assetClass === 'futures_cme';
      const fromExits = (trade.exits || []).map(e => ({
        price: String(e.price),
        percent: String(e.percent),
        contracts: e.contracts != null ? String(e.contracts) : '',
      }));
      const fromTps = (trade.tps || []).map(p => ({ price: String(p), percent: '', contracts: '' }));
      let loadedAdditionalExits = fromExits.length || fromTps.length
        ? [...fromExits, ...fromTps]
        : parseFloat(trade.exitPrice) > 0
          ? [{ price: String(trade.exitPrice), percent: '100', contracts: isFuturesTrade ? String(trade.contract?.contracts ?? '') : '' }]
          : [];

      // Auto-detect reached TPs from live price (use ref to avoid stale closure without re-running on every tick).
      // Only for non-closed trades — editing a historical closed trade should never overwrite its exit data
      // based on today's price.
      const currentPrice = livePricesRef.current[trade.pair] || livePricesRef.current[trade.symbol];
      const isClosed = trade.status === 'closed';
      // Crypto-only: futures exits are tracked in contracts (no live spot feed
      // for CME here), so don't auto-fill a percent the futures path ignores.
      if (currentPrice && loadedAdditionalExits.length && !isClosed && !isFuturesTrade) {
        const isLong = trade.direction === 'long';
        let remainingPct = 100 - loadedAdditionalExits.reduce((s, e) => s + (parseFloat(e.percent) || 0), 0);
        loadedAdditionalExits = loadedAdditionalExits.map((exit, i) => {
          const tp = parseFloat(exit.price);
          if (!tp || parseFloat(exit.percent) > 0) return exit; // already marked
          const reached = isLong ? currentPrice >= tp : currentPrice <= tp;
          if (!reached) return exit;
          // Auto-mark: suggest equal split of remaining
          const unexecuted = loadedAdditionalExits.filter((e, idx) => idx >= i && !parseFloat(e.percent)).length;
          const suggested = unexecuted === 1
            ? remainingPct
            : Math.min(remainingPct, Math.round(remainingPct / unexecuted));
          remainingPct -= suggested;
          return { ...exit, percent: String(suggested) };
        });
      }

      setForm({
        ...defaultForm,
        ...trade,
        // A pre-existing trade without assetClass is crypto (back-compat).
        assetClass: trade.assetClass || 'crypto',
        contracts: trade.contract?.contracts != null ? String(trade.contract.contracts) : '1',
        pair: trade.pair || trade.symbol || 'BTCUSDT',
        orderType: trade.orderType || 'market',
        strategy: trade.strategy || '',
        timeframe: trade.timeframe || '4H',
        customTimeframe: '',
        entryPrice: trade.entryPrice ?? '',
        exitPrice: '',
        additionalExits: loadedAdditionalExits,
        stopLoss: trade.stopLoss ?? '',
        positionSize: ps || '',
        riskAmount: derivedRisk,
        leverage: trade.leverage ?? DEFAULT_LEVERAGE,
        // Trim float noise (e.g. an exchange-summed 5.07900000003) so the
        // input shows a clean 5.079 instead of a 12-digit number.
        fees: Number.isFinite(+trade.fees) && trade.fees !== '' ? +(+trade.fees).toPrecision(10) : '',
        tags: trade.tags ?? [],
        mistakes: trade.mistakes ?? [],
        tradingViewUrl: trade.tradingViewUrl ?? '',
        entryDate: parseDate(trade.entryDate),
        exitDate: parseDate(trade.exitDate),
        focusRating: trade.focusRating ?? 3,
        planAdherenceRating: trade.planAdherenceRating ?? 3,
        stressRating: trade.stressRating ?? 3,
        confidenceRating: trade.confidenceRating ?? 3,
      });
    } else {
      // New trade: seed the asset class from the user's profile preference and
      // pick a sensible default symbol for it.
      setForm({
        ...defaultForm,
        assetClass: newTradeAssetClass,
        pair: newTradeAssetClass === 'futures_cme' ? 'ES' : 'BTCUSDT',
      });
    }
    setActiveTab('trade');
    sessionManuallySet.current = false;
  }, [trade, isOpen]); // allStrategies intentionally excluded — it only affects dropdown options, not form state; including it caused form resets mid-edit

  // Auto-detect session from entry date (only if user hasn't manually selected)
  useEffect(() => {
    if (form.entryDate && !sessionManuallySet.current) {
      const detected = getSessionFromDate(form.entryDate);
      if (detected && detected !== form.session) {
        setForm((f) => ({ ...f, session: detected }));
      }
    }
  }, [form.entryDate]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  // CME futures mode (epic #32). Crypto stays the default path. contractSpec
  // (pointValue/tickSize) drives dollar P&L; contractsNum replaces leverage.
  const isFutures = form.assetClass === 'futures_cme';
  const contractSpec = isFutures ? getContractSpec(form.pair) : null;
  const contractsNum = parseInt(form.contracts) || 0;

  const addAdditionalExit = () => {
    setForm(f => ({ ...f, additionalExits: [...f.additionalExits, { price: '', percent: '', contracts: '' }] }));
  };

  const removeAdditionalExit = (index) => {
    setForm(f => ({ ...f, additionalExits: f.additionalExits.filter((_, i) => i !== index) }));
  };

  const updateAdditionalExit = (index, field, value) => {
    setForm(f => {
      const newExits = [...f.additionalExits];
      newExits[index] = { ...newExits[index], [field]: value };
      return { ...f, additionalExits: newExits };
    });
  };

  const additionalExitsPercent = useMemo(() => {
    if (isFutures) {
      // Aggregate from contracts so a full close lands on exactly 100% (summing
      // per-exit rounded percents would drift, e.g. 3×33.33 = 99.99).
      if (contractsNum <= 0) return 0;
      const sumC = form.additionalExits.reduce((s, e) => s + (parseFloat(e.contracts) || 0), 0);
      return (sumC / contractsNum) * 100;
    }
    return form.additionalExits.reduce((s, e) => s + (parseFloat(e.percent) || 0), 0);
  }, [form.additionalExits, isFutures, contractsNum]);

  const currentStatus = useMemo(() => {
    if (form.orderType === 'limit' && additionalExitsPercent === 0) return 'limit';
    if (additionalExitsPercent >= 100) return 'closed';
    if (additionalExitsPercent > 0) return 'partial';
    return 'open';
  }, [form.orderType, additionalExitsPercent]);

  // Auto-calculate position size from risk amount
  const autoPositionSize = useMemo(() => {
    const entry = parseFloat(form.entryPrice);
    const sl = parseFloat(form.stopLoss);
    const risk = parseFloat(form.riskAmount);
    if (!entry || !sl || !risk || entry === sl) return null;
    const distance = Math.abs(entry - sl);
    return (risk * entry) / distance;
  }, [form.entryPrice, form.stopLoss, form.riskAmount]);

  // Use auto-calculated or manual position size
  const effectivePositionSize = autoPositionSize ?? (parseFloat(form.positionSize) || 0);

  // Calculated margin
  const calculatedMargin = useMemo(() => {
    const lev = parseInt(form.leverage) || 1;
    if (!effectivePositionSize) return null;
    return effectivePositionSize / lev;
  }, [effectivePositionSize, form.leverage]);

  // Calculated quantity (for internal use)
  const calculatedQty = useMemo(() => {
    const entry = parseFloat(form.entryPrice);
    if (!effectivePositionSize || !entry) return 0;
    return effectivePositionSize / entry;
  }, [effectivePositionSize, form.entryPrice]);

  const calc = useMemo(() => {
    const entry = parseFloat(form.entryPrice);
    const sl = parseFloat(form.stopLoss);
    const fees = parseFloat(form.fees) || 0;

    // Futures: dollar P&L = points × pointValue × contracts, summed exactly
    // from per-exit contract counts. Percent is on notional (no leverage).
    if (isFutures) {
      const futExits = form.additionalExits
        .filter(e => parseFloat(e.price) > 0 && parseFloat(e.contracts) > 0)
        .map(e => ({ price: parseFloat(e.price), contracts: parseFloat(e.contracts) }));
      if (!entry || !contractSpec || !contractsNum || !futExits.length) return null;
      const pnl = calculateFuturesContractsPnL(form.direction, entry, futExits, contractSpec.pointValue);
      const notional = calculateFuturesNotional(entry, contractSpec.pointValue, contractsNum);
      const weightedExit = calculateWeightedExitPrice(futExits.map(e => ({ price: e.price, percent: e.contracts })));
      const rrRatio = calculateRR(entry, weightedExit, sl);
      const netPnl = calculateNetPnL(pnl, fees);
      // Net, exactly as computeTradeFields saves it — see the note below.
      const pnlPercent = notional ? (netPnl / notional) * 100 : 0;
      return { pnl, pnlPercent, rrRatio, netPnl };
    }

    const allExits = form.additionalExits
      .filter(e => parseFloat(e.price) > 0 && parseFloat(e.percent) > 0)
      .map(e => ({ price: parseFloat(e.price), percent: parseFloat(e.percent) }));

    if (!calculatedQty) return null;
    if (!allExits.length) return null;

    // For exchange-imported trades, trust the exchange-reported P&L (quantity may be in contracts, not base asset)
    const isImported = form.pnlFromExchange != null;
    const pnl = isImported
      ? form.pnlFromExchange
      : calculatePartialPnL(form.direction, entry, allExits, calculatedQty);
    const weightedExit = calculateWeightedExitPrice(allExits);
    const rrRatio = calculateRR(entry, weightedExit, sl);
    const netPnl = calculateNetPnL(pnl, fees);
    // This live figure MUST use the same inputs computeTradeFields will use on
    // save — net P&L, not gross — or the user reads one return in the form and
    // a different one on the card a second later. For an imported trade the
    // stored percent was preferred here instead; that is now the same number
    // (both paths are netPnl / (entry × qty) × leverage) except when the fees
    // field is edited, and there the stored one is the stale one.
    const pnlPercent = calculatePnLPercent(netPnl, entry, calculatedQty, form.leverage);

    return { pnl, pnlPercent, rrRatio, netPnl };
  }, [form.direction, form.entryPrice, form.additionalExits, form.stopLoss, calculatedQty, form.fees,
      form.leverage, form.pnlFromExchange, isFutures, contractSpec, contractsNum]);

  // Risk warning
  const riskInfo = useMemo(() => {
    if (!form.riskAmount) return null;
    const risk = parseFloat(form.riskAmount);
    if (!risk || risk <= 0) return null;
    const { riskType, riskValue, currentBalance } = riskSettings || {};
    if (currentBalance > 0) {
      const riskPercent = (risk / currentBalance) * 100;
      const exceeds = riskType === 'percent' && riskValue > 0 && riskPercent > riskValue;
      const critical = exceeds && riskPercent > riskValue * 2;
      return {
        message: exceeds
          ? `סיכון ${riskPercent.toFixed(1)}% מהתיק — חורג מהמגבלה (${riskValue}%)`
          : `סיכון ${riskPercent.toFixed(1)}% מהתיק`,
        severity: critical ? 'critical' : exceeds ? 'warning' : 'info',
      };
    }
    if (riskType === 'fixed' && riskValue > 0 && risk > riskValue) {
      return {
        message: `סיכון $${risk.toFixed(2)} — חורג מהמגבלה ($${riskValue})`,
        severity: risk > riskValue * 2 ? 'critical' : 'warning',
      };
    }
    return null;
  }, [form.riskAmount, riskSettings]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const entryPrice = parseFloat(form.entryPrice);
    const sl = parseFloat(form.stopLoss);
    // Futures are sized in contracts; the notional (price × pointValue ×
    // contracts) plays the role of position size. Crypto keeps risk/size.
    const ps = isFutures
      ? calculateFuturesNotional(entryPrice, contractSpec?.pointValue, contractsNum)
      : effectivePositionSize;

    if (!entryPrice || entryPrice <= 0) {
      toast.error('נא להזין מחיר כניסה');
      return;
    }
    if (isFutures) {
      if (!contractSpec) {
        toast.error('נא לבחור חוזה');
        return;
      }
      if (!contractsNum || contractsNum <= 0) {
        toast.error('נא להזין מספר חוזים');
        return;
      }
    } else if (!ps || ps <= 0) {
      toast.error('נא להזין סיכון או גודל עסקה');
      return;
    }

    // SL validation based on direction
    if (sl && entryPrice) {
      if (form.direction === 'long' && sl >= entryPrice) {
        toast.error('סטופ לוס חייב להיות מתחת למחיר הכניסה בלונג');
        return;
      }
      if (form.direction === 'short' && sl <= entryPrice) {
        toast.error('סטופ לוס חייב להיות מעל מחיר הכניסה בשורט');
        return;
      }
    }

    // Build exits array from additional exits (validate before setSaving).
    // Futures exits carry an exact contract count AND a derived percent (so
    // status/weighted-price code that reads `percent` keeps working); crypto
    // exits carry just a percent.
    let validAdditional;
    if (isFutures) {
      validAdditional = form.additionalExits
        .filter(e => parseFloat(e.price) > 0 && parseFloat(e.contracts) > 0)
        .map(e => {
          const c = parseFloat(e.contracts);
          return { price: parseFloat(e.price), contracts: c, percent: contractsNum > 0 ? (c / contractsNum) * 100 : 0 };
        });
      const sumContracts = validAdditional.reduce((s, e) => s + e.contracts, 0);
      if (sumContracts > contractsNum) {
        toast.error('סך החוזים ביציאות חורג ממספר החוזים בעסקה');
        return;
      }
    } else {
      validAdditional = form.additionalExits
        .filter(e => parseFloat(e.price) > 0 && parseFloat(e.percent) > 0)
        .map(e => ({ price: parseFloat(e.price), percent: parseFloat(e.percent) }));
      const additionalPercent = validAdditional.reduce((s, e) => s + e.percent, 0);
      // Small tolerance: exchange-synced Multi-TP slices are rounded to two
      // decimals, so a legitimate full close can sum to 100.01 — blocking on
      // a strict >100 made those trades impossible to save after editing.
      if (additionalPercent > 100.05) {
        toast.error('סך אחוזי היציאות חורג מ-100%');
        return;
      }
    }

    // Future-date guard — prevents the equity curve and drawdown stats from
    // including events that haven't happened yet
    const now = new Date();
    const entryD = parseDate(form.entryDate);
    const exitD = parseDate(form.exitDate);
    if (entryD && entryD > now) {
      toast.error('תאריך הכניסה לא יכול להיות בעתיד');
      return;
    }
    if (exitD && exitD > now) {
      toast.error('תאריך היציאה לא יכול להיות בעתיד');
      return;
    }
    if (entryD && exitD && exitD < entryD) {
      toast.error('תאריך היציאה חייב להיות אחרי תאריך הכניסה');
      return;
    }

    setSaving(true);
    try {
      const finalPair = form.pair;
      const finalStrategy = form.strategy;
      const finalTimeframe = form.timeframe;
      const finalTrigger = form.trigger;
      // Futures: quantity is the contract count (satisfies the >0 rule and is
      // the meaningful unit); leverage is fixed at 1 (margin is exchange-set).
      const quantity = isFutures ? contractsNum : ps / entryPrice;
      // Match ImportTrades' clamp range (1–200x) so manual entry can't produce
      // out-of-range values that break downstream stats.
      const leverage = isFutures ? 1 : Math.min(200, Math.max(1, parseInt(form.leverage) || 1));

      const allExits = validAdditional;
      // Closed when the whole position is out. For futures compare contracts
      // (exact); for crypto compare the percent sum — with a small rounding
      // tolerance (33.33×3 = 99.99 is a FULL close, and treating it as
      // 'partial' silently dropped the trade from the analytics).
      const fullyClosed = isFutures
        ? allExits.reduce((s, e) => s + e.contracts, 0) >= contractsNum
        : allExits.reduce((s, e) => s + e.percent, 0) >= 99.95;
      // resolveExitState, not an inline rule: a trade can be closed with NO
      // exit price, and demoting it on an empty exit list destroyed real P&L.
      // See src/utils/exitState.js.
      const { status, exitPrice } = resolveExitState({
        prevStatus: trade?.status,
        prevExitPrice: trade?.exitPrice,
        weightedExit: calculateWeightedExitPrice(allExits),
        exitCount: allExits.length,
        fullyClosed,
      });

      // Planned targets (no exit recorded yet): price set but no %/contracts.
      const tpsOnly = form.additionalExits
        .filter(e => parseFloat(e.price) > 0 && !(isFutures ? parseFloat(e.contracts) : parseFloat(e.percent)))
        .map(e => parseFloat(e.price));

      const data = {
        pair: finalPair,
        direction: form.direction,
        orderType: form.orderType || 'market',
        marketType: 'futures',
        strategy: finalStrategy,
        timeframe: finalTimeframe,
        trigger: finalTrigger,
        status,
        entryPrice,
        exitPrice,
        tps: tpsOnly,
        exits: allExits.length ? allExits : null,
        stopLoss: sl || 0,
        // The first-recorded stop. Set once on create and preserved on every
        // edit, so the UI can show "New Stop" while keeping the original.
        originalStopLoss: trade
          ? (trade.originalStopLoss ?? trade.stopLoss ?? (sl || 0))
          : (sl || 0),
        takeProfit: 0,
        quantity,
        positionSize: ps,
        riskAmount: parseFloat(form.riskAmount) || 0,
        leverage,
        fees: parseFloat(form.fees) || 0,
        tags: form.tags || [],
        entryDate: form.entryDate || new Date(),
        exitDate: form.exitDate || null,
        entryReason: form.entryReason,
        notes: form.notes,
        emotionBefore: form.emotionBefore,
        emotionAfter: form.emotionAfter,
        mistakes: form.mistakes,
        session: form.session || '',
        tradingViewUrl: form.tradingViewUrl?.trim() || '',
        // Preserve original source — don't overwrite exchange trades with 'manual'
        source: trade?.source || 'manual',
        focusRating: form.focusRating,
        planAdherenceRating: form.planAdherenceRating,
        stressRating: form.stressRating,
        confidenceRating: form.confidenceRating,
        // Asset class + contract spec (CME futures). Crypto trades carry
        // assetClass:'crypto' and no contract block.
        assetClass: form.assetClass,
        ...(isFutures && contractSpec ? {
          contract: {
            symbol: contractSpec.symbol,
            pointValue: contractSpec.pointValue,
            tickSize: contractSpec.tickSize,
            contracts: contractsNum,
          },
        } : {}),
        // Preserve exchange-specific fields so PnL stays accurate after editing
        ...(trade?.pnlFromExchange != null ? { pnlFromExchange: trade.pnlFromExchange } : {}),
        ...(trade?.externalId ? { externalId: trade.externalId } : {}),
      };
      await onSave(data);
      onClose();
    } catch (err) {
      console.error('Save failed:', err);
      const msg = err.code === 'permission-denied' ? 'אין הרשאה לשמור' : 'שגיאה בשמירת העסקה — נסה שוב';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const pnlColor = (val) => (val > 0 ? 'text-profit' : val < 0 ? 'text-loss' : 'text-breakeven');
  const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right';
  const labelClass = 'block text-xs text-text-muted mb-1';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={trade ? 'עריכת עסקה' : 'עסקה חדשה'} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit}>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-bg-tertiary rounded-xl mb-4">
          {TABS.map(tab => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Trade tab */}
        <div className={`space-y-2 ${activeTab !== 'trade' ? 'hidden' : ''}`}>

            {/* Asset class is inherited from the journal — no per-trade toggle. */}

            {/* Status header — only when editing */}
            {trade && (() => {
              const statusCfg = {
                limit:   { icon: Clock,         color: 'text-text-muted',    bg: 'bg-bg-tertiary',       border: 'border-border-primary/50', dot: 'bg-text-muted',    label: 'ממתין לכניסה' },
                open:    { icon: CircleDot,     color: 'text-accent-primary', bg: 'bg-accent-primary/8', border: 'border-accent-primary/20', dot: 'bg-accent-primary animate-pulse', label: 'עסקה פתוחה' },
                partial: { icon: CircleDot,     color: 'text-breakeven',     bg: 'bg-breakeven/8',       border: 'border-breakeven/20',      dot: 'bg-breakeven animate-pulse',      label: `${additionalExitsPercent.toFixed(0)}% נסגר` },
                closed:  { icon: CheckCircle2,  color: calc?.netPnl > 0 ? 'text-profit' : 'text-loss', bg: calc?.netPnl > 0 ? 'bg-profit/8' : 'bg-loss/8', border: calc?.netPnl > 0 ? 'border-profit/20' : 'border-loss/20', dot: calc?.netPnl > 0 ? 'bg-profit' : 'bg-loss', label: 'נסגרה' },
              };
              const cfg = statusCfg[currentStatus];
              const Icon = cfg.icon;
              return (
                <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${cfg.bg} ${cfg.border} mb-1`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  {calc && (
                    <div className="flex items-center gap-2.5">
                      <span className={`text-sm font-bold ${pnlColor(calc.netPnl)}`}>{formatCurrency(calc.netPnl)}</span>
                      <span className={`text-xs font-semibold ${pnlColor(calc.pnlPercent)}`}>{formatPercent(calc.pnlPercent)}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded bg-bg-tertiary ${pnlColor(calc.netPnl)}`}>{formatRR(calc.rrRatio, calc.netPnl)}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-2">
              {isFutures ? (
                <SelectDropdown
                  label="חוזה"
                  value={form.pair}
                  onChange={(sym) => update('pair', sym)}
                  options={FUTURES_CONTRACTS.map((c) => ({ value: c.symbol, label: `${c.symbol} — ${c.name}` }))}
                  placeholder="בחר חוזה..."
                />
              ) : (
                <PairSearch
                  value={form.pair}
                  onChange={(pair) => update('pair', pair || 'BTCUSDT')}
                />
              )}
              <StrategySelector
                label="אסטרטגיה"
                value={form.strategy}
                onChange={(s) => update('strategy', s)}
                strategies={allStrategies}
                onAdd={addStrategy}
                onRemove={removeStrategy}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <TimeframeSelector
                label="טווח זמן"
                value={form.timeframe}
                onChange={(tf) => update('timeframe', tf)}
                timeframes={allTimeframes}
                onAdd={addTimeframe}
                onRemove={removeTimeframe}
              />
              <StrategySelector
                label="טריגר כניסה"
                value={form.trigger}
                onChange={(t) => update('trigger', t)}
                strategies={allTriggers}
                onAdd={addTrigger}
                onRemove={removeTrigger}
                addLabel="טריגר מותאם"
                inputPlaceholder="שם טריגר..."
                emptyText="אין טריגרים"
                placeholder="בחר טריגר..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>כיוון</label>
                <div className="flex gap-1">
                  {['long', 'short'].map((d) => (
                    <button key={d} type="button" onClick={() => update('direction', d)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        form.direction === d
                          ? d === 'long' ? 'bg-long/15 text-long border border-long/30' : 'bg-short/15 text-short border border-short/30'
                          : 'bg-bg-tertiary text-text-muted border border-transparent'
                      }`}>
                      {d === 'long' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {d === 'long' ? 'Long' : 'Short'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>סוג פקודה</label>
                <div className="flex gap-1">
                  {[{ v: 'market', l: 'Market' }, { v: 'limit', l: 'Limit' }].map(({ v, l }) => (
                    <button key={v} type="button" onClick={() => update('orderType', v)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                        form.orderType === v
                          ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30'
                          : 'bg-bg-tertiary text-text-muted border border-transparent'
                      }`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>מחיר כניסה</label>
                <input type="number" step="any" value={form.entryPrice} onChange={(e) => update('entryPrice', e.target.value)} className={inputClass} placeholder="0.00" inputMode="decimal" />
              </div>
              <div>
                <label className={labelClass}>סטופ לוס</label>
                <input type="number" step="any" value={form.stopLoss} onChange={(e) => update('stopLoss', e.target.value)} className={inputClass} placeholder="0.00" inputMode="decimal" />
                {trade?.liquidationPrice > 0 && (
                  <p className="text-[10px] text-loss/80 mt-1">
                    ליקווידציה: {parseFloat(trade.liquidationPrice).toLocaleString('en-US', { maximumFractionDigits: 8 })}
                  </p>
                )}
              </div>
            </div>

            {/* Take Profit */}
            <div className="rounded-xl border border-profit/20 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 bg-profit/5 border-b border-profit/15">
                <span className="text-xs font-semibold text-profit/90">Take Profit</span>
                {additionalExitsPercent > 0 && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    additionalExitsPercent > 100 ? 'bg-loss/20 text-loss' :
                    additionalExitsPercent === 100 ? 'bg-profit/20 text-profit' :
                    'bg-breakeven/15 text-breakeven'
                  }`}>
                    {additionalExitsPercent > 100
                      ? `${additionalExitsPercent.toFixed(0)}% — חורג מ-100%`
                      : `${additionalExitsPercent.toFixed(0)}% נסגר`}
                  </span>
                )}
              </div>

              {form.additionalExits.map((exit, i) => {
                // Futures exits are recorded in contracts; crypto in percent.
                const exitField = isFutures ? 'contracts' : 'percent';
                const isExecuted = parseFloat(exit[exitField]) > 0;
                const otherUsed = form.additionalExits.reduce((s, e, idx) => idx !== i ? s + (parseFloat(e[exitField]) || 0) : s, 0);
                const suggested = isFutures
                  ? Math.max(0, contractsNum - otherUsed)
                  : Math.max(0, 100 - otherUsed);
                return (
                  <div key={i} className={`relative flex items-center gap-2 px-3 py-2.5 border-b border-border-primary/20 last:border-b-0 transition-all duration-200 ${isExecuted ? 'bg-profit/5' : ''}`}>
                    {/* Executed accent bar */}
                    <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-r transition-all duration-300 ${isExecuted ? 'bg-profit' : 'bg-transparent'}`} />

                    <span className={`text-[11px] font-bold w-8 shrink-0 text-right transition-colors ${isExecuted ? 'text-profit' : 'text-profit/50'}`}>
                      TP{i + 1}
                    </span>

                    <input
                      type="number" step="any"
                      value={exit.price}
                      onChange={(e) => updateAdditionalExit(i, 'price', e.target.value)}
                      className={`flex-1 min-w-0 bg-transparent text-sm outline-none text-right transition-colors placeholder-text-muted/40 ${isExecuted ? 'text-text-primary font-medium' : 'text-text-primary'}`}
                      placeholder="מחיר יעד"
                      inputMode="decimal"
                    />

                    {/* contracts (futures) / % (crypto) field */}
                    <div className={`flex items-center gap-0.5 ${isFutures ? 'w-20' : 'w-16'} shrink-0 rounded-lg px-2 py-1 transition-all border ${
                      isExecuted ? 'bg-profit/10 border-profit/25' : 'bg-bg-tertiary/60 border-border-primary/30'
                    }`}>
                      <input
                        // Percent must allow decimals (exchange-synced trades
                        // arrive with e.g. 12.5%) — the number input's default
                        // step=1 makes the browser reject them and silently
                        // block form submit. Futures stay whole contracts.
                        type="number" step={isFutures ? '1' : 'any'}
                        min={isFutures ? '1' : '0.01'} max={isFutures ? contractsNum || undefined : 100}
                        value={exit[exitField] ?? ''}
                        onChange={(e) => updateAdditionalExit(i, exitField, e.target.value)}
                        className={`w-full bg-transparent text-xs outline-none text-right font-semibold ${isExecuted ? 'text-profit' : 'text-text-muted'}`}
                        placeholder="—"
                        inputMode={isFutures ? 'numeric' : 'decimal'}
                      />
                      <span className={`text-[10px] shrink-0 ${isExecuted ? 'text-profit/60' : 'text-text-muted/40'}`}>{isFutures ? 'ח׳' : '%'}</span>
                    </div>

                    {/* Mark as executed button */}
                    <button
                      type="button"
                      onClick={() => updateAdditionalExit(i, exitField, isExecuted ? '' : String(suggested))}
                      className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer border ${
                        isExecuted
                          ? 'bg-profit/20 text-profit border-profit/30 hover:bg-loss/10 hover:text-loss hover:border-loss/30'
                          : 'bg-bg-tertiary text-text-muted border-border-primary/40 hover:border-profit/40 hover:text-profit'
                      }`}
                    >
                      {isExecuted ? <><Check className="w-3 h-3" />בוצע</> : 'סמן'}
                    </button>

                    <button type="button" onClick={() => removeAdditionalExit(i)}
                      className="p-1 text-text-muted/40 hover:text-loss transition-colors cursor-pointer shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              <button type="button" onClick={addAdditionalExit}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-text-muted hover:text-profit hover:bg-profit/5 transition-all cursor-pointer">
                <Plus className="w-3 h-3" /> הוסף TP
              </button>
            </div>
            {isFutures ? (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelClass}>מספר חוזים</label>
                  <NumberStepper value={form.contracts} onChange={(v) => update('contracts', v)} min={1} placeholder="1" />
                </div>
                <div>
                  <label className={labelClass}>ערך נקודה</label>
                  <input type="text" value={contractSpec ? `$${contractSpec.pointValue}` : '—'} readOnly tabIndex={-1} className={inputClass + ' opacity-70 cursor-default'} />
                </div>
                <div>
                  <label className={labelClass}>עמלות ($)</label>
                  <input type="number" step="any" value={form.fees} onChange={(e) => update('fees', e.target.value)} className={inputClass} placeholder="0.00" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelClass}>סיכון ($)</label>
                  <input type="number" step="any" value={form.riskAmount} onChange={(e) => update('riskAmount', e.target.value)} className={inputClass} placeholder="50" inputMode="decimal" />
                </div>
                <div>
                  <label className={labelClass}>מינוף</label>
                  <input type="number" value={form.leverage} onChange={(e) => update('leverage', e.target.value)} className={inputClass} inputMode="numeric" />
                </div>
                <div>
                  <label className={labelClass}>עמלות (USDT)</label>
                  <input type="number" step="any" value={form.fees} onChange={(e) => update('fees', e.target.value)} className={inputClass} placeholder="0.00" />
                </div>
              </div>
            )}

            {riskInfo && (
              <div className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${
                riskInfo.severity === 'critical'
                  ? 'bg-loss/10 border-loss/30 text-loss'
                  : riskInfo.severity === 'warning'
                    ? 'bg-breakeven/10 border-breakeven/30 text-breakeven'
                    : 'bg-accent-primary/10 border-accent-primary/30 text-accent-primary'
              }`}>
                {riskInfo.severity === 'info'
                  ? <Percent className="w-4 h-4 shrink-0" />
                  : riskInfo.severity === 'critical'
                    ? <ShieldAlert className="w-4 h-4 shrink-0" />
                    : <AlertTriangle className="w-4 h-4 shrink-0" />}
                <span>{riskInfo.message}</span>
              </div>
            )}

            {/* Calculated values */}
            {isFutures ? (
              (contractSpec && contractsNum > 0 && parseFloat(form.entryPrice) > 0) && (
                <div className="bg-bg-tertiary rounded-lg p-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
                  <div><span className="text-text-muted">נומינלי: </span><span className="text-accent-primary font-semibold">${calculateFuturesNotional(parseFloat(form.entryPrice), contractSpec.pointValue, contractsNum).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span></div>
                  <div><span className="text-text-muted">ערך נקודה: </span><span className="text-text-primary font-medium">${contractSpec.pointValue}</span></div>
                  <div><span className="text-text-muted">חוזים: </span><span className="text-text-primary font-medium">{contractsNum}</span></div>
                </div>
              )
            ) : (
              (effectivePositionSize > 0 || calculatedMargin || calculatedQty > 0) && (
                <div className="bg-bg-tertiary rounded-lg p-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
                  {effectivePositionSize > 0 && (
                    <div><span className="text-text-muted">גודל: </span><span className="text-accent-primary font-semibold">${effectivePositionSize.toFixed(2)}</span></div>
                  )}
                  {calculatedMargin != null && (
                    <div><span className="text-text-muted">מרג׳ין: </span><span className="text-text-primary font-medium">${calculatedMargin.toFixed(2)}</span></div>
                  )}
                  {calculatedQty > 0 && (
                    <div><span className="text-text-muted">כמות: </span><span className="text-text-primary font-medium">{calculatedQty.toFixed(6)}</span></div>
                  )}
                </div>
              )
            )}

            {calc && !trade && (
              <div className="bg-bg-tertiary rounded-lg p-2 grid grid-cols-4 gap-2">
                <div>
                  <span className="text-[10px] text-text-muted block">PnL</span>
                  <span className={`text-xs font-bold ${pnlColor(calc.pnl)}`}>{formatCurrency(calc.pnl)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block">PnL %</span>
                  <span className={`text-xs font-bold ${pnlColor(calc.pnlPercent)}`}>{formatPercent(calc.pnlPercent)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block">R:R</span>
                  <span className={`text-xs font-bold ${pnlColor(calc.pnl)}`}>{formatRR(calc.rrRatio, calc.pnl)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block">נטו</span>
                  <span className={`text-xs font-bold ${pnlColor(calc.netPnl)}`}>{formatCurrency(calc.netPnl)}</span>
                </div>
              </div>
            )}


          </div>

        {/* Mental tab */}
        <div className={`space-y-3 ${activeTab !== 'mental' ? 'hidden' : ''}`}>

          {/* Tags + Mistakes — top */}
          <div className="grid grid-cols-2 gap-2">
            <MultiSelector label="תגיות" values={form.tags} onChange={(arr) => update('tags', arr)}
              options={allTags} labels={TAG_LABELS} onAdd={addTag} onRemove={removeTag}
              addLabel="תגית מותאמת" inputPlaceholder="שם תגית..." emptyText="אין תגיות"
              placeholder="בחר תגיות..." chipClass="bg-accent-primary text-black" />
            <MultiSelector label="טעויות" values={form.mistakes} onChange={(arr) => update('mistakes', arr)}
              options={allMistakes} labels={MISTAKE_LABELS} onAdd={addMistake} onRemove={removeMistake}
              addLabel="טעות מותאמת" inputPlaceholder="שם טעות..." emptyText="אין טעויות"
              placeholder="בחר טעויות..." chipClass="bg-loss text-white" />
          </div>

          {/* Entry reason + Notes */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>סיבת כניסה</label>
              <textarea value={form.entryReason} onChange={(e) => update('entryReason', e.target.value)}
                className={`${inputClass} h-24 resize-none`} placeholder="למה נכנסת לעסקה הזו?" />
            </div>
            <div>
              <label className={labelClass}>{currentStatus === 'closed' ? 'הערות ולקחים' : 'הערות'}</label>
              <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)}
                className={`${inputClass} h-24 resize-none`} placeholder={currentStatus === 'closed' ? 'מה למדת מהעסקה הזו?' : 'הערות נוספות...'} />
            </div>
          </div>

          {/* Mental ratings — compact 2-col */}
          <div className="bg-bg-tertiary rounded-xl p-3 grid grid-cols-2 gap-x-4 gap-y-2">
            {MENTAL_RATINGS.map((rating) => {
              const val = form[rating.key];
              const color = RATING_COLORS[rating.invert ? 5 - val : val - 1] || 'text-text-muted';
              const Icon = rating.Icon;
              return (
                <div key={rating.key}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] text-text-secondary">{rating.label}</span>
                    <span className={`flex items-center gap-1 text-[11px] font-semibold ${color}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {val}/5
                    </span>
                  </div>
                  <input type="range" min="1" max="5" value={val}
                    onChange={(e) => update(rating.key, parseInt(e.target.value))} className="w-full" />
                </div>
              );
            })}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>תאריך כניסה</label>
              <DatePicker selected={form.entryDate} onChange={(date) => update('entryDate', date)}
                showTimeSelect timeFormat="HH:mm" timeIntervals={15} dateFormat="dd/MM/yyyy HH:mm"
                maxDate={new Date()}
                locale="he" placeholderText="בחר תאריך..." className={inputClass} wrapperClassName="w-full"
                popperPlacement="bottom-start" portalId="datepicker-portal" />
            </div>
            <div>
              <label className={labelClass}>תאריך סגירה</label>
              <DatePicker selected={form.exitDate} onChange={(date) => update('exitDate', date)}
                showTimeSelect timeFormat="HH:mm" timeIntervals={15} dateFormat="dd/MM/yyyy HH:mm"
                maxDate={new Date()}
                minDate={form.entryDate || undefined}
                locale="he" placeholderText="בחר תאריך..." className={inputClass} wrapperClassName="w-full"
                popperPlacement="bottom-start" portalId="datepicker-portal" />
            </div>
          </div>

          {/* Session */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className={labelClass + ' !mb-0'}>סשן</label>
              {form.session && <span className="text-[10px] text-accent-primary">מתמלא אוטומטית</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SESSIONS.map((s) => (
                <button key={s} type="button" onClick={() => { sessionManuallySet.current = true; update('session', s); }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
                    form.session === s ? getSessionClasses(s) : 'bg-bg-tertiary text-text-muted border-transparent'
                  }`}>{s}</button>
              ))}
            </div>
          </div>

          {/* TradingView */}
          <div>
            <label className={labelClass}>קישור TradingView</label>
            <input type="url" value={form.tradingViewUrl} onChange={(e) => update('tradingViewUrl', e.target.value)}
              className={inputClass} placeholder="https://www.tradingview.com/x/..." />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-bg-tertiary text-text-primary hover:bg-border-hover transition-colors cursor-pointer">
            ביטול
          </button>
          <button type="submit" disabled={saving || additionalExitsPercent > 100}
            title={additionalExitsPercent > 100 ? 'סך אחוזי היציאות חורג מ-100%' : undefined}
            className="flex-1 py-2.5 rounded-lg bg-accent-primary text-black font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'שומר...' : trade ? 'עדכן עסקה' : 'שמור עסקה'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
