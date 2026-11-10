import { useState, useRef, useMemo } from 'react';
import { Upload, FileText, AlertCircle, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../shared/Modal';
import SelectDropdown from '../shared/SelectDropdown';
import {
  parseCSV, autoMapColumns, buildImportTrades, describeSkipped, mappingHasSize, SKIP_REASON_LABELS,
} from '../../utils/csvImport';

const ASSET_LABELS = { crypto: 'קריפטו', futures_cme: 'חוזים עתידיים', stocks: 'מניות' };
const UNITS_LABEL = { crypto: 'כמות (מטבעות)', futures_cme: 'כמות חוזים', stocks: 'מספר מניות' };
const NO_TRADES = [];

// assetClass: the ACTIVE journal's class — every imported row inherits it
// (crypto / CME futures with a contract spec / stocks at 1x), the same rule as
// the trade form. existingTrades: the journal's trades, so re-importing the
// same file skips rows that are already there instead of duplicating them.
export default function ImportTrades({ isOpen, onClose, onImport, onImportBulk, assetClass = 'crypto', existingTrades = NO_TRADES, customFields = [] }) {
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const fileRef = useRef(null);
  const journalClass = ['futures_cme', 'stocks'].includes(assetClass) ? assetClass : 'crypto';

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

  // The preview and the import run the SAME validation, so the counts shown
  // are exactly what will be written — and nothing the Firestore rules would
  // reject (quantity ≤ 0, negative fees…) ever reaches the batch.
  const hasSizeMapping = mappingHasSize(columnMapping);
  const plan = useMemo(() => (parsed
    ? buildImportTrades(parsed.rows, columnMapping, { assetClass: journalClass, existingTrades, customFields })
    : { trades: [], skipped: [], counts: {}, estimatedSize: 0 }), [parsed, columnMapping, journalClass, existingTrades, customFields]);
  const validTrades = hasSizeMapping ? plan.trades.length : 0;

  const handleImport = async () => {
    if (!parsed?.rows.length || !hasSizeMapping) return;
    const { trades, counts } = plan;
    if (!trades.length) return;
    setImporting(true);

    // Local counter for the error toast — reading importProgress state in the
    // catch sees the stale closure from before the import started.
    let progressCount = 0;
    try {
      let imported = 0;
      setImportProgress({ current: 0, total: trades.length });
      if (onImportBulk) {
        // Batched writes — one Firestore round-trip per 499 trades.
        imported = await onImportBulk(trades, (done) => {
          progressCount = done;
          setImportProgress({ current: done, total: trades.length });
        });
      } else {
        for (const trade of trades) {
          await onImport(trade);
          imported++;
          progressCount = imported;
          setImportProgress({ current: imported, total: trades.length });
        }
      }
      const skippedText = describeSkipped(counts);
      toast.success(skippedText
        ? `${imported} עסקאות יובאו · דולגו: ${skippedText}`
        : `${imported} עסקאות יובאו בהצלחה`, { duration: skippedText ? 6000 : 4000 });
      handleReset();
      onClose();
    } catch (err) {
      console.error('Import failed:', err);
      // Batches commit in chunks of 499 — say how many made it in before the
      // failure, and show the real error instead of guessing "no permission".
      const done = progressCount > 0 ? ` (${progressCount} מתוך ${trades.length} כבר יובאו)` : '';
      const msg = err?.code === 'permission-denied'
        ? `השרת דחה את הייבוא — ייתכן שיש שורה עם נתונים לא תקינים${done}. פרטים: ${err.message || err.code}`
        : /network|unavailable|offline/i.test(`${err?.code || ''} ${err?.message || ''}`)
        ? `בעיית חיבור — בדוק את האינטרנט${done}`
        : `שגיאה בייבוא${done}: ${err?.message || err?.code || 'נסה שוב'}`;
      toast.error(msg, { duration: 8000 });
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
    { key: 'pair', label: journalClass === 'stocks' ? 'סימבול' : journalClass === 'futures_cme' ? 'חוזה' : 'זוג', required: true },
    { key: 'direction', label: 'כיוון' },
    { key: 'entryPrice', label: 'מחיר כניסה', required: true },
    { key: 'exitPrice', label: 'מחיר יציאה' },
    { key: 'stopLoss', label: 'סטופ לוס' },
    { key: 'quantity', label: UNITS_LABEL[journalClass], sizeGroup: true },
    { key: 'positionSize', label: 'גודל עסקה ($)', sizeGroup: true },
    ...(journalClass === 'crypto' ? [{ key: 'leverage', label: 'מינוף' }] : []),
    { key: 'profit', label: 'רווח/הפסד', sizeGroup: true },
    { key: 'fees', label: 'עמלות' },
    { key: 'entryDate', label: 'תאריך כניסה' },
    { key: 'exitDate', label: 'תאריך יציאה' },
    { key: 'strategy', label: 'אסטרטגיה' },
    { key: 'notes', label: 'הערות' },
  ];
  const skippedEntries = Object.entries(plan.counts).filter(([, n]) => n > 0);

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
            <p className="text-xs text-text-muted mt-1">תומך בייצוא מ-Bybit, MEXC ופורמטים נפוצים</p>
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
                    {f.sizeGroup && !hasSizeMapping && <span className="text-loss">*</span>}
                  </label>
                  <SelectDropdown
                    compact
                    allowClear
                    className="flex-1 min-w-0"
                    value={columnMapping[f.key] || ''}
                    onChange={(v) => updateMapping(f.key, v)}
                    placeholder="-- לא ממופה --"
                    options={parsed.headers.map((h) => ({ value: h, label: h }))}
                  />
                  {columnMapping[f.key] && <Check className="w-3.5 h-3.5 text-profit shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          {/* Size requirement */}
          {!hasSizeMapping && (
            <div className="bg-loss/10 border border-loss/30 rounded-lg p-3 flex items-start gap-2 text-xs text-loss">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                יש למפות עמודת גודל: {UNITS_LABEL[journalClass]}, גודל עסקה ($) או רווח/הפסד.
                בלי גודל אי אפשר לחשב רווח/הפסד.
              </span>
            </div>
          )}

          {/* Preview */}
          {parsed && hasSizeMapping && (
            <div className="bg-bg-tertiary rounded-lg p-3 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-accent-primary shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1 text-xs min-w-0">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="text-profit font-semibold">{validTrades} תקינות</span>
                  <span className="text-text-muted">יובאו כ{ASSET_LABELS[journalClass]} (לפי סוג היומן)</span>
                </div>
                {skippedEntries.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {skippedEntries.map(([reason, n]) => (
                      <span key={reason} className={reason === 'duplicate' ? 'text-text-muted font-semibold' : 'text-loss font-semibold'}>
                        {n} ידולגו ({SKIP_REASON_LABELS[reason] || reason})
                      </span>
                    ))}
                  </div>
                )}
                {plan.estimatedSize > 0 && (
                  <span className="text-breakeven">
                    {plan.estimatedSize} ללא גודל עסקה — הרווח/הפסד יילקח מהקובץ והכמות תסומן כמשוערת (1)
                  </span>
                )}
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
