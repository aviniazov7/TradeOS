import { useState, useEffect, useRef } from 'react';
import { passwordProblem } from '../../utils/passwordPolicy';
import { authErrorHe } from '../../utils/authErrors';
import { useNavigate } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { LogOut, Trash2, Lock, Mail, Share2, Download, Eye, EyeOff, Sun, Moon, Trophy, Crown, ShieldCheck, Clock, ArrowLeft, ChevronRight, Check, Coins, LineChart, Briefcase, Receipt, ChevronLeft, Camera, Pencil } from 'lucide-react';
import UserAvatar from '../shared/UserAvatar';
import { makeAvatarDataUrl } from '../../utils/avatarImage';
import { headerIconBtn } from '../shared/headerStyles';
import toast from 'react-hot-toast';
import { getUserProfile, setUserProfile, deleteLeaderboardEntry } from '../../services/firestoreService';
import { updateDisplayName } from '../../services/authService';
import {
  DELETE_CONFIRM_WORD,
  displayNameProblem,
  canConfirmAccountDeletion,
  accountDeletionErrorText,
} from '../../utils/profileAccount';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../utils/formatters';
import { APP_VERSION } from '../../utils/constants';
import Modal from '../shared/Modal';
import { pageVariants, pageTransition } from '../../utils/animations';
import { useTheme } from '../../hooks/useTheme';
import NotificationSettings from './NotificationSettings';
import MarketingEmailToggle from './MarketingEmailToggle';
import ContactDeveloper from './ContactDeveloper';
import { planExpiresMs } from '../../utils/premium';

/* global __APP_BUILD__, __APP_BUILD_DATE__ */
// Release stamp next to the hand-set marketing version: the auto-bumped
// production build number and the build date.
const BUILD_LABEL = (() => {
  const build = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : '';
  const date = typeof __APP_BUILD_DATE__ !== 'undefined' ? new Date(__APP_BUILD_DATE__) : null;
  const parts = [];
  if (build) parts.push(`build ${build}`);
  if (date && !Number.isNaN(date.getTime())) parts.push(date.toLocaleDateString('he-IL'));
  return parts.length ? ` · ${parts.join(' · ')}` : '';
})();

const APP_URL = 'https://tradeoslive.web.app';

// What the user trades. Drives the new-trade form's default + which symbol
// catalog it shows. Multi-select (Premium): crypto, futures, stocks.
const ASSET_CLASSES = [
  { id: 'crypto', label: 'קריפטו', desc: 'מטבעות וחוזי פרפ', Icon: Coins },
  { id: 'futures_cme', label: 'חוזים עתידיים', desc: 'מדדים וסחורות — ES, NQ, GC', Icon: LineChart },
  { id: 'stocks', label: 'מניות', desc: 'מניות ו-ETF — AAPL, NVDA, SPY', Icon: Briefcase },
];

// Small section heading that groups the settings cards into clear topics.
function SectionTitle({ children }) {
  return <h2 className="text-[11px] font-semibold text-text-muted px-1 mb-2 mt-6">{children}</h2>;
}

const cardClass = 'bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden';

