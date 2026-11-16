/** `bun build.ts` writes two pages, each one file with the JS, the compiled Tailwind CSS and the fonts inlined, and an empty
 *  `sign-off-data` block that the CLI fills: viewer.gen.html, the sign-off page `build` fills, and part.gen.html, the one-view page
 *  `render --part` fills. It fails if either page would load anything from the network, or if the part page holds a viewport
 *  height unit or reaches the step page's shell. */
import { relative } from "node:path"
import { compile, Polyfills } from "@tailwindcss/node"
import { Scanner } from "@tailwindcss/oxide"
import type { BunPlugin } from "bun"
import { DATA_BLOCK, networkLoads, viewportUnits } from "../scripts/build.ts"

const here = import.meta.dir

/** Compiles src/index.css with the Tailwind the preset pins, from the classes in `patterns` under src/. bun-plugin-tailwind vendors
 *  an older Tailwind. No color-mix polyfill: Bun's minifier keeps only the first of the nested `@supports` overrides it emits per
 *  selector, so every other dark tint would fall back to its solid color. */
const tailwind = (patterns: string[]): BunPlugin => ({
  name: "tailwind",
  setup(build) {
    build.onLoad({ filter: /\/src\/index\.css$/ }, async ({ path }) => {
      const compiler = await compile(await Bun.file(path).text(), { base: `${here}/src`, polyfills: Polyfills.AtProperty, onDependency: () => {} })
      const scanner = new Scanner({ sources: patterns.map((pattern) => ({ base: `${here}/src`, pattern, negated: false })) })
      return { contents: compiler.build(scanner.scan()), loader: "css" }
    })
  },
})

async function page(entry: string, patterns: string[]): Promise<string> {
  const result = await Bun.build({
    entrypoints: [`${here}/${entry}`],
    compile: true,
    target: "browser",
    minify: true,
    plugins: [tailwind(patterns)],
    define: { "process.env.NODE_ENV": '"production"' },
  })
  if (!result.success) throw new AggregateError(result.logs, `${entry} build failed`)
  const html = await result.outputs[0]!.text()
  const loads = networkLoads(html)
  if (loads.length) throw new Error(`${entry} would load from the network: ${loads.slice(0, 5).join(", ")}`)
  if (html.split(DATA_BLOCK).length !== 2) throw new Error(`${entry} must hold exactly one empty sign-off-data block`)
  return html
}

/** The files under src/ that the part entry's JS imports, as paths relative to src/. */
async function reachedFromPart(): Promise<string[]> {
  const result = await Bun.build({ entrypoints: [`${here}/src/part.tsx`], target: "browser", metafile: true })
  if (!result.success || !result.metafile) throw new AggregateError(result.logs, "part entry did not resolve")
  const reached = Object.keys(result.metafile.inputs).map((p) => relative(`${here}/src`, `${process.cwd()}/${p}`)).filter((p) => !p.startsWith(".."))
  if (!reached.includes("part.tsx")) throw new Error(`the part entry's inputs did not resolve under src/: ${Object.keys(result.metafile.inputs).slice(0, 3).join(", ")}`)
  return reached
}

/** The step page's shell. The part page draws views alone, so neither its JS nor its CSS may come from these. */
const SHELL_ONLY = ["App.tsx", "linked.tsx", "placed.tsx", "components/ui/sidebar.tsx", "components/ui/sheet.tsx"]

const write = async (name: string, html: string) => {
  await Bun.write(`${here}/${name}`, html)
  const gz = Bun.gzipSync(new TextEncoder().encode(html)).length
  console.log(`wrote ${here}/${name}: ${(html.length / 1024).toFixed(1)} KB raw, ${(gz / 1024).toFixed(1)} KB gzipped`)
}

await write("viewer.gen.html", await page("index.html", ["**/*"]))

const reached = await reachedFromPart()
const leaks = reached.filter((p) => SHELL_ONLY.includes(p))
if (leaks.length) throw new Error(`the part page reaches the step shell: ${leaks.join(", ")}`)
const part = await page("part.html", reached)
const units = viewportUnits(part)
if (units.length) throw new Error(`part.gen.html holds viewport height units: ${units.slice(0, 5).join(", ")}`)
await write("part.gen.html", part)
