import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Newspaper, ExternalLink, Clock, Filter, CalendarDays, Volume2, Globe } from 'lucide-react';

// ─── News Sources ───
const SOURCES = [
  { key: 'cointelegraph', label: 'CoinTelegraph', rss: 'https://cointelegraph.com/rss' },
  { key: 'coindesk', label: 'CoinDesk', rss: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { key: 'decrypt', label: 'Decrypt', rss: 'https://decrypt.co/feed' },
  { key: 'bitcoinmagazine', label: 'Bitcoin Magazine', rss: 'https://bitcoinmagazine.com/.rss/full/' },
  { key: 'theblock', label: 'The Block', rss: 'https://www.theblock.co/rss.xml' },
  { key: 'beincrypto', label: 'BeInCrypto', rss: 'https://beincrypto.com/feed/' },
  { key: 'cryptoslate', label: 'CryptoSlate', rss: 'https://cryptoslate.com/feed/' },
  { key: 'utoday', label: 'U.Today', rss: 'https://u.today/rss' },
];

const RSS2JSON_BASE = 'https://api.rss2json.com/v1/api.json?rss_url=';

// ─── Economic Calendar (Forex Factory via allorigins proxy) ───
const CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const CALENDAR_CACHE_KEY = 'tradeos_econ_calendar_v3';
const CALENDAR_CACHE_TTL = 60 * 60 * 1000; // 1 hour

const COUNTRIES = [
  { code: 'USD', flag: '\u{1F1FA}\u{1F1F8}', label: '\u05D0\u05E8\u05D4"\u05D1' },
  { code: 'EUR', flag: '\u{1F1EA}\u{1F1FA}', label: '\u05D0\u05D9\u05E8\u05D5\u05E4\u05D4' },
  { code: 'GBP', flag: '\u{1F1EC}\u{1F1E7}', label: '\u05D1\u05E8\u05D9\u05D8\u05E0\u05D9\u05D4' },
  { code: 'JPY', flag: '\u{1F1EF}\u{1F1F5}', label: '\u05D9\u05E4\u05DF' },
  { code: 'AUD', flag: '\u{1F1E6}\u{1F1FA}', label: '\u05D0\u05D5\u05E1\u05D8\u05E8\u05DC\u05D9\u05D4' },
  { code: 'CAD', flag: '\u{1F1E8}\u{1F1E6}', label: '\u05E7\u05E0\u05D3\u05D4' },
  { code: 'CHF', flag: '\u{1F1E8}\u{1F1ED}', label: '\u05E9\u05D5\u05D5\u05D9\u05E5' },
  { code: 'NZD', flag: '\u{1F1F3}\u{1F1FF}', label: '\u05E0\u05D9\u05D5 \u05D6\u05D9\u05DC\u05E0\u05D3' },
  { code: 'CNY', flag: '\u{1F1E8}\u{1F1F3}', label: '\u05E1\u05D9\u05DF' },
];

const COUNTRY_MAP = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

const IMPACT_STYLES = {
  High: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', label: '\u05D2\u05D1\u05D5\u05D4', dots: 3 },
  Medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', label: '\u05D1\u05D9\u05E0\u05D5\u05E0\u05D9', dots: 2 },
  Low: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: '\u05E0\u05DE\u05D5\u05DA', dots: 1 },
};

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
  const [timePeriod, setTimePeriod] = useState('thisWeek');

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

    // Try allorigins/raw first, then allorigins/get as fallback
    const strategies = [
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

        {/* Impact Filter */}
        <div className="flex items-center gap-1.5">
          {[
            { key: 'all', label: '\u05D4\u05DB\u05DC' },
            { key: 'High', label: '\u05D2\u05D1\u05D5\u05D4' },
            { key: 'Medium', label: '\u05D1\u05D9\u05E0\u05D5\u05E0\u05D9' },
            { key: 'Low', label: '\u05E0\u05DE\u05D5\u05DA' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setImpactFilter(f.key)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                impactFilter === f.key
                  ? 'bg-accent-primary text-white'
                  : 'bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
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

                      return (
                        <motion.div
                          key={`${event.date}-${event.title}-${i}`}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2, delay: i * 0.03 }}
                          className={`bg-bg-secondary border rounded-xl p-3 md:p-4 ${impact.border} hover:bg-bg-tertiary/30 transition-colors`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Time + Flag */}
                            <div className="flex flex-col items-center gap-1 min-w-[50px]">
                              <span className="text-sm font-bold text-text-primary">{formatTime(event.date)}</span>
                              <span className="text-lg">{flag}</span>
                              <span className="text-[10px] font-medium text-text-muted">{event.country}</span>
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {speech && <Volume2 className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />}
                                <h4 className="text-sm font-semibold text-text-primary truncate">{event.title}</h4>
                              </div>

                              {(event.actual || event.forecast || event.previous) && (
                                <div className="flex items-center gap-4 mt-1.5 text-xs">
                                  {event.actual && (
                                    <span className="text-text-muted">
                                      {'\u05D1\u05E4\u05D5\u05E2\u05DC'} <span className="text-profit font-bold">{event.actual}</span>
                                    </span>
                                  )}
                                  {event.forecast && (
                                    <span className="text-text-muted">
                                      {'\u05E6\u05E4\u05D9'} <span className="text-text-primary font-medium">{event.forecast}</span>
                                    </span>
                                  )}
                                  {event.previous && (
                                    <span className="text-text-muted">
                                      {'\u05E7\u05D5\u05D3\u05DD'} <span className="text-text-primary font-medium">{event.previous}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Impact Dots */}
                            <div className="flex gap-0.5 flex-shrink-0 pt-1">
                              {[1, 2, 3].map((dot) => (
                                <div
                                  key={dot}
                                  className={`w-2.5 h-2.5 rounded-full ${
                                    dot <= impact.dots
                                      ? event.impact === 'High' ? 'bg-red-400' : event.impact === 'Medium' ? 'bg-yellow-400' : 'bg-blue-400'
                                      : 'bg-bg-tertiary'
                                  }`}
                                />
                              ))}
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

// ─── News Feed Component ───
function NewsFeed() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [error, setError] = useState(null);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const results = await Promise.allSettled(
        SOURCES.map(async (source) => {
          const res = await fetch(`${RSS2JSON_BASE}${encodeURIComponent(source.rss)}`);
          if (!res.ok) throw new Error(`${source.key} failed`);
          const data = await res.json();
          if (data.status !== 'ok') throw new Error(`${source.key} status error`);
          return (data.items || []).map((item) => ({
            title: item.title,
            description: cleanHtml(item.description || item.content),
            thumbnail: item.thumbnail || item.enclosure?.link || null,
            link: item.link,
            pubDate: item.pubDate,
            author: item.author || source.label,
            sourceKey: source.key,
            sourceLabel: source.label,
          }));
        })
      );

      const allArticles = results
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) => r.value)
        .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

      if (allArticles.length === 0) {
        setError('\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05E0\u05D5 \u05DC\u05D8\u05E2\u05D5\u05DF \u05D7\u05D3\u05E9\u05D5\u05EA. \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1 \u05DE\u05D0\u05D5\u05D7\u05E8 \u05D9\u05D5\u05EA\u05E8.');
      }
      setArticles(allArticles);
    } catch {
      setError('\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA \u05D4\u05D7\u05D3\u05E9\u05D5\u05EA');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  const filtered = activeFilter === 'all'
    ? articles
    : articles.filter((a) => a.sourceKey === activeFilter);

  return (
    <>
      {/* Source Filters */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        <Filter className="w-4 h-4 text-text-muted flex-shrink-0" />
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            activeFilter === 'all'
              ? 'bg-accent-primary text-white'
              : 'bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary'
          }`}
        >
          {'\u05D4\u05DB\u05DC'}
        </button>
        {SOURCES.map((source) => (
          <button
            key={source.key}
            onClick={() => setActiveFilter(source.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeFilter === source.key
                ? 'bg-accent-primary text-white'
                : 'bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary'
            }`}
          >
            {source.label}
          </button>
        ))}
      </div>

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
            {filtered.map((article, i) => (
              <motion.a
                key={article.link}
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
                    <h3 className="text-sm md:text-base font-semibold text-text-primary mb-1.5 line-clamp-2 group-hover:text-accent-primary transition-colors">
                      {article.title}
                    </h3>
                    <p className="text-xs md:text-sm text-text-muted line-clamp-2 mb-2 hidden sm:block">
                      {article.description}
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
        </AnimatePresence>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-8 text-center">
          <Newspaper className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">{'\u05D0\u05D9\u05DF \u05D7\u05D3\u05E9\u05D5\u05EA \u05DC\u05D4\u05E6\u05D2\u05D4 \u05E2\u05D1\u05D5\u05E8 \u05DE\u05E7\u05D5\u05E8 \u05D6\u05D4'}</p>
        </div>
      )}
    </>
  );
}

// ─── Main Page ───
export default function NewsPage() {
  const [activeTab, setActiveTab] = useState('news');

  const tabs = [
    { key: 'news', label: '\u05D7\u05D3\u05E9\u05D5\u05EA', icon: Newspaper },
    { key: 'calendar', label: '\u05D9\u05D5\u05DE\u05DF \u05DB\u05DC\u05DB\u05DC\u05D9', icon: CalendarDays },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-24 lg:pb-6">
      {/* Header with Tabs */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab.key
                ? 'bg-accent-primary text-white shadow-lg shadow-accent-primary/25'
                : 'bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            <tab.icon className="w-4.5 h-4.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: activeTab === 'news' ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: activeTab === 'news' ? 20 : -20 }}
          transition={{ duration: 0.25 }}
        >
          {activeTab === 'news' ? <NewsFeed /> : <EconomicCalendar />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
