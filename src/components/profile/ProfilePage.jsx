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
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getUserCollectionDocs, getUserProfile, setUserProfile, deleteLeaderboardEntry } from '../../services/firestoreService';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../utils/formatters';
import { APP_VERSION } from '../../utils/constants';
import ConfirmDialog from '../shared/ConfirmDialog';
import { pageVariants, pageTransition } from '../../utils/animations';
import { useTheme } from '../../hooks/useTheme';
import TelegramSettings from './TelegramSettings';
import NotificationSettings from './NotificationSettings';
import ContactDeveloper from './ContactDeveloper';

const APP_URL = 'https://tradeos-91a58.web.app';

export default function ProfilePage() {
  const { user, logout, changePassword, resetPassword, deleteAccount, isEmailUser } = useAuth();
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

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(({ data }) => {
      setIsPublicProfile(data?.isPublicProfile || false);
      setLeaderboardName(data?.leaderboardName || '');
      setLeaderboardLoading(false);
    });
  }, [user]);

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
      const collections = ['trades', 'journals', 'backtests', 'dca', 'tradingPlans', 'notes', 'strategies'];
      const exportData = { exportedAt: new Date().toISOString(), user: { displayName: user.displayName, email: user.email } };

      for (const col of collections) {
        const docs = await getUserCollectionDocs(user.uid, col);
        exportData[col] = docs.map((data) => {
          // Convert Firestore Timestamps to ISO strings
          for (const [key, val] of Object.entries(data)) {
            if (val?.toDate) data[key] = val.toDate().toISOString();
          }
          return data;
        });
      }

      const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tradeos-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('הנתונים יוצאו בהצלחה');
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
      className="min-h-[calc(100vh-4rem)] px-4 py-6 cursor-pointer"
      onClick={() => navigate(-1)}>
      <div className="max-w-lg mx-auto cursor-default" onClick={(e) => e.stopPropagation()}>

      {/* Profile Card */}
      <div className="bg-bg-secondary border border-border-primary rounded-2xl p-6 mb-4 text-center">
        {user?.photoURL ? (
          <img src={user.photoURL} alt={user.displayName}
            className="w-20 h-20 rounded-full border-2 border-border-primary mx-auto mb-3" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-accent-primary/20 flex items-center justify-center text-accent-primary text-2xl font-bold mx-auto mb-3">
            {user?.displayName?.[0] || user?.email?.[0] || '?'}
          </div>
        )}
        <h1 className="text-xl font-bold text-text-primary">{user?.displayName || 'משתמש'}</h1>
        <p className="text-sm text-text-muted mt-1">{user?.email}</p>
        <p className="text-xs text-text-muted mt-2">
          הצטרף {user?.metadata?.creationTime ? formatDate(new Date(user.metadata.creationTime)) : ''}
        </p>
      </div>

      {/* Actions */}
      <div className="bg-bg-secondary border border-border-primary rounded-2xl overflow-hidden mb-4">
        {/* Change Password - email users only */}
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
                    placeholder="סיסמה נוכחית" required dir="ltr" className={inputClass} />
                </div>
                <div className="relative">
                  <input type={showPasswords ? 'text' : 'password'} value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="סיסמה חדשה (לפחות 6 תווים)" required dir="ltr" className={inputClass} />
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
              </form>
            )}
          </div>
        )}

        {/* Reset Password - email users only */}
        {isEmailUser && (
          <button onClick={async () => {
            try {
              await resetPassword(user.email);
              toast.success('נשלח מייל לאיפוס סיסמה');
            } catch { toast.error('שגיאה בשליחת מייל'); }
          }}
            className="w-full flex items-center gap-3 px-5 py-4 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary">
            <Mail className="w-5 h-5 text-text-muted" />
            איפוס סיסמה במייל
          </button>
        )}

        {/* Theme Toggle */}
        <button onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-5 py-4 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary">
          {isDark ? <Sun className="w-5 h-5 text-text-muted" /> : <Moon className="w-5 h-5 text-text-muted" />}
          {isDark ? 'מצב בהיר' : 'מצב כהה'}
        </button>

        {/* Push notifications */}
        <NotificationSettings />

        {/* Telegram Bot */}
        <TelegramSettings />

        {/* Contact Developer */}
        <ContactDeveloper />

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

        {/* Share */}
        <button onClick={handleShare}
          className="w-full flex items-center gap-3 px-5 py-4 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary">
          <Share2 className="w-5 h-5 text-text-muted" />
          שיתוף האפליקציה
        </button>

        {/* Export */}
        <button onClick={handleExport} disabled={exporting}
          className="w-full flex items-center gap-3 px-5 py-4 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary disabled:opacity-50">
          <Download className="w-5 h-5 text-text-muted" />
          {exporting ? 'מייצא...' : 'ייצוא נתונים'}
        </button>

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

      <div className="text-center text-xs text-text-muted mt-4" dir="ltr">
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
