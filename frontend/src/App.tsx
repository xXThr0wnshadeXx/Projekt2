// App shell — the M1 core loop (issues #9, #10, #11, #12, #13).
//
// Home → Capture → Problem, with low-vision mode reachable from the problem.
// The scratchpad (#18), export (#22) and settings (#21) screens attach here
// with their own issues.
//
// There is no router library. Four screens and one piece of state is not a
// routing problem, and every dependency is one more thing that can break a
// screen reader in a way we would have to discover ourselves.

import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveRegion, announce, focusFirst } from './components/LiveRegion';
import { ScreenBoundary } from './components/ScreenBoundary';
import { KeyboardHelp } from './components/KeyboardHelp';
import { setSelfVoicing } from './audio/tts';
import { ModeBadge } from './components/ModeBadge';
import { InstallApp } from './components/InstallApp';
import { Settings } from './screens/Settings';
import { Export } from './screens/Export';
import { helpText, useShortcuts } from './shortcuts';
import { loadMathJax } from './math/mathjax';
import { spokenMath } from './math/sre';
import { health, apiBase, ApiFailure, diagnoseUnreachable } from './api';
import { Home } from './screens/Home';
import { Capture } from './screens/Capture';
import { Problem } from './screens/Problem';
import { LowVision } from './screens/LowVision';
import { Scratchpad } from './screens/Scratchpad';
import {
  loadProblem,
  loadWork,
  saveProblem,
  sampleProblem,
  loadSettings,
  saveSettings,
  type Problem as ProblemData,
  type Settings as SettingsData,
} from './state';

type Screen =
  | 'home'
  | 'capture'
  | 'problem'
  | 'lowvision'
  | 'scratchpad'
  | 'settings'
  | 'export';
