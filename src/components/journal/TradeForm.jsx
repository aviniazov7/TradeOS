import { useState, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import DatePicker, { registerLocale } from 'react-datepicker';
import { he } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';
import { X, Plus, AlertTriangle, ShieldAlert, TrendingUp, TrendingDown, Check, Target, ClipboardCheck, Gauge, ShieldCheck, Layers, Calculator, ChevronDown } from 'lucide-react';
import Modal from '../shared/Modal';
import PairSearch from './PairSearch';
import StockSearch from '../stocks/StockSearch';
import SelectDropdown from '../shared/SelectDropdown';
import NumberStepper from '../shared/NumberStepper';
import TimeframeSelector from '../shared/TimeframeSelector';
import StrategySelector from '../shared/StrategySelector';
import MultiSelector from '../shared/MultiSelector';
import { PAIRS, MISTAKE_LABELS, TAG_LABELS, SESSIONS, FUTURES_CONTRACTS, getContractSpec, DEFAULT_LEVERAGE } from '../../utils/constants';
import { useUserStrategies } from '../../hooks/useUserStrategies';
import { useUserTimeframes } from '../../hooks/useUserTimeframes';
import { useUserTriggers } from '../../hooks/useUserTriggers';
import { useUserTags } from '../../hooks/useUserTags';
import { useUserMistakes } from '../../hooks/useUserMistakes';
import { useTradingPlans } from '../../hooks/useTradingPlans';
import { useJournalContext } from '../../contexts/JournalContext';
import {
  isSelectableTradeTime,
  aggregateFills, exitsClosedPercent, hasCommissionPreset, estimateCommission,
  buildChecklistRows, checklistAdherence, loadLastTradeChoices, saveLastTradeChoices,
  canMoveStopToBreakeven, breakevenStopValue,
  riskBudgetCheck, riskToStop, stopDistancePct, rMultiple, plannedRewardRisk,
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

const MENTAL_RATINGS = [
  { key: 'focusRating', label: 'ריכוז וחדות', Icon: Target },
  { key: 'planAdherenceRating', label: 'הצמדות לתוכנית', Icon: ClipboardCheck },
  // Stress is the one scale where 5 is the BAD answer — the hint says so.
  { key: 'stressRating', label: 'לחץ / סטרס', Icon: Gauge, hint: '5 = גבוה' },
  { key: 'confidenceRating', label: 'ביטחון בעסקה', Icon: ShieldCheck },
];

const ASSET_LABELS = { crypto: 'קריפטו', stocks: 'מניות', futures_cme: 'חוזים עתידיים' };

// ── Ticket building blocks ──────────────────────────────────────────────────
// One visual language for every control: 40px high, rounded-xl, small muted
// labels, numbers in num-mono, a single accent colour. Profit/loss tokens are
// kept for direction and P&L only.
// ctlBase carries no padding / text size / colour / alignment so each use
// adds its own without two utilities of the same property fighting.
const ctlBase = 'h-10 w-full min-w-0 bg-bg-tertiary border border-border-primary rounded-xl outline-none focus:border-accent-primary transition-colors placeholder:text-text-muted/60';
const inputClass = `${ctlBase} px-3 text-sm text-text-primary text-right`;
const numInputClass = `${inputClass} num-mono`;
const compactNumClass = `${ctlBase} px-2 text-xs text-text-primary text-right num-mono`;
const readoutClass = 'h-10 w-full min-w-0 rounded-xl border border-dashed border-border-primary px-3 flex items-center justify-end text-sm num-mono text-text-secondary';

const fmtNum = (v, max = 8) => (Number.isFinite(v) ? (+v.toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: max }) : '—');
const fmtUsd = (v, max = 2) => (Number.isFinite(v) ? `$${v.toLocaleString('en-US', { minimumFractionDigits: Math.min(2, max), maximumFractionDigits: max })}` : '—');
const fmtR = (r) => (r == null || !Number.isFinite(r) ? '—' : `${r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}R`);

/** A numbered ticket section: caption on a hairline, optionally collapsible. */
function Section({ n, title, aside, collapsible = false, open = true, onToggle, children }) {
  const caption = (
    <>
      <span className="num-mono text-[10px] font-semibold text-accent-primary">{String(n).padStart(2, '0')}</span>
      <span className="text-xs font-semibold text-text-primary whitespace-nowrap">{title}</span>
      <span className="flex-1 h-px bg-border-primary min-w-4" aria-hidden="true" />
      {aside}
      {collapsible && <ChevronDown className={`w-4 h-4 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />}
    </>
  );
  return (
    <section className="pt-5 first:pt-0">
      {collapsible ? (
        <button type="button" onClick={onToggle} aria-expanded={open}
          className="w-full flex items-center gap-2 cursor-pointer text-right rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40">
          {caption}
        </button>
      ) : (
        <div className="flex items-center gap-2">{caption}</div>
      )}
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

/** Label + control. `pick` sizes a shared picker to the ticket's controls. */
function Field({ label, htmlFor, aside, hint, hintTone = 'text-text-muted', hintDir, pick = false, className = '', children }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-1 mb-1 min-h-[18px]">
        {htmlFor
          ? <label htmlFor={htmlFor} className="text-[11px] text-text-muted truncate">{label}</label>
          : <span className="text-[11px] text-text-muted truncate">{label}</span>}
        {aside}
      </div>
      {pick ? <div className="tt-pick">{children}</div> : children}
      {hint && <p dir={hintDir} className={`text-[10px] mt-1 truncate text-right ${hintDir === 'ltr' ? 'num-mono ' : ''}${hintTone}`}>{hint}</p>}
    </div>
  );
}

/** Segmented control (radio group) — 40px, one accent unless a tone is given. */
function Segmented({ value, onChange, options, ariaLabel, size = 'md' }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel}
      className={`flex gap-0.5 p-0.5 rounded-xl bg-bg-tertiary border border-border-primary ${size === 'sm' ? 'h-8' : 'h-10'}`}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} aria-label={o.aria} onClick={() => onChange(o.value)}
            className={`flex-1 min-w-0 rounded-[10px] flex items-center justify-center gap-1 font-semibold transition-colors cursor-pointer ${
              size === 'sm' ? 'text-[11px] num-mono' : 'text-xs'
            } ${on ? (o.onClass || 'bg-accent-primary/15 text-accent-primary') : 'text-text-muted hover:text-text-primary'}`}>
            {o.icon}{o.label}
          </button>
        );
      })}
    </div>
  );
}

/** label · value row of the summary rail. */
function Row({ label, value, tone = 'text-text-primary', strong = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="text-[11px] text-text-muted shrink-0">{label}</span>
      <span className={`num-mono text-right truncate ${strong ? 'text-sm font-bold' : 'text-xs font-medium'} ${tone}`} dir="ltr">{value}</span>
    </div>
  );
}

function RailBlock({ title, children }) {
  return (
    <div className="px-4 py-2.5 border-t border-border-primary">
      <p className="text-[10px] font-semibold tracking-wider text-text-muted mb-1">{title}</p>
      {children}
    </div>
  );
}

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
  // Collapsible sections: null = automatic (see planOpen / journalOpen below),
  // true/false once the user toggles. Reset whenever the ticket opens.
  const [planOpenState, setPlanOpenState] = useState(null);
  const [journalOpenState, setJournalOpenState] = useState(null);
  const [scaleOpenState, setScaleOpenState] = useState(null);
  const submitRef = useRef(null);
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
    setPlanOpenState(null);
    setJournalOpenState(null);
    setScaleOpenState(null);
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

  // ── Summary rail (display only — handleSubmit computes what is saved) ──
  // Risk in dollars: the typed risk, else what the size loses at the
  // original stop. Futures have no risk input, so theirs is always the stop
  // risk (points × point value × contracts).
  const pointValue = isFutures ? (contractSpec?.pointValue || 0) : 1;
  const stopRisk = riskToStop({ entry: avgEntry, stop: riskStopLoss, units: totalUnits, pointValue });
  const typedRisk = parseFloat(form.riskAmount) || 0;
  const riskDollars = !isFutures && typedRisk > 0 ? typedRisk : stopRisk;
  const riskInfo = useMemo(() => riskBudgetCheck(riskDollars, riskSettings || {}), [riskDollars, riskSettings]);
  const stopDistance = stopDistancePct(avgEntry, riskStopLoss);

  // Planned R:R — every target with a price; futures weights are contracts,
  // turned into % of the position.
  const planned = useMemo(() => plannedRewardRisk({
    direction: form.direction,
    entry: avgEntry,
    stop: riskStopLoss,
    targets: form.additionalExits.map((e) => ({
      price: e.price,
      weight: isFutures
        ? (totalContracts > 0 ? ((parseFloat(e.contracts) || 0) / totalContracts) * 100 : 0)
        : parseFloat(e.percent) || 0,
    })),
  }), [form.direction, avgEntry, riskStopLoss, form.additionalExits, isFutures, totalContracts]);

  // Realized result: the live calc, or — for a closed import with no exit
  // rows — the stored P&L.
  const shown = calc || (keepsImportedClose
    ? { netPnl: safePnl(trade), pnlPercent: Number(trade.pnlPercent) || 0, rrRatio: Number(trade.rrRatio) || 0, pnl: null }
    : null);
  const feesNum = parseFloat(feesValue) || 0;

  // Collapsible sections. Plan: open while there is a plan to pick or one
  // is linked. Journal: closed on a new trade, open on edit when anything in
  // it was filled. Scale-ins: open once there are rows.
  const planOpen = planOpenState ?? (!!form.planId || planOptions.length > 0);
  const journalHasContent = !!(form.entryReason?.trim() || form.notes?.trim() || form.tags?.length || form.mistakes?.length
    || form.tradingViewUrl?.trim() || MENTAL_RATINGS.some((r) => form[r.key] !== 3));
  const journalOpen = journalOpenState ?? (!!trade && journalHasContent);
  const scaleOpen = scaleOpenState ?? form.scaleIns.length > 0;

  const statusCfg = {
    limit: { label: 'ממתין לכניסה', dot: 'bg-text-muted' },
    open: { label: 'פתוחה', dot: 'bg-accent-primary animate-pulse' },
    partial: { label: `${additionalExitsPercent.toFixed(0)}% נסגר`, dot: 'bg-accent-primary' },
    closed: { label: 'סגורה', dot: shown ? (shown.netPnl > 0 ? 'bg-profit' : shown.netPnl < 0 ? 'bg-loss' : 'bg-breakeven') : 'bg-text-muted' },
  }[currentStatus];

  const riskTone = riskInfo?.severity === 'critical' ? 'text-loss' : riskInfo?.severity === 'warning' ? 'text-breakeven' : 'text-text-primary';

  // Enter inside a field must not submit half a ticket; Ctrl/Cmd+Enter saves
  // (through the real submit button, so a disabled save stays disabled and
  // the browser still validates the fields).
  const handleFormKeyDown = (e) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      submitRef.current?.click();
      return;
    }
    const t = e.target;
    if (t.tagName === 'INPUT' && !['checkbox', 'radio', 'submit', 'button'].includes(t.type)) e.preventDefault();
  };

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
  const textareaClass = 'w-full min-w-0 h-24 bg-bg-tertiary border border-border-primary rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right resize-none placeholder:text-text-muted/60';
  const isLong = form.direction === 'long';
  // Futures exits are recorded in contracts; crypto / stocks in percent.
  const exitField = isFutures ? 'contracts' : 'percent';

  // Fees input — shared by the three asset classes. While it follows the
  // journal preset it shows the estimate; typing switches it to manual, and
  // the calculator button re-applies the preset.
  const feesField = (
    <Field label={isFutures || isStocks ? 'עמלות ($)' : 'עמלות (USDT)'} htmlFor="tt-fees"
      aside={feesFromPreset
        ? <span className="text-[10px] font-semibold text-accent-primary shrink-0">פריסט</span>
        : (hasPreset && presetFees != null) ? (
          <button type="button" onClick={() => setFeesAuto(true)}
            title={`חישוב לפי פריסט העמלות ביומן ($${presetFees})`} aria-label="חישוב לפי פריסט העמלות"
            className="p-0.5 rounded text-text-muted hover:text-accent-primary transition-colors cursor-pointer shrink-0">
            <Calculator className="w-3.5 h-3.5" />
          </button>
        ) : null}>
      <input id="tt-fees" type="number" step="any" min="0" value={feesValue}
        onChange={(e) => { setFeesAuto(false); update('fees', e.target.value); }}
        className={numInputClass} placeholder="0.00" inputMode="decimal"
        title={feesFromPreset ? 'מחושב לפי פריסט העמלות של היומן — הקלדה תעבור למצב ידני' : undefined} />
    </Field>
  );

  // Size inputs per asset class (two cells of the entry grid).
  const sizeFields = isFutures ? (
    <>
      <Field label={hasScaleIns ? 'חוזים · כניסה 1' : 'מספר חוזים'}>
        <NumberStepper value={form.contracts} onChange={(v) => update('contracts', v)} min={1} placeholder="1" className="h-10 rounded-xl" />
      </Field>
      <Field label="ערך נקודה">
        <div className={readoutClass}>{contractSpec ? `$${contractSpec.pointValue}` : '—'}</div>
      </Field>
    </>
  ) : isStocks ? (
    <>
      <Field label={hasScaleIns ? 'מניות · כניסה 1' : 'מספר מניות'} htmlFor="tt-shares">
        <input id="tt-shares" type="number" step="any" min="0" value={form.shares} onChange={(e) => update('shares', e.target.value)} className={numInputClass} placeholder="10" inputMode="decimal" />
      </Field>
      <Field label={sharesNum > 0 ? 'סיכון ($) · לתיעוד' : 'או לפי סיכון ($)'} htmlFor="tt-risk">
        <input id="tt-risk" type="number" step="any" value={form.riskAmount} onChange={(e) => { update('riskAmount', e.target.value); setLockedQty(0); }} className={numInputClass} placeholder="100" inputMode="decimal" />
      </Field>
    </>
  ) : (
    <>
      <Field label={hasScaleIns ? 'סיכון · כניסה 1' : 'סיכון ($)'} htmlFor="tt-risk">
        <input id="tt-risk" type="number" step="any" value={form.riskAmount} onChange={(e) => { update('riskAmount', e.target.value); setLockedQty(0); }} className={numInputClass} placeholder="50" inputMode="decimal" />
      </Field>
      <Field label="מינוף" htmlFor="tt-leverage">
        <input id="tt-leverage" type="number" value={form.leverage} onChange={(e) => update('leverage', e.target.value)} className={numInputClass} inputMode="numeric" />
      </Field>
    </>
  );

  const exitGrid = 'grid grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_4.5rem_1.5rem] sm:grid-cols-[2rem_minmax(0,1fr)_5.5rem_3.75rem_4.75rem_1.5rem] gap-2 items-center';
  const exitedTone = additionalExitsPercent > 100.05 ? 'bg-loss/15 text-loss' : 'bg-accent-primary/10 text-accent-primary';
  const doneCount = checklistRows.filter((r) => r.done).length;
  const adherenceTone = adherencePct >= 80 ? 'text-accent-primary bg-accent-primary/10' : adherencePct >= 50 ? 'text-text-secondary bg-bg-tertiary' : 'text-breakeven bg-breakeven/10';
  const journalSummary = [
    form.tags?.length ? `${form.tags.length} תגיות` : null,
    form.mistakes?.length ? `${form.mistakes.length} טעויות` : null,
    (form.entryReason?.trim() || form.notes?.trim()) ? 'הערות' : null,
  ].filter(Boolean).join(' · ');
  const riskLabel = !isFutures && typedRisk > 0 ? 'סכום בסיכון' : 'סיכון עד הסטופ';

  const rail = (
    // Desktop: sticky under the modal header and capped to the visible body
    // (viewport − card margins − header − footer) so its end never hides
    // behind the action bar.
    <aside className="mt-6 lg:mt-0 lg:sticky lg:top-16 lg:self-start lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto overscroll-contain rounded-2xl" aria-label="סיכום העסקה">
      <div className="rounded-2xl border border-border-primary bg-bg-tertiary">
        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="num-mono text-lg font-bold text-text-primary truncate" dir="ltr">{form.pair || '—'}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0 ${isLong ? 'bg-long/15 text-long' : 'bg-short/15 text-short'}`}>
              {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isLong ? 'LONG' : 'SHORT'}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-text-muted truncate">
            {ASSET_LABELS[form.assetClass] || 'קריפטו'} · {form.orderType === 'limit' ? 'Limit' : 'Market'}{form.timeframe ? ` · ${form.timeframe}` : ''}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${statusCfg.dot}`} />
            <span className="text-xs font-semibold text-text-secondary">{statusCfg.label}</span>
          </div>
        </div>

        {shown && (
          <RailBlock title="תוצאה">
            <div className="flex items-baseline justify-between gap-2 py-1">
              <span className={`num-mono text-xl font-bold ${pnlColor(shown.netPnl)}`} dir="ltr">{formatCurrency(shown.netPnl)}</span>
              <span className={`num-mono text-xs font-semibold ${pnlColor(shown.pnlPercent)}`} dir="ltr">{formatPercent(shown.pnlPercent)}</span>
            </div>
            {shown.pnl != null && <Row label="ברוטו" value={formatCurrency(shown.pnl)} tone="text-text-secondary" />}
            <Row label="R בפועל" value={formatRR(shown.rrRatio, shown.netPnl)} tone={pnlColor(shown.netPnl)} />
          </RailBlock>
        )}

        <RailBlock title="פוזיציה">
          <Row label={isFutures ? 'נומינלי' : isStocks ? 'שווי פוזיציה' : 'גודל פוזיציה'} value={totalNotional > 0 ? fmtUsd(totalNotional) : '—'} />
          {!isFutures && !isStocks && <Row label="מרג׳ין" value={calculatedMargin != null ? fmtUsd(calculatedMargin) : '—'} />}
          <Row label={isFutures ? 'חוזים' : isStocks ? 'מניות' : 'כמות'} value={totalUnits > 0 ? fmtNum(totalUnits, isFutures ? 0 : 6) : '—'} />
          {hasScaleIns && avgEntry > 0 && <Row label="כניסה ממוצעת" value={fmtNum(avgEntry)} />}
          {isFutures && contractSpec && <Row label="ערך נקודה" value={`$${contractSpec.pointValue}`} />}
          {!isFutures && !isStocks && <Row label="מינוף" value={`${parseInt(form.leverage) || 1}x`} />}
        </RailBlock>

        <RailBlock title="סיכון">
          <Row label={riskLabel} value={riskDollars > 0 ? fmtUsd(riskDollars) : '—'} tone={riskTone} strong />
          <Row label="מהתיק" value={riskInfo?.percent != null ? `${riskInfo.percent.toFixed(2)}%` : '—'} tone={riskTone} />
          {riskInfo?.limitLabel && <Row label="מגבלה" value={riskInfo.limitLabel} tone="text-text-secondary" />}
          <Row label="מרחק לסטופ" value={stopDistance != null ? `${stopDistance.toFixed(2)}%` : '—'} tone="text-text-secondary" />
          {riskInfo && riskInfo.severity !== 'info' && (
            <p role="alert" className={`mt-2 flex items-start gap-1.5 text-[11px] leading-snug ${riskInfo.severity === 'critical' ? 'text-loss' : 'text-breakeven'}`}>
              {riskInfo.severity === 'critical' ? <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-px" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />}
              <span>{riskInfo.message}</span>
            </p>
          )}
        </RailBlock>

        <RailBlock title="יעדים">
          <Row label="R:R ל-TP1" value={fmtR(planned.tp1)} />
          <Row label="R:R משוקלל" value={fmtR(planned.blended)} />
        </RailBlock>

        <RailBlock title="עלויות ומשמעת">
          <Row label="עמלות" value={feesNum > 0 ? fmtUsd(feesNum, 4) : '—'} />
          <Row label="עמידה בתוכנית" value={adherencePct != null ? `${adherencePct}%` : '—'} />
        </RailBlock>
      </div>
    </aside>
  );

  const footer = (
    <>
      {/* Phones: the key numbers stay in view above the buttons. */}
      <div className="lg:hidden grid grid-cols-3 gap-2 mb-2.5">
        <MiniStat label="סיכון" value={riskDollars > 0 ? fmtUsd(riskDollars) : '—'} tone={riskTone} />
        <MiniStat label={shown ? 'R בפועל' : 'R:R מתוכנן'} value={shown ? formatRR(shown.rrRatio, shown.netPnl) : fmtR(planned.blended)} />
        <MiniStat label="P&L נטו" value={shown ? formatCurrency(shown.netPnl) : '—'} tone={shown ? pnlColor(shown.netPnl) : 'text-text-primary'} />
      </div>
      <div className="flex items-center gap-2.5">
        <p className="hidden lg:block flex-1 text-[11px] text-text-muted">
          <span className="num-mono" dir="ltr">Ctrl/⌘ + Enter</span> לשמירה · <span className="num-mono">Esc</span> לסגירה
        </p>
        <button type="button" onClick={onClose}
          className="flex-1 lg:flex-none lg:w-32 h-10 rounded-xl border border-border-primary bg-bg-tertiary text-sm text-text-primary hover:border-border-hover transition-colors cursor-pointer">
          ביטול
        </button>
        <button ref={submitRef} type="submit" form="trade-ticket-form" disabled={saving || additionalExitsPercent > 100}
          title={additionalExitsPercent > 100 ? 'סך אחוזי היציאות חורג מ-100%' : undefined}
          className="flex-[1.4] lg:flex-none lg:w-44 h-10 rounded-xl bg-accent-primary text-black text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? 'שומר...' : trade ? 'עדכן עסקה' : 'שמור עסקה'}
        </button>
      </div>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={trade ? 'עריכת עסקה' : 'עסקה חדשה'} maxWidth="max-w-5xl" footer={footer}>
      <form id="trade-ticket-form" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}
        className="lg:grid lg:grid-cols-[minmax(0,1fr)_288px] lg:gap-6 lg:items-start">
        <div className="min-w-0">

          {/* 01 — instrument & direction. Asset class is inherited from the
              journal — no per-trade toggle. */}
          <Section n={1} title="מכשיר וכיוון">
            <div className="grid grid-cols-2 md:grid-cols-12 gap-3">
              <Field label={isFutures ? 'חוזה' : isStocks ? 'מניה' : 'זוג'} pick className="col-span-2 md:col-span-6"
                hint={isFutures && contractSpec ? `${contractSpec.name} · $${contractSpec.pointValue}/pt · tick ${contractSpec.tickSize}` : undefined} hintDir="ltr">
                {isFutures ? (
                  <SelectDropdown
                    value={form.pair}
                    onChange={(sym) => update('pair', sym)}
                    options={FUTURES_CONTRACTS.map((c) => ({ value: c.symbol, label: `${c.symbol} — ${c.name}` }))}
                    placeholder="בחר חוזה..."
                  />
                ) : isStocks ? (
                  <StockSearch label="" value={form.pair} onChange={(sym) => update('pair', sym)} />
                ) : (
                  <PairSearch label="" value={form.pair} onChange={(pair) => update('pair', pair || 'BTCUSDT')} />
                )}
              </Field>
              <Field label="כיוון" className="md:col-span-3">
                <Segmented ariaLabel="כיוון" value={form.direction} onChange={(d) => update('direction', d)} options={[
                  { value: 'long', label: 'Long', icon: <TrendingUp className="w-3.5 h-3.5" />, onClass: 'bg-long/15 text-long' },
                  { value: 'short', label: 'Short', icon: <TrendingDown className="w-3.5 h-3.5" />, onClass: 'bg-short/15 text-short' },
                ]} />
              </Field>
              <Field label="סוג פקודה" className="md:col-span-3">
                <Segmented ariaLabel="סוג פקודה" value={form.orderType} onChange={(v) => update('orderType', v)} options={[
                  { value: 'market', label: 'Market' },
                  { value: 'limit', label: 'Limit' },
                ]} />
              </Field>
              <Field label="אסטרטגיה" pick className="col-span-2 md:col-span-4">
                <StrategySelector
                  value={form.strategy}
                  onChange={(s) => update('strategy', s)}
                  strategies={allStrategies}
                  onAdd={addStrategy}
                  onRemove={removeStrategy}
                />
              </Field>
              <Field label="טווח זמן" pick className="md:col-span-4">
                <TimeframeSelector
                  value={form.timeframe}
                  onChange={(tf) => update('timeframe', tf)}
                  timeframes={allTimeframes}
                  onAdd={addTimeframe}
                  onRemove={removeTimeframe}
                />
              </Field>
              <Field label="טריגר כניסה" pick className="md:col-span-4">
                <StrategySelector
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
              </Field>
              <Field label="סשן" className="col-span-2 md:col-span-12"
                aside={form.session ? <span className="text-[10px] text-text-muted">מתמלא אוטומטית לפי שעת הכניסה</span> : null}>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="סשן">
                  {SESSIONS.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={form.session === s}
                      onClick={() => { sessionManuallySet.current = true; update('session', s); }}
                      className={`h-8 px-3 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border ${
                        form.session === s
                          ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/30'
                          : 'bg-bg-tertiary text-text-muted border-border-primary hover:text-text-primary'
                      }`}>{s}</button>
                  ))}
                </div>
              </Field>
            </div>
          </Section>

          {/* 02 — entry, stop, size, costs, dates, scale-ins. The exit date
              fills itself in when the exits reach 100% (see setExits). */}
          <Section n={2} title="כניסה וסיכון">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label={hasScaleIns ? 'כניסה ראשונה' : 'מחיר כניסה'} htmlFor="tt-entry"
                hint={hasScaleIns && avgEntry > 0 ? <>ממוצע <span className="num-mono">{fmtNum(avgEntry)}</span></> : undefined} hintTone="text-accent-primary">
                <input id="tt-entry" type="number" step="any" value={form.entryPrice} onChange={(e) => update('entryPrice', e.target.value)} className={numInputClass} placeholder="0.00" inputMode="decimal" />
              </Field>
              <Field label="סטופ לוס" htmlFor="tt-stop"
                aside={showBreakeven ? (
                  <button type="button" onClick={() => update('stopLoss', breakevenStopValue(avgEntry))}
                    title="הזזת הסטופ למחיר הכניסה (הסטופ המקורי נשמר לחישוב ה-R)"
                    className="text-[10px] font-semibold leading-none px-1.5 py-0.5 rounded-md border border-accent-primary/30 text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 transition-colors cursor-pointer shrink-0">
                    SL→BE
                  </button>
                ) : null}
                hint={trade?.liquidationPrice > 0 ? <>ליקווידציה <span className="num-mono">{parseFloat(trade.liquidationPrice).toLocaleString('en-US', { maximumFractionDigits: 8 })}</span></> : undefined}
                hintTone="text-loss/80">
                <input id="tt-stop" type="number" step="any" value={form.stopLoss} onChange={(e) => update('stopLoss', e.target.value)} className={numInputClass} placeholder="0.00" inputMode="decimal" />
              </Field>
              {sizeFields}
              <Field label="תאריך כניסה" htmlFor="tt-entry-date">
                <DatePicker id="tt-entry-date" selected={form.entryDate} onChange={(date) => update('entryDate', date)}
                  showTimeSelect timeFormat="HH:mm" timeIntervals={15} dateFormat="dd/MM/yy HH:mm"
                  maxDate={new Date()}
                  filterTime={(t) => isSelectableTradeTime(t)}
                  locale="he" placeholderText="עכשיו" className={numInputClass} wrapperClassName="w-full"
                  popperPlacement="bottom-start" portalId="datepicker-portal" />
              </Field>
              <Field label="תאריך סגירה" htmlFor="tt-exit-date">
                <DatePicker id="tt-exit-date" selected={form.exitDate} onChange={(date) => update('exitDate', date)}
                  showTimeSelect timeFormat="HH:mm" timeIntervals={15} dateFormat="dd/MM/yy HH:mm"
                  maxDate={new Date()}
                  minDate={form.entryDate || undefined}
                  filterTime={(t) => isSelectableTradeTime(t, { min: parseDate(form.entryDate) })}
                  locale="he" placeholderText="—" className={numInputClass} wrapperClassName="w-full"
                  popperPlacement="bottom-start" portalId="datepicker-portal" />
              </Field>
              {feesField}
              <Field label="מרחק לסטופ">
                <div className={readoutClass}>{stopDistance != null ? `${stopDistance.toFixed(2)}%` : '—'}</div>
              </Field>
            </div>

            {/* Scale-in / add to position. The first fill is the entry + size
                above; each row here is a further fill. Entry price and size
                are stored as the size-weighted aggregate. */}
            <div className={`mt-3 rounded-xl border ${form.scaleIns.length ? 'border-border-primary' : 'border-dashed border-border-primary'}`}>
              <button type="button" aria-expanded={form.scaleIns.length ? scaleOpen : undefined}
                onClick={() => {
                  if (!form.scaleIns.length) { addScaleIn(); setScaleOpenState(true); } else setScaleOpenState(!scaleOpen);
                }}
                className="w-full h-10 flex items-center gap-2 px-3 text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer text-right">
                <Layers className="w-3.5 h-3.5 shrink-0 text-accent-primary" />
                <span className="font-semibold shrink-0">הוספה לפוזיציה</span>
                {form.scaleIns.length > 0 && (
                  <span className="num-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-accent-primary/10 text-accent-primary shrink-0">{form.scaleIns.length}</span>
                )}
                <span className="flex-1" />
                {hasScaleIns && avgEntry > 0 && (
                  <span className="text-[11px] text-text-muted truncate">
                    ממוצע <span className="num-mono text-text-primary">{fmtNum(avgEntry)}</span>
                    <span className="hidden sm:inline">{' · '}סה״כ <span className="num-mono text-text-primary">{fmtNum(totalUnits, isFutures ? 0 : 6)}</span> {sizeUnitLabel}</span>
                  </span>
                )}
                {form.scaleIns.length
                  ? <ChevronDown className={`w-4 h-4 shrink-0 text-text-muted transition-transform ${scaleOpen ? 'rotate-180' : ''}`} />
                  : <Plus className="w-3.5 h-3.5 shrink-0 text-text-muted" />}
              </button>
              {scaleOpen && form.scaleIns.length > 0 && (
                <div className="border-t border-border-primary p-2 space-y-1.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_1.5rem] gap-1.5 px-0.5 text-[10px] text-text-muted">
                    <span>מחיר</span><span>גודל ({sizeUnitLabel})</span><span>תאריך</span><span />
                  </div>
                  {form.scaleIns.map((a, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_1.5rem] gap-1.5 items-center">
                      <input type="number" step="any" value={a.price} onChange={(e) => updateScaleIn(i, 'price', e.target.value)}
                        className={compactNumClass} placeholder="מחיר" inputMode="decimal" aria-label={`מחיר הוספה ${i + 1}`} />
                      <input type="number" step={isFutures ? '1' : 'any'} min="0" value={a.size} onChange={(e) => updateScaleIn(i, 'size', e.target.value)}
                        className={compactNumClass} placeholder={sizeUnitLabel} inputMode={isFutures ? 'numeric' : 'decimal'} aria-label={`גודל הוספה ${i + 1}`} />
                      <DatePicker selected={a.date} onChange={(date) => updateScaleIn(i, 'date', date)}
                        showTimeSelect timeFormat="HH:mm" timeIntervals={15} dateFormat="dd/MM HH:mm"
                        maxDate={new Date()} minDate={form.entryDate || undefined}
                        locale="he" placeholderText="תאריך" className={compactNumClass} wrapperClassName="w-full min-w-0"
                        popperPlacement="bottom-start" portalId="datepicker-portal" />
                      <button type="button" onClick={() => removeScaleIn(i)} aria-label="הסרת הוספה"
                        className="h-8 w-6 flex items-center justify-center text-text-muted hover:text-loss transition-colors cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={addScaleIn}
                    className="w-full h-8 flex items-center justify-center gap-1.5 rounded-lg text-xs text-text-muted hover:text-accent-primary hover:bg-accent-primary/5 transition-colors cursor-pointer">
                    <Plus className="w-3 h-3" /> הוסף כניסה
                  </button>
                </div>
              )}
            </div>
          </Section>

          {/* 03 — take-profit targets and recorded exits. A row is a planned
              target until it gets a %/contract count, then it is an exit. */}
          <Section n={3} title="יציאות"
            aside={additionalExitsPercent > 0 ? (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${exitedTone}`}>
                {additionalExitsPercent > 100
                  ? `${additionalExitsPercent.toFixed(0)}% — חורג מ-100%`
                  : `${additionalExitsPercent.toFixed(0)}% נסגר`}
              </span>
            ) : null}>
            <div className="rounded-xl border border-border-primary">
              {form.additionalExits.length > 0 && (
                <div className={`${exitGrid} px-2.5 h-8 text-[10px] text-text-muted border-b border-border-primary`}>
                  <span>#</span>
                  <span>מחיר יעד</span>
                  <span>{isFutures ? 'חוזים' : '% מהפוזיציה'}</span>
                  <span className="hidden sm:block">R</span>
                  <span>סטטוס</span>
                  <span />
                </div>
              )}
              {form.additionalExits.map((exit, i) => {
                // Futures exits are recorded in contracts; crypto in percent.
                const isExecuted = parseFloat(exit[exitField]) > 0;
                const otherUsed = form.additionalExits.reduce((s, e, idx) => idx !== i ? s + (parseFloat(e[exitField]) || 0) : s, 0);
                const suggested = isFutures
                  ? Math.max(0, totalContracts - otherUsed)
                  : Math.max(0, 100 - otherUsed);
                const r = rMultiple(form.direction, avgEntry, riskStopLoss, exit.price);
                return (
                  <div key={i} className={`${exitGrid} px-2.5 py-1.5 border-b border-border-primary/60 last:border-b-0 ${isExecuted ? 'bg-accent-primary/[0.04]' : ''}`}>
                    <span className={`num-mono text-[11px] font-semibold ${isExecuted ? 'text-accent-primary' : 'text-text-muted'}`}>TP{i + 1}</span>
                    <input
                      type="number" step="any"
                      value={exit.price}
                      onChange={(e) => updateAdditionalExit(i, 'price', e.target.value)}
                      className={`${ctlBase} px-2.5 text-sm text-text-primary text-right num-mono`}
                      placeholder="מחיר"
                      inputMode="decimal"
                      aria-label={`מחיר יעד ${i + 1}`}
                    />
                    <div className="relative">
                      <input
                        // Percent must allow decimals (exchange-synced trades
                        // arrive with e.g. 12.5%) — the number input's default
                        // step=1 makes the browser reject them and silently
                        // block form submit. Futures stay whole contracts.
                        type="number" step={isFutures ? '1' : 'any'}
                        min={isFutures ? '1' : '0.01'} max={isFutures ? totalContracts || undefined : 100}
                        value={exit[exitField] ?? ''}
                        onChange={(e) => updateAdditionalExit(i, exitField, e.target.value)}
                        className={`${ctlBase} pr-2 pl-6 text-sm text-right num-mono ${isExecuted ? 'text-accent-primary font-semibold' : 'text-text-primary'}`}
                        placeholder="—"
                        inputMode={isFutures ? 'numeric' : 'decimal'}
                        aria-label={isFutures ? `חוזים ביעד ${i + 1}` : `אחוז ביעד ${i + 1}`}
                      />
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">{isFutures ? 'ח׳' : '%'}</span>
                    </div>
                    <span className="hidden sm:block num-mono text-[11px] text-text-secondary" dir="ltr" style={{ textAlign: 'right' }}>{fmtR(r)}</span>
                    {/* Mark as executed */}
                    <button
                      type="button"
                      onClick={() => updateAdditionalExit(i, exitField, isExecuted ? '' : String(suggested))}
                      aria-pressed={isExecuted}
                      className={`h-8 w-full flex items-center justify-center gap-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer border ${
                        isExecuted
                          ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/30 hover:bg-loss/10 hover:text-loss hover:border-loss/30'
                          : 'bg-bg-tertiary text-text-muted border-border-primary hover:border-accent-primary/40 hover:text-accent-primary'
                      }`}
                    >
                      {isExecuted ? <><Check className="w-3 h-3" />בוצע</> : 'סמן'}
                    </button>
                    <button type="button" onClick={() => removeAdditionalExit(i)} aria-label={`הסרת יעד ${i + 1}`}
                      className="h-8 flex items-center justify-center text-text-muted hover:text-loss transition-colors cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              <button type="button" onClick={addAdditionalExit}
                className={`w-full h-10 flex items-center justify-center gap-1.5 text-xs text-text-muted hover:text-accent-primary hover:bg-accent-primary/5 transition-colors cursor-pointer rounded-b-xl ${form.additionalExits.length ? 'border-t border-border-primary' : 'rounded-t-xl'}`}>
                <Plus className="w-3.5 h-3.5" /> הוסף יעד (TP)
              </button>
            </div>
          </Section>

          {/* 04 — link the trade to a trading plan and tick its pre-entry
              checklist. Adherence = share of items ticked. */}
          <Section n={4} title="תוכנית מסחר" collapsible open={planOpen} onToggle={() => setPlanOpenState(!planOpen)}
            aside={adherencePct != null ? (
              <span dir="ltr" className={`num-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${adherenceTone}`}>
                {doneCount}/{checklistRows.length} · {adherencePct}%
              </span>
            ) : null}>
            {planOptions.length === 0 && !form.planId ? (
              <p className="flex items-center gap-2 text-[11px] text-text-muted">
                <ClipboardCheck className="w-4 h-4 shrink-0" />
                אין תוכניות מסחר פעילות — צור תוכנית עם צ׳קליסט בעמוד התוכניות כדי לבדוק כל עסקה מולה.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="תוכנית" pick>
                    <SelectDropdown
                      value={form.planId}
                      onChange={(id) => setForm((f) => ({ ...f, planId: id, checklist: [] }))}
                      options={planOptions}
                      placeholder="ללא תוכנית"
                      allowClear
                    />
                  </Field>
                </div>
                {form.planId && (
                  checklistRows.length === 0 ? (
                    <p className="text-[11px] text-text-muted">לתוכנית הזו אין צ׳קליסט.</p>
                  ) : (
                    <div>
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className="text-[11px] text-text-muted shrink-0">צ׳קליסט לפני כניסה</span>
                        <div className="flex-1 h-1 rounded-full bg-bg-tertiary overflow-hidden">
                          <div className="h-full bg-accent-primary transition-all" style={{ width: `${adherencePct}%` }} />
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-x-4">
                        {checklistRows.map((r) => (
                          <button key={r.item} type="button" onClick={() => toggleChecklistItem(r.item)}
                            role="checkbox" aria-checked={r.done}
                            className="w-full min-h-9 flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg text-right hover:bg-bg-tertiary transition-colors cursor-pointer">
                            <span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                              r.done ? 'bg-accent-primary border-accent-primary text-black' : 'border-border-hover'
                            }`}>
                              {r.done && <Check className="w-3 h-3" />}
                            </span>
                            <span className={`text-xs leading-snug ${r.done ? 'text-text-primary' : 'text-text-secondary'}`}>{r.item}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </Section>

          {/* 05 — journal & psychology. */}
          <Section n={5} title="יומן ופסיכולוגיה" collapsible open={journalOpen} onToggle={() => setJournalOpenState(!journalOpen)}
            aside={!journalOpen && journalSummary ? <span className="text-[10px] text-text-muted shrink-0">{journalSummary}</span> : null}>
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="סיבת כניסה" htmlFor="tt-reason">
                  <textarea id="tt-reason" value={form.entryReason} onChange={(e) => update('entryReason', e.target.value)}
                    className={textareaClass} placeholder="למה נכנסת לעסקה הזו?" />
                </Field>
                <Field label={currentStatus === 'closed' ? 'הערות ולקחים' : 'הערות'} htmlFor="tt-notes">
                  <textarea id="tt-notes" value={form.notes} onChange={(e) => update('notes', e.target.value)}
                    className={textareaClass} placeholder={currentStatus === 'closed' ? 'מה למדת מהעסקה הזו?' : 'הערות נוספות...'} />
                </Field>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="תגיות">
                  <MultiSelector values={form.tags} onChange={(arr) => update('tags', arr)}
                    options={allTags} labels={TAG_LABELS} onAdd={addTag} onRemove={removeTag}
                    addLabel="תגית מותאמת" inputPlaceholder="שם תגית..." emptyText="אין תגיות"
                    placeholder="בחר תגיות..." chipClass="bg-accent-primary text-black" />
                </Field>
                <Field label="טעויות">
                  <MultiSelector values={form.mistakes} onChange={(arr) => update('mistakes', arr)}
                    options={allMistakes} labels={MISTAKE_LABELS} onAdd={addMistake} onRemove={removeMistake}
                    addLabel="טעות מותאמת" inputPlaceholder="שם טעות..." emptyText="אין טעויות"
                    placeholder="בחר טעויות..." chipClass="bg-loss text-white" />
                </Field>
              </div>
              {/* Mental ratings: 1–5 segmented. */}
              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
                {MENTAL_RATINGS.map((rating) => {
                  const { key, label, hint } = rating;
                  const Icon = rating.Icon;
                  return (
                    <Field key={key}
                      label={<span className="inline-flex items-center gap-1"><Icon className="w-3 h-3" />{label}</span>}
                      aside={hint ? <span className="text-[10px] text-text-muted">{hint}</span> : null}>
                      <Segmented size="sm" ariaLabel={label} value={form[key]} onChange={(v) => update(key, v)}
                        options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v), aria: `${label} ${v} מתוך 5` }))} />
                    </Field>
                  );
                })}
              </div>
              <Field label="קישור TradingView" htmlFor="tt-tv">
                <input id="tt-tv" type="url" dir="ltr" value={form.tradingViewUrl} onChange={(e) => update('tradingViewUrl', e.target.value)}
                  className={`${ctlBase} px-3 text-sm text-text-primary text-left`} placeholder="https://www.tradingview.com/x/..." />
              </Field>
            </div>
          </Section>
        </div>

        {rail}
      </form>
    </Modal>
  );
}

/** One cell of the phone summary bar. */
function MiniStat({ label, value, tone = 'text-text-primary' }) {
  return (
    <div className="min-w-0 rounded-lg bg-bg-tertiary border border-border-primary px-2 py-1">
      <p className="text-[10px] text-text-muted truncate">{label}</p>
      <p className={`num-mono text-xs font-semibold truncate text-right ${tone}`} dir="ltr">{value}</p>
    </div>
  );
}
