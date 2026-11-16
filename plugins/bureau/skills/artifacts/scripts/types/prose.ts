import { z } from "zod";
import { defineType } from "../artifact.ts";
import { FileRef } from "../fileref.ts";

const schema = z.strictObject({ src: FileRef, heading: z.string().optional() });
export type Prose = z.infer<typeof schema>;

export default defineType({
  type: "prose",
  v: 1,
  schema,
  // The page shows prose as written, so its line breaks are what the reader reads and a reflow moves the rev.
  files: (data) => [{ ref: data.src, heading: data.heading, words: (text) => text }],
});
