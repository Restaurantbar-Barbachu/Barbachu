import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const swUrl = '/sw.js';
  try {
    const probe = await fetch(swUrl, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
      credentials: 'same-origin',
    });

    const contentType = probe.headers.get('content-type') || '';
    const isRedirect =
      probe.type === 'opaqueredirect' ||
      probe.redirected ||
      (probe.status >= 300 && probe.status < 400);
    const isValidScript = probe.ok && /javascript|ecmascript/i.test(contentType);

    // Skip registration when the host proxy intercepts /sw.js with a redirect (e.g. preview auth proxy)
    if (isRedirect || !isValidScript) {
      return;
    }

    await navigator.serviceWorker.register(swUrl, {
      scope: '/',
      updateViaCache: 'none',
    });
  } catch {
    // Ignore SW registration failures when offline or blocked by host/iframe policy
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void registerServiceWorker();
  });
}

