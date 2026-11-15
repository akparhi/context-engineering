/** The `sign-off:v1:` payload, shared by the page that writes it and `ingest` that reads it. No zod and no Node APIs here, because
 *  the viewer bundles this module. */
export const MARK = "sign-off:v1:";

/** One review as the page submits it. `review.ts` validates the same shape with zod on the way in. */
export type ReviewPayload = {
  v: 1; plan: string; planRev: string; by: string; at: string
  items: {
    id: string; itemRev: string
    verdict?: "approve" | "changes"
    answer?: string                                                                // an option id, or free text
    note?: string
    comments?: { anchor?: string; text: string }[]
  }[]
  view?: { mode: "slim" | "full"; unopened: string[]; count?: number }            // `SubmitView` in manifest.ts
};

/** FNV-1a over UTF-16 code units. */
export const checksum = (text: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
};

/** Standard base64 of the UTF-8 JSON. Slack formats none of `+ / =`. */
export function encodeReview(review: ReviewPayload): string {
  const json = JSON.stringify(review);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `${MARK}${btoa(binary)}.${checksum(json)}`;
}