export default function ProfilePage() {
  const { user, profile, isAdmin, isPremium, logout, changePassword, resetPassword, deleteAccount, isEmailUser } = useAuth();
  // Profile picture: compressed client-side and saved on the user's own
  // profile doc; the live profile subscription updates every avatar.
  const avatarInputRef = useRef(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const onAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setAvatarBusy(true);
    try {
      const avatarDataUrl = await makeAvatarDataUrl(file);
      await setUserProfile(user.uid, { avatarDataUrl });
      toast.success('תמונת הפרופיל עודכנה');
    } catch (err) {
      toast.error(err?.message?.length < 60 ? err.message : 'עדכון התמונה נכשל');
    } finally {
      setAvatarBusy(false);
    }
  };
  const removeAvatar = async () => {
    if (!user) return;
    setAvatarBusy(true);
    try {
      await setUserProfile(user.uid, { avatarDataUrl: '' });
      toast.success('התמונה הוסרה');
    } catch {
      toast.error('הסרת התמונה נכשלה');
    } finally {
      setAvatarBusy(false);
    }
  };
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reauthStep, setReauthStep] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [isPublicProfile, setIsPublicProfile] = useState(false);
  const [leaderboardName, setLeaderboardName] = useState('');
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  // Which asset classes the user trades (default crypto for back-compat).
  const [assetClasses, setAssetClasses] = useState(['crypto']);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(({ data }) => {
      setIsPublicProfile(data?.isPublicProfile || false);
      setLeaderboardName(data?.leaderboardName || '');
      const ac = data?.settings?.assetClasses;
      if (Array.isArray(ac) && ac.length) setAssetClasses(ac);
      setLeaderboardLoading(false);
    });
  }, [user]);

  const persistAssetClasses = async (next) => {
    const prev = assetClasses;
    setAssetClasses(next);
    try {
      // setDoc merge deep-merges the settings map, so other settings survive.
      await setUserProfile(user.uid, { settings: { assetClasses: next } });
    } catch {
      setAssetClasses(prev);
      toast.error('שגיאה בשמירה');
    }
  };

  const toggleAssetClass = async (id) => {
    const has = assetClasses.includes(id);
    // Free tier = a single market. Tapping another card switches to it
    // (replace), so the user can always change markets but never holds two
    // at once. Trading several markets simultaneously is a Premium feature.
    if (!isPremium) {
      if (has) return; // already the active market — nothing to switch
      persistAssetClasses([id]);
      return;
    }
    const next = has ? assetClasses.filter((x) => x !== id) : [...assetClasses, id];
    if (next.length === 0) {
      toast.error('צריך לבחור לפחות סוג מסחר אחד');
      return;
    }
    persistAssetClasses(next);
  };

  const handleLeaderboardToggle = async () => {
    const newVal = !isPublicProfile;
    setIsPublicProfile(newVal);
    try {
      await setUserProfile(user.uid, { isPublicProfile: newVal });
      if (newVal) {
        toast.success('הצטרפת ללוח המובילים! הנתונים יתעדכנו ברענון הבא.');
      } else {
        await deleteLeaderboardEntry(user.uid);
        toast.success('יצאת מלוח המובילים');
      }
    } catch {
      setIsPublicProfile(!newVal);
      toast.error('שגיאה בעדכון');
    }
  };

  const handleLeaderboardNameSave = async () => {
    if (!leaderboardName.trim()) return;
    try {
      await setUserProfile(user.uid, { leaderboardName: leaderboardName.trim() });
      toast.success('הכינוי עודכן');
    } catch {
      toast.error('שגיאה בעדכון');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const problem = passwordProblem(newPassword);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success('הסיסמה שונתה בהצלחה');
      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      console.error('Change password failed:', err);
      const msg = err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
        ? 'סיסמה נוכחית שגויה'
        : authErrorHe(err, 'שגיאה בשינוי סיסמה');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const shownName = profile?.displayName || user?.displayName || '';
  const startEditName = () => {
    setNameDraft(shownName);
    setNameError('');
    setEditingName(true);
  };
  const saveName = async (e) => {
    e.preventDefault();
    const nameErrorText = displayNameProblem(nameDraft);
    if (nameErrorText) { setNameError(nameErrorText); return; }
    const next = nameDraft.trim();
    if (!user) return;
    setNameSaving(true);
    setNameError('');
    try {
      await updateDisplayName(next);
      await setUserProfile(user.uid, { displayName: next });
      toast.success('השם עודכן');
      setEditingName(false);
    } catch (err) {
      console.error('Rename failed:', err);
      setNameError(err?.code === 'auth/requires-recent-login'
        ? 'נדרש אימות מחדש — התנתק, התחבר שוב ונסה'
        : 'עדכון השם נכשל');
    } finally {
      setNameSaving(false);
    }
  };

  const closeDelete = () => {
    if (deleteBusy) return;
    setDeleteOpen(false);
    setDeletePassword('');
    setDeleteConfirmText('');
    setDeleteError('');
    setReauthStep(false);
  };
  // Email: the password IS the confirmation and the re-auth credential.
  // Google: a typed word, then the Google popup re-authenticates.
  const canDelete = canConfirmAccountDeletion({
    isEmailUser,
    password: deletePassword,
    confirmText: deleteConfirmText,
  });
  const handleDelete = async () => {
    if (!canDelete || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await deleteAccount(isEmailUser ? deletePassword : null);
      // A full reload, not a route change: the local Firestore cache was just
      // erased (and Firestore shut down), and the next visitor starts clean.
      window.location.replace('/login?deleted=1');
    } catch (err) {
      console.error('Delete account failed:', err);
      if (err?.code === 'auth/requires-recent-login') setReauthStep(true);
      // Stay on the dialog. Closing it (and only toasting) made the first
      // failure look like nothing happened.
      setDeleteError(accountDeletionErrorText(err));
      setDeleteBusy(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'TradeOS',
          text: 'מערכת הפעלה למסחר - יומן מסחר, בקטסטינג, DCA ועוד',
          url: APP_URL,
        });
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(APP_URL);
      toast.success('הקישור הועתק');
    }
  };

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      // Lazy-loaded so the xlsx dependency only ships when someone exports.
      const { exportToExcel } = await import('../../services/exportService');
      const { filename, total } = await exportToExcel(user);
      toast.success(`${filename} · ${total} רשומות יוצאו`);
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('שגיאה בייצוא הנתונים');
    } finally {
      setExporting(false);
    }
  };

  const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';

  return (
    <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
      className="px-4 py-6">
      <div className="max-w-lg mx-auto">

      {/* Profile hero: the picture (tap to change), name, email, plan. */}
      <div className="relative overflow-hidden bg-bg-secondary border border-border-primary rounded-2xl p-5 mb-2">
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(80% 140% at 100% 0%, rgba(0,123,167,0.14) 0%, transparent 60%)' }} />
        <div className="relative flex items-center gap-4">
          <div className="relative shrink-0">
            <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarBusy}
              className="group relative block rounded-full ring-2 ring-border-primary hover:ring-accent-primary/60 transition cursor-pointer disabled:opacity-60"
              title="החלפת תמונת פרופיל" aria-label="החלפת תמונת פרופיל">
              <UserAvatar className="w-[72px] h-[72px]" textClass="text-2xl" />
              <span className="absolute -bottom-0.5 -left-0.5 w-7 h-7 grid place-items-center rounded-full bg-accent-muted text-white border-2 border-bg-secondary">
                {avatarBusy ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </span>
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={onAvatarFile} />
          </div>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <form onSubmit={saveName} className="flex items-start gap-1.5">
                <div className="min-w-0 flex-1">
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => { setNameDraft(e.target.value); setNameError(''); }}
                    maxLength={50}
                    aria-label="שם תצוגה"
                    aria-invalid={nameError ? true : undefined}
                    className={`w-full bg-bg-tertiary border rounded-lg px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary ${nameError ? 'border-loss' : 'border-border-primary'}`}
                  />
                  {nameError && <p role="alert" className="text-[10px] text-loss mt-1">{nameError}</p>}
                </div>
                <button type="submit" disabled={nameSaving}
                  className="h-8 px-2.5 rounded-lg bg-accent-primary text-bg-primary text-xs font-semibold disabled:opacity-50 cursor-pointer">
                  {nameSaving ? '...' : 'שמור'}
                </button>
                <button type="button" onClick={() => setEditingName(false)} disabled={nameSaving}
                  className="h-8 px-2 rounded-lg text-xs text-text-muted hover:text-text-primary cursor-pointer">
                  ביטול
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <h1 className="text-xl font-bold text-text-primary truncate">{shownName || 'הפרופיל שלי'}</h1>
                <button type="button" onClick={startEditName} aria-label="עריכת שם תצוגה" title="עריכת שם"
                  className="shrink-0 p-1 rounded-md text-text-muted hover:text-accent-primary hover:bg-bg-tertiary cursor-pointer">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <p className="text-sm text-text-muted truncate" dir="ltr" style={{ textAlign: 'right' }}>{user?.email}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-bold border ${
                isAdmin ? 'bg-accent-primary/12 text-accent-hover border-accent-primary/30'
                  : isPremium ? 'bg-amber-400/12 text-amber-300 border-amber-400/30'
                    : 'bg-bg-tertiary text-text-secondary border-border-primary'}`}>
                {isAdmin ? <ShieldCheck className="w-3 h-3" /> : isPremium ? <Crown className="w-3 h-3" /> : null}
                {isAdmin ? 'אדמין' : isPremium ? 'Premium' : 'חינמי'}
              </span>
              {user?.metadata?.creationTime && (
                <span className="text-[11px] text-text-muted">הצטרף {formatDate(new Date(user.metadata.creationTime))}</span>
              )}
              {profile?.avatarDataUrl && (
                <button type="button" onClick={removeAvatar} disabled={avatarBusy}
                  className="text-[11px] text-text-muted hover:text-loss underline-offset-2 hover:underline cursor-pointer">
                  הסרת תמונה
                </button>
              )}
            </div>
          </div>
          <button onClick={() => navigate(-1)} className={`${headerIconBtn} self-start`} title="חזרה" aria-label="חזרה">
            <ChevronRight className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>

      {/* ── Section: Trading ─────────────────────────────────────── */}
      <SectionTitle>מסחר</SectionTitle>

      {/* Asset classes the user trades — drives the new-trade form default
          and which symbol catalog it shows. Multi-select. */}
      <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-1">סוג מסחר</h3>
        <p className="text-xs text-text-muted mb-3">
          מה אתה סוחר — קובע את ברירת המחדל ליומן חדש. את הסוג של כל יומן אפשר לשנות בהגדרות היומן.
          {isPremium ? ' אפשר לבחור כמה.' : ' אפשר לבחור סוג אחד.'}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ASSET_CLASSES.map((ac) => {
            const active = assetClasses.includes(ac.id);
            return (
              <button
                key={ac.id}
                type="button"
                disabled={ac.soon}
                onClick={() => !ac.soon && toggleAssetClass(ac.id)}
                className={`relative text-right rounded-xl border p-2.5 sm:p-3 transition-all ${
                  ac.soon
                    ? 'border-border-primary/50 opacity-50 cursor-not-allowed'
                    : active
                      ? 'border-accent-primary bg-accent-primary/10 cursor-pointer'
                      : 'border-border-primary hover:border-border-hover cursor-pointer'
                }`}
              >
                {active && !ac.soon && (
                  <span className="absolute top-2 left-2 w-4 h-4 rounded-full bg-accent-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-bg-primary" />
                  </span>
                )}
                <ac.Icon className={`w-4 h-4 sm:w-5 sm:h-5 mb-1 sm:mb-1.5 ${active && !ac.soon ? 'text-accent-primary' : 'text-text-muted'}`} />
                <div className="text-xs sm:text-sm font-semibold text-text-primary leading-tight">{ac.label}</div>
                <div className="text-[10px] sm:text-[11px] text-text-muted leading-tight mt-0.5">{ac.desc}</div>
              </button>
            );
          })}
        </div>
        {!isPremium && (
          <button
            type="button"
            onClick={() => navigate('/premium')}
            className="mt-3 flex items-center gap-1.5 text-[11px] text-accent-primary hover:underline cursor-pointer"
          >
            <Crown className="w-3.5 h-3.5" />
            מסחר בכמה סוגים במקביל — שדרג ל-Premium
          </button>
        )}
      </div>

      {/* ── Section: Subscription ────────────────────────────────── */}
      <SectionTitle>מנוי</SectionTitle>

      {/* Plan / Premium status — shows different states (admin, lifetime,
          expiring soon, normal premium, free). Brings the upgrade/renew CTA
          out of the sidebar and into the user's main settings hub. */}
      <PlanCard
        profile={profile}
        isAdmin={isAdmin}
        isPremium={isPremium}
        onUpgrade={() => navigate('/premium')}
      />

      {/* ── Section: Reports ─────────────────────────────────────── */}
      {/* Yearly tools that aren't daily destinations live here, not in the
          main menu. */}
      <SectionTitle>דוחות</SectionTitle>
      <div className={cardClass}>
        <button onClick={() => navigate('/tax')}
          className="w-full flex items-center gap-3 px-5 py-4 text-right hover:bg-bg-tertiary transition-colors cursor-pointer">
          <span className="w-9 h-9 shrink-0 grid place-items-center rounded-xl bg-accent-primary/12 border border-accent-primary/20">
            <Receipt className="w-[18px] h-[18px] text-accent-hover" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-text-primary">דוח מס שנתי</span>
            <span className="block text-xs text-text-muted mt-0.5">רווחי הון בשקלים לפי שער בנק ישראל — לרואה החשבון</span>
          </span>
          <ChevronLeft className="w-4 h-4 text-text-muted shrink-0" />
        </button>
      </div>

      {/* ── Section: Notifications ───────────────────────────────── */}
      <SectionTitle>התראות</SectionTitle>
      <div className={cardClass}>
        {/* Push notifications */}
        <NotificationSettings />
        {/* Marketing email — on unless the user turned it off */}
        <MarketingEmailToggle />
      </div>

      {/* ── Section: General ─────────────────────────────────────── */}
      <SectionTitle>כללי</SectionTitle>
      <div className={cardClass}>
        {/* Theme Toggle */}
        <button onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-5 py-4 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary">
          {isDark ? <Sun className="w-5 h-5 text-text-muted" /> : <Moon className="w-5 h-5 text-text-muted" />}
          {isDark ? 'מצב בהיר' : 'מצב כהה'}
        </button>

        {/* Contact Developer */}
        <ContactDeveloper />

        {/* Share */}
        <button onClick={handleShare}
          className="w-full flex items-center gap-3 px-5 py-4 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary">
          <Share2 className="w-5 h-5 text-text-muted" />
          שיתוף האפליקציה
        </button>

        {/* Export */}
        <button onClick={handleExport} disabled={exporting}
          className="w-full flex items-center gap-3 px-5 py-4 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer disabled:opacity-50">
          <Download className="w-5 h-5 text-text-muted" />
          {exporting ? 'מייצא...' : 'ייצוא נתונים'}
        </button>
      </div>

      {/* ── Section: Account ─────────────────────────────────────── */}
      <SectionTitle>חשבון</SectionTitle>
      <div className={cardClass}>
        {/* Password management — one entry point, with a 'forgot' link inside
            the form. The old standalone 'Reset via email' button used to live
            below as a second row; folding it inside the form keeps the page
            uncluttered while still covering the case where the user can't
            recall their current password. */}
        {isEmailUser && (
          <div>
            <button onClick={() => setShowPasswordForm(!showPasswordForm)}
              className="w-full flex items-center gap-3 px-5 py-4 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary">
              <Lock className="w-5 h-5 text-text-muted" />
              שינוי סיסמה
            </button>
            {showPasswordForm && (
              <form onSubmit={handleChangePassword} className="px-5 py-4 space-y-3 border-b border-border-primary bg-bg-tertiary/50">
                <div className="relative">
                  <input type={showPasswords ? 'text' : 'password'} value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="סיסמה נוכחית" required
                    dir={currentPassword ? 'ltr' : 'rtl'}
                    className={`${inputClass} ${currentPassword ? 'text-left' : 'text-right'}`} />
                </div>
                <div className="relative">
                  <input type={showPasswords ? 'text' : 'password'} value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="סיסמה חדשה — 8+ תווים, אות גדולה ומספר" required
                    dir={newPassword ? 'ltr' : 'rtl'}
                    className={`${inputClass} ${newPassword ? 'text-left' : 'text-right'}`} />
                </div>
                <button type="button" onClick={() => setShowPasswords(!showPasswords)}
                  className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary cursor-pointer">
                  {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showPasswords ? 'הסתר סיסמאות' : 'הצג סיסמאות'}
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowPasswordForm(false); setCurrentPassword(''); setNewPassword(''); }}
                    className="flex-1 py-2 rounded-lg bg-bg-secondary text-text-primary text-sm hover:bg-border-hover transition-colors cursor-pointer">
                    ביטול
                  </button>
                  <button type="submit" disabled={saving}
                    className="flex-1 py-2 rounded-lg bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50">
                    {saving ? 'שומר...' : 'שנה סיסמה'}
                  </button>
                </div>
                {/* 'Forgot password' escape hatch — same Firebase reset email
                    as the old standalone button, just one click further down
                    the journey. Most users won't need it. */}
                <div className="pt-2 mt-2 border-t border-border-primary/40">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await resetPassword(user.email);
                        toast.success('נשלח מייל לאיפוס סיסמה');
                      } catch {
                        toast.error('שגיאה בשליחת מייל');
                      }
                    }}
                    className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-primary cursor-pointer transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    שכחת את הסיסמה? קבל קישור איפוס במייל
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Leaderboard Opt-in - hidden temporarily */}
        {false && (
        <div>
          <button onClick={handleLeaderboardToggle}
            disabled={leaderboardLoading}
            className="w-full flex items-center justify-between px-5 py-4 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary">
            <div className="flex items-center gap-3">
              <Trophy className={`w-5 h-5 ${isPublicProfile ? 'text-yellow-500' : 'text-text-muted'}`} />
              לוח מובילים
            </div>
            <div className={`w-10 h-5 rounded-full transition-colors ${isPublicProfile ? 'bg-accent-primary' : 'bg-border-primary'} relative`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isPublicProfile ? 'right-0.5' : 'left-0.5'}`} />
            </div>
          </button>
          <AnimatePresence>
            {isPublicProfile && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden border-b border-border-primary"
              >
                <div className="px-5 py-4 space-y-3 bg-bg-tertiary/50">
                  <div>
                    <label className="block text-xs text-text-muted mb-1">כינוי בדירוג</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={leaderboardName}
                        onChange={(e) => setLeaderboardName(e.target.value)}
                        placeholder={user?.displayName || 'הכינוי שלך'}
                        className="flex-1 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors"
                      />
                      <button
                        onClick={handleLeaderboardNameSave}
                        className="px-3 py-2 rounded-lg bg-accent-primary text-bg-primary text-xs font-semibold hover:bg-accent-hover transition-colors cursor-pointer"
                      >
                        שמור
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-text-muted text-center">הביצועים שלך יוצגו בלוח המובילים. נדרשות לפחות 10 עסקאות סגורות.</p>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
        )}

        {/* Logout */}
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-5 py-4 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary">
          <LogOut className="w-5 h-5 text-text-muted" />
          התנתקות
        </button>

        {/* Delete Account */}
        <button onClick={() => setDeleteOpen(true)}
          className="w-full flex items-center gap-3 px-5 py-4 text-sm text-loss hover:bg-loss/10 transition-colors cursor-pointer">
          <Trash2 className="w-5 h-5" />
          מחיקת חשבון
        </button>
      </div>

      <div className="text-center mt-4">
        <button
          onClick={() => navigate('/accessibility')}
          className="text-xs text-text-muted hover:text-accent-primary transition-colors cursor-pointer"
        >
          הצהרת נגישות
        </button>
      </div>

      <div className="text-center text-xs text-text-muted mt-2" dir="ltr">
        TradeOS v{APP_VERSION}{BUILD_LABEL}
      </div>

      <Modal isOpen={deleteOpen} onClose={closeDelete} title={reauthStep ? 'אימות לפני מחיקה' : 'מחיקת חשבון'} maxWidth="max-w-sm">
        <p className="text-sm text-text-secondary mb-3">
          {reauthStep
            ? (isEmailUser
              ? 'Firebase דורש התחברות טרייה לפני מחיקת חשבון. הזן את הסיסמה — המחיקה תמשיך מיד אחרי האימות.'
              : 'Firebase דורש התחברות טרייה לפני מחיקת חשבון. אשר את חלון Google — המחיקה תמשיך מיד אחרי האימות.')
            : 'פעולה זו תמחק את כל הנתונים שלך לצמיתות ולא ניתן לשחזר אותם.'}
        </p>
        {isEmailUser ? (
          <div className="mb-3">
            <label htmlFor="delete-password" className="block text-xs text-text-muted mb-1">סיסמה נוכחית</label>
            <div className="relative">
              <input id="delete-password" type={showDeletePassword ? 'text' : 'password'} value={deletePassword}
                onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(''); }}
                autoComplete="current-password"
                className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary"
              />
              <button type="button" onClick={() => setShowDeletePassword((v) => !v)} aria-label={showDeletePassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted cursor-pointer">
                {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <label htmlFor="delete-confirm" className="block text-xs text-text-muted mb-1">
              הקלד <span className="font-semibold text-text-primary">{DELETE_CONFIRM_WORD}</span> לאישור
            </label>
            <input id="delete-confirm" value={deleteConfirmText}
              onChange={(e) => { setDeleteConfirmText(e.target.value); setDeleteError(''); }}
              autoComplete="off"
              className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary"
            />
          </div>
        )}
        {deleteError && (
          <p role="alert" className="text-xs text-loss mb-3">{deleteError}</p>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={handleDelete} disabled={!canDelete || deleteBusy}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-loss text-white hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-50">
            {deleteBusy ? '...' : reauthStep ? (isEmailUser ? 'אמת ומחק' : 'אמת עם Google ומחק') : 'מחק חשבון'}
          </button>
          <button type="button" onClick={closeDelete} disabled={deleteBusy}
            className="flex-1 py-2.5 rounded-lg bg-bg-tertiary text-text-secondary text-sm font-medium hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50">
            ביטול
          </button>
        </div>
      </Modal>
      </div>
    </m.div>
  );
}

