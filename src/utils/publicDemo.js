// Public click-through. The route is compiled only for local dev and preview
// builds. Production leaves it out of the bundle, and the page never writes.

export const PUBLIC_DEMO_BANNER = 'דמו ונתוני דמה';
export const PUBLIC_DEMO_PATH = '/demo';

export function publicDemoBuildEnabled(env = import.meta.env) {
  return env?.DEV === true || env?.VITE_PUBLIC_DEMO === '1';
}
