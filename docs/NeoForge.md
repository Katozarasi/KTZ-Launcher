# KTZ Launcher NeoForge Support

KTZ Launcher supports NeoForge in compatibility mode.

NeoForge is handled as an FML-based loader. For the current MRS/Helios distribution format, use the same module flow as modern Forge:

- Loader module type: `ForgeHosted`
- Version json module type: `VersionManifest`
- NeoForge/Forge-style client mods: `ForgeMod`

This means NeoForge client mod jars are registered as `ForgeMod` in `distribution.json`, because the launcher passes them through the same FML mod list path used by Forge 1.13+.

## Required files

For a NeoForge server profile, prepare the NeoForge client installation first and collect:

1. NeoForge version manifest json
2. NeoForge loader/client jar files
3. required libraries
4. each file size and MD5
5. download URL for each file, or a GitHub raw URL when the file has no public Maven URL

The structure is similar to the current Forge 1.20.4 profile.

## Server config recommendation

In `distribution.json`, mark a NeoForge server like this:

```json
"ktz": {
  "loader": "neoforge",
  "i18n": {
    "ko_KR": {
      "name": "서버 이름",
      "subtitle": "서버 설명"
    },
    "ja_JP": {
      "name": "サーバー名",
      "subtitle": "サーバー説明"
    },
    "en_US": {
      "name": "Server Name",
      "subtitle": "Server description"
    }
  }
}
```

## Mod folder recommendation

For a NeoForge server, add an entry to `tools/server-mods.config.json` like this:

```json
"my_neoforge_server": {
  "modsDir": "files/mods/my_neoforge_server",
  "modType": "ForgeMod",
  "idPrefix": "ktz.myneoforge",
  "preserveModuleTypes": [
    "ForgeHosted",
    "Fabric",
    "LiteLoader",
    "Library",
    "VersionManifest",
    "File"
  ]
}
```

Then run:

```cmd
npm run generate:mods my_neoforge_server
```

## Important

NeoForge support is compatible-mode support. A new NeoForge server should be tested one server profile at a time. If the NeoForge installer-generated json contains a local-only client jar with no URL, place that jar under `files/loaders/neoforge/` and use its GitHub raw URL in the loader module.
