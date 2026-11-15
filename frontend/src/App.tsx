// App shell: Glance is one page (#240).
//
// There are no screens to move between. The page reads top to bottom in the
// order the work happens: bring in the worksheet, hear it, do the work, hand
// it in. Each part appears in place as soon as it is useful, and the arrow
// keys walk straight down the page (traverse.ts, #236). Moving between screens
// was where students got lost: every switch was a place to re-orient, and a
// screen-reader user had to find their place again each time.
//
// Low-vision mode is the one exception. It is a full-screen magnifier over the
// same page, not a different place, and leaving it returns to the same line.

import { useCallback, useEffect, useState } from 'react';
import { LiveRegion, announce, focusFirst } from './components/LiveRegion';
import { ScreenBoundary } from './components/ScreenBoundary';
import { KeyboardHelp } from './components/KeyboardHelp';
import { useTraversal } from './traverse';
import { setSelfVoicing } from './audio/tts';
import { ModeBadge } from './components/ModeBadge';
import { InstallApp } from './components/InstallApp';
import { ReadingControls } from './components/ReadingControls';
import { Settings } from './screens/Settings';
import { Export } from './screens/Export';
import { helpText, useShortcuts, type ScreenName } from './shortcuts';
import { loadMathJax } from './math/mathjax';
import { spokenMath } from './math/sre';
import { health, apiBase, apiConnected, ApiFailure, diagnoseUnreachable } from './api';
import { UNCONNECTED_MESSAGE } from './apiBase';
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

type BackEnd = 'checking' | 'up' | 'down';

// Said once when the page opens, so it is one breath long.
const WELCOME =
  'Glance. It reads your maths worksheet aloud and writes down your own work as you say it. It never solves it for you. Use the Down arrow to move through the page and Space to press or hear what you are on.';

