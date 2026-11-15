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
  saveProblem,
  clearProblem,
  loadWork,
  loadPlace,
  savePlace,
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

// Screens a reload or the Back button may return to. Each needs the saved
// problem; anything else falls back to Home rather than showing an empty page.
const RESTORABLE: Screen[] = ['problem', 'scratchpad', 'export'];
const SCREENS: Screen[] = ['home', 'capture', 'problem', 'lowvision', 'scratchpad', 'settings', 'export'];

/** Where this load starts: the saved place if its data is still there. */
function startingPlace() {
  const problem = loadProblem();
  const place = loadPlace();
  if (!problem || !place || !RESTORABLE.includes(place.screen as Screen)) return null;
  const last = Math.max(0, problem.lines.length - 1);
  return {
    screen: place.screen as Screen,
    lineIndex: Math.min(place.lineIndex, last),
    workingFrom: Math.min(place.workingFrom, last),
  };
}

export function App() {
  const restored = useRef(startingPlace()).current;
  const [screen, setScreen] = useState<Screen>(restored?.screen ?? 'home');
  const [problem, setProblem] = useState<ProblemData | null>(() => loadProblem());
  // Home's own "I restored..." line. Only said when the student lands on Home;
  // a restored screen announces itself below instead, so never both.
  const [initialRestore] = useState(() => {
    if (restored) return '';
    const work = loadWork().length;
    if (work > 0) return `I restored your work from earlier: ${work} ${work === 1 ? 'line' : 'lines'}.`;
    return problem ? 'I restored your problem from earlier.' : '';
  });
  const [lowVisionFailed, setLowVisionFailed] = useState(false);
  const [lineIndex, setLineIndex] = useState(restored?.lineIndex ?? 0);
  const [spokenLines, setSpokenLines] = useState<Record<string, string>>({});
  const [backEnd, setBackEnd] = useState<BackEnd>('checking');
  const [backEndNote, setBackEndNote] = useState('');
  const [settings, setSettings] = useState<SettingsData>(() => loadSettings());
  // Where to go back to from Settings, and which problem line the student was
  // on when they started working (their first step is checked against it).
  const [settingsFrom, setSettingsFrom] = useState<Screen>('home');
  const [workingFrom, setWorkingFrom] = useState(restored?.workingFrom ?? 0);
  // A problem waiting on the student's answer to "keep your work, or start fresh?".
  const [pendingProblem, setPendingProblem] = useState<ProblemData | null>(null);

  // Remember the place, so a reload does not send the student back to Home.
  useEffect(() => {
    if (problem) savePlace({ screen, lineIndex, workingFrom });
  }, [screen, lineIndex, workingFrom, problem]);

  // Say where they are after a reload. Delayed so it follows the screen's own
  // opening announcement instead of being replaced by it.
  useEffect(() => {
    if (!restored) return;
    const line = restored.screen === 'problem' ? restored.lineIndex : restored.workingFrom;
    const what = restored.screen === 'problem' ? 'your problem' : restored.screen === 'export' ? 'your hand-in' : 'your work';
    const t = window.setTimeout(() => announce(`Back on ${what}. Line ${line + 1}.`), 400);
    return () => window.clearTimeout(t);
  }, []);

  // Browser Back moves between Glance's own screens. The address only ever
  // carries the screen name, never maths or anything personal.
  const fromPop = useRef(false);
  const shown = useRef<Screen | null>(null);
  useEffect(() => {
    if (shown.current === null) {
      window.history.replaceState({ glance: screen }, '', `#${screen}`);
    } else if (fromPop.current) {
      window.history.replaceState({ glance: screen }, '', `#${screen}`);
    } else if (shown.current !== screen) {
      window.history.pushState({ glance: screen }, '', `#${screen}`);
    }
    fromPop.current = false;
    shown.current = screen;
  }, [screen]);

  useEffect(() => {
    function onPop(event: PopStateEvent) {
      const target = (event.state as { glance?: string } | null)?.glance as Screen | undefined;
      if (!target || !SCREENS.includes(target)) return;
      fromPop.current = true;
      setPendingProblem(null);
      // Never land on a screen whose data is gone.
      const needsProblem = RESTORABLE.includes(target) || target === 'lowvision';
      const next: Screen = target === 'lowvision' ? 'problem' : needsProblem && !loadProblem() ? 'home' : target;
      setScreen((current) => {
        // If nothing changes, no effect runs to reset the flag.
        if (current === next) fromPop.current = false;
        return next;
      });
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    setSelfVoicing(settings.selfVoicing);
  }, [settings.selfVoicing]);

  const restoredNote = useRef(initialRestore);
  const takeRestoredAnnouncement = useCallback(() => {
    const announcement = restoredNote.current;
    restoredNote.current = '';
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
    // Unfinished work on the last problem is never dropped without asking.
    const saved = loadWork().length;
    if (saved > 0) {
      setPendingProblem(next);
      announce(
        `You have ${saved} ${saved === 1 ? 'line' : 'lines'} of work on the last problem. Keep them, or start fresh?`,
        'assertive',
      );
      return;
    }
    showProblem(next);
  }

  function answerPending(startFresh: boolean) {
    const next = pendingProblem;
    setPendingProblem(null);
    if (!next) return;
    if (startFresh) clearProblem();
    showProblem(next);
  }

  function showProblem(next: ProblemData) {
    setProblem(next);
    saveProblem(next);
    setLineIndex(0);
    setWorkingFrom(0);
    setSpokenLines({});
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
      {pendingProblem && (
        <KeepOrFresh
          lines={loadWork().length}
          onFresh={() => answerPending(true)}
          onKeep={() => answerPending(false)}
        />
      )}
      <div className="min-h-dvh bg-[--bg] text-[--fg]" hidden={Boolean(pendingProblem)}>
      <div hidden={Boolean(lowVision) && !lowVisionFailed}>
        {/* A skip link is the first thing a keyboard user needs. */}
        <a href="#main" className="skip-link">
          Skip to main content
        </a>

        <header className="border-b border-[--line] px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Glance</h1>
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

/** The question asked before a new problem replaces one with work on it. */
function KeepOrFresh({ lines, onFresh, onKeep }: { lines: number; onFresh: () => void; onKeep: () => void }) {
  const fresh = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    fresh.current?.focus();
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="keep-fresh-title"
      className="mx-auto max-w-3xl px-6 py-8"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onKeep();
      }}
    >
      <h2 id="keep-fresh-title" className="text-2xl font-semibold">
        You have {lines} {lines === 1 ? 'line' : 'lines'} of work on the last problem
      </h2>
      <p className="mt-2 text-[--muted]">Keep them, or start fresh?</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button ref={fresh} type="button" className="btn-primary" onClick={onFresh}>
          Start fresh
        </button>
        <button type="button" className="btn" onClick={onKeep}>
          Keep my work
        </button>
      </div>
    </div>
  );
}
