export const title = "One copy of a book, and the members waiting for it";

export const state = (v) => {
  if (v.skipped !== "none") return "Lent past a member's turn";
  const waiting = Object.keys(v.queue).length > 0;
  if (v.copy === "open shelf") return "On the open shelf";
  if (v.copy === "lent") return waiting ? "Out on loan, members waiting" : "Out on loan";
  if (v.heldFor === "none") return "On the hold shelf for nobody";
  return waiting ? "On the hold shelf, others waiting" : "On the hold shelf";
};

export const step = (action) => {
  const a = action.replace(/\(.*$/, "");
  if (a === "PlaceHold") return "a member places a hold";
  if (a === "CancelWaiting") return "a waiting member cancels";
  if (a === "Return") return "the copy comes back";
  if (a === "Collect") return "the member picks it up";
  if (a === "DayPasses") return "a day passes";
  if (a === "Lapse") return "three days pass";
  if (a === "CancelOnShelf") return "the member it waits for cancels";
  if (a === "Borrow") return "someone borrows it";
  if (a === "DeskLendsHeldCopy") return "the desk lends it to someone else";
  return a;
};

export const group = (v) => (v.copy === "lent" ? "With a reader" : "In the library");
export const colors = { "With a reader": "blue", "In the library": "teal" };
