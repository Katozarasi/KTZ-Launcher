# Aster Vale update preservation policy

The following paths contain player-owned settings. Full client-pack installs and
live patches must never delete or overwrite them:

- `config/voicechat/**`
- `config/pastelpocket-client.properties`

`config/voicechat/**` includes the selected microphone, volumes, push-to-talk,
icon visibility, cached player names, and other Simple Voice Chat preferences.
`config/pastelpocket-client.properties` includes the player's appearance/armor
visibility preference (`hideArmorAppearance`).

The server deployment process must also preserve these server-owned files:

- `plugins/voicechat/voicechat-server.properties`
- `plugins/voicechat/translations.properties`

Before publishing an update, run `npm run test:astervale`. The preservation test
must pass before the pack manifest or launcher release is published.
