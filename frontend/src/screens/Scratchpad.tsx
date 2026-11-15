// Scratchpad — issue #18, with the clarify dialog of issue #19.
//
// This is the half of the product that is not reading: the student doing the
// work. No pencil, no paper, no handwriting — they say a line, hear it read
// back, confirm it, and it joins their numbered work (DESIGN.md 5, Flow A).
//
// Three rules shape everything here:
//   - Nothing is saved until the student confirms it.
//   - When speech is ambiguous we ask, we never guess (issue #19).
//   - Nothing is ever solved, hinted, or corrected, in any mode.
//
// Typing is a first-class alternative, not a fallback. Some students cannot
// speak reliably, some are in a quiet library, and some browsers cannot record.

import { useEffect, useRef, useState } from 'react';
import { announce, focusFirst } from '../components/LiveRegion';
import { MathLine } from '../components/MathLine';
import { MathExports } from '../components/MathExports';
import { RecordButton } from '../components/RecordButton';
import { ReadbackBar } from '../components/ReadbackBar';
import { ClarifyDialog } from '../components/ClarifyDialog';
import {
  transcribe,
  spokenToLatex,
  command,
  ApiFailure,
  type SpokenAlternative,
} from '../api';
import { applyEdit, lineNumber, looksLikeCommand } from '../commands';
import { helpText, useShortcuts } from '../shortcuts';
import { speak } from '../audio/tts';
import type { Recording } from '../audio/recorder';
import { checkStep, stepChecksAllowed } from '../stepCheck';
import { loadWork, saveWork, type Mode, type Problem, type WorkLine } from '../state';

export interface ScratchpadProps {
  problem: Problem;
  onBack: () => void;
  /** Decides whether and how a saved step is checked (DESIGN.md 14). */
  mode: Mode;
  /** The problem line the student was on; their first step follows from it. */
  startLine: number;
  onExport: () => void;
}

interface Pending {
  latex: string;
  readback: string;
  valid: boolean;
}

interface Clarify {
  question: string;
  alternatives: SpokenAlternative[];
}

let nextId = Date.now();
function newId(): string {
  nextId += 1;
  return `W${nextId}`;
}

