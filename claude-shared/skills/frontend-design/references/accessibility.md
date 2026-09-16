<!-- Adapted from Jakub Krehel skills (MIT). See NOTICE.md -->

Recipes for every accessibility principle: semantics, focus, keyboard, forms, hit areas, motion, screen readers, and zoom.

---

## Native elements first

Use `<button>` for actions, `<a href>` for navigation — never `<div onClick>`. A real link supports Cmd/Ctrl/middle-click; a `<div>` does not.

Prefer `disabled` on native elements. Use `aria-disabled="true"` only when the element must stay focusable and you block the action in JS.

No ARIA is better than wrong ARIA.

---

## Visible focus rings

Style `:focus-visible`, not bare `:focus`. Never write `outline: none` without a verified visible replacement.

Prefer the browser's unmodified indicator — it adapts to forced-color settings automatically. A custom ring needs at least `2px` solid. Verify it against every adjacent color it crosses.

```css
/* Keep browser ring, add breathing room */
:focus-visible { outline-offset: 2px; }

/* Custom ring — use a verified project token */
:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
```

In `forced-colors: active`, keep default color adjustment or name a system color (`Highlight`). Avoid `forced-color-adjust: none` unless the control stays perceivable. Use `:focus-within` to light up a wrapper while an inner input holds focus.

---

## Full keyboard support

- `tabindex="0"` — adds to tab order. `tabindex="-1"` — removes from tab order; allows programmatic `focus()`. Never use values ≥ 1.
- **Roving tabindex** for composite widgets (WAI APG): one child has `tabindex="0"`, the rest `tabindex="-1"`; arrow keys move the `0` and call `.focus()` on the new child. Container focus + `aria-activedescendant` is the other strategy — do not mix them.
- Follow the [ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/) pattern for each widget (dialog, tabs, combobox, menu, tree).
- **Skip link** — first focusable element on pages with repeated navigation before main content.

```html
<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:p-3 focus:bg-white">
  Skip to content
</a>
<main id="main">…</main>
```

On SPA route changes, announce the new page title through a `role="status"` region without moving focus to it. Move focus to the new `<h1>` or primary container instead.

---

## Native `<dialog>` is the default

Native `<dialog>` with `showModal()` gives focus trap, Escape, top layer, and background `inert` for free.

```html
<dialog id="my-dialog" aria-labelledby="dialog-title">
  <h2 id="dialog-title">Confirm deletion</h2>
  <p>This cannot be undone.</p>
  <button autofocus>Cancel</button>
  <button>Delete</button>
</dialog>
```

```js
const dialog = document.getElementById('my-dialog');
const trigger = document.getElementById('open-btn');
trigger.addEventListener('click', () => dialog.showModal());
dialog.addEventListener('close', () => trigger.focus());
```

Set `aria-labelledby` pointing at the dialog's heading. The `closedby` attribute (`closedby="any"`) lets a click outside close it. On close, always return focus to the trigger.

Use a library primitive (Radix Dialog, Headless UI Dialog) when it owns the focus trap. Hand-roll a trap only when neither is possible.

---

## Minimum hit area

WCAG 2.5.8 AA baseline: 24×24 CSS px (or a documented exception). Aim for **44×44 px on touch** and **40×40 px on desktop**.

Extend small controls with a pseudo-element on the `<label>` or `<button>` — not `<input>`.

```css
.icon-btn { position: relative; }
.icon-btn::before { content: ""; position: absolute; inset: -12px; } /* 20px → 44px */
```

```tsx
<button className="relative before:absolute before:-inset-3"><Icon /></button>
```

Two interactive elements must never have overlapping hit areas. Give decorative overlays `pointer-events: none`. Set `touch-action: manipulation` on interactive elements to remove the 300 ms tap delay.

---

## Label and type every control

Associate every input with a visible label via `for`/`id`, `aria-labelledby`, or `aria-label` (last resort).

Supply `autocomplete` tokens on personal-data fields (name, email, address, payment). Use `inputmode` to show the right virtual keyboard without changing validation: `numeric`, `decimal`, `tel`, `email`, `url`, `search`.

Never block paste — password managers and motor-impaired users depend on it.

---

## Errors that announce

```html
<label for="email">Email</label>
<input id="email" type="email" autocomplete="email"
       aria-invalid="true" aria-describedby="email-err" />
<p id="email-err">Enter a valid email address.</p>
```

- `aria-invalid="true"` on every failing field; remove it once fixed.
- `aria-describedby` links the field to its error so screen readers announce it on focus.
- Render errors inline with an icon or text — never color alone.
- On submit, focus the first invalid field.
- Submit button: enabled until the request starts; disabled while the request is pending.
- Accept free text and validate after. Trim before validating — autocomplete adds trailing spaces.

---

## Accessible names everywhere

Precedence: `aria-labelledby` → `aria-label` → native `<label>` / `alt` → element content.

Icon-only buttons need an explicit name. Multiple same-type landmarks need distinguishing labels.

```html
<button aria-label="Close dialog"><svg aria-hidden="true" focusable="false">…</svg></button>
<nav aria-label="Primary">…</nav>
<nav aria-label="Breadcrumbs">…</nav>
```

---

## Don't rely on color alone

Pair every color cue with text, shape, pattern, or position. Error borders need inline text and `aria-invalid`. Status badges need a text label. Chart series need patterns or direct labels. Body links need an underline.

---

## Honor prefers-reduced-motion

Opt in to animation — never opt out.

