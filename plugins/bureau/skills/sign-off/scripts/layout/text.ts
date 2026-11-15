/** Text widths at build time, so the page draws diagrams at positions `build` already chose. The diagram views must set text in
 *  exactly these fonts. */

/** Advance widths in em of ASCII 32 to 126, measured with canvas `measureText` in Chromium on the fonts `viewer.gen.html`
 *  inlines. Summing them lands within 0.4% of the measured width of a whole label, because the fonts kern little. */
const INTER: Record<Weight, number[]> = {
  400: [0.281, 0.288, 0.466, 0.633, 0.642, 0.982, 0.644, 0.3, 0.365, 0.365, 0.501, 0.662, 0.288, 0.46, 0.288, 0.36, 0.631, 0.407, 0.61, 0.618, 0.646, 0.593, 0.62, 0.566, 0.619, 0.62, 0.288, 0.302, 0.662, 0.662, 0.662, 0.511, 0.966, 0.69, 0.654, 0.73, 0.722, 0.601, 0.59, 0.746, 0.743, 0.269, 0.571, 0.672, 0.565, 0.903, 0.753, 0.765, 0.639, 0.765, 0.644, 0.642, 0.646, 0.744, 0.69, 0.985, 0.682, 0.679, 0.629, 0.365, 0.36, 0.365, 0.471, 0.456, 0.323, 0.562, 0.612, 0.571, 0.612, 0.583, 0.37, 0.613, 0.591, 0.242, 0.242, 0.549, 0.242, 0.876, 0.591, 0.6, 0.612, 0.612, 0.376, 0.528, 0.327, 0.591, 0.562, 0.818, 0.546, 0.562, 0.552, 0.426, 0.333, 0.426, 0.662],
  500: [0.266, 0.304, 0.494, 0.638, 0.646, 0.993, 0.653, 0.313, 0.369, 0.369, 0.52, 0.667, 0.303, 0.463, 0.303, 0.37, 0.645, 0.415, 0.616, 0.627, 0.656, 0.603, 0.63, 0.571, 0.629, 0.63, 0.303, 0.315, 0.667, 0.667, 0.667, 0.527, 0.983, 0.709, 0.657, 0.734, 0.722, 0.603, 0.589, 0.748, 0.744, 0.273, 0.575, 0.688, 0.565, 0.913, 0.756, 0.767, 0.642, 0.769, 0.648, 0.646, 0.653, 0.74, 0.709, 1.003, 0.701, 0.696, 0.641, 0.369, 0.37, 0.369, 0.476, 0.463, 0.337, 0.568, 0.618, 0.577, 0.618, 0.587, 0.379, 0.619, 0.602, 0.252, 0.252, 0.559, 0.252, 0.888, 0.601, 0.604, 0.618, 0.618, 0.387, 0.539, 0.34, 0.602, 0.575, 0.829, 0.557, 0.575, 0.559, 0.441, 0.346, 0.441, 0.667],
  600: [0.252, 0.321, 0.523, 0.644, 0.65, 1.004, 0.662, 0.326, 0.373, 0.373, 0.54, 0.673, 0.319, 0.465, 0.319, 0.379, 0.66, 0.423, 0.623, 0.636, 0.666, 0.612, 0.64, 0.576, 0.64, 0.64, 0.319, 0.329, 0.673, 0.673, 0.673, 0.543, 0.999, 0.728, 0.659, 0.737, 0.722, 0.605, 0.588, 0.749, 0.746, 0.277, 0.58, 0.703, 0.565, 0.922, 0.759, 0.769, 0.645, 0.773, 0.652, 0.65, 0.66, 0.736, 0.728, 1.02, 0.72, 0.714, 0.652, 0.373, 0.379, 0.373, 0.482, 0.469, 0.351, 0.574, 0.624, 0.583, 0.624, 0.591, 0.389, 0.626, 0.612, 0.262, 0.262, 0.57, 0.262, 0.9, 0.612, 0.609, 0.624, 0.624, 0.397, 0.549, 0.353, 0.612, 0.587, 0.839, 0.569, 0.589, 0.566, 0.455, 0.359, 0.455, 0.673],
};
const MONO_EM = 0.6;
// yagni: a character outside ASCII counts as Inter's widest capital; measure the Latin-1 range if real labels need it.
const WIDE_EM = 1.02;

type Weight = 400 | 500 | 600;
export type Font = { family: "sans" | "mono"; weight: Weight; size: number };

/** The fonts the diagrams set, as the views must write them in CSS. */
export const FONTS = {
  node: { family: "sans", weight: 500, size: 13 },
  label: { family: "sans", weight: 500, size: 12 },
  row: { family: "sans", weight: 400, size: 12 },
  chip: { family: "sans", weight: 600, size: 12 },
  tableHead: { family: "mono", weight: 600, size: 13 },
  column: { family: "mono", weight: 400, size: 12 },
  tag: { family: "sans", weight: 500, size: 12 },
} as const satisfies Record<string, Font>;

export function textWidth(text: string, font: Font): number {
  let em = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    em += font.family === "mono" ? MONO_EM : code >= 32 && code < 127 ? INTER[font.weight][code - 32] : WIDE_EM;
  }
  return Math.ceil(em * font.size);
}

/** Greedy word wrap to `max` pixels. A word wider than `max` keeps its own line. */
export function wrap(text: string, font: Font, max: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines.at(-1);
    if (last !== undefined && textWidth(`${last} ${word}`, font) <= max) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}
