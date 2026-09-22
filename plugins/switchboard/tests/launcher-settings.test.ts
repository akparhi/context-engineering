import { expect, test } from 'bun:test';
import { launchSettings, launcherArguments } from '../src/launcher.ts';

test('settings carry exactly the catalog rows', () => {
  expect(launchSettings().modelPicker.options).toHaveLength(9);
});

test('launcher supplies settings and agents before caller args', () => {
  const args = launcherArguments(['--resume', 'abc'], '/tmp/s.json', '{}');
  expect(args.slice(0, 4)).toEqual(['--settings', '/tmp/s.json', '--agents', '{}']);
  expect(args).toContain('--resume');
  expect(args).toContain('abc');
});
