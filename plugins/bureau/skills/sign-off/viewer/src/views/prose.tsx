import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ProseInput } from "../../../scripts/views.ts"
import { COPY } from "../copy.ts"
import { LooseEnd } from "../parts.tsx"
import type { ViewProps } from "../views.tsx"

/** A plan file rendered as Markdown. Raw HTML is dropped, since no `rehype-raw` runs. */
export function ProseView({ input }: ViewProps<ProseInput>) {
  return (
    <figure>
      <figcaption className="font-mono text-xs text-muted-ink [overflow-wrap:anywhere]">{input.src}</figcaption>
      {input.text === null ? <div className="mt-2"><LooseEnd>{COPY.prose.missing}</LooseEnd></div> : (
        <div className="mt-3 max-w-[78ch] text-sm leading-6 [overflow-wrap:anywhere]" data-part="prose">
          <Markdown remarkPlugins={[remarkGfm]} urlTransform={safeUrl} components={COMPONENTS}>{input.text}</Markdown>
        </div>
      )}
    </figure>
  )
}

/** Links keep only `http:`, `https:` and `#` targets. Images keep no source at all, so the page never fetches one. */
const safeUrl = (url: string, key: string) => (key === "href" && /^(https?:|#)/i.test(url.trim()) ? url : null)

const COMPONENTS: Components = {
  h1: ({ node: _, ...p }) => <h3 className="mt-5 font-heading text-base font-medium first:mt-0" {...p} />,
  h2: ({ node: _, ...p }) => <h4 className="mt-5 font-heading text-[15px] font-medium first:mt-0" {...p} />,
  h3: ({ node: _, ...p }) => <h5 className="mt-4 font-medium first:mt-0" {...p} />,
  h4: ({ node: _, ...p }) => <h6 className="mt-4 font-medium first:mt-0" {...p} />,
  p: ({ node: _, ...p }) => <p className="mt-2 first:mt-0" {...p} />,
  ul: ({ node: _, ...p }) => <ul className="mt-2 list-disc pl-5" {...p} />,
  ol: ({ node: _, ...p }) => <ol className="mt-2 list-decimal pl-5" {...p} />,
  blockquote: ({ node: _, ...p }) => <blockquote className="mt-2 border-l-2 border-border pl-3 text-muted-foreground" {...p} />,
  code: ({ node: _, ...p }) => <code className="rounded bg-muted px-1 font-mono text-[13px]" {...p} />,
  pre: ({ node: _, ...p }) => <pre className="mt-2 overflow-x-auto rounded-2xl bg-muted/60 px-4 py-3 font-mono text-[13px] leading-6 dark:bg-muted/40 [&_code]:bg-transparent [&_code]:p-0" {...p} />,
  a: ({ node: _, href, ...p }) => href
    ? <a href={href} {...(href.startsWith("#") ? {} : { target: "_blank", rel: "noreferrer" })} className="text-link underline decoration-link/30 underline-offset-4 hover:decoration-link" {...p} />
    : <span {...p} />,
  img: ({ alt }) => <span className="text-muted-foreground">{alt}</span>,
  table: ({ node: _, ...p }) => <div className="mt-2 overflow-x-auto rounded-2xl ring-1 ring-foreground/10"><table className="w-full text-left text-[13px]" {...p} /></div>,
  thead: ({ node: _, ...p }) => <thead className="bg-muted/50 text-xs text-muted-ink dark:bg-muted/30" {...p} />,
  th: ({ node: _, ...p }) => <th scope="col" className="px-3 py-2 font-medium" {...p} />,
  td: ({ node: _, ...p }) => <td className="border-t border-border/70 px-3 py-2 align-top" {...p} />,
}
