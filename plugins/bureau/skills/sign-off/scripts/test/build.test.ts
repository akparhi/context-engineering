import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build, BuildError, DATA_BLOCK, embed, type PageData } from "../build.ts";
import type { ErdLayout } from "../layout/erd.ts";

const FIXTURE = resolve(import.meta.dir, "../../fixtures/plan");
const TEMPLATE = readFileSync(resolve(import.meta.dir, "../../viewer/viewer.gen.html"), "utf8");
const SLOW = 60_000;
/** Closes the data block and the page's style, then runs code that a test can see. */
const HOSTILE = "</script><script>window.__signOffPwned = 1; fetch('/review', { method: 'POST' })</script></style>";

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

type Json = Record<string, any>;
/** A fresh copy of the fixture inside a workspace folder, so a test can give it a `.claude/sign-off.config.json`. */
function plan(edit: { json?: (m: Json) => void; files?: Record<string, (text: string) => string> } = {}) {
  const root = mkdtempSync(join(tmpdir(), "sign-off-build-"));
  dirs.push(root);
  const dir = join(root, "plan");
  cpSync(FIXTURE, dir, { recursive: true });
  if (edit.json) {
    const m = JSON.parse(readFileSync(join(dir, "sign-off.json"), "utf8"));
    edit.json(m);
    writeFileSync(join(dir, "sign-off.json"), JSON.stringify(m, null, 2));
  }
  for (const [path, change] of Object.entries(edit.files ?? {})) writeFileSync(join(dir, path), change(readFileSync(join(dir, path), "utf8")));
  return { root, dir };
}
function theme(root: string, css: string) {
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude/sign-off.config.json"), JSON.stringify({ theme: "sign-off.theme.css" }));
  writeFileSync(join(root, ".claude/sign-off.theme.css"), css);
}
const dataOf = (page: string): PageData =>
  JSON.parse(page.match(/<script type="application\/json" id="sign-off-data">([^<]*)<\/script>/)![1]);
const erdOf = (data: PageData) => Object.values(data.blocks).find((b) => b.view === "erd")!.layout as ErdLayout;
const count = (text: string, needle: string) => text.split(needle).length - 1;

/** The fixture with hostile text in the plan's own words, in a source file, and in a column comment the catalog reads back. */
const hostilePlan = () => plan({
  json: (m) => { m.ask = `${m.ask} ${HOSTILE}`; m.items[0].why = HOSTILE; },
  files: {
    "design/schema.dbml": (t) => `${t}\n// ${HOSTILE}\n`,
    "design/db.sql": (t) => `${t}\ncomment on column book_holds.status is '${HOSTILE.replaceAll("'", "''")}';\n`,
  },
});

