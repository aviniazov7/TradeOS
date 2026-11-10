import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCustomTradeFields } from '../../hooks/useCustomTradeFields';
import {
  CUSTOM_TYPE_LABELS,
  addCustomField,
  removeCustomField,
} from '../../utils/customTradeFields';

const TYPES = [
  { id: 'text', label: 'טקסט' },
  { id: 'number', label: 'מספר' },
  { id: 'select', label: 'בחירה' },
];

const inputClass = 'w-full h-10 rounded-xl bg-bg-tertiary border border-border-primary px-3 text-sm text-text-primary outline-none focus:border-accent-primary';

// Where the user defines the journal's optional fields. Adding a field is
// Premium. A free account still sees fields that were saved earlier, and the
// values on trades stay visible in the form and in analytics.
export default function CustomTradeFieldsSettings() {
  const { isPremium } = useAuth();
  const { doc, fields, ready, saveDoc } = useCustomTradeFields();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const [options, setOptions] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const persist = async (next) => {
    setBusy(true);
    setError('');
    try {
      await saveDoc(next);
    } catch {
      setError('השמירה נכשלה. נסו שוב.');
    } finally {
      setBusy(false);
    }
  };

  const onAdd = async (e) => {
    e.preventDefault();
    const result = addCustomField(doc, { name, type, options }, { isPremium });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await persist({ fields: result.fields, seq: result.seq });
    setName('');
    setOptions('');
    setType('text');
  };

  const onRemove = async (id) => {
    if (!isPremium) return;
    const next = removeCustomField(doc, id);
    await persist(next);
  };

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4" data-testid="custom-fields-settings">
      <h3 className="text-sm font-semibold text-text-primary mb-1">שדות נוספים לעסקה</h3>
      <p className="text-xs text-text-muted mb-3">
        הוסף שדות משלך לטופס העסקה, והם יופיעו בכל עסקה חדשה ובסטטיסטיקות. למשל: סטאפ (בחירה), ציון ביצוע (מספר), הערת כניסה (טקסט). עד 12 שדות.
      </p>

      {!ready ? (
        <div className="h-16 rounded-xl bg-bg-tertiary animate-pulse" />
      ) : fields.length === 0 ? (
        <p className="text-xs text-text-secondary" data-testid="custom-fields-empty">
          עוד לא הוספת שדות.
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {fields.map((field) => (
            <li
              key={field.id}
              data-testid={`custom-field-${field.id}`}
              className="flex items-start gap-2 rounded-xl border border-border-primary bg-bg-tertiary/60 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary truncate">{field.name}</span>
                  <span className="text-[10px] font-semibold text-accent-primary bg-accent-primary/10 border border-accent-primary/30 rounded-md px-1.5 py-0.5">
                    {CUSTOM_TYPE_LABELS[field.type]}
                  </span>
                </div>
                {field.type === 'select' && (
                  <p className="text-[11px] text-text-muted mt-1">{field.options.join(' · ')}</p>
                )}
              </div>
              {isPremium && (
                <button
                  type="button"
                  onClick={() => onRemove(field.id)}
                  disabled={busy}
                  aria-label={`מחיקת ${field.name}`}
                  className="shrink-0 w-8 h-8 grid place-items-center rounded-lg text-text-muted hover:text-loss cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isPremium ? (
        <form onSubmit={onAdd} className="mt-3 space-y-2" data-testid="custom-field-form">
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            maxLength={40}
            placeholder="שם השדה, למשל: סטאפ"
            aria-label="שם השדה"
            className={inputClass}
          />
          <div className="flex gap-1.5" role="radiogroup" aria-label="סוג השדה">
            {TYPES.map((item) => {
              const on = type === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setType(item.id)}
                  className={`flex-1 h-9 rounded-xl border text-xs font-semibold cursor-pointer ${
                    on
                      ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                      : 'border-border-primary text-text-secondary hover:border-border-hover'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          {type === 'select' && (
            <input
              value={options}
              onChange={(e) => { setOptions(e.target.value); setError(''); }}
              placeholder="אפשרויות, מופרדות בפסיק"
              aria-label="אפשרויות בחירה"
              className={inputClass}
            />
          )}
          {error && <p role="alert" className="text-[11px] text-loss">{error}</p>}
          <button
            type="submit"
            disabled={busy || !ready}
            className="h-10 px-4 rounded-xl bg-accent-primary text-bg-primary text-sm font-semibold cursor-pointer disabled:opacity-50"
          >
            {busy ? 'שומר...' : 'הוספת שדה'}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => navigate('/premium')}
          className="mt-3 flex items-center gap-1.5 text-[11px] text-accent-primary hover:underline cursor-pointer"
        >
          <Crown className="w-3.5 h-3.5" />
          הגדרת שדות חדשים — שדרג ל-Premium
        </button>
      )}
    </div>
  );
}
