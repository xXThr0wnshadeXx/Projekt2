// The front-end copy of the command rules matches the server's (issue #128).
// tests/fixtures/commands.json is checked against both; tests/test_command.py
// does the server side. No browser needed.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseCommand } from '../../frontend/src/commands';

// Playwright runs from the repository root (playwright.config.ts).
const fixture = JSON.parse(readFileSync('tests/fixtures/commands.json', 'utf8')) as { cases: { text: string; current: number | null; line_count: number; expected: unknown }[] };

test('@smoke the front-end command rules match the server on every shared case', () => {
  expect(fixture.cases.length).toBeGreaterThan(30);
  for (const c of fixture.cases) {
    expect(parseCommand(c.text, c.current, c.line_count), c.text).toEqual(c.expected);
  }
});