type BackEnd = 'checking' | 'up' | 'down';

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [problem, setProblem] = useState<ProblemData | null>(() => loadProblem());
  const [initialRestore] = useState(() => {
    const count = loadWork().length || problem?.lines.length;
    return count === undefined
      ? ''
      : `I restored your work from earlier: ${count} ${count === 1 ? 'line' : 'lines'}.`;
  });
  const [lowVisionFailed, setLowVisionFailed] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [spokenLines, setSpokenLines] = useState<Record<string, string>>({});
  const [backEnd, setBackEnd] = useState<BackEnd>('checking');
  const [backEndNote, setBackEndNote] = useState('');
  const [settings, setSettings] = useState<SettingsData>(() => loadSettings());
  // Where to go back to from Settings, and which problem line the student was
  // on when they started working (their first step is checked against it).
  const [settingsFrom, setSettingsFrom] = useState<Screen>('home');
  const [workingFrom, setWorkingFrom] = useState(0);

  useEffect(() => {
    setSelfVoicing(settings.selfVoicing);
  }, [settings.selfVoicing]);

  const restored = useRef(initialRestore);
  const takeRestoredAnnouncement = useCallback(() => {
    const announcement = restored.current;
    restored.current = '';
    return announcement;
  }, []);
  const resumeProblem = useCallback(() => setScreen('problem'), []);

  // Every size in the app is in rem, so this one number is large print for
  // all of it — buttons, notes and maths alike.
  useEffect(() => {
    document.documentElement.style.fontSize = `${settings.textScale}%`;
  }, [settings.textScale]);

  function updateSettings(next: SettingsData) {
    // Applied before anything is announced, so switching the voice on is heard.
    setSelfVoicing(next.selfVoicing);
    setSettings(next);
    saveSettings(next);
  }

  const [exportFrom, setExportFrom] = useState<Screen>('scratchpad');
  function openExport(from: Screen) {
    setExportFrom(from);
    setScreen('export');
  }

  function openSettings() {
    setSettingsFrom(screen === 'settings' ? 'home' : screen);
    setScreen('settings');
  }
  // Keyboard help (#25): `null` when closed, otherwise whether it took focus.
  const [help, setHelp] = useState<null | { takeFocus: boolean }>(null);

  /** "?" anywhere: say this screen's shortcuts and show them. */
  function showHelp(takeFocus: boolean) {
    const text = helpText(screen);
    announce(text);
    setHelp({ takeFocus });
  }

  useShortcuts({ '?': () => showHelp(false) });

  // The list belongs to the screen it was opened on.
  useEffect(() => setHelp(null), [screen]);

  // MathJax is loaded once, up front. Waiting until a problem arrives would
  // put a multi-second script download inside the capture wait.
  useEffect(() => {
    loadMathJax().catch(() => {
      announce('Math could not load. Reload the page.', 'assertive');
    });
  }, []);

  useEffect(() => {
    health()
      .then(() => {
        setBackEnd('up');
        setBackEndNote('');
      })
      .catch(async (e: unknown) => {
        setBackEnd('down');
        // A server that is up but refusing this origin looks identical to one
        // that is down, so find out which before telling anyone anything.
        if (e instanceof ApiFailure && e.code === 'NETWORK') {
          setBackEndNote(
            (await diagnoseUnreachable()) === 'blocked'
              ? `The server is running but is not accepting requests from ${window.location.origin}. Add that address to ALLOWED_ORIGIN on the server.`
              : 'Nothing answered at the server address. Check that it is deployed and that you are online.',
          );
          return;
        }
        setBackEndNote(e instanceof ApiFailure ? e.message : 'Unavailable.');
      });
  }, []);

  function openProblem(next: ProblemData) {
    setProblem(next);
    saveProblem(next);
    setLineIndex(0);
    setScreen('problem');

    // A capture announces its own result, in more detail than is possible here
    // — it knows what was unsure and what the photo warnings were. The sample
    // has no such step, and arriving on a new screen in silence is exactly the
    // disorientation this app exists to remove, so it is announced here.
    if (next.source === 'sample') {
      const count = `${next.lines.length} ${next.lines.length === 1 ? 'line' : 'lines'}`;
      announce(`Sample problem. ${next.instructions} ${count}.`.trim());
    }
  }

  /** A capture is a suggestion, not a fact. Keep the student's correction in
   * their local copy too, so an inaccurate line cannot return after reload. */
  function discardProblemLine(id: string) {
    setProblem((current) => {
      if (!current || !current.lines.some((line) => line.id === id)) return current;
      const next = { ...current, lines: current.lines.filter((line) => line.id !== id) };
      saveProblem(next);
      return next;
    });
    setSpokenLines((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function enterLowVision(index: number) {
    // Grab MathJax's speech strings while the Problem screen is still mounted.
    // Low-vision mode's optional self-voicing would otherwise fall back to
    // "Line 2", which is not worth hearing. These come from the same engine the
    // explorer uses, so the two read the expression identically.
    const spoken: Record<string, string> = {};
    for (const line of problem?.lines ?? []) {
      const label = spokenMath(document.getElementById(line.id));
      if (label) spoken[line.id] = label;
    }
    setSpokenLines(spoken);
    setLowVisionFailed(false);
    setLineIndex(index);
    setScreen('lowvision');
  }

  // Low-vision mode takes over the whole screen, so it renders instead of the
  // normal chrome. `LiveRegion` is deliberately OUTSIDE this choice: if it
  // unmounted and remounted on the way in or out, the announcement made during
  // that same switch would be delivered to a component that is going away, and
  // the student would hear nothing at the exact moment the screen changed.
  const lowVision = screen === 'lowvision' && problem
    ? (
        <LowVision
          lines={problem.lines}
          spokenLines={spokenLines}
          startIndex={lineIndex}
          onExit={(i) => {
            setLineIndex(i);
            setScreen('problem');
            announce('Left low-vision mode.');
            window.setTimeout(() => focusFirst(`#${problem.lines[i]?.id ?? 'L1'}`), 60);
          }}
        />
      )
    : null;

  return (
    <>
      <LiveRegion />
      <div className="min-h-dvh bg-[--bg] text-[--fg]">
      <div hidden={Boolean(lowVision) && !lowVisionFailed}>
        {/* A skip link is the first thing a keyboard user needs. */}
        <a href="#main" className="skip-link">
          Skip to main content
        </a>

        <header className="border-b border-[--line] px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="mono inline-flex min-h-[40px] items-center bg-[--accent] px-3 text-xl font-medium text-[--accent-fg]">Glance</h1>
              <p className="mt-1 text-[--muted]">Math you can hear, explore and write without seeing the page.</p>
              <div className="mt-2">
                <ModeBadge mode={settings.mode} />
              </div>
            </div>
            <button
              type="button"
              className="btn"
              aria-expanded={help !== null}
              aria-controls="keyboard-help"
              aria-keyshortcuts="?"
              onClick={() => (help ? setHelp(null) : showHelp(true))}
            >
              Keyboard shortcuts
            </button>
            <InstallApp />
          </div>
        </header>

        {help && (
          <KeyboardHelp
            screen={screen}
            takeFocus={help.takeFocus}
            onClose={() => {
              setHelp(null);
              announce('Shortcuts closed.');
            }}
          />
        )}

      </div>

      <ScreenBoundary
        key={screen}
        screen={screen}
        onBackToStart={() => setScreen('home')}
        onFailure={lowVision ? setLowVisionFailed : undefined}
      >
        {lowVision}
        {screen === 'home' && (
          <Home
            onCapture={() => setScreen('capture')}
            onSample={() => openProblem(sampleProblem())}
            onResume={problem ? resumeProblem : undefined}
            takeRestoredAnnouncement={takeRestoredAnnouncement}
            settings={settings}
            onSettingsChange={updateSettings}
            onSettings={openSettings}
          />
        )}

        {screen === 'capture' && (
          <Capture onCaptured={openProblem} onBack={() => setScreen('home')} />
        )}

        {screen === 'problem' && problem && (
          <Problem
            problem={problem}
            startIndex={lineIndex}
            onLowVision={enterLowVision}
            mode={settings.mode}
            onNewCapture={() => setScreen('capture')}
            onDiscardLine={discardProblemLine}
            onStartWorking={(index) => {
              setWorkingFrom(index);
              setLineIndex(index);
              setScreen('scratchpad');
            }}
            onExport={() => openExport('problem')}
          />
        )}

        {screen === 'scratchpad' && problem && (
          <Scratchpad
            problem={problem}
            mode={settings.mode}
            startLine={workingFrom}
            onBack={() => setScreen('problem')}
            onExport={() => openExport('scratchpad')}
          />
        )}

        {screen === 'export' && problem && (
          <Export problem={problem} onBack={() => setScreen(exportFrom)} />
        )}

        {screen === 'settings' && (
          <Settings
            settings={settings}
            onChange={updateSettings}
            onBack={() => setScreen(settingsFrom)}
          />
        )}

        {/* Only reachable if storage returned something unusable. */}
        {(screen === 'problem' || screen === 'scratchpad' || screen === 'export') && !problem && (
          <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-8">
            <h2 className="text-2xl font-semibold">No problem loaded</h2>
            <button type="button" className="btn mt-4" onClick={() => setScreen('home')}>
              Back to start
            </button>
          </main>
        )}

      </ScreenBoundary>

      {/* Nothing is said while everything works. A reachable server and the
          address it lives at are facts for whoever deployed it, not for the
          student — and read aloud on every screen they are just noise before
          the content. When it breaks, this says what still works first, and
          keeps the technical detail for whoever goes looking. */}
      {!lowVision && backEnd === 'down' && (
        <footer className="mx-auto max-w-3xl px-6 pb-10 pt-4">
          <div
            role="status"
            data-testid="backend-status"
            className="rounded-lg border border-[--warn] bg-[--surface] px-4 py-3 text-sm"
          >
            <p>
              Reading new problems is unavailable right now. The sample problem still
              works — you can explore it, glance at it, write your own work and hand it in.
            </p>
            <details className="mt-2 text-[--muted]">
              <summary className="cursor-pointer">Why</summary>
              <p className="mt-2">{backEndNote}</p>
              <p className="mt-1">
                Server address: <code>{apiBase}</code>
              </p>
            </details>
          </div>
        </footer>
      )}
      </div>
    </>
  );
}
