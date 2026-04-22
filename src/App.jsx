import { openUrl } from "@tauri-apps/plugin-opener";
import { useState, useEffect, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  calculateEntry, sumEntries, calcGross,
  gid, today, fh, fc, fdate, fdow,
} from "./engine.js";
import { loadData, saveData, clearData, runtime } from "./storage.js";
import { makeDefaults, APP_VERSION, GITHUB_REPO } from "./defaults.js";

// ═══════════════════════════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════
const Chk = ({ on, set, label }) => (
  <label className="chk" onClick={() => set(!on)}>
    <div className={`chkbox${on ? " on" : ""}`}>{on ? "✓" : ""}</div>
    {label && <span className="chklbl">{label}</span>}
  </label>
);

const SDot = ({ label, done }) => (
  <div className={`sdot ${done ? "sdone" : "stodo"}`} title={`${label}: ${done ? "Done" : "Pending"}`}>
    {label[0]}
  </div>
);

const Stat = ({ label, value, sub, color }) => (
  <div className="st">
    <div className="sl">{label}</div>
    <div className={`sv ${color || ""}`}>{value}</div>
    {sub && <div className="ss">{sub}</div>}
  </div>
);

const Modal = ({ title, onClose, children, footer, wide }) => (
  <div className="ov" onClick={(e) => e.target.classList.contains("ov") && onClose()}>
    <div className="modal" style={{ maxWidth: wide ? 720 : 460 }}>
      <div className="mh">
        <div className="mtitle">{title}</div>
        <button className="btn bg2 bsm" onClick={onClose}>✕</button>
      </div>
      <div className="mb">{children}</div>
      {footer && <div className="mf">{footer}</div>}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function Dashboard({ data, setPage }) {
  const period = data.periods[0];
  const pEntries = useMemo(() =>
    !period ? [] : data.entries.filter(e => e.date >= period.startDate && e.date <= period.endDate),
    [data.entries, period]);
  const tot = useMemo(() => sumEntries(pEntries), [pEntries]);
  const hw = data.profile.annualSalary / 1950;
  const gross = calcGross(tot, hw);
  const net = gross * (1 - data.profile.taxPct / 100);
  const expenses = data.expenses.reduce((s, e) => s + e.amount, 0);
  const nae = net - expenses;
  const recent = [...data.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const incomplete = pEntries.filter(e => !e.sap || !e.fiori || !e.visma || !e.zegeba);
  const pn = tot.normalHours - tot.lunchDeducted;

  return (
    <>
      <div className="ph">
        <div className="fb">
          <div>
            <h1 className="pt">Dashboard</h1>
            <p className="ps">
              {period ? `${period.name} · ${fdate(period.startDate)} – ${fdate(period.endDate)}` : "No active period"}
              &nbsp;<span className="rpill">{data.profile.isRotation ? "⟳ ROTATION" : "◻ NON-ROTATION"}</span>
            </p>
          </div>
        </div>
      </div>
      <div className="pc">
        <div className="sg">
          <Stat label="Payable Hours"  value={fh(tot.payableHours) + "h"} sub={`${fh(tot.totalHours)}h total · −${fh(tot.lunchDeducted)}h lunch`} color="tacc" />
          <Stat label="Normal (net)"   value={fh(pn) + "h"}                sub={`gross ${fh(tot.normalHours)}h pre-deduction`}                color="tbl" />
          <Stat label="50% OT"         value={fh(tot.overtime50Hours) + "h"}  sub={fc(tot.overtime50Hours * hw * 1.5)}  color="tacc" />
          <Stat label="100% OT"        value={fh(tot.overtime100Hours) + "h"} sub={fc(tot.overtime100Hours * hw * 2)}   color="trd" />
          <Stat label="Gross Salary"   value={fc(gross)} sub={`Net ≈ ${fc(net)}`}            color="tgr" />
          <Stat label="Net After Exp." value={fc(nae)}   sub={`${fc(expenses)} expenses`}   color={nae < 0 ? "trd" : "tgr"} />
          <Stat label="Incomplete"     value={incomplete.length} sub="entries missing admin" color={incomplete.length ? "trd" : "tgr"} />
          <Stat label="Entries"        value={pEntries.length}   sub="in current period" />
        </div>

        <div className="g2">
          <div className="card">
            <div className="fb mb12">
              <div className="ct" style={{ marginBottom: 0 }}>Recent Entries</div>
              <button className="btn bg2 bsm" onClick={() => setPage("entries")}>View all →</button>
            </div>
            {recent.length === 0 ? (
              <div className="emp">
                <div className="emptit">No entries yet</div>
                <button className="btn bp bsm mt8" onClick={() => setPage("entries")}>Add first entry</button>
              </div>
            ) : (
              <table>
                <thead><tr><th>Date</th><th>Time</th><th>Activity</th><th>Payable</th><th>Status</th></tr></thead>
                <tbody>
                  {recent.map(e => (
                    <tr key={e.id}>
                      <td><span className="mono" style={{ fontSize: 11.5 }}>{fdow(e.date)} {fdate(e.date)}</span></td>
                      <td><span className="mono">{e.fromTime}–{e.toTime}</span></td>
                      <td>{e.activityType}</td>
                      <td><span className="mono tacc">{fh(e.calculated?.payableHours)}h</span></td>
                      <td><div className="fl fg4">
                        <SDot label="SAP" done={e.sap} /><SDot label="FIORI" done={e.fiori} />
                        <SDot label="VISMA" done={e.visma} /><SDot label="Zegeba" done={e.zegeba} />
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="ct">Salary Calculation</div>
            {[
              ["Normal hours (pre-deduct)", fh(tot.normalHours) + "h", "", "tbl"],
              ["Lunch deducted",            "−" + fh(tot.lunchDeducted) + "h", "from normal only", "tmut"],
              ["Payable normal",            fh(pn) + "h", fc(pn * hw), ""],
              ["50% overtime",              fh(tot.overtime50Hours) + "h",  fc(tot.overtime50Hours * hw * 1.5),  "tacc"],
              ["100% overtime",             fh(tot.overtime100Hours) + "h", fc(tot.overtime100Hours * hw * 2),   "trd"],
              ["20% supplement",            fh(tot.supplement20Hours) + "h", fc(tot.supplement20Hours * hw * 0.2), "tpu"],
              ["34% supplement",            fh(tot.supplement34Hours || 0) + "h", fc((tot.supplement34Hours || 0) * hw * 0.34), "tpu"],
            ].map(([l, v, s, c]) => (
              <div key={l} className="cr">
                <span className="tsec" style={{ fontSize: 12 }}>{l}</span>
                <div className="fl fg16">
                  {s && <span className="tmut" style={{ fontSize: 10.5 }}>{s}</span>}
                  <span className={`mono ${c}`} style={{ fontSize: 12.5 }}>{v}</span>
                </div>
              </div>
            ))}
            <div className="divd" />
            <div className="cr"><span className="fw7">Gross salary</span><span className="mono fw7 tgr">{fc(gross)}</span></div>
            <div className="cr"><span className="tsec">Tax ({data.profile.taxPct}%)</span><span className="mono tmut">−{fc(gross * data.profile.taxPct / 100)}</span></div>
            <div className="cr"><span className="fw7">Net salary</span><span className="mono fw7 tacc">{fc(net)}</span></div>
            <div className="cr"><span className="tsec">Monthly expenses</span><span className="mono tmut">−{fc(expenses)}</span></div>
            <div className="cr"><span className="fw7">Net after expenses</span><span className={`mono fw7 ${nae < 0 ? "trd" : "tgr"}`}>{fc(nae)}</span></div>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: TIME ENTRIES
// ═══════════════════════════════════════════════════════════════════════════
const BLANK_ENTRY = {
  date: today(), fromTime: "07:30", toTime: "17:30",
  projectNumber: "", activityId: "", activityType: "Office",
  isOffDuty: false, lunchDeduction: true,
  sap: false, fiori: false, visma: false, zegeba: false, notes: "",
};

function EntryForm({ entry, data, onSave, onClose }) {
  const [f, setF] = useState(entry || BLANK_ENTRY);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (f.date && f.fromTime && f.toTime) {
      try { setPreview(calculateEntry(f, data.profile, data.rules)); }
      catch { setPreview(null); }
    }
  }, [f.date, f.fromTime, f.toTime, f.activityType, f.isOffDuty, f.lunchDeduction, data.profile, data.rules]);

  const up = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));
  const upb = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <Modal wide title={entry ? "Edit Entry" : "New Time Entry"} onClose={onClose}
      footer={<>
        <button className="btn bs" onClick={onClose}>Cancel</button>
        <button className="btn bp" onClick={() => onSave(f)}>{entry ? "Save Changes" : "Add Entry"}</button>
      </>}>
      <div className="g4 mb12">
        <div><label className="lbl">Date</label><input type="date" className="inp" value={f.date} onChange={up("date")} /></div>
        <div><label className="lbl">From</label><input type="time" className="inp" value={f.fromTime} onChange={up("fromTime")} /></div>
        <div><label className="lbl">To</label><input type="time" className="inp" value={f.toTime} onChange={up("toTime")} /></div>
        <div><label className="lbl">Project</label>
          <select className="sel" value={f.projectNumber} onChange={up("projectNumber")}>
            <option value="">— Select —</option>
            {data.projects.map(p => <option key={p.id} value={p.number}>{p.number} {p.name}</option>)}
          </select>
        </div>
      </div>

      <div className="g2 mb12">
        <div><label className="lbl">Activity Type</label>
          <select className="sel" value={f.activityType} onChange={up("activityType")}>
            {data.actTypes.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
        </div>
        <div><label className="lbl">Activity ID</label>
          <input className="inp" placeholder="e.g. ACT-001" value={f.activityId} onChange={up("activityId")} />
        </div>
      </div>

      <div className="fl fg24 mb16" style={{ flexWrap: "wrap" }}>
        <Chk on={f.lunchDeduction} set={v => upb("lunchDeduction", v)}
             label={`Lunch deduction (−${data.profile.lunchMins} min from normal hours)`} />
        {data.profile.isRotation && (
          <Chk on={f.isOffDuty} set={v => upb("isOffDuty", v)} label="OFF Duty / Free period work" />
        )}
      </div>

      <div className="divd" />
      <div className="mb12">
        <label className="lbl">Admin Completion</label>
        <div className="fl fg24" style={{ flexWrap: "wrap" }}>
          {[["sap", "SAP"], ["fiori", "FIORI"], ["visma", "VISMA"], ["zegeba", "Zegeba"]].map(([k, l]) => (
            <Chk key={k} on={f[k]} set={v => upb(k, v)} label={l} />
          ))}
        </div>
      </div>

      <div>
        <label className="lbl">Notes</label>
        <textarea className="inp ta" rows={2} placeholder="Optional notes..." value={f.notes} onChange={up("notes")} />
      </div>

      {preview && (
        <div className="prev-panel">
          <div className="prev-title">Live Calculation Preview</div>
          <div className="detgrid">
            <div><label>Total Hours</label><span>{fh(preview.totalHours)}h</span></div>
            <div><label>Normal Hours</label><span className="tbl">{fh(preview.normalHours)}h</span></div>
            <div><label>Lunch Deducted</label><span className="tmut">−{fh(preview.lunchDeducted)}h</span></div>
            <div><label>Payable Normal</label><span>{fh(preview.normalHours - preview.lunchDeducted)}h</span></div>
            <div><label>50% OT</label><span className="tacc">{fh(preview.overtime50Hours)}h</span></div>
            <div><label>100% OT</label><span className="trd">{fh(preview.overtime100Hours)}h</span></div>
            <div><label>20% Supp.</label><span className="tpu">{fh(preview.supplement20Hours)}h</span></div>
            <div><label>34% Supp.</label><span className="tpu">{fh(preview.supplement34Hours || 0)}h</span></div>
            <div><label>TOTAL PAYABLE</label><span className="tacc fw7">{fh(preview.payableHours)}h</span></div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Entries({ data, setData, toast }) {
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState("");
  const [pf, setPf] = useState("all");

  const sorted = useMemo(() =>
    [...data.entries].sort((a, b) => b.date.localeCompare(a.date) || b.fromTime.localeCompare(a.fromTime)),
    [data.entries]);

  const filtered = useMemo(() => {
    let e = sorted;
    if (pf !== "all") {
      const p = data.periods.find(x => x.id === pf);
      if (p) e = e.filter(x => x.date >= p.startDate && x.date <= p.endDate);
    }
    if (search) {
      const s = search.toLowerCase();
      e = e.filter(x =>
        x.projectNumber?.toLowerCase().includes(s) ||
        x.activityType?.toLowerCase().includes(s) ||
        x.activityId?.toLowerCase().includes(s) ||
        x.notes?.toLowerCase().includes(s));
    }
    return e;
  }, [sorted, pf, search, data.periods]);

  const save = (f) => {
    const calc = calculateEntry(f, data.profile, data.rules);
    const en = { ...f, calculated: calc };
    if (edit) {
      setData(d => ({ ...d, entries: d.entries.map(x => x.id === en.id ? en : x) }));
      toast("Entry updated", "ok");
    } else {
      setData(d => ({ ...d, entries: [...d.entries, { ...en, id: gid() }] }));
      toast("Entry added", "ok");
    }
    setShowForm(false); setEdit(null);
  };

  const del = (id) => {
    if (!confirm("Delete this entry?")) return;
    setData(d => ({ ...d, entries: d.entries.filter(x => x.id !== id) }));
    toast("Deleted", "ok");
  };

  const totph = filtered.reduce((s, e) => s + (e.calculated?.payableHours || 0), 0);

  return (
    <>
      <div className="ph">
        <div className="fb">
          <div>
            <h1 className="pt">Time Entries</h1>
            <p className="ps">{filtered.length} entries · {fh(totph)}h total payable</p>
          </div>
          <button className="btn bp" onClick={() => { setEdit(null); setShowForm(true); }}>+ New Entry</button>
        </div>
      </div>

      <div className="pc">
        <div className="card mb16">
          <div className="g3">
            <div><label className="lbl">Period</label>
              <select className="sel" value={pf} onChange={e => setPf(e.target.value)}>
                <option value="all">All periods</option>
                {data.periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label className="lbl">Search</label>
              <input className="inp" placeholder="Project, activity, notes..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="tbl-wrap">
          {filtered.length === 0 ? (
            <div className="emp"><div className="emptit">No entries match</div></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Time</th><th>Project</th><th>Activity</th>
                  <th>Payable</th><th>Normal</th><th>50%</th><th>100%</th><th>Lunch</th>
                  <th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.flatMap(e => {
                  const rows = [(
                    <tr key={e.id} onClick={() => setExpanded(expanded === e.id ? null : e.id)} style={{ cursor: "pointer" }}>
                      <td><span className="mono" style={{ fontSize: 11.5 }}>{fdow(e.date)} {fdate(e.date)}</span></td>
                      <td><span className="mono">{e.fromTime}–{e.toTime}</span></td>
                      <td>{e.projectNumber ? <span className="tag mono">{e.projectNumber}</span> : "—"}</td>
                      <td>
                        <span style={{ fontSize: 12 }}>{e.activityType}</span>
                        {e.isOffDuty && <span className="badge b50" style={{ marginLeft: 4, fontSize: 9 }}>OFF</span>}
                      </td>
                      <td><span className="mono tacc fw7">{fh(e.calculated?.payableHours)}h</span></td>
                      <td><span className="mono tbl">{fh(e.calculated?.normalHours)}h</span></td>
                      <td><span className="mono tacc">{fh(e.calculated?.overtime50Hours)}h</span></td>
                      <td><span className="mono trd">{fh(e.calculated?.overtime100Hours)}h</span></td>
                      <td><span className="mono tmut">−{fh(e.calculated?.lunchDeducted)}h</span></td>
                      <td>
                        <div className="fl fg4">
                          <SDot label="SAP" done={e.sap} /><SDot label="FIORI" done={e.fiori} />
                          <SDot label="VISMA" done={e.visma} /><SDot label="Zegeba" done={e.zegeba} />
                        </div>
                      </td>
                      <td onClick={(ev) => ev.stopPropagation()}>
                        <div className="fl fg8">
                          <button className="btn bg2 bsm" onClick={() => { setEdit(e); setShowForm(true); }}>Edit</button>
                          <button className="btn bg2 bsm trd" onClick={() => del(e.id)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )];
                  if (expanded === e.id) {
                    rows.push(
                      <tr key={e.id + "-x"}>
                        <td colSpan={11} style={{ background: "var(--bg3)", padding: "0 14px 14px" }}>
                          <div className="detgrid">
                            <div><label>Total</label><span>{fh(e.calculated?.totalHours)}h</span></div>
                            <div><label>Normal</label><span className="tbl">{fh(e.calculated?.normalHours)}h</span></div>
                            <div><label>Lunch</label><span className="tmut">−{fh(e.calculated?.lunchDeducted)}h</span></div>
                            <div><label>Payable Normal</label><span>{fh((e.calculated?.normalHours || 0) - (e.calculated?.lunchDeducted || 0))}h</span></div>
                            <div><label>50% OT</label><span className="tacc">{fh(e.calculated?.overtime50Hours)}h</span></div>
                            <div><label>100% OT</label><span className="trd">{fh(e.calculated?.overtime100Hours)}h</span></div>
                            <div><label>20% Supp.</label><span className="tpu">{fh(preview.supplement20Hours)}h</span></div>
                            <div><label>34% Supp.</label><span className="tpu">{fh(preview.supplement34Hours || 0)}h</span></div>
                            <div><label>Payable Total</label><span className="tacc fw7">{fh(e.calculated?.payableHours)}h</span></div>
                          </div>
                          {e.notes && <div style={{ marginTop: 10, fontSize: 12, color: "var(--t2)" }}>📝 {e.notes}</div>}
                        </td>
                      </tr>
                    );
                  }
                  return rows;
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && <EntryForm entry={edit} data={data} onSave={save} onClose={() => { setShowForm(false); setEdit(null); }} />}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: PAYROLL
// ═══════════════════════════════════════════════════════════════════════════
function Payroll({ data, setData, toast }) {
  const [sel, setSel] = useState(data.periods[0]?.id || "");
  const [showAdd, setShowAdd] = useState(false);
  const [newP, setNewP] = useState({ name: "", startDate: today(), endDate: "" });

  const period = data.periods.find(p => p.id === sel);
  const pEntries = useMemo(() => !period ? [] : data.entries.filter(e => e.date >= period.startDate && e.date <= period.endDate), [data.entries, period]);
  const tot = useMemo(() => sumEntries(pEntries), [pEntries]);

  const hw = data.profile.annualSalary / 1950;
  const pn = tot.normalHours - tot.lunchDeducted;
  const np = pn * hw, p50 = tot.overtime50Hours * hw * 1.5, p100 = tot.overtime100Hours * hw * 2;
  const p20 = tot.supplement20Hours * hw * 0.2;
  const p34 = (tot.supplement34Hours || 0) * hw * 0.34;
  const gross = np + p50 + p100 + p20 + p34;
  const net = gross * (1 - data.profile.taxPct / 100);
  const expenses = data.expenses.reduce((s, e) => s + e.amount, 0);
  const nae = net - expenses;

  const byAct = useMemo(() => {
    const m = {};
    pEntries.forEach(e => {
      if (!m[e.activityType]) m[e.activityType] = { ph: 0, cnt: 0 };
      m[e.activityType].ph += e.calculated?.payableHours || 0;
      m[e.activityType].cnt++;
    });
    return Object.entries(m).map(([name, v]) => ({ name, ...v }));
  }, [pEntries]);

  const byProj = useMemo(() => {
    const m = {};
    pEntries.forEach(e => {
      const k = e.projectNumber || "(no project)";
      if (!m[k]) m[k] = { ph: 0, cnt: 0 };
      m[k].ph += e.calculated?.payableHours || 0;
      m[k].cnt++;
    });
    return Object.entries(m).map(([name, v]) => ({ name, ...v }));
  }, [pEntries]);

  const adm = useMemo(() => ({
    sap: pEntries.filter(e => e.sap).length,
    fiori: pEntries.filter(e => e.fiori).length,
    visma: pEntries.filter(e => e.visma).length,
    zegeba: pEntries.filter(e => e.zegeba).length,
    t: pEntries.length,
  }), [pEntries]);

  const addPeriod = () => {
    if (!newP.name || !newP.startDate || !newP.endDate) return;
    setData(d => ({ ...d, periods: [...d.periods, { ...newP, id: gid() }] }));
    setShowAdd(false); setNewP({ name: "", startDate: today(), endDate: "" });
    toast("Period added", "ok");
  };

  const delPeriod = (id) => {
  if (data.periods.length <= 1) {
    toast("Can't delete the only period", "err");
    return;
  }
  if (!confirm("Delete this period? Time entries within it will NOT be deleted.")) return;
  setData(d => ({ ...d, periods: d.periods.filter(p => p.id !== id) }));
  if (sel === id) setSel(data.periods.find(p => p.id !== id)?.id || "");
  toast("Period deleted", "ok");
};

  return (
    <>
      <div className="ph">
        <div className="fb">
          <div>
            <h1 className="pt">Payroll</h1>
            <p className="ps">Period summaries & salary breakdown</p>
          </div>
          <div className="fl fg8">
            <select className="sel" style={{ width: 220 }} value={sel} onChange={e => setSel(e.target.value)}>
              {data.periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn bs bsm" onClick={() => setShowAdd(true)}>+ Period</button>
{sel && (
  <button className="btn bg2 bsm trd" onClick={() => delPeriod(sel)} title="Delete selected period">
    ✕
  </button>
)}
          </div>
        </div>
      </div>

      <div className="pc">
        <div className="sg mb16">
          <Stat label="Total Hours"    value={fh(tot.totalHours) + "h"}      sub={`${pEntries.length} entries`} />
          <Stat label="Normal (net)"   value={fh(pn) + "h"}                  sub={`−${fh(tot.lunchDeducted)}h lunch`} color="tbl" />
          <Stat label="50% OT"         value={fh(tot.overtime50Hours) + "h"} sub={fc(p50)}  color="tacc" />
          <Stat label="100% OT"        value={fh(tot.overtime100Hours) + "h"} sub={fc(p100)} color="trd" />
          <Stat label="Gross Salary"   value={fc(gross)} sub={`Hourly: ${fc(hw)}/h`}      color="tgr" />
          <Stat label="Net After Exp." value={fc(nae)}   sub={`Net: ${fc(net)}`}           color={nae < 0 ? "trd" : "tgr"} />
        </div>

        <div className="g2 mb16">
          <div className="card">
            <div className="ct">Salary Breakdown</div>
            {[
              [`Normal (${fh(pn)}h × ${fc(hw)})`, fc(np), "tbl"],
              [`50% OT (${fh(tot.overtime50Hours)}h × ${fc(hw)} × 1.5)`, fc(p50), "tacc"],
              [`100% OT (${fh(tot.overtime100Hours)}h × ${fc(hw)} × 2)`, fc(p100), "trd"],
              [`20% supp. (${fh(tot.supplement20Hours)}h × ${fc(hw)} × 0.2)`, fc(p20), "tpu"],
              [`34% supp. (${fh(tot.supplement34Hours || 0)}h × ${fc(hw)} × 0.34)`, fc(p34), "tpu"],
            ].map(([l, v, c]) => (
              <div key={l} className="cr">
                <span className={c} style={{ fontSize: 11.5 }}>{l}</span>
                <span className="mono" style={{ fontSize: 12 }}>{v}</span>
              </div>
            ))}
            <div className="divd" />
            <div className="cr"><span className="fw7">Gross salary</span><span className="mono fw7 tgr">{fc(gross)}</span></div>
            <div className="cr"><span className="tsec">Tax ({data.profile.taxPct}%)</span><span className="mono tmut">−{fc(gross * data.profile.taxPct / 100)}</span></div>
            <div className="cr"><span className="fw7">Net salary</span><span className="mono fw7 tacc">{fc(net)}</span></div>
            <div className="cr"><span className="tsec">Monthly expenses</span><span className="mono tmut">−{fc(expenses)}</span></div>
            <div className="cr"><span className="fw7">Net after expenses</span><span className={`mono fw7 ${nae < 0 ? "trd" : "tgr"}`}>{fc(nae)}</span></div>
          </div>

          <div className="card">
            <div className="ct">Admin Completion</div>
            {[["SAP", adm.sap], ["FIORI", adm.fiori], ["VISMA", adm.visma], ["Zegeba", adm.zegeba]].map(([l, n]) => (
              <div key={l} style={{ marginBottom: 12 }}>
                <div className="fb" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{l}</span>
                  <span className="mono" style={{ fontSize: 12, color: n === adm.t && adm.t > 0 ? "var(--grn)" : "var(--acc)" }}>
                    {n}/{adm.t}
                  </span>
                </div>
                <div className="pbar">
                  <div className={`pbf${n === adm.t && adm.t > 0 ? " pbfg" : ""}`} style={{ width: (adm.t ? (n / adm.t * 100) : 0) + "%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="g2">
          <div className="card">
            <div className="ct">By Activity Type</div>
            {byAct.length === 0 ? <div className="tmut" style={{ fontSize: 12 }}>No entries</div> :
              <table>
                <thead><tr><th>Activity</th><th>Entries</th><th>Payable</th></tr></thead>
                <tbody>
                  {byAct.map(a => (
                    <tr key={a.name}>
                      <td>{a.name}</td>
                      <td><span className="mono">{a.cnt}</span></td>
                      <td><span className="mono tacc">{fh(a.ph)}h</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </div>

          <div className="card">
            <div className="ct">By Project</div>
            {byProj.length === 0 ? <div className="tmut" style={{ fontSize: 12 }}>No entries</div> :
              <table>
                <thead><tr><th>Project</th><th>Entries</th><th>Payable</th></tr></thead>
                <tbody>
                  {byProj.map(a => (
                    <tr key={a.name}>
                      <td><span className="tag mono">{a.name}</span></td>
                      <td><span className="mono">{a.cnt}</span></td>
                      <td><span className="mono tacc">{fh(a.ph)}h</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </div>
        </div>
      </div>

      {showAdd && (
        <Modal title="New Payroll Period" onClose={() => setShowAdd(false)}
          footer={<><button className="btn bs" onClick={() => setShowAdd(false)}>Cancel</button>
                    <button className="btn bp" onClick={addPeriod}>Add</button></>}>
          <div style={{ marginBottom: 12 }}>
            <label className="lbl">Period Name</label>
            <input className="inp" placeholder="e.g. April 2026" value={newP.name} onChange={e => setNewP(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="g2">
            <div><label className="lbl">Start Date</label><input type="date" className="inp" value={newP.startDate} onChange={e => setNewP(p => ({ ...p, startDate: e.target.value }))} /></div>
            <div><label className="lbl">End Date</label><input type="date" className="inp" value={newP.endDate} onChange={e => setNewP(p => ({ ...p, endDate: e.target.value }))} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: EXPENSES
// ═══════════════════════════════════════════════════════════════════════════
function Expenses({ data, setData, toast }) {
  const [showF, setShowF] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ name: "", amount: 0, category: "Housing" });

  const total = data.expenses.reduce((s, e) => s + e.amount, 0);
  const estNet = data.profile.annualSalary / 12 * (1 - data.profile.taxPct / 100);
  const remaining = estNet - total;

  const openNew = () => { setEdit(null); setForm({ name: "", amount: 0, category: "Housing" }); setShowF(true); };
  const openEdit = (e) => { setEdit(e); setForm(e); setShowF(true); };
  const save = () => {
    if (!form.name) return;
    if (edit) setData(d => ({ ...d, expenses: d.expenses.map(x => x.id === edit.id ? { ...form, id: edit.id } : x) }));
    else setData(d => ({ ...d, expenses: [...d.expenses, { ...form, id: gid() }] }));
    setShowF(false); toast("Saved", "ok");
  };
  const del = (id) => { setData(d => ({ ...d, expenses: d.expenses.filter(x => x.id !== id) })); toast("Deleted", "ok"); };

  return (
    <>
      <div className="ph">
        <div className="fb">
          <div>
            <h1 className="pt">Monthly Expenses</h1>
            <p className="ps">Track recurring expenses to estimate remaining net pay</p>
          </div>
          <button className="btn bp" onClick={openNew}>+ Add Expense</button>
        </div>
      </div>

      <div className="pc">
        <div className="sg mb16">
          <Stat label="Total Monthly" value={fc(total)} sub={`${data.expenses.length} items`} color="trd" />
          <Stat label="Est. Net / Month" value={fc(estNet)} sub="Annual ÷ 12 × (1−tax)" color="tacc" />
          <Stat label="Remaining" value={fc(remaining)} sub="after est. expenses" color={remaining < 0 ? "trd" : "tgr"} />
        </div>

        <div className="tbl-wrap">
          {data.expenses.length === 0 ? (
            <div className="emp"><div className="emptit">No expenses tracked</div></div>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Category</th><th>Amount / month</th><th></th></tr></thead>
              <tbody>
                {data.expenses.map(e => (
                  <tr key={e.id}>
                    <td className="fw7">{e.name}</td>
                    <td><span className="tag">{e.category}</span></td>
                    <td><span className="mono trd">{fc(e.amount)}</span></td>
                    <td>
                      <div className="fl fg8">
                        <button className="btn bg2 bsm" onClick={() => openEdit(e)}>Edit</button>
                        <button className="btn bg2 bsm trd" onClick={() => del(e.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="fw7" colSpan={2}>TOTAL</td>
                  <td><span className="mono fw7 trd">{fc(total)}</span></td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showF && (
        <Modal title={edit ? "Edit Expense" : "New Expense"} onClose={() => setShowF(false)}
          footer={<><button className="btn bs" onClick={() => setShowF(false)}>Cancel</button>
                    <button className="btn bp" onClick={save}>Save</button></>}>
          <div style={{ marginBottom: 12 }}>
            <label className="lbl">Name</label>
            <input className="inp" placeholder="e.g. Rent" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="g2">
            <div>
              <label className="lbl">Category</label>
              <select className="sel" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {["Housing", "Utilities", "Food", "Transport", "Subscriptions", "Loans", "Insurance", "Other"].map(c =>
                  <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Amount (NOK)</label>
              <input type="number" className="inp" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ABOUT / UPDATE CHECK
// ═══════════════════════════════════════════════════════════════════════════
function AboutTab({ toast }) {
  const [state, setState] = useState("idle");
  const [latest, setLatest] = useState(null);
  const [releaseUrl, setReleaseUrl] = useState(null);
  const [releaseNotes, setReleaseNotes] = useState("");

  // Safe URL opener — works in Tauri and falls back to window.open in browser
  const openExternal = (url) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      openUrl(url).catch(err => console.error("Open URL failed:", err));
    } else {
      openExternal(url, "_blank");
    }
  };

  // Compare semantic versions. Returns 1 if a > b, -1 if a < b, 0 if equal.
  const compareVersions = (a, b) => {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0, nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  };

  const checkUpdate = async () => {
    setState("checking");
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { "Accept": "application/vnd.github+json" },
      });
      if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
      const data = await res.json();
      const tag = (data.tag_name || "").replace(/^v/, "");
      if (!tag) throw new Error("No version tag found");
      setLatest(tag);
      setReleaseUrl(data.html_url);
      setReleaseNotes(data.body || "");
      const cmp = compareVersions(tag, APP_VERSION);
      if (cmp > 0) setState("outdated");
      else setState("latest");
    } catch (err) {
      console.error("Update check failed:", err);
      setState("error");
      toast("Could not check for updates", "err");
    }
  };

  const openRelease = () => {
    if (releaseUrl) openExternal(releaseUrl);
  };

  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <div className="ct">About TimePay</div>

      <div style={{ marginBottom: 18 }}>
        <div className="fl fg16" style={{ marginBottom: 10 }}>
          <div>
            <div className="tmut" style={{ fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Installed Version</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700 }}>v{APP_VERSION}</div>
          </div>
          {state === "latest" && (
            <div>
              <div className="tmut" style={{ fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Latest</div>
              <div className="mono tgr" style={{ fontSize: 20, fontWeight: 700 }}>v{latest} ✓</div>
            </div>
          )}
          {state === "outdated" && (
            <div>
              <div className="tmut" style={{ fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Available</div>
              <div className="mono tacc" style={{ fontSize: 20, fontWeight: 700 }}>v{latest}</div>
            </div>
          )}
        </div>

        {state === "idle" && (
          <button className="btn bp" onClick={checkUpdate}>Check for updates</button>
        )}

        {state === "checking" && (
          <div className="tsec" style={{ fontSize: 13 }}>Checking GitHub for latest release…</div>
        )}

        {state === "latest" && (
          <>
            <div className="alw" style={{ background: "var(--grnbg)", border: "1px solid rgba(78,203,166,0.3)", color: "var(--grn)" }}>
              You are running the latest version.
            </div>
            <button className="btn bs bsm" onClick={checkUpdate}>Check again</button>
          </>
        )}

        {state === "outdated" && (
          <>
            <div className="alw alwarn">
              A new version is available. Download and install to get the latest features and fixes.
            </div>
            {releaseNotes && (
              <div style={{ background: "var(--bg3)", border: "1px solid var(--br)", borderRadius: "var(--r)", padding: 12, marginBottom: 12 }}>
                <div className="tmut" style={{ fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Release Notes</div>
                <pre style={{ fontFamily: "var(--fn)", fontSize: 12.5, color: "var(--t2)", whiteSpace: "pre-wrap", margin: 0 }}>{releaseNotes}</pre>
              </div>
            )}
            <div className="fl fg8">
              <button className="btn bp" onClick={openRelease}>Download v{latest} →</button>
              <button className="btn bs bsm" onClick={checkUpdate}>Re-check</button>
            </div>
            <div className="tmut" style={{ fontSize: 11, marginTop: 10 }}>
              Export your data first (Exports page) before installing updates, as a safety measure.
            </div>
          </>
        )}

        {state === "error" && (
          <>
            <div className="alw alerr">
              Could not reach GitHub. Check your internet connection and try again.
            </div>
            <button className="btn bs bsm" onClick={checkUpdate}>Try again</button>
          </>
        )}
      </div>

      <div className="divd" />

      <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.7 }}>
        <div style={{ marginBottom: 6 }}>
          <strong className="tsec">Source code:</strong>{" "}
          <a href={`https://github.com/${GITHUB_REPO}`} 
            onClick={(e) => { e.preventDefault(); openExternal(`https://github.com/${GITHUB_REPO}`); }}
            style={{ color: "var(--acc)", textDecoration: "none" }}>
            github.com/{GITHUB_REPO}
          </a>
        </div>
        <div style={{ marginBottom: 6 }}>
          <strong className="tsec">All releases:</strong>{" "}
          <a href={`https://github.com/${GITHUB_REPO}/releases`} 
            onClick={(e) => { e.preventDefault(); openExternal(`https://github.com/${GITHUB_REPO}/releases`); }}
            style={{ color: "var(--acc)", textDecoration: "none" }}>
            View changelog
          </a>
        </div>
        <div className="tmut" style={{ fontSize: 11, marginTop: 10 }}>
          All data is stored locally on your computer. Nothing is sent to any server except this update check.
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: SETTINGS (tabs: Profile / Activities / Projects / Rules)
// ═══════════════════════════════════════════════════════════════════════════
function Settings({ data, setData, toast }) {
  const [tab, setTab] = useState("profile");
  return (
    <>
      <div className="ph">
        <h1 className="pt">Settings</h1>
        <p className="ps">Profile, activity types, projects, and overtime rules</p>
      </div>
      <div className="pc">
        <div className="tabs">
          {["profile", "activities", "projects", "rules", "about"].map(t => (
            <button key={t} className={`tab ${tab === t ? "act" : ""}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        {tab === "profile"    && <ProfileTab  data={data} setData={setData} toast={toast} />}
        {tab === "activities" && <ActsTab     data={data} setData={setData} toast={toast} />}
        {tab === "projects"   && <ProjTab     data={data} setData={setData} toast={toast} />}
        {tab === "rules"      && <RulesTab    data={data} setData={setData} toast={toast} />}
        {tab === "about"      && <AboutTab    toast={toast} />}
      </div>
    </>
  );
}

function ProfileTab({ data, setData, toast }) {
  const [f, setF] = useState(data.profile);
  const hw = f.annualSalary / 1950;
  const save = () => {
    setData(d => ({
      ...d,
      profile: f,
      entries: d.entries.map(e => ({ ...e, calculated: calculateEntry(e, f, d.rules) })),
    }));
    toast("Profile saved & entries recalculated", "ok");
  };
  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <div className="ct">Salary & Profile</div>
      <div className="g2 mb12">
        <div>
          <label className="lbl">Full Name</label>
          <input className="inp" value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div>
          <label className="lbl">Work Mode</label>
          <select className="sel" value={f.isRotation ? "r" : "n"} onChange={e => setF(p => ({ ...p, isRotation: e.target.value === "r" }))}>
            <option value="r">Rotation (07:30–17:30 Mon–Sat)</option>
            <option value="n">Non-Rotation (07:30–15:30 Mon–Fri)</option>
          </select>
        </div>
      </div>
      <div className="g3 mb16">
        <div>
          <label className="lbl">Annual Salary (NOK)</label>
          <input type="number" className="inp" value={f.annualSalary} onChange={e => setF(p => ({ ...p, annualSalary: Number(e.target.value) }))} />
          <div className="tmut" style={{ fontSize: 10.5, marginTop: 4 }}>
            Hourly: <span className="mono tacc">{fc(hw)}/h</span> (÷ 1950)
          </div>
        </div>
        <div>
          <label className="lbl">Tax (%)</label>
          <input type="number" className="inp" value={f.taxPct} min={0} max={100}
            onChange={e => setF(p => ({ ...p, taxPct: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="lbl">Lunch Deduction (min)</label>
          <input type="number" className="inp" value={f.lunchMins} min={0}
            onChange={e => setF(p => ({ ...p, lunchMins: Number(e.target.value) }))} />
          <div className="tmut" style={{ fontSize: 10.5, marginTop: 4 }}>= {(f.lunchMins / 60).toFixed(2)}h</div>
        </div>
      </div>
      <button className="btn bp" onClick={save}>Save Profile</button>
    </div>
  );
}

function ActsTab({ data, setData, toast }) {
  const [showF, setShowF] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ name: "", s20: false, desc: "" });

  const openNew = () => { setEdit(null); setForm({ name: "", s20: false, desc: "" }); setShowF(true); };
  const openEdit = (a) => { setEdit(a); setForm(a); setShowF(true); };
  const save = () => {
    if (!form.name) return;
    if (edit) setData(d => ({ ...d, actTypes: d.actTypes.map(x => x.id === edit.id ? { ...form, id: edit.id } : x) }));
    else setData(d => ({ ...d, actTypes: [...d.actTypes, { ...form, id: gid() }] }));
    setShowF(false); toast("Saved", "ok");
  };
  const del = (id) => { setData(d => ({ ...d, actTypes: d.actTypes.filter(x => x.id !== id) })); toast("Deleted", "ok"); };

  return (
    <>
      <div className="fb mb12">
        <div className="ct" style={{ marginBottom: 0 }}>Activity Types</div>
        <button className="btn bp bsm" onClick={openNew}>+ Add</button>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Name</th><th>20%</th><th>34%</th><th>Description</th><th></th></tr></thead>
          <tbody>
            {data.actTypes.map(a => (
              <tr key={a.id}>
                <td className="fw7">{a.name}</td>
                <td>{a.s20 ? <span className="badge b20">Yes</span> : <span className="tmut">No</span>}</td>
                <td>{a.s34 ? <span className="badge b20">Yes</span> : <span className="tmut">No</span>}</td>
                <td className="tsec">{a.desc}</td>
                <td>
                  <div className="fl fg8">
                    <button className="btn bg2 bsm" onClick={() => openEdit(a)}>Edit</button>
                    <button className="btn bg2 bsm trd" onClick={() => del(a.id)}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showF && (
        <Modal title={edit ? "Edit Activity Type" : "New Activity Type"} onClose={() => setShowF(false)}
          footer={<><button className="btn bs" onClick={() => setShowF(false)}>Cancel</button>
                    <button className="btn bp" onClick={save}>Save</button></>}>
          <div style={{ marginBottom: 12 }}>
            <label className="lbl">Name</label>
            <input className="inp" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="lbl">Description</label>
            <input className="inp" value={form.desc} onChange={e => setForm(p => ({ ...p, desc: e.target.value }))} />
          </div>
          <Chk on={form.s20} set={v => setForm(p => ({ ...p, s20: v }))} label="Eligible for 20% supplement" />
          <div style={{ marginTop: 8 }}>
            <Chk on={form.s34} set={v => setForm(p => ({ ...p, s34: v }))} label="Eligible for 34% supplement (Outside Europe)" />
          </div>
        </Modal>
      )}
    </>
  );
}

function ProjTab({ data, setData, toast }) {
  const [showF, setShowF] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ number: "", name: "" });

  const openNew = () => { setEdit(null); setForm({ number: "", name: "" }); setShowF(true); };
  const openEdit = (p) => { setEdit(p); setForm(p); setShowF(true); };
  const save = () => {
    if (!form.number) return;
    if (edit) setData(d => ({ ...d, projects: d.projects.map(x => x.id === edit.id ? { ...form, id: edit.id } : x) }));
    else setData(d => ({ ...d, projects: [...d.projects, { ...form, id: gid() }] }));
    setShowF(false); toast("Saved", "ok");
  };
  const del = (id) => { setData(d => ({ ...d, projects: d.projects.filter(x => x.id !== id) })); toast("Deleted", "ok"); };

  return (
    <>
      <div className="fb mb12">
        <div className="ct" style={{ marginBottom: 0 }}>Projects</div>
        <button className="btn bp bsm" onClick={openNew}>+ Add</button>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Number</th><th>Name</th><th></th></tr></thead>
          <tbody>
            {data.projects.map(p => (
              <tr key={p.id}>
                <td><span className="tag mono">{p.number}</span></td>
                <td className="fw7">{p.name}</td>
                <td>
                  <div className="fl fg8">
                    <button className="btn bg2 bsm" onClick={() => openEdit(p)}>Edit</button>
                    <button className="btn bg2 bsm trd" onClick={() => del(p.id)}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showF && (
        <Modal title={edit ? "Edit Project" : "New Project"} onClose={() => setShowF(false)}
          footer={<><button className="btn bs" onClick={() => setShowF(false)}>Cancel</button>
                    <button className="btn bp" onClick={save}>Save</button></>}>
          <div style={{ marginBottom: 12 }}>
            <label className="lbl">Project Number</label>
            <input className="inp" placeholder="PRJ-001" value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))} />
          </div>
          <div><label className="lbl">Name</label>
            <input className="inp" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
        </Modal>
      )}
    </>
  );
}

function RulesTab({ data, setData, toast }) {
  const [f, setF] = useState(JSON.parse(JSON.stringify(data.rules)));
  const save = () => {
    setData(d => ({
      ...d,
      rules: f,
      entries: d.entries.map(e => ({ ...e, calculated: calculateEntry(e, d.profile, f) })),
    }));
    toast("Rules saved & all entries recalculated", "ok");
  };
  const upd = (section, key) => (e) => setF(r => ({ ...r, [section]: { ...r[section], [key]: e.target.value } }));
  const updT = (key) => (e) => setF(r => ({ ...r, [key]: e.target.value }));
  const updArr = (key) => (e) => setF(r => ({ ...r, [key]: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }));

  const fields = [
    ["Normal start",    "normalStart"], ["Normal end",      "normalEnd"],
    ["Early 50% start", "earlyStart"],  ["Early 50% end",   "earlyEnd"],
    ["50% period end",  "fiftyEnd"],
  ];

  return (
    <>
      <div className="alw alwarn">⚠ Saving rules recalculates all existing time entries automatically.</div>

      <div className="g2 mb16">
        <div className="card">
          <div className="ct">Rotation Time Windows</div>
          {fields.map(([l, k]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <label className="lbl">{l}</label>
              <input type="time" className="inp" value={f.rot[k] || ""} onChange={upd("rot", k)} />
            </div>
          ))}
        </div>
        <div className="card">
          <div className="ct">Non-Rotation Time Windows</div>
          {fields.map(([l, k]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <label className="lbl">{l}</label>
              <input type="time" className="inp" value={f.noRot[k] || ""} onChange={upd("noRot", k)} />
            </div>
          ))}
        </div>
      </div>

      <div className="card mb16" style={{ maxWidth: 720 }}>
        <div className="ct">Supplements & Special Rules</div>
        <div className="g2">
          <div style={{ marginBottom: 10 }}>
            <label className="lbl">Travel OT — Sat after</label>
            <input type="time" className="inp" value={f.travelSatAfter} onChange={updT("travelSatAfter")} />
            <div className="tmut" style={{ fontSize: 10.5, marginTop: 3 }}>Travel after this on Sat = 50% OT</div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label className="lbl">20% Supplement Activity Types</label>
            <input className="inp" value={(f.act20 || []).join(", ")} onChange={updArr("act20")} />
            <div className="tmut" style={{ fontSize: 10.5, marginTop: 3 }}>Comma-separated. These activities get +20% on payable hours.</div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label className="lbl">34% Supplement Activity Types (Outside Europe)</label>
            <input className="inp" value={(f.act34 || []).join(", ")} onChange={updArr("act34")} />
            <div className="tmut" style={{ fontSize: 10.5, marginTop: 3 }}>Comma-separated. These activities get +34% on payable hours.</div>
          </div>
          <div>
            <label className="lbl">OFF Duty — Home Working rate</label>
            <select className="sel" value={f.offDutyHome} onChange={updT("offDutyHome")}>
              <option value="50">50% supplement</option>
              <option value="100">100% supplement</option>
              <option value="normal">Normal (no supplement)</option>
            </select>
          </div>
          <div>
            <label className="lbl">OFF Duty — Working Onsite rate</label>
            <select className="sel" value={f.offDutyOnsite} onChange={updT("offDutyOnsite")}>
              <option value="50">50% supplement</option>
              <option value="100">100% supplement</option>
              <option value="normal">Normal (no supplement)</option>
            </select>
          </div>
        </div>
      </div>

      <button className="btn bp" onClick={save}>Save Rules & Recalculate All</button>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE: EXPORTS (Excel / PDF + safe reset)
// ═══════════════════════════════════════════════════════════════════════════
function Exports({ data, setData, toast }) {
  const [sel, setSel] = useState(data.periods[0]?.id || "all");
  const [resetStep, setResetStep] = useState(0); // 0: hidden, 1: confirm, 2: exported

  const getEntries = () => {
    if (sel === "all") return data.entries;
    const p = data.periods.find(x => x.id === sel);
    return p ? data.entries.filter(e => e.date >= p.startDate && e.date <= p.endDate) : data.entries;
  };

  const periodLabel = sel === "all" ? "All Time" : (data.periods.find(p => p.id === sel)?.name || "");

  const buildTotals = (entries) => {
    const tot = sumEntries(entries);
    const hw = data.profile.annualSalary / 1950;
    const gross = calcGross(tot, hw);
    const net = gross * (1 - data.profile.taxPct / 100);
    return { tot, hw, gross, net, pn: tot.normalHours - tot.lunchDeducted };
  };

  const exportExcel = () => {
    const entries = getEntries().sort((a, b) => a.date.localeCompare(b.date));
    const { tot, hw, gross, net, pn } = buildTotals(entries);

    const rows = entries.map(e => ({
      "Date": e.date, "Day": fdow(e.date), "From": e.fromTime, "To": e.toTime,
      "Project": e.projectNumber || "", "Activity ID": e.activityId || "",
      "Activity Type": e.activityType, "Off Duty": e.isOffDuty ? "Yes" : "No",
      "Lunch Applied": e.lunchDeduction ? "Yes" : "No",
      "Total Hours":       +(e.calculated?.totalHours || 0).toFixed(2),
      "Normal Hours":      +(e.calculated?.normalHours || 0).toFixed(2),
      "Lunch Deducted":    +(e.calculated?.lunchDeducted || 0).toFixed(2),
      "Payable Normal":    +((e.calculated?.normalHours || 0) - (e.calculated?.lunchDeducted || 0)).toFixed(2),
      "50% OT":            +(e.calculated?.overtime50Hours || 0).toFixed(2),
      "100% OT":           +(e.calculated?.overtime100Hours || 0).toFixed(2),
      "20% Supp.":         +(e.calculated?.supplement20Hours || 0).toFixed(2),
      "34% Supp.":         +(e.calculated?.supplement34Hours || 0).toFixed(2),
      "Payable Hours":     +(e.calculated?.payableHours || 0).toFixed(2),
      "SAP": e.sap ? "✓" : "", "FIORI": e.fiori ? "✓" : "",
      "VISMA": e.visma ? "✓" : "", "Zegeba": e.zegeba ? "✓" : "",
      "Notes": e.notes || "",
    }));

    const summary = [
      { "Item": "Period", "Value": periodLabel, "Unit": "" },
      { "Item": "Worker", "Value": data.profile.name, "Unit": "" },
      { "Item": "Work Mode", "Value": data.profile.isRotation ? "Rotation" : "Non-Rotation", "Unit": "" },
      { "Item": "Total Hours",       "Value": +tot.totalHours.toFixed(2),      "Unit": "hours" },
      { "Item": "Normal Hours",      "Value": +tot.normalHours.toFixed(2),     "Unit": "hours" },
      { "Item": "Lunch Deducted",    "Value": +tot.lunchDeducted.toFixed(2),   "Unit": "hours" },
      { "Item": "Payable Normal",    "Value": +pn.toFixed(2),                  "Unit": "hours" },
      { "Item": "50% OT Hours",      "Value": +tot.overtime50Hours.toFixed(2), "Unit": "hours" },
      { "Item": "100% OT Hours",     "Value": +tot.overtime100Hours.toFixed(2),"Unit": "hours" },
      { "Item": "20% Supp Hours",    "Value": +tot.supplement20Hours.toFixed(2),"Unit": "hours" },
      { "Item": "34% Supp Hours",    "Value": +(tot.supplement34Hours || 0).toFixed(2),"Unit": "hours" },
      { "Item": "Total Payable",     "Value": +tot.payableHours.toFixed(2),    "Unit": "hours" },
      { "Item": "Hourly Wage",       "Value": +hw.toFixed(2),                   "Unit": "NOK" },
      { "Item": "Gross Salary",      "Value": +gross.toFixed(2),                "Unit": "NOK" },
      { "Item": `Tax (${data.profile.taxPct}%)`, "Value": +(gross * data.profile.taxPct / 100).toFixed(2), "Unit": "NOK" },
      { "Item": "Net Salary",        "Value": +net.toFixed(2),                  "Unit": "NOK" },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Time Entries");
    XLSX.writeFile(wb, `timepay_${periodLabel.replace(/\s+/g, "_")}_${today()}.xlsx`);
    toast("Excel exported", "ok");
    return true;
  };

  const exportPDF = () => {
    const entries = getEntries().sort((a, b) => a.date.localeCompare(b.date));
    const { tot, hw, gross, net, pn } = buildTotals(entries);
    const expenses = data.expenses.reduce((s, e) => s + e.amount, 0);
    const nae = net - expenses;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>TimePay Report — ${periodLabel}</title>
<style>
  @media print { @page { size: A4; margin: 18mm; } .no-print { display: none; } }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1a1f36; margin: 0; padding: 32px; font-size: 11.5px; line-height: 1.45; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.3px; }
  .sub { color: #5a6a87; font-size: 11px; margin-bottom: 22px; }
  .sgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
  .tile { background: #f7f9fc; border-radius: 8px; padding: 12px; border: 1px solid #e3e8f2; }
  .tl { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.8px; color: #5a6a87; margin-bottom: 4px; font-weight: 600; }
  .tv { font-size: 17px; font-weight: 700; color: #1a1f36; }
  h2 { font-size: 14px; margin: 22px 0 10px; letter-spacing: -0.2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { background: #1a1f36; color: #fff; padding: 7px 8px; text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; }
  td { padding: 6px 8px; border-bottom: 1px solid #eaeef7; font-size: 10.5px; }
  tr:nth-child(even) td { background: #fbfcfe; }
  .mono { font-family: 'SF Mono', 'Consolas', monospace; }
  .acc { color: #c47e00; font-weight: 600; } .grn { color: #1d8a6b; font-weight: 600; } .red { color: #c43b3b; font-weight: 600; }
  .salary-table { max-width: 440px; }
  .salary-table td { border-bottom: 1px solid #e3e8f2; padding: 6px 0; }
  .salary-table td:last-child { text-align: right; }
  .total-row td { font-weight: 700; border-top: 2px solid #1a1f36 !important; background: #f7f9fc !important; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e3e8f2; font-size: 10px; color: #8594ae; text-align: center; }
  .no-print { position: fixed; top: 16px; right: 16px; background: #1a1f36; color: white; border: none; padding: 10px 16px; border-radius: 6px; font-size: 12px; cursor: pointer; }
</style>
</head><body>
<button class="no-print" onclick="window.print()">🖨 Print / Save PDF</button>
<h1>TimePay — Payroll Report</h1>
<div class="sub">Period: <b>${periodLabel}</b> · Worker: <b>${data.profile.name}</b> · ${data.profile.isRotation ? "Rotation" : "Non-Rotation"} · Generated ${new Date().toLocaleDateString("en-GB")}</div>

<div class="sgrid">
  <div class="tile"><div class="tl">Total Hours</div><div class="tv">${fh(tot.totalHours)}h</div></div>
  <div class="tile"><div class="tl">Payable Hours</div><div class="tv acc">${fh(tot.payableHours)}h</div></div>
  <div class="tile"><div class="tl">Gross Salary</div><div class="tv grn">${fc(gross)}</div></div>
  <div class="tile"><div class="tl">Net Salary</div><div class="tv acc">${fc(net)}</div></div>
</div>

<h2>Hour &amp; Salary Breakdown</h2>
<table class="salary-table">
  <tr><td>Normal hours (pre-deduct)</td><td class="mono">${fh(tot.normalHours)}h</td></tr>
  <tr><td>Lunch deducted</td><td class="mono">−${fh(tot.lunchDeducted)}h</td></tr>
  <tr><td>Payable normal</td><td class="mono">${fh(pn)}h × ${fc(hw)} = <b>${fc(pn * hw)}</b></td></tr>
  <tr><td>50% overtime</td><td class="mono acc">${fh(tot.overtime50Hours)}h × ${fc(hw)} × 1.5 = ${fc(tot.overtime50Hours * hw * 1.5)}</td></tr>
  <tr><td>100% overtime</td><td class="mono red">${fh(tot.overtime100Hours)}h × ${fc(hw)} × 2 = ${fc(tot.overtime100Hours * hw * 2)}</td></tr>
  <tr><td>20% supplement</td><td class="mono">${fh(tot.supplement20Hours)}h × ${fc(hw)} × 0.2 = ${fc(tot.supplement20Hours * hw * 0.2)}</td></tr>
  <tr><td>34% supplement</td><td class="mono">${fh(tot.supplement34Hours || 0)}h × ${fc(hw)} × 0.34 = ${fc((tot.supplement34Hours || 0) * hw * 0.34)}</td></tr>
  <tr class="total-row"><td>Gross salary</td><td class="mono grn">${fc(gross)}</td></tr>
  <tr><td>Tax (${data.profile.taxPct}%)</td><td class="mono">−${fc(gross * data.profile.taxPct / 100)}</td></tr>
  <tr class="total-row"><td>Net salary</td><td class="mono acc">${fc(net)}</td></tr>
  <tr><td>Monthly expenses</td><td class="mono">−${fc(expenses)}</td></tr>
  <tr class="total-row"><td>Net after expenses</td><td class="mono ${nae < 0 ? "red" : "grn"}">${fc(nae)}</td></tr>
</table>

<h2>Time Entries (${entries.length})</h2>
<table>
  <thead><tr>
    <th>Date</th><th>Time</th><th>Project</th><th>Activity</th>
    <th>Normal</th><th>Lunch</th><th>50%</th><th>100%</th><th>Payable</th>
    <th>SAP</th><th>FIO</th><th>VIS</th><th>ZEG</th>
  </tr></thead>
  <tbody>
    ${entries.map(e => `<tr>
      <td class="mono">${fdow(e.date)} ${fdate(e.date)}</td>
      <td class="mono">${e.fromTime}–${e.toTime}</td>
      <td>${e.projectNumber || "—"}</td>
      <td>${e.activityType}${e.isOffDuty ? " <b>(OFF)</b>" : ""}</td>
      <td class="mono">${fh(e.calculated?.normalHours)}h</td>
      <td class="mono">−${fh(e.calculated?.lunchDeducted)}h</td>
      <td class="mono acc">${fh(e.calculated?.overtime50Hours)}h</td>
      <td class="mono red">${fh(e.calculated?.overtime100Hours)}h</td>
      <td class="mono acc"><b>${fh(e.calculated?.payableHours)}h</b></td>
      <td>${e.sap ? "✓" : "·"}</td><td>${e.fiori ? "✓" : "·"}</td>
      <td>${e.visma ? "✓" : "·"}</td><td>${e.zegeba ? "✓" : "·"}</td>
    </tr>`).join("")}
  </tbody>
</table>

<div class="footer">TimePay · Generated ${new Date().toLocaleString("en-GB")} · Local data only</div>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = openExternal(url, "_blank");
    if (!win) toast("Pop-up blocked — allow pop-ups to open PDF", "err");
    else toast("Report opened — use browser Print → Save as PDF", "ok");
    return true;
  };

  const handleReset = async () => {
    await clearData();
    window.location.reload();
  };

  return (
    <>
      <div className="ph">
        <h1 className="pt">Exports & Reset</h1>
        <p className="ps">Download your data as Excel or PDF, or reset the app safely</p>
      </div>
      <div className="pc">
        <div className="card mb16" style={{ maxWidth: 620 }}>
          <div className="ct">Export</div>
          <div style={{ marginBottom: 14 }}>
            <label className="lbl">Period</label>
            <select className="sel" value={sel} onChange={e => setSel(e.target.value)}>
              <option value="all">All time entries</option>
              {data.periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="fl fg8">
            <button className="btn bp" onClick={exportExcel}>⬇ Export Excel (.xlsx)</button>
            <button className="btn bs" onClick={exportPDF}>⬇ Export PDF Report</button>
          </div>
          <div className="tmut" style={{ fontSize: 11, marginTop: 10 }}>
            Excel includes a Summary sheet and a Time Entries sheet with all calculated fields.
            PDF opens in a new tab — use your browser's Print dialog → "Save as PDF".
          </div>
        </div>

        <div className="card" style={{ maxWidth: 620, borderColor: "rgba(232,91,91,0.3)" }}>
          <div className="ct trd">⚠ Reset App Data</div>
          <p className="tsec" style={{ fontSize: 12.5, marginBottom: 14 }}>
            This permanently deletes all time entries, profile, expenses, and settings. You must export first.
          </p>
          {resetStep === 0 && (
            <button className="btn bd" onClick={() => setResetStep(1)}>Begin Export & Reset</button>
          )}
          {resetStep === 1 && (
            <>
              <div className="alw alerr">Please export your data before resetting. Click both buttons below:</div>
              <div className="fl fg8" style={{ marginBottom: 12 }}>
                <button className="btn bs" onClick={() => { exportExcel(); setResetStep(2); }}>1. Export Excel</button>
                <button className="btn bs" onClick={() => { exportPDF(); }}>2. Export PDF</button>
              </div>
              <button className="btn bg2 bsm" onClick={() => setResetStep(0)}>Cancel</button>
            </>
          )}
          {resetStep === 2 && (
            <>
              <div className="alw alwarn">Excel exported. Now confirm the reset.</div>
              <div className="fl fg8">
                <button className="btn bs" onClick={() => setResetStep(0)}>Cancel</button>
                <button className="btn bd" onClick={handleReset}>Yes, Delete All Data</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
const NAV = [
  { id: "dashboard", label: "Dashboard",    icon: "⬡", section: "Overview" },
  { id: "entries",   label: "Time Entries", icon: "⏱", section: "Track"    },
  { id: "payroll",   label: "Payroll",      icon: "₣", section: "Track"    },
  { id: "expenses",  label: "Expenses",     icon: "⊟", section: "Track"    },
  { id: "exports",   label: "Exports",      icon: "⬇", section: "Tools"    },
  { id: "settings",  label: "Settings",     icon: "⚙", section: "Tools"    },
];

export default function App() {
  const [data, _setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [toasts, setToasts] = useState([]);

  // Initial async load from persistent storage (Tauri file or localStorage)
  useEffect(() => {
    (async () => {
      const loaded = await loadData();
      _setData(loaded || makeDefaults());
      setLoading(false);
    })();
  }, []);

  const setData = useCallback((u) => {
    _setData(prev => {
      const next = typeof u === "function" ? u(prev) : u;
      saveData(next).catch(err => console.error("Save failed:", err));
      return next;
    });
  }, []);

  const toast = useCallback((message, type = "ok") => {
    const id = gid();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);

  if (loading || !data) {
    return (
      <div className="loading-splash">
        <div className="logo">Time<span>Pay</span></div>
        <div className="loading-sub">Loading…</div>
      </div>
    );
  }

  const sections = [...new Set(NAV.map(n => n.section))];

  return (
    <>
      <div className="app">
        <aside className="sb">
          <div className="sbl">
            <div className="logo">Time<span>Pay</span></div>
            <div className="logosub">v{APP_VERSION}</div>
          </div>
          <nav className="sbn">
            {sections.map(s => (
              <div key={s}>
                <div className="nsl">{s}</div>
                {NAV.filter(n => n.section === s).map(item => (
                  <button key={item.id} className={`ni ${page === item.id ? "act" : ""}`} onClick={() => setPage(item.id)}>
                    <span className="nicon">{item.icon}</span>{item.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="sbfoot">
            {data.profile.name}<br />
            {data.profile.isRotation ? "Rotation" : "Non-Rotation"} · {fc(data.profile.annualSalary / 1950)}/h<br />
            <span className="tmut">v{APP_VERSION}</span>
          </div>
        </aside>

        <main className="main">
          {page === "dashboard" && <Dashboard data={data} setPage={setPage} />}
          {page === "entries"   && <Entries   data={data} setData={setData} toast={toast} />}
          {page === "payroll"   && <Payroll   data={data} setData={setData} toast={toast} />}
          {page === "expenses"  && <Expenses  data={data} setData={setData} toast={toast} />}
          {page === "settings"  && <Settings  data={data} setData={setData} toast={toast} />}
          {page === "exports"   && <Exports   data={data} setData={setData} toast={toast} />}
        </main>
      </div>

      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type === "ok" ? "tsok" : "tserr"}`}>{t.message}</div>
        ))}
      </div>
    </>
  );
}
