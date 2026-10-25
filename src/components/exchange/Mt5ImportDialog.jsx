import { useRef, useState } from 'react';
import { Upload, FileText, AlertCircle, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../shared/Modal';
import { formatCurrency } from '../../utils/formatters';
import {
  formatLots, partitionMt5Import, readMt5ArrayBuffer,
} from '../../utils/mt5Import';

const ACCEPT = '.html,.htm,.xlsx,.xls,.csv,text/html,text/csv';

function fmtPx(p) {
  const n = Number(p);
  if (!(n > 0)) return '—';
  if (n >= 100) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 10) return n.toFixed(3);
  return n.toFixed(5);
}

function fmtWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function netOf(t) {
  if (t.status === 'open' || typeof t.pnlFromExchange !== 'number') return null;
  return t.pnlFromExchange - (t.fees || 0);
}

const STEPS = [
  'בטרמינל MT5: Toolbox → לשונית History.',
  'לחיצה ימנית על ההיסטוריה → Report.',
  'שמירה כ-HTML או Excel ‏(.xlsx). גם CSV מתקבל.',
  'העלאה לכאן — מוצגת תצוגה מקדימה, והעסקאות נשמרות רק אחרי אישור.',
];

export default function Mt5ImportDialog({ isOpen, onClose, existingTrades = [], onImport }) {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [selected, setSelected] = useState(() => new Set());

  const plan = parsed?.ok
    ? partitionMt5Import(parsed.trades, existingTrades)
    : { fresh: [], updates: [], duplicates: [] };
  const importable = [...plan.fresh, ...plan.updates];
  const chosen = importable.filter((t) => selected.has(t.externalId));

  const reset = () => {
    setFileName('');
    setError('');
    setParsed(null);
    setSelected(new Set());
    setParsing(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const close = () => {
    reset();
    onClose?.();
  };

  const loadFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setError('');
    setParsed(null);
    setSelected(new Set());
    if (file.size > 20 * 1024 * 1024) {
      setError('הקובץ גדול מדי (מעל 20MB).');
      return;
    }
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const result = await readMt5ArrayBuffer(buf, file.name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const next = partitionMt5Import(result.trades, existingTrades);
      setParsed(result);
      setSelected(new Set([...next.fresh, ...next.updates].map((t) => t.externalId)));
    } catch {
      setError('לא הצלחנו לקרוא את הקובץ. נסה דוח HTML, Excel ‏(.xlsx) או CSV.');
    } finally {
      setParsing(false);
    }
  };

  const onPick = (e) => loadFile(e.target.files?.[0]);

  const toggle = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const confirm = async () => {
    if (!chosen.length || importing) return;
    setImporting(true);
    try {
      const { imported = 0, failed = 0 } = await onImport(chosen);
      if (imported) {
        const dup = plan.duplicates.length
          ? ` · ${plan.duplicates.length} כבר היו ביומן`
          : '';
        toast.success(`יובאו ${imported} עסקאות מ-Vantage${dup}`);
      }
      if (failed) toast.error(`לא יובאו ${failed} עסקאות`);
      if (imported) close();
    } catch (err) {
      toast.error(err?.message || 'שגיאה בייבוא');
    } finally {
      setImporting(false);
    }
  };

  const rows = parsed?.ok ? [...plan.fresh, ...plan.updates, ...plan.duplicates] : [];

  return (
    <Modal isOpen={isOpen} onClose={close} title="ייבוא מ-Vantage / MetaTrader 5" maxWidth="max-w-2xl"
      footer={parsed?.ok ? (
        <div className="flex gap-2">
          <button type="button" onClick={close}
            className="h-11 px-5 rounded-xl border border-border-primary text-sm text-text-secondary hover:bg-bg-tertiary transition-colors cursor-pointer">
            ביטול
          </button>
          <button type="button" onClick={confirm} disabled={!chosen.length || importing}
            className="flex-1 h-11 rounded-xl bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-40">
            {importing ? 'מייבא…' : chosen.length ? `ייבא ${chosen.length} עסקאות` : 'אין עסקאות חדשות'}
          </button>
        </div>
      ) : null}>
      <div dir="rtl" className="space-y-4">
        <ol data-testid="mt5-instructions" className="space-y-1.5 rounded-xl bg-bg-tertiary/60 border border-border-primary p-4">
          {STEPS.map((text, i) => (
            <li key={text} className="flex items-start gap-2.5">
              <span className="text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-px bg-bg-secondary text-text-muted">
                {i + 1}
              </span>
              <span className="text-[12px] leading-snug text-text-secondary">{text}</span>
            </li>
          ))}
          <li className="text-[12px] text-text-muted pt-1">
            ל-Vantage אין API לחשבונות מסחר. ייבוא חוזר מזהה פוזיציה לפי מספר הטיקט ולא משכפל אותה.
          </li>
        </ol>

        {!parsed?.ok && (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files?.[0]); }}
            className="border-2 border-dashed border-border-primary rounded-xl p-8 text-center cursor-pointer hover:border-accent-primary/50 transition-colors"
          >
            <Upload className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-primary font-medium">
              {parsing ? 'קורא את הדוח…' : 'גרור דוח MT5 או לחץ לבחירה'}
            </p>
            <p className="text-xs text-text-muted mt-1">HTML, Excel ‏(.xlsx) או CSV</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept={ACCEPT} onChange={onPick} className="hidden" data-testid="mt5-file" />

        {error && (
          <div role="alert" data-testid="mt5-import-error" className="bg-loss/10 border border-loss/30 rounded-lg p-3 flex items-start gap-2 text-xs text-loss">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {parsed?.ok && (
          <div className="space-y-3" data-testid="mt5-preview">
            <div className="flex items-center gap-3 bg-bg-tertiary rounded-lg px-4 py-3">
              <FileText className="w-5 h-5 text-accent-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">{fileName}</p>
                <p className="text-xs text-text-muted">
                  {parsed.trades.length} עסקאות
                  {plan.fresh.length ? ` · ${plan.fresh.length} חדשות` : ''}
                  {plan.updates.length ? ` · ${plan.updates.length} לעדכון` : ''}
                  {plan.duplicates.length ? ` · ${plan.duplicates.length} כבר ביומן` : ''}
                </p>
              </div>
              <button type="button" onClick={reset} className="text-xs text-text-muted hover:text-text-primary cursor-pointer">שנה קובץ</button>
            </div>

            <ul className="divide-y divide-border-primary/40 rounded-xl border border-border-primary overflow-hidden max-h-80 overflow-y-auto">
              {rows.map((t) => {
                const dup = plan.duplicates.some((d) => d.externalId === t.externalId);
                const update = plan.updates.some((d) => d.externalId === t.externalId);
                const on = selected.has(t.externalId);
                const net = netOf(t);
                return (
                  <li key={t.externalId}>
                    <button type="button" disabled={dup} onClick={() => !dup && toggle(t.externalId)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-right ${dup ? 'opacity-50 cursor-default' : 'hover:bg-bg-tertiary cursor-pointer'}`}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${on && !dup ? 'bg-accent-primary border-accent-primary' : 'border-border-primary'}`}>
                        {on && !dup && <Check className="w-2.5 h-2.5 text-bg-primary" strokeWidth={3} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-bold font-mono ${net == null ? 'text-text-muted' : net >= 0 ? 'text-profit' : 'text-loss'}`} dir="ltr">
                            {net == null ? '—' : formatCurrency(net)}
                          </span>
                          <span className="flex items-center gap-1.5 min-w-0">
                            {dup && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-bg-tertiary text-text-muted border border-border-primary">כבר ביומן</span>}
                            {update && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent-primary/15 text-accent-primary border border-accent-primary/30">עדכון</span>}
                            {t.status === 'open' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-profit/15 text-profit border border-profit/30">פתוח</span>}
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${t.direction === 'long' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>
                              {t.direction === 'long' ? 'Long ↗' : 'Short ↘'}
                            </span>
                            <span className="text-sm font-bold text-text-primary" dir="ltr">{t.pair}</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5 text-[10px] text-text-muted">
                          <span dir="ltr">{fmtWhen(t.entryDate)}{t.exitDate ? ` → ${fmtWhen(t.exitDate)}` : ''}</span>
                          <span dir="ltr">
                            {formatLots(t.lots)} לוט · {fmtPx(t.entryPrice)}{t.exitPrice > 0 ? ` → ${fmtPx(t.exitPrice)}` : ''}
                            {t.fees ? ` · עמלה ${t.fees}` : ''} · #{t.ticket}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
