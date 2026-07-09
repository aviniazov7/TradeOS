import { useState } from 'react';
import { ScanSearch, Download, AlertTriangle, Trash2, Flag, CheckCircle2, Wrench, Copy, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../shared/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { getUserCollectionDocs, applyTradeCleanup } from '../../services/firestoreService';
import { scanTrades } from '../../utils/tradeCleanup';
import { formatCurrency, formatDate } from '../../utils/formatters';

// One-time admin tool: scans the CURRENT account's trades and fixes rows
// damaged before the MEXC contract-unit + auto-close fixes. Everything is
// preview-first — nothing is written until the admin explicitly applies.
// Firestore rules only allow writing your OWN trades (admin or not), so the
// tool operates on the signed-in account.

const money = (v) =>
  v == null || isNaN(v) ? '—' : formatCurrency(v);

const tradeLabel = (t) => t.pair || t.symbol || '—';
const tradeDate = (t) => formatDate(t.exitDate || t.entryDate || t.createdAt);

function SectionHeader({ icon, title, count, tone, extra }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className={`flex items-center gap-2 text-sm font-semibold ${tone}`}>
        {icon}
        {title}
        <span className="text-xs font-normal text-text-muted">({count})</span>
      </div>
      {extra}
    </div>
  );
}

export default function DataCleanupModal({ isOpen, onClose }) {
  const { user } = useAuth();
  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  // Selection sets (trade doc ids) per section
  const [fixIds, setFixIds] = useState(new Set());
  const [suspectIds, setSuspectIds] = useState(new Set());
  const [dupeIds, setDupeIds] = useState(new Set());
  // What to do with suspects: flag (reversible) or delete
  const [suspectAction, setSuspectAction] = useState('flag');
  const [backupDone, setBackupDone] = useState(false);

  const runScan = async () => {
    if (!user) return;
    setScanning(true);
    try {
      const trades = await getUserCollectionDocs(user.uid, 'trades');
      const result = scanTrades(trades);
      setScan(result);
      // Default: everything selected — the admin unchecks what to skip.
      setFixIds(new Set(result.pnlFixes.map((f) => f.trade.id)));
      setSuspectIds(new Set(result.suspects.map((s) => s.trade.id)));
      setDupeIds(new Set(result.dupeGroups.flatMap((g) => g.remove.map((t) => t.id))));
      setBackupDone(false);
    } catch (e) {
      console.error('Cleanup scan failed:', e);
      toast.error(e.message || 'הסריקה נכשלה');
    } finally {
      setScanning(false);
    }
  };

  const toggle = (setter) => (id) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleFix = toggle(setFixIds);
  const toggleSuspect = toggle(setSuspectIds);
  const toggleDupe = toggle(setDupeIds);

  const selectedCounts = {
    fixes: fixIds.size,
    suspects: suspectIds.size,
    dupes: dupeIds.size,
  };
  const deleteCount = selectedCounts.dupes + (suspectAction === 'delete' ? selectedCounts.suspects : 0);
  const totalOps = selectedCounts.fixes + selectedCounts.suspects + selectedCounts.dupes;

  // JSON backup of every doc the apply would touch — insurance before
  // mutating real money data. Keeps the full raw docs.
  const downloadBackup = () => {
    if (!scan) return;
    const affected = {
      exportedAt: new Date().toISOString(),
      uid: user.uid,
      pnlFixes: scan.pnlFixes.filter((f) => fixIds.has(f.trade.id)),
      suspects: scan.suspects.filter((s) => suspectIds.has(s.trade.id)),
      duplicates: scan.dupeGroups
        .map((g) => ({ key: g.key, keep: g.keep, remove: g.remove.filter((t) => dupeIds.has(t.id)) }))
        .filter((g) => g.remove.length),
    };
    const blob = new Blob([JSON.stringify(affected, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tradeos-cleanup-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupDone(true);
    toast.success('הגיבוי ירד — שמור אותו לפני החלה');
  };

  const apply = async () => {
    if (!scan || totalOps === 0 || applying) return;
    const lines = [];
    if (selectedCounts.fixes) lines.push(`• תיקון PnL ל-${selectedCounts.fixes} עסקאות`);
    if (selectedCounts.suspects)
      lines.push(
        suspectAction === 'delete'
          ? `• מחיקת ${selectedCounts.suspects} עסקאות חשודות`
          : `• סימון ${selectedCounts.suspects} עסקאות חשודות (pnlSuspect)`
      );
    if (selectedCounts.dupes) lines.push(`• מחיקת ${selectedCounts.dupes} כפילויות`);
    if (deleteCount && !backupDone) {
      if (!window.confirm(`לא הורדת גיבוי ויש ${deleteCount} מחיקות. להמשיך בכל זאת?`)) return;
    }
    if (!window.confirm(`להחיל את התיקונים הבאים?\n\n${lines.join('\n')}\n\n⚠️ מחיקות הן סופיות — אלה נתוני מסחר אמיתיים.`)) return;

    setApplying(true);
    try {
      const updates = [
        ...scan.pnlFixes
          .filter((f) => fixIds.has(f.trade.id))
          .map((f) => ({ id: f.trade.id, data: f.updates })),
        ...(suspectAction === 'flag'
          ? scan.suspects
              .filter((s) => suspectIds.has(s.trade.id))
              .map((s) => ({ id: s.trade.id, data: { pnlSuspect: true } }))
          : []),
      ];
      const deletes = [
        ...(suspectAction === 'delete'
          ? scan.suspects.filter((s) => suspectIds.has(s.trade.id)).map((s) => s.trade.id)
          : []),
        ...scan.dupeGroups.flatMap((g) => g.remove.map((t) => t.id).filter((id) => dupeIds.has(id))),
      ];
      const committed = await applyTradeCleanup(user.uid, { updates, deletes });
      toast.success(`בוצע — ${committed} פעולות נכתבו`);
      await runScan(); // re-scan to show the healed state
    } catch (e) {
      console.error('Cleanup apply failed:', e);
      toast.error(e.message || 'ההחלה נכשלה');
    } finally {
      setApplying(false);
    }
  };

  const chip = (label, value, tone) => (
    <div className={`rounded-lg border px-3 py-2 text-center ${tone}`}>
      <div className="text-lg font-bold leading-tight" dir="ltr">{value}</div>
      <div className="text-[11px] text-text-muted">{label}</div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ניקוי נתוני עסקאות" maxWidth="max-w-3xl">
      <div className="space-y-5" dir="rtl">
        {/* Intro / scan trigger */}
        <div className="bg-bg-tertiary/50 border border-border-primary rounded-xl p-4 space-y-2">
          <div className="text-sm text-text-secondary leading-relaxed">
            כלי חד-פעמי שסורק את העסקאות של <b>החשבון הנוכחי</b> ומאתר נזקים היסטוריים:
            סטיית netPnl מול ה-PnL שהגיע מהבורסה, סגירות מזויפות של ה-auto-close הישן,
            וכפילויות externalId. שום דבר לא נכתב בלי אישור מפורש.
          </div>
          <div className="text-[11px] text-text-muted">
            הרשאות Firestore מגבילות כתיבה לעסקאות של המשתמש המחובר בלבד — לכן הכלי פועל על החשבון שלך.
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium border bg-accent-primary/10 border-accent-primary/30 text-accent-primary hover:bg-accent-primary/20 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
            {scan ? 'סרוק שוב' : 'סרוק עסקאות'}
          </button>
        </div>

        {scan && (
          <>
            {/* Summary chips */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {chip('נסרקו', scan.stats.total, 'bg-bg-tertiary border-border-primary text-text-primary')}
              {chip('לתיקון PnL', scan.stats.pnlFixes, 'bg-accent-primary/10 border-accent-primary/30 text-accent-primary')}
              {chip('חשודות', scan.stats.suspects, 'bg-amber-500/10 border-amber-500/30 text-amber-400')}
              {chip('כפילויות', scan.stats.dupeRemovals, 'bg-red-500/10 border-red-500/30 text-red-400')}
              {chip('תקינות', scan.stats.clean, 'bg-profit/10 border-profit/30 text-profit')}
            </div>

            {scan.stats.pnlFixes + scan.stats.suspects + scan.stats.dupeRemovals === 0 && (
              <div className="flex items-center gap-2 text-sm text-profit bg-profit/10 border border-profit/30 rounded-xl p-4">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                לא נמצאו בעיות — כל העסקאות תקינות 🎉
              </div>
            )}

            {/* 1 — PnL fixes */}
            {scan.pnlFixes.length > 0 && (
              <div className="border border-accent-primary/25 rounded-xl p-4 space-y-3">
                <SectionHeader
                  icon={<Wrench className="w-4 h-4" />}
                  title="תיקון netPnl לפי הבורסה"
                  count={`${fixIds.size}/${scan.pnlFixes.length} נבחרו`}
                  tone="text-accent-primary"
                  extra={
                    <button
                      onClick={() =>
                        setFixIds(fixIds.size === scan.pnlFixes.length ? new Set() : new Set(scan.pnlFixes.map((f) => f.trade.id)))
                      }
                      className="text-xs text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      {fixIds.size === scan.pnlFixes.length ? 'נקה בחירה' : 'בחר הכל'}
                    </button>
                  }
                />
                <div className="text-[11px] text-text-muted">
                  netPnl יעודכן ל-<span dir="ltr">pnlFromExchange − fees</span>, כולל pnl ו-result.
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5">
                  {scan.pnlFixes.map((f) => (
                    <label
                      key={f.trade.id}
                      className="flex items-center gap-2.5 text-xs bg-bg-secondary/60 border border-border-primary rounded-lg px-3 py-2 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={fixIds.has(f.trade.id)}
                        onChange={() => toggleFix(f.trade.id)}
                        className="w-3.5 h-3.5 accent-cyan-400 cursor-pointer shrink-0"
                      />
                      <span className="font-mono font-semibold text-text-primary" dir="ltr">{tradeLabel(f.trade)}</span>
                      <span className="text-text-muted">{tradeDate(f.trade)}</span>
                      <span className="ms-auto flex items-center gap-1.5" dir="ltr">
                        <span className="text-text-muted line-through">{money(f.trade.netPnl)}</span>
                        <span>←</span>
                        <span className={f.updates.netPnl >= 0 ? 'text-profit font-semibold' : 'text-loss font-semibold'}>
                          {money(f.updates.netPnl)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 2 — fabricated auto-close suspects */}
            {scan.suspects.length > 0 && (
              <div className="border border-amber-500/25 rounded-xl p-4 space-y-3">
                <SectionHeader
                  icon={<AlertTriangle className="w-4 h-4" />}
                  title="חתימת auto-close — נסגרו בלי PnL מהבורסה"
                  count={`${suspectIds.size}/${scan.suspects.length} נבחרו`}
                  tone="text-amber-400"
                  extra={
                    <button
                      onClick={() =>
                        setSuspectIds(suspectIds.size === scan.suspects.length ? new Set() : new Set(scan.suspects.map((s) => s.trade.id)))
                      }
                      className="text-xs text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      {suspectIds.size === scan.suspects.length ? 'נקה בחירה' : 'בחר הכל'}
                    </button>
                  }
                />
                <div className="text-[11px] text-text-muted leading-relaxed">
                  עסקאות בורסה סגורות ללא pnlFromExchange — ה-netPnl שלהן חושב בצד לקוח (לרוב מנופח).
                  סימון הוא הפיך; סנכרון מחדש מהבורסה יעדכן אותן עם ה-PnL האמיתי.
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {[
                    { v: 'flag', label: 'סמן בלבד (מומלץ)', Icon: Flag },
                    { v: 'delete', label: 'מחק', Icon: Trash2 },
                  ].map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setSuspectAction(o.v)}
                      className={`h-8 flex items-center gap-1.5 px-3 rounded-lg border transition-colors cursor-pointer ${
                        suspectAction === o.v
                          ? o.v === 'delete'
                            ? 'bg-red-500/15 border-red-500/40 text-red-400'
                            : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                          : 'bg-bg-tertiary border-border-primary text-text-muted hover:text-text-primary'
                      }`}
                    >
                      <o.Icon className="w-3.5 h-3.5" />
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5">
                  {scan.suspects.map((s) => (
                    <label
                      key={s.trade.id}
                      className="flex items-center gap-2.5 text-xs bg-bg-secondary/60 border border-border-primary rounded-lg px-3 py-2 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={suspectIds.has(s.trade.id)}
                        onChange={() => toggleSuspect(s.trade.id)}
                        className="w-3.5 h-3.5 accent-amber-500 cursor-pointer shrink-0"
                      />
                      <span className="font-mono font-semibold text-text-primary" dir="ltr">{tradeLabel(s.trade)}</span>
                      <span className="text-text-muted">{tradeDate(s.trade)}</span>
                      <span className="text-text-muted">{s.trade.source || 'externalId'}</span>
                      <span className="ms-auto flex items-center gap-1.5" dir="ltr">
                        {s.high && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30">
                            חריג
                          </span>
                        )}
                        <span className={s.netPnl == null ? 'text-text-muted' : s.netPnl >= 0 ? 'text-profit' : 'text-loss'}>{money(s.netPnl)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 3 — externalId duplicates */}
            {scan.dupeGroups.length > 0 && (
              <div className="border border-red-500/25 rounded-xl p-4 space-y-3">
                <SectionHeader
                  icon={<Copy className="w-4 h-4" />}
                  title="כפילויות externalId"
                  count={`${dupeIds.size} מחיקות ב-${scan.dupeGroups.length} קבוצות`}
                  tone="text-red-400"
                />
                <div className="text-[11px] text-text-muted">
                  בכל קבוצה נשמרת העסקה הטובה ביותר (עם pnlFromExchange / הוותיקה) והשאר מוצעות למחיקה.
                </div>
                <div className="max-h-64 overflow-y-auto space-y-2 pr-0.5">
                  {scan.dupeGroups.map((g) => (
                    <div key={g.key} className="bg-bg-secondary/60 border border-border-primary rounded-lg p-2.5 space-y-1">
                      <div className="text-[10px] text-text-muted font-mono" dir="ltr">{g.key}</div>
                      <div className="flex items-center gap-2.5 text-xs px-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-profit shrink-0" />
                        <span className="font-mono font-semibold text-text-primary" dir="ltr">{tradeLabel(g.keep)}</span>
                        <span className="text-text-muted">{tradeDate(g.keep)}</span>
                        <span className="text-[10px] text-profit">נשמרת</span>
                        <span className="ms-auto" dir="ltr">{money(g.keep.netPnl)}</span>
                      </div>
                      {g.remove.map((t) => (
                        <label key={t.id} className="flex items-center gap-2.5 text-xs px-1 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={dupeIds.has(t.id)}
                            onChange={() => toggleDupe(t.id)}
                            className="w-3.5 h-3.5 accent-red-500 cursor-pointer shrink-0"
                          />
                          <span className="font-mono text-text-secondary" dir="ltr">{tradeLabel(t)}</span>
                          <span className="text-text-muted">{tradeDate(t)}</span>
                          <span className="text-[10px] text-red-400">תימחק</span>
                          <span className="ms-auto text-text-muted" dir="ltr">{money(t.netPnl)}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer actions */}
            {totalOps > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 border-t border-border-primary">
                <div className="text-xs text-text-muted flex-1">
                  {totalOps} פעולות נבחרו{deleteCount ? ` (מתוכן ${deleteCount} מחיקות)` : ''}
                </div>
                <button
                  onClick={downloadBackup}
                  className="h-9 flex items-center justify-center gap-2 px-3.5 rounded-lg text-sm font-medium border bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  גיבוי JSON
                </button>
                <button
                  onClick={apply}
                  disabled={applying}
                  className="h-9 flex items-center justify-center gap-2 px-4 rounded-lg text-sm font-semibold border bg-accent-primary/15 border-accent-primary/40 text-accent-primary hover:bg-accent-primary/25 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  החל תיקונים ({totalOps})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
