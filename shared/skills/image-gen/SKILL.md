---
name: image-gen
description: Use when the user asks to generate, draw, or create an image, icon, illustration, mockup, or asset, or to edit an existing image. Uses OpenAI image generation through the Codex ChatGPT login.
---

Generate or edit images with OpenAI's hosted image tool via the user's Codex login (`codex login` must already be done).

```bash
bun ~/.claude/skills/image-gen/generate.ts "<prompt>" --out <path.png> [options]
```

| Option | Values | Default |
|---|---|---|
| `--image`, `-i` | input image to edit or use as reference (png/jpg/webp); repeatable | none |
| `--size` | `1024x1024`, `1536x1024` (landscape), `1024x1536` (portrait), `auto` | `auto` |
| `--quality` | `low`, `medium`, `high`, `auto` | `auto` |
| `--model` | Codex model driving the tool | `gpt-6-luna` |

- Pick `--out` under the project when the image is an asset for it; otherwise `/tmp/`. Name files by content, not `out.png`.
- Write a specific prompt: subject, style, composition, colors, text to render. Transparent backgrounds are not supported; ask for a plain solid background if it will be cut out.
- To edit, pass the original with `--image` and describe only the change.
- A call takes 30–90 s; run it with a Bash timeout of at least 300000 ms.
- After it succeeds, Read the saved file to check the result before reporting; iterate with a refined prompt or an `--image` edit if it misses.
- Stdout: saved path, then the model's revised prompt. On failure it exits 1 with one line; if it says to run `codex login`, tell the user.
