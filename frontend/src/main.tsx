import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
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