```css
/* Motion only when the user has not requested reduced motion */
@media (prefers-reduced-motion: no-preference) {
  .card { transition: transform 200ms var(--ease-out); }
}

/* Hover effects: gate both hover and motion */
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  .card:hover { transform: translateY(-2px); }
}

/* Replace slides with crossfades when motion is reduced */
@media (prefers-reduced-motion: reduce) {
  .slide { transition: opacity 300ms ease; transform: none; }
}
```

Autoplay lasting more than 5 s needs a pause/stop/hide control visible on first focus (WCAG 2.2.2). Give action toasts ≥ 6 s or a dismiss button; never put the only path to an action inside an auto-dismissing toast.

---

## Announce dynamic content

| Mechanism | Politeness | Use for |
| --- | --- | --- |
| `aria-describedby` | With the control | Inline field errors and hints |
| `role="status"` | Polite — waits for pause | Toasts, "Saved", result counts, loading updates |
| `role="alert"` | Assertive — interrupts | Urgent errors only |

Render the region empty on page load; inject the message text on the event. Default to polite — overusing `assertive` interrupts whatever the user was reading. Keep messages short; `aria-atomic="true"` re-reads the whole region. Never move focus to a toast.

```tsx
<div role="status" className="sr-only">{statusMessage}</div>
```

Set `aria-busy="true"` on a region while loading; remove it when content is ready.

---

## Alt text by purpose

| Image type | Pattern |
| --- | --- |
| Informative | `alt="Short description"` |
| Decorative | `alt=""` |
| Functional (button icon, logo) | `alt="Action or destination name"` |
| Text in image | `alt` repeats the text exactly |

Informative SVG: `role="img"` + `<title>` as first child. Decorative SVG: `aria-hidden="true" focusable="false"`.

---

## Structure is navigation

One `<h1>` per page; nest levels without skipping; style with CSS, not tag choice. Expose one `<main>`; label duplicate landmarks. Set `<title>` most-specific first: `Billing · Settings · Acme`. Give anchored headings `scroll-margin-top` equal to any sticky header height.

---

## Survive zoom and text resize

Never set `maximum-scale` or `user-scalable=no` on the viewport meta tag.

**200% zoom (WCAG 1.4.4):** all content and controls survive. **Reflow at 320 px (WCAG 1.4.10):** vertical scroll only; 2D content (tables, maps, code) scrolls inside its container.

Use `min-height` on text containers. Never use fixed `height` — it clips content under zoom.

---

## Tooltips (WCAG 1.4.13)

Show tooltips on `:hover` (inside `@media (hover: hover) and (pointer: fine)`) and on `:focus-visible`. Tooltip content must be:

- **Dismissible** — Escape closes without moving focus.
- **Hoverable** — the pointer can move over the tooltip without it disappearing.
- **Persistent** — stays open until dismissed or focus leaves.

The trigger keeps its own `aria-label`; never rely on the tooltip as the only accessible name.

## Text spacing must survive override (WCAG 1.4.12)

No loss of content or functionality when all of the following are applied simultaneously:

- `line-height: 1.5` on body text
- `letter-spacing: 0.12em`
- `word-spacing: 0.16em`
- Paragraph spacing: `2em` (margin between paragraphs)

Avoid fixed heights on text containers. Use `min-height`, not `height`.

## Pointer alternative for every drag (WCAG 2.5.7)

Every drag operation must have a single-pointer alternative. Add a handle that moves the item on click, or provide reorder buttons for the same result.

## Before you finish

| Check | Pass condition |
| --- | --- |
| Every interactive element reachable by Tab | No skip-overs; visible ring at each stop |
| Focus ring on all surfaces | Visible against light, dark, image, gradient backgrounds |
| `outline: none` without replacement | Zero instances |
| Forced-colors / High Contrast | Ring and controls remain visible |
| Modals trap focus | Tab cycles inside; Escape closes; focus returns to trigger |
| Hit areas ≥ 24×24 CSS px | Extended with pseudo-element where needed; no overlaps |
| Touch targets ≥ 44×44 px | Or closest exception documented |
| Every `<input>` has a `<label>` | No placeholder-only labels |
| Errors: `aria-invalid` + `aria-describedby` | Announced with field; inline text, not color alone |
| Submit always enabled | Validation surfaces after attempt |
| Paste not blocked | Password-manager autofill works |
| Live regions stable in DOM before use | Empty `role="status"` present before first message |
| Animations behind `no-preference` | No motion when `prefers-reduced-motion: reduce` |
| Hover effects behind `hover: hover` | No stuck hover state on touch |
| Autoplay ≤ 5 s or has pause control | WCAG 2.2.2 |
| Alt text on every `<img>` | Decorative images have `alt=""` |
| One `<h1>`; no skipped heading levels | Coherent outline for screen-reader navigation |
| `<main>` landmark present | One per page; repeated landmarks labeled |
| Skip link is first focusable element | Visible on focus; targets `#main` |
| 200% zoom: no content loss | No horizontal overflow; controls visible |
| 320 px reflow: vertical scroll only | Page functional at equivalent viewport |
| Viewport `maximum-scale` not set | User zoom allowed |
| Text-spacing override: no content loss | `line-height 1.5`, `letter-spacing 0.12em`, `word-spacing 0.16em`, paragraph spacing `2em` all applied |
| Drag has a pointer alternative | Single-pointer alternative (button, handle) for every drag |
| Tooltip: dismissible, hoverable, persistent | Escape dismisses; pointer can move over it; stays open until dismissed |