export function Scratchpad({ problem, onBack, mode, startLine, onExport }: ScratchpadProps) {
  const [lines, setLines] = useState<WorkLine[]>(() => loadWork());
  const [pending, setPending] = useState<Pending | null>(null);
  const [clarify, setClarify] = useState<Clarify | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showProblem, setShowProblem] = useState(false);
  // What the step check said about each saved line, shown under it so a
  // low-vision student reading the screen gets it too. Not stored.
  const [checks, setChecks] = useState<Record<string, string>>({});
  // The work line the student is on (for commands like "delete that"), and
  // the line an edit will replace once the student confirms it (#24).
  const [current, setCurrent] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<string | null>(null);

  // One step of undo is enough in practice and is far easier to explain than a
  // history: "undo" always means "put back the line I just removed".
  const undone = useRef<{ line: WorkLine; at: number } | null>(null);
  // The most recent thing the student did, so a slow step-check result can
  // tell whether it is still the news.
  const lastAction = useRef<string>('');
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    announce(
      lines.length
        ? `Your work. ${lines.length} ${lines.length === 1 ? 'line' : 'lines'} so far.`
        : 'Your work. Record a line, or type one.',
    );
  }, []);

  useEffect(() => {
    saveWork(lines);
  }, [lines]);

  function fail(message: string) {
    setError(message);
    announce(message, 'assertive');
  }

  /** Turn a transcript into a pending line, or into a clarifying question. */
  async function interpret(text: string) {
    lastAction.current = 'interpret';
    setBusy(true);
    setError('');
    try {
      // Prior lines give the model variable names only — never the problem's
      // answer, and never anything it could complete from.
      const context = [
        ...problem.lines.map((l) => l.latex),
        ...lines.map((l) => l.latex),
      ];
      const result = await spokenToLatex(text, context);

      if (result.ambiguous && result.clarifying_question) {
        setClarify({
          question: result.clarifying_question,
          alternatives: result.alternatives,
        });
        announce(result.clarifying_question, 'assertive');
        return;
      }

      if (!result.latex || !result.readback) {
        fail("I couldn't confirm this step. Say it again, or type it.");
        return;
      }

      setPending({ latex: result.latex, readback: result.readback, valid: result.valid });
      announce(`I heard: ${result.readback}. Enter to save, E to edit.`);
    } catch (e: unknown) {
      fail(
        e instanceof ApiFailure
          ? e.message
          : 'Something went wrong reading that line.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRecording(recording: Recording) {
    lastAction.current = 'record';
    setBusy(true);
    setError('');
    announce('Working out what you said…');
    try {
      const { text } = await transcribe(recording.blob, recording.contentType);
      if (!text.trim()) {
        fail('I did not hear anything. Try again.');
        return;
      }
      await handleText(text);
    } catch (e: unknown) {
      fail(e instanceof ApiFailure ? e.message : 'I could not transcribe that recording.');
    } finally {
      setBusy(false);
    }
  }

  async function savePending(line: Pending) {
    const entry: WorkLine = { id: newId(), ...line };
    // An edit (#24) replaces its line in place; anything else is appended.
    const editIndex = editTarget ? lines.findIndex((l) => l.id === editTarget) : -1;
    const index = editIndex >= 0 ? editIndex : lines.length;
    // The step is checked against the line it follows: the student's previous
    // line, or for their first line, the problem line they were working from.
    const from = lines[index - 1] ?? problem.lines[startLine] ?? problem.lines[0];
    setLines((prev) =>
      editIndex >= 0 ? prev.map((l, i) => (i === editIndex ? entry : l)) : [...prev, entry],
    );
    setPending(null);
    setTyped('');
    setEditTarget(null);
    const position = index + 1;
    window.setTimeout(() => focusFirst(`#${entry.id}`), 80);

    const saved = editIndex >= 0 ? `Updated line ${position}.` : `Saved as line ${position}.`;
    announce(line.valid ? saved : `${saved} I could not check it.`);
    lastAction.current = entry.id;

    if (!line.valid || !from?.valid || !stepChecksAllowed(mode)) return;
    const verdict = await checkStep(from.latex, entry.latex, mode);
    if (!verdict) return;
    setChecks((prev) => ({ ...prev, [entry.id]: verdict }));
    // Only speak up if the student hasn't moved on. A late verdict must never
    // talk over "Deleted line 1" or a new readback.
    if (lastAction.current === entry.id) announce(verdict);
  }

  function remove(line: WorkLine, index: number) {
    lastAction.current = `remove:${line.id}`;
    undone.current = { line, at: index };
    setLines((prev) => prev.filter((l) => l.id !== line.id));
    announce(`Deleted line ${index + 1}. Press U to undo.`);
  }

  function undo() {
    lastAction.current = 'undo';
    const last = undone.current;
    if (!last) {
      announce('There is nothing to undo.');
      return;
    }
    setLines((prev) => {
      const next = [...prev];
      next.splice(Math.min(last.at, next.length), 0, last.line);
      return next;
    });
    undone.current = null;
    announce('Put the line back.');
  }

  /** Math goes to spoken-to-LaTeX; a command goes to the command route. */
  async function handleText(text: string) {
    if (looksLikeCommand(text)) await runCommand(text);
    else await interpret(text);
  }

  /** Carry out a voice or typed command (#24). Never changes math by itself:
   *  an edit lands in the edit box to be read back and confirmed. */
  async function runCommand(text: string) {
    lastAction.current = 'command';
    setBusy(true);
    setError('');
    let result;
    try {
      const currentId = current !== null ? `W${current + 1}` : null;
      result = await command(text, currentId, lines.length);
    } catch (e: unknown) {
      fail(e instanceof ApiFailure ? e.message : "I didn't catch that.");
      return;
    } finally {
      setBusy(false);
    }

    const n = lineNumber(result.target_line);
    const target = n !== null ? lines[n - 1] : undefined;
    const needsLine = ['navigate', 'delete', 'edit', 'check', 'what_changed'].includes(result.intent)
      || (result.intent === 'read' && result.instruction !== 'all');
    if (needsLine && !target) {
      announce(
        lines.length === 0
          ? 'You have not written any lines yet.'
          : n !== null
            ? `There is no line ${n}. You have ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}.`
            : 'Which line? Say a line number, like line two.',
      );
      return;
    }

    switch (result.intent) {
      case 'navigate':
        setCurrent(n! - 1);
        focusFirst(`#${target!.id}`);
        announce(`Line ${n}. ${target!.readback}`);
        return;
      case 'read':
        if (result.instruction === 'all') readAll();
        else announce(`Line ${n}. ${target!.readback}`);
        return;
      case 'delete':
        remove(target!, n! - 1);
        return;
      case 'undo':
        undo();
        return;
      case 'new_line':
        announce('Ready for a new line. Hold Space and speak, or type it.');
        return;
      case 'check':
      case 'what_changed': {
        if (!stepChecksAllowed(mode)) {
          announce('Step checking is off in exam mode.');
          return;
        }
        const before = lines[n! - 2] ?? problem.lines[startLine] ?? problem.lines[0];
        if (!target!.valid || !before?.valid) {
          announce(`I couldn't confirm line ${n}. It could not be read as math.`);
          return;
        }
        const verdict = await checkStep(before.latex, target!.latex, mode);
        announce(verdict ? `Line ${n}. ${verdict}` : "I couldn't check that right now. Try again in a moment.");
        return;
      }
      case 'export':
        onExport();
        return;
      case 'help': {
        const help = helpText('scratchpad');
        announce(help);
        speak(help);
        return;
      }
      case 'edit': {
        const changed = applyEdit(target!.latex, result.instruction);
        setTyped(changed ?? target!.latex);
        setEditTarget(target!.id);
        announce(
          changed
            ? `Line ${n} is in the edit box with that change. Press Add line to hear it back.`
            : `Line ${n} is in the edit box. Change it, then press Add line.`,
        );
        window.setTimeout(() => focusFirst('#typed-line'), 60);
        return;
      }
      default:
        announce("I didn't catch that.");
    }
  }

  function readAll() {
    if (lines.length === 0) {
      announce('You have not written any lines yet.');
      return;
    }
    announce(lines.map((l, i) => `Line ${i + 1}. ${l.readback}.`).join(' '));
  }

  // Shortcuts are suspended while a dialog or the readback bar owns the
  // keyboard, so Enter and the number keys mean what they say there.
  useShortcuts(
    {
      u: undo,
      'shift+r': readAll,
      x: onExport,
      p: () => {
        setShowProblem((v) => !v);
        announce(showProblem ? 'Problem hidden.' : 'Problem shown.');
      },
    },
    !clarify && !pending,
  );

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-8">
      <h2
        ref={heading}
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight focus-visible:ring-4 focus-visible:ring-[--accent]"
      >
        Your work
      </h2>

      {/* The problem stays within reach but collapsed, so it does not sit
          between the student and the thing they came here to do. */}
      <div className="mt-4">
        <button
          type="button"
          className="btn"
          aria-expanded={showProblem}
          onClick={() => setShowProblem((v) => !v)}
        >
          {showProblem ? 'Hide the problem' : 'Show the problem'}
        </button>
      </div>

      {showProblem && (
        <section aria-label="The problem" className="mt-4 space-y-3">
          {problem.instructions && <p className="text-[--muted]">{problem.instructions}</p>}
          {problem.lines.map((l, i) => (
            <MathLine
              key={l.id}
              id={`p-${l.id}`}
              latex={l.latex}
              label={`Problem line ${i + 1}`}
              unsure={!l.valid}
            />
          ))}
        </section>
      )}

      <section aria-label="Your lines" className="mt-8">
        {lines.length === 0 ? (
          <p className="text-[--muted]">
            Nothing yet. Record a line or type one below.
          </p>
        ) : (
          <ol className="space-y-4">
            {lines.map((l, i) => (
              <li key={l.id} className="flex items-start gap-3" onFocus={() => setCurrent(i)}>
                <span className="mt-4 w-6 shrink-0 text-right text-[--muted]" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <MathLine
                    id={l.id}
                    latex={l.latex}
                    label={`Your line ${i + 1}`}
                    unsure={!l.valid}
                  />
                  {checks[l.id] && (
                    <p className="mt-1 text-sm text-[--muted]">{checks[l.id]}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn mt-1"
                  onClick={() => remove(l, i)}
                  aria-label={`Delete your line ${i + 1}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {pending && (
        <ReadbackBar
          readback={pending.readback}
          unsure={!pending.valid}
          onSave={() => void savePending(pending)}
          onEdit={() => {
            // Editing drops into the typed box with the LaTeX already there,
            // so a near-miss is a correction rather than a re-recording.
            setTyped(pending.latex);
            setPending(null);
            announce('Edit your line, then press Save.');
            window.setTimeout(() => focusFirst('#typed-line'), 60);
          }}
          onDiscard={() => {
            setPending(null);
            setEditTarget(null);
            announce('Discarded.');
          }}
        />
      )}

      {!pending && (
        <section aria-label="Add a line" className="mt-8 border-t border-[--line] pt-6">
          <RecordButton onResult={onRecording} onError={fail} disabled={busy} />

          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              const text = typed.trim();
              if (!text) return;
              void handleText(text);
            }}
          >
            <label htmlFor="typed-line" className="block text-sm font-medium">
              Or type your line
            </label>
            <p id="typed-line-help" className="mt-1 text-sm text-[--muted]">
              Plain words or LaTeX both work, for example "two x equals eight".
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <input
                id="typed-line"
                type="text"
                value={typed}
                aria-describedby="typed-line-help"
                onChange={(e) => setTyped(e.target.value)}
                className="min-h-[48px] flex-1 rounded-lg border border-[--line] bg-[--surface] px-4 text-[--fg]"
              />
              <button type="submit" className="btn" disabled={busy || !typed.trim()}>
                Add line
              </button>
            </div>
          </form>
        </section>
      )}

      <p role="status" className="mt-4 min-h-[1.5rem] text-[--muted]">
        {busy && 'Working…'}
      </p>

      {error && (
        <p className="mt-2 rounded-lg border border-[--warn] px-4 py-3 text-[--warn]">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" className="btn" onClick={readAll}>
          Read my work
        </button>
        <button type="button" className="btn" onClick={undo}>
          Undo delete
        </button>
        <button type="button" className="btn" onClick={onExport}>
          Hand in my work
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Back to the problem
        </button>
      </div>

      <MathExports lines={lines} />

      {clarify && (
        <ClarifyDialog
          question={clarify.question}
          alternatives={clarify.alternatives}
          onChoose={(choice) => {
            setClarify(null);
            // The student has told us which grouping they meant, so this is
            // theirs now — it goes straight to the readback to be confirmed.
            // The option carries its own `valid`: an alternative SymPy could
            // not read is still offered, and saving it marks the line unsure
            // rather than silently claiming it was checked.
            setPending({
              latex: choice.latex,
              readback: choice.readback,
              valid: choice.valid,
            });
            announce(`You chose: ${choice.readback}. Enter to save, E to edit.`);
          }}
          onCancel={() => {
            setClarify(null);
            announce('Cancelled. Say the line again, or type it.');
          }}
        />
      )}
    </main>
  );
}
