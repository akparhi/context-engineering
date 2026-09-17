<!-- Original. Verified against ui.shadcn.com and Radix docs, Sept 2026. See NOTICE.md -->

How this skill's rules land in a shadcn/ui project: Radix or Base UI primitives, Tailwind v4, `cva`, `tw-animate-css`. Read this when `components.json` exists or the user names shadcn.

## Discovery: the official skill and MCP own installation

The [official shadcn skill](https://ui.shadcn.com/docs/skills) and the [MCP server](https://ui.shadcn.com/docs/mcp) own the CLI, `init`/`add`, registry authoring, and the `components.json` schema. This file does not repeat them.

MCP tools: `search_items_in_registries`, `view_items_in_registries`, `get_item_examples_from_registries`, `get_add_command_for_items`, `get_audit_checklist`.

Search the registry before hand-rolling any component. A combobox, data table, or sidebar that already ships arrives accessible for one `add` command.

## Primitives in `components/ui` are project-owned source

Make small edits — add variants, tokens, base-class changes — directly in the component file. Keep diffs small so `npx shadcn diff` stays readable. Wrap the primitive in a feature component when the change is caller-specific; `cn()` (`clsx` + `tailwind-merge`) resolves conflicting utilities so the caller's class wins.

```tsx
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function DangerButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return <Button variant="destructive" className={cn("w-full", className)} {...props} />
}
```

## Press feedback belongs in `buttonVariants`

Add the press scale to the `cva` base string so every button inherits it: `scale(0.96)` at `150ms var(--ease-out)`. Expose a `motion` variant so callers can opt out with `<Button motion="static">`. Use `VariantProps<typeof buttonVariants>` to type it through Button props.

Register the easing tokens once in the global CSS so `ease-out` utilities resolve to the skill curve, not Tailwind's built-in `cubic-bezier(0, 0, 0.2, 1)`:

```css
@theme {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}
```

```tsx
import { type VariantProps, cva } from "class-variance-authority"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center … " +
    "motion-safe:transition-[color,box-shadow,transform] motion-safe:duration-150 " +
    "motion-safe:ease-out outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  {
    variants: {
      // …existing variant and size groups
      motion: {
        default: "active:scale-[0.96]",
        static: "",
      },
    },
    defaultVariants: { variant: "default", size: "default", motion: "default" },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}
```

## Popovers animate from their computed origin

Radix exposes a per-component transform-origin variable. shadcn already wires it with the `origin-(--var)` arbitrary-property syntax — keep it when you restyle.

The pattern is `--radix-<component>-content-transform-origin`, for `popover`, `dropdown-menu`, `select`, `tooltip`, `hover-card`, `context-menu`, and `menubar`. Select only exposes it with `position="popper"`.

The Base UI build uses one `--transform-origin` on the Positioner, plus `--anchor-width`, `--available-height`, `--positioner-width`. Dialog is centered, not anchored — it scales from its own center, no origin variable.

```tsx
"origin-(--radix-popover-content-transform-origin)"  // Radix
"origin-(--transform-origin)"                        // Base UI
```

## Enter and exit run on data-state, not on mount

`tw-animate-css` supplies `animate-in`/`animate-out` and the `fade-*`, `zoom-*`, `slide-*` keyframe utilities. Radix flips `data-[state]`, so the exit animation plays before unmount without any JS.

```tsx
"data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
"data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150",
"data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
```

`duration-*` and `ease-*` set the transition properties; `tw-animate-css` reads the same timing variables for its `animate-*` keyframes, so one utility times both. With the `@theme` block above, `ease-out` is the skill curve.

`zoom-in-95` is `scale(0.95)`. Never swap it for `zoom-in-0` — a popover growing from nothing reads as a glitch. The Radix docs' `scaleIn` example animates `scale(0)`; ignore that value.

Base UI uses `data-[starting-style]` and `data-[ending-style]` instead of `data-[state]`.

## Toast and drawer already exist — do not re-implement

shadcn ships Sonner for toasts and Vaul for drawers. Both are tuned; this skill's motion rules describe what they already do. Style them through tokens, not by rebuilding.

```tsx
// components/ui/sonner.tsx wires Sonner to the theme
style={{ "--normal-bg": "var(--popover)", "--normal-text": "var(--popover-foreground)", "--border-radius": "var(--radius)" } as React.CSSProperties}
```

Vaul marks direction with `data-[vaul-drawer-direction=bottom]`; target that, not a hand-added class.

## Radius derives from one token

`--radius` is the single source of truth. Tailwind v4 exposes the scale through `@theme inline`; changing `--radius` moves every corner in the app.

```css
@theme inline {
  --radius-sm: calc(var(--radius) * 0.6);   --radius-md:  calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);               --radius-xl:  calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}
```

A nested element takes the step below its parent: `rounded-lg` card, `rounded-md` input inside it. When no scale step fits, use `rounded-[calc(var(--radius-lg)-8px)]` — a calc expression stays live when `--radius` changes. A bare literal like `rounded-[6px]` breaks the concentric relationship.

## Only semantic color tokens reach a component

Use `bg-background`, `text-foreground`, `bg-primary text-primary-foreground`, `text-muted-foreground`, `border-border`, `ring-ring`, `bg-destructive`. The base token is the surface; `-foreground` is the text and icon color on it. A palette utility like `bg-blue-500` ignores the theme and does not flip in dark mode.

New role? Define the pair in `:root` and `.dark`, then register it. v4 templates use `oklch()`.

```css
:root { --warning: oklch(0.84 0.16 84); --warning-foreground: oklch(0.28 0.07 46); }
.dark { --warning: oklch(0.41 0.11 46); --warning-foreground: oklch(0.99 0.02 95); }
@theme inline { --color-warning: var(--warning); --color-warning-foreground: var(--warning-foreground); }
```

`bg-warning text-warning-foreground` now works everywhere, light and dark.

## Dark mode flips variables, not utilities

The `.dark` class re-declares the same variable names. v4 has no `darkMode` config key, so the variant is declared in CSS.

```css
@custom-variant dark (&:is(.dark *));
```

When a token exists, a component needs zero `dark:` utilities. Reach for `dark:` only where the design diverges beyond color. shadcn does this for `dark:bg-input/30` on outline buttons, where dark mode needs a filled surface.

## Shadows are theme variables too

Register shadow tokens in `@theme` alongside colors so a shadow-as-border treatment stays themeable. `verify:` the default scaffold ships no `--shadow-*` tokens — check the project's CSS first.

```css
@theme { --shadow-xs: 0 1px 2px oklch(0 0 0 / 0.06); }
```

Keep `border-input` on form controls. A shadow alone does not survive forced-colors mode, and the border is what marks a field editable.

## Never strip the shipped focus ring

Every interactive primitive carries the same focus treatment. Removing it to "clean up" a class string is an accessibility regression.

```tsx
"outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
"aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
```

Error states set `aria-invalid` on the control. The ring recolors itself; do not add a red border by hand.

## Icons are lucide-react at the size the button sets

The button base includes `[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`, so an unsized icon becomes `size-4`. The `xs` and `icon-xs` sizes drop it to `size-3`. Pass `size-*` only to override.

```tsx
<Button><CheckIcon strokeWidth={1.5} /> Save</Button>
```

Stroke `1.5` beside weight-400 text, `2` beside weight-600. lucide defaults to `2`, so only the `1.5` case needs writing.

## The primitive owns accessibility

Radix and Base UI handle focus trap, roving tabindex, ARIA, Escape, and outside-press. Adding `role`, `aria-expanded`, or a keydown handler duplicates or contradicts the primitive.

Compose with `asChild` (Radix) or `render` (Base UI) so props and refs merge onto one element.

```tsx
<DropdownMenuTrigger asChild>
  <Button variant="outline">Options</Button>
</DropdownMenuTrigger>
```

Two exceptions the primitive cannot infer: an accessible name on an icon-only trigger, and `aria-invalid` on a field the app knows is wrong.

## shadcn has no type scale

It ships control sizes, not a prose scale. Apply `references/typography.md` and define the scale in `@theme`. Put `tabular-nums` on any number that changes in place — timers, counters, table currency — so digits stop jittering.

## Tailwind v4 is CSS-first

New projects: one `@import "tailwindcss"`, theme in `@theme`. `tw-animate-css` replaced `tailwindcss-animate`; it imports, it is not a `@plugin`. If the project already has a `tailwind.config.js`, keep it loaded via `@config` — do not migrate it.

```css
@import "tailwindcss";
@import "tw-animate-css";
@custom-variant dark (&:is(.dark *));
```

v4 already gates `hover:` behind `@media (hover: hover)`, so a hover style will not stick on touch. The skill's hover-gating rule still applies to hand-written CSS.

## Before you finish

| Tell | Fix |
| --- | --- |
| Hex or `bg-blue-500` in a component | Map it to a semantic token; add a `:root`/`.dark` pair if the role is new |
| A large rewrite of a primitive base string | Revert to a small diff; add a `cva` variant or wrap instead |
| `dark:` utilities scattered across a feature component | A token is missing — define it once, drop the variants |
| `transition-all` copied in from a snippet | Name the properties: `transition-transform`, `transition-colors` |
| A second radius literal like `rounded-[6px]` | Use the derived step: `rounded-md` inside `rounded-lg` |
| `zoom-in-0` or a `scale(0)` keyframe | `zoom-in-95`; entry scale never starts at zero |
| `focus-visible:ring-*` deleted from a class string | Restore the shipped ring; never `outline-none` alone |
| `role` or `aria-expanded` added to a Radix trigger | Delete it; the primitive sets both |
| A hand-built combobox, data table, or sidebar | `search_items_in_registries` first; it probably ships |
