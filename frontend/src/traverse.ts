// The whole page, one line at a time (issue #236).
//
// There is no scrolling. Up and Down (or Left and Right) move through
// everything a person would read or use, in page order: headings, text, maths
// lines, buttons, links and text boxes. The line you are on is highlighted,
// kept in view, and said as you land on it. Space presses a button or link,
// and reads anything else aloud.
//
// Some things keep their own keys, because taking them would break them: text
// boxes (Left and Right move the caret; Up and Down leave the box), the
// equation explorer, radio groups, and any open dialog.

import { useEffect } from 'react';
import { announceMove } from './components/LiveRegion';
import { readAloud } from './lineKeys';
import { spokenMath } from './math/sre';

const CONTROL = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"]';
const MATH_LINE = '[data-testid^="math-line-"]';
const HEADING = 'h1, h2, h3, h4, h5, h6';
const CURRENT = 'glance-current';
/** Never stops, and never read: hidden, visually hidden, live regions, the
 *  skip link (the keys make it unnecessary), and MathJax's own internals. */
const SKIP = '[hidden], [aria-hidden="true"], .sr-only, .skip-link, [data-testid^="live-"], script, style, noscript';

let current: Element | null = null;

function hasBox(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function shown(el: Element): boolean {
  return !el.closest(SKIP) && hasBox(el);
}

/** The block a piece of inline text belongs to, so a sentence with a bold
 *  word or a key label in it is one line, not several. */
function blockOf(el: Element, root: Element): Element {
  let node: Element | null = el;
  while (node && node !== root) {
    const display = getComputedStyle(node).display;
    if (display !== 'inline' && display !== 'contents') return node;
    node = node.parentElement;
  }
  return el;
}

/** The stop a text node belongs to: its maths line, its control, or else the
 *  nearest block containing it. */
function stopFor(text: Text, root: Element): Element | null {
  const parent = text.parentElement;
  if (!parent || parent.closest(SKIP)) return null;
  const math = parent.closest(MATH_LINE);
  if (math) return math;
  // MathJax output outside a maths line (a preview, say) is read as one piece.
  const mjx = parent.closest('mjx-container');
  if (mjx) return blockOf(mjx, root);
  const control = parent.closest(CONTROL);
  if (control) return control;
  return blockOf(parent, root);
}

/** Every line on the page, in reading order: every piece of visible text,
 *  plus controls that have no text of their own (icon buttons, text boxes). */
export function lines(root: Element = document.body): Element[] {
  const found = new Set<Element>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue?.trim()) continue;
    const stop = stopFor(n as Text, root);
    if (stop && shown(stop)) found.add(stop);
  }
  for (const el of root.querySelectorAll(`${CONTROL}, ${MATH_LINE}`)) {
    if (el.parentElement?.closest(MATH_LINE)) continue;
    if (shown(el)) found.add(el);
  }
  return Array.from(found).sort((a, b) =>
    a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
}

const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

function nameOf(el: Element): string {
  return clean(el.getAttribute('aria-label')) || clean(el.textContent);
}

/** The text that belongs to this line and to no line inside it, so a box
 *  holding loose text and its own paragraphs never reads them twice. */
function ownText(el: Element): string {
  const root = document.body;
  const parts: string[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue?.trim()) continue;
    if (stopFor(n as Text, root) === el) parts.push(n.nodeValue);
  }
  // Text nodes carry their own spacing; joining with spaces would put one
  // before every full stop that follows a bold word or a key label.
  return clean(parts.join(''));
}

/** What is said on arriving at a line. */
export function describe(el: Element): string {
  if (el.matches(MATH_LINE)) {
    const label = clean(el.getAttribute('aria-label')).replace(/, unsure$/, '');
    const unsure = /, unsure$/.test(el.getAttribute('aria-label') ?? '');
    const group = el.closest('section, ol, ul, main') ?? document;
    const total = Array.from(group.querySelectorAll(MATH_LINE)).filter(shown).length;
    return `${label} of ${total}${unsure ? ', unsure' : ''}.`;
  }
  if (el.matches('input, select, textarea')) {
    const field = el as HTMLInputElement;
    const label = clean(field.labels?.[0]?.textContent) || clean(el.getAttribute('aria-label')) || clean(field.placeholder);
    const kind = el.matches('select') ? 'list' : field.type === 'checkbox' ? 'check box' : field.type === 'radio' ? 'option' : 'text box';
    return `${label}, ${kind}.`;
  }
  if (el.matches('summary')) {
    const open = el.parentElement instanceof HTMLDetailsElement && el.parentElement.open;
    return `${nameOf(el)}, ${open ? 'expanded' : 'collapsed'}.`;
  }
  if (el.matches('a[href]')) return `${nameOf(el)}, link.`;
  if (el.matches('button, [role="button"]')) return `${nameOf(el)}, button.`;
  if (el.matches(HEADING)) return `Heading. ${nameOf(el)}`;
  return ownText(el) || clean(el.getAttribute('aria-label')) || clean(el.textContent);
}

