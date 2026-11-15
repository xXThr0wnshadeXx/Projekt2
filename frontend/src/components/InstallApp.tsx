import { useEffect, useState } from 'react';
import { announce } from './LiveRegion';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** A visible, keyboard-operable route to the browser's native app installer. */
export function InstallApp() {
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const receivePrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
    };
    const appInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
      announce('Glance was installed and will open in its own app window.');
    };
    window.addEventListener('beforeinstallprompt', receivePrompt);
    window.addEventListener('appinstalled', appInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', receivePrompt);
      window.removeEventListener('appinstalled', appInstalled);
    };
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === 'accepted') announce('Glance is being installed. It will open in its own window.');
    if (choice.outcome === 'dismissed') announce('Glance was not installed. You can choose Install Glance whenever it is available.');
  }

  if (installed) {
    return <p className="text-sm text-[--muted]">Glance is open in its own app window.</p>;
  }

  if (deferredPrompt) {
    return (
      <button type="button" className="btn" onClick={() => void install()}>
        Install Glance
      </button>
    );
  }

  return (
    <p className="text-sm text-[--muted]" data-testid="install-status">
      To open Glance in its own window, use your browser&apos;s Install app option, or Add to
      Home Screen from the Share button in Safari on an iPhone or iPad.
    </p>
  );
}
