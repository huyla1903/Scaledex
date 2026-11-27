# Contributing to Scaledex

## Clone the repo

```bash
git clone https://github.com/huyla1903/Scaledex.git
cd Scaledex
```

## Run it locally

You need Python 3 and Node.js 18+. There are no npm packages. Pillow (`scraper/requirements.txt`) is optional: it crops figure photos so they fill a tile.

```bash
python scraper/build_data.py --refresh-index   # rebuild data/scaledex.json + data/images/ (responses are cached)
node tools/build.mjs                           # assemble dist/pwa/ and dist/scaledex/
node tools/build.mjs --vault "<vault path>"    # ...and install the plugin into a vault
```

**Picking up new Scale World sets (Windows):** double-click `update.bat`. It runs the scraper and the build, shows what changed, and asks before publishing (pushing `data/scaledex.json` and uploading the images). Then copy `dist/scaledex/` into your vault.

Serve `dist/pwa/` with any static web server to try the web app. Every push to `main` rebuilds the live site (`.github/workflows/pages.yml`). Images are not committed: after a data update that adds images, run `tools/upload_images.ps1` to publish them to the `images` release that the site and the plugin load from.

## Repo layout

```
scraper/build_data.py          data builder -> data/scaledex.json + data/images/
app/dex.js, app/dex.css        shared UI core (no framework)
pwa/                           web-app wrapper (index.html, sw.js, manifest, icons)
obsidian-plugin/               plugin wrapper (main.src.js)
manifest.json, versions.json   Obsidian plugin manifest (repo root, where Obsidian looks for it)
tools/                         build.mjs (assembles dist/), check.mjs, upload_images.ps1
docs/                          README screenshots
```

## Test your changes

Run `node tools/check.mjs` (JS syntax, data parses, ids unique and linked; the Pages workflow runs it too and won't deploy if it fails) and `node tools/build.mjs`.

There is no automated UI test suite yet. Before opening a pull request, check in the web app (and in Obsidian if you touched the plugin) that:

- the home screen, a region grid and a few Pokémon and trainer pages render,
- search, filters and owned / wishlist marks still work,
- the scraper run ends without new `!` warnings.

## Submit a pull request

Fork the repository and open a pull request to the `main` branch. Keep each pull request to one feature or fix.
