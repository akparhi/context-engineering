import { expect, test } from 'bun:test';
import { DEFAULT_COMMAND, MANAGEMENT_COMMAND, installationDirectory } from '../src/install/installation.ts';

test('the installer brands itself switchboard', () => {
  expect(DEFAULT_COMMAND).toBe('switchboard');
  expect(MANAGEMENT_COMMAND).toBe('switchboard-ctl');
  expect(installationDirectory('/home/u')).toBe('/home/u/.local/share/switchboard');
});
