import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register Service Worker for PWA.
// IMPORTANT: do NOT call reg.update() on every load — combined with the SW's
// `clients.claim()`, that caused the page to reload every time the iOS PWA
// returned from a backgrounded state (e.g. after opening a TradingView link).
// The browser still checks for SW updates on its own schedule.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .catch(() => {});
  });
}
