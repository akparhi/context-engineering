import { rm } from 'node:fs/promises';

/** Remove a temporary directory created by mkdtemp, silently ignoring missing-path errors. */
export async function removeTemporary(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}
