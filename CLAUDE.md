# Scaledex

Pokédex for Bandai's Pokémon Scale World figures. One data set, two front ends.

## Layout

- `scraper/build_data.py` builds `data/scaledex.json` and `data/images/`. Standard library only. Every HTTP response is cached in `scraper/cache/`; failed requests are not cached, so re-running fills the gaps.
- `app/dex.js` + `app/dex.css`: the shared UI core (no framework, ES5-style). Everything visual lives here.
- `pwa/`: thin wrapper (localStorage, export/import, service worker).
- `obsidian-plugin/main.src.js`: thin wrapper. `isDesktopOnly` must stay `false`; don't use Node/Electron APIs (`fs`, `path`, `require` of anything but `obsidian`), or it stops working on iOS.
- `tools/build.mjs` assembles `dist/pwa/` and `dist/scaledex/` (inlines core + data into the plugin's `main.js`). `--vault "<path>"` installs the plugin.

## Data notes

- Source of truth is the official dex at bandai.co.jp/candy/pokemonscaleworld/lineup/. Each lineup id (`025`, `025_2`, `470_hisui`) is one figure; figures are grouped into characters by dex number (Pokémon) or id prefix (trainers).
- p-bandai.jp blocks non-Japanese IPs. Premium Bandai prices and ship dates come from the Wayback Machine (`id_` raw snapshots, JSON-LD `price`). Keep archive.org requests slow (`ARCHIVE_DELAY`).
- Trainer English names are mapped by hand in `TRAINERS`; product names are machine-translated from Japanese with `PRODUCT_WORDS` + character names. Add to those tables when new lines appear.
- Prices are JPY including tax. Candy products are per box.

## Run

```
python scraper/build_data.py            # add --refresh-index to pick up new figures
node tools/build.mjs --vault "<vault path>"
```
