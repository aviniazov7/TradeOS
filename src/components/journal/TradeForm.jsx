import { useState, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import DatePicker, { registerLocale } from 'react-datepicker';
import { he } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';
import { X, Plus, AlertTriangle, ShieldAlert, Percent, TrendingUp, TrendingDown, Check, Clock, CircleDot, CheckCircle2, Target, ClipboardCheck, Gauge, ShieldCheck, Layers, Calculator } from 'lucide-react';
import Modal from '../shared/Modal';
import PairSearch from './PairSearch';
import StockSearch from '../stocks/StockSearch';
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
import { useTradingPlans } from '../../hooks/useTradingPlans';
import { useJournalContext } from '../../contexts/JournalContext';
import {
  aggregateFills, exitsClosedPercent, hasCommissionPreset, estimateCommission,
  buildChecklistRows, checklistAdherence, loadLastTradeChoices, saveLastTradeChoices,
  canMoveStopToBreakeven, breakevenStopValue,
} from '../../utils/tradeFormHelpers';
import { calculatePnLPercent, calculateRR, calculateNetPnL, calculatePartialPnL, calculateWeightedExitPrice, calculateFuturesContractsPnL, calculateFuturesNotional, initialStopLoss, isClosedTrade, safePnl } from '../../utils/calculations';
import { getSessionFromDate } from '../../utils/sessions';
import { formatCurrency, formatPercent, formatRR } from '../../utils/formatters';

registerLocale('he', he);

const defaultForm = {
  assetClass: 'crypto',
  pair: 'BTCUSDT',
  contracts: '1',
  shares: '',
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
  // Scale-ins AFTER the first fill: [{ price, size, date }]. size is in the
  // trade's own unit (crypto units / shares / contracts). The first fill is
  // the regular entry price + size fields.
  scaleIns: [],
  // Trading-plan link + pre-entry checklist rows [{ item, done }].
  planId: '',
  checklist: [],
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
  const newTradeAssetClass = ['futures_cme', 'stocks'].includes(journalAssetClass) ? journalAssetClass : 'crypto';
  const { allStrategies, addStrategy, removeStrategy } = useUserStrategies('journal');
  const { allTimeframes, addTimeframe, removeTimeframe } = useUserTimeframes();
  const { allTriggers, addTrigger, removeTrigger } = useUserTriggers();
  const { allTags, addTag, removeTag } = useUserTags();
  const { allMistakes, addMistake, removeMistake } = useUserMistakes();
  const { plans } = useTradingPlans();
  const { activeJournal, activeJournalId } = useJournalContext();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  // Fees follow the journal's commission preset until the user types a fee.
  // New trades start in auto mode; an existing trade keeps its stored fees
  // (often the exchange's real figure) unless the preset is re-applied.
  const [feesAuto, setFeesAuto] = useState(true);
  // Editing an existing trade keeps its stored size (units). The risk-based
  // auto-size (risk x entry / |entry - stop|) only runs on create, or after the
  // user explicitly retypes the risk — otherwise moving the stop on edit
  // silently rescaled the position and rewrote its P&L (risk $100, entry 100:
  // stop 90 -> 10 units, move the stop to 95 -> 20 units).
  const [lockedQty, setLockedQty] = useState(0);
  const sessionManuallySet = useRef(false);
  const [activeTab, setActiveTab] = useState('trade');
  const livePricesRef = useRef(livePrices);
  useEffect(() => { livePricesRef.current = livePrices; });
  useEffect(() => {
    if (trade) {
      // Scale-in trades store every fill in `entries` while entryPrice /
      // quantity hold the aggregate. The editor shows the FIRST fill in the
      // regular entry/size fields and the rest as scale-in rows.
      const fills = Array.isArray(trade.entries) && trade.entries.length > 1
        && trade.entries.every((e) => parseFloat(e?.price) > 0 && parseFloat(e?.quantity) > 0)
        ? trade.entries : null;
      const baseFill = fills ? fills[0] : null;
      const ps = baseFill
        ? parseFloat(baseFill.price) * parseFloat(baseFill.quantity)
        : trade.positionSize || (trade.entryPrice && trade.quantity ? trade.entryPrice * trade.quantity : '');
      let derivedRisk = trade.riskAmount ?? '';
      // Risk is defined by the ORIGINAL stop — a stop already trailed to
      // breakeven would otherwise derive a risk of ~0.
      const riskStop = initialStopLoss(trade);
      const firstEntry = baseFill ? parseFloat(baseFill.price) : parseFloat(trade.entryPrice);
      if (!derivedRisk && ps && firstEntry && riskStop) {
        const qty = parseFloat(ps) / firstEntry;
        derivedRisk = (qty * Math.abs(firstEntry - riskStop)).toFixed(2);
      }
      const storedQty = baseFill
        ? parseFloat(baseFill.quantity)
        : parseFloat(trade.quantity) > 0
          ? parseFloat(trade.quantity)
          : (parseFloat(ps) > 0 && parseFloat(trade.entryPrice) > 0 ? parseFloat(ps) / parseFloat(trade.entryPrice) : 0);
      // Futures size in contracts and stocks in shares (both loaded below), so
      // only the risk-sized crypto path needs the lock.
      setLockedQty(['futures_cme', 'stocks'].includes(trade.assetClass) ? 0 : storedQty);

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
        // Stocks are sized in shares; the stored quantity IS the share count
        // (the first fill's, for a scale-in trade).
        shares: trade.assetClass === 'stocks' && storedQty ? String(+Number(storedQty).toFixed(6)) : '',
        contracts: baseFill && isFuturesTrade
          ? String(parseInt(baseFill.quantity) || 1)
          : trade.contract?.contracts != null ? String(trade.contract.contracts) : '1',
        pair: trade.pair || trade.symbol || 'BTCUSDT',
        orderType: trade.orderType || 'market',
        strategy: trade.strategy || '',
        timeframe: trade.timeframe || '4H',
        customTimeframe: '',
        entryPrice: baseFill ? String(baseFill.price) : (trade.entryPrice ?? ''),
        exitPrice: '',
        additionalExits: loadedAdditionalExits,
        scaleIns: fills
          ? fills.slice(1).map((e) => ({ price: String(e.price), size: String(+Number(e.quantity).toFixed(8)), date: parseDate(e.date) }))
          : [],
        planId: trade.planId || '',
        checklist: Array.isArray(trade.checklist) ? trade.checklist : [],
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
      setFeesAuto(false);
    } else {
      setLockedQty(0);
      // New trade: seed the asset class from the user's profile preference and
      // pick a sensible default symbol for it. Strategy / timeframe / trigger
      // start from the last ones used in THIS journal.
      const last = loadLastTradeChoices(activeJournalId);
      setForm({
        ...defaultForm,
        assetClass: newTradeAssetClass,
        pair: newTradeAssetClass === 'futures_cme' ? 'ES' : newTradeAssetClass === 'stocks' ? 'AAPL' : 'BTCUSDT',
        strategy: last?.strategy || '',
        timeframe: last?.timeframe || defaultForm.timeframe,
        trigger: last?.trigger || '',
      });
      setFeesAuto(true);
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
  // Stocks: plain cash equity — size in shares, no leverage, dollar fees.
  const isStocks = form.assetClass === 'stocks';
  const sharesNum = parseFloat(form.shares) || 0;

  // Futures total = first fill + scale-in contracts; computed from a form
  // snapshot so the exit handlers below can use it inside setForm updaters.
  const totalContractsOf = (f) => (parseInt(f.contracts) || 0)
    + (f.scaleIns || []).reduce((s, a) => s + (parseFloat(a.price) > 0 ? (parseInt(a.size) || 0) : 0), 0);

  // Exit edits go through here so a change that closes the whole position
  // stamps the exit date (when it is still empty). Only the TRANSITION to
  // closed counts — loading an already-closed trade never rewrites its date.
  const setExits = (mutate) => {
    setForm((f) => {
      const additionalExits = mutate(f.additionalExits);
      const opts = { isFutures: f.assetClass === 'futures_cme', totalContracts: totalContractsOf(f) };
      const closesNow = exitsClosedPercent(f.additionalExits, opts) < 99.95
        && exitsClosedPercent(additionalExits, opts) >= 99.95;
      return { ...f, additionalExits, ...(closesNow && !f.exitDate ? { exitDate: new Date() } : {}) };
    });
  };

  const addAdditionalExit = () => {
    setExits((exits) => [...exits, { price: '', percent: '', contracts: '' }]);
  };

  const removeAdditionalExit = (index) => {
    setExits((exits) => exits.filter((_, i) => i !== index));
  };

  const updateAdditionalExit = (index, field, value) => {
    setExits((exits) => exits.map((e, i) => (i === index ? { ...e, [field]: value } : e)));
  };

  // Scale-in rows (fills after the first entry).
  const addScaleIn = () => setForm((f) => ({ ...f, scaleIns: [...f.scaleIns, { price: '', size: '', date: null }] }));
  const removeScaleIn = (index) => setForm((f) => ({ ...f, scaleIns: f.scaleIns.filter((_, i) => i !== index) }));
  const updateScaleIn = (index, field, value) => setForm((f) => ({
    ...f,
    scaleIns: f.scaleIns.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
  }));

  // The stop that defines the trade's risk: on edit, the ORIGINAL stop (the
  // current one may be trailed to breakeven or into profit); on create, the
  // stop being typed.
  const riskStopLoss = useMemo(() => {
    if (trade) {
      const orig = initialStopLoss({ ...trade, direction: form.direction, entryPrice: form.entryPrice });
      if (orig > 0) return orig;
    }
    return parseFloat(form.stopLoss) || 0;
  }, [trade, form.direction, form.entryPrice, form.stopLoss]);

  // Auto-calculate position size from risk amount (create, or explicit risk edit)
  const autoPositionSize = useMemo(() => {
    const entry = parseFloat(form.entryPrice);
    const sl = riskStopLoss;
    const risk = parseFloat(form.riskAmount);
    if (!entry || !sl || !risk || entry === sl) return null;
    const distance = Math.abs(entry - sl);
    return (risk * entry) / distance;
  }, [form.entryPrice, riskStopLoss, form.riskAmount]);

  // Use the stored size (edit), the share count (stocks), or the risk-derived
  // size — in that order. This is the FIRST fill only.
  const entryNum = parseFloat(form.entryPrice);
  const effectivePositionSize = (isStocks && sharesNum > 0 && entryNum > 0)
    ? sharesNum * entryNum
    : (!isStocks && lockedQty > 0 && entryNum > 0)
      ? lockedQty * entryNum
      : autoPositionSize ?? (parseFloat(form.positionSize) || 0);

  // Calculated quantity of the first fill (units / shares).
  const calculatedQty = useMemo(() => {
    const entry = parseFloat(form.entryPrice);
    if (!effectivePositionSize || !entry) return 0;
    return effectivePositionSize / entry;
  }, [effectivePositionSize, form.entryPrice]);

  // First-fill size in the trade's own unit. Edit keeps the stored units
  // exactly (no notional/entry float round-trip).
  const baseUnits = isFutures
    ? contractsNum
    : (isStocks && sharesNum > 0) ? sharesNum
      : (!isStocks && lockedQty > 0) ? lockedQty
        : calculatedQty;

  // Scale-in aggregate: size-weighted average entry + total size. With no
  // scale-ins it is exactly the first fill, so single-entry trades are
  // computed and stored precisely as before.
  const validScaleIns = useMemo(() => form.scaleIns
    .map((a) => ({
      price: parseFloat(a.price),
      quantity: isFutures ? (parseInt(a.size) || 0) : (parseFloat(a.size) || 0),
      date: a.date || null,
    }))
    .filter((a) => a.price > 0 && a.quantity > 0), [form.scaleIns, isFutures]);
  const hasScaleIns = validScaleIns.length > 0;
  const fillsAgg = useMemo(
    () => aggregateFills([{ price: entryNum, quantity: baseUnits }, ...validScaleIns]),
    [entryNum, baseUnits, validScaleIns],
  );
  const avgEntry = hasScaleIns ? fillsAgg.price : entryNum;
  const totalUnits = hasScaleIns ? fillsAgg.quantity : baseUnits;
  const totalContracts = isFutures ? totalUnits : 0;
  const totalNotional = isFutures
    ? calculateFuturesNotional(avgEntry, contractSpec?.pointValue, totalContracts)
    : (hasScaleIns ? fillsAgg.notional : effectivePositionSize);
  const sizeUnitLabel = isFutures ? 'חוזים' : isStocks ? 'מניות' : 'יח׳';

  // Calculated margin
  const calculatedMargin = useMemo(() => {
    const lev = isStocks ? 1 : (parseInt(form.leverage) || 1);
    if (!totalNotional) return null;
    return totalNotional / lev;
  }, [totalNotional, form.leverage, isStocks]);

  // Futures aggregate from contracts so a full close lands on exactly 100%
  // (summing per-exit rounded percents would drift, e.g. 3×33.33 = 99.99).
  const additionalExitsPercent = useMemo(
    () => exitsClosedPercent(form.additionalExits, { isFutures, totalContracts }),
    [form.additionalExits, isFutures, totalContracts],
  );

  // A closed broker/exchange import often has a settled P&L but NO exit rows
  // (and no exit price), so the editor loads with zero exits. Saving it
  // untouched used to flip it to 'open' and recompute its P&L to 0. While the
  // user hasn't recorded any exit, it stays closed with its stored P&L.
  const keepsImportedClose = !!trade && isClosedTrade(trade)
    && !(trade.exits?.length) && !(parseFloat(trade.exitPrice) > 0)
    && additionalExitsPercent === 0;

  const currentStatus = useMemo(() => {
    if (keepsImportedClose) return 'closed';
    if (form.orderType === 'limit' && additionalExitsPercent === 0) return 'limit';
    if (additionalExitsPercent >= 100) return 'closed';
    if (additionalExitsPercent > 0) return 'partial';
    return 'open';
  }, [form.orderType, additionalExitsPercent, keepsImportedClose]);

  // Commission preset (journal settings) → round-trip fee estimate. Exits are
  // converted to the trade's unit so stocks can price each exit order.
  const commissionPreset = activeJournal?.commissions || null;
  const hasPreset = hasCommissionPreset(form.assetClass, commissionPreset);
  const presetFees = useMemo(() => {
    if (!hasPreset) return null;
    const exits = form.additionalExits
      .map((e) => ({
        price: parseFloat(e.price),
        quantity: isFutures ? (parseFloat(e.contracts) || 0) : ((parseFloat(e.percent) || 0) / 100) * totalUnits,
      }))
      .filter((e) => e.price > 0 && e.quantity > 0);
    return estimateCommission({
      assetClass: form.assetClass,
      preset: commissionPreset,
      orderType: form.orderType,
      fills: [{ price: entryNum, quantity: baseUnits }, ...validScaleIns],
      exits,
    });
  }, [hasPreset, commissionPreset, form.assetClass, form.orderType, form.additionalExits, isFutures,
      totalUnits, entryNum, baseUnits, validScaleIns]);
  const feesFromPreset = feesAuto && presetFees != null;
  const feesValue = feesFromPreset ? String(presetFees) : form.fees;

  const calc = useMemo(() => {
    const entry = avgEntry;
    const fees = parseFloat(feesValue) || 0;

    // Futures: dollar P&L = points × pointValue × contracts, summed exactly
    // from per-exit contract counts. Percent is on notional (no leverage).
    if (isFutures) {
      const futExits = form.additionalExits
        .filter(e => parseFloat(e.price) > 0 && parseFloat(e.contracts) > 0)
        .map(e => ({ price: parseFloat(e.price), contracts: parseFloat(e.contracts) }));
      if (!entry || !contractSpec || !totalContracts || !futExits.length) return null;
      const pnl = calculateFuturesContractsPnL(form.direction, entry, futExits, contractSpec.pointValue);
      const notional = calculateFuturesNotional(entry, contractSpec.pointValue, totalContracts);
      const pnlPercent = notional ? (pnl / notional) * 100 : 0;
      const weightedExit = calculateWeightedExitPrice(futExits.map(e => ({ price: e.price, percent: e.contracts })));
      const rrRatio = calculateRR(entry, weightedExit, riskStopLoss);
      const netPnl = calculateNetPnL(pnl, fees);
      return { pnl, pnlPercent, rrRatio, netPnl };
    }

    const allExits = form.additionalExits
      .filter(e => parseFloat(e.price) > 0 && parseFloat(e.percent) > 0)
      .map(e => ({ price: parseFloat(e.price), percent: parseFloat(e.percent) }));

    if (!totalUnits) return null;
    if (!allExits.length) return null;

    // For exchange-imported trades, trust the exchange-reported P&L (quantity may be in contracts, not base asset)
    const isImported = form.pnlFromExchange != null;
    const pnl = isImported
      ? form.pnlFromExchange
      : calculatePartialPnL(form.direction, entry, allExits, totalUnits);
    const pnlPercent = isImported
      ? (typeof form.pnlPercent === 'number' ? form.pnlPercent : calculatePnLPercent(pnl, entry, totalUnits, form.leverage))
      : calculatePnLPercent(pnl, entry, totalUnits, isStocks ? 1 : form.leverage);
    const weightedExit = calculateWeightedExitPrice(allExits);
    // R against the original stop (see riskStopLoss), like computeTradeFields.
    const rrRatio = calculateRR(entry, weightedExit, riskStopLoss);
    const netPnl = calculateNetPnL(pnl, fees);

    return { pnl, pnlPercent, rrRatio, netPnl };
  }, [form.direction, avgEntry, form.additionalExits, riskStopLoss, totalUnits, feesValue,
      form.leverage, form.pnlFromExchange, form.pnlPercent, isFutures, contractSpec, totalContracts, isStocks]);

  // Trading plans: the active ones, plus the plan this trade is already
  // linked to even if it was deactivated since.
  const selectedPlan = useMemo(() => (plans || []).find((p) => p.id === form.planId) || null, [plans, form.planId]);
  const planOptions = useMemo(() => {
    const opts = (plans || [])
      .filter((p) => p.isActive || p.id === form.planId)
      .map((p) => ({ value: p.id, label: p.name || 'תוכנית ללא שם' }));
    // A linked plan that was deleted since still shows (with its stored name).
    if (form.planId && !selectedPlan) opts.push({ value: form.planId, label: trade?.planName || 'תוכנית שנמחקה' });
    return opts;
  }, [plans, form.planId, selectedPlan, trade?.planName]);
  const checklistRows = useMemo(
    () => (form.planId ? buildChecklistRows(selectedPlan?.checklist, form.checklist) : []),
    [form.planId, selectedPlan, form.checklist],
  );
  const adherencePct = checklistAdherence(checklistRows);
  const toggleChecklistItem = (item) => {
    update('checklist', checklistRows.map((r) => (r.item === item ? { ...r, done: !r.done } : r)));
  };

  // SL→BE: open/partial existing trades with a real initial stop. The
  // original stop (originalStopLoss, or the stored stop on legacy trades) is
  // what handleSubmit preserves, so R stays measured from it.
  const showBreakeven = !!trade && (currentStatus === 'open' || currentStatus === 'partial')
    && avgEntry > 0
    && canMoveStopToBreakeven({
      direction: form.direction,
      entryPrice: avgEntry,
      stopLoss: form.stopLoss,
      originalStopLoss: parseFloat(trade.originalStopLoss) > 0 ? trade.originalStopLoss : trade.stopLoss,
    });

  const TABS = [
    { id: 'trade', label: 'עסקה' },
    { id: 'plan', label: adherencePct != null ? `תוכנית · ${adherencePct}%` : 'תוכנית' },
    { id: 'mental', label: 'מנטליות' },
  ];

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

    // firstEntry = the first fill (the entry field); entryPrice = what gets
    // stored — the size-weighted average once there are scale-ins.
    const firstEntry = parseFloat(form.entryPrice);
    const entryPrice = hasScaleIns ? avgEntry : firstEntry;
    const sl = parseFloat(form.stopLoss);
    // Futures are sized in contracts; the notional (price × pointValue ×
    // contracts) plays the role of position size. Crypto keeps risk/size.
    // Both cover every fill.
    const ps = isFutures
      ? calculateFuturesNotional(entryPrice, contractSpec?.pointValue, totalContracts)
      : totalNotional;

    if (!firstEntry || firstEntry <= 0) {
      toast.error('נא להזין מחיר כניסה');
      return;
    }
    if (!isFutures && !(effectivePositionSize > 0) && hasScaleIns) {
      toast.error('נא להזין את גודל הכניסה הראשונה לפני הוספה לפוזיציה');
      return;
    }
    // Scale-in rows: a half-filled row would silently drop out of the
    // average, and a fill can't happen before the entry or in the future.
    const halfFilled = form.scaleIns.some((a) => (parseFloat(a.price) > 0) !== (parseFloat(a.size) > 0));
    if (halfFilled) {
      toast.error('בהוספה לפוזיציה יש למלא מחיר וגודל בכל שורה');
      return;
    }
    if (isFutures && form.scaleIns.some((a) => parseFloat(a.size) > 0 && !Number.isInteger(parseFloat(a.size)))) {
      toast.error('בחוזים עתידיים ההוספה לפוזיציה היא במספר חוזים שלם');
      return;
    }
    const firstFillDate = parseDate(form.entryDate);
    for (const a of validScaleIns) {
      const d = parseDate(a.date);
      if (d && d > new Date()) {
        toast.error('תאריך ההוספה לפוזיציה לא יכול להיות בעתיד');
        return;
      }
      if (d && firstFillDate && d < firstFillDate) {
        toast.error('תאריך ההוספה לפוזיציה לא יכול להיות לפני הכניסה');
        return;
      }
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
      toast.error(isStocks ? 'נא להזין מספר מניות או סכום סיכון' : 'נא להזין סיכון או גודל עסקה');
      return;
    }

    // SL validation based on direction. On an EXISTING trade a stop at/through
    // entry is legitimate — it was trailed to breakeven or into profit (the
    // dashboard SL editor does exactly that). It is allowed when the original
    // stop is on the risk side, or when the stored stop is simply unchanged
    // (legacy trades trailed before originalStopLoss existed). New trades
    // still validate the stop they are opened with.
    const storedStop = parseFloat(trade?.stopLoss) || 0;
    const isTrailedStop = !!trade && (
      initialStopLoss({ ...trade, direction: form.direction, entryPrice }) > 0
      || (sl > 0 && sl === storedStop)
    );
    if (sl && entryPrice && !isTrailedStop) {
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
          return { price: parseFloat(e.price), contracts: c, percent: totalContracts > 0 ? (c / totalContracts) * 100 : 0 };
        });
      const sumContracts = validAdditional.reduce((s, e) => s + e.contracts, 0);
      if (sumContracts > totalContracts) {
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
      const quantity = isFutures
        ? totalContracts
        : hasScaleIns
          ? totalUnits
          // Edit keeps the stored units exactly (no ps/entry float round-trip).
          : (!isStocks && lockedQty > 0) ? lockedQty : ps / entryPrice;
      // Every fill, first one included, so the editor can restore them. Only
      // written for scale-in trades; cleared when the scale-ins are removed.
      const entryFills = hasScaleIns
        ? [
          { price: firstEntry, quantity: baseUnits, date: form.entryDate || new Date() },
          ...validScaleIns.map((a) => ({ price: a.price, quantity: a.quantity, date: parseDate(a.date) || null })),
        ]
        : null;
      // Match ImportTrades' clamp range (1–200x) so manual entry can't produce
      // out-of-range values that break downstream stats.
      const leverage = (isFutures || isStocks) ? 1 : Math.min(200, Math.max(1, parseInt(form.leverage) || 1));

      const allExits = validAdditional;
      // An untouched closed import keeps status 'closed' (and no exit price) so
      // computeTradeFields keeps using its settled pnlFromExchange.
      const keepClosed = keepsImportedClose && !allExits.length;
      const exitPrice = keepClosed ? 0 : calculateWeightedExitPrice(allExits);
      // Closed when the whole position is out. For futures compare contracts
      // (exact); for crypto compare the percent sum — with a small rounding
      // tolerance (33.33×3 = 99.99 is a FULL close, and treating it as
      // 'partial' silently dropped the trade from the analytics).
      const fullyClosed = isFutures
        ? allExits.reduce((s, e) => s + e.contracts, 0) >= totalContracts
        : allExits.reduce((s, e) => s + e.percent, 0) >= 99.95;
      const status = keepClosed ? 'closed' : !allExits.length ? 'open' : fullyClosed ? 'closed' : 'partial';

      // Planned targets (no exit recorded yet): price set but no %/contracts.
      const tpsOnly = form.additionalExits
        .filter(e => parseFloat(e.price) > 0 && !(isFutures ? parseFloat(e.contracts) : parseFloat(e.percent)))
        .map(e => parseFloat(e.price));

      const data = {
        pair: finalPair,
        direction: form.direction,
        orderType: form.orderType || 'market',
        marketType: isStocks ? 'spot' : 'futures',
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
          ? (parseFloat(trade.originalStopLoss) > 0
            ? parseFloat(trade.originalStopLoss)
            : (parseFloat(trade.stopLoss) || sl || 0))
          : (sl || 0),
        takeProfit: 0,
        quantity,
        positionSize: ps,
        riskAmount: parseFloat(form.riskAmount) || 0,
        leverage,
        fees: Math.max(0, parseFloat(feesValue) || 0),
        ...(entryFills ? { entries: entryFills } : (trade?.entries ? { entries: null } : {})),
        // Trading-plan link + checklist snapshot ([{ item, done }] — the item
        // text is kept so the record survives later plan edits) and the
        // share of items ticked. Only written once a plan is involved.
        ...(form.planId || trade?.planId ? {
          planId: form.planId || null,
          planName: form.planId ? (selectedPlan?.name || trade?.planName || '') : null,
          checklist: form.planId ? checklistRows : null,
          checklistAdherence: form.planId ? adherencePct : null,
        } : {}),
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
            contracts: totalContracts,
          },
        } : {}),
        // Preserve exchange-specific fields so PnL stays accurate after editing
        ...(trade?.pnlFromExchange != null ? { pnlFromExchange: trade.pnlFromExchange } : {}),
        ...(trade?.externalId ? { externalId: trade.externalId } : {}),
      };
      await onSave(data);
      // New trades seed the next one in this journal with the same setup.
      if (!trade) saveLastTradeChoices(activeJournalId, { strategy: finalStrategy || '', timeframe: finalTimeframe || '', trigger: finalTrigger || '' });
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
  const dateInputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-2 py-2.5 text-xs text-text-primary outline-none focus:border-accent-primary transition-colors text-right';
  const compactInputClass = 'w-full min-w-0 bg-bg-tertiary border border-border-primary rounded-lg px-2 py-2 text-xs text-text-primary outline-none focus:border-accent-primary transition-colors text-right';

  // Fees input — shared by the three asset-class rows. While it follows the
  // journal preset it shows the estimate; typing switches it to manual, and
  // the calculator button re-applies the preset.
  const renderFees = (label) => (
    <div>
      <div className="flex items-center justify-between gap-1 mb-1">
        <label className={labelClass + ' !mb-0 truncate'}>{label}</label>
        {feesFromPreset && <span className="text-[9px] text-accent-primary shrink-0">פריסט</span>}
        {hasPreset && !feesFromPreset && presetFees != null && (
          <button type="button" onClick={() => setFeesAuto(true)}
            title={`חישוב לפי פריסט העמלות ביומן ($${presetFees})`}
            className="p-0.5 rounded text-text-muted hover:text-accent-primary transition-colors cursor-pointer shrink-0">
            <Calculator className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <input type="number" step="any" min="0" value={feesValue}
        onChange={(e) => { setFeesAuto(false); update('fees', e.target.value); }}
        className={inputClass} placeholder="0.00" inputMode="decimal"
        title={feesFromPreset ? 'מחושב לפי פריסט העמלות של היומן — הקלדה תעבור למצב ידני' : undefined} />
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={trade ? 'עריכת עסקה' : 'עסקה חדשה'} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit}>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-bg-tertiary rounded-xl mb-4">
          {TABS.map(tab => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-0 truncate py-2 rounded-lg text-[13px] sm:text-sm font-semibold transition-all cursor-pointer ${
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
              // A closed import with no exit rows has no live calc — show its
              // stored P&L instead of nothing.
              const shown = calc || (keepsImportedClose
                ? { netPnl: safePnl(trade), pnlPercent: Number(trade.pnlPercent) || 0, rrRatio: Number(trade.rrRatio) || 0 }
                : null);
              return (
                <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${cfg.bg} ${cfg.border} mb-1`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  {shown && (
                    <div className="flex items-center gap-2.5">
                      <span className={`text-sm font-bold ${pnlColor(shown.netPnl)}`}>{formatCurrency(shown.netPnl)}</span>
                      <span className={`text-xs font-semibold ${pnlColor(shown.pnlPercent)}`}>{formatPercent(shown.pnlPercent)}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded bg-bg-tertiary ${pnlColor(shown.netPnl)}`}>{formatRR(shown.rrRatio, shown.netPnl)}</span>
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
              ) : isStocks ? (
                <StockSearch
                  value={form.pair}
                  onChange={(sym) => update('pair', sym)}
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

            {/* Dates — compact row. The exit date fills itself in when the
                exits reach 100% (see setExits). */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>תאריך כניסה</label>
                <DatePicker selected={form.entryDate} onChange={(date) => update('entryDate', date)}
                  showTimeSelect timeFormat="HH:mm" timeIntervals={15} dateFormat="dd/MM/yy HH:mm"
                  maxDate={new Date()}
                  locale="he" placeholderText="עכשיו" className={dateInputClass} wrapperClassName="w-full"
                  popperPlacement="bottom-start" portalId="datepicker-portal" />
              </div>
              <div>
                <label className={labelClass}>תאריך סגירה</label>
                <DatePicker selected={form.exitDate} onChange={(date) => update('exitDate', date)}
                  showTimeSelect timeFormat="HH:mm" timeIntervals={15} dateFormat="dd/MM/yy HH:mm"
                  maxDate={new Date()}
                  minDate={form.entryDate || undefined}
                  locale="he" placeholderText="—" className={dateInputClass} wrapperClassName="w-full"
                  popperPlacement="bottom-start" portalId="datepicker-portal" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>{hasScaleIns ? 'כניסה ראשונה' : 'מחיר כניסה'}</label>
                <input type="number" step="any" value={form.entryPrice} onChange={(e) => update('entryPrice', e.target.value)} className={inputClass} placeholder="0.00" inputMode="decimal" />
                {hasScaleIns && avgEntry > 0 && (
                  <p className="text-[10px] text-accent-primary mt-1">
                    ממוצע: {(+avgEntry.toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 8 })}
                  </p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <label className={labelClass + ' !mb-0'}>סטופ לוס</label>
                  {showBreakeven && (
                    <button type="button" onClick={() => update('stopLoss', breakevenStopValue(avgEntry))}
                      title="הזזת הסטופ למחיר הכניסה (הסטופ המקורי נשמר לחישוב ה-R)"
                      className="text-[10px] font-semibold leading-none px-1.5 py-1 rounded-md border border-accent-primary/30 text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 transition-colors cursor-pointer">
                      SL→BE
                    </button>
                  )}
                </div>
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
                  ? Math.max(0, totalContracts - otherUsed)
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
                        min={isFutures ? '1' : '0.01'} max={isFutures ? totalContracts || undefined : 100}
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
                  <label className={labelClass}>{hasScaleIns ? 'חוזים · כניסה 1' : 'מספר חוזים'}</label>
                  <NumberStepper value={form.contracts} onChange={(v) => update('contracts', v)} min={1} placeholder="1" />
                </div>
                <div>
                  <label className={labelClass}>ערך נקודה</label>
                  <input type="text" value={contractSpec ? `$${contractSpec.pointValue}` : '—'} readOnly tabIndex={-1} className={inputClass + ' opacity-70 cursor-default'} />
                </div>
                {renderFees('עמלות ($)')}
              </div>
            ) : isStocks ? (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelClass}>{hasScaleIns ? 'מניות · כניסה 1' : 'מספר מניות'}</label>
                  <input type="number" step="any" min="0" value={form.shares} onChange={(e) => update('shares', e.target.value)} className={inputClass} placeholder="10" inputMode="decimal" />
                </div>
                <div>
                  <label className={labelClass}>{sharesNum > 0 ? 'סיכון ($) · לתיעוד' : 'או לפי סיכון ($)'}</label>
                  <input type="number" step="any" value={form.riskAmount} onChange={(e) => { update('riskAmount', e.target.value); setLockedQty(0); }} className={inputClass} placeholder="100" inputMode="decimal" />
                </div>
                {renderFees('עמלות ($)')}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelClass}>{hasScaleIns ? 'סיכון · כניסה 1' : 'סיכון ($)'}</label>
                  <input type="number" step="any" value={form.riskAmount} onChange={(e) => { update('riskAmount', e.target.value); setLockedQty(0); }} className={inputClass} placeholder="50" inputMode="decimal" />
                </div>
                <div>
                  <label className={labelClass}>מינוף</label>
                  <input type="number" value={form.leverage} onChange={(e) => update('leverage', e.target.value)} className={inputClass} inputMode="numeric" />
                </div>
                {renderFees('עמלות (USDT)')}
              </div>
            )}

            {/* Scale-in / add to position. The first fill is the entry + size
                above; each row here is a further fill. Entry price and size
                are stored as the size-weighted aggregate. */}
            {form.scaleIns.length === 0 ? (
              <button type="button" onClick={addScaleIn}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border-primary text-xs text-text-muted hover:text-accent-primary hover:border-accent-primary/40 transition-colors cursor-pointer">
                <Layers className="w-3.5 h-3.5" /> הוספה לפוזיציה
              </button>
            ) : (
              <div className="rounded-xl border border-accent-primary/20 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-accent-primary/5 border-b border-accent-primary/15">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-accent-primary/90">
                    <Layers className="w-3.5 h-3.5" /> הוספה לפוזיציה
                  </span>
                  {hasScaleIns && avgEntry > 0 && (
                    <span className="text-[10px] text-text-muted truncate">
                      ממוצע <span className="text-text-primary font-semibold">{(+avgEntry.toPrecision(8)).toLocaleString('en-US', { maximumFractionDigits: 8 })}</span>
                      {' · '}סה״כ <span className="text-text-primary font-semibold">{+totalUnits.toFixed(isFutures ? 0 : 6)}</span> {sizeUnitLabel}
                    </span>
                  )}
                </div>
                <div className="p-2 space-y-1.5">
                  {form.scaleIns.map((a, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1.25fr_auto] gap-1.5 items-center">
                      <input type="number" step="any" value={a.price} onChange={(e) => updateScaleIn(i, 'price', e.target.value)}
                        className={compactInputClass} placeholder="מחיר" inputMode="decimal" aria-label={`מחיר הוספה ${i + 1}`} />
                      <input type="number" step={isFutures ? '1' : 'any'} min="0" value={a.size} onChange={(e) => updateScaleIn(i, 'size', e.target.value)}
                        className={compactInputClass} placeholder={sizeUnitLabel} inputMode={isFutures ? 'numeric' : 'decimal'} aria-label={`גודל הוספה ${i + 1}`} />
                      <DatePicker selected={a.date} onChange={(date) => updateScaleIn(i, 'date', date)}
                        showTimeSelect timeFormat="HH:mm" timeIntervals={15} dateFormat="dd/MM HH:mm"
                        maxDate={new Date()} minDate={form.entryDate || undefined}
                        locale="he" placeholderText="תאריך" className={compactInputClass} wrapperClassName="w-full min-w-0"
                        popperPlacement="bottom-start" portalId="datepicker-portal" />
                      <button type="button" onClick={() => removeScaleIn(i)} aria-label="הסרת הוספה"
                        className="p-1 text-text-muted/50 hover:text-loss transition-colors cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addScaleIn}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-text-muted hover:text-accent-primary hover:bg-accent-primary/5 border-t border-border-primary/20 transition-all cursor-pointer">
                  <Plus className="w-3 h-3" /> הוסף כניסה
                </button>
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
              (contractSpec && totalContracts > 0 && avgEntry > 0) && (
                <div className="bg-bg-tertiary rounded-lg p-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
                  <div><span className="text-text-muted">נומינלי: </span><span className="text-accent-primary font-semibold">${totalNotional.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span></div>
                  <div><span className="text-text-muted">ערך נקודה: </span><span className="text-text-primary font-medium">${contractSpec.pointValue}</span></div>
                  <div><span className="text-text-muted">חוזים: </span><span className="text-text-primary font-medium">{totalContracts}</span></div>
                </div>
              )
            ) : isStocks ? (
              totalNotional > 0 && (
                <div className="bg-bg-tertiary rounded-lg p-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
                  <div><span className="text-text-muted">שווי פוזיציה: </span><span className="text-accent-primary font-semibold">${totalNotional.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></div>
                  <div><span className="text-text-muted">מניות: </span><span className="text-text-primary font-medium">{+totalUnits.toFixed(4)}</span></div>
                  {parseFloat(form.stopLoss) > 0 && (
                    <div><span className="text-text-muted">סיכון עד הסטופ: </span><span className="text-loss font-medium">${(totalUnits * Math.abs(avgEntry - parseFloat(form.stopLoss))).toFixed(2)}</span></div>
                  )}
                </div>
              )
            ) : (
              (totalNotional > 0 || calculatedMargin || totalUnits > 0) && (
                <div className="bg-bg-tertiary rounded-lg p-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
                  {totalNotional > 0 && (
                    <div><span className="text-text-muted">גודל: </span><span className="text-accent-primary font-semibold">${totalNotional.toFixed(2)}</span></div>
                  )}
                  {calculatedMargin != null && (
                    <div><span className="text-text-muted">מרג׳ין: </span><span className="text-text-primary font-medium">${calculatedMargin.toFixed(2)}</span></div>
                  )}
                  {totalUnits > 0 && (
                    <div><span className="text-text-muted">כמות: </span><span className="text-text-primary font-medium">{totalUnits.toFixed(6)}</span></div>
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

        {/* Plan tab — link the trade to a trading plan and tick its
            pre-entry checklist. Adherence = share of items ticked. */}
        <div className={`space-y-3 ${activeTab !== 'plan' ? 'hidden' : ''}`}>
          {planOptions.length === 0 && !form.planId ? (
            <div className="flex flex-col items-center gap-1.5 text-center py-6 px-3 rounded-xl border border-dashed border-border-primary">
              <ClipboardCheck className="w-5 h-5 text-text-muted" />
              <p className="text-xs text-text-secondary">אין תוכניות מסחר פעילות</p>
              <p className="text-[11px] text-text-muted">צור תוכנית עם צ׳קליסט בעמוד התוכניות כדי לבדוק כל עסקה מולה.</p>
            </div>
          ) : (
            <>
              <SelectDropdown
                label="תוכנית מסחר"
                value={form.planId}
                onChange={(id) => setForm((f) => ({ ...f, planId: id, checklist: [] }))}
                options={planOptions}
                placeholder="ללא תוכנית"
                allowClear
              />
              {form.planId && (
                checklistRows.length === 0 ? (
                  <p className="text-[11px] text-text-muted">לתוכנית הזו אין צ׳קליסט.</p>
                ) : (
                  <div className="rounded-xl border border-border-primary overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-bg-tertiary">
                      <span className="text-xs font-semibold text-text-secondary">צ׳קליסט לפני כניסה</span>
                      <span className={`text-[11px] font-bold ${
                        adherencePct >= 80 ? 'text-profit' : adherencePct >= 50 ? 'text-breakeven' : 'text-loss'
                      }`}>
                        {checklistRows.filter((r) => r.done).length}/{checklistRows.length} · {adherencePct}%
                      </span>
                    </div>
                    <div className="h-1 bg-bg-tertiary">
                      <div className={`h-full transition-all ${adherencePct >= 80 ? 'bg-profit' : adherencePct >= 50 ? 'bg-breakeven' : 'bg-loss'}`}
                        style={{ width: `${adherencePct}%` }} />
                    </div>
                    <div className="divide-y divide-border-primary/30">
                      {checklistRows.map((r) => (
                        <button key={r.item} type="button" onClick={() => toggleChecklistItem(r.item)}
                          role="checkbox" aria-checked={r.done}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-right hover:bg-bg-tertiary/60 transition-colors cursor-pointer">
                          <span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                            r.done ? 'bg-profit border-profit text-white' : 'border-border-primary'
                          }`}>
                            {r.done && <Check className="w-3 h-3" />}
                          </span>
                          <span className={`text-xs ${r.done ? 'text-text-primary' : 'text-text-secondary'}`}>{r.item}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}
            </>
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
