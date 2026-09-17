/** One actionable element, normalized away from any provider's snapshot shape. */
export type Element = {
  id: string;
  label: string;
  context?: string;
  /** Playwright locator the adapter uses to act. Provider-owned, opaque to the selector. */
  locator?: string;
};

export type Snapshot = {
  text: string;
  elements: Element[];
  url?: string;
};

export function validateSnapshot(snapshot: Snapshot): Snapshot {
  if (typeof snapshot?.text !== "string" || !Array.isArray(snapshot?.elements)) {
    throw new Error("Snapshot requires text and elements: [{ id, label }].");
  }
  const ids = new Set<string>();
  for (const element of snapshot.elements) {
    if (!element.id || typeof element.id !== "string" || ids.has(element.id)) {
      throw new Error("Elements need unique nonempty string IDs.");
    }
    if (!element.label || typeof element.label !== "string") {
      throw new Error(`Element ${element.id} needs a nonempty string label.`);
    }
    ids.add(element.id);
  }
  return snapshot;
}

/**
 * T3's interactiveElements entry. Geometry is optional so the agent can pass a
 * compact copy — only role, name and selector influence selection.
 */
export type T3Element = {
  tag?: string;
  role: string | null;
  name: string;
  selector: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type T3Page = {
  url: string;
  title?: string;
  visibleText?: string;
  interactiveElements: readonly T3Element[];
};

const quote = (value: string) => `'${value.replace(/'/g, "\\'")}'`;

/**
 * Enrichment reports a tag name when an element carries no explicit role, and
 * `role=a[...]` or `role=input[...]` is not a selector Playwright can resolve —
 * it silently fails at click time. Only emit role locators for real ARIA roles.
 */
const ARIA_ROLES = new Set([
  "alert", "button", "checkbox", "dialog", "heading", "link", "listbox",
  "menu", "menuitem", "option", "radio", "slider", "spinbutton",
  "switch", "tab", "tabpanel", "tooltip", "treeitem",
]);

/**
 * Text inputs are usually named by their placeholder, which T3's matcher does
 * not treat as an accessible name — `role=textbox[name='Search by…']` resolves
 * to nothing. Their CSS selector (`#search-cards`, `[placeholder='…']`) does.
 */
const CSS_ONLY_ROLES = new Set(["textbox", "searchbox", "combobox", "input", "textarea"]);

/**
 * Role/name locators survive re-renders; the synthesized CSS selector does not.
 * Falls back to it when the element has no accessible name, or when its "role"
 * is really a tag name.
 */
export function locatorFor(element: T3Element): string {
  if (element.role && CSS_ONLY_ROLES.has(element.role)) return element.selector;
  if (element.role && element.name && ARIA_ROLES.has(element.role)) {
    return `role=${element.role}[name=${quote(element.name)}]`;
  }
  return element.selector;
}

export function fromT3(page: T3Page): Snapshot {
  const elements = page.interactiveElements.map((element, index) => ({
    id: `e${index}`,
    label: `${element.role ?? element.tag ?? "element"}: ${element.name || element.selector}`,
    locator: locatorFor(element),
  }));
  return validateSnapshot({
    text: page.visibleText ?? "",
    elements,
    url: page.url,
  });
}
