# GPTWrap

A minimal Tauri desktop wrapper that loads [ChatGPT](https://chatgpt.com) in its main window.

## Development

```bash
npm install
npm run tauri dev
```

The remote URL is configured in `src-tauri/tauri.conf.json`.

## Release and in-app updates

Windows releases use the signed NSIS installer. The first version that
contains the updater still has to be installed manually; later releases can
be checked and installed from the About window.

The release workflow requires these GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: the complete Tauri updater private key
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the key password, if one is set

Keep the private key out of the repository. The public key is stored in
`src-tauri/tauri.conf.json` and the update metadata is published to the
project's GitHub Releases.
