import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Self-hosted, so no third-party font request and it works offline (#181).
import '@fontsource/inter-tight/400.css';
import '@fontsource/inter-tight/500.css';
import '@fontsource/inter-tight/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // A service worker is an offline convenience. The browser app remains
      // fully usable online if a privacy setting or older browser rejects it.
    });
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root, {
  // Error messages and stacks can contain student content. Screen boundaries
  // log the error name and screen, including when React retries a render.
  onCaughtError: () => {},
  onRecoverableError: () => {},
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