describe("build", () => {
  test("two copies of the fixture build to the same bytes", async () => {
    const a = plan(), b = plan();
    const first = readFileSync(await build(a.dir), "utf8");
    expect(readFileSync(await build(b.dir), "utf8")).toBe(first);
    expect(readFileSync(await build(a.dir), "utf8")).toBe(first);
  }, SLOW);

  test("refuses a plan that check fails", async () => {
    const { dir } = plan({ files: { "design/db.sql": (t) => `${t}\ncreate table broken (;\n` } });
    await expect(build(dir)).rejects.toThrow(/check failed:\n\s+ddl:/);
    expect(existsSync(join(dir, "sign-off.html"))).toBe(false);
  }, SLOW);

  test("hostile plan text, source text and theme stay inert", async () => {
    const { root, dir } = hostilePlan();
    theme(root, `--brand: oklch(0.6 0.2 260); ${HOSTILE}`);
    await expect(build(dir)).rejects.toThrow(BuildError);
    expect(existsSync(join(dir, "sign-off.html"))).toBe(false);

    rmSync(join(root, ".claude"), { recursive: true });
    const page = readFileSync(await build(dir), "utf8");
    expect(count(page, "<script")).toBe(count(TEMPLATE, "<script"));
    expect(count(page, "</style>")).toBe(count(TEMPLATE, "</style>"));
    const data = dataOf(page);
    expect(data.manifest.ask.endsWith(HOSTILE)).toBe(true);
    expect(data.sources["design/schema.dbml"]).toContain(HOSTILE);
    expect(erdOf(data).tables.find((t) => t.name === "book_holds")!.columns.find((c) => c.name === "status")!.note).toBe(HOSTILE);
  }, SLOW);

  test.each([
    ["a closing style tag", "--a: red</style><script>x()</script>"],
    ["a url", "--a: url(https://example.com/x.png)"],
    ["a relative url", "--a: url(x.png)"],
    ["a quoted string", '--a: "x"'],
    ["a property that is not a variable", "color: red"],
    ["a brace that opens a new rule", "--a: red} body{color: red"],
    ["an import", "@import 'x.css'"],
    ["a comment", "--a: red /* x */"],
    ["a backslash escape", "--a: \\75 rl(x)"],
  ])("rejects a theme with %s", async (_, css) => {
    const { root, dir } = plan();
    theme(root, css);
    await expect(build(dir)).rejects.toThrow(/sign-off\.theme\.css: .* is not a --name: value declaration/);
  }, SLOW);

  test("puts a theme of variables after the page's styles as one :root rule", async () => {
    const { root, dir } = plan();
    theme(root, "--brand: oklch(0.6 0.2 260 / 90%);\n--radius: 0.5rem;\n--ink: var(--foreground);\n");
    const page = readFileSync(await build(dir), "utf8");
    expect(page).toContain('<style id="sign-off-theme">:root{--brand:oklch(0.6 0.2 260 / 90%);--radius:0.5rem;--ink:var(--foreground)}</style></head>');
    expect(page.lastIndexOf("</style>")).toBe(page.indexOf("</style></head>"));
  }, SLOW);

  test("refuses a page that loads from the network, and ignores URLs inside the plan's data", () => {
    const data = { revs: { planRev: "x", items: {} } } as unknown as PageData;
    expect(() => embed(`<head><link href="https://cdn.example/x.css"></head>${DATA_BLOCK}`, data, null)).toThrow(/network/);
    expect(() => embed(`<head><style>@import url(//cdn.example/x.css)</style></head>${DATA_BLOCK}`, data, null)).toThrow(/network/);
    const quoted = { ...data, sources: { "a.md": '<img src="https://example.com/x.png">' } } as PageData;
    expect(embed(`<head></head>${DATA_BLOCK}`, quoted, null)).toContain("https://example.com/x.png");
  });

  // Fails today: the statechart input holds report.json's `chart` arrays in file order, so a run that lists the same states
  // and arrows in another order moves the drawing and changes the item rev. Flip to `test` once the rev ignores that order.
  test("a run that only reorders its chart moves the drawing and keeps every item rev", async () => {
    const before = plan(), after = plan({
      files: { "statechart/out-plan/report.json": (t) => {
        const report = JSON.parse(t);
        report.chart.states.reverse();
        report.chart.arrows.reverse();
        return JSON.stringify(report);
      } },
    });
    const [a, b] = [dataOf(readFileSync(await build(before.dir), "utf8")), dataOf(readFileSync(await build(after.dir), "utf8"))];
    const drawing = (d: PageData) => JSON.stringify(Object.values(d.blocks).find((x) => x.view === "statechart")!.layout);
    expect(drawing(b)).not.toBe(drawing(a));
    expect(b.revs).toEqual(a.revs);
  }, SLOW);
});

