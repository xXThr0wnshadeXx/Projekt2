// App shell — the M1 core loop (issues #9, #10, #11, #12, #13).
//
// Home → Capture → Problem, with low-vision mode reachable from the problem.
// The scratchpad (#18), export (#22) and settings (#21) screens attach here
// with their own issues.
//
// There is no router library. Four screens and one piece of state is not a
// routing problem, and every dependency is one more thing that can break a
// screen reader in a way we would have to discover ourselves.

import { useEffect, useState } from 'react';
import { LiveRegion, announce, focusFirst } from './components/LiveRegion';
import { KeyboardHelp } from './components/KeyboardHelp';
import { speak, setSelfVoicing } from './audio/tts';
import { ModeBadge } from './components/ModeBadge';
import { Settings } from './screens/Settings';
import { Export } from './screens/Export';
import { helpText, useShortcuts } from './shortcuts';
import { loadMathJax } from './math/mathjax';
import { health, apiBase, apiConnected, ApiFailure } from './api';
import { UNCONNECTED_MESSAGE } from './apiBase';
import { Home } from './screens/Home';
import { Capture } from './screens/Capture';
import { Problem } from './screens/Problem';
import { LowVision } from './screens/LowVision';
import { Scratchpad } from './screens/Scratchpad';
import {
  loadProblem,
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
  const [lineIndex, setLineIndex] = useState(0);
  const [spokenLines, setSpokenLines] = useState<Record<string, string>>({});
  const [backEnd, setBackEnd] = useState<BackEnd>('checking');
  const [backEndNote, setBackEndNote] = useState('');
  // Whether the server said it can read images and speech (#127).
  const [models, setModels] = useState(true);
  const [settings, setSettings] = useState<SettingsData>(() => loadSettings());
  // Where to go back to from Settings, and which problem line the student was
  // on when they started working (their first step is checked against it).
  const [settingsFrom, setSettingsFrom] = useState<Screen>('home');
  const [workingFrom, setWorkingFrom] = useState(0);

  useEffect(() => {
    setSelfVoicing(settings.selfVoicing);
  }, [settings.selfVoicing]);

  function updateSettings(next: SettingsData) {
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
    speak(text); // only when the student has turned self-voicing on
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
    // A deployed build with no server address has nothing to ask (#135).
    if (!apiConnected) {
      setBackEnd('down');
      setBackEndNote(UNCONNECTED_MESSAGE);
      return;
    }
    health()
      .then((h) => {
        setBackEnd('up');
        setBackEndNote('');
        setModels(h.models !== false);
      })
      .catch((e: unknown) => {
        setBackEnd('down');
        setBackEndNote(e instanceof ApiFailure ? e.message : 'Unavailable.');
      });
  }, []);

  // Recording and capture need the server and its model. While the first
  // health check is still out they are offered; it answers in well under a
  // second, and hiding them until then would make every page load jump.
  const modelsUsable = backEnd !== 'down' && models;
  const modelsUnavailableWhy =
    backEnd === 'down'
      ? apiConnected
        ? 'The server is not reachable.'
        : UNCONNECTED_MESSAGE
      : 'The server cannot read images or speech right now.';

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

  function enterLowVision(index: number) {
    // Grab MathJax's speech strings while the Problem screen is still mounted.
    // Low-vision mode's optional self-voicing would otherwise fall back to
    // "Line 2", which is not worth hearing. These come from the same engine the
    // explorer uses, so the two read the expression identically.
    const spoken: Record<string, string> = {};
    for (const line of problem?.lines ?? []) {
      const label = document
        .querySelector(`#${line.id} mjx-container`)
        ?.getAttribute('aria-label');
      if (label) spoken[line.id] = label;
    }
    setSpokenLines(spoken);
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
          lines={problem.lines.map((l, i) => ({
            id: l.id,
            latex: l.latex,
            label: `Line ${i + 1}`,
            spoken: spokenLines[l.id],
          }))}
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
      {lowVision}
      <div className="min-h-dvh bg-[--bg] text-[--fg]" hidden={Boolean(lowVision)}>
      {/* A skip link is the first thing a keyboard user needs. */}
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header className="border-b border-[--line] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Glance</h1>
            <p className="mt-1 text-[--muted]">Math you can hear and speak.</p>
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

      {screen === 'home' && (
        <Home
          backEndReachable={backEnd !== 'down'}
          connected={apiConnected}
          captureUnavailable={modelsUsable ? undefined : modelsUnavailableWhy}
          onCapture={() => setScreen('capture')}
          onSample={() => openProblem(sampleProblem())}
          onResume={problem ? () => setScreen('problem') : undefined}
          onSettings={openSettings}
        />
      )}

      {screen === 'capture' && (
        <Capture onCaptured={openProblem} onBack={() => setScreen('home')} />
      )}

      {screen === 'problem' && problem && (
        <Problem
          problem={problem}
          onLowVision={enterLowVision}
          mode={settings.mode}
          onNewCapture={() => setScreen('capture')}
          onStartWorking={(index) => {
            setWorkingFrom(index);
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
          speechAvailable={modelsUsable}
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
        <main id="main" className="mx-auto max-w-3xl px-6 py-8">
          <h2 className="text-2xl font-semibold">No problem loaded</h2>
          <button type="button" className="btn mt-4" onClick={() => setScreen('home')}>
            Back to start
          </button>
        </main>
      )}

      <footer className="mx-auto max-w-3xl px-6 pb-10 pt-4 text-sm text-[--muted]">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt>Back end</dt>
          <dd data-testid="backend-status">
            {backEnd === 'checking' && 'checking'}
            {backEnd === 'up' && 'reachable'}
            {backEnd === 'down' && `not reachable — ${backEndNote}`}
          </dd>
          <dt>API base</dt>
          <dd>
            <code>{apiBase ?? 'not set'}</code>
          </dd>
        </dl>
      </footer>
      </div>
    </>
  );
}