function highlight(el: Element | null): void {
  if (current && current !== el) current.classList.remove(CURRENT);
  current = el;
  el?.classList.add(CURRENT);
}

/** The line containing `node`, if any. Lines can nest (a label holds its radio
 *  button and its description), and the list is in document order with the
 *  container first, so the last match is the innermost. Taking the first would
 *  send Down from a nested line back to the container's next line, forever. */
function lineOf(node: Element | null, list: Element[]): Element | null {
  if (!node) return null;
  let found: Element | null = null;
  for (const l of list) if (l === node || l.contains(node)) found = l;
  return found;
}

function go(el: Element): void {
  if (!el.matches(CONTROL) && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  (el as HTMLElement).focus({ preventScroll: true });
  // The app scrolls, never the student.
  el.scrollIntoView({ block: 'center' });
  highlight(el);
  announceMove(describe(el));
}

/** Move `delta` lines through the page, saying the line arrived at. */
export function move(delta: number): void {
  const list = lines();
  if (!list.length) return;
  const at = lineOf(current && document.contains(current) ? current : document.activeElement, list);
  const from = at ? list.indexOf(at) : delta > 0 ? -1 : list.length;
  const to = from + delta;
  if (to < 0) {
    announceMove('Top of the page.');
    return;
  }
  if (to >= list.length) {
    announceMove('End of the page.');
    return;
  }
  go(list[to]);
}

/** Space: press a button or link, read anything else aloud. */
export function activate(): void {
  const list = lines();
  const el = lineOf(current && document.contains(current) ? current : document.activeElement, list);
  if (!el) return;
  if (el.matches('button, a[href], summary, [role="button"]')) {
    (el as HTMLElement).click();
    return;
  }
  if (el.matches('input, select, textarea')) {
    (el as HTMLElement).focus();
    return;
  }
  if (el.matches(MATH_LINE)) {
    const label = clean(el.getAttribute('aria-label'));
    const spoken = spokenMath(el);
    readAloud(spoken ? `${label}. ${spoken}` : `${label} is not ready to read yet.`);
    return;
  }
  readAloud(describe(el));
}

const TEXT_INPUT = /^(?:text|search|email|url|tel|number|password)$/;

/** The page-wide keys. Off in low-vision mode, which has its own. */
export function useTraversal(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('mjx-container, [role="dialog"]')) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (target?.closest('textarea, select, [contenteditable]')) return;
      const input = target instanceof HTMLInputElement ? target : null;
      // A radio group keeps Left and Right to choose within it, but Up and
      // Down walk on, or the arrows could never leave the group.
      const tickable = input && (input.type === 'radio' || input.type === 'checkbox');
      if (tickable && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        move(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (input && !TEXT_INPUT.test(input.type)) return;
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          e.preventDefault();
          move(e.key === 'ArrowDown' ? 1 : -1);
          return;
        case 'ArrowRight':
        case 'ArrowLeft':
          if (input) return; // the caret
          e.preventDefault();
          move(e.key === 'ArrowRight' ? 1 : -1);
          return;
        case ' ':
          if (input || e.repeat) return;
          // Space already presses a focused button or link.
          if (target?.closest('button, a[href], summary, [role="button"]')) {
            highlight(lineOf(target, lines()));
            return;
          }
          e.preventDefault();
          activate();
          return;
        default:
      }
    }

    // Tab, a click, or a screen focusing its heading moves the pointer too,
    // so the highlight is always where the student is.
    function onFocus(e: FocusEvent) {
      const target = e.target instanceof Element ? e.target : null;
      const line = lineOf(target, lines());
      if (line) highlight(line);
    }

    window.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      highlight(null);
    };
  }, [enabled]);
}
