// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT DATA (used on first launch)
// ═══════════════════════════════════════════════════════════════════════════

export const DFLT_PROFILE = {
  name: "Worker",
  annualSalary: 616500,
  taxPct: 35,
  isRotation: false,
  lunchMins: 30,
};

export const DFLT_RULES = {
  rot: {
    normalStart: "07:30",
    normalEnd: "17:30",
    earlyStart: "06:00",
    earlyEnd: "07:30",
    fiftyEnd: "21:00",
  },
  noRot: {
    normalStart: "07:30",
    normalEnd: "15:30",
    earlyStart: "06:00",
    earlyEnd: "07:30",
    fiftyEnd: "21:00",
  },
  travelSatAfter: "12:00",
  offDutyHome: "50",
  offDutyOnsite: "100",
  act20: ["Travel (20%)", "Working Onsite (20%)"],
  act34: ["Travel (34%)", "Working Onsite (34%)"],  // ← NY: aktivitetstyper som gir 34%-tillegg
};

export const DFLT_ACT = [
  { id: "a1", name: "Office",         s20: false, s34: false, desc: "Tennfjord" },
  { id: "a2", name: "Home Working",   s20: false, s34: false, desc: "Working from home" },
  { id: "a3", name: "Travel (20%)",         s20: true, s34: false,  desc: "Work-related travel (in EU)" },
  { id: "a4", name: "Working Onsite (20%)", s20: true, s34: false,  desc: "On-site field work (in EU)" },
  { id: "a5", name: "Travel (34%)",         s20: false, s34: true,  desc: "Work-related travel (out of EU)" },
  { id: "a6", name: "Working Onsite (34%)", s20: false, s34: true,  desc: "On-site field work (out of EU)" },
  { id: "a7", name: "Vacation", s20: false, s34: false,  desc: "Vacation" },
  { id: "a8", name: "Sick Leave", s20: false, s34: false,  desc: "Sick Leave" },
];

export const DFLT_PROJ = [
  { id: "p1", number: "General Admin", name: "Tennfjord" },
  { id: "p2", number: "Vacation", name: "VISMA" },
  { id: "p3", number: "Sick Leave", name: "VISMA" },
];

export function makeDefaultPeriod() {
  const n = new Date();
  const y = n.getFullYear();
  const m = n.getMonth();
  const s = new Date(y, m, 15);
  const e = new Date(y, m + 1, 14);
  return [{
    id: "pp1",
    name: `${n.toLocaleString("en", { month: "short" })} ${y}`,
    startDate: s.toISOString().split("T")[0],
    endDate: e.toISOString().split("T")[0],
  }];
}

export function makeDefaults() {
  return {
    profile: { ...DFLT_PROFILE },
    rules: JSON.parse(JSON.stringify(DFLT_RULES)),
    actTypes: DFLT_ACT.map(a => ({ ...a })),
    projects: DFLT_PROJ.map(p => ({ ...p })),
    entries: [],
    expenses: [],
    periods: makeDefaultPeriod(),
  };
}
