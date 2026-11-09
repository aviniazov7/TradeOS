import { useState } from 'react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import PlanBuilderDemoBanner from './PlanBuilderDemoBanner';
import PlanBuilderWizard from './PlanBuilderWizard';
import PlanForm from './PlanForm';
import { headerAiBtn } from '../shared/headerStyles';
import { LoggedOutAuth } from '../../contexts/AuthContext';
import { planBuilderDemoEnabled, saveBuiltPlan } from '../../utils/planBuilderDemo';

// Public walkthrough for a preview or local dev build. It does not mount the
// plans collection, does not call the worker, and saveBuiltPlan refuses to write.
export default function PlanBuilderDemoPage() {
  const enabled = planBuilderDemoEnabled(window.location.search);
  const [draft, setDraft] = useState(null);
  const [notice, setNotice] = useState('');
  const [wizardOpen, setWizardOpen] = useState(true);
  const [run, setRun] = useState(0);
  if (!enabled) {
    return (
      <div dir="rtl" className="min-h-screen bg-bg-primary p-6 text-text-primary">
        <p>כדי לפתוח את הדמו הוסיפו <span className="num-mono">?planBuilderDemo=1</span> לכתובת.</p>
      </div>
    );
  }
  return (
    <LoggedOutAuth>
    <LazyMotion features={domAnimation} strict>
      <div dir="rtl" className="min-h-screen bg-bg-primary text-text-primary">
        <PlanBuilderDemoBanner />
        {notice && (
          <p data-testid="plan-builder-demo-notice" className="px-4 pt-16 text-center text-sm text-amber-200">{notice}</p>
        )}
        {!wizardOpen && !draft && (
          <div className="flex min-h-screen items-center justify-center px-4 pt-16">
            <button
              type="button"
              className={headerAiBtn}
              onClick={() => { setNotice(''); setRun((current) => current + 1); setWizardOpen(true); }}
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              בנה תוכנית עם AI
            </button>
          </div>
        )}
        <PlanBuilderWizard
          key={run}
          open={wizardOpen && !draft}
          demo
          onClose={() => setWizardOpen(false)}
          onDraft={(plan) => { setNotice(''); setWizardOpen(false); setRun((current) => current + 1); setDraft(plan); }}
          requestPlan={() => {
            throw new Error('demo must not call the worker');
          }}
        />
        <PlanForm
          isOpen={!!draft}
          plan={draft}
          saveLabel="שמור תוכנית"
          onClose={() => setDraft(null)}
          onSave={async (data) => {
            const result = await saveBuiltPlan({ demo: true, addPlan: () => { throw new Error('demo must not write'); }, data });
            if (!result.saved) setNotice('דמו – לא נשמר');
          }}
        />
      </div>
    </LazyMotion>
    </LoggedOutAuth>
  );
}