// ── Plan / Premium status card ─────────────────────────────────────────────
// Shows the user's current plan state above the actions list. Four states:
//   - admin              → cyan, no upgrade prompt
//   - premium expiring   → amber+orange warning when ≤7 days left
//   - premium normal     → amber with days left + expiry date
//   - free               → blue, upgrade CTA + feature bullets
const EXPIRY_WARN_DAYS = 7;
const PREMIUM_BULLETS = [
  'יומנים ללא הגבלה',
  'AI Coach לניתוח עסקאות',
  'סנכרון בורסות אוטומטי',
  'מעקב ארנקים על הבלוקצ\'יין',
];

function PlanCard({ profile, isAdmin, isPremium, onUpgrade }) {
  const planExpires = profile?.planExpires || null;
  const expMs = planExpiresMs(planExpires);
  const daysLeft = expMs != null
    ? Math.ceil((expMs - Date.now()) / 86400000)
    : null;
  const isExpiringSoon = isPremium && !isAdmin && daysLeft != null && daysLeft >= 0 && daysLeft <= EXPIRY_WARN_DAYS;
  const expiryStr = expMs != null
    ? new Date(expMs).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  // 1. Admin → short, neutral, cyan
  if (isAdmin) {
    return (
      <div className="bg-bg-secondary border border-accent-primary/30 rounded-2xl px-5 py-4 mb-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-primary/15 flex items-center justify-center text-accent-primary">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-text-primary">חשבון אדמין</div>
          <div className="text-xs text-text-muted">גישה מלאה לכל הפיצ׳רים</div>
        </div>
      </div>
    );
  }

  // 2. Premium — expiring soon (≤7 days) → orange-amber warning
  if (isExpiringSoon) {
    const daysText = daysLeft === 0 ? 'היום' : daysLeft === 1 ? 'מחר' : `עוד ${daysLeft} ימים`;
    return (
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/15 via-bg-secondary to-bg-secondary border border-amber-500/40 rounded-2xl px-5 py-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-amber-400">המנוי שלך נגמר {daysText}</div>
            <div className="text-xs text-text-secondary mt-0.5">חדש עכשיו לפני שתאבד גישה לפיצ׳רים</div>
            <button
              onClick={onUpgrade}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 text-bg-primary text-sm font-bold hover:bg-amber-400 transition-colors cursor-pointer"
            >
              🔥 חדש עכשיו
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Premium — normal (>7 days). Defensive: if for any reason there's no
  //    expiry (legacy admin grants), the days/expiry/renew bits hide
  //    themselves; we don't sell a lifetime plan so the empty case is rare.
  if (isPremium) {
    return (
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/12 via-bg-secondary to-bg-secondary border border-amber-500/30 rounded-2xl px-5 py-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-amber-400">Premium פעיל</div>
            {daysLeft != null && (
              <div className="text-xs text-text-secondary mt-1">
                נשארו לך <span className="font-bold text-text-primary">{daysLeft} ימים</span>
              </div>
            )}
            {expiryStr && (
              <div className="text-[11px] text-text-muted mt-0.5">תוקף עד {expiryStr}</div>
            )}
            {planExpires && (
              <button
                onClick={onUpgrade}
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-500/25 transition-colors cursor-pointer"
              >
                חדש מנוי
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 5. Free → blue, inviting, feature bullets + CTA
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-accent-primary/12 via-bg-secondary to-bg-secondary border border-accent-primary/30 rounded-2xl px-5 py-5 mb-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-accent-primary/20 flex items-center justify-center text-accent-primary shrink-0">
          <Crown className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-text-primary">פתח את כל הכוח של TradeOS</div>
          <div className="text-xs text-text-muted mt-0.5">שדרג ל-Premium וקבל גישה מלאה</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1.5 mb-4">
        {PREMIUM_BULLETS.map((b) => (
          <div key={b} className="flex items-center gap-2 text-xs text-text-secondary">
            <Check className="w-3.5 h-3.5 text-profit shrink-0" />
            <span>{b}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onUpgrade}
        className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition-colors cursor-pointer"
      >
        שדרג ל-Premium
        <ArrowLeft className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
