// Arrows and Space on every screen (#239).
//
// The problem and the scratchpad give the arrows to their lines (lineKeys.ts).
// Every other screen gives them to its controls: Down or Right moves to the
// next button, link or box, Up or Left to the previous one, and Glance says
// what it landed on. Space presses a button, as it always does. A tap of
// Space with nothing to press says where you are and what to do.
//
// One more rule holds everywhere, including the problem and the scratchpad:
// Up and Down leave a one-line text box. Left and Right stay with the box so
// the caret still moves, but nobody gets stuck in a field they can't see.

import { useEffect } from 'react';
import { shouldIgnore } from './shortcuts';
import { isPressable, readAloud } from './lineKeys';

const FOCUSABLE = [
  'button:not([disabled])',
  'a[href]',
  'summary',
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex="0"]',
].join(', ');

/** Text boxes where Up and Down have no job of their own. */
const ONE_LINE_TEXT = new Set(['text', 'search', 'email', 'url', 'tel', 'number', 'password', '']);

function isOneLineTextBox(el: Element | null): el is HTMLInputElement {
  return (
    el instanceof HTMLInputElement &&
    ONE_LINE_TEXT.has(el.getAttribute('type') ?? '') &&
    el.getAttribute('role') !== 'combobox'
  );
}

function isVisible(el: HTMLElement): boolean {
  if (el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  // A control inside a closed <details> is not reachable, except its summary.
  const details = el.closest('details');
  if (details && !details.open && el.tagName !== 'SUMMARY') return false;
  return el.getClientRects().length > 0;
}

/** Every control a student can reach, in reading order. */
export function controls(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
}

function textOf(id: string): string {
  return document.getElementById(id)?.textContent?.trim() ?? '';
}

/** What a control is called, said the way a screen reader would say it. */
export function describe(el: HTMLElement): string {
  const labelledBy = el.getAttribute('aria-labelledby');
  let name =
    el.getAttribute('aria-label') ??
    (labelledBy ? labelledBy.split(/\s+/).map(textOf).join(' ') : '');
  if (!name && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
    name = el.labels?.[0]?.textContent ?? el.getAttribute('placeholder') ?? '';
  }
  if (!name) name = el.textContent ?? '';
  name = name.replace(/\s+/g, ' ').trim();

  let role = '';
  if (el.matches('button, summary, [role="button"]')) role = 'button. Space to press';
  else if (el.matches('a[href]')) role = 'link. Space to open';
  else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    role = `check box, ${el.checked ? 'on' : 'off'}`;
  } else if (el instanceof HTMLInputElement && el.type === 'radio') {
    role = `${el.checked ? 'selected' : 'not selected'}`;
  } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const value = el.value.trim();
    role = value ? `text box, contains ${value}` : 'text box, empty. Type, or press Down to move on';
  } else if (el instanceof HTMLSelectElement) role = 'list';
  return role ? `${name}, ${role}.` : `${name}.`;
}

/** Move focus `step` controls on from the focused one and say where it went. */
export function moveFocus(step: 1 | -1): void {
  const list = controls();
  if (list.length === 0) return;
  const active = document.activeElement;
  const at = list.findIndex((el) => el === active || el.contains(active));
  let next: number;
  let edge = '';
  if (at === -1) next = step === 1 ? 0 : list.length - 1;
  else {
    next = at + step;
    if (next < 0 || next >= list.length) {
      next = at;
      edge = step === 1 ? 'Last item. ' : 'First item. ';
    }
  }
  const el = list[next];
  el.focus();
  el.scrollIntoView?.({ block: 'nearest' });
  readAloud(edge + describe(el));
}

export interface ControlKeys {
  /** Arrows walk the controls. Off where the arrows walk lines instead. */
  walk: boolean;
  /** What a tap of Space says when nothing is focused that Space can press. */
  guide: string;
}

export function useControlKeys({ walk, guide }: ControlKeys): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;

      // Up and Down out of a one-line text box, on every screen.
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isOneLineTextBox(target)) {
        e.preventDefault();
        moveFocus(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }

      // A radio or check box would otherwise trap the arrows in its group;
      // here they walk on to the next control, and Space still ticks it.
      const tickable =
        target instanceof HTMLInputElement && (target.type === 'radio' || target.type === 'checkbox');
      if (!walk || (shouldIgnore(e) && !tickable)) return;
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          moveFocus(1);
          return;
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          moveFocus(-1);
          return;
        case ' ':
          if (e.repeat || tickable || isPressable(target)) return;
          e.preventDefault();
          readAloud(guide);
          return;
        default:
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [walk, guide]);
}
