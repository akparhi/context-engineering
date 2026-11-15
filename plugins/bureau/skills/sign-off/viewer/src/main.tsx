import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App, applySavedTheme } from "./App.tsx"
import { readPageData } from "./plan.ts"

/** Read before the theme class or React touch the document, so Share downloads the file as it was built. */
const builtPage = `<!doctype html>\n${document.documentElement.outerHTML}`
const data = readPageData()
document.title = `${data.manifest.id} ${data.manifest.title}: plan for sign-off`
applySavedTheme()
createRoot(document.getElementById("root")!).render(<StrictMode><App data={data} builtPage={builtPage} /></StrictMode>)
