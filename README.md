# Scaledex

A Pokédex for Bandai's **Pokémon Scale World** (1/20 scale) figures, as a web app and a mobile-friendly Obsidian plugin.

## 💡 Motivation

Pokémon Scale World has hundreds of figures spread over candy-aisle waves, Premium Bandai sets, re-orders and single re-sales. The official dex is in Japanese only, runs months behind new announcements, and doesn't tell you what each figure cost or when it was re-released. Premium Bandai doesn't even open outside Japan.

Scaledex puts it all in one place, styled after the Pokémon GO Pokédex: every Pokémon and trainer with a figure, English and Japanese names (with romaji), scale height, and every release with its date, sales channel and price in JPY. You can mark figures as **owned** or put them on your **wishlist** and track completion per region.

## 🚀 Quick Start

**Web app:** open **https://huyla1903.github.io/Scaledex/**. On iPhone, tap Share → **Add to Home Screen** to use it like an app (it works offline once loaded).

**Obsidian plugin (desktop, iOS and Android):**

1. Copy the `dist/scaledex/` folder to `<your vault>/.obsidian/plugins/scaledex/`.
2. In Obsidian, open **Settings → Community plugins** and enable **Scaledex**.
3. Open it from the ribbon (dex icon) or the command palette: "Open Scaledex".

If the vault syncs (iCloud, or Obsidian Sync with "Installed community plugins" on), the plugin reaches your phone on its own.

## 📖 Usage

### What's in the dex

- **Regions:** one card per Scale World line (Kanto, Johto, … Paldea) with your completion, plus **All** and **Upcoming** (figures in sets that ship after today).
- **Pokémon pages:** types, a Legendary / Mythical / Powerhouse note, the evolution line with Megas (each one links to its page), every figure version, and every release of the selected figure. Tap a type or note to list every Pokémon that shares it.
- **Trainer pages:** their role in the games (Gym Leader · Rock, Champion, Rival, Professor, Team Boss, …); tap it to list every trainer with that role. Trainers are listed in the order of Bulbapedia's "List of Trainer figurines".
- **Search:** English, Japanese or romaji names, dex numbers, types ("fire"), Legendary / Mythical / Powerhouse and trainer roles ("gym leader"). Press `/` or `Ctrl+K` (`⌘K` on Mac) to start searching, `Esc` to close. Searching a Pokémon also finds its evolution line ("charmander" shows Charmeleon and Charizard).
- **Filters and sorting:** Pokémon / Trainers / Owned / Missing / Wishlist, sorted by dex number, name or release year (menu).

### Where your collection is saved

| | Saved in | Backup |
|---|---|---|
| Web app | the browser's local storage | menu → Export / Import collection |
| Obsidian plugin | the plugin's `data.json` in your vault | syncs with the vault |

### Links

The web app opens straight to a view with `?region=kanto`, `?region=upcoming`, `?open=p0025` (Pikachu), `?open=t-red` or `?q=charmander`.

### Offline images

- **Web app:** menu → "Save all images for offline" stores them in the browser's own offline cache for that site (not in your files).
- **Obsidian:** command palette → "Download images (offline use)" saves about 50 MB into the plugin's own folder (`.obsidian/plugins/scaledex/cache/images/`), so your notes stay clean. Without it, images load from the web app's site (Settings → Image source), with Bandai's website as fallback.

### Where the data comes from

- **Figures, images, scale heights:** the official dex at bandai.co.jp/candy/pokemonscaleworld/lineup/.
- **New and upcoming sets the official dex doesn't list yet:** the Bandai Candy Scale World brand page. These figures use Bandai's product photos (one per figure, cropped from the set gallery) until the official dex adds them.
- **Candy-aisle releases** (price per box, date, where sold): Bandai Candy product pages.
- **Premium Bandai** (price, ship date): Internet Archive snapshots of p-bandai.jp, which blocks visitors outside Japan. Each release links to the snapshot it used.
- **Re-releases the official dex doesn't link, trainer order:** Bulbapedia's Pokémon Scale World article.
- **English names, types, evolution lines, Legendary / Mythical:** PokeAPI. Powerhouse follows Bulbapedia's "Powerhouse Pokémon" list. Trainer names, roles and product-name translations are mapped by hand.

Prices are Japanese retail prices including tax; candy-aisle prices are per box. Figure and product images © Bandai / Pokémon. This is a personal, unofficial index.

See [CLAUDE.md](CLAUDE.md) for implementation notes.

## 🤝 Contributing

### Clone the repo

```bash
git clone https://github.com/huyla1903/Scaledex.git
cd Scaledex
```

### Run it locally

You need Python 3 and Node.js 18+. There are no npm packages. Pillow (`scraper/requirements.txt`) is optional: it crops figure photos so they fill a tile.

```bash
python scraper/build_data.py --refresh-index   # rebuild data/scaledex.json + data/images/ (responses are cached)
node tools/build.mjs                           # assemble dist/pwa/ and dist/scaledex/
node tools/build.mjs --vault "<vault path>"    # ...and install the plugin into a vault
```

Serve `dist/pwa/` with any static web server to try the web app. Every push to `main` rebuilds the live site (`.github/workflows/pages.yml`). Images are not committed: after a data update that adds images, run `tools/upload_images.ps1` to publish them to the `images` release that the site and the plugin load from.

```
scraper/build_data.py      data builder -> data/scaledex.json + data/images/
app/dex.js, app/dex.css    shared UI core (no framework)
pwa/                       web-app wrapper (index.html, sw.js, manifest, icons)
obsidian-plugin/           plugin wrapper (main.src.js, manifest.json)
tools/                     build.mjs (assembles dist/), upload_images.ps1
```

### Test your changes

There is no automated test suite yet. Before opening a pull request, build and check in the web app (and in Obsidian if you touched the plugin) that:

- the home screen, a region grid and a few Pokémon and trainer pages render,
- search, filters and owned / wishlist marks still work,
- the scraper run ends without new `!` warnings.

### Submit a pull request

If you'd like to contribute, please fork the repository and open a pull request to the `main` branch.
