// "Use Glance as an app" in Settings — issue #160.
//
// The Install button appears only when the browser has actually offered to
// install, so it never does nothing when pressed. Everywhere else the section
// says, in words, what is possible in that browser.

import { useEffect, useState } from 'react';
import { announce } from './LiveRegion';
import { installState, onInstallChange, promptInstall, type InstallState } from '../install';

export function InstallApp() {
  const [state, setState] = useState<InstallState>(installState);

  useEffect(() => {
    const update = () => setState(installState());
    update();
    return onInstallChange(update);
  }, []);

  async function install() {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      announce('Glance is being installed. It will open in its own window.');
    } else if (outcome === 'dismissed') {
      announce('Glance was not installed. You can install it from here at any time.');
    } else {
      announce('This browser is not offering to install Glance right now.');
    }
  }

  return (
    <section aria-labelledby="install-heading" className="mt-8">
      <h3 id="install-heading" className="text-lg font-semibold">
        Use Glance as an app
      </h3>
      {state === 'installed' && (
        <p className="mt-2" data-testid="install-status">
          Glance is installed and open in its own window.
        </p>
      )}
      {state === 'available' && (
        <>
          <p className="mt-2 text-sm text-[--muted]" id="install-detail">
            Installing gives Glance its own window and an icon to open it from. Nothing you
            capture or write is stored by installing.
          </p>
          <button
            type="button"
            className="btn mt-3"
            aria-describedby="install-detail"
            onClick={() => void install()}
          >
            Install Glance
          </button>
        </>
      )}
      {state === 'unavailable' && (
        <p className="mt-2" data-testid="install-status">
          This browser has not offered to install Glance. In Safari on an iPhone or iPad, use
          the Share button, then Add to Home Screen. In Chrome or Edge on a computer, use the
          install icon at the end of the address bar. Glance works the same in a browser tab.
        </p>
      )}
    </section>
  );
}
