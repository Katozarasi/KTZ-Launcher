# KTZ Launcher 3.4 UI preview

Status: 3.4.0 release implementation. Publication is gated by the Windows release workflow; see `docs/releases/3.4.0.md` for the verification scope.

## Visual direction

- KTZ branding; dark graphite shell, blue primary actions, rounded panels.
- Existing Aster Vale night-sky artwork is reused. No reference-launcher branding or character art is copied.
- Top navigation: Home, Library, Skins, Settings, Support.
- Home: account card, live server status, original Play/progress controls, direct-connect toggle and a news rail.
- Login: centered Microsoft login card with the existing authentication handler.
- Library: local installed pack version, live-patch revision, configured maximum RAM, folder/settings shortcuts.
- Support: existing diagnostics, repair and cache tools, plus a direct Minecraft logs shortcut.
- Korean, English and Japanese shell text; keyboard focus indicators and reduced-motion support.

Preview 2 adds account skin upload, reset, front/back previews and owned cape selection. Member packs and an administrator service are **not** implemented. See [SKIN_SETTINGS.md](SKIN_SETTINGS.md) for the new skin tab's safety boundaries and verification.

## Compatibility and boundaries

The shell moves the original DOM nodes instead of cloning or replacing Play, progress, account or updater controls. Authentication, Java selection, game arguments, modpack installation and existing settings are reused.

- ConfigManager defaults and user data paths are unchanged.
- `distribution.json`, `docs/packs/astervale.json` and the published pack assets are unchanged.
- No server files, plugins, worlds or live processes are changed or restarted.
- Settings are validated/saved when leaving Settings through the new navigation.
- Repair/reset actions reject requests during game preparation or gameplay.
- Launch guard restores Play even when Minecraft exits before its initial render log.
- New RSS content is shown as inert text; only HTTP(S) source links are allowed. This is **not** a full Electron context-isolation migration.

## Verification

Use Node 22 and the installed project dependencies:

```powershell
npm run test:launch-guard
npm run test:skins
npm run test:astervale
npm run test:neoforge-managed-pack
npm run test:ui
```

`test:ui` uses a hidden Electron window, a disposable profile under `C:\codex\Temp`, a synthetic account, local distribution data and blocked external UI requests. It does not log in, spawn Minecraft, or touch an existing player profile. Screenshots and results go to `C:\codex\Builds\ktz-redesign-20260924\previews`.

Set `KTZ_UI_LOCALE=en_US` or `ja_JP` to test another language. `KTZ_UI_APP_ROOT` may point to a built `resources/app.asar` to verify the packaged renderer; set a separate `KTZ_UI_OUTPUT` directory under `C:\codex` for those results.

The account name, installed pack state and news items visible in test screenshots are **fixtures**, not live account/server data. Server status is intentionally offline in the test.

## Local build

```powershell
# Keep TEMP/TMP and npm/Electron caches under C:\codex.
npx electron-builder --win dir --x64 --publish never --config.npmRebuild=false --config.win.signAndEditExecutable=false --config.electronDist=node_modules/electron/dist --config.directories.output=C:/codex/Builds/ktz-redesign-20260924/app
```

This produces an **unsigned, unpacked preview**, not an installer. Open `app\win-unpacked\KTZ Launcher.exe` with all adjacent files intact. It uses the normal KTZ profile and game data when launched normally; close the installed KTZ launcher first. The automated tests use an isolated profile instead.

Real account/profile and texture reads were verified read-only on 2026-09-24. Release automation builds the installer and portable zip into a draft, validates updater hashes and tests all three packaged languages before publication. Fresh interactive sign-in, real cosmetic mutations, Minecraft launch/join and interactive NSIS installation are not implied by those checks. Never describe synthetic UI fixtures as an in-game verification.
