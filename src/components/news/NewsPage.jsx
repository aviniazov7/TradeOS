import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Newspaper, ExternalLink, Clock, Filter, CalendarDays, Volume2, Globe, BrainCircuit, RefreshCw, Bitcoin, CandlestickChart } from 'lucide-react';
import { fetchNewsDigest, translateNews } from '../../services/newsService';
import WhyItMoved from './WhyItMoved';
import { hebrewEventTitle } from '../../utils/econCalendarTerms';
import { safeHttpUrl } from '../../utils/urls';
import SelectDropdown from '../shared/SelectDropdown';
import { WORKER_BASE } from '../../config/workerBase';

// ─── News Sources (per market) ───
const FEED_SOURCES = {
  crypto: [
    { key: 'cointelegraph', label: 'CoinTelegraph', rss: 'https://cointelegraph.com/rss' },
    { key: 'coindesk', label: 'CoinDesk', rss: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { key: 'decrypt', label: 'Decrypt', rss: 'https://decrypt.co/feed' },
    { key: 'bitcoinmagazine', label: 'Bitcoin Magazine', rss: 'https://bitcoinmagazine.com/.rss/full/' },
    { key: 'theblock', label: 'The Block', rss: 'https://www.theblock.co/rss.xml' },
    { key: 'beincrypto', label: 'BeInCrypto', rss: 'https://beincrypto.com/feed/' },
    { key: 'cryptoslate', label: 'CryptoSlate', rss: 'https://cryptoslate.com/feed/' },
    { key: 'utoday', label: 'U.Today', rss: 'https://u.today/rss' },
  ],
  stocks: [
    { key: 'yahoofinance', label: 'Yahoo Finance', rss: 'https://finance.yahoo.com/news/rssindex' },
    { key: 'marketwatch', label: 'MarketWatch', rss: 'https://feeds.marketwatch.com/marketwatch/topstories/' },
    { key: 'cnbc', label: 'CNBC', rss: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
    { key: 'investing', label: 'Investing.com', rss: 'https://www.investing.com/rss/news_25.rss' },
    { key: 'nasdaq', label: 'Nasdaq', rss: 'https://www.nasdaq.com/feed/rssoutbound?category=Markets' },
  ],
};

// Topic chips — deterministic keyword classification on title+description.
// The feeds are English; the chips are Hebrew.
const TOPICS = {
  crypto: [
    { key: 'all', label: 'הכל', re: null },
    { key: 'btc', label: 'ביטקוין', re: /bitcoin|\bbtc\b/i },
    { key: 'eth', label: 'אתריום', re: /ethereum|\beth\b|\bether\b/i },
    { key: 'alts', label: 'אלטים', re: /solana|\bsol\b|\bxrp\b|ripple|dogecoin|\bdoge\b|cardano|\bada\b|\bbnb\b|altcoin|avalanche|polygon|chainlink|\blink\b|memecoin/i },
    { key: 'macro', label: 'מאקרו', re: /\bfed\b|inflation|interest rate|rate cut|treasur|\bcpi\b|powell|tariff|recession|jobs report|macro/i },
    { key: 'regulation', label: 'רגולציה', re: /\bsec\b|regulat|lawsuit|court|congress|senate|\bban\b|legislat|\betf\b|license/i },
    { key: 'security', label: 'אבטחה', re: /hack|exploit|breach|scam|stolen|phishing|drainer|rug pull/i },
  ],
  stocks: [
    { key: 'all', label: 'הכל', re: null },
    { key: 'indices', label: 'מדדים', re: /s&p|nasdaq|dow\b|futures|wall street|stock market|index|indices/i },
    { key: 'tech', label: 'טק', re: /apple|nvidia|microsoft|google|alphabet|amazon|\bmeta\b|tesla|\bai\b|chip|semiconductor|intel|\bamd\b|palantir/i },
    { key: 'earnings', label: 'דוחות', re: /earnings|revenue|profit|guidance|quarter|beats|misses|forecast/i },
    { key: 'macro', label: 'מאקרו', re: /\bfed\b|inflation|interest rate|rate cut|treasur|\bcpi\b|powell|tariff|recession|jobs report|gdp/i },
    { key: 'commodities', label: 'סחורות', re: /\boil\b|\bgold\b|crude|natural gas|silver|commodit|copper/i },
  ],
};

// The news feed shows a fixed, rolling 24h window of the freshest items — the
// user-selectable time-range chips (היום / אתמול / 48 שעות / השבוע) were removed
// in favour of "always show the latest". "Today" is always a subset of the last
// 24h (today's earliest item, at 00:00, is <24h old), so this single window
// already covers "last 24h + today's items".
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
// Quiet-time fallback: if nothing landed in the last 24h, show the newest N
// articles instead so the feed is never awkwardly empty.
const FEED_FALLBACK_COUNT = 20;

const RSS2JSON_BASE = 'https://api.rss2json.com/v1/api.json?rss_url=';

// Persist Hebrew translations (link -> {title,desc}) in localStorage so a
// component remount (market/tab toggle, reload) does NOT re-hit the worker's
// translate endpoint — that was a KV read/write amplifier. Shared across
// markets (keyed by unique article link); capped and TTL'd.
const HE_CACHE_KEY = 'tradeos_news_he_v1';      // feed: link -> {title, desc}
const CAL_HE_CACHE_KEY = 'tradeos_cal_he_v1';   // calendar: English title -> {title}
const HE_CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // match the worker's KV TTL
const HE_CACHE_MAX = 500;

function loadHeCache(key = HE_CACHE_KEY) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (raw && typeof raw.savedAt === 'number' && Date.now() - raw.savedAt < HE_CACHE_TTL && raw.map) {
      return raw.map;
    }
  } catch { /* corrupt/absent — start fresh */ }
  return {};
}

