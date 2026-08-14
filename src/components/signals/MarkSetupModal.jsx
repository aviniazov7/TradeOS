import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../shared/Modal';

const INPUT = 'w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary/50 transition-colors';
const TF_OPTIONS = ['15m', '30m', '1h', '4h'];

const emptyForm = () => ({
  pair: '', direction: 'short', timeframe: '30m',
  entry: '', stop: '', target: '',
  at: '', label: 'valid', chartUrl: '', notes: '',
});

// "Mark setup" — capture a real LPS/LPSY the owner would (or wouldn't) enter.
// This row becomes ground truth the scanner calibrates against.
export default function MarkSetupModal({ isOpen, onClose, onSave, setup }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (setup) {
      setForm({
        pair: setup.pair || '', direction: setup.direction || 'short', timeframe: setup.timeframe || '30m',
        entry: setup.entry ?? '', stop: setup.stop ?? '', target: setup.target ?? '',
        at: setup.at ? toLocalInput(setup.at) : '', label: setup.label || 'valid',
        chartUrl: setup.chartUrl || '', notes: setup.notes || '',
      });
    } else {
      setForm(emptyForm());
    }
  }, [isOpen, setup]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const num = (v) => (v === '' || v == null ? null : Number(v));

  const save = async () => {
    const pair = form.pair.trim().toUpperCase();
    if (!pair) { toast.error('חסר מטבע'); return; }
    if (!(num(form.entry) > 0) || !(num(form.stop) > 0)) { toast.error('כניסה וסטופ נדרשים'); return; }
    setSaving(true);
    try {
      await onSave({
        pair,
        direction: form.direction,
        timeframe: form.timeframe,
        entry: num(form.entry),
        stop: num(form.stop),
        target: num(form.target),
        at: form.at ? new Date(form.at) : null,
        label: form.label,
        source: 'manual',
        chartUrl: form.chartUrl.trim(),
        notes: form.notes.trim(),
      });
      toast.success(setup ? 'הסטאפ עודכן' : 'הסטאפ נשמר במאגר');
      onClose();
    } catch {
      toast.error('שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({ value, options }) => (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={o.v} type="button" onClick={() => setForm((f) => ({ ...f, [o.field]: o.v }))}
          className={`py-2 rounded-lg text-sm font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            value === o.v ? o.on : 'text-text-muted border-border-primary hover:border-border-primary/80'
          }`}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={setup ? 'עריכת סטאפ' : 'סמן סטאפ לאימון'} maxWidth="max-w-md">
      <div className="space-y-4">
        {/* pair + direction */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">מטבע</label>
            <input value={form.pair} onChange={set('pair')} placeholder="BTCUSDT" dir="ltr" className={INPUT} />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">כיוון</label>
            <Toggle value={form.direction} options={[
              { v: 'long', field: 'direction', label: 'LPS', icon: <TrendingUp className="w-3.5 h-3.5" />, on: 'text-profit border-profit/50 bg-profit/10' },
              { v: 'short', field: 'direction', label: 'LPSY', icon: <TrendingDown className="w-3.5 h-3.5" />, on: 'text-loss border-loss/50 bg-loss/10' },
            ]} />
          </div>
        </div>

        {/* entry / stop / target */}
        <div className="grid grid-cols-3 gap-2">
          {[['entry', 'כניסה'], ['stop', 'סטופ'], ['target', 'יעד (רשות)']].map(([k, lbl]) => (
            <div key={k}>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">{lbl}</label>
              <input type="number" inputMode="decimal" value={form[k]} onChange={set(k)} dir="ltr" className={INPUT} />
            </div>
          ))}
        </div>

        {/* timeframe + time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">טיימפריים</label>
            <div className="flex gap-1">
              {TF_OPTIONS.map((tf) => (
                <button key={tf} type="button" onClick={() => setForm((f) => ({ ...f, timeframe: tf }))}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${form.timeframe === tf ? 'text-accent-primary border-accent-primary/50 bg-accent-primary/10' : 'text-text-muted border-border-primary'}`}>
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">מתי (רגע השבירה)</label>
            <input type="datetime-local" value={form.at} onChange={set('at')} dir="ltr" className={INPUT} />
          </div>
        </div>

        {/* label */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">תיוג — האם היית נכנס?</label>
          <Toggle value={form.label} options={[
            { v: 'valid', field: 'label', label: 'תקין', icon: <Check className="w-3.5 h-3.5" />, on: 'text-profit border-profit/50 bg-profit/10' },
            { v: 'invalid', field: 'label', label: 'לא תקין', icon: <X className="w-3.5 h-3.5" />, on: 'text-loss border-loss/50 bg-loss/10' },
          ]} />
        </div>

        {/* chart url */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">קישור צ׳ארט (TradingView snapshot)</label>
          <input type="url" value={form.chartUrl} onChange={set('chartUrl')} placeholder="tradingview.com/x/..." dir="ltr" className={INPUT} />
        </div>

        {/* notes */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">הערות</label>
          <textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="מה עשה את זה תקין / לא תקין" className={`${INPUT} resize-none`} />
        </div>

        <button onClick={save} disabled={saving}
          className="w-full py-2.5 rounded-lg bg-accent-primary text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-60 cursor-pointer">
          {saving ? 'שומר…' : setup ? 'עדכן' : 'שמור למאגר'}
        </button>
      </div>
    </Modal>
  );
}

// Firestore Timestamp / Date → value for <input type="datetime-local">.
function toLocalInput(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
