export const THEME_KEY = "sign-off:theme"

/** Called before the first render, so a dark page never paints light first. Storage may throw inside a sandboxed frame. */
export function applySavedTheme() {
  let saved: string | null = null
  try { saved = localStorage.getItem(THEME_KEY) } catch {}
  document.documentElement.classList.toggle("dark", saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches)
}
