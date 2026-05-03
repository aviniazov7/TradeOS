import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, Clock, Calendar, Save, History, Sunrise, Anchor } from 'lucide-react';
import toast from 'react-hot-toast';
import EmotionPicker from './EmotionPicker';
import ReadinessSlider from './ReadinessSlider';
import JournalHistory from './JournalHistory';
import { useMentalityJournals } from '../../hooks/useMentalityJournals';
import { PRE_MARKET_CHECKLIST, MOTIVATIONAL_QUOTES } from '../../utils/constants';

const tabs = ['הכנה למסחר', 'תכנון מסחר', 'יעדים ומוטיבציה'];

const stepVariants = {
  enter: (dir) => ({ x: dir > 0 ? 150 : -150, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -150 : 150, opacity: 0 }),
};

const emptyForm = {
  emotion: '',
  readinessLevel: 5,
  preMarketChecklist: [],
  thingsIAppreciate: ['', '', ''],
  mainGoal: '',
  focusToday: '',
  dailyGoals: '',
  motivation: '',
};

export default function MorningJournal() {
  const navigate = useNavigate();
  const { todayMorning, morningEntries, saveMorningEntry, deleteMorningEntry } = useMentalityJournals();
  const [activeTab, setActiveTab] = useState('form');
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const justSaved = useRef(false);

  const todayStr = new Date().toISOString().slice(0, 10);

  const [quote] = useState(
    () => MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)]
  );

  useEffect(() => {
    if (justSaved.current) {
      justSaved.current = false;
      return;
    }
    if (todayMorning) {
      setForm({
        emotion: todayMorning.emotion || '',
        readinessLevel: todayMorning.readinessLevel || 5,
        preMarketChecklist: todayMorning.preMarketChecklist || [],
        thingsIAppreciate: todayMorning.thingsIAppreciate || ['', '', ''],
        mainGoal: todayMorning.mainGoal || '',
        focusToday: todayMorning.focusToday || '',
        dailyGoals: todayMorning.dailyGoals || '',
        motivation: todayMorning.motivation || '',
      });
    }
  }, [todayMorning]);

  const goToStep = (s) => {
    setDirection(s > step ? 1 : -1);
    setStep(s);
  };

  const toggleChecklist = (key) => {
    setForm((prev) => ({
      ...prev,
      preMarketChecklist: prev.preMarketChecklist.includes(key)
        ? prev.preMarketChecklist.filter((k) => k !== key)
        : [...prev.preMarketChecklist, key],
    }));
  };

  const updateAppreciate = (index, value) => {
    setForm((prev) => {
      const arr = [...prev.thingsIAppreciate];
      arr[index] = value;
      return { ...prev, thingsIAppreciate: arr };
    });
  };

  const handleSave = async () => {
    if (!form.emotion) {
      toast.error('בחר רגש לפני השמירה');
      goToStep(0);
      return;
    }
    setSaving(true);
    try {
      await saveMorningEntry({ ...form, date: todayStr });
      toast.success(todayMorning ? 'יומן בוקר עודכן' : 'יומן בוקר נשמר');
      justSaved.current = true;
      setForm(emptyForm);
      setStep(0);
    } catch (err) {
      console.error(err);
      toast.error('שגיאה בשמירה');
    }
    setSaving(false);
  };


  const now = new Date();
  const timeStr = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  let filled = 0;
  if (form.emotion) filled++;
  if (form.preMarketChecklist.length > 0) filled++;
  if (form.thingsIAppreciate.some((t) => t.trim())) filled++;
  if (form.mainGoal.trim()) filled++;
  if (form.focusToday.trim()) filled++;
  if (form.dailyGoals.trim()) filled++;
  if (form.motivation.trim()) filled++;
  const completionPct = Math.round((filled / 7) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col max-w-4xl mx-auto w-full"
      style={{ minHeight: 'calc(100vh - 7rem)' }}
    >
      {/* Compact header */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/mentality')}
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Calendar className="w-3 h-3" />
              {dateStr}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Clock className="w-3 h-3" />
            {timeStr}
          </div>
        </div>

        <h1 className="text-lg font-bold text-accent-primary text-center mb-1.5">יומן סוחר - בוקר</h1>

        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex-1 h-1 bg-bg-tertiary rounded-full overflow-hidden">
            <div className="h-full bg-accent-primary rounded-full transition-all duration-300" style={{ width: `${completionPct}%` }} />
          </div>
          <span className="text-[10px] text-text-muted">{completionPct}%</span>
        </div>

        <p className="text-center text-[11px] text-text-muted italic">"{quote}"</p>

        <div className="flex gap-2 mt-2.5">
          <button
            onClick={() => setActiveTab('form')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'form' ? 'bg-accent-primary text-white' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
          >
            <Sunrise className="w-3.5 h-3.5" />
            יומן בוקר
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'history' ? 'bg-accent-primary text-white' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            היסטוריית יומנים
          </button>
        </div>
      </div>

      {activeTab === 'history' ? (
        <JournalHistory entries={morningEntries} type="morning" onDeleteEntry={deleteMorningEntry} />
      ) : (
        <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden flex-1 flex flex-col">
          {/* Step tabs */}
          <div className="flex border-b border-border-primary">
            {tabs.map((tab, i) => (
              <button
                key={tab}
                onClick={() => goToStep(i)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  i === step
                    ? 'text-accent-primary border-b-2 border-accent-primary bg-accent-primary/5'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Step content */}
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25 }}
                className="p-4"
              >
                {step === 0 && (
                  <div className="space-y-4">
                    {/* Section title */}
                    <div className="flex items-center gap-2 text-text-primary">
                      <Anchor className="w-4 h-4 text-accent-primary" />
                      <h2 className="text-sm font-semibold">הכנה לפני המסחר</h2>
                    </div>

                    {/* Emotion + Readiness side by side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <EmotionPicker
                        value={form.emotion}
                        onChange={(v) => setForm((p) => ({ ...p, emotion: v }))}
                        label="איך אני מרגיש לפני שאני ניגש למסחר?"
                      />
                      <ReadinessSlider
                        value={form.readinessLevel}
                        onChange={(v) => setForm((p) => ({ ...p, readinessLevel: v }))}
                        label="רמת המוכנות שלי למסחר"
                      />
                    </div>

                    {/* Checklist - compact 3 cols */}
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">שגרת פרה-מרקט</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                        {PRE_MARKET_CHECKLIST.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => toggleChecklist(item.key)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs text-right transition-all ${
                              form.preMarketChecklist.includes(item.key)
                                ? 'bg-accent-primary/10 border-accent-primary text-accent-primary'
                                : 'bg-bg-tertiary border-border-primary text-text-secondary hover:border-border-hover'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                form.preMarketChecklist.includes(item.key)
                                  ? 'bg-accent-primary border-accent-primary'
                                  : 'border-text-muted'
                              }`}
                            >
                              {form.preMarketChecklist.includes(item.key) && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">
                        שלושה דברים שאני מעריך כסוחר <span className="text-red-400">*</span>
                      </label>
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="flex items-center gap-2.5 mb-1.5">
                          <span className="w-6 h-6 rounded-full bg-accent-primary/15 text-accent-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {i + 1}
                          </span>
                          <input
                            type="text"
                            value={form.thingsIAppreciate[i]}
                            onChange={(e) => updateAppreciate(i, e.target.value)}
                            placeholder="אני מעריך את..."
                            className="flex-1 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                          />
                        </div>
                      ))}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">
                        המטרה הראשית שלי במסחר היום <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.mainGoal}
                        onChange={(e) => setForm((p) => ({ ...p, mainGoal: e.target.value }))}
                        placeholder="המטרה שלי במסחר היום היא..."
                        className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">
                        על מה אני מתמקד במסחר היום <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.focusToday}
                        onChange={(e) => setForm((p) => ({ ...p, focusToday: e.target.value }))}
                        placeholder="היום אני מתמקד ב..."
                        className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                      />
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">יעדים יומיים</label>
                      <textarea
                        value={form.dailyGoals}
                        onChange={(e) => setForm((p) => ({ ...p, dailyGoals: e.target.value }))}
                        placeholder="מה היעדים שלי להיום?"
                        rows={3}
                        className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">מוטיבציה ותזכורות</label>
                      <textarea
                        value={form.motivation}
                        onChange={(e) => setForm((p) => ({ ...p, motivation: e.target.value }))}
                        placeholder="תזכורות חשובות לעצמי..."
                        rows={3}
                        className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary resize-none"
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer nav */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border-primary">
            <button
              onClick={() => goToStep(step - 1)}
              disabled={step === 0}
              className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              שלב קודם
            </button>

            {step < 2 ? (
              <button
                onClick={() => goToStep(step + 1)}
                className="flex items-center gap-1 text-sm bg-accent-primary text-white px-4 py-1.5 rounded-lg hover:bg-accent-hover transition-colors"
              >
                המשך לשלב הבא
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm bg-accent-primary text-white px-5 py-1.5 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'שומר...' : todayMorning ? 'עדכן יומן' : 'שמור יומן'}
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
