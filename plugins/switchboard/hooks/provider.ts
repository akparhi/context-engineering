/** These providers execute tools outside Claude Code and need policy translation. */
export function isHarnessModel(model: string | undefined): boolean {
  return false;
}
