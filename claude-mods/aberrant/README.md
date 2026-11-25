# Aberrant

Fork of [Claude Better Render](https://github.com/clemendor/my-mods/tree/main/plugins/claude-better-render) and [Compact Tools](https://github.com/clemendor/my-mods/tree/main/plugins/compact-tools) at commit `c7125ce`. Compact Tools ships without a license upstream.

A terminal-only Claude Code mod with normal Claude text by default, optional
themed Markdown, Mermaid diagrams, inline tool images and pasted-image previews. One renderer coordinates
these features, so several plugins do not compete to redraw the same reply.

## Install

Install Bun for image and diagram rendering. On macOS:

```sh
brew install oven-sh/bun/bun
```

Then in Claude Code:

```text
/plugin marketplace add akparhi/context-engineering
/plugin install aberrant@akparhi
/reload-plugins
```

The npm dependencies are pinned in `bun.lock`. Install them with
`bun install --frozen-lockfile` in the plugin directory if diagrams fall back to text. Start a new session if the new command is not listed after reload.
It does not draw in Desktop, regular Chat, or IDE surfaces.

## Use

`/render` opens settings and a live preview. `/render demo` opens a larger example.
`/aberrant` is an alias for `/render`.

The **Mod controls** sidebar includes **Aberrant: ON/OFF**. Click it to
toggle the whole mod; it shares the saved state used by `/render on` and
`/render off`. Use `/sidebar-controls on` if the sidebar is closed.

| Command | Behavior |
| --- | --- |
| `/render on` / `/render off` | Enable or restore the previous/native rendering. |
| `/render mode native` | Default: keep Claude’s original text rendering; append Mermaid previews and keep tool images. |
| `/render mode text` | Themed text, code and tables, plus graphical diagrams when supported and Unicode fallback otherwise. |
| `/render theme terminal` | Follow terminal colors where they can be detected. |
| `/render theme github-light` | Choose one of the bundled Prismantis palettes. |
| `/render images on` / `off` | Show/hide pictures returned by tools or sent as attachments. |
| `/render mermaid on` / `off` | Draw diagrams or keep their source. |
| `/render preview on` / `off` | Enable/disable pasted-image thumbnails before sending. |
| `/render tools inherit` / `cards` | Keep existing tool formatting, or surround it with a themed card. |
| `/render copy` | Copy the exact original text of the last rendered reply. |
| `/render doctor` | Show dependency status, image capability and the most recent rendering failure. |

Normal Claude text is the default. `/render mode text` opts into Prismantis
Markdown styling using ordinary terminal text, with source-copy controls.
Mermaid previews remain graphical where supported. The saved transcript and
model-visible results remain unchanged.

Typesetting, graphical paragraphs, font controls, and size controls were removed
in 0.1.3. Old `auto` and `typeset` preferences migrate to native mode. Mermaid
previews appear after the unchanged native reply, preserving its source.

## Message boxes

In the terminal, your messages sit in a rounded box labeled **You** and Claude's answers in one labeled **Claude**. One-line notes between steps stay unboxed. Text selected across the box's sides picks up border characters; the Copy buttons copy clean source. `/render boxes off` removes them.

## Compact tools

Compact Bash, Read, Edit, Write, Fetch, and MCP output for Claude Code's terminal. Run `/compact-tools` to toggle, or `/compact-tools on` and `/compact-tools off`.

Fetch calls show the URL without the extraction prompt, then the first result line and a hidden-line count. Failed or interrupted fetches keep their native details. Full prompts and results still reach Claude and remain in the transcript.

Failed Bash calls show a compact red error row with their exit code when available and first diagnostic. Turn the mod off to see full error output.

MCP calls show the server and tool name without dumping their JSON arguments. Results show the first text line and a hidden-line count, or a count of non-text items. Failures are marked red, and interrupted calls keep their native interruption marker. The complete arguments and results still reach the tool and model and remain in the transcript; turning the mod off restores their full display.

## Terminal support

Ghostty and kitty are the primary graphical targets. The mod measures their font
and palette where possible. Other terminals get themed text unless image output
has explicitly been enabled through Claude's supported environment setting.
`NO_COLOR` disables graphical rendering. In tmux/screen, text fallback is the
default; explicitly enabled image passthrough depends on the terminal and host.
SSH sessions cannot assume that a remote font configuration matches the viewer.

Bun runs the local rendering worker. Mermaid renders diagrams; Bun's built-in
image API converts JPEG and WebP images to bounded PNG previews. No external document compiler is
used, and rendering makes no extra
model requests. Use Claude's normal plugin update flow.

PNG, JPEG and WebP previews are supported. Images are content-keyed, fitted to the
available width and transferred as bounded PNGs. Very large/invalid files keep
their original tool row or file link. Markdown image URLs are not fetched by the
renderer. Code fences are never executed.

## Works with AJ's existing mods

The compact-tools module keeps ownership of tool summaries in `inherit` mode. Live-thinking
can wrap the reply without being replaced. Buddy, flags, Handoff and prompt-nav
stay independent. Plugin-h 0.1.1 exposes its hidden state so `/plugin-h hide` also
suppresses draft thumbnails; it does not hide images inside the transcript.

Do not enable the standalone upstream renderers alongside this combined one:
several own the same assistant-message drawing. A foreign renderer that removes
the native drawing entirely takes precedence rather than being silently erased.

## Credits

This mod builds on and takes inspiration from excellent community projects:

- **[Intelligent UI](https://github.com/razorback16/cc-intelligent-ui)** by razorback16 — inspiration for the original rendering integration; its typesetting code and bundled packages have since been removed.
- **[Prismantis](https://github.com/NahumLitvin/prismantis)** by Nahum Litvin — adapted Markdown parser, themed text/table/code renderers, palettes and Unicode diagrams.
- **[Mermaid Inline](https://github.com/dazebug/mermaid-inline)** by dazebug — adapted diagram rendering and terminal font/color measurement.
- **[Inline Images](https://github.com/kbrianps/claude-inline-images)** by Brian Pravato — tool-image preview design and result formats.
- **[Readable Layout](https://github.com/GarvitNangru/claude-code-mods/tree/main/mods/readable-layout)** by Garvit Nangru — the You and Claude message boxes.
- **[Claude Image View](https://github.com/jarrodwatts/claude-image-view)** by Jarrod Watts — pasted-image preview design and cache discovery.

AJ maintains the integration and its fixes. This is not an official release from
those authors. Versions, commit IDs, original notices and dependency licenses
are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `licenses/`.

## Development

```sh
bun install --frozen-lockfile
claude plugin validate . --strict
claude plugin test .
bun run test:worker
uv run --with pyte python tests/terminal_check.py
```

The worker tests execute Mermaid and image conversion locally, including malformed input,
same-size image replacement and width limits. The terminal replay uses an
isolated Claude configuration and a local fake API; it makes no paid API calls.
