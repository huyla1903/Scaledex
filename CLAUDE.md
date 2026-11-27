# Scaledex

Pokédex for Bandai's Pokémon Scale World figures. One data set, two front ends.

## Layout

- `scraper/build_data.py` builds `data/scaledex.json` and `data/images/`. Standard library only. Every HTTP response is cached in `scraper/cache/`; failed requests are not cached, so re-running fills the gaps.
- `app/dex.js` + `app/dex.css`: the shared UI core (no framework, ES5-style). Everything visual lives here.
- `app/landscapes/<region>.jpg`: home-card photos (cropped to the figures, ~900 px wide). `tools/build.mjs` fills `LANDSCAPES` in the core with file URLs (PWA) or data URIs (plugin); a region without one falls back to its `REGION_PICKS` figure row.
- `pwa/`: thin wrapper (localStorage, export/import, service worker).
- `obsidian-plugin/main.src.js`: thin wrapper. `isDesktopOnly` must stay `false`; don't use Node/Electron APIs (`fs`, `path`, `require` of anything but `obsidian`), or it stops working on iOS.
- `manifest.json` (plugin manifest) and `versions.json` stay at the repo root: Obsidian's plugin directory reads them there. To release: bump `version` in `manifest.json`, add it to `versions.json`, merge to `main`, then push a tag equal to the version without `v` (`git tag 0.1.13; git push origin 0.1.13`); `.github/workflows/release.yml` builds and attaches `main.js`, `manifest.json`, `styles.css`.
- `tools/build.mjs` assembles `dist/pwa/` and `dist/scaledex/` (inlines core + data into the plugin's `main.js`). `--vault "<path>"` installs the plugin.

## Data notes

- Scraper sources, figure ids, `idAliases` (never remove old ones), photo/crop fixes and the hand-mapped tables: see [scraper/CLAUDE.md](scraper/CLAUDE.md), which loads when working in `scraper/`.
- Prices are JPY including tax. Candy products are per box.
- "Upcoming" is computed in the UI from product dates vs. today, not stored in the data.
- Images are not committed (Projects rule). The Pages site gets them from the `images` GitHub Release (`tools/upload_images.ps1`); the Obsidian plugin downloads them into `<plugin dir>/cache/images` (`cacheDir()`, from `this.manifest.dir`) and otherwise loads them from the Pages site (`IMAGE_BASE`), falling back to Bandai's URL. Re-upload after the scraper adds or changes images.

## Run

```
update.bat                              # all of the below + asks before publishing (push data, upload images)
python scraper/build_data.py            # add --refresh-index to pick up new figures
node tools/build.mjs --vault "<vault path>"
powershell -ExecutionPolicy Bypass -File tools/upload_images.ps1
```

The live site builds from the committed `data/scaledex.json`, so publish = push the data, then upload the images (the upload starts the Pages build).

## Workflow

Every push to `main` deploys straight to the live site, so `main` must always build and run.

- Do each feature or fix on its own branch (`git switch -c <name>`); merge into `main` only after it has been built and checked in a browser.
- Before changing code, check that the working tree is clean. If it isn't, say so, so the user can commit first and roll back easily.
- One task per change: keep diffs small and focused, and explain anything non-obvious in the summary.
- Before merging, run `node tools/check.mjs` (JS syntax, data parses, ids unique and linked; the Pages workflow runs it too and won't deploy if it fails) and `node tools/build.mjs`. Say so if the change wasn't tested in the PWA or in Obsidian (desktop and mobile).
- No secrets anywhere in the repo or the front end. Collection data stays on the user's device (localStorage / the plugin's `data.json`), and Export/Import must keep working.
