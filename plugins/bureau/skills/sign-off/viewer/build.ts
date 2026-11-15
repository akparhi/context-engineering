/** `bun build.ts` writes viewer.gen.html: one file with the JS, the compiled Tailwind CSS and the fonts inlined, and an empty
 *  `sign-off-data` block that `build` fills. It fails if the page would load anything from the network. */
import { compile, Polyfills } from "@tailwindcss/node"
import { Scanner } from "@tailwindcss/oxide"
import type { BunPlugin } from "bun"
import { DATA_BLOCK, networkLoads } from "../scripts/build.ts"

const here = import.meta.dir

/** Compiles src/index.css with the Tailwind the preset pins, from the classes under src/. bun-plugin-tailwind vendors an older Tailwind.
 *  No color-mix polyfill: Bun's minifier keeps only the first of the nested `@supports` overrides it emits per selector, so every
 *  other dark tint would fall back to its solid color. */
const tailwind: BunPlugin = {
  name: "tailwind",
  setup(build) {
    build.onLoad({ filter: /\/src\/index\.css$/ }, async ({ path }) => {
      const compiler = await compile(await Bun.file(path).text(), { base: `${here}/src`, polyfills: Polyfills.AtProperty, onDependency: () => {} })
      const scanner = new Scanner({ sources: [{ base: `${here}/src`, pattern: "**/*", negated: false }] })
      return { contents: compiler.build(scanner.scan()), loader: "css" }
    })
  },
}
const out = `${here}/viewer.gen.html`

const result = await Bun.build({
  entrypoints: [`${here}/index.html`],
  compile: true,
  target: "browser",
  minify: true,
  plugins: [tailwind],
  define: { "process.env.NODE_ENV": '"production"' },
})
if (!result.success) throw new AggregateError(result.logs, "viewer build failed")
const html = await result.outputs[0]!.text()

const loads = networkLoads(html)
if (loads.length) throw new Error(`viewer.gen.html would load from the network: ${loads.slice(0, 5).join(", ")}`)
if (html.split(DATA_BLOCK).length !== 2) throw new Error("viewer.gen.html must hold exactly one empty sign-off-data block")

await Bun.write(out, html)
const gz = Bun.gzipSync(new TextEncoder().encode(html)).length
console.log(`wrote ${out}: ${(html.length / 1024).toFixed(1)} KB raw, ${(gz / 1024).toFixed(1)} KB gzipped`)
