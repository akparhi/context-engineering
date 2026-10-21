---
name: image-gen
description: Use when the user asks to generate, draw, or create an image, icon, illustration, mockup, or asset, or to edit an existing image, including images a coding task needs: replacing placeholder or hero images, OG/social cards, 404 or empty-state art, and product photos for seed data. Uses OpenAI image generation through the Codex ChatGPT login.
---

Generate or edit images with OpenAI's hosted image tool via the user's Codex login (`codex login` must already be done). The script sits next to this file; `<skill-dir>` below means this skill's directory (`~/.claude/skills/image-gen` when installed globally).

```bash
bun <skill-dir>/generate.ts "<prompt>" --out <path.png> [options]
```

| Option | Values | Default |
|---|---|---|
| `--out`, `-o` | `.png`, `.jpg` or `.webp`; the extension picks the file format | required |
| `--image`, `-i` | input image to edit or use as reference (png/jpg/webp); repeatable | none |
| `--size` | `1024x1024`, `1536x1024` (landscape), `1024x1536` (portrait), `auto` | `auto` |
| `--background` | `opaque`, `transparent` (real alpha; needs `.png` or `.webp`), `auto` (model decides) | `opaque` |
| `--quality` | `low`, `medium`, `high`, `auto` | `auto` |
| `--force` | replace an existing `--out` file | off |
| `--model` | Codex model driving the tool | `gpt-6-luna` |

Stdout: the saved path, then `size: WxH quality: … background: …` as delivered, then the model's revised prompt. On failure it exits 1 with one line; if it says to run `codex login`, tell the user.

## Running it

- A call takes 20–80 s, occasionally 150 s with several input images. Use a Bash timeout of at least 300000 ms.
- Several images (variants, concepts, one per page): launch the calls in parallel in one Bash command (`cmd1 & cmd2 & cmd3 & wait`). Parallel calls work and finish in the time of the slowest one.
- `No image returned: no reason given` and timeouts are usually transient: retry the same command once. A reason after the colon (a refusal, a rate limit) is not transient; report it or change the prompt.
- The script refuses to overwrite an existing file or an input image. For a new attempt, use a new name (`logo-v2.png`) so the user can compare; pass `--force` only to replace on purpose.

## Size, quality and format are requests, not guarantees

The backend lets the model pick the final size and quality. The script asks for the `--size` you pass: landscape and portrait usually land exactly, square comes back as 1254x1254, and `--quality high` is often delivered as low or medium. Judge the image, not the `quality:` line; regenerating rarely gets a higher tier. Read the `size:` line before reporting dimensions. When the user needs exact pixels (favicons, app-store icons, OG images at 1200x630), generate at the nearest size, center-crop to the target ratio, then resize (`sips -c <h> <w>` then `sips -z <h> <w>` on macOS, or PIL), and confirm the final dimensions. Ratios wider than 3:2 work the same way from `1536x1024`; keep important content away from the edges in the prompt.

Name the orientation in the prompt too ("portrait poster", "wide banner"); it reinforces `--size`.

## Writing the prompt

- Be specific: subject, style, composition, palette, lighting, and what must not appear.
- Text in the image: put each exact string in quotes in the prompt and keep it short. After generating, crop the text region to a separate file (`sips -c` or PIL) and Read it, then check every character; image models often garble punctuation and small text. If a character is wrong, edit the result with `--image` and name the exact fix, or regenerate.
- Don't add text the user didn't ask for (taglines, "EST. 2026"); every extra string is another chance to garble.
- "No text" requests: say so, and say that screens, signs and paper in the scene stay blank; otherwise the model tends to scribble pseudo-text on them.
- Transparency only when the user asks for it or the asset must float over unknown backgrounds (stickers, cut-outs): pass `--background transparent` with a `.png` out. Asking for transparency only in the prompt bakes a fake checkerboard into the pixels. Ask for a ~10% margin around the subject. Transparent output can come back with holes inside the subject or a faint halo, and Read shows transparent pixels as black, so composite it over a bright colour with PIL and Read that before reporting.
- Icons stay opaque by default: iOS/Android app and touch icons must be opaque full-bleed squares (the OS applies its own mask), and favicons and logos on a solid square read fine. If the user wants rounded corners on a web icon, round them locally with PIL.

## Editing and references

- Small change ("make the background blue"): pass the original with `--image`, describe only the change, and say what must stay the same. The model regenerates the whole frame, so "keep it exactly" means visually close, not pixel-identical; tell the user when that matters, and offer to cut the subject from the original and composite it onto the new result if they need it exact.
- Restyle or sketch-to-render: pass the input with `--image` and describe the full target (style, colours, lighting), plus which parts of the input to keep (pose, layout, character).
- Several inputs ("put this character next to that product"): pass `--image` once per file and say which input supplies what.
- Match the input's aspect ratio with `--size` so the edit is not cropped or reframed.

## Where files go and checking the result

- An asset for the project goes under the project, named by content (`streak-app-icon.png`, not `out.png`). Unless the user named the folder, keep large source images out of shipped folders like `public/` when only derived sizes ship; put the master next to them under a non-shipped path or in `/tmp/`.
- Derived assets (favicon sizes, app icons, thumbnails): generate one master, then downscale locally rather than generating each size.
- An edit of a user's file goes next to the original with a descriptive suffix (`product-mug-blue-bg.png`).
- Anything else goes in `/tmp/`.
- After it succeeds, Read the saved file to check it before reporting, and say in the reply that you checked it. If it misses, refine the prompt or edit with `--image` and try again.
- Deliver what was asked. Offer extra variants, sizes or wiring (manifests, `.ico`) in the reply instead of building them unasked.
