import { expect, test } from '@playwright/test';
import { applyEdit } from '../../frontend/src/commands';

test('spoken edits match complete math tokens', () => {
  expect(applyEdit('12+x', 'replace one with three')).toBeNull();
  expect(applyEdit(String.raw`\exp(y)`, 'replace x with z')).toBeNull();
  expect(applyEdit(String.raw`\exp(x)`, 'replace x with z')).toBe(String.raw`\exp(z)`);
  expect(applyEdit('x+x', 'replace x with y')).toBeNull();
  expect(applyEdit('2x=8', 'replace two with four')).toBe('4x=8');
  expect(applyEdit('1.2+x', 'replace one with three')).toBeNull();
});
