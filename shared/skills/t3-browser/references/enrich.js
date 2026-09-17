/**
 * Element extractor for preview_evaluate. Paste as the `expression`.
 *
 * T3's own snapshot leaves most app elements unusable: on a dense page it
 * reported role:null for 126/200 elements and an empty name for 76/200, with
 * positional `div:nth-of-type(...)` selectors that go stale when the DOM
 * reorders. This reads the label from aria-label/placeholder/text/value and
 * prefers href/id/placeholder selectors, which survive re-renders.
 *
 * Returns { url, n, modal, els: [{role, name, selector}] } — feed straight to
 * select.ts. `modal` non-null means a dialog is scoping the list; it is a signal
 * to decide, not an instruction to close anything (see SKILL.md).
 * Set the row cap below if a virtualized table floods the list.
 */
(() => {
  const MAX = 200;
  const SELECTORS =
    'a,button,input,textarea,select,[role=button],[role=tab],[role=checkbox],[role=switch],[role=menuitem],[role=combobox]';
  const quote = (v) => `'${String(v).replace(/'/g, "\\'")}'`;
  const els = [];
  const seen = new Map();
  let n = 0;

  // A tour/consent/upsell dialog swallows clicks meant for the page behind it,
  // and the page's own controls still look available in the DOM. Scope to the
  // dialog so the only steps offered are the ones that can actually run.
  const dialogs = [...document.querySelectorAll('[role=dialog],[aria-modal=true],dialog[open]')]
    .filter((d) => {
      const rect = d.getBoundingClientRect();
      return rect.width > 200 && rect.height > 120;
    });
  const modal = dialogs[dialogs.length - 1] ?? null;
  const root = modal ?? document;

  for (const el of root.querySelectorAll(SELECTORS)) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;

    const name = (
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.innerText ||
      el.value ||
      el.title ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    if (!name) continue;

    const tag = el.tagName.toLowerCase();
    const href = el.getAttribute('href');
    const placeholder = el.getAttribute('placeholder');
    // Positional selectors are counted within the dialog but resolved against
    // the whole page, so scope them back to the dialog or they hit the wrong node.
    const scope = modal ? '[role=dialog],[aria-modal=true] >> ' : '';
    const selector = el.id
      ? `#${CSS.escape(el.id)}`
      : href
        ? `${tag}[href=${quote(href)}]`
        : placeholder
          ? `${tag}[placeholder=${quote(placeholder)}]`
          : modal
            ? `${scope}text=${quote(name)}`
            : `${tag}:nth-of-type(${++n})`;

    // Repeated row widgets ("Select", "Enter Memo") crowd out the toolbar; keep two of each.
    const key = `${tag}:${name}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > 2) continue;

    els.push({ role: el.getAttribute('role') || tag, name, selector });
    if (els.length >= MAX) break;
  }

  return {
    url: location.href,
    n: els.length,
    // Non-null means the page is blocked: dismiss it before running page steps.
    modal: modal
      ? { text: (modal.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120) }
      : null,
    els,
  };
})();
