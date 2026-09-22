import { expect, test } from 'bun:test';
import { CATALOG, pickerRows, workerDefinitions } from '../src/catalog.ts';

test('every entry yields a bare row plus one row per effort', () => {
  const rows = pickerRows();
  expect(rows.map((row) => row.model)).toEqual([
    'switchboard/openai/gpt-5.6-sol',
    'switchboard/openai/gpt-5.6-sol-low',
    'switchboard/openai/gpt-5.6-luna',
    'switchboard/openai/gpt-5.6-luna-none',
    'switchboard/openai/gpt-5.6-luna-low',
    'switchboard/openai/gpt-5.6-luna-medium',
    'switchboard/openai/gpt-6-astra',
    'switchboard/openai/gpt-6-astra-low',
    'switchboard/zen/deepseek-v4.1-flash',
  ]);
});

test('a model with no effort dial takes the haiku profile', () => {
  const rows = pickerRows();
  const deepseek = rows.find((row) => row.model.endsWith('deepseek-v4.1-flash'));
  expect(deepseek?.behavesAs).toBe('claude-haiku-4-5');
  const luna = rows.find((row) => row.model.endsWith('gpt-5.6-luna'));
  expect(luna?.behavesAs).toBe('claude-sonnet-4-6');
});

test('every row carries a hand-written description', () => {
  for (const row of pickerRows()) {
    expect(row.description.length).toBeGreaterThan(10);
  }
});

test('workers mirror the picker rows and pin their model', () => {
  const workers = workerDefinitions();
  expect(Object.keys(workers)).toContain('openai-luna-none');
  expect(workers['openai-luna-none'].model).toBe('switchboard/openai/gpt-5.6-luna-none');
  expect(workers['openai-luna-none'].effort).toBe('none');
  expect(workers['openai-luna'].effort).toBeUndefined();
});

test('a bare worker carries no effort so Claude Code decides', () => {
  expect(workerDefinitions()['openai-sol'].effort).toBeUndefined();
});

test('catalog is the single source of exposure', () => {
  expect(CATALOG.map((entry) => entry.id)).toEqual([
    'gpt-5.6-sol',
    'gpt-5.6-luna',
    'gpt-6-astra',
    'deepseek-v4.1-flash',
  ]);
});
