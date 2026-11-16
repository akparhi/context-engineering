/** One view of the plan on its own, as `sign-off render --part` writes it: every block of that kind under its item's title, with no
 *  steps, verdicts or Submit. It draws each block through the same `drawBlock` and adapter as the sign-off page. The page sizes to
 *  its content and holds no viewport height unit, because the frames that show it grow to fit and reject one. */
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import type { PartData } from "../../scripts/build.ts"
import { partBlocks } from "./adapter.ts"
import { PageContext, type Page } from "./parts.tsx"
import { emptyReview } from "./review.ts"
import { applySavedTheme } from "./theme.ts"
import { drawBlock } from "./views.tsx"

const SURFACE = "overflow-hidden rounded-4xl bg-card text-sm text-card-foreground shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10"
const nothing = () => {}
const NO_REFS: Page["refs"] = { get: () => undefined }

function Part({ data }: { data: PartData }) {
  const page: Page = {
    data, refs: NO_REFS, review: emptyReview, focused: null, act: nothing, go: nothing, openLinked: nothing,
    changed: new Set(), reader: "",
  }
  const shell = { links: data.links, sources: data.sources, focus: null, go: nothing }
  return (
    <PageContext.Provider value={page}>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 font-sans text-foreground antialiased">
        {partBlocks(data, data.part).map(({ item, key, block }) => (
          <section key={key} data-item={item.id} className={SURFACE}>
            <h2 className="border-b px-5 py-4 font-heading text-lg font-medium sm:px-6">{item.title}</h2>
            <div className="px-5 py-5 sm:px-6">{drawBlock(block, shell)}</div>
          </section>
        ))}
      </main>
    </PageContext.Provider>
  )
}

const data = JSON.parse(document.getElementById("sign-off-data")?.textContent || "null") as PartData | null
if (!data) throw new Error("This page has no plan data. Render it with `sign-off render`.")
document.title = `${data.manifest.id} ${data.part}`
applySavedTheme()
createRoot(document.getElementById("root")!).render(<StrictMode><Part data={data} /></StrictMode>)
