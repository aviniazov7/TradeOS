import { useState, useRef } from 'react';
import { Upload, FileText, AlertCircle, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../shared/Modal';
import { DEFAULT_LEVERAGE } from '../../utils/constants';

const COLUMN_MAP = {
  pair: ['pair', 'symbol', 'coin', 'market', 'instrument', 'זוג'],
  direction: ['direction', 'side', 'type', 'כיוון'],
  entryPrice: ['entryprice', 'entry_price', 'entry', 'open_price', 'openprice', 'open price', 'price open', 'מחיר כניסה', 'כניסה'],
  exitPrice: ['exitprice', 'exit_price', 'exit', 'close_price', 'closeprice', 'close price', 'price close', 'מחיר יציאה', 'סגירה'],
  stopLoss: ['stoploss', 'stop_loss', 'sl', 's/l', 'סטופ', 'סטופ לוס'],
  positionSize: ['positionsize', 'position_size', 'size', 'amount', 'qty', 'quantity', 'volume', 'lots', 'lot', 'גודל', 'גודל עסקה'],
  leverage: ['leverage', 'lev', 'מינוף'],
  fees: ['fees', 'fee', 'commission', 'עמלות'],
  // MT5 / forex brokers report realized profit directly — use it instead of
  // recomputing from price×qty, which is wrong when contract sizes vary (lots).
  profit: ['profit', 'pnl', 'p/l', 'p&l', 'net p/l', 'realized', 'realized pnl', 'רווח', 'רווח/הפסד'],
  entryDate: ['entrydate', 'entry_date', 'open_date', 'opendate', 'open time', 'date', 'תאריך כניסה', 'תאריך'],
  exitDate: ['exitdate', 'exit_date', 'close_date', 'closedate', 'close time', 'תאריך יציאה'],
  strategy: ['strategy', 'אסטרטגיה'],
  notes: ['notes', 'comment', 'הערות'],
};

function autoMapColumns(headers) {
  const mapping = {};
  for (const header of headers) {
    const lower = header.toLowerCase().trim();
    for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
      if (aliases.includes(lower) && !mapping[field]) {
        mapping[field] = header;
        break;
      }
    }
  }
  return mapping;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue; }
      current += char;
    }
    values.push(current.trim());

    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });

  return { headers, rows };
}

// Numeric cell → number, surviving thousands separators and a European
// decimal comma. parseFloat("1,234.56") silently returns 1 (truncated at the
// first comma, no NaN), so the || 0 guard never fired and the wrong price
// corrupted quantity and every downstream P&L.
function parseNumber(val) {
  if (typeof val === 'number') return val;
  let s = String(val ?? '').trim().replace(/[\s$€£₪]/g, '');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Both present — the RIGHTMOST one is the decimal separator.
    s = lastComma > lastDot
      ? s.replace(/\./g, '').replace(',', '.') // 1.234,56 (European)
      : s.replace(/,/g, ''); // 1,234.56 (US)
  } else if (lastComma > -1) {
    // Commas only: groups of exactly 3 digits are thousands (1,234,567);
    // anything else is a European decimal comma (12,5).
    const parts = s.split(',');
    const isThousands = parts.length > 1 &&
      parts.slice(1).every((p) => /^\d{3}$/.test(p)) && /^-?\d{1,3}$/.test(parts[0]);
    s = isThousands ? parts.join('') : parts.join('.');
  }
  return parseFloat(s);
}

// new Date(y, m, d) silently rolls out-of-range parts over (month 13 →
// February next year) — reject those instead, so a garbage cell counts as
// unparseable rather than importing with a fabricated date.
function buildDate(y, mo, d, h, mi, s) {
  const dt = new Date(+y, +mo - 1, +d, +h, +mi, +s);
  return dt.getFullYear() === +y && dt.getMonth() === +mo - 1 && dt.getDate() === +d &&
    dt.getHours() === +h && dt.getMinutes() === +mi
    ? dt : null;
}

