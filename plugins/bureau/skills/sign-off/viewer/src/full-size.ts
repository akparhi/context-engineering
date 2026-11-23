/** Opens an inlined `data:` image full size in a new tab, through a blob URL, since a browser will not open a `data:` URL as a
 *  page. The first `open` makes the one blob URL every later open reuses; `close` revokes it, and a later `open` makes it again. */
export function fullSize(src: string) {
  let url: string | null = null
  return {
    open() {
      if (url === null) {
        const [head = "", body = ""] = src.split(",", 2)
        const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
        url = URL.createObjectURL(new Blob([bytes], { type: head.slice("data:".length, head.indexOf(";")) }))
      }
      window.open(url, "_blank", "noopener")
    },
    close() {
      if (url !== null) URL.revokeObjectURL(url)
      url = null
    },
  }
}
