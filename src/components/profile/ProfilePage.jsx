import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut,
  Trash2,
  Lock,
  Mail,
  Share2,
  Download,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Trophy,
  Crown,
  ShieldCheck,
  Clock,
  ArrowLeft,
  ChevronRight,
  Check,
  Coins,
  LineChart,
  Briefcase,
  UserRound,
} from 'lucide-react';
import PageHeader from '../shared/PageHeader';
import { headerIconBtn } from '../shared/headerStyles';
import toast from 'react-hot-toast';
import { getUserProfile, setUserProfile, deleteLeaderboardEntry } from '../../services/firestoreService';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../utils/formatters';
import { APP_VERSION } from '../../utils/constants';
import ConfirmDialog from '../shared/ConfirmDialog';
import { pageVariants, pageTransition } from '../../utils/animations';
import { useTheme } from '../../hooks/useTheme';
import NotificationSettings from './NotificationSettings';
import ContactDeveloper from './ContactDeveloper';
import { planExpiresMs } from '../../utils/premium';

const APP_URL = 'https://tradeos-91a58.web.app';

// What the user trades. Drives the new-trade form's default + which symbol
// catalog it shows. Multi-select: pick crypto, futures, or both. Stocks is
// on the roadmap (epic) but not wired yet, so it's shown disabled.
const ASSET_CLASSES = [
  { id: 'crypto', label: 'קריפטו', desc: 'מטבעות וחוזי פרפ', Icon: Coins },
  { id: 'futures_cme', label: 'חוזים עתידיים', desc: 'מדדים וסחורות — ES, NQ, GC', Icon: LineChart },
  { id: 'stocks', label: 'מניות', desc: 'בקרוב', Icon: Briefcase, soon: true },
];

// Small section heading that groups the settings cards into clear topics.
function SectionTitle({ children }) {
  return <h2 className="text-[11px] font-semibold text-text-muted px-1 mb-2 mt-6">{children}</h2>;
}

const cardClass = 'bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden';

export default function ProfilePage() {
  const { user, profile, isAdmin, isPremium, logout, changePassword, resetPassword, deleteAccount, isEmailUser } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
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
    if (newPassword.length < 8) {
      toast.error('הסיסמה חייבת להכיל לפחות 8 תווים');
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      toast.error('הסיסמה חייבת להכיל אות גדולה ומספר');
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
        : 'שגיאה בשינוי סיסמה';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAccount(isEmailUser ? deletePassword : null);
      toast.success('החשבון נמחק');
      navigate('/login');
    } catch (err) {
      console.error('Delete account failed:', err);
      const msg = err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
        ? 'סיסמה שגויה'
        : err.code === 'auth/requires-recent-login'
        ? 'נדרש אימות מחדש — התנתק, התחבר שוב ונסה מיד'
        : err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request'
        ? 'האימות בוטל — כדי למחוק את החשבון יש לאשר את חלון ההתחברות'
        : 'שגיאה במחיקת החשבון';
      toast.error(msg);
    }
    setDeleteOpen(false);
    setDeletePassword('');
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
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
      className="px-4 py-6">
      <div className="max-w-lg mx-auto">

      <PageHeader
        icon={UserRound}
        title={user?.displayName || 'הפרופיל שלי'}
        subtitle={[user?.email, user?.metadata?.creationTime ? `הצטרף ${formatDate(new Date(user.metadata.creationTime))}` : null].filter(Boolean).join(' · ')}
        actions={(
          <button onClick={() => navigate(-1)} className={headerIconBtn} title="חזרה" aria-label="חזרה">
            <ChevronRight className="w-[18px] h-[18px]" />
          </button>
        )}
      />

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

      {/* ── Section: Notifications ───────────────────────────────── */}
      <SectionTitle>התראות</SectionTitle>
      <div className={cardClass}>
        {/* Push notifications */}
        <NotificationSettings />
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
              <motion.div
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
              </motion.div>
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
        TradeOS v{APP_VERSION}
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => { setDeleteOpen(false); setDeletePassword(''); }}
        onConfirm={handleDelete}
        title="מחיקת חשבון"
        message="פעולה זו תמחק את כל הנתונים שלך לצמיתות ולא ניתן לשחזר אותם. האם אתה בטוח?"
      />
      </div>
    </motion.div>
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
