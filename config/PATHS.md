# VirtualBrowser paths (Route B)

## Layout

Only **inner kernel** is kept under `Chrome-bin/`:

```
Chrome-bin/VirtualBrowser/146.0.7680.72/
  VirtualBrowser.exe   <- launch fingerprint profile
  chrome.dll
  worker/              <- deploy from worker/ npm run deploy:worker
```

No outer Electron shell. Management UI = open source `server/` + `npm run dev`.

## Dev

```powershell
cd server && npm run dev
```

- UI hot reload in browser
- native via `dev-native-bridge` (Node)
- `launchBrowser` spawns inner `VirtualBrowser.exe`

## Config

See `config/chrome-bin.paths.json`.
