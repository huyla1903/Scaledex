# Scaledex

A Pokédex for Bandai's **Pokémon Scale World** (1/20 scale) figures, styled after the Pokémon GO Pokédex. It lists every Pokémon and trainer with an official figure, with the English name first and the Japanese name second. For each figure it shows the official image, scale height and every release (including re-releases and re-orders), with the date, where it was sold and the price in JPY. You can mark figures as **owned** or put them on your **wishlist**, and see completion per region.

It comes in two forms built from the same data:

| | Where it runs | Collection is saved in |
|---|---|---|
| **Obsidian plugin** (`dist/scaledex/`) | Obsidian desktop **and iOS/Android** (`isDesktopOnly: false`) | the plugin's `data.json`, so it syncs with your vault |
| **Web app / PWA** (`dist/pwa/`) | any browser; "Add to Home Screen" on iPhone, works offline | the browser's localStorage (export/import from Settings) |

## Install the Obsidian plugin (iPhone included)

1. Build (see below), or take the ready-made `dist/scaledex/` folder.
2. Copy that folder to `<your vault>/.obsidian/plugins/scaledex/`. If the vault syncs (iCloud, Obsidian Sync with "installed community plugins" on), it reaches your phone on its own. Or run `node tools/build.mjs --vault "<vault path>"`.
3. In Obsidian go to **Settings → Community plugins**, then enable **Scaledex**.
4. Open it from the ribbon (grid icon) or the command palette: "Open Scaledex".
5. Optional, for offline use: run "Download images to vault" from the command palette (about 35 MB, saved into the `Scaledex/` folder). Without this step, images load from Bandai's website.

All the data (`main.js`, about 330 KB) is inside the plugin, so no extra files are needed.

## Use the web app

Host `dist/pwa/` on any HTTPS static host (GitHub Pages, Netlify, Cloudflare Pages). On the iPhone, open it in Safari and choose Share → **Add to Home Screen**. In Settings, "Save all images for offline" caches everything. Deep links: `?region=kanto`, `?open=p0025`, `?open=t-red`.

## Update the data

```
python scraper/build_data.py --refresh-index   # picks up new figures/products; everything else comes from cache
node tools/build.mjs [--vault "<vault path>"] [--vault-images]
```

The scraper uses only the Python standard library. Pillow (`scraper/requirements.txt`) is optional: it crops the white margin around renders so they fill a tile. "Show figures at true relative scale" in Settings shows the uncropped originals.

## Where the data comes from

- **Figures, images, scale height, which products each figure was in**: the official dex at bandai.co.jp/candy/pokemonscaleworld/lineup/
- **Candy-aisle releases** (price per box, release date, 売場): Bandai Candy product pages
- **Premium Bandai** (price, ship date): p-bandai.jp blocks visitors outside Japan, so these come from Internet Archive snapshots of the Japanese pages. Each release links to the snapshot it used.
- **Candy re-releases the official dex doesn't link**: Bulbapedia's Scale World article
- **English Pokémon names**: PokeAPI. Trainer names and product-name translation are mapped by hand in `scraper/build_data.py`.

Prices are Japanese retail prices including tax. Figure and product images © Bandai / Pokémon. This is a personal, unofficial index.

## Layout

```
scraper/build_data.py      data builder -> data/scaledex.json + data/images/
app/dex.js, app/dex.css    shared UI core (no framework)
pwa/                       web-app wrapper (index.html, sw.js, manifest, icons)
obsidian-plugin/           plugin wrapper (main.src.js, manifest.json)
tools/build.mjs            assembles dist/
```
