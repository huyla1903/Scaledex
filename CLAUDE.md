# Scaledex

Pokédex for Bandai's Pokémon Scale World figures. One data set, two front ends.

## Layout

- `scraper/build_data.py` builds `data/scaledex.json` and `data/images/`. Standard library only. Every HTTP response is cached in `scraper/cache/`; failed requests are not cached, so re-running fills the gaps.
- `app/dex.js` + `app/dex.css`: the shared UI core (no framework, ES5-style). Everything visual lives here.
- `app/landscapes/<region>.jpg`: home-card photos (cropped to the figures, ~900 px wide). `tools/build.mjs` fills `LANDSCAPES` in the core with file URLs (PWA) or data URIs (plugin); a region without one falls back to its `REGION_PICKS` figure row.
- `pwa/`: thin wrapper (localStorage, export/import, service worker).
- `obsidian-plugin/main.src.js`: thin wrapper. `isDesktopOnly` must stay `false`; don't use Node/Electron APIs (`fs`, `path`, `require` of anything but `obsidian`), or it stops working on iOS.
- `tools/build.mjs` assembles `dist/pwa/` and `dist/scaledex/` (inlines core + data into the plugin's `main.js`). `--vault "<path>"` installs the plugin.

## Data notes

- Source of truth is the official dex at bandai.co.jp/candy/pokemonscaleworld/lineup/. It lags months behind, so products it doesn't list come from the Bandai Candy brand page (`BRAND_LIST`, `?__offset=20...`); their figures get `x<product>_<n>` ids and are matched to existing figures by character + label. Their photos come from the product page gallery (`figure_photo`: Premium Bandai = group shot + 3 views per figure; candy = one photo per numbered box, split into one crop per figure). Fix wrong picks in `FIGURE_IMAGES` and wrong left-to-right order in `FIGURE_CROPS`; a figure with no photo of its own gets one from `FIGURE_PHOTO_URLS` (Premium Bandai's image server `bandai-a.akamaihd.net/bc/img/model/b/<item>_<n>.jpg` isn't region-blocked and has more views). Figures without an official height get `heightEst` (PokeAPI height at 1:20). Home-card figures are hand-picked in `REGION_PICKS` (`app/dex.js`). New trainers there need an entry in `NEW_TRAINERS` and a role in `TRAINER_ROLES` (the scraper warns when one is missing). Trainer display order comes from Bulbapedia's "List of Trainer figurines" (`bulbapedia_trainer_order`). Each lineup id (`025`, `025_2`, `470_hisui`) is one figure; figures are grouped into characters by dex number (Pokémon) or id prefix (trainers).
- p-bandai.jp blocks non-Japanese IPs. Premium Bandai prices and ship dates come from the Wayback Machine (`id_` raw snapshots, JSON-LD `price`). Keep archive.org requests slow (`ARCHIVE_DELAY`).
- Trainer English names are mapped by hand in `TRAINERS`; product names are machine-translated from Japanese with `PRODUCT_WORDS` + character names. Add to those tables when new lines appear.
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
