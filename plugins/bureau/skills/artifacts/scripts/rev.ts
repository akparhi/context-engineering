/** `artifactRev` is the revision of one artifact: a hash of its data and the words of each file it names. JSON key order does not
 *  move it, nor do comments and the width of whitespace in the formats `TOKENS` names. Whitespace added where there was none
 *  does, and so does any character of a quoted string. */
import { extensionOf, type NamedFile, type Read, shownText } from "./fileref.ts";

export const hash = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex").slice(0, 12);

/** JSON with object keys sorted and undefined fields dropped, so a reordered field changes no hash. */
export const canon = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (value && typeof value === "object") {
    const fields = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${fields.map(([k, v]) => `${JSON.stringify(k)}:${canon(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

/** What each format reads apart from plain text: a comment, or under `keep` a quoted string, which stays as written. One pattern
 *  per format, so whichever opens first wins: a quote inside a comment opens no string, and a comment marker inside a string no comment.
 *  yagni: backslash escapes in a SQL `E` string and nested block comments are not read; a real SQL or DBML parser if one ever moves a rev wrongly. */
const TOKENS: Record<string, RegExp> = {
  ".sql": /(?<keep>'(?:[^']|'')*'|"(?:[^"]|"")*"|\$(?<tag>\w*)\$[\s\S]*?\$\k<tag>\$)|--[^\n]*|\/\*[\s\S]*?\*\//g,
  ".dbml": /(?<keep>'''[\s\S]*?'''|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`[^`]*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
  ".mmd": /^\s*%%[^\n]*/gm,
  ".md": /<!--[\s\S]*?-->/g,
};

/** The words of a source in order. JSON is compared as data. The formats in `TOKENS` lose their comments, and each run of
 *  whitespace outside a quoted string becomes one space. Any other text is hashed as written, because in YAML the indent is meaning. */
export function words(text: string, ext: string): string {
  if (ext === ".json") return canon(JSON.parse(text));
  const token = TOKENS[ext];
  if (!token) return text;
  const squeeze = (loose: string) => loose.replace(/\s+/g, " ");
  let out = "", loose = "", at = 0;
  for (const match of text.matchAll(token)) {
    loose += text.slice(at, match.index);
    at = match.index + match[0].length;
    const keep = match.groups?.keep;
    if (keep === undefined) loose += " ";
    else { out += squeeze(loose) + keep; loose = ""; }
  }
  return (out + squeeze(loose + text.slice(at))).trim();
}

/** The words of one named file, or null for an `optional` file that does not exist. */
export function wordsOf(read: Read, file: NamedFile): string | null {
  const shown = shownText(read, file);
  if (shown === null) {
    if (file.optional && read(file.ref) === null) return null;
    throw new Error(file.heading === undefined || read(file.ref) === null ? `${file.ref} does not exist` : `${file.ref}: no heading "${file.heading}"`);
  }
  return file.words ? file.words(shown) : words(shown, extensionOf(file.ref));
}

export const artifactRev = (data: unknown, files: NamedFile[], read: Read): string =>
  hash(canon([data, files.filter((file) => !file.derived).map((file) => wordsOf(read, file))]));
