/*
@title        Scaledex - Obsidian plugin
@version      0.1.12
@author       La Gia Huy
@since        2026-11-14
@updated      2026-11-27
@engine       JavaScript (CommonJS, Obsidian plugin API)
@target       Obsidian 1.5+ desktop and mobile (iOS / Android)
@about        Pokédex view of Bandai Pokémon Scale World figures with owned /
              wishlist tracking. Source file: tools/build.mjs inlines the shared UI core
              (app/dex.js) and the data (data/scaledex.json) into main.js, so the
              plugin is self-contained and syncs with Obsidian Sync or iCloud.
              Images load from the plugin's cache folder (<plugin dir>/cache/images,
              filled by the "Download images" command), else from the Scaledex web
              app's site, else from Bandai's servers.
*/
"use strict";
var obsidian = require("obsidian");

/*__DEX_CORE__*/

var DEX_DATA = /*__DEX_DATA__*/ null;
var VIEW_TYPE = "scaledex";
// line version of the app icon (dex handheld: lens, lights, hinge, screen); 0 0 100 100 per addIcon
var ICON = "scaledex-dex";
var ICON_SVG = '<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="12" y="6" width="76" height="88" rx="12"/><circle cx="34" cy="28" r="11"/>' +
  '<path d="M12 50 H44 L52 42 H88"/><rect x="26" y="60" width="48" height="24" rx="5"/></g>' +
  '<g fill="currentColor"><circle cx="58" cy="22" r="4.5"/><circle cx="73" cy="22" r="4.5"/></g>';
// The web app hosts the scraper's images (incl. per-figure crops); Bandai's URL is the fallback.
var IMAGE_BASE = "https://huyla1903.github.io/Scaledex/data/";
var DEFAULTS = { imageBase: IMAGE_BASE, collection: { owned: {}, wish: {}, prefs: {} } };

function isDark() { return document.body.classList.contains("theme-dark"); }

// Crop the white margin around an official render (same rule as scraper/build_data.py).
async function trimWhite(buf) {
  var bmp = await createImageBitmap(new Blob([buf]));
  var c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  var g = c.getContext("2d");
  g.drawImage(bmp, 0, 0);
  var px = g.getImageData(0, 0, c.width, c.height).data;
  var x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (var y = 0; y < c.height; y++) {
    for (var x = 0; x < c.width; x++) {
      var i = (y * c.width + x) * 4;
      if (Math.max(255 - px[i], 255 - px[i + 1], 255 - px[i + 2]) > 14) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  var pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
  var out = document.createElement("canvas");
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  var blob = await new Promise(function (res) { out.toBlob(res, "image/jpeg", 0.88); });
  return blob ? await blob.arrayBuffer() : null;
}

class ScaledexView extends obsidian.ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; this.api = null; }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Scaledex"; }
  getIcon() { return ICON; }

  async onOpen() {
    var plugin = this.plugin;
    var host = this.contentEl;
    host.empty();
    host.addClass("swdex-host");
    var root = host.createDiv();
    var data = await plugin.getData();
    var hasLocal = await plugin.hasLocalImages();
    var adapter = this.app.vault.adapter;
    var folder = plugin.cacheDir();
    this.api = Scaledex.mount(root, {
      data: data,
      dark: isDark(),
      hostTheme: true,  // in-app theme on Auto: use the Obsidian theme's colours
      img: function (rel, url) {  // the core falls back to url if this one fails to load
        if (rel && hasLocal) return adapter.getResourcePath(obsidian.normalizePath(folder + "/" + rel));
        if (rel && plugin.settings.imageBase) return plugin.settings.imageBase.replace(/\/?$/, "/") + rel;
        return url || "";
      },
      load: function () { return plugin.settings.collection; },
      save: function (s) { plugin.settings.collection = s; plugin.saveSoon(); },
      menu: [{ label: "Download images (offline use)", labelVi: "Tải ảnh về (dùng offline)", run: function () { plugin.downloadImages(); } }]
    });
    var self = this;
    this.registerEvent(this.app.workspace.on("css-change", function () { if (self.api) self.api.setDark(isDark()); }));
    // "/" or Ctrl/Cmd+K opens the dex search, Esc closes, Backspace goes back;
    // only while this tab is the active one
    this.registerDomEvent(document, "keydown", function (e) {
      if (!self.api || self.app.workspace.getActiveViewOfType(ScaledexView) !== self) return;
      if (self.api.isSearchKey(e)) self.api.openSearch();
      else if (!self.api.navKey(e)) return;
      e.preventDefault(); e.stopPropagation();
    }, true);
  }

  async onClose() { if (this.api) this.api.destroy(); this.api = null; }
}

class ScaledexSettings extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    var el = this.containerEl, plugin = this.plugin;
    el.empty();
    new obsidian.Setting(el)
      .setName("Image source")
      .setDesc("Where online images come from: the Scaledex web app's data folder. Empty = Bandai's website (no per-figure crops for new sets).")
      .addText(function (t) {
        t.setPlaceholder(IMAGE_BASE).setValue(plugin.settings.imageBase).onChange(async function (v) {
          plugin.settings.imageBase = v.trim(); await plugin.saveData(plugin.settings);
        });
      });
    new obsidian.Setting(el)
      .setName("Download images")
      .setDesc("Save every figure and product image into " + plugin.cacheDir() + "/images so the dex works offline (about 50 MB). " +
        "Without them, images load from the image source above (needs internet).")
      .addButton(function (b) { b.setButtonText("Download").setCta().onClick(function () { plugin.downloadImages(); }); });
    var data = DEX_DATA;
    if (data) el.createEl("p", { text: "Data generated " + data.generated + ": " + data.characters.length + " characters, " +
      data.figures.length + " figures, " + data.products.length + " releases.", cls: "setting-item-description" });
  }
}