describe("layout", () => {
  test("every chart state the manifest names has a box with that id", async () => {
    const { dir } = plan();
    const data = dataOf(readFileSync(await build(dir), "utf8"));
    const chart = Object.values(data.blocks).find((b) => b.view === "statechart")!;
    if (chart.view !== "statechart") throw new Error("no chart");
    const refs = [...new Set(JSON.stringify(data.manifest).match(/sc:[^"]+/g))];
    expect(refs.length).toBeGreaterThan(0);
    for (const run of Object.values(chart.layout)) {
      const boxes = new Set(run.graphs.flatMap((g) => g.nodes.map((n) => n.id)));
      for (const ref of refs) expect(boxes).toContain(ref);
      for (const [rule, index] of Object.entries(run.pick.rules))
        for (const arrow of run.paths[rule].arrows.filter((a) => a !== null)) expect(run.graphs[index].edges.map((e) => e.id)).toContain(arrow);
    }
  }, SLOW);

  test("marks tables and columns against the base", async () => {
    const { dir } = plan({ files: { "design/db.sql": (t) => `${t}\nalter table members add column nickname text;\n` } });
    const erd = erdOf(dataOf(readFileSync(await build(dir), "utf8")));
    const marks = Object.fromEntries(erd.tables.map((t) => [t.name, t.mark]));
    expect(marks).toEqual({ branches: "reused", books: "reused", members: "changed", copies: "reused", book_holds: "new" });
    expect(erd.tables.find((t) => t.name === "members")!.columns.filter((c) => c.mark)).toMatchObject([{ name: "nickname", mark: "new" }]);
  }, SLOW);

  test("the DBML alone gives the same tables and relations as the applied SQL", async () => {
    const withSql = plan(), dbmlOnly = plan({ json: (m) => {
      for (const block of m.items.flatMap((i: Json) => i.body ?? [])) if (block.view === "erd") { delete block.sql; delete block.base; }
    } });
    const [sql, dbml] = await Promise.all([withSql, dbmlOnly].map(async (p) => erdOf(dataOf(readFileSync(await build(p.dir), "utf8")))));
    const shape = (e: ErdLayout) => ({
      tables: e.tables.map((t) => [t.name, t.mark, t.columns.map((c) => [c.name, c.pk])]).sort(),
      relations: e.relations.map((r) => [r.id, r.kind]).sort(),
    });
    expect(shape(dbml)).toEqual(shape(sql));
    for (const e of [sql, dbml]) {
      const boxes = new Set(e.drawings.folded.tables.map((t) => t.name));
      expect(boxes).toEqual(new Set(e.tables.map((t) => t.name)));
      for (const r of e.drawings.folded.relations) expect(r.points.length).toBeGreaterThanOrEqual(2);
    }
  }, SLOW);
});

describe("joins", () => {
  test("each card names the parts, units and pull requests the manifest links to it, and each rule's checked outcome", async () => {
    const data = dataOf(readFileSync(await build(plan().dir), "utf8"));
    type Block = PageData["blocks"][string];
    const isView = <V extends Block["view"]>(b: Block | undefined, view: V): b is Extract<Block, { view: V }> => b?.view === view;
    const blockAt = <V extends Block["view"]>(key: string, view: V): Extract<Block, { view: V }> => {
      const block = data.blocks[key];
      if (!isView(block, view)) throw new Error(`${key} is not a ${view} block`);
      return block;
    };
    const e1 = blockAt("api:0", "endpoints").input.endpoints.find((e) => e.id === "E1")!;
    expect(e1.readBy.map((c) => c.name)).toEqual(["PlaceHoldForm", "holdsClient"]);
    expect(e1.builtIn).toEqual([{ unit: "U2", repo: "shelf-api", prs: ["P2"] }]);
    expect(blockAt("components:0", "components").input.builtIn).toEqual([{ unit: "U3", repo: "shelf-web", prs: ["P3"] }]);
    expect(blockAt("units:0", "units").input.ships.U3).toEqual([{ id: "P3", into: "main" }]);
    const trace = blockAt("acceptance:0", "trace").input;
    expect(trace.rules.NoTurnSkipped).toEqual({ says: "The desk never lends a held copy to someone else", outcome: "broken" });
    expect(trace.rules.HeldForSomeone.outcome).toBe("holds");          // broken in the draft run, so this pins the plan's own run
    expect(blockAt("prs:0", "prs").input.prs.find((p) => p.id === "P1")!.serves).toEqual(["R1", "R2", "R3"]);
  }, SLOW);
});
