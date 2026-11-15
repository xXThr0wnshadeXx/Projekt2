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
import { announce, focusFirst, lastAnnouncement } from '../components/LiveRegion';
import { MathLine } from '../components/MathLine';
import { MathExports } from '../components/MathExports';
import { RecordButton } from '../components/RecordButton';
import { ReadbackBar } from '../components/ReadbackBar';
import { ClarifyDialog } from '../components/ClarifyDialog';
import {
  transcribe,
  spokenToLatex,
  command,
  validateLatex,
  ApiFailure,
  type SpokenAlternative,
} from '../api';
import { readTyped } from '../math/typed';
import { speechFor } from '../math/sre';
import { applyEdit, asksForCorrection, EDIT_REFUSAL, lineNumber, looksLikeCommand } from '../commands';
import { SAYS, stripFiller, understandTalk, type Talk } from '../talk';
import { helpText, useShortcuts } from '../shortcuts';
import type { Recording } from '../audio/recorder';
import { checkStep, stepChecksAllowed, withBasis } from '../stepCheck';
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
  // The answer to something the student asked, kept on screen. The live
  // region is heard, not seen, and a low-vision student with no screen reader
  // would otherwise ask a question and watch nothing happen.
  const [reply, setReply] = useState('');
  // What the step check said about each saved line, shown under it so a
  // low-vision student reading the screen gets it too. Not stored.
  const [checks, setChecks] = useState<Record<string, string>>({});
  // The work line the student is on (for commands like "delete that"), and
  // the line an edit will replace once the student confirms it (#24).
  const [current, setCurrent] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<string | null>(null);

  // "Undo" always means "put back the line I most recently removed", and can
  // be repeated. One level was not enough: by voice a misheard "delete line
  // two" is followed by a retry, and the second delete made the first line
  // unrecoverable.
  const undone = useRef<{ line: WorkLine; at: number }[]>([]);
  // A ref cannot drive the UI, and the Undo button must not be offered when
  // there is nothing to put back — a control that can only answer "there is
  // nothing to undo" is a dead end for someone moving by Tab.
  const [canUndo, setCanUndo] = useState(false);
  // The most recent thing the student did, so a slow step-check result can
  // tell whether it is still the news.
  const lastAction = useRef<string>('');
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    // Say which problem line the work follows from. The first step saved here
    // is checked against the line the student pressed S on, so without this
    // they can get "I couldn't confirm this step" for a correct step and have
    // no way to tell why — they were working from a line they had forgotten
    // they were on. Nobody can see which line is pinned; it has to be said.
    const following =
      problem.lines.length > 1 ? ` Following line ${startLine + 1} of the problem.` : '';
    announce(
      lines.length
        ? `Your work.${following} ${lines.length} ${lines.length === 1 ? 'line' : 'lines'} so far.`
        : `Your work.${following} Record a line, or type one.`,
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
    setReply('');
    try {
      // Prior lines give the model variable names only — never the problem's
      // answer, and never anything it could complete from.
      const context = [
        ...problem.lines.map((l) => l.latex),
        ...lines.map((l) => l.latex),
      ];
      let result;
      try {
        result = await spokenToLatex(text, context);
      } catch (e: unknown) {
        // The model is how plain words become math, but it is not the only
        // way a line can be read. With no server, or a server with no model
        // key, a line typed with ordinary symbols is read here instead, so the
        // student can always write their work. BAD_INPUT and UNPARSEABLE are
        // the server's considered answer about this line and are kept.
        const considered =
          e instanceof ApiFailure && (e.code === 'BAD_INPUT' || e.code === 'UNPARSEABLE');
        if (considered) throw e;
        await readHere(text);
        return;
      }

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
          ? e.code === 'UNPARSEABLE'
            ? `${e.message} ${SAYS.notMath}`
            : e.message
          : 'Something went wrong reading that line.',
      );
    } finally {
      setBusy(false);
    }
  }

  /** Read a typed line in the browser, with no model (math/typed.ts). */
  async function readHere(text: string) {
    const latex = readTyped(text);
    if (!latex) {
      fail(
        "I couldn't read that as math. Type it with symbols, for example 2x = 8, or (x+1)/2 = 5 with brackets.",
      );
      return;
    }
    const spoken = await speechFor(latex);
    if (spoken === null) {
      fail("I couldn't read that line as math. Check the brackets, then try again.");
      return;
    }
    // When the server cannot be asked, the line is still the student's own,
    // read by a strict grammar and typeset without error — flagging it
    // "could not fully read this line" would be a false alarm on their work.
    // Step checks need the server anyway, so nothing is claimed that is not so.
    const valid = (await validateLatex(latex)) ?? true;
    const readback = spoken || text;
    setPending({ latex, readback, valid });
    announce(`I read: ${readback}. Enter to save, E to edit.`);
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
    const checked = await checkStep(from.latex, entry.latex, mode);
    if (!checked) return;
    const verdict = withBasis(checked, basisFor(index));
    setChecks((prev) => ({ ...prev, [entry.id]: verdict }));
    // Only speak up if the student hasn't moved on. A late verdict must never
    // talk over "Deleted line 1" or a new readback.
    if (lastAction.current === entry.id) announce(verdict);
  }

  /** What the work line at `index` is checked against, in words. */
  function basisFor(index: number): string {
    return index > 0
      ? `your line ${index}`
      : `line ${Math.min(startLine, problem.lines.length - 1) + 1} of the problem`;
  }

  function remove(line: WorkLine, index: number) {
    lastAction.current = `remove:${line.id}`;
    undone.current.push({ line, at: index });
    setCanUndo(true);
    setLines((prev) => prev.filter((l) => l.id !== line.id));
    announce(`Deleted line ${index + 1}. Press U to undo.`);
  }

  function undo() {
    lastAction.current = 'undo';
    const last = undone.current.pop();
    if (!last) {
      announce('There is nothing to undo.');
      return;
    }
    const at = Math.min(last.at, lines.length);
    setLines((prev) => {
      const next = [...prev];
      next.splice(Math.min(last.at, next.length), 0, last.line);
      return next;
    });
    const left = undone.current.length;
    setCanUndo(left > 0);
    // The Undo button goes away with the last thing to undo. Left where it
    // was, focus would fall off the page; it goes to the line that came back.
    window.setTimeout(() => focusFirst(`#${last.line.id}`), 80);
    announce(
      left > 0
        ? `Put line ${at + 1} back. Press U again to put back another.`
        : `Put line ${at + 1} back.`,
    );
  }

  /** Math goes to spoken-to-LaTeX; a command goes to the command route. */
  async function handleText(heard: string) {
    // Plain talk gets a plain answer, decided by rules before anything is
    // sent anywhere (talk.ts). None of these answers is worked out from the
    // problem, so none of them can contain a step.
    const talk = understandTalk(heard);
    if (talk) {
      lastAction.current = 'talk';
      setError('');
      setTyped('');
      await answerTalk(talk);
      return;
    }
    // "Uh, okay, two x equals eight" is the line "two x equals eight".
    const text = stripFiller(heard);
    if (asksForCorrection(text)) {
      lastAction.current = 'talk';
      setError('');
      setReply(EDIT_REFUSAL);
      announce(EDIT_REFUSAL);
      return;
    }
    if (looksLikeCommand(text)) await runCommand(text);
    else await interpret(text);
  }

  async function answerTalk(talk: Talk) {
    // What was said before this question, for "say that again".
    const before = lastAnnouncement();
    const tell = (message: string) => {
      setReply(message);
      announce(message);
    };
    switch (talk.kind) {
      case 'greeting':
        tell(SAYS.greeting);
        return;
      case 'thanks':
        tell(SAYS.thanks);
        return;
      case 'repeat':
        tell(before || SAYS.nothingToRepeat);
        return;
      case 'describes':
        tell(SAYS.describes);
        return;
      case 'filler':
        tell(SAYS.filler);
        return;
      case 'refuse':
        tell(SAYS.refuse);
        return;
      case 'capabilities':
        tell(SAYS.capabilities);
        return;
      case 'define':
        // A human reader in an exam may not explain a word either.
        tell(mode === 'exam' ? SAYS.examNoMeanings : talk.meaning);
        return;
      case 'unknownTerm':
        tell(mode === 'exam' ? SAYS.examNoMeanings : SAYS.unknownTerm(talk.term));
        return;
      case 'status': {
        const following =
          problem.lines.length > 1 ? ` You are following line ${startLine + 1} of the problem.` : '';
        const last = lines[lines.length - 1];
        tell(
          last
            ? `You have written ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}. Line ${lines.length} is: ${last.readback}.${following}`
            : `You have not written any lines yet.${following}`,
        );
        return;
      }
      case 'readProblem': {
        const spoken = await Promise.all(problem.lines.map((l) => speechFor(l.latex)));
        const body = problem.lines
          .map((_, n) => `Line ${n + 1}. ${spoken[n] || 'This line could not be read aloud'}.`)
          .join(' ');
        tell(`The problem. ${problem.instructions} ${body}`.replace(/\s+/g, ' ').trim());
        return;
      }
    }
  }

  /** Carry out a voice or typed command (#24). Never changes math by itself:
   *  an edit lands in the edit box to be read back and confirmed. */
  async function runCommand(text: string) {
    lastAction.current = 'command';
    setBusy(true);
    setError('');
    setReply('');
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

    if (result.message) {
      setReply(result.message);
      announce(result.message);
      return;
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

    // The command has been understood and is about to be carried out; left in
    // the box it would be sent again by the next Enter. An edit fills the box
    // itself, and an unknown command stays so it can be corrected.
    if (result.intent !== 'edit' && result.intent !== 'unknown') setTyped('');

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
        announce(
          verdict
            ? `Line ${n}. ${withBasis(verdict, basisFor(n! - 1))}`
            : "I couldn't check that right now. Try again in a moment.",
        );
        return;
      }
      case 'export':
        onExport();
        return;
      case 'help': {
        const help = helpText('scratchpad');
        announce(help);
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
        announce(`I didn't catch that. ${SAYS.notMath}`);
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
      {/* On screen as well as announced: a low-vision student reading the page
          without a screen reader needs the same context, and it is the line
          their first step is checked against. */}
      {problem.lines.length > 1 && (
        <p className="mt-4 text-sm text-[--muted]">
          Following line {startLine + 1} of the problem.
        </p>
      )}

      <div className="mt-2">
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
              Symbols, plain words or LaTeX all work, for example 2x = 8 or "two x equals eight".
              You can also ask a question, such as "what can you do".
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <input
                id="typed-line"
                type="text"
                value={typed}
                aria-describedby="typed-line-help"
                onChange={(e) => setTyped(e.target.value)}
                className="min-h-[48px] min-w-0 flex-[1_1_12rem] rounded-lg border border-[--line] bg-[--surface] px-4 text-[--fg]"
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

      {reply && !error && (
        <p
          data-testid="glance-reply"
          className="mt-2 rounded-lg border border-[--line] bg-[--surface] px-4 py-3"
        >
          {reply}
        </p>
      )}

      {error && (
        <p className="mt-2 rounded-lg border border-[--warn] px-4 py-3 text-[--warn]">
          {error}
        </p>
      )}

      {/* Nothing is offered here that cannot act. With no lines written,
          reading the work back, handing it in and undoing a delete are all
          dead ends — and for someone moving by Tab a dead end costs the same
          as a real control. They appear as the work does. */}
      <div className="mt-8">
        {lines.length > 0 && (
          <button type="button" className="btn-primary" onClick={onExport}>
            Hand in my work
          </button>
        )}
        {/* Undo is offered whenever there is something to put back — also
            when the line just deleted was the only one, which is exactly when
            it is wanted most and when it used to disappear with the list. */}
        {(lines.length > 0 || canUndo) && (
          <div className="mt-6 flex flex-wrap gap-3">
            {lines.length > 0 && (
              <button type="button" className="btn" onClick={readAll}>
                Read my work
              </button>
            )}
            {canUndo && (
              <button type="button" className="btn" onClick={undo}>
                Undo delete
              </button>
            )}
          </div>
        )}

        <div
          className={
            lines.length > 0 || canUndo ? 'mt-6 border-t border-[--line] pt-4' : 'mt-2'
          }
        >
          {/* Named for where it goes, not "back" — "Show the problem" above
              opens it here beside the work, and two controls that both read as
              "the problem" is a guess the student should not have to make. */}
          <button type="button" className="btn-quiet" onClick={onBack}>
            Leave and read the problem again
          </button>
        </div>
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
