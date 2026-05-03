import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Save, Moon, History, Clock, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import EmotionPicker from './EmotionPicker';
import ReadinessSlider from './ReadinessSlider';
import JournalHistory from './JournalHistory';
import { useMentalityJournals } from '../../hooks/useMentalityJournals';
import { MOTIVATIONAL_QUOTES } from '../../utils/constants';

const emptyForm = {
  emotionAfter: '',
  followedPlan: null,
  whatWentWell: '',
  whatDidntGoWell: '',
  lessonsLearned: '',
  gratitude: '',
  dayRating: 5,
};

export default function EveningJournal() {
  const navigate = useNavigate();
  const { todayEvening, eveningEntries, saveEveningEntry, deleteEveningEntry } = useMentalityJournals();
  const [activeTab, setActiveTab] = useState('form');
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
    if (todayEvening) {
      setForm({
        emotionAfter: todayEvening.emotionAfter || '',
        followedPlan: todayEvening.followedPlan ?? null,
        whatWentWell: todayEvening.whatWentWell || '',
        whatDidntGoWell: todayEvening.whatDidntGoWell || '',
        lessonsLearned: todayEvening.lessonsLearned || '',
        gratitude: todayEvening.gratitude || '',
        dayRating: todayEvening.dayRating || 5,
      });
    }
  }, [todayEvening]);

  const handleSave = async () => {
    if (!form.emotionAfter) {
      toast.error('בחר רגש לפני השמירה');
      return;
    }
    setSaving(true);
    try {
      await saveEveningEntry({ ...form, date: todayStr });
      toast.success(todayEvening ? 'יומן ערב עודכן' : 'יומן ערב נשמר');
      justSaved.current = true;
      setForm(emptyForm);
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
  if (form.emotionAfter) filled++;
  if (form.followedPlan !== null) filled++;
  if (form.whatWentWell.trim()) filled++;
  if (form.whatDidntGoWell.trim()) filled++;
  if (form.lessonsLearned.trim()) filled++;
  if (form.gratitude.trim()) filled++;
  const completionPct = Math.round((filled / 6) * 100);

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

        <h1 className="text-lg font-bold text-accent-primary text-center mb-1.5">יומן סוחר - ערב</h1>

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
            <Moon className="w-3.5 h-3.5" />
            יומן ערב
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
        <JournalHistory entries={eveningEntries} type="evening" onDeleteEntry={deleteEveningEntry} />
      ) : (
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 flex-1 flex flex-col">
          <div className="flex-1 space-y-3">
            {/* Emotion + Followed plan side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <EmotionPicker
                value={form.emotionAfter}
                onChange={(v) => setForm((p) => ({ ...p, emotionAfter: v }))}
                label="איך אני מרגיש אחרי יום המסחר?"
              />

              <div className="space-y-3">
                {/* Followed plan toggle */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    האם עקבתי אחרי תוכנית המסחר שלי?
                  </label>
                  <div className="flex gap-2">
                    {[
                      { value: true, label: 'כן', emoji: '✅' },
                      { value: false, label: 'לא', emoji: '❌' },
                    ].map((opt) => (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, followedPlan: opt.value }))}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                          form.followedPlan === opt.value
                            ? 'bg-accent-primary/15 border-accent-primary text-accent-primary'
                            : 'bg-bg-tertiary border-border-primary text-text-secondary hover:border-border-hover'
                        }`}
                      >
                        <span>{opt.emoji}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <ReadinessSlider
                  value={form.dayRating}
                  onChange={(v) => setForm((p) => ({ ...p, dayRating: v }))}
                  label="דירוג היום"
                  lowLabel="יום גרוע"
                  highLabel="יום מעולה"
                />
              </div>
            </div>

            {/* Textareas in 2-col grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  מה הלך טוב היום? <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={form.whatWentWell}
                  onChange={(e) => setForm((p) => ({ ...p, whatWentWell: e.target.value }))}
                  placeholder="דברים שעבדו טוב במסחר היום..."
                  rows={2}
                  className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  מה לא הלך טוב? <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={form.whatDidntGoWell}
                  onChange={(e) => setForm((p) => ({ ...p, whatDidntGoWell: e.target.value }))}
                  placeholder="דברים שאני צריך לשפר..."
                  rows={2}
                  className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  לקחים שלמדתי
                </label>
                <textarea
                  value={form.lessonsLearned}
                  onChange={(e) => setForm((p) => ({ ...p, lessonsLearned: e.target.value }))}
                  placeholder="לקחים ותובנות מהיום..."
                  rows={2}
                  className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  על מה אני אסיר תודה היום?
                </label>
                <textarea
                  value={form.gratitude}
                  onChange={(e) => setForm((p) => ({ ...p, gratitude: e.target.value }))}
                  placeholder="דבר אחד שאני אסיר תודה עליו היום..."
                  rows={2}
                  className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary resize-none"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-accent-primary text-white py-2.5 rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 mt-3"
          >
            <Save className="w-4 h-4" />
            {saving ? 'שומר...' : todayEvening ? 'עדכן יומן ערב' : 'שמור יומן ערב'}
          </button>
        </div>
      )}
    </motion.div>
  );
}
