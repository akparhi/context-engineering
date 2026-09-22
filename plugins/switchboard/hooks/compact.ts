import type { EngineInterface, Register } from 'claude-code';

export const register = (
  on: Parameters<Register>[0],
  _options: Parameters<Register>[1],
  agentModels: ReadonlyMap<string, string> = new Map(),
) => {
  on('session.compact', async ($, event, next) => {
    return next(event);
  });
};

/** The main model is never evidence of a child's provider. */
export async function compactionModel(
  $: EngineInterface,
  agentId: string | undefined,
  agentModels: ReadonlyMap<string, string>,
): Promise<string | undefined> {
  return agentId ? agentModels.get(agentId) : $.session.model();
}
