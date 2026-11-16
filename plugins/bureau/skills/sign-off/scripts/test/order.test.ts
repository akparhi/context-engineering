import { expect, test } from "bun:test";
import { prCycle, unitCycle, unitOrder } from "../order.ts";

const INS = [
  { id: "U0", tasks: 3 }, { id: "U1", tasks: 1 },
  { id: "U2", tasks: 8, mergesAfter: ["U0", "U1"] }, { id: "U3", tasks: 1, mergesAfter: ["U1", "U2"] },
];

test("units with fixed contracts start in one wave, and merge in the order their links give", () => {
  expect(unitOrder(INS)).toEqual({ starts: [["U0", "U1", "U2", "U3"]], merges: [["U0", "U1"], ["U2"], ["U3"]], critical: ["U0", "U2", "U3"] });
});

test("a unit in startsAfter starts a wave later and merges later too", () => {
  const units = INS.map((u) => (u.id === "U2" ? { ...u, mergesAfter: ["U1"], startsAfter: { units: ["U0"], reason: "U0 picks the column names." } } : u));
  expect(unitOrder(units)).toEqual({ starts: [["U0", "U1", "U3"], ["U2"]], merges: [["U0", "U1"], ["U2"], ["U3"]], critical: ["U0", "U2", "U3"] });
});

test("the critical path counts units when any unit gives no tasks", () => {
  const units = [{ id: "A", tasks: 9 }, { id: "B" }, { id: "C", mergesAfter: ["B"] }];
  expect(unitOrder(units)?.critical).toEqual(["B", "C"]);
});

test("a cycle across both fields is named, and gives no order", () => {
  const units = [{ id: "A", mergesAfter: ["B"] }, { id: "B", startsAfter: { units: ["A"], reason: "A fixes the shape." } }, { id: "C" }];
  expect(unitCycle(units)).toEqual(["A", "B"]);
  expect(unitOrder(units)).toBeNull();
  expect(unitCycle(INS)).toBeNull();
});

test("pull requests that merge after each other are a cycle, through \`after\` or through the order of their units", () => {
  const pr = (id: string, steps: string[], after?: string[]) => ({ id, steps, after });
  expect(prCycle([pr("P1", ["U0"], ["P3"]), pr("P2", ["U1"], ["P1"]), pr("P3", ["U2"], ["P2"])], INS)).toEqual(["P1", "P3", "P2"]);
  expect(prCycle([pr("P1", ["U0", "U3"]), pr("P2", ["U1", "U2"])], INS)).toEqual(["P1", "P2"]);
  expect(prCycle([pr("P1", ["U0", "U1"]), pr("P2", ["U2", "U3"], ["P1"])], INS)).toBeNull();
});
