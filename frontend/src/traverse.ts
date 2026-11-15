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
import { announce } from './components/LiveRegion';
import { readAloud } from './lineKeys';
import { spokenMath } from './math/sre';

const CONTROL = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"]';
const MATH_LINE = '[data-testid^="math-line-"]';
const TEXT = 'h1, h2, h3, h4, h5, h6, p, li, dt, dd, figcaption, th, td';
const CURRENT = 'glance-current';

let current: Element | null = null;

function shown(el: Element): boolean {
  if (el.closest('[hidden], [aria-hidden="true"], .sr-only, .skip-link, [data-testid^="live-"], mjx-container')) {
    return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** Every line on the page, in reading order. */
export function lines(root: ParentNode = document): Element[] {
  const out: Element[] = [];
  for (const el of root.querySelectorAll(`${MATH_LINE}, ${CONTROL}, ${TEXT}`)) {
    if (!shown(el)) continue;
    if (el.matches(MATH_LINE)) {
      out.push(el);
      continue;
    }
    // A maths line is one stop: nothing inside it is a stop of its own.
    if (el.parentElement?.closest(MATH_LINE)) continue;
    if (el.matches(CONTROL)) {
      out.push(el);
      continue;
    }
    // Text: only the innermost, and never text that is part of a control.
    if (el.closest(CONTROL)) continue;
    if (el.querySelector(`${CONTROL}, ${MATH_LINE}, ${TEXT}`)) continue;
    if (!el.textContent?.trim()) continue;
    out.push(el);
  }
  return out;
}

const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

function nameOf(el: Element): string {
  return clean(el.getAttribute('aria-label')) || clean(el.textContent);
}

/** What is said on arriving at a line. */
export function describe(el: Element): string {
  if (el.matches(MATH_LINE)) {
    const label = clean(el.getAttribute('aria-label')).replace(/, unsure$/, '');
    const unsure = /, unsure$/.test(el.getAttribute('aria-label') ?? '');
    const group = el.closest('section, ol, ul, main') ?? document;
    const all = Array.from(group.querySelectorAll(MATH_LINE)).filter(shown);
    const total = all.length;
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
  if (el.matches('h1, h2, h3, h4, h5, h6')) return `Heading. ${nameOf(el)}`;
  return clean(el.textContent);
}

function highlight(el: Element | null): void {
  if (current && current !== el) current.classList.remove(CURRENT);
  current = el;
  el?.classList.add(CURRENT);
}

/** The line containing `node`, if any. */
function lineOf(node: Element | null, list: Element[]): Element | null {
  if (!node) return null;
  return list.find((l) => l === node || l.contains(node)) ?? null;
}

function go(el: Element): void {
  if (!el.matches(CONTROL) && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  (el as HTMLElement).focus({ preventScroll: true });
  // The app scrolls, never the student.
  el.scrollIntoView({ block: 'center' });
  highlight(el);
  announce(describe(el));
}

/** Move `delta` lines through the page, saying the line arrived at. */
export function move(delta: number): void {
  const list = lines();
  if (!list.length) return;
  const at = lineOf(current && document.contains(current) ? current : document.activeElement, list);
  const from = at ? list.indexOf(at) : delta > 0 ? -1 : list.length;
  const to = from + delta;
  if (to < 0) {
    announce('Top of the page.');
    return;
  }
  if (to >= list.length) {
    announce('End of the page.');
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
      if (input && !TEXT_INPUT.test(input.type)) return; // radios and the like keep their arrows
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
