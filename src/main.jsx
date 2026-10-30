import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/heebo/hebrew-400.css';
import '@fontsource/heebo/hebrew-500.css';
import '@fontsource/heebo/hebrew-600.css';
import '@fontsource/heebo/hebrew-700.css';
import '@fontsource/heebo/latin-400.css';
import '@fontsource/heebo/latin-500.css';
import '@fontsource/heebo/latin-600.css';
import '@fontsource/heebo/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './index.css';
import App from './App.jsx';
import { installChunkLoadRecovery } from './utils/chunkReload';
import { registerSW } from './services/swUpdate';

// Before the first lazy() import: a stale shell 404s its hashed chunks, and
// this reloads the document once instead of painting the error boundary.
installChunkLoadRecovery();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// A new service worker claims the page and reloads once, so the open document
// cannot keep running the previous bundle.
registerSW();
