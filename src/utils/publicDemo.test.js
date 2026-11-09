import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PUBLIC_DEMO_PATH, publicDemoBuildEnabled } from './publicDemo';

describe('public demo gate', () => {
  it('stays out of a production build', () => {
    expect(publicDemoBuildEnabled({ DEV: false, VITE_PUBLIC_DEMO: '' })).toBe(false);
    expect(publicDemoBuildEnabled({ DEV: false })).toBe(false);
    expect(publicDemoBuildEnabled({ DEV: true })).toBe(true);
    expect(publicDemoBuildEnabled({ DEV: false, VITE_PUBLIC_DEMO: '1' })).toBe(true);
  });

  it('keeps the route outside auth and the page free of live data calls', () => {
    const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
    const main = app.slice(app.indexOf('function MainApp'), app.indexOf('export default function App'));
    const outer = app.slice(app.indexOf('export default function App'));
    expect(app).toContain("import.meta.env.DEV || import.meta.env.VITE_PUBLIC_DEMO === '1'");
    expect(main).not.toContain('path="/demo"');
    expect(outer).toContain('path="/demo"');
    const login = readFileSync(new URL('../components/auth/LoginPage.jsx', import.meta.url), 'utf8');
    expect(login).toContain('נסה את TradeOS');
    expect(login).toContain(PUBLIC_DEMO_PATH);
    const page = readFileSync(new URL('../components/demo/PublicDemoPage.jsx', import.meta.url), 'utf8');
    expect(page).toContain('LoggedOutAuth');
    expect(page).not.toMatch(/from ['"][^'"]*(firestore|worker|groq)/i);
    expect(page).not.toContain('localStorage');
    expect(page).not.toMatch(/\b(addDoc|setDoc|fetch)\b/);
  });
});
