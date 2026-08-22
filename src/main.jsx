import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { registerSW } from './services/swUpdate';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register the service worker with a controlled update flow: a new version
// never reloads the app on its own — the user is prompted and chooses when.
registerSW();
