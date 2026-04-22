// ═══════════════════════════════════════════════════════════════════════════
// OVERTIME ENGINE — pure functions, no React, no storage
// ═══════════════════════════════════════════════════════════════════════════
//
// Design:
//   1. For a given day-of-week, compute all boundary minutes (classification
//      can only change at these boundaries). Split the time span at every
//      boundary so each micro-segment falls cleanly into ONE category.
//   2. Classify each micro-segment using rotation / off-duty / activity rules.
//   3. Apply lunch deduction to NORMAL hours only (never to OT categories).
//   4. 20% supplement applies to payable hours of eligible activity types.
//
// All times are minutes-since-midnight (0..1440). Midnight-crossing is handled
// by walking day-segments so each segment stays inside one calendar date.
// ═══════════════════════════════════════════════════════════════════════════

const t2m = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Return the sorted list of boundary minutes where classification can change
// for a given (dow, mode, activityType). Always includes 0 and 1440.
function getBoundaries(dow, isRot, actType, rules) {
  const r = isRot ? rules.rot : rules.noRot;
  const b = new Set([0, 1440]);
  const isWday = dow >= 1 && dow <= 5;
  const isSat = dow === 6;

  // Travel doesn't use weekday/Sat window boundaries — its only boundary is Sat travelSatAfter
  if (actType.startsWith("Travel")) {
  if (isSat) b.add(t2m(rules.travelSatAfter));
  return [...b].sort((a, b) => a - b);
}

  if (isWday) {
    b.add(t2m(r.earlyStart)); b.add(t2m(r.earlyEnd));
    b.add(t2m(r.normalStart)); b.add(t2m(r.normalEnd));
    b.add(t2m(r.fiftyEnd));
  }
  if (isSat) {
    b.add(t2m(r.normalStart));
    b.add(t2m(r.normalEnd));
  }
  return [...b].sort((a, b) => a - b);
}

// Classify a micro-segment by its midpoint minute.
// Returns "normal" | "50" | "100"
function classify(dow, midMin, actType, isRot, isOffDuty, rules) {
  const isWday = dow >= 1 && dow <= 5;
  const isSat = dow === 6;
  const isSun = dow === 0;
  const isMon = dow === 1;

  // OFF Duty override (rotation only) — configurable supplement per activity
  if (isRot && isOffDuty) {
  if (actType.startsWith("Home Working"))   return rules.offDutyHome   || "50";
  if (actType.startsWith("Working Onsite")) return rules.offDutyOnsite || "100";
}

  // ─── TRAVEL is special: only counts as OT in the Sat 12:00 → Sun 23:59 window.
  //     Outside that window, travel is always normal time.
  if (actType.startsWith("Travel")) {
  if (isSat && midMin >= t2m(rules.travelSatAfter)) return "50";
  if (isSun) return "50";
  return "normal";
}

  const r = isRot ? rules.rot : rules.noRot;
  const ns = t2m(r.normalStart), ne = t2m(r.normalEnd);
  const es = t2m(r.earlyStart),  ee = t2m(r.earlyEnd);
  const fe = t2m(r.fiftyEnd);

  if (isWday) {
    if (isMon && midMin < es) return "100";
    if (midMin >= ns && midMin < ne) return "normal";
    if ((midMin >= ne && midMin < fe) || (midMin >= es && midMin < ee)) return "50";
    return "100"; // 21:00–06:00
  }

  if (isSat) {
    if (isRot) {
      if (midMin >= ns && midMin < ne) return "normal";
      return "100";
    }
    // Non-rotation: Sat 00:00 onward is 100%
    return "100";
  }

  if (isSun) return "100";

  return "normal";
}