function saveHeCache(map, key = HE_CACHE_KEY) {
  try {
    const entries = Object.entries(map);
    const trimmed = entries.length > HE_CACHE_MAX
      ? Object.fromEntries(entries.slice(-HE_CACHE_MAX)) // insertion order → keep newest
      : map;
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), map: trimmed }));
  } catch { /* quota/full/private mode — non-fatal */ }
}

// ─── Economic Calendar (Forex Factory via allorigins proxy) ───
const WORKER_URL = WORKER_BASE;
const CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const CALENDAR_CACHE_KEY = 'tradeos_econ_calendar_v3';
const CALENDAR_CACHE_TTL = 60 * 60 * 1000; // 1 hour

const COUNTRIES = [
  { code: 'USD', flag: '\u{1F1FA}\u{1F1F8}', label: 'ארה"ב' },
  { code: 'EUR', flag: '\u{1F1EA}\u{1F1FA}', label: 'אירופה' },
  { code: 'GBP', flag: '\u{1F1EC}\u{1F1E7}', label: 'בריטניה' },
  { code: 'JPY', flag: '\u{1F1EF}\u{1F1F5}', label: 'יפן' },
  { code: 'AUD', flag: '\u{1F1E6}\u{1F1FA}', label: 'אוסטרליה' },
  { code: 'CAD', flag: '\u{1F1E8}\u{1F1E6}', label: 'קנדה' },
  { code: 'CHF', flag: '\u{1F1E8}\u{1F1ED}', label: 'שוויץ' },
  { code: 'NZD', flag: '\u{1F1F3}\u{1F1FF}', label: 'ניו זילנד' },
  { code: 'CNY', flag: '\u{1F1E8}\u{1F1F3}', label: 'סין' },
];

const COUNTRY_MAP = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

const IMPACT_STYLES = {
  High: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', label: '\u05D2\u05D1\u05D5\u05D4', dots: 3 },
  Medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', label: '\u05D1\u05D9\u05E0\u05D5\u05E0\u05D9', dots: 2 },
  Low: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: '\u05E0\u05DE\u05D5\u05DA', dots: 1 },
};

// Impact filter options (dropdown). Colored dot mirrors the row impact bars.
const IMPACT_OPTIONS = [
  { key: 'all', label: '\u05D4\u05DB\u05DC', dot: '' },
  { key: 'High', label: '\u05D2\u05D1\u05D5\u05D4', dot: 'bg-red-400' },
  { key: 'Medium', label: '\u05D1\u05D9\u05E0\u05D5\u05E0\u05D9', dot: 'bg-yellow-400' },
  { key: 'Low', label: '\u05E0\u05DE\u05D5\u05DA', dot: 'bg-blue-400' },
];

const DAY_NAMES = ['\u05D9\u05D5\u05DD \u05E8\u05D0\u05E9\u05D5\u05DF', '\u05D9\u05D5\u05DD \u05E9\u05E0\u05D9', '\u05D9\u05D5\u05DD \u05E9\u05DC\u05D9\u05E9\u05D9', '\u05D9\u05D5\u05DD \u05E8\u05D1\u05D9\u05E2\u05D9', '\u05D9\u05D5\u05DD \u05D7\u05DE\u05D9\u05E9\u05D9', '\u05D9\u05D5\u05DD \u05E9\u05D9\u05E9\u05D9', '\u05E9\u05D1\u05EA'];
const MONTH_NAMES = ['\u05D9\u05E0\u05D5\u05D0\u05E8', '\u05E4\u05D1\u05E8\u05D5\u05D0\u05E8', '\u05DE\u05E8\u05E5', '\u05D0\u05E4\u05E8\u05D9\u05DC', '\u05DE\u05D0\u05D9', '\u05D9\u05D5\u05E0\u05D9', '\u05D9\u05D5\u05DC\u05D9', '\u05D0\u05D5\u05D2\u05D5\u05E1\u05D8', '\u05E1\u05E4\u05D8\u05DE\u05D1\u05E8', '\u05D0\u05D5\u05E7\u05D8\u05D5\u05D1\u05E8', '\u05E0\u05D5\u05D1\u05DE\u05D1\u05E8', '\u05D3\u05E6\u05DE\u05D1\u05E8'];

// ─── Helpers ───
function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return '\u05E2\u05DB\u05E9\u05D9\u05D5';
  if (diffMins < 60) return `\u05DC\u05E4\u05E0\u05D9 ${diffMins} \u05D3\u05E7\u05D5\u05EA`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `\u05DC\u05E4\u05E0\u05D9 ${diffHours} \u05E9\u05E2\u05D5\u05EA`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '\u05D0\u05EA\u05DE\u05D5\u05DC';
  return `\u05DC\u05E4\u05E0\u05D9 ${diffDays} \u05D9\u05DE\u05D9\u05DD`;
}

function cleanHtml(html) {
  if (!html) return '';
  const text = html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
  return text.length > 200 ? text.substring(0, 200) + '...' : text;
}

