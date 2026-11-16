/** A `FileRef` names a file an artifact draws from. It is a path relative to the plan folder and must stay inside it, so a plan
 *  folder can be copied, checked and read with nothing beside it. */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";

const escapes = (path: string) => path.split("/").includes("..");

export const FileRef = z.string().min(1)
  .refine((p) => !isAbsolute(p) && !p.includes("\\"), "a file path is relative to the plan folder, with forward slashes")
  .refine((p) => !escapes(p), "a file path stays inside the plan folder, so it has no `..`")
  .refine((p) => !p.includes("#"), "a file path names a whole file; a heading goes in its own field")
  .brand<"FileRef">();
export type FileRef = z.infer<typeof FileRef>;

/** A file an artifact names. A missing `optional` file is not an error. `derived` marks a file made from another named file, such
 *  as DBML drawn from the SQL: it must exist, and no rev hashes it. `words` replaces the default normalization for a file whose
 *  layout is not meaning in some other way, such as a chart report whose state order only moves the drawing. */
export type NamedFile = { ref: FileRef; heading?: string; optional?: boolean; derived?: boolean; words?: (text: string) => string };

/** The file's text, or null when it does not exist. A path that leaves the plan folder, by `..` or through a symlink, reads as
 *  missing. */
export type Read = (ref: string) => string | null;

export const planReader = (planDir: string): Read => {
  const root = existsSync(planDir) ? realpathSync(planDir) : resolve(planDir);
  return (ref) => {
    const file = resolve(root, ref);
    if (!existsSync(file)) return null;
    const inside = relative(root, realpathSync(file));
    if (inside === "" || inside.startsWith(`..${sep}`) || inside === ".." || isAbsolute(inside)) return null;
    return readFileSync(file, "utf8");
  };
};

type Heading = { text: string; line: number };

/** ATX headings. A `#` line inside fenced code is not a heading. */
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
    if (h) out.push({ text: h[2], line });
  }
  return out;
}

/** The text under a heading, up to the next heading of any level, or null when the file has no such heading. */
export function section(markdown: string, heading: string): string | null {
  const all = headings(markdown);
  const at = all.findIndex((h) => h.text === heading);
  if (at < 0) return null;
  return markdown.split("\n").slice(all[at].line + 1, all[at + 1]?.line).join("\n");
}

/** What a named file shows: the whole file, or the section under `heading`. Null when the file or the heading is missing. */
export function shownText(read: Read, file: Pick<NamedFile, "ref" | "heading">): string | null {
  const text = read(file.ref);
  return text === null || file.heading === undefined ? text : section(text, file.heading);
}

export const extensionOf = (ref: string) => extname(ref);
