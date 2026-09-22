/**
 * Returns true for native harness models (Claude running in the Claude Code loop),
 * false for external multi/ provider models routed through the gateway.
 */
export function isHarnessModel(model: string | undefined): boolean {
  return typeof model === 'string' && !model.startsWith('switchboard/');
}