function formatDateHebrew(dateStr) {
  const d = new Date(dateStr);
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} \u05D1${MONTH_NAMES[d.getMonth()]}`;
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function isSpeech(title) {
  const speechWords = ['speaks', 'speech', 'conference', 'testimony', 'press conf', 'statement', 'hearings', 'address'];
  return speechWords.some((w) => title.toLowerCase().includes(w));
}

function getDateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

// Parse a calendar value like "7.594M", "98K", "-3.775M", "4.2%" to a number.
function parseCalNum(v) {
  if (v == null) return null;
  const m = String(v).replace(/,/g, '').trim().match(/^(-?\d*\.?\d+)\s*([kmbt]?)/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const s = m[2].toLowerCase();
  if (s === 'k') n *= 1e3; else if (s === 'm') n *= 1e6; else if (s === 'b') n *= 1e9; else if (s === 't') n *= 1e12;
  return Number.isFinite(n) ? n : null;
}

// A higher-than-forecast actual is "good" (green) for most indicators; a small
// set inverts that (unemployment, jobless claims, inventories — lower/bigger
// draw is bullish). Best-effort, matches the common cases.
const CAL_LOWER_IS_BETTER = /unemploy|jobless|claimant|initial claims|inventories|crude oil|natural gas|oil stocks/i;
function actualTone(title, actual, forecast) {
  const a = parseCalNum(actual);
  const f = parseCalNum(forecast);
  if (a == null || f == null || a === f) return 'text-text-primary';
  const beat = CAL_LOWER_IS_BETTER.test(title) ? a < f : a > f;
  return beat ? 'text-profit' : 'text-loss';
}

// Forex-Factory-style impact strength: three rising bars, colour + fill by
// level. Holidays have no impact — show a "חופשה" label instead.
function ImpactBars({ impact }) {
  if (impact === 'Holiday') {
    return <span className="text-[10px] font-medium text-text-muted whitespace-nowrap">חופשה</span>;
  }
  const level = impact === 'High' ? 3 : impact === 'Medium' ? 2 : 1;
  const color = impact === 'High' ? 'bg-red-400' : impact === 'Medium' ? 'bg-yellow-400' : 'bg-blue-400';
  return (
    <span className="inline-flex items-end gap-0.5" dir="ltr" title={impact}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`w-1 rounded-sm ${i <= level ? color : 'bg-bg-tertiary'}`} style={{ height: `${3 + i * 3}px` }} />
      ))}
    </span>
  );
}


// ─── Economic Calendar Component ───
function EconomicCalendar() {
  const [events, setEvents] = useState(() => {
    try {
      const cached = localStorage.getItem(CALENDAR_CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        // Only use cache if it's fresh (within TTL)
        if (Date.now() - ts < CALENDAR_CACHE_TTL && Array.isArray(data) && data.length > 0) return data;
      }
    } catch { /* ignore */ }
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [impactFilter, setImpactFilter] = useState('all');
  const [selectedCountries, setSelectedCountries] = useState(new Set(['USD']));
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showImpactPicker, setShowImpactPicker] = useState(false);
  const [timePeriod, setTimePeriod] = useState('thisWeek');
  // English event title -> Hebrew (same worker translate endpoint as the news
  // feed, KV-cached by title; event names are a small recurring set so this is
  // near-free after the first pass). Persisted so a remount doesn't re-call.
  const [heMap, setHeMap] = useState(() => loadHeCache(CAL_HE_CACHE_KEY));

  const fetchCalendar = useCallback(async () => {
    // Check cache
    try {
      const cached = localStorage.getItem(CALENDAR_CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < CALENDAR_CACHE_TTL && Array.isArray(data) && data.length > 0) {
          setEvents(data);
          setLoading(false);
          return;
        }
      }
    } catch { /* ignore */ }

    if (events.length > 0) setLoading(false);
    else setLoading(true);
    setError(null);

    // Try our own worker first (reliable, server-side fetch), then fall back
    // to the public allorigins proxy if the worker is unavailable.
    const strategies = [
      {
        url: `${WORKER_URL}/calendar`,
        parse: (res) => res.json(),
      },
      {
        url: `https://api.allorigins.win/raw?url=${encodeURIComponent(CALENDAR_URL)}`,
        parse: (res) => res.json(),
      },
      {
        url: `https://api.allorigins.win/get?url=${encodeURIComponent(CALENDAR_URL)}`,
        parse: async (res) => {
          const json = await res.json();
          if (!json.contents) throw new Error('no contents');
          const parsed = JSON.parse(json.contents);
          return parsed;
        },
      },
    ];

    for (const strategy of strategies) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(strategy.url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        const data = await strategy.parse(res);
        if (!Array.isArray(data) || data.length === 0) continue;

        setEvents(data);
        try {
          localStorage.setItem(CALENDAR_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
        } catch { /* ignore */ }
        setLoading(false);
        return;
      } catch { /* try next */ }
    }

    if (events.length === 0) {
      setError('\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05E0\u05D5 \u05DC\u05D8\u05E2\u05D5\u05DF \u05D0\u05EA \u05D4\u05D9\u05D5\u05DE\u05DF \u05D4\u05DB\u05DC\u05DB\u05DC\u05D9. \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1 \u05D1\u05E2\u05D5\u05D3 \u05DE\u05E1\u05E4\u05E8 \u05D3\u05E7\u05D5\u05EA.');
    }
    setLoading(false);
  }, [events.length]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  // Translate the unique English event titles to Hebrew, in small batches.
  useEffect(() => {
    if (!events.length) return undefined;
    let cancelled = false;
    (async () => {
      // Only AI-translate what the professional dictionary doesn't already cover.
      const titles = [...new Set(events.map((e) => e.title).filter(Boolean))]
        .filter((t) => !heMap[t] && !hebrewEventTitle(t));
      for (let i = 0; i < titles.length && !cancelled; i += 12) {
        const chunk = titles.slice(i, i + 12);
        const res = await translateNews(chunk.map((t) => ({ title: t, desc: '' })));
        if (cancelled) return;
        if (res) {
          setHeMap((m) => {
            const next = { ...m };
            chunk.forEach((t, j) => { if (res[j]?.title) next[t] = res[j].title; });
            return next;
          });
        }
        if (i + 12 < titles.length) await new Promise((r) => setTimeout(r, 1500));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  useEffect(() => { saveHeCache(heMap, CAL_HE_CACHE_KEY); }, [heMap]);

  const toggleCountry = (code) => {
    setSelectedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const now = new Date();
    const today = getDateOnly(now);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const startOfThisWeek = new Date(today);
    startOfThisWeek.setDate(today.getDate() - today.getDay());

    let timeFiltered;
    switch (timePeriod) {
      case 'yesterday':
        timeFiltered = events.filter((e) => sameDay(new Date(e.date), yesterday));
        break;
      case 'today':
        timeFiltered = events.filter((e) => sameDay(new Date(e.date), today));
        break;
      case 'tomorrow':
        timeFiltered = events.filter((e) => sameDay(new Date(e.date), tomorrow));
        break;
      case 'thisWeek':
        timeFiltered = events;
        break;
      case 'upcoming':
        timeFiltered = events.filter((e) => new Date(e.date) >= now);
        break;
      default:
        timeFiltered = events;
        break;
    }

    return timeFiltered
      .filter((e) => selectedCountries.size === 0 || selectedCountries.has(e.country))
      .filter((e) => impactFilter === 'all' || e.impact === impactFilter);
  }, [events, timePeriod, selectedCountries, impactFilter]);

  // Group by date
  const sortedDays = useMemo(() => {
    const grouped = filtered.reduce((acc, event) => {
      const dateKey = new Date(event.date).toDateString();
      if (!acc[dateKey]) acc[dateKey] = { date: event.date, events: [] };
      acc[dateKey].events.push(event);
      return acc;
    }, {});
    return Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [filtered]);

  const timePeriods = [
    { key: 'yesterday', label: '\u05D0\u05EA\u05DE\u05D5\u05DC' },
    { key: 'today', label: '\u05D4\u05D9\u05D5\u05DD' },
    { key: 'tomorrow', label: '\u05DE\u05D7\u05E8' },
    { key: 'thisWeek', label: '\u05DB\u05DC \u05D4\u05E9\u05D1\u05D5\u05E2' },
    { key: 'upcoming', label: '\u05D4\u05D1\u05D0\u05D9\u05DD' },
  ];

  return (
    <>
      {/* Time Period Tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        {timePeriods.map((tp) => (
          <button
            key={tp.key}
            onClick={() => setTimePeriod(tp.key)}
            className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              timePeriod === tp.key
                ? 'bg-accent-primary text-white shadow-md shadow-accent-primary/20'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            {tp.label}
          </button>
        ))}
      </div>

      {/* Filters Row */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {/* Country Picker */}
        <div className="relative">
          <button
            onClick={() => setShowCountryPicker(!showCountryPicker)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary transition-colors"
          >
            <Globe className="w-4 h-4" />
            {'\u05DE\u05D3\u05D9\u05E0\u05D5\u05EA'} ({selectedCountries.size})
          </button>

          <AnimatePresence>
            {showCountryPicker && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-40"
                  onClick={() => setShowCountryPicker(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full mt-1 right-0 z-50 bg-bg-overlay border border-border-primary rounded-xl shadow-2xl p-3 min-w-[200px]"
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-border-primary">
                    <span className="text-xs font-semibold text-text-primary">{'\u05E1\u05D9\u05E0\u05D5\u05DF \u05DE\u05D3\u05D9\u05E0\u05D5\u05EA'}</span>
                    <button
                      onClick={() => {
                        if (selectedCountries.size === COUNTRIES.length) setSelectedCountries(new Set());
                        else setSelectedCountries(new Set(COUNTRIES.map((c) => c.code)));
                      }}
                      className="text-[10px] text-accent-primary hover:underline"
                    >
                      {selectedCountries.size === COUNTRIES.length ? '\u05E0\u05E7\u05D4 \u05D4\u05DB\u05DC' : '\u05D1\u05D7\u05E8 \u05D4\u05DB\u05DC'}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {COUNTRIES.map((c) => (
                      <button
                        key={c.code}
                        onClick={() => toggleCountry(c.code)}
                        className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm transition-colors ${
                          selectedCountries.has(c.code)
                            ? 'bg-accent-primary/15 text-accent-primary'
                            : 'text-text-secondary hover:bg-bg-tertiary'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                          selectedCountries.has(c.code)
                            ? 'border-accent-primary bg-accent-primary'
                            : 'border-border-primary'
                        }`}>
                          {selectedCountries.has(c.code) && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="text-base">{c.flag}</span>
                        <span className="flex-1 text-right">{c.label}</span>
                        <span className="text-[10px] text-text-muted">{c.code}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Impact Filter \u2014 dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowImpactPicker(!showImpactPicker)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary transition-colors"
          >
            <Filter className="w-4 h-4" />
            {IMPACT_OPTIONS.find((o) => o.key === impactFilter)?.label || IMPACT_OPTIONS[0].label}
          </button>

          <AnimatePresence>
            {showImpactPicker && (
              <>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 z-40" onClick={() => setShowImpactPicker(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full mt-1 right-0 z-50 bg-bg-overlay border border-border-primary rounded-xl shadow-2xl p-1.5 min-w-[150px]"
                >
                  {IMPACT_OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      onClick={() => { setImpactFilter(o.key); setShowImpactPicker(false); }}
                      className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-sm transition-colors ${
                        impactFilter === o.key ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-secondary hover:bg-bg-tertiary'
                      }`}
                    >
                      {o.dot && <span className={`w-2 h-2 rounded-full ${o.dot}`} />}
                      <span className="flex-1 text-right">{o.label}</span>
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Selected countries chips */}
      {selectedCountries.size > 0 && selectedCountries.size < COUNTRIES.length && (
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
          {[...selectedCountries].map((code) => {
            const c = COUNTRY_MAP[code];
            if (!c) return null;
            return (
              <span key={code} className="flex items-center gap-1 px-2 py-1 bg-bg-tertiary rounded-full text-xs text-text-primary">
                {c.flag} {c.label}
                <button onClick={() => toggleCountry(code)} className="text-text-muted hover:text-text-primary mr-0.5">&times;</button>
              </span>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-bg-secondary border border-border-primary rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-bg-tertiary rounded w-1/3 mb-3" />
              <div className="space-y-2">
                <div className="h-3 bg-bg-tertiary rounded w-full" />
                <div className="h-3 bg-bg-tertiary rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-8 text-center">
          <p className="text-text-muted mb-4">{error}</p>
          <button
            onClick={fetchCalendar}
            className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors"
          >
            {'\u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1'}
          </button>
        </div>
      )}

      {/* Calendar Events */}
      {!loading && !error && (
        <AnimatePresence mode="wait">
          <motion.div
            key={timePeriod + impactFilter + [...selectedCountries].join(',')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            {sortedDays.map((day, dayIdx) => {
              const dayDate = new Date(day.date);
              const today = getDateOnly(new Date());
              const isToday = sameDay(dayDate, today);

              return (
                <motion.div
                  key={day.date}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: dayIdx * 0.08 }}
                >
                  {/* Date Header */}
                  <div className={`rounded-lg px-4 py-2 mb-3 ${isToday ? 'bg-accent-primary/15 border border-accent-primary/30' : 'bg-bg-tertiary/50'}`}>
                    <h3 className={`text-sm font-semibold text-center ${isToday ? 'text-accent-primary' : 'text-text-primary'}`}>
                      {isToday ? `\u05D4\u05D9\u05D5\u05DD \u2014 ${formatDateHebrew(day.date)}` : formatDateHebrew(day.date)}
                    </h3>
                  </div>

                  {/* Events */}
                  <div className="space-y-2">
                    {day.events.map((event, i) => {
                      const impact = IMPACT_STYLES[event.impact] || IMPACT_STYLES.Low;
                      const country = COUNTRY_MAP[event.country];
                      const flag = country?.flag || '';
                      const speech = isSpeech(event.title);
                      const he = hebrewEventTitle(event.title) || heMap[event.title];
                      const hasA = event.actual != null && event.actual !== '';
                      const hasF = event.forecast != null && event.forecast !== '';
                      const hasP = event.previous != null && event.previous !== '';

                      return (
                        <motion.div
                          key={`${event.date}-${event.title}-${i}`}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2, delay: i * 0.03 }}
                          className={`bg-bg-secondary border rounded-lg px-3 py-2.5 border-r-2 ${impact.border} hover:bg-bg-tertiary/30 transition-colors`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Right rail: time on top; currency + flag + impact on one row */}
                            <div className="flex flex-col items-center gap-1 shrink-0 w-[74px]">
                              <span className="text-sm font-bold text-text-primary num-mono leading-none">{formatTime(event.date)}</span>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-semibold text-text-muted">{event.country}</span>
                                <span className="text-sm leading-none">{flag}</span>
                                <ImpactBars impact={event.impact} />
                              </div>
                            </div>

                            {/* Divider */}
                            <div className="self-stretch w-px bg-border-primary/50 shrink-0" />

                            {/* Main: title + values */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-1.5">
                                {speech && <Volume2 className="w-3.5 h-3.5 text-text-muted flex-shrink-0 mt-0.5" />}
                                <h4 className="text-sm font-semibold text-text-primary leading-snug" title={he ? event.title : undefined}>
                                  {he || event.title}
                                </h4>
                              </div>

                              {(hasA || hasF || hasP) && (
                                <div className="flex items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] flex-wrap">
                                  {hasA && (
                                    <span className="text-text-muted">
                                      {'\u05D1\u05E4\u05D5\u05E2\u05DC'} <span className={`font-bold ${actualTone(event.title, event.actual, event.forecast)}`}>{event.actual}</span>
                                    </span>
                                  )}
                                  {hasF && (
                                    <span className="text-text-muted">
                                      {'\u05E6\u05E4\u05D9'} <span className="text-text-secondary font-medium">{event.forecast}</span>
                                    </span>
                                  )}
                                  {hasP && (
                                    <span className="text-text-muted">
                                      {'\u05E7\u05D5\u05D3\u05DD'} <span className="text-text-secondary font-medium">{event.previous}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}

      {!loading && !error && filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-bg-secondary border border-border-primary rounded-xl p-8 text-center"
        >
          <CalendarDays className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">{'\u05D0\u05D9\u05DF \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD \u05DC\u05D4\u05E6\u05D2\u05D4'}</p>
        </motion.div>
      )}
    </>
  );
}

// ─── AI Brief — "מה חשוב עכשיו" ───
// Renders the cron-prepared AI digest (one build for all users, served from
// the worker's KV). Fails silent: no digest → the regular feed still works.
const BRIEF_IMPACT = {
  high: { label: 'השפעה גבוהה', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  medium: { label: 'בינוני', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
};

function AiBrief({ market }) {
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  // No reset-on-market-change needed: the page remounts this component when
  // the market toggle flips (keyed motion.div), so initial state covers it.
  useEffect(() => {
    let cancelled = false;
    fetchNewsDigest(market)
      .then((d) => { if (!cancelled) setDigest(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [market]);

  // Slow ticker-style rotation through the ranked stories; pauses on hover so
  // the user can read/click, and when there's only one story.
  const count = digest?.stories?.length || 0;
  useEffect(() => {
    if (count < 2 || paused) return undefined;
    const t = setInterval(() => setIdx((i) => (i + 1) % count), 7000);
    return () => clearInterval(t);
  }, [count, paused]);

  if (loading) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 mb-6 animate-pulse">
        <div className="h-3 bg-bg-tertiary rounded w-24 mb-2.5" />
        <div className="h-4 bg-bg-tertiary rounded w-3/4 mb-2" />
        <div className="h-3 bg-bg-tertiary rounded w-1/2" />
      </div>
    );
  }
  if (!count) return null;

  const story = digest.stories[idx % count];
  const impact = BRIEF_IMPACT[story.impact] || BRIEF_IMPACT.medium;
  const mainLink = story.sources?.[0]?.link;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2.5">
        <BrainCircuit className="w-5 h-5" style={{ stroke: 'url(#ai-grad)' }} />
        <h2 className="text-base font-bold text-gradient">מה חשוב עכשיו</h2>
        {digest.updatedAt > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-text-muted mr-auto">
            <RefreshCw className="w-3 h-3" /> עודכן {timeAgo(digest.updatedAt)}
          </span>
        )}
      </div>

      {/* Single rolling card */}
      <div
        className={`relative overflow-hidden bg-bg-secondary border rounded-xl ${
          story.impact === 'high' ? 'border-red-500/30' : 'border-border-primary'
        }`}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={idx % count}
            initial={{ y: 26, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -26, opacity: 0 }}
            transition={{ duration: 0.45, ease: 'easeInOut' }}
            className="p-4 min-h-[104px]"
          >
            {mainLink ? (
              <a href={mainLink} target="_blank" rel="noopener noreferrer" className="group block">
                <BriefStoryBody story={story} impact={impact} rank={(idx % count) + 1} count={count} />
              </a>
            ) : (
              <BriefStoryBody story={story} impact={impact} rank={(idx % count) + 1} count={count} />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Dots — jump to a specific story */}
        <div className="flex items-center justify-center gap-1.5 pb-2.5">
          {digest.stories.map((s, i) => (
            <button
              key={`${s.headline}-${i}`}
              onClick={() => setIdx(i)}
              aria-label={`סיפור ${i + 1}`}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                i === idx % count ? 'w-4 bg-accent-primary' : 'w-1.5 bg-border-primary hover:bg-text-muted'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BriefStoryBody({ story, impact, rank, count }) {
  return (
    <>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] font-bold text-text-muted num-mono">{rank}/{count}</span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${impact.cls}`}>
          {impact.label}
        </span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-bg-tertiary text-text-secondary">
          {story.category}
        </span>
      </div>
      <p className="text-sm sm:text-base font-semibold text-text-primary group-hover:text-accent-primary transition-colors leading-snug">
        {story.headline}
      </p>
      <p className="text-xs text-text-muted mt-1 line-clamp-2">{story.why}</p>
      <div className="flex items-center gap-2.5 mt-2 flex-wrap">
        {(story.sources || []).map((src) => (
          <span key={src.link} className="flex items-center gap-1 text-[10px] text-text-muted">
            <ExternalLink className="w-2.5 h-2.5" /> {src.label}
          </span>
        ))}
      </div>
    </>
  );
}

// ─── Feed filtering helpers ───
// A fixed 24h rolling window replaces the old user-selectable range. Items with
// an unparseable date are excluded here (they can still surface via the
// newest-N fallback, where they already sort last).
function isRecent(dateStr) {
  const t = new Date(dateStr).getTime();
  return Number.isFinite(t) && Date.now() - t <= RECENT_WINDOW_MS;
}

function dayLabel(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'לא ידוע';
  const now = new Date();
  if (sameDay(d, now)) return 'היום';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (sameDay(d, y)) return 'אתמול';
  return `${d.getDate()} ב${MONTH_NAMES[d.getMonth()]}`;
}

// ─── News Feed Component ───
function NewsFeed({ market }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState('all');
  const [error, setError] = useState(null);
  const [heMap, setHeMap] = useState(loadHeCache); // link -> { title, desc } (Hebrew)

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const results = await Promise.allSettled(
        FEED_SOURCES[market].map(async (source) => {
          const res = await fetch(`${RSS2JSON_BASE}${encodeURIComponent(source.rss)}`);
          if (!res.ok) throw new Error(`${source.key} failed`);
          const data = await res.json();
          if (data.status !== 'ok') throw new Error(`${source.key} status error`);
          return (data.items || []).map((item) => ({
            title: item.title,
            // Strip WordPress-feed boilerplate ("The post X appeared first on Y")
            description: cleanHtml(item.description || item.content).replace(/The post .*$/i, '').trim(),
            thumbnail: safeHttpUrl(item.thumbnail || item.enclosure?.link),
            link: safeHttpUrl(item.link) || '#',
            pubDate: item.pubDate,
            author: item.author || source.label,
            sourceKey: source.key,
            sourceLabel: source.label,
          }));
        })
      );

      // Sort newest-first; items with an unparseable date sort to the end
      // (as -Infinity) so they stay contiguous and don't split day-groups.
      const ts = (d) => { const t = new Date(d).getTime(); return Number.isFinite(t) ? t : -Infinity; };
      // De-dupe syndicated articles that share a URL (keep first); '#'
      // (scheme-rejected) links are never treated as duplicates of each other.
      const seenLinks = new Set();
      const allArticles = results
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) => r.value)
        .filter((a) => {
          if (a.link === '#') return true;
          if (seenLinks.has(a.link)) return false;
          seenLinks.add(a.link);
          return true;
        })
        .sort((a, b) => ts(b.pubDate) - ts(a.pubDate));

      if (allArticles.length === 0) {
        setError('\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05E0\u05D5 \u05DC\u05D8\u05E2\u05D5\u05DF \u05D7\u05D3\u05E9\u05D5\u05EA. \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1 \u05DE\u05D0\u05D5\u05D7\u05E8 \u05D9\u05D5\u05EA\u05E8.');
      }
      setArticles(allArticles);
    } catch {
      setError('\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA \u05D4\u05D7\u05D3\u05E9\u05D5\u05EA');
    } finally {
      setLoading(false);
    }
  }, [market]);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  // Translate the freshest articles to Hebrew in small batches. The worker
  // caches per-article in KV, so repeat loads (and other users) are free.
  // A failed batch (usually a provider per-minute token limit) skips ahead
  // instead of aborting — whatever was cached still lands, and the 5-minute
  // feed refresh naturally retries the rest.
  useEffect(() => {
    if (!articles.length) return undefined;
    let cancelled = false;
    (async () => {
      const top = articles.slice(0, 48);
      for (let i = 0; i < top.length && !cancelled; i += 12) {
        const chunk = top.slice(i, i + 12).filter((a) => !heMap[a.link]);
        if (!chunk.length) continue;
        const res = await translateNews(chunk.map((a) => ({
          title: a.title,
          desc: (a.description || '').slice(0, 200),
        })));
        if (cancelled) return;
        if (res) {
          setHeMap((m) => {
            const next = { ...m };
            chunk.forEach((a, j) => { if (res[j]?.title) next[a.link] = res[j]; });
            return next;
          });
        }
        // Spread batches out so we stay under the provider's per-minute budget.
        if (i + 12 < top.length) await new Promise((r) => setTimeout(r, 1500));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles]);

  // Persist translations so a remount hydrates from localStorage instead of
  // re-calling the worker (KV read/write saver).
  useEffect(() => { saveHeCache(heMap); }, [heMap]);

  const topics = TOPICS[market];

  // Base feed = the fixed 24h window of freshest news, newest-first (articles
  // arrive pre-sorted). Quiet-time fallback: if the 24h window is empty, show
  // the newest N so the feed is never awkwardly blank. "Today" is a subset of
  // the 24h window, so no separate "today" pass is needed.
  const baseFeed = useMemo(() => {
    const recent = articles.filter((a) => isRecent(a.pubDate));
    return recent.length > 0 ? recent : articles.slice(0, FEED_FALLBACK_COUNT);
  }, [articles]);

  // Category chips are derived from the feed itself: only categories with ≥1
  // matching article in the current feed are shown (each with a live count),
  // "הכל" always first. Hiding empty categories keeps the chip row professional.
  const visibleTopics = useMemo(() => (
    topics
      .map((t) => ({
        ...t,
        count: t.re
          ? baseFeed.filter((a) => t.re.test(`${a.title} ${a.description}`)).length
          : baseFeed.length,
      }))
      .filter((t) => !t.re || t.count > 0)
  ), [topics, baseFeed]);

  // Resolve the active chip against the *visible* set, so a category that just
  // dropped out of the feed gracefully falls back to "הכל" (always present,
  // always first) instead of leaving the feed empty with no active chip.
  const activeTopic = visibleTopics.find((t) => t.key === topic) || visibleTopics[0];
  const filtered = activeTopic.re
    ? baseFeed.filter((a) => activeTopic.re.test(`${a.title} ${a.description}`))
    : baseFeed;

  // Group by calendar day, newest first (articles arrive pre-sorted).
  const groups = [];
  for (const article of filtered) {
    const label = dayLabel(article.pubDate);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(article);
    else groups.push({ label, items: [article] });
  }

  return (
    <>
      {/* AI brief — what actually matters right now */}
      <AiBrief market={market} />

      {/* Category chips — dynamic: only categories actually present in the
          current feed, "הכל" first, each with a live count. The whole row is
          hidden when there's nothing to choose between (feed still loading, or
          only "הכל" would show). */}
      {/* Category filter — a professional dropdown (like the rest of the app)
          instead of a scrolling chip row. Only categories present in the
          current feed are listed, each with its live count. */}
      {visibleTopics.length > 1 && (
        <div className="flex items-center justify-center gap-2 mb-6">
          <Filter className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          <div className="w-48">
            <SelectDropdown
              compact
              value={topic}
              onChange={(v) => setTopic(v || 'all')}
              options={visibleTopics.map((t) => ({
                value: t.key,
                label: t.re ? `${t.label} · ${t.count}` : t.label,
              }))}
              placeholder="כל הקטגוריות"
            />
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-bg-secondary border border-border-primary rounded-xl p-4 animate-pulse">
              <div className="flex gap-4">
                <div className="w-24 h-24 bg-bg-tertiary rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-3">
                  <div className="h-4 bg-bg-tertiary rounded w-3/4" />
                  <div className="h-3 bg-bg-tertiary rounded w-full" />
                  <div className="h-3 bg-bg-tertiary rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-8 text-center">
          <p className="text-text-muted mb-4">{error}</p>
          <button
            onClick={() => fetchNews()}
            className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors"
          >
            {'\u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1'}
          </button>
        </div>
      )}

      {/* Articles */}
      {!loading && !error && (
        <AnimatePresence mode="popLayout">
          <div className="space-y-4">
            {groups.map((group, gi) => (
              <div key={`${group.label}-${gi}`}>
                {/* Day header */}
                <div className="flex items-center gap-3 mb-3 mt-2">
                  <h3 className="text-sm font-bold text-text-primary">{group.label}</h3>
                  <span className="text-[11px] text-text-muted">{group.items.length} כתבות</span>
                  <div className="flex-1 h-px bg-border-primary" />
                </div>
                <div className="space-y-4">
                  {group.items.map((article, i) => (
                    <motion.a
                      key={`${article.link}-${i}`}
                      href={article.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3, delay: i < 10 ? i * 0.05 : 0 }}
                      className="block bg-bg-secondary border border-border-primary rounded-xl p-4 hover:border-accent-primary/50 hover:bg-bg-tertiary/50 transition-all group"
                    >
                      <div className="flex gap-4">
                        {article.thumbnail && (
                          <div className="w-24 h-24 md:w-32 md:h-24 flex-shrink-0 rounded-lg overflow-hidden bg-bg-tertiary">
                            <img
                              src={article.thumbnail}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => { e.target.style.display = 'none'; }}
                              loading="lazy"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm md:text-base font-semibold text-text-primary mb-1.5 line-clamp-2 group-hover:text-accent-primary transition-colors" title={heMap[article.link] ? article.title : undefined}>
                            {heMap[article.link]?.title || article.title}
                          </h3>
                          <p className="text-xs md:text-sm text-text-muted line-clamp-2 mb-2 hidden sm:block">
                            {heMap[article.link]?.desc || article.description}
                          </p>
                          <div className="flex items-center gap-3 text-[11px] text-text-muted">
                            <span className="px-2 py-0.5 bg-bg-tertiary rounded-full font-medium">
                              {article.sourceLabel}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {timeAgo(article.pubDate)}
                            </span>
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </div>
                    </motion.a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* An empty feed now only means genuinely no data (covered by the
          loading/error states above): dynamic chips never leave a category
          empty, and the newest-N fallback keeps quiet times from going blank. */}
    </>
  );
}

// ─── Main Page ───
export default function NewsPage() {
  const [activeTab, setActiveTab] = useState('news');
  const [market, setMarket] = useState('crypto');

  const tabs = [
    { key: 'news', label: '\u05D7\u05D3\u05E9\u05D5\u05EA', icon: Newspaper },
    { key: 'calendar', label: '\u05D9\u05D5\u05DE\u05DF \u05DB\u05DC\u05DB\u05DC\u05D9', icon: CalendarDays },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-24 lg:pb-6">
      {/* Header with Tabs — a shared layoutId pill slides between the active
          tab instead of a hard color swap (21st.dev animated-tabs look). */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                active ? 'text-white' : 'bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="news-tab-pill"
                  className="absolute inset-0 rounded-xl bg-accent-primary shadow-lg shadow-accent-primary/25"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <tab.icon className="w-4.5 h-4.5" />
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Market toggle — crypto ⇄ stocks (news tab only) */}
      {activeTab === 'news' && (
        <div className="flex items-center justify-center mb-6">
          <div className="inline-flex bg-bg-secondary border border-border-primary rounded-full p-1">
            {[
              { key: 'crypto', label: 'קריפטו', Icon: Bitcoin },
              { key: 'stocks', label: 'מניות', Icon: CandlestickChart },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => setMarket(m.key)}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  market === m.key
                    ? 'bg-accent-primary text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <m.Icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${activeTab}-${market}`}
          initial={{ opacity: 0, x: activeTab === 'news' ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: activeTab === 'news' ? 20 : -20 }}
          transition={{ duration: 0.25 }}
        >
          {activeTab === 'news' ? (
            <>
              {/* Deterministic, cron-prepared: costs no AI call and states no
                  direction. Crypto only — the attribution engine is keyed on
                  crypto tickers. */}
              {market === 'crypto' && <WhyItMoved />}
              <NewsFeed market={market} />
            </>
          ) : <EconomicCalendar />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
