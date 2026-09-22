import { expect, test } from 'bun:test';
import { budgetEffort, isEffort } from '../src/providers/codex/responses.ts';

test('effort levels stop at high', () => {
  expect(isEffort('none')).toBe(true);
  expect(isEffort('high')).toBe(true);
  expect(isEffort('xhigh')).toBe(false);
  expect(isEffort('max')).toBe(false);
  expect(isEffort('ultra')).toBe(false);
});

test('a budget above the high band clamps to high, never xhigh', () => {
  expect(budgetEffort({ type: 'enabled', budget_tokens: 100000 })).toBe('high');
});

test('disabled thinking maps to none', () => {
  expect(budgetEffort({ type: 'disabled' })).toBe('none');
});

test('the documented bands are unchanged below the cap', () => {
  expect(budgetEffort(undefined)).toBe('medium');
  expect(budgetEffort({ type: 'enabled', budget_tokens: 1024 })).toBe('low');
  expect(budgetEffort({ type: 'enabled', budget_tokens: 8192 })).toBe('medium');
  expect(budgetEffort({ type: 'enabled', budget_tokens: 24576 })).toBe('high');
});