export function App() {
  const [problem, setProblem] = useState<ProblemData | null>(() => loadProblem());
  // A new worksheet is being brought in while one is already loaded.
  // The capture page: its own page, reached from Get started or from
  // "Bring in a different worksheet". It is in the address (#capture) so the
  // browser's Back button leaves it.
  const [capturing, setCapturingState] = useState(() => window.location.hash === '#capture');
  const setCapturing = useCallback((on: boolean) => {
    setCapturingState(on);
    const want = on ? '#capture' : '';
    if (window.location.hash !== want) {
      if (on) window.history.pushState(null, '', '#capture');
      else window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);
  useEffect(() => {
    const onPop = () => setCapturingState(window.location.hash === '#capture');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [lowVisionOn, setLowVisionOn] = useState(false);
  const [lowVisionFailed, setLowVisionFailed] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [spokenLines, setSpokenLines] = useState<Record<string, string>>({});
  const [backEnd, setBackEnd] = useState<BackEnd>('checking');
  const [backEndNote, setBackEndNote] = useState('');
  const [settings, setSettings] = useState<SettingsData>(() => loadSettings());
  // The problem line the student's first step follows from.
  const [workingFrom, setWorkingFrom] = useState(0);

  useEffect(() => {
    setSelfVoicing(settings.selfVoicing);
  }, [settings.selfVoicing]);

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

  // One greeting on arrival, or what was restored from last time.
  // Once, on arrival. The timer is cleared and set again by StrictMode's
  // second pass in development, so the guard cannot be a "greeted" flag set on
  // the first pass: that would cancel the only timer.
  useEffect(() => {
    const count = loadWork().length || problem?.lines.length;
    const text = count
      ? `Glance. I restored your work from earlier: ${count} ${count === 1 ? 'line' : 'lines'}. Use the Down arrow to move through the page and Space to press or hear what you are on.`
      : WELCOME;
    const timer = window.setTimeout(() => announce(text), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard help (#25): `null` when closed, otherwise whether it took focus.
  const [help, setHelp] = useState<null | { takeFocus: boolean }>(null);
  const helpScreen: ScreenName =
    lowVisionOn && problem ? 'lowvision' : problem && !capturing ? 'problem' : 'capture';

  /** "?" anywhere: say the shortcuts and show them. */
  function showHelp(takeFocus: boolean) {
    announce(helpText(helpScreen));
    setHelp({ takeFocus });
  }

  useShortcuts({ '?': () => showHelp(false) });

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

  const openProblem = useCallback((next: ProblemData) => {
    setProblem(next);
    saveProblem(next);
    setLineIndex(0);
    setWorkingFrom(0);
    setCapturing(false);

    // A capture announces its own result, in more detail than is possible here
    // — it knows what was unsure and what the photo warnings were. The sample
    // has no such step, so it is announced here.
    if (next.source === 'sample') {
      const count = `${next.lines.length} ${next.lines.length === 1 ? 'line' : 'lines'}`;
      announce(`Sample problem. ${next.instructions} ${count}.`.trim());
    }
  }, []);

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
    // Grab MathJax's speech strings while the problem is still rendered, so
    // low-vision mode's optional voice reads the maths, not just "Line 2".
    const spoken: Record<string, string> = {};
    for (const line of problem?.lines ?? []) {
      const label = spokenMath(document.getElementById(line.id));
      if (label) spoken[line.id] = label;
    }
    setSpokenLines(spoken);
    setLowVisionFailed(false);
    setLineIndex(index);
    setLowVisionOn(true);
  }

  function newWorksheet() {
    setCapturing(true);
  }

  function leaveCapture() {
    setCapturing(false);
    if (problem) {
      announce('Kept your current worksheet.');
      window.setTimeout(() => focusFirst('#problem-heading'), 60);
    } else {
      announce('Back to the start.');
      window.setTimeout(() => focusFirst('#start-heading'), 60);
    }
  }

  function startWorking(index: number) {
    setWorkingFrom(index);
    setLineIndex(index);
    announce(`Your work, following line ${index + 1} of the worksheet. Hold Space to say a line, or type it.`);
    window.setTimeout(() => focusFirst('#work-heading'), 60);
  }

  function goToHandIn() {
    const count = loadWork().length;
    announce(
      `Hand in your work. ${count} ${count === 1 ? 'line' : 'lines'} of your work. Download a file, or print it.`,
    );
    window.setTimeout(() => focusFirst('#handin-heading'), 60);
  }

  const lowVision = lowVisionOn && problem;

  // The whole page by Up/Down and Space (#236). Low-vision mode has its own
  // one-line-at-a-time arrows.
  useTraversal(!lowVision);

  const showStart = !problem && !capturing;

  // `LiveRegion` stays outside every conditional: if it remounted during a
  // change, the announcement made at that moment would be lost.
  return (
    <>
      <LiveRegion />
      <div className="min-h-dvh bg-[--bg] text-[--fg]">
        {lowVision && (
          <ScreenBoundary screen="lowvision" onBackToStart={() => setLowVisionOn(false)} onFailure={setLowVisionFailed}>
            <LowVision
              lines={problem.lines}
              spokenLines={spokenLines}
              startIndex={lineIndex}
              onExit={(i) => {
                setLineIndex(i);
                setLowVisionOn(false);
                announce('Left low-vision mode.');
                window.setTimeout(() => focusFirst(`#${problem.lines[i]?.id ?? 'L1'}`), 60);
              }}
            />
          </ScreenBoundary>
        )}

        <div hidden={Boolean(lowVision) && !lowVisionFailed}>
          <a href="#main" className="skip-link">
            Skip to main content
          </a>

          <header className="app-bar">
            <div className="app-bar-inner">
              <h1 className="mono inline-flex min-h-[40px] items-center bg-[--accent] px-3 text-xl font-medium text-[--accent-fg]">
                Glance
              </h1>
              <ModeBadge mode={settings.mode} />
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn"
                  aria-expanded={help !== null}
                  aria-controls="keyboard-help"
                  aria-keyshortcuts="?"
                  onClick={() => (help ? setHelp(null) : showHelp(true))}
                >
                  Keys
                </button>
              </div>
            </div>
          </header>

          {help && (
            <KeyboardHelp
              screen={helpScreen}
              takeFocus={help.takeFocus}
              onClose={() => {
                setHelp(null);
                announce('Shortcuts closed.');
              }}
            />
          )}

          <main id="main" tabIndex={-1} className="page">
            {capturing ? (
              <ScreenBoundary screen="capture" onBackToStart={leaveCapture} restartFocus="#capture-heading">
                <Capture
                  onCaptured={openProblem}
                  onSample={() => openProblem(sampleProblem())}
                  onCancel={leaveCapture}
                  keepLabel={problem ? 'Keep my current problem' : 'Back to the start'}
                />
              </ScreenBoundary>
            ) : showStart ? (
              <section aria-labelledby="start-heading" className="step get-started">
                <h2 id="start-heading" tabIndex={-1} className="display text-center">
                  Maths you can hear, explore and write
                </h2>
                <p className="get-started-lead text-center">
                  Glance reads your maths worksheet aloud, lets you explore each line
                  piece by piece, and writes down your own working as you say it.{' '}
                  <strong>It never solves anything for you</strong>, so the work stays
                  yours, in class and in exams.
                </p>
                <ul className="get-started-points">
                  <li><strong>Hear it.</strong> Every line is read aloud, with the maths said properly.</li>
                  <li><strong>Explore it.</strong> Move through the page with the arrow keys and Space.</li>
                  <li><strong>Write it.</strong> Say or type your own steps and hand them in as typed work.</li>
                </ul>
                <div className="hero-action">
                  <button type="button" className="btn-hero" onClick={() => setCapturing(true)}>
                    Get started
                  </button>
                </div>
                <div className="text-center">
                  <button type="button" className="btn-quiet" onClick={() => openProblem(sampleProblem())}>
                    Try a sample problem
                  </button>
                </div>
              </section>
            ) : problem ? (
              <>
                <ol className="progress" aria-label="Steps">
                  <li data-done="true">Worksheet</li>
                  <li data-done={loadWork().length > 0 ? 'true' : undefined}>Your work</li>
                  <li>Hand in</li>
                </ol>
                <ScreenBoundary
                  screen="worksheet"
                  onBackToStart={() => focusFirst('#problem-heading')}
                  restartFocus="#problem-heading"
                >
                <Problem
                  key={problem.lines.map((l) => l.id).join()}
                  problem={problem}
                  startIndex={lineIndex}
                  onLowVision={enterLowVision}
                  mode={settings.mode}
                  onNewCapture={newWorksheet}
                  onDiscardLine={discardProblemLine}
                  onStartWorking={startWorking}
                  onExport={goToHandIn}
                />
                </ScreenBoundary>

            {problem && (
              <ScreenBoundary screen="work" onBackToStart={() => focusFirst('#problem-heading')} restartFocus="#work-heading">
                <Scratchpad
                  problem={problem}
                  mode={settings.mode}
                  startLine={workingFrom}
                  onExport={goToHandIn}
                />
              </ScreenBoundary>
            )}

            {problem && (
              <ScreenBoundary screen="handin" onBackToStart={() => focusFirst('#problem-heading')} restartFocus="#handin-heading">
                <Export problem={problem} />
              </ScreenBoundary>
            )}

              </>
            ) : null}

            <section aria-labelledby="reading-heading" className="step">
              <h2 id="reading-heading" className="step-title">How Glance reads to you</h2>
              <div className="mt-4">
                <ReadingControls settings={settings} onChange={updateSettings} />
              </div>
            </section>

            <details className="step no-print">
              <summary className="step-title cursor-pointer">More settings</summary>
              <ScreenBoundary screen="settings" onBackToStart={() => undefined}>
                <Settings settings={settings} onChange={updateSettings} />
              </ScreenBoundary>
            </details>

            <div className="mt-10 no-print">
              <InstallApp />
            </div>

            <p className="mt-4 text-sm text-[--muted] no-print">
              Images are sent to the OpenAI API to be read, and are not stored on our
              server. There are no accounts, and your work stays in this browser.
            </p>

            {/* Nothing is said while everything works. When it breaks, this
                says what still works first, and keeps the technical detail for
                whoever goes looking. */}
            {backEnd === 'down' && (
              <div
                role="status"
                data-testid="backend-status"
                className="mt-6 rounded-lg border border-[--warn] bg-[--surface] px-4 py-3 text-sm"
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
            )}
          </main>
        </div>
      </div>
    </>
  );
}
