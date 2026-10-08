import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Route, ArrowRight, Flag, Gauge, ListChecks, Radar, Info, Activity } from 'lucide-react';
import PageHeader from '../shared/PageHeader';
import StatTile from '../shared/StatTile';
import { headerIconBtn } from '../shared/headerStyles';
import { useTrades } from '../../hooks/useTrades';
import { useTradingPlans } from '../../hooks/useTradingPlans';
import { useMentalityJournals } from '../../hooks/useMentalityJournals';
import { useJournalContext } from '../../contexts/JournalContext';
import { useAuth } from '../../contexts/AuthContext';
import { assessTrader } from '../../utils/traderStage';
import {
  StageLadder, DimensionRadar, Milestones, SnapshotLists, DimensionCard, StagesReference, PanelTitle,
} from './JourneyParts';
import JourneyAiPanel from './JourneyAiPanel';
import { writeStageSnapshot } from './journeyStorage';
import { panel } from './journeyStyle';
import { tileItem } from './zoneStyle';

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

function JourneySkeleton() {
  const block = 'rounded-2xl border border-border-primary bg-bg-secondary animate-pulse';
  return (
    <div className="space-y-4" aria-busy="true" aria-label="טוען את מפת ההתפתחות">
      <div className={`${block} h-56`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${block} h-80`} />
        <div className={`${block} h-80`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className={`${block} h-60`} />)}
      </div>
    </div>
  );
}

const ctaBtn = 'inline-flex items-center justify-center h-9 px-3.5 rounded-xl border border-border-primary bg-bg-tertiary text-sm font-semibold text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors';

function LowDataNotice({ assessment }) {
  return (
    <section className={`${panel} border-breakeven/30`} aria-label="אין מספיק נתונים">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0 bg-breakeven/12 border border-breakeven/30 text-breakeven" aria-hidden>
          <Info className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm md:text-[15px] font-bold text-text-primary">אין מספיק נתונים להערכה מלאה</h2>
          <p className="text-xs text-text-muted mt-0.5">
            יש <span className="num-mono font-semibold text-text-secondary">{assessment.closedTrades}</span> עסקאות סגורות. מדדי הסיכון, העקביות והיתרון ייפתחו מ-10 עסקאות.
          </p>
          <ul className="mt-3 space-y-1.5">
            {assessment.dataNeeded.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm text-text-secondary">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-breakeven shrink-0" aria-hidden />
                <span className="min-w-0">{s}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link to="/journal" className={ctaBtn}>ליומן המסחר</Link>
            <Link to="/plans" className={ctaBtn}>לתוכניות המסחר</Link>
            <Link to="/mentality" className={ctaBtn}>ליומן הבוקר והערב</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function PsychologicalJourney() {
  const navigate = useNavigate();
  const { user, isPremium } = useAuth();
  const { journals } = useJournalContext();
  const { trades, loading: tradesLoading } = useTrades(); // every journal
  const { plans, loading: plansLoading } = useTradingPlans();
  const { morningEntries, eveningEntries, loading: journalsLoading } = useMentalityJournals();
  const loading = tradesLoading || plansLoading || journalsLoading;

  const assessment = useMemo(
    () => (loading ? null : assessTrader({ trades, plans, morningEntries, eveningEntries, journals })),
    [loading, trades, plans, morningEntries, eveningEntries, journals],
  );

  // Leave a snapshot for the mental-zone tile, so it can show the real stage
  // without subscribing to the whole trades collection itself.
  useEffect(() => {
    if (assessment && user?.uid) writeStageSnapshot(user.uid, assessment);
  }, [assessment, user?.uid]);

  const a = assessment;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <PageHeader
        icon={Route}
        title="מפת ההתפתחות שלך"
        subtitle="איפה אתה עומד כסוחר, לפי הנתונים שלך, ומה נדרש לשלב הבא"
        actions={(
          <button onClick={() => navigate('/mentality')} className={headerIconBtn} title="חזרה לאזור המנטלי" aria-label="חזרה לאזור המנטלי">
            <ArrowRight className="w-[18px] h-[18px]" />
          </button>
        )}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label="תמונת מצב">
          <StatTile inset icon={Flag} label="השלב שלך" mono={false} value={a ? a.stage.name : '–'} sub={a ? `שלב ${a.stage.index} מתוך ${a.stage.of}` : undefined} />
          <StatTile
            inset
            icon={ListChecks}
            label="לשלב הבא"
            value={a ? `${a.stageProgress}%` : '–'}
            sub={a ? (a.nextStage ? a.nextStage.name : 'השלב העליון') : undefined}
            tone={a?.nextStage ? 'text-text-primary' : 'text-profit'}
          />
          <StatTile
            inset
            icon={Gauge}
            label="ציון כולל"
            value={a?.overall != null ? a.overall : '–'}
            sub="ממוצע המדדים, מתוך 100"
            tone={a?.overall == null ? 'text-text-muted' : a.overall >= 70 ? 'text-profit' : a.overall < 40 ? 'text-loss' : 'text-text-primary'}
          />
          <StatTile inset icon={Radar} label="עסקאות שנמדדו" value={a ? a.closedTrades : '–'} sub="סגורות, מכל היומנים" />
        </div>
      </PageHeader>

      {!a ? <JourneySkeleton /> : (
        <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-4">
          {a.insufficient && (
            <motion.div variants={tileItem}><LowDataNotice assessment={a} /></motion.div>
          )}

          <motion.div variants={tileItem}><StageLadder assessment={a} /></motion.div>

          {/* Two balanced columns: the radar on one side; goals plus the
              strengths/blockers snapshot stacked on the other, so neither
              column leaves an empty gap under it. */}
          <div className="grid gap-4 lg:grid-cols-2 items-stretch">
            <motion.section variants={tileItem} className={`${panel} flex flex-col`} aria-label="פרופיל המדדים">
              <PanelTitle icon={Radar} aside="0–100">פרופיל המדדים</PanelTitle>
              <div className="flex-1 grid place-items-center">
                <DimensionRadar dimensions={a.dimensions} />
              </div>
            </motion.section>
            <motion.div variants={tileItem} className="min-w-0 flex flex-col gap-4">
              <Milestones assessment={a} />
              {(a.strengths.length > 0 || a.blockers.length > 0) && (
                <section className={`${panel} flex-1`} aria-label="תמונת מצב">
                  <PanelTitle icon={Activity}>תמונת מצב</PanelTitle>
                  <SnapshotLists strengths={a.strengths} blockers={a.blockers} className="" />
                </section>
              )}
            </motion.div>
          </div>

          <section aria-label="המדדים בפירוט" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {a.dimensions.map((d) => (
              <motion.div key={d.id} variants={tileItem} className="min-w-0 flex"><DimensionCard d={d} /></motion.div>
            ))}
          </section>

          <motion.div variants={tileItem}>
            <JourneyAiPanel key={user?.uid || 'anon'} assessment={a} uid={user?.uid} isPremium={isPremium} />
          </motion.div>

          <motion.div variants={tileItem}><StagesReference currentIndex={a.stage.index} /></motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
