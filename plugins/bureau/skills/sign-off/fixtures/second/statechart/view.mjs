export const title = "One locker door in the lobby";

export const state = (v) => {
  if (v.inDoor > 1) return "Two parcels behind one door";
  if (v.atDesk) return "Parcel at the front desk";
  if (v.inDoor === 0) return "Door empty";
  if (v.extensions > 1) return "Parcel in the locker, two more days";
  return v.extensions === 1 ? "Parcel in the locker, one more day" : "Parcel in the locker";
};

export const step = (action) => {
  const a = action.replace(/\(.*$/, "");
  if (a === "Drop") return "a courier drops it off";
  if (a === "Open") return "the resident opens the door";
  if (a === "Extend") return "the resident asks for one more day";
  if (a === "DayPasses") return "a day passes";
  if (a === "Sweep") return "two days pass";
  if (a === "ExtraDayEnds") return "the extra day passes";
  if (a === "Handover") return "the desk hands it over";
  return a;
};

export const group = (v) => (v.inDoor > 0 ? "Behind the door" : "Out of the locker");
export const colors = { "Behind the door": "teal", "Out of the locker": "blue" };
