import { useEffect, useState } from 'react';
import { KeyRound, Copy, Check, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToUserCollection } from '../../services/firestoreService';
import { createApiKey, revokeApiKey } from '../../services/apiKeyService';
import { formatDate } from '../../utils/formatters';
import Modal from '../shared/Modal';
import ConfirmDialog from '../shared/ConfirmDialog';

const cardClass = 'bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden';

// API keys for agents. The secret is shown once; Firestore only holds the
// prefix, and the hash index is not readable by the client.
export default function ApiKeysSection() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revokeId, setRevokeId] = useState(null);

  useEffect(() => {
    if (!uid) return undefined;
    setLoading(true);
    return subscribeToUserCollection(
      uid,
      'apiKeys',
      { orderField: 'createdAt', orderDir: 'desc' },
      (rows) => {
        setKeys(rows);
        setLoading(false);
      },
      () => {
        setLoading(false);
        toast.error('לא ניתן לטעון מפתחות API');
      },
    );
  }, [uid]);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const created = await createApiKey(name.trim());
      setSecret(created.key);
      setCopied(false);
      setName('');
    } catch (err) {
      toast.error(err?.message || 'יצירת המפתח נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success('המפתח הועתק');
    } catch {
      toast.error('ההעתקה נכשלה');
    }
  };

  const confirmRevoke = async () => {
    await revokeApiKey(revokeId);
    toast.success('המפתח בוטל');
  };

  const active = keys.filter((key) => !key.revokedAt);

  return (
    <section>
      <h2 className="text-[11px] font-semibold text-text-muted px-1 mb-2 mt-6">API</h2>
      <div className={cardClass}>
        <div className="px-5 py-4 border-b border-border-primary">
          <div className="flex items-center gap-3">
            <KeyRound className="w-5 h-5 text-text-muted shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text-primary">מפתחות API</div>
              <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                לסוכני AI ול-REST API. המפתח המלא מוצג פעם אחת, ונשמר רק כגיבוב.
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם (לא חובה)"
              maxLength={40}
              dir={name ? 'auto' : 'rtl'}
              className="flex-1 min-w-0 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary"
            />
            <button
              type="button"
              onClick={create}
              disabled={busy}
              className="shrink-0 px-3 py-2 rounded-lg bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover cursor-pointer disabled:opacity-50"
            >
              {busy ? 'יוצר...' : 'מפתח חדש'}
            </button>
          </div>
        </div>

        {loading && <div className="px-5 py-4 text-xs text-text-muted">טוען...</div>}
        {!loading && active.length === 0 && (
          <div className="px-5 py-4 text-xs text-text-muted">אין מפתחות פעילים</div>
        )}
        {active.map((key) => (
          <div key={key.id} className="flex items-center gap-3 px-5 py-3 border-t border-border-primary">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-text-primary truncate">{key.name || 'API key'}</div>
              <div data-testid="api-key-prefix" className="text-xs text-text-muted font-mono" dir="ltr">{key.prefix}…</div>
              {key.createdAt && (
                <div className="text-[10px] text-text-muted mt-0.5">{formatDate(key.createdAt)}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setRevokeId(key.id)}
              className="inline-flex items-center gap-1 text-xs text-loss hover:underline cursor-pointer shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              ביטול
            </button>
          </div>
        ))}
      </div>

      <Modal isOpen={!!secret} onClose={() => setSecret(null)} title="המפתח שלך" maxWidth="max-w-md">
        <p className="text-sm text-text-secondary mb-3">העתיקו עכשיו. המפתח המלא לא יוצג שוב.</p>
        <div data-testid="api-key-secret" className="bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-xs font-mono break-all text-left" dir="ltr">
          {secret}
        </div>
        <button
          type="button"
          onClick={copy}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg bg-accent-primary text-bg-primary text-sm font-semibold cursor-pointer"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'הועתק' : 'העתקה'}
        </button>
      </Modal>

      <ConfirmDialog
        isOpen={!!revokeId}
        onClose={() => setRevokeId(null)}
        onConfirm={confirmRevoke}
        title="לבטל את המפתח?"
        message="סוכנים שמשתמשים בו יפסיקו לעבוד מיד."
        confirmText="בטל מפתח"
      />
    </section>
  );
}
