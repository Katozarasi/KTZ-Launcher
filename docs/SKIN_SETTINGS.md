# Skin settings — 3.4.0

Release implementation. No existing account appearance was changed during development. See `docs/releases/3.4.0.md` for the public verification boundary.

## Included

- Top-level Skins tab in Korean, English and Japanese.
- Current authenticated Minecraft Java profile, Classic/Slim model, owned capes, active cape.
- Local pixel-accurate front/back preview of a selected 64x64 PNG, including second layers. Original bytes are uploaded unchanged.
- PNG signature, dimensions, 1MiB limit and native decoder checks before accepting a file.
- Select PNG -> local preview -> Apply -> account-wide confirmation -> upload.
- Restore account default skin (not an undo of an earlier custom skin).
- Equip an owned Java cape or remove the active cape, with confirmation. No custom/free/unowned capes are fabricated.
- Selecting a model or cape alone does not change the account.

## Network and account boundaries

`skinmanager.js` uses existing ConfigManager/AuthManager authentication. Only Microsoft accounts are supported. Tokens are neither exposed in UI/debug APIs nor written to new files nor logged by this service. API errors are converted to fixed, localized messages; headers and raw responses are not shown.

Authenticated requests only target `https://api.minecraftservices.com/minecraft/profile` and fixed skin/cape subpaths. There are no redirects or automatic retries; a timeout can have an ambiguous mutation result, so the user is instructed to refresh before retrying. Image requests carry no authorization and accept only Minecraft's texture hostname and hash paths, upgraded to HTTPS. Responses are size bounded with a 20-second deadline.

Skin/cape changes require an explicit confirmation naming the selected account. Every service boundary checks the account UUID; switching accounts/logging out discards pending files/dialogs and ignores stale results. Concurrent changes are rejected. Game preparation/running blocks cosmetic mutation in both UI and service. Cape ownership is fetched again before sending PUT.

Changing cosmetics affects the Minecraft account, not just this launcher/server. Changes may take time to appear in running/cached clients. With no custom skin returned by the profile API the UI honestly shows “account default skin” instead of inventing a default model/texture.

## API references

- [Minecraft: What is a Minecraft Skin?](https://www.minecraft.net/en-us/article/what-is-minecraft-skin)
- [XMCL account API implementation](https://github.com/voxelum/minecraft-launcher-core-node/blob/master/packages/user/mojang.ts): profile GET, skin multipart POST, active skin DELETE, active cape PUT/DELETE. Reviewed as an implementation reference, no source was copied or dependency added.

## Verification

- `npm run test:skins`: synthetic transport tests, PNG validation, ownership, account switches, concurrency, error sanitization and API request shapes.
- `npm run test:ui`: real hidden Electron renderer, isolated profile, synthetic skin/cape fixtures injected at the service boundary. Upload/reset/equip are tested against fixtures, never a real account.
- Test tools and fixtures are excluded from packaged app.asar.
- Existing launch-guard and managed-pack preservation tests remain required.

Windows preview: `C:\codex\Builds\ktz-skins-20260924\app\win-unpacked\KTZ Launcher.exe`. Keep all adjacent files. Close an already-running KTZ launcher first. The normal executable uses the existing KTZ profile; automated checks use a disposable profile under `C:\codex\Temp`.

On 2026-09-24, a read-only check using the existing signed-in account successfully retrieved the real profile, current skin texture and owned capes. No account mutation or token refresh was performed by that check.

**Verification boundary:** mutation requests are covered by isolated fixtures, not by changing a real user's skin/cape. Fresh interactive sign-in and Minecraft appearance checks remain manual. A 403 must be shown as a failure, never as a successful change. Release automation checks all three packaged languages and installer/updater hashes before publishing the draft release.
