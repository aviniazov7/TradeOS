import { useSearchParams } from 'react-router-dom';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-400.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-500.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-600.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-700.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-400.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-500.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-600.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/frank-ruhl-libre/hebrew-500.css';
import '@fontsource/frank-ruhl-libre/hebrew-700.css';
import '@fontsource/frank-ruhl-libre/latin-500.css';
import '@fontsource/frank-ruhl-libre/latin-700.css';
import AuroraHome from './AuroraHome';
import { MobileNav, Ticker } from './Bits';
import GraphiteHome from './GraphiteHome';
import SolarHome from './SolarHome';
import './preview.css';

const DIRS = [
  { id: 'graphite', key: 'א', label: 'גרפיט' },
  { id: 'aurora', key: 'ב', label: 'אורורה' },
  { id: 'solar', key: 'ג', label: 'סולאר' },
];

function Backdrop({ dir }) {
  if (dir === 'aurora') {
    return (
      <div className="dp-back" aria-hidden>
        <i className="dp-orb a" />
        <i className="dp-orb b" />
        <i className="dp-orb c" />
      </div>
    );
  }
  if (dir === 'solar') {
    return (
      <div className="dp-back" aria-hidden>
        <i className="dp-cone" />
        <i className="dp-lamp" />
      </div>
    );
  }
  return (
    <div className="dp-back" aria-hidden>
      <i className="dp-grid" />
      <i className="dp-wash" />
    </div>
  );
}

// Standalone design exploration. Not linked from the product nav.
export default function DesignPreview() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('dir');
  const dir = DIRS.some((d) => d.id === raw) ? raw : 'graphite';
  const pick = (id) => setParams({ dir: id }, { replace: true });

  return (
    <div className="dp" data-dir={dir} data-preview-ready="true" dir="rtl">
      <Backdrop dir={dir} />
      <header className="dp-switch-wrap">
        <div className="dp-switch">
          <span className="dp-switch-note">טיוטת עיצוב</span>
          <div role="tablist" aria-label="כיווני עיצוב">
            {DIRS.map((d) => (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={dir === d.id}
                onClick={() => pick(d.id)}
              >
                <i>{d.key}</i>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <Ticker />
      {dir === 'graphite' && <GraphiteHome />}
      {dir === 'aurora' && <AuroraHome />}
      {dir === 'solar' && <SolarHome />}
      <div className="dp-end" />
      <MobileNav />
    </div>
  );
}
