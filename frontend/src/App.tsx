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

import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveRegion, announce, focusFirst } from './components/LiveRegion';
import { ScreenBoundary } from './components/ScreenBoundary';
import { KeyboardHelp } from './components/KeyboardHelp';
import { useTraversal } from './traverse';
import { setSelfVoicing, speakOnce } from './audio/tts';
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

// First visit (#211): one question, so a student arriving alone, with or
// without a screen reader, can start with no one helping.
const WELCOMED_KEY = 'glance.welcomed.v1';
const ASK_VOICE = 'Press Y to hear Glance speak to you, or N if you use a screen reader.';
const NEXT = 'Then press C to point your camera at a worksheet, or S to try a sample problem.';
const FIRST_VISIT_WELCOME =
  'Glance. It reads your maths worksheet aloud and writes down your own work as you say it. It never solves it for you.';

function welcomedBefore(): boolean {
  try {
    return window.localStorage.getItem(WELCOMED_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberWelcomed(): void {
  try {
    window.localStorage.setItem(WELCOMED_KEY, '1');
  } catch {
    // Private windows can refuse storage; the question is simply asked again.
  }
}

// Keys a screen-reader user moves around with. The first-gesture voice waits
// for something else, so it does not talk over a screen reader.
const NAVIGATION_KEYS = new Set([
  'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown',
]);

/** How soon an unanswered health check is asked again, doubling up to the cap. */
const HEALTH_RETRY_FIRST_MS = 2_000;
const HEALTH_RETRY_MAX_MS = 30_000;

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
  // Asked on the landing of a first visit only: Y or N for the voice (#211).
  const [firstVisit, setFirstVisit] = useState(() => !welcomedBefore());
  // The camera starts on arrival at the capture page when it was reached by C.
  const [cameraOnArrival, setCameraOnArrival] = useState(false);
  const [lowVisionOn, setLowVisionOn] = useState(false);
  const [lowVisionFailed, setLowVisionFailed] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [spokenLines, setSpokenLines] = useState<Record<string, string>>({});
  const [backEnd, setBackEnd] = useState<BackEnd>('checking');
  const [backEndNote, setBackEndNote] = useState('');
  // Whether the server said it can read images and speech (#127).
  const [models, setModels] = useState(true);
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
      : !problem && !window.location.hash && firstVisit
        ? `${FIRST_VISIT_WELCOME} ${ASK_VOICE} ${NEXT} Use the Down arrow to move through the page and Space to press or hear what you are on.`
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

  // Health is asked again, not trusted from one request at load (#127). A
  // cold start can make the first request fail, and a student told "capture
  // is unavailable" should not have to reload to find out it came back.
  const healthRun = useRef(0);
  const healthRetry = useRef<number | undefined>(undefined);
  const retryDelay = useRef(HEALTH_RETRY_FIRST_MS);
  const checkHealth = useCallback(async () => {
    // A deployed build with no server address has nothing to ask (#135).
    if (!apiConnected) {
      setBackEnd('down');
      setBackEndNote(UNCONNECTED_MESSAGE);
      return;
    }
    const run = ++healthRun.current;
    window.clearTimeout(healthRetry.current);
    try {
      const h = await health();
      if (run !== healthRun.current) return;
      retryDelay.current = HEALTH_RETRY_FIRST_MS;
      setBackEnd('up');
      setBackEndNote('');
      setModels(h.models !== false);
    } catch (e: unknown) {
      if (run !== healthRun.current) return;
      setBackEnd('down');
      // Try again on its own, further apart each time, until it answers.
      healthRetry.current = window.setTimeout(() => void checkHealth(), retryDelay.current);
      retryDelay.current = Math.min(retryDelay.current * 2, HEALTH_RETRY_MAX_MS);
      // A server that is up but refusing this origin looks identical to one
      // that is down, so find out which before telling anyone anything.
      if (e instanceof ApiFailure && e.code === 'NETWORK') {
        const why = await diagnoseUnreachable();
        if (run !== healthRun.current) return;
        setBackEndNote(
          why === 'blocked'
            ? `The server is running but is not accepting requests from ${window.location.origin}. Add that address to ALLOWED_ORIGIN on the server.`
            : 'Nothing answered at the server address. Check that it is deployed and that you are online.',
        );
        return;
      }
      setBackEndNote(e instanceof ApiFailure ? e.message : 'Unavailable.');
    }
  }, []);

  useEffect(() => () => window.clearTimeout(healthRetry.current), []);

  // Asked on load, again each time the capture page is opened, and again when
  // a capture button is pressed while capture is unavailable.
  useEffect(() => {
    void checkHealth();
  }, [capturing, checkHealth]);

  // Recording and capture need the server's model. They are hidden only when
  // a server that answered says it has none, or when this build has no
  // server at all. An unanswered request proves nothing: it may be a cold
  // start, and a failed upload explains itself.
  const modelsUsable = apiConnected && models;
  const modelsUnavailableWhy = apiConnected
    ? 'The server cannot read images or speech right now.'
    : UNCONNECTED_MESSAGE;

  const openProblem = useCallback((next: ProblemData) => {
    setProblem(next);
    saveProblem(next);
    setLineIndex(0);
    setWorkingFrom(0);
    setCapturing(false);
    // Your work is on the page from here on, and its controls depend on whether
    // the server can read speech, so ask again now.
    void checkHealth();

    // A capture announces its own result, in more detail than is possible here
    // — it knows what was unsure and what the photo warnings were. The sample
    // has no such step, so it is announced here.
    if (next.source === 'sample') {
      const count = `${next.lines.length} ${next.lines.length === 1 ? 'line' : 'lines'}`;
      announce(`Sample problem. ${next.instructions} ${count}.`.trim());
    }
  }, [checkHealth]);

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

  /** Open the capture page, or say why it cannot work right now (#127). The
   *  buttons that lead here stay in the tab order, so a student moving by Tab
   *  is told why instead of landing on a page where every upload fails. */
  function openCapturePage(withCamera = false) {
    if (!modelsUsable) {
      announce(`Capture is unavailable right now. ${modelsUnavailableWhy} Try the sample problem instead.`);
      // Pressing it is also a reason to ask again: the model may be back.
      void checkHealth();
      return;
    }
    setCameraOnArrival(withCamera);
    setCapturing(true);
  }

  function chooseVoice(on: boolean) {
    rememberWelcomed();
    setFirstVisit(false);
    // Saved as a choice, so reading aloud stays as picked from now on.
    updateSettings({ ...settings, selfVoicing: on, voiceChosen: true });
    // Switched on before announcing, so this very sentence is spoken.
    announce(on ? `Okay, I will speak to you. ${NEXT}` : `Okay, your screen reader will do the talking. ${NEXT}`);
  }

  function goHome() {
    setCapturing(false);
    window.scrollTo({ top: 0 });
    announce(problem ? 'Home. Your worksheet.' : 'Home.');
    // With a worksheet, it lands on its first line as it always does.
    if (!problem) window.setTimeout(() => focusFirst('#start-heading'), 60);
  }

  function newWorksheet() {
    openCapturePage();
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
    void checkHealth();
    setWorkingFrom(index);
    setLineIndex(index);
    announce(`Your work, following line ${index + 1} of the worksheet. ${modelsUsable ? 'Hold Space to say a line, or type it.' : 'Type a line.'}`);
    // The section is already on the page, so focus moves now. A delayed move
    // could take focus back from a student who had started typing.
    focusFirst('#work-heading');
  }

  function goToHandIn() {
    const count = loadWork().length;
    announce(
      `Hand in your work. ${count} ${count === 1 ? 'line' : 'lines'} of your work. Download a file, or print it.`,
    );
    focusFirst('#handin-heading');
  }

  const lowVision = lowVisionOn && problem;

  // The whole page by Up/Down and Space (#236). Low-vision mode has its own
  // one-line-at-a-time arrows.
  useTraversal(!lowVision);

  const showStart = !problem && !capturing;

  // U and C on the landing open the capture page, as they did on Home.
  useShortcuts(
    {
      u: () => openCapturePage(),
      c: () => openCapturePage(true),
      s: () => openProblem(sampleProblem()),
      ...(firstVisit ? { y: () => chooseVoice(true), n: () => chooseVoice(false) } : {}),
    },
    showStart,
  );

  // A student with no screen reader hears nothing from a live region, and the
  // browser will not let the page speak until they do something. So on a first
  // visit, their first tap, click or key other than navigation says the
  // question aloud, once (#211).
  useEffect(() => {
    if (!showStart || !firstVisit) return;
    let done = false;
    const CONTROLS = 'button, a, input, select, textarea, label';
    function first(e: Event) {
      if (done) return;
      // Someone using a control has found their way already, and a screen
      // reader activating one must never be talked over: stop listening.
      const target = e instanceof KeyboardEvent ? document.activeElement : e.target;
      if (target instanceof Element && target.closest(CONTROLS)) {
        done = true;
        return;
      }
      // Keys: only Space or Enter on the page itself.
      if (e instanceof KeyboardEvent && (NAVIGATION_KEYS.has(e.key) || ![' ', 'Enter'].includes(e.key))) return;
      done = true;
      speakOnce(`Welcome to Glance. ${ASK_VOICE} ${NEXT}`);
    }
    window.addEventListener('pointerdown', first, true);
    window.addEventListener('keydown', first, true);
    return () => {
      window.removeEventListener('pointerdown', first, true);
      window.removeEventListener('keydown', first, true);
    };
  }, [showStart, firstVisit]);

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
              <h1 className="m-0">
                {/* The logo goes home: off the capture page and back to the top,
                    as on any site. A real link, so it also works by Enter. */}
                <a
                  href="/"
                  className="mono inline-flex min-h-[40px] items-center bg-[--accent] px-3 text-xl font-medium text-[--accent-fg] no-underline"
                  title="Go home"
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    goHome();
                  }}
                >
                  Glance
                </a>
              </h1>
              <ModeBadge mode={settings.mode} />
              <nav aria-label="Reading tools" className="ml-auto flex flex-wrap items-center gap-3">
                <ReadingControls settings={settings} onChange={updateSettings} />
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
              </nav>
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
                  autoCamera={cameraOnArrival}
                />
              </ScreenBoundary>
            ) : showStart ? (
              <section aria-labelledby="start-heading" className="landing">
                <div className="landing-hero">
                  <h2 id="start-heading" tabIndex={-1} className="landing-title">
                    Maths you can hear, explore and write
                  </h2>
                  <p className="landing-lead">
                    Glance reads your maths worksheet aloud, lets you explore each line,
                    and writes down your own working as you say it.
                  </p>
                  {firstVisit && (
                    // Text, not buttons: it adds no Tab stops, and Tab still goes
                    // straight to "Get started". The Read aloud switch in the top
                    // bar does the same thing for anyone who prefers a control.
                    <p className="welcome-ask" data-testid="welcome">
                      New here? Press <kbd className="kbd">Y</kbd> to hear Glance speak to you, or{' '}
                      <kbd className="kbd">N</kbd> if you use a screen reader.
                    </p>
                  )}
                  <div className="landing-actions">
                    <button
                      type="button"
                      className="btn-hero"
                      onClick={() => openCapturePage()}
                      aria-disabled={modelsUsable ? undefined : 'true'}
                    >
                      {modelsUsable ? 'Get started' : 'Get started - capture is unavailable right now'}
                    </button>
                    <button type="button" className="btn" onClick={() => openProblem(sampleProblem())}>
                      Try a sample problem
                    </button>
                  </div>
                </div>

                <h3 className="sr-only">How it works</h3>
                <ol className="step-cards">
                  <li className="step-card">
                    <span className="step-card-number" aria-hidden="true">1</span>
                    <h4 className="step-card-title">Bring in a problem</h4>
                    <p>Upload a photo, a screenshot or a PDF, or point your camera at the page.</p>
                  </li>
                  <li className="step-card">
                    <span className="step-card-number" aria-hidden="true">2</span>
                    <h4 className="step-card-title">Hear it and explore it</h4>
                    <p>Every line is read aloud. Move with the arrow keys, and press Space to hear one.</p>
                  </li>
                  <li className="step-card">
                    <span className="step-card-number" aria-hidden="true">3</span>
                    <h4 className="step-card-title">Do the work yourself</h4>
                    <p>Say or type each step, hear it read back, and hand it in as typed work.</p>
                  </li>
                </ol>

                <p className="promise">
                  <strong>Glance never solves the problem.</strong> No answers, no hints,
                  no next steps. The work stays yours, in class and in exams.
                </p>
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
                  speechAvailable={modelsUsable}
                  onExport={goToHandIn}
                />
              </ScreenBoundary>
            )}

            {problem && (
              <ScreenBoundary screen="handin" onBackToStart={() => focusFirst('#problem-heading')} restartFocus="#handin-heading">
                <Export problem={problem} mode={settings.mode} />
              </ScreenBoundary>
            )}

              </>
            ) : null}


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
