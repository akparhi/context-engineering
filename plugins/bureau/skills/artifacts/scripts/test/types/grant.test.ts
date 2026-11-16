import { expect, test } from "bun:test";
import grant from "../../types/grant.ts";
import { fixtureData, noFiles } from "../helpers.ts";

test("the fixture's grant parses unchanged and is the grant fact", () => {
  const { allow, ask, clearance } = fixtureData("grant");
  const data = grant.schema.parse({ allow, ask, clearance });
  expect(data).toEqual({ allow, ask, clearance });
  expect(grant.facts?.(data, noFiles)).toEqual({ grant: { allow, ask, clearance } });
});