function parseDate(val) {
  if (!val) return null;
  // MT5/MetaTrader format — "2024.01.15 09:30:00" (also yyyy-MM-dd and
  // yyyy/MM/dd, time optional). new Date() on the dotted form fails in
  // Firefox/Safari, which used to stamp TODAY on every imported trade.
  const iso = val.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) {
    const [, y, mo, d, h = 0, mi = 0, s = 0] = iso;
    return buildDate(y, mo, d, h, mi, s);
  }
  // Handle dd/MM/yyyy (TradeOS export) with a guard for US MM/dd/yyyy files:
  // if the first field is >12 it must be the day (dd/MM); if the second field
  // is >12 it must be the day (MM/dd). Otherwise it's ambiguous → assume dd/MM.
  // Time is optional so "15/01/2024 09:30" doesn't fall through to new Date().
  const parts = val.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (parts) {
    const [, a, b, year, h = 0, mi = 0, s = 0] = parts;
    const first = parseInt(a, 10);
    const second = parseInt(b, 10);
    const [day, month] = second > 12 && first <= 12 ? [second, first] : [first, second];
    return buildDate(year, month, day, h, mi, s);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeDirection(val) {
  const lower = (val || '').toLowerCase().trim();
  if (['long', 'buy', 'לונג'].includes(lower)) return 'long';
  if (['short', 'sell', 'שורט'].includes(lower)) return 'short';
  return 'long';
}

export default function ImportTrades({ isOpen, onClose, onImport, onImportBulk }) {
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const { headers, rows } = parseCSV(text);
      setParsed({ headers, rows });
      setColumnMapping(autoMapColumns(headers));
    };
    reader.readAsText(f);
  };

  const updateMapping = (field, header) => {
    setColumnMapping((prev) => ({ ...prev, [field]: header || undefined }));
  };

  const handleImport = async () => {
    if (!parsed?.rows.length) return;
    setImporting(true);

    const allRows = parsed.rows.map((row) => {
      const get = (field) => {
        const col = columnMapping[field];
        return col ? row[col] : '';
      };

      const entryPrice = parseNumber(get('entryPrice')) || 0;
      const exitPrice = parseNumber(get('exitPrice')) || 0;
      const pair = get('pair') || 'BTCUSDT';
      const positionSize = parseNumber(get('positionSize')) || 0;
      const rawLeverage = Math.round(parseNumber(get('leverage'))) || DEFAULT_LEVERAGE;
      const leverage = Math.min(200, Math.max(1, rawLeverage));
      // Calculate quantity from positionSize — required for PnL calculation
      const quantity = entryPrice > 0 && positionSize > 0
        ? positionSize / entryPrice
        : 0;

      const profitRaw = get('profit');
      const profitNum = parseNumber(profitRaw);
      const hasProfit = profitRaw !== '' && profitRaw != null && !isNaN(profitNum);
      // A broker-reported profit means the position is closed even if no exit price column exists
      const status = exitPrice > 0 || hasProfit ? 'closed' : 'open';

      // A mapped date column whose value we CAN'T parse means we'd silently
      // stamp today on a historical trade (corrupting the equity curve and
      // calendar) — mark the row so it's skipped instead. An unmapped column
      // or an empty cell keeps the old today-fallback: there's no date to lie
      // about.
      const entryDateRaw = get('entryDate');
      const entryDate = parseDate(entryDateRaw);
      const invalidDate = !!(columnMapping.entryDate && entryDateRaw && !entryDate);

      return {
        _invalidDate: invalidDate,
        pair: pair.toUpperCase().replace(/[^A-Z0-9]/g, ''),
        direction: normalizeDirection(get('direction')),
        marketType: 'futures',
        strategy: get('strategy') || '',
        timeframe: '4H',
        entryPrice,
        exitPrice,
        stopLoss: parseNumber(get('stopLoss')) || 0,
        quantity,
        positionSize,
        leverage,
        fees: parseNumber(get('fees')) || 0,
        // Realized profit from the broker (MT5/forex) — useTrades uses this verbatim
        // as PnL, avoiding wrong price×qty math when contract sizes vary.
        ...(hasProfit ? { pnlFromExchange: profitNum } : {}),
        entryDate: entryDate || new Date(),
        // Do NOT default exitDate to new Date() — historical imports would appear
        // as closed today, corrupting the equity curve and today's PnL stats
        exitDate: parseDate(get('exitDate')) || null,
        notes: get('notes') || '',
        status,
        source: 'csv_import',
      };
    });
    const skippedDates = allRows.filter((t) => t.entryPrice > 0 && t._invalidDate).length;
    const trades = allRows
      .filter((t) => t.entryPrice > 0 && !t._invalidDate)
      .map((t) => { delete t._invalidDate; return t; });
    if (skippedDates > 0) {
      toast.error(`${skippedDates} שורות דולגו — תאריך כניסה לא תקין`);
    }

    try {
      let imported = 0;
      setImportProgress({ current: 0, total: trades.length });
      if (onImportBulk) {
        // Batched writes — one Firestore round-trip per 499 trades, so large
        // CSV files don't hang on hundreds of sequential per-row writes.
        imported = await onImportBulk(trades, (done) =>
          setImportProgress({ current: done, total: trades.length })
        );
      } else {
        for (const trade of trades) {
          await onImport(trade);
          imported++;
          setImportProgress({ current: imported, total: trades.length });
        }
      }
      toast.success(`${imported} עסקאות יובאו בהצלחה`);
      handleReset();
      onClose();
    } catch (err) {
      console.error('Import failed:', err);
      const msg = err.code === 'permission-denied'
        ? 'אין הרשאה לייבא עסקאות'
        : err.message?.includes('network')
        ? 'בעיית חיבור — בדוק את האינטרנט'
        : `שגיאה בייבוא עסקה ${importProgress.current + 1}: ${err.message || 'נסה שוב'}`;
      toast.error(msg);
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  const handleReset = () => {
    setFile(null);
    setParsed(null);
    setColumnMapping({});
    if (fileRef.current) fileRef.current.value = '';
  };

  const fields = [
    { key: 'pair', label: 'זוג', required: true },
    { key: 'direction', label: 'כיוון' },
    { key: 'entryPrice', label: 'מחיר כניסה', required: true },
    { key: 'exitPrice', label: 'מחיר יציאה' },
    { key: 'stopLoss', label: 'סטופ לוס' },
    { key: 'positionSize', label: 'גודל עסקה' },
    { key: 'leverage', label: 'מינוף' },
    { key: 'profit', label: 'רווח/הפסד' },
    { key: 'fees', label: 'עמלות' },
    { key: 'entryDate', label: 'תאריך כניסה' },
    { key: 'exitDate', label: 'תאריך יציאה' },
    { key: 'strategy', label: 'אסטרטגיה' },
    { key: 'notes', label: 'הערות' },
  ];

  // Same parsing as the import itself (parseNumber/parseDate) so the preview
  // count matches what will actually be written.
  const pricedRows = parsed?.rows.filter((row) => {
    const col = columnMapping.entryPrice;
    return col && parseNumber(row[col]) > 0;
  }) || [];
  const dateCol = columnMapping.entryDate;
  const invalidDateCount = dateCol
    ? pricedRows.filter((row) => row[dateCol] && !parseDate(row[dateCol])).length
    : 0;
  const validTrades = pricedRows.length - invalidDateCount;
  const skippedTrades = parsed ? parsed.rows.length - pricedRows.length : 0;

  return (
    <Modal isOpen={isOpen} onClose={() => { handleReset(); onClose(); }} title="ייבוא עסקאות מ-CSV" maxWidth="max-w-2xl">
      {!parsed ? (
        <div className="space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-border-primary rounded-xl p-10 text-center cursor-pointer hover:border-accent-primary/50 transition-colors"
          >
            <Upload className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-primary font-medium">גרור קובץ CSV או לחץ לבחירה</p>
            <p className="text-xs text-text-muted mt-1">תומך בייצוא מ-MetaTrader 5, Bybit, MEXC ופורמטים נפוצים</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* File info */}
          <div className="flex items-center gap-3 bg-bg-tertiary rounded-lg px-4 py-3">
            <FileText className="w-5 h-5 text-accent-primary" />
            <div className="flex-1">
              <p className="text-sm text-text-primary">{file?.name}</p>
              <p className="text-xs text-text-muted">{parsed.rows.length} שורות נמצאו</p>
            </div>
            <button onClick={handleReset} className="text-xs text-text-muted hover:text-text-primary cursor-pointer">שנה קובץ</button>
          </div>

          {/* Column mapping */}
          <div>
            <p className="text-sm font-medium text-text-primary mb-2">מיפוי עמודות</p>
            <div className="grid grid-cols-2 gap-2">
              {fields.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <label className="text-xs text-text-muted w-20 shrink-0">
                    {f.label} {f.required && <span className="text-loss">*</span>}
                  </label>
                  <select
                    value={columnMapping[f.key] || ''}
                    onChange={(e) => updateMapping(f.key, e.target.value)}
                    className="flex-1 bg-bg-tertiary border border-border-primary rounded px-2 py-1.5 text-xs text-text-primary outline-none"
                  >
                    <option value="">-- לא ממופה --</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  {columnMapping[f.key] && <Check className="w-3.5 h-3.5 text-profit shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          {parsed && (
            <div className="bg-bg-tertiary rounded-lg p-3 flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-accent-primary shrink-0" />
              <div className="flex gap-3 text-xs">
                <span className="text-profit font-semibold">{validTrades} תקינות</span>
                {skippedTrades > 0 && <span className="text-loss font-semibold">{skippedTrades} דולגו (חסר מחיר כניסה)</span>}
                {invalidDateCount > 0 && <span className="text-loss font-semibold">{invalidDateCount} דולגו (תאריך לא תקין)</span>}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-border-primary">
            <button onClick={() => { handleReset(); onClose(); }}
              className="flex-1 py-2.5 rounded-lg bg-bg-tertiary text-text-primary hover:bg-border-hover transition-colors cursor-pointer">
              ביטול
            </button>
            <button onClick={handleImport} disabled={importing || validTrades === 0}
              className="flex-1 py-2.5 rounded-lg bg-accent-primary text-bg-primary font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50">
              {importing ? `מייבא... ${importProgress.current}/${importProgress.total}` : `ייבא ${validTrades} עסקאות`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
