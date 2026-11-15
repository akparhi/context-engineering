/** ATX headings and the sections under them, for `check` and the revs alike. A `#` line inside fenced code is not a heading.
 *  No Node APIs here. */
export type Heading = { text: string; level: number; line: number };

export function headings(markdown: string): Heading[] {
  const out: Heading[] = [];
  let fence: string | null = null;
  for (const [line, text] of markdown.split("\n").entries()) {
    const opens = text.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (opens) {
      if (!fence) fence = opens[1][0];
      else if (opens[1][0] === fence) fence = null;
      continue;
    }
    const h = !fence && text.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) out.push({ text: h[2], level: h[1].length, line });
  }
  return out;
}

/** The text under a heading, up to the next heading of any level, or null when the file has no such heading. Each subsection
 *  is cited on its own, so `check` fails a heading with text that no item cites. */
export function section(markdown: string, heading: string): string | null {
  const all = headings(markdown);
  const at = all.findIndex((h) => h.text === heading);
  if (at < 0) return null;
  const lines = markdown.split("\n");
  return lines.slice(all[at].line + 1, all[at + 1]?.line).join("\n");
}
