import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Production builds only. In development the worker sits between the page and
// every request, and Playwright's WebKit cannot stub requests from a page a
// worker controls: every mobile-safari test that stubs the API failed.
// tests/e2e/install.spec.ts registers it explicitly to test it.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // A service worker is an offline convenience. The browser app remains
      // fully usable online if a privacy setting or older browser rejects it.
    });
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
