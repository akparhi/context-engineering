import { afterAll, afterEach, expect, mock, spyOn, test } from "bun:test"
import { fullSize } from "../src/full-size.ts"

const PNG = `data:image/png;base64,${Buffer.from([137, 80, 78, 71]).toString("base64")}`
const opened: string[] = []
const live = new Set<string>()
const spies = [
  spyOn(URL, "createObjectURL").mockImplementation((blob) => { const url = `blob:test/${live.size}-${(blob as Blob).type}`; live.add(url); return url }),
  spyOn(URL, "revokeObjectURL").mockImplementation((url) => { live.delete(url) }),
]
;(globalThis as { window?: unknown }).window = { open: mock((url: string) => { opened.push(url); return null }) }
afterEach(() => { opened.length = 0; live.clear(); for (const s of spies) s.mockClear() })
afterAll(() => { for (const s of spies) s.mockRestore(); delete (globalThis as { window?: unknown }).window })

test("opening a mockup full size many times makes one blob URL, of the image's type, and every tab gets it", () => {
  const viewer = fullSize(PNG)
  viewer.open(); viewer.open(); viewer.open()
  expect([...live]).toEqual(["blob:test/0-image/png"])
  expect(opened).toEqual(Array(3).fill("blob:test/0-image/png"))
})

test("close revokes the blob URL, and an open after it makes a fresh one", () => {
  const viewer = fullSize(PNG)
  viewer.open()
  viewer.close()
  expect(live.size).toBe(0)
  viewer.open()
  expect(live.size).toBe(1)
  viewer.close(); viewer.close()
  expect(live.size).toBe(0)
})

test("a mockup never opened makes no blob URL, and closing it revokes nothing", () => {
  fullSize(PNG).close()
  expect(spies.map((s) => s.mock.calls.length)).toEqual([0, 0])
})
