<!-- Adapted from Emil Kowalski skills (MIT). See NOTICE.md -->

Fixes that make a web app feel installed on a phone, not embedded in a browser.

## Hard rules

1. **Every fix ships with its reason.** Apply where the why applies — `user-select: none` on body text is a defect; on a button it is correct.
2. **Media queries over device sniffing.** `(hover: hover)`, `(pointer: fine)`, `env()`, `dvh` — the platform declares its capability; never branch on user-agent strings or screen width.
3. **Touch and mouse are not exclusive.** iPads with trackpads, laptops with touchscreens. Gate by capability, not device.
4. **Never disable zoom.** `user-scalable=no` and `maximum-scale=1` are accessibility failures. Fix the input font size instead.
5. **Test on hardware before calling it done.** Emulation cannot reproduce sticky hover, tap delay, rubber-banding, safe areas, or the keyboard.

## Symptom table

| Problem | Solution |
| --- | --- |
| Hover state stuck after tap | Wrap in `@media (hover: hover) and (pointer: fine)` |
| Gray/blue flash on tap | Kill `-webkit-tap-highlight-color` |
| Layout has wrong height | `100dvh` (app shell) or `100svh` (hero) |
| Page zooms into input | Input `font-size` 16px minimum |
| Tap feels laggy | Feedback on pointer-down + `touch-action: manipulation` |
| Pull-to-refresh hijacks scroll | `overscroll-behavior: none` on `html, body` |
| Content stops at the notch | `viewport-fit=cover` + `env(safe-area-inset-*)` |
| Long-press selects button text | `user-select: none` on controls |
| Carousel scrolls vertically | `touch-action: pan-y` on the gesture surface |
| Status bar color doesn't match | `theme-color` per color scheme |
| Right in Chrome, wrong on phone | Test on real hardware |

## Hover state stuck after tap

Touch has no hover; browsers fake one — first tap applies `:hover` and leaves it until the user taps elsewhere. Gate every hover style behind a capability query.

```css
@media (hover: hover) and (pointer: fine) {
  .button:hover {
    background: var(--color-surface-raised);
    transform: scale(1.02);
  }
}
```

Both conditions matter: `(hover: hover)` confirms the primary input can hover; `(pointer: fine)` rules out styluses and odd Android devices. In Tailwind v4 the `hover:` variant already compiles to `@media (hover: hover)`; in v3 set `future.hoverOnlyWhenSupported`. Touch users still need press feedback — give it via `:active` (see fix 5).

## Gray/blue flash on tap

iOS Safari and Android Chrome paint a translucent highlight over any tapped element, the single loudest "this is a website" signal.

```css
html {
  -webkit-tap-highlight-color: transparent;
}
```

Set once globally, then ensure every tappable element has its own `:active` state — you have just removed the browser's only built-in feedback.

## Layout has the wrong height

`100vh` is the *largest* viewport — the height with browser chrome collapsed. On load the URL bar is visible, so a `100vh` element overflows by its height and a bottom-pinned button hides beneath it.

```css
/* App shell, drawers — tracks visible area as chrome shows/hides */
.app { height: 100dvh; }

/* Heroes — smallest the viewport gets, never cut off */
.hero { min-height: 100svh; }
```

`dvh` resizes as the URL bar collapses; right for app shells, causes layout shift on marketing content. `svh` is stable; right for heroes. `lvh` equals old `vh` — avoid it. Add a `100vh` fallback only when the support matrix demands it.

## Page zooms into the input

iOS Safari zooms when focus lands on an input with `font-size` under 16px and does not zoom back on blur. `maximum-scale=1` is the wrong fix (hard rule 4).

```css
input, textarea, select {
  font-size: 16px; /* 1rem at default root size */
}
```

If design calls for smaller text on desktop, scope it:

```css
@media (pointer: coarse) {
  input, textarea, select { font-size: 16px; }
}
```

Also set the keyboard: `inputmode="numeric"` for codes, `type="email"` / `type="tel"`, `autocapitalize="none"` and `autocorrect="off"` on usernames, `enterkeyhint` to label the return key.

## Tap feels laggy

Two causes stack. **The 300ms click delay**: browsers wait after a tap to detect a double-tap zoom. `touch-action: manipulation` tells the browser this element never double-tap-zooms, so `click` fires immediately.

```css
button, a, [role="button"], .tappable {
  touch-action: manipulation;
}
```

**Feedback on release instead of press**: native buttons respond the instant a finger lands. Style `:active`, or listen to `pointerdown` not `click` in JavaScript.

```css
.button:active {
  transform: scale(0.96);
}

@media (prefers-reduced-motion: no-preference) {
  .button {
    transition: transform 150ms var(--ease-out), background 150ms var(--ease-out);
  }
}
```

Press feedback: `scale(0.96)` at `150ms var(--ease-out)`. The transform itself is ungated; the transition is gated behind reduced-motion. Add `motion="static"` to opt out. Duration range: 100–160ms.

## Pull-to-refresh hijacks scroll

