// ═══════════════════════════════════════════════════════════════════════════
// STORAGE — works in both Tauri (native file) and browser (localStorage)
// ═══════════════════════════════════════════════════════════════════════════
//
// In Tauri production: data persists to a JSON file in the OS app-data dir.
// In browser dev: data persists to localStorage (so you can iterate in Chrome).
//
// Both code paths are async-first so the calling code never cares which.
// ═══════════════════════════════════════════════════════════════════════════

const LS_KEY = "timepay_v1";
const STORE_FILE = "timepay.json";
const STORE_KEY = "data";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let _store = null;
async function getStore() {
  if (_store) return _store;
  const { Store } = await import("@tauri-apps/plugin-store");
  _store = await Store.load(STORE_FILE, { autoSave: false });
  return _store;
}

export async function loadData() {
  if (isTauri) {
    try {
      const store = await getStore();
      const val = await store.get(STORE_KEY);
      return val ?? null;
    } catch (err) {
      console.error("Tauri store load failed:", err);
      return null;
    }
  }
  try {
    const r = localStorage.getItem(LS_KEY);
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
}

export async function saveData(data) {
  if (isTauri) {
    const store = await getStore();
    await store.set(STORE_KEY, data);
    await store.save();
    return;
  }
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

export async function clearData() {
  if (isTauri) {
    const store = await getStore();
    await store.clear();
    await store.save();
    return;
  }
  localStorage.removeItem(LS_KEY);
}

export const runtime = isTauri ? "tauri" : "browser";