module.exports = class ScaledexPlugin extends obsidian.Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.settings.collection = Object.assign({ owned: {}, wish: {}, prefs: {} }, this.settings.collection);
    this.localChecked = null;
    var plugin = this;
    this.registerView(VIEW_TYPE, function (leaf) { return new ScaledexView(leaf, plugin); });
    obsidian.addIcon(ICON, ICON_SVG);
    this.addRibbonIcon(ICON, "Open Scaledex", function () { plugin.openView(); });
    this.addCommand({ id: "open", name: "Open Scaledex", callback: function () { plugin.openView(); } });
    this.addCommand({ id: "download-images", name: "Download images (offline use)", callback: function () { plugin.downloadImages(); } });
    this.addSettingTab(new ScaledexSettings(this.app, this));
  }

  async openView() {
    var leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    var leaf = leaves[0] || this.app.workspace.getLeaf(true);
    if (!leaves[0]) await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  saveSoon() {
    var self = this;
    clearTimeout(this._t);
    this._t = setTimeout(function () { self.saveData(self.settings); }, 400);
  }

  // <plugin dir>/cache: downloaded images, and an optional newer scaledex.json
  cacheDir() { return obsidian.normalizePath(this.manifest.dir + "/cache"); }

  // A newer scaledex.json placed in the cache folder overrides the bundled data.
  async getData() {
    var p = this.cacheDir() + "/scaledex.json";
    try {
      if (await this.app.vault.adapter.exists(p)) {
        var d = JSON.parse(await this.app.vault.adapter.read(p));
        if (d && d.figures && (!DEX_DATA || d.generated >= DEX_DATA.generated)) return d;
      }
    } catch (e) { console.warn("Scaledex: could not read " + p, e); }
    return DEX_DATA;
  }

  async hasLocalImages() {
    if (this.localChecked != null) return this.localChecked;
    this.localChecked = await this.app.vault.adapter.exists(this.cacheDir() + "/images/figures");
    return this.localChecked;
  }

  async downloadImages() {
    var folder = this.cacheDir();
    var adapter = this.app.vault.adapter;
    var data = await this.getData();
    var base = (this.settings.imageBase || "").replace(/\/?$/, "/");
    // [vault-relative path, Bandai fallback URL, local original to crop if the image source fails]
    var seen = {}, jobs = [], trims = [];
    function add(list, job) { if (job[0] && !seen[job[0]]) { seen[job[0]] = true; list.push(job); } }
    data.figures.forEach(function (f) {
      add(jobs, [f.image, f.imageUrl, null]);
      if (f.imageTrim) add(trims, [f.imageTrim, null, f.image]);
    });
    data.products.forEach(function (p) { add(jobs, [p.image, p.imageUrl, null]); });
    var total = jobs.length + trims.length;
    var notice = new obsidian.Notice("Scaledex: downloading " + total + " images…", 0);
    var done = 0, skipped = 0, failed = 0;
    var dirs = {};
    async function ensureDir(path) {
      var parts = path.split("/"); parts.pop();
      var cur = "";
      for (var i = 0; i < parts.length; i++) {
        cur = cur ? cur + "/" + parts[i] : parts[i];
        if (dirs[cur]) continue;
        if (!(await adapter.exists(cur))) await adapter.mkdir(cur);
        dirs[cur] = true;
      }
    }
    async function get(url) {
      if (!url) return null;
      try {
        var res = await obsidian.requestUrl({ url: url, throw: false });
        return res.status === 200 ? res.arrayBuffer : null;
      } catch (e) { return null; }
    }
    async function one(job) {
      var path = obsidian.normalizePath(folder + "/" + job[0]);
      try {
        if (await adapter.exists(path)) { skipped++; return; }
        var buf = (base !== "/" ? await get(base + job[0]) : null) || await get(job[1]);
        if (!buf && job[2]) {  // crop it here from the original we already have
          var orig = obsidian.normalizePath(folder + "/" + job[2]);
          if (await adapter.exists(orig)) buf = await trimWhite(await adapter.readBinary(orig));
        }
        if (!buf) { failed++; return; }
        await ensureDir(path);
        await adapter.writeBinary(path, buf);
        done++;
      } catch (e) { failed++; }
    }
    var all = jobs.concat(trims);  // originals first: a crop may be made from one
    for (var i = 0; i < all.length; i += 6) {
      await Promise.all(all.slice(i, i + 6).map(one));
      notice.setMessage("Scaledex: images " + Math.min(i + 6, all.length) + " / " + all.length);
    }
    notice.hide();
    new obsidian.Notice("Scaledex: " + done + " downloaded, " + skipped + " already there" + (failed ? ", " + failed + " failed" : "") +
      ". Reopen the dex to use local images.", 8000);
    this.localChecked = null;
  }
};
