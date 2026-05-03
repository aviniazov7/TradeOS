import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, BookOpen, ClipboardList, FlaskConical } from 'lucide-react';
import { getUserCollectionDocs } from '../../services/firestoreService';
import { useAuth } from '../../contexts/AuthContext';

const SEARCHABLE = [
  { key: 'trades', label: 'עסקאות', icon: BookOpen, path: '/journal', fields: ['pair', 'strategy', 'notes', 'entryReason'] },
  { key: 'tradingPlans', label: 'תוכניות', icon: ClipboardList, path: '/plans', fields: ['name', 'description', 'entryRules', 'exitRules', 'notes'] },
  { key: 'backtests', label: 'בקטסטים', icon: FlaskConical, path: '/backtest', fields: ['pair', 'strategy', 'notes'] },
];

export default function GlobalSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Load all data once on first focus
  const loadData = async () => {
    if (allData || !user) return;
    setLoading(true);
    const data = {};
    for (const { key } of SEARCHABLE) {
      data[key] = await getUserCollectionDocs(user.uid, key);
    }
    setAllData(data);
    setLoading(false);
  };

  // Search through loaded data
  useEffect(() => {
    if (!query.trim() || !allData) {
      setResults([]);
      return;
    }

    const q = query.toLowerCase();
    const found = [];

    for (const config of SEARCHABLE) {
      const items = allData[config.key] || [];
      for (const item of items) {
        const match = config.fields.some((field) => {
          const val = item[field];
          return val && String(val).toLowerCase().includes(q);
        });
        if (match) {
          found.push({
            ...item,
            _type: config.key,
            _label: config.label,
            _icon: config.icon,
            _path: config.path,
            _title: item.pair || item.name || item.title || config.label,
          });
        }
      }
      if (found.length >= 8) break;
    }

    setResults(found.slice(0, 8));
  }, [query, allData]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (result) => {
    navigate(result._path);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative hidden sm:block shrink-0">
      <div className="flex items-center gap-2 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 w-40 md:w-56">
        <Search className="w-4 h-4 text-text-muted shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { setOpen(true); loadData(); }}
          placeholder="חיפוש..."
          className="bg-transparent text-sm text-text-primary placeholder-text-muted outline-none w-full"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); }} className="text-text-muted hover:text-text-primary cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {open && query.trim() && (
        <div className="absolute top-full mt-2 right-0 w-72 md:w-80 bg-bg-overlay border border-border-primary rounded-xl shadow-lg overflow-hidden z-50">
          {loading ? (
            <div className="px-4 py-6 text-center text-sm text-text-muted">טוען...</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-text-muted">לא נמצאו תוצאות</div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {results.map((result, i) => {
                const Icon = result._icon;
                return (
                  <button
                    key={`${result._type}-${result.id}-${i}`}
                    onClick={() => handleSelect(result)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary last:border-0"
                  >
                    <Icon className="w-4 h-4 text-text-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">{result._title}</p>
                      <p className="text-[10px] text-text-muted">{result._label}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
