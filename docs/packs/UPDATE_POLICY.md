# Aster Vale update preservation policy

The following paths contain player-owned settings. Full client-pack installs and
live patches must never delete or overwrite them:

- `config/voicechat/**`
- `config/pastelpocket-client.properties`

Full pack updates use two ownership modes:

- `mods/**` is strict and is replaced with the server-approved mod set.
- `config/**`, `resourcepacks/**`, `emotes/**`, and `shaderpacks/**` are merged.
  Only files recorded in the previous KTZ managed-file inventory may be removed;
  all other player-added files are preserved.

One complete pre-update backup is retained under the Aster Vale pack cache. A
new successful full update replaces the older retained backup. Failed installs
restore the pre-update folders immediately.

`config/voicechat/**` includes the selected microphone, volumes, push-to-talk,
icon visibility, cached player names, and other Simple Voice Chat preferences.
`config/pastelpocket-client.properties` includes the player's appearance/armor
visibility preference (`hideArmorAppearance`).

The server deployment process must also preserve these server-owned files:

- `plugins/voicechat/voicechat-server.properties`
- `plugins/voicechat/translations.properties`

Before publishing an update, run `npm run test:astervale`. The preservation test
must pass before the pack manifest or launcher release is published.
