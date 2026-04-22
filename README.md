# TimePay — Desktop App

A local time-tracking and payroll app for rotation / non-rotation workers with rule-based overtime, lunch deduction, SAP/FIORI/VISMA/Zegeba status tracking, and Excel/PDF export. Built with Tauri 2 + React. Runs fully offline.

---

## Installation (Windows)

Download the latest installer from the [Releases page] (https://github.com/oskarrakvaag/timepay/releases/tag/TimePay).

Double-click the `.msi` file. Windows may show a "Unknown publisher" warning — click **More info** → **Run anyway**.

## Prerequisites (one-time setup)

You need two things installed globally on your computer:

### 1. Node.js (LTS, v20+)
Download & install from https://nodejs.org — pick the LTS installer for your OS.

### 2. Rust (for Tauri)
Follow https://www.rust-lang.org/tools/install (pick your OS, run the installer).

### 3. Platform build tools
- **Windows**: Install **Microsoft C++ Build Tools** (or Visual Studio 2022 with "Desktop development with C++" workload). Also install **WebView2 Runtime** (usually pre-installed on Windows 10/11).
- **macOS**: `xcode-select --install`
- **Linux**: Install webkit2gtk and build deps — see https://tauri.app/start/prerequisites/

Verify everything works:
```bash
node --version     # should print v20.x or higher
cargo --version    # should print cargo 1.x
```

---

## Quick start

Open a terminal in this folder (`timepay-desktop/`) and run:

```bash
npm install
npm run tauri dev
```

The first run takes a few minutes (Rust compiles all Tauri dependencies). After that, the app opens in its own window — that's TimePay running.

## Building a shareable installer

```bash
npm run tauri build
```

The installer ends up in `src-tauri/target/release/bundle/`:
- **Windows**: `msi/TimePay_1.0.0_x64_en-US.msi` and `nsis/TimePay_1.0.0_x64-setup.exe`
- **macOS**: `dmg/TimePay_1.0.0_aarch64.dmg` (or `_x64.dmg` on Intel Macs)
- **Linux**: `appimage/time-pay_1.0.0_amd64.AppImage` and `deb/time-pay_1.0.0_amd64.deb`

Double-click that file to install, or share it with others (same OS only).

---

## Where your data lives

Your time entries, profile, and settings are saved as a single JSON file in your OS's standard app data folder:

- **Windows**: `%APPDATA%\com.timepay.app\timepay.json`
- **macOS**: `~/Library/Application Support/com.timepay.app/timepay.json`
- **Linux**: `~/.local/share/com.timepay.app/timepay.json`

You can back this up, copy it between computers, or open it directly to inspect.

---

## Browser-only development (no Rust needed)

If you just want to quickly try changes without compiling Tauri:

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. In browser mode, data falls back to `localStorage` automatically.

---

## App icons (optional)

Tauri includes default icons. To use your own, drop a 1024x1024 PNG named `app-icon.png` in the project root and run:

```bash
npx @tauri-apps/cli icon app-icon.png
```

This regenerates every icon size and format. Then rebuild.

---

## Project structure

```
timepay-desktop/
├── package.json              Node deps + scripts
├── vite.config.js            Vite dev server config
├── index.html                HTML entry
├── src/
│   ├── main.jsx              React bootstrap
│   ├── App.jsx               All UI pages + components
│   ├── engine.js             Overtime calculation (pure, testable)
│   ├── storage.js            Tauri Store ↔ localStorage abstraction
│   ├── defaults.js           Default profile, rules, activities
│   └── App.css               All styles
└── src-tauri/
    ├── Cargo.toml            Rust deps
    ├── tauri.conf.json       Tauri window + bundle config
    ├── build.rs              Build script
    ├── capabilities/         Tauri 2 permissions
    └── src/main.rs           Rust entry point
```

---

## Troubleshooting

**"cargo: command not found"** — Restart your terminal after installing Rust.

**Windows build fails with "link.exe not found"** — You're missing C++ Build Tools. Install Visual Studio 2022 Community with the "Desktop development with C++" workload.

**macOS build fails with code signing error** — For personal use, you can skip signing by setting `"signingIdentity": null` (already the default in tauri.conf.json). The app will work but show "unidentified developer" warning on first launch (right-click → Open to bypass).

**Changes to rules aren't recalculating old entries** — This is by design: rules recalc happens when you click "Save Rules" in Settings → Rules.