Scrolling past the top triggers pull-to-refresh (Android) or the whole-page rubber band (iOS). Correct for documents; wrong in apps with their own scroll containers.

```css
html, body {
  overscroll-behavior: none;
}
```

On inner scrollable containers, use `contain` — it keeps the container's own bounce but stops the page behind it from moving.

```css
.sheet-content {
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

Never use a `touchmove` + `preventDefault()` listener — it blocks scrolling entirely and makes the listener non-passive, costing frames.

## Content stops at the notch

By default the browser letterboxes the page inside the safe area, leaving notch and home-indicator zones the body's background color. Two steps:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

```css
.app-header {
  padding-top: env(safe-area-inset-top);
}
.bottom-bar {
  padding-bottom: env(safe-area-inset-bottom);
}
.sheet {
  padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
}
```

Without the meta tag all `env()` values are `0px`. Fixed headers, bottom tab bars, toasts, and sheets need this; normal page content gets it through the header's padding. Provide a fallback in `calc()`.

## Long-press selects button text

Hold a finger on a web button and iOS selects its label or pops the copy/share callout. Controls should not be selectable; content must stay selectable.

```css
button, [role="button"] {
  user-select: none;
  -webkit-user-select: none;   /* Safari still needs the prefix */
  -webkit-touch-callout: none; /* no long-press callout on links/images used as controls */
}

/* Gesture surfaces (drag handles, custom controls) add user-select: none individually */
```

Never put `user-select: none` on `body` — users copy addresses, error messages, and order numbers.

## Carousel scrolls vertically

A horizontal swipe is ambiguous — the browser guesses whether you mean the page or the track, often getting it wrong. Declare which axes the element owns.

```css
.carousel {
  touch-action: pan-y; /* carousel handles horizontal; browser keeps vertical */
}
.drag-surface {
  touch-action: none;  /* custom gesture owns every axis */
}
.vertical-sheet-handle {
  touch-action: pan-x; /* sheet handles vertical; horizontal stays with the browser */
}
```

The values name what the *browser* may still do. Use `none` only on elements that truly handle all gestures themselves. If the carousel uses native scroll, prefer `scroll-snap-type: x mandatory` on the track and `scroll-snap-align: start` on slides — the browser's own physics beat a hand-rolled spring.

## Status bar color doesn't match

The status bar and browser chrome take their color from `theme-color`. One value produces a mismatched bar in the other scheme.

```html
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0a0a" />
<meta name="color-scheme" content="light dark" />
```

Match the value to the color at the very top of the page — the header background, not the brand color. In Next.js use the `viewport` export (`themeColor: [{ media, color }]`). If the app switches theme via a class rather than the OS setting, update the tag from JavaScript on toggle.

## Right in Chrome, wrong on phone

None of the above reproduces in device emulation. Sticky hover, the tap highlight, the URL bar's effect on `vh`, input zoom, the click delay, overscroll, safe areas, the software keyboard — all real-hardware behaviors.

- Run the dev server on `0.0.0.0`; open by LAN IP on the device.
- iOS: Safari → Develop → the device. Android: `chrome://inspect`.
- Test on a phone a few years old, not the newest. Test with the keyboard open. Test landscape once.
- Test as an installed PWA if that is a target; standalone mode changes viewport, safe areas, and status bar behavior.
- Xcode Simulator is a step up from emulation but still misses touch feel. Real hardware is the bar.

## Baseline block

Ship this before the first component.

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0a0a" />
```

```css
html {
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%; /* no font inflation in landscape */
  overscroll-behavior: none;
}

input, textarea, select {
  font-size: 16px;
}

button, a, [role="button"] {
  touch-action: manipulation;
}

button, [role="button"] {
  user-select: none;
  -webkit-user-select: none;
}

@media (hover: hover) and (pointer: fine) {
  /* all :hover rules live here */
}
```

`interactive-widget=resizes-content` makes the software keyboard shrink the layout viewport on Android Chrome, so `100dvh` and bottom-pinned inputs react to it the way they do on iOS. Drop `overscroll-behavior: none` from `html` if the app is a scrolling document where pull-to-refresh is welcome.

## Never ship

| Never | Instead |
| --- | --- |
| `user-scalable=no` or `maximum-scale=1` | 16px inputs — fix the cause |
| Ungated `:hover` | `@media (hover: hover) and (pointer: fine)` |
| `100vh` for an app shell or bottom-pinned UI | `100dvh` |
| `100dvh` on a marketing hero | `100svh` (no layout shift on scroll) |
| Press feedback on `click` only | `:active` / `pointerdown` |
| `touchmove` + `preventDefault()` to stop overscroll | `overscroll-behavior` |
| `user-select: none` on `body` | Only on controls |
| `touch-action: none` on something the user must scroll past | `pan-x` / `pan-y` |
| `env(safe-area-inset-*)` without `viewport-fit=cover` | Add the meta tag or the value is `0` |
| One `theme-color` for both schemes | One per `prefers-color-scheme` |
| User-agent sniffing to detect touch | `(hover)` / `(pointer)` media queries |
| Declaring it fixed from device emulation | Real hardware |