// Calculate one time entry's hour breakdown.
// Inputs: entry (date, fromTime, toTime, activityType, isOffDuty, lunchDeduction)
//         profile (isRotation, lunchMins)
//         rules
// Output: { totalHours, normalHours, overtime50Hours, overtime100Hours,
//           supplement20Hours, lunchDeducted, payableHours }
export function calculateEntry(entry, profile, rules) {
  const { date, fromTime, toTime, activityType, isOffDuty, lunchDeduction } = entry;
  const isRot = profile.isRotation;

  const from = new Date(`${date}T${fromTime}`);
  let to = new Date(`${date}T${toTime}`);
  if (to <= from) to = new Date(to.getTime() + 86400000); // crosses midnight

  const totalMins = Math.max(0, (to - from) / 60000);
  let nMins = 0, m50 = 0, m100 = 0;

  // Walk day-by-day (handles entries that span multiple calendar dates)
  let cursor = new Date(from);
  while (cursor < to) {
    const nextMidnight = new Date(cursor);
    nextMidnight.setHours(24, 0, 0, 0);
    const segEnd = nextMidnight < to ? nextMidnight : to;

    const dow = cursor.getDay();
    const startM = cursor.getHours() * 60 + cursor.getMinutes();
    const sameDay = cursor.toDateString() === segEnd.toDateString();
    const endM = sameDay ? (segEnd.getHours() * 60 + segEnd.getMinutes()) : 1440;

    // Split this day-segment at every relevant boundary
    const bounds = getBoundaries(dow, isRot, activityType, rules);
    const rb = bounds.filter((b) => b > startM && b < endM);
    rb.unshift(startM);
    rb.push(endM);
    rb.sort((a, b) => a - b);

    for (let i = 0; i < rb.length - 1; i++) {
      const a = rb[i], b = rb[i + 1];
      const mid = (a + b) / 2;
      const dur = b - a;
      const cat = classify(dow, mid, activityType, isRot, isOffDuty, rules);
      if (cat === "normal") nMins += dur;
      else if (cat === "50") m50 += dur;
      else m100 += dur;
    }
    cursor = segEnd;
  }

  // Lunch deduction — ONLY reduces normal hours, never below zero
  const wantLunch = lunchDeduction ? profile.lunchMins : 0;
  const lunchDed = Math.min(wantLunch, nMins);
  const payableNormal = nMins - lunchDed;
  const payableTotal = payableNormal + m50 + m100;

  // 20% supplement on payable hours if activity type qualifies
  const gets20 = (rules.act20 || []).includes(activityType);
  const s20Mins = gets20 ? payableTotal : 0;

  // 34% supplement (Outside Europe) on payable hours
  const gets34 = (rules.act34 || []).includes(activityType);
  const s34Mins = gets34 ? payableTotal : 0;

  return {
    totalHours:        totalMins / 60,
    normalHours:       nMins / 60,
    overtime50Hours:   m50 / 60,
    overtime100Hours:  m100 / 60,
    supplement20Hours: s20Mins / 60,
    supplement34Hours: s34Mins / 60,
    lunchDeducted:     lunchDed / 60,
    payableHours:      payableTotal / 60,
  };
}

export function sumEntries(entries) {
  return entries.reduce((a, e) => {
    const c = e.calculated; if (!c) return a;
    a.totalHours += c.totalHours;
    a.normalHours += c.normalHours;
    a.overtime50Hours += c.overtime50Hours;
    a.overtime100Hours += c.overtime100Hours;
    a.supplement20Hours += c.supplement20Hours;
    a.supplement34Hours += (c.supplement34Hours || 0);  // ← NY
    a.lunchDeducted += c.lunchDeducted;
    a.payableHours += c.payableHours;
    return a;
  }, {
    totalHours: 0, normalHours: 0, overtime50Hours: 0, overtime100Hours: 0,
    supplement20Hours: 0, supplement34Hours: 0,  // ← NY
    lunchDeducted: 0, payableHours: 0,
  });
}

export function calcGross(totals, hourlyWage) {
  const pn = totals.normalHours - totals.lunchDeducted;
  return pn * hourlyWage
    + totals.overtime50Hours  * hourlyWage * 1.5
    + totals.overtime100Hours * hourlyWage * 2
    + totals.supplement20Hours * hourlyWage * 0.2
    + (totals.supplement34Hours || 0) * hourlyWage * 0.34;  // ← NY
}

// ─── Formatters ────────────────────────────────────────────────────────────
export const gid    = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const today  = () => new Date().toISOString().split("T")[0];
export const fh     = (h) => (h || 0).toFixed(2);
export const fc     = (n) => new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 0 }).format(n || 0);
export const fdate  = (s) => !s ? "" : new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
export const fdow   = (s) => !s ? "" : new Date(s + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" });
