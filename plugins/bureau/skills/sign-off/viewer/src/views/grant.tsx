import { BotIcon, UserIcon, type LucideIcon } from "lucide-react"
import type { Item } from "../../../scripts/manifest.ts"
import type { PullRequest } from "../../../scripts/views.ts"
import { COPY } from "../copy.ts"
import { IdChip, Subhead } from "../parts.tsx"
import type { RowLine } from "../views.tsx"

type Grant = Extract<Item, { type: "grant" }>
type Line = Grant["allow"][number]

/** What the agent does alone, what it asks first, and which pull requests merge with no person. Each line keeps its grant key in
 *  `data-grant-key`, so a slimmer view can hide the keys from the reader and still find them. */
export function GrantView({ grant, prs }: { grant: Grant; prs: PullRequest[] }) {
  const g = COPY.grant
  const auto = prs.filter((p) => p.merge.by !== "human")
  return (
    <div data-part="grant">
      <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">{g.says}</p>
      <div className="mt-5 grid gap-x-10 gap-y-6 md:grid-cols-2">
        <Lines title={g.alone} icon={BotIcon} lines={grant.allow} part="allow" />
        <Lines title={g.asks} icon={UserIcon} lines={grant.ask} part="ask" />
      </div>
      <p className="mt-5 border-t border-border/60 pt-4 text-sm leading-6" data-part="clearance">
        <span className="font-medium">{auto.length ? g.autoMerge : g.noAutoMerge}</span>
        {auto.map((p) => <span key={p.id} className="ml-1.5 inline-block align-middle"><IdChip id={p.id} /></span>)}
        {grant.clearance && <span className="mt-1 block text-muted-foreground">{grant.clearance}</span>}
      </p>
    </div>
  )
}

function Lines({ title, icon: Icon, lines, part }: { title: string; icon: LucideIcon; lines: Line[]; part: string }) {
  return (
    <section data-part={part}>
      <Subhead><span className="inline-flex items-center gap-1.5"><Icon aria-hidden className="size-3.5" />{title}</span></Subhead>
      {lines.length ? (
        <ul className="flex flex-col">
          {lines.map((l) => (
            <li key={l.key + l.says} data-grant-key={l.key} className="flex gap-2.5 border-t border-border/60 py-2 text-sm leading-6 first:border-t-0 first:pt-0">
              <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />{l.says}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm leading-6 text-muted-ink">{COPY.grant.nothing}</p>}
    </section>
  )
}

/** The folded grant card: how many lines, and the one fact a reviewer must see, which pull requests merge with no person. The view
 *  itself has no fold, so a reader of the open card meets every line. */
export function grantRow(grant: Grant, prs: PullRequest[]): RowLine {
  const g = COPY.grant
  const auto = prs.filter((p) => p.merge.by !== "human").map((p) => p.id)
  return { says: `${g.row(grant.allow.length, grant.ask.length)}. ${auto.length ? `${g.autoMerge} ${auto.join(", ")}` : g.noAutoMerge}`, loose: [] }
}
