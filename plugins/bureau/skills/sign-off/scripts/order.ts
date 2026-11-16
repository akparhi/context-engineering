/** How a plan's units start and merge. A unit starts with the others unless `startsAfter` names units whose contract is not fixed
 *  yet; `mergesAfter` orders pull requests and never delays a start. No zod and no Node APIs here: `check` and the page both run it. */
export type OrderedUnit = { id: string; tasks?: number; mergesAfter?: string[]; startsAfter?: { units: string[]; reason: string } };
/** `starts` and `merges` are levels: every unit in a level goes together, after the level before it. `critical` is the chain of
 *  merges that takes longest, counted in tasks when every unit gives them and in units otherwise. */
export type UnitOrder = { starts: string[][]; merges: string[][]; critical: string[] };

const startsAfter = (u: OrderedUnit) => u.startsAfter?.units ?? [];
const comesAfter = (u: OrderedUnit) => [...(u.mergesAfter ?? []), ...startsAfter(u)];

/** The ids of one cycle in `waitsOn` in the order they name each other, or null when there is none. An id with no entry waits on nothing. */
export function cycleIn(waitsOn: Map<string, string[]>): string[] | null {
  const cleared = new Set<string>();
  const walk = (id: string, path: string[]): string[] | null => {
    if (path.includes(id)) return path.slice(path.indexOf(id));
    const before = waitsOn.get(id);
    if (!before || cleared.has(id)) return null;
    for (const next of before) {
      const cycle = walk(next, [...path, id]);
      if (cycle) return cycle;
    }
    cleared.add(id);
    return null;
  };
  for (const id of waitsOn.keys()) {
    const cycle = walk(id, []);
    if (cycle) return cycle;
  }
  return null;
}

/** The units of one cycle through `mergesAfter` and `startsAfter`, or null when there is none. */
export const unitCycle = (units: OrderedUnit[]): string[] | null => cycleIn(new Map(units.map((u) => [u.id, comesAfter(u)])));

/** The pull requests of one cycle, or null when there is none. A pull request merges after those its `after` names and those that
 *  ship a unit its own units wait on, the order the Pull requests part draws. */
export function prCycle(prs: { id: string; after?: string[]; steps: string[] }[], units: OrderedUnit[]): string[] | null {
  const waits = new Map(units.map((u) => [u.id, comesAfter(u)]));
  const shippedIn = (unit: string) => prs.filter((p) => p.steps.includes(unit)).map((p) => p.id);
  return cycleIn(new Map(prs.map((p) => [p.id, [
    ...(p.after ?? []),
    ...p.steps.flatMap((step) => waits.get(step) ?? []).flatMap(shippedIn).filter((id) => id !== p.id),
  ]])));
}

/** Topological levels: a unit sits one level past the latest unit `before` names for it. The units must hold no cycle. */
function levels(units: OrderedUnit[], before: (u: OrderedUnit) => string[]): string[][] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const level = new Map<string, number>();
  const levelOf = (u: OrderedUnit): number => {
    const known = level.get(u.id);
    if (known !== undefined) return known;
    const l = Math.max(-1, ...before(u).flatMap((id) => { const b = byId.get(id); return b ? [levelOf(b)] : []; })) + 1;
    level.set(u.id, l);
    return l;
  };
  const out: string[][] = [];
  for (const u of units) (out[levelOf(u)] ??= []).push(u.id);
  return out;
}

/** The start waves, the merge order and the critical path, or null when the units hold a cycle, which `check` fails. */
export function unitOrder(units: OrderedUnit[]): UnitOrder | null {
  if (unitCycle(units)) return null;
  const byId = new Map(units.map((u) => [u.id, u]));
  const weigh = units.every((u) => u.tasks !== undefined) ? (u: OrderedUnit) => u.tasks ?? 0 : () => 1;
  const merges = levels(units, comesAfter);
  const longest = new Map<string, { weight: number; path: string[] }>();
  for (const id of merges.flat()) {
    const unit = byId.get(id)!;
    const tail = comesAfter(unit).flatMap((b) => longest.get(b) ?? []).reduce((a, b) => (b.weight > a.weight ? b : a), { weight: 0, path: [] });
    longest.set(id, { weight: tail.weight + weigh(unit), path: [...tail.path, id] });
  }
  const critical = [...longest.values()].reduce((a, b) => (b.weight > a.weight ? b : a), { weight: 0, path: [] }).path;
  return { starts: levels(units, startsAfter), merges, critical };
}
