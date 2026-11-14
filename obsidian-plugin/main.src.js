/*
@title        Scaledex - Obsidian plugin
@version      0.1.0
@author       La Gia Huy
@since        2026-11-14
@updated      2026-11-14
@engine       JavaScript (CommonJS, Obsidian plugin API)
@target       Obsidian 1.5+ desktop and mobile (iOS / Android)
@about        Pokédex view of Bandai Pokémon Scale World figures with owned /
              wishlist tracking. Source file: tools/build.mjs inlines the shared UI core
              (app/dex.js) and the data (data/scaledex.json) into main.js, so the
              plugin is self-contained and syncs with Obsidian Sync or iCloud.
              Images load from the vault folder set in settings (filled by the
              "Download images to vault" command) and fall back to Bandai's servers.
*/
"use strict";
var obsidian = require("obsidian");

/*__DEX_CORE__*/

var DEX_DATA = /*__DEX_DATA__*/ null;
var VIEW_TYPE = "scaledex";
var DEFAULTS = { imageFolder: "Scaledex", collection: { owned: {}, wish: {}, prefs: {} } };

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
  getIcon() { return "layout-grid"; }

  async onOpen() {
    var plugin = this.plugin;
    var host = this.contentEl;
    host.empty();
    host.addClass("swdex-host");
    var root = host.createDiv();
    var data = await plugin.getData();
    var hasLocal = await plugin.hasLocalImages();
    var adapter = this.app.vault.adapter;
    var folder = obsidian.normalizePath(plugin.settings.imageFolder || "");
    this.api = Scaledex.mount(root, {
      data: data,
      dark: isDark(),
      img: function (rel, url) {
        if (rel && hasLocal) return adapter.getResourcePath(obsidian.normalizePath(folder + "/" + rel));
        return url || "";
      },
      load: function () { return plugin.settings.collection; },
      save: function (s) { plugin.settings.collection = s; plugin.saveSoon(); },
      menu: [{ label: "Download images to vault (offline)", run: function () { plugin.downloadImages(); } }]
    });
    var self = this;
    this.registerEvent(this.app.workspace.on("css-change", function () { if (self.api) self.api.setDark(isDark()); }));
  }

  async onClose() { if (this.api) this.api.destroy(); this.api = null; }
}

class ScaledexSettings extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    var el = this.containerEl, plugin = this.plugin;
    el.empty();
    new obsidian.Setting(el)
      .setName("Image folder")
      .setDesc("Vault folder for figure and product images. If it has no images, they load from Bandai's website (needs internet).")
      .addText(function (t) {
        t.setPlaceholder("Scaledex").setValue(plugin.settings.imageFolder).onChange(async function (v) {
          plugin.settings.imageFolder = v.trim(); await plugin.saveData(plugin.settings); plugin.localChecked = null;
        });
      });
    new obsidian.Setting(el)
      .setName("Download images")
      .setDesc("Save every figure and product image into the image folder so the dex works offline (about 30 MB).")
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
    this.addRibbonIcon("layout-grid", "Open Scaledex", function () { plugin.openView(); });
    this.addCommand({ id: "open", name: "Open Scaledex", callback: function () { plugin.openView(); } });
    this.addCommand({ id: "download-images", name: "Download images to vault (offline use)", callback: function () { plugin.downloadImages(); } });
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

  // A newer scaledex.json placed in the image folder overrides the bundled data.
  async getData() {
    var p = obsidian.normalizePath((this.settings.imageFolder || "") + "/scaledex.json");
    try {
      if (this.settings.imageFolder && await this.app.vault.adapter.exists(p)) {
        var d = JSON.parse(await this.app.vault.adapter.read(p));
        if (d && d.figures && (!DEX_DATA || d.generated >= DEX_DATA.generated)) return d;
      }
    } catch (e) { console.warn("Scaledex: could not read " + p, e); }
    return DEX_DATA;
  }

  async hasLocalImages() {
    if (this.localChecked != null) return this.localChecked;
    var f = this.settings.imageFolder;
    this.localChecked = !!f && await this.app.vault.adapter.exists(obsidian.normalizePath(f + "/images/figures"));
    return this.localChecked;
  }

  async downloadImages() {
    var folder = obsidian.normalizePath(this.settings.imageFolder || "Scaledex");
    var adapter = this.app.vault.adapter;
    var data = await this.getData();
    var jobs = [];
    data.figures.forEach(function (f) { if (f.image && f.imageUrl) jobs.push([f.image, f.imageUrl, f.imageTrim]); });
    data.products.forEach(function (p) { if (p.image && p.imageUrl) jobs.push([p.image, p.imageUrl]); });
    var notice = new obsidian.Notice("Scaledex: downloading " + jobs.length + " images…", 0);
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
    async function one(job) {
      var path = obsidian.normalizePath(folder + "/" + job[0]);
      var trimPath = job[2] ? obsidian.normalizePath(folder + "/" + job[2]) : null;
      try {
        var buf;
        if (await adapter.exists(path)) {
          if (!trimPath || await adapter.exists(trimPath)) { skipped++; return; }
          buf = await adapter.readBinary(path);
        } else {
          var res = await obsidian.requestUrl({ url: job[1], throw: false });
          if (res.status !== 200) { failed++; return; }
          buf = res.arrayBuffer;
          await ensureDir(path);
          await adapter.writeBinary(path, buf);
        }
        if (trimPath) {
          var trimmed = await trimWhite(buf);
          if (trimmed) { await ensureDir(trimPath); await adapter.writeBinary(trimPath, trimmed); }
        }
        done++;
      } catch (e) { failed++; }
    }
    for (var i = 0; i < jobs.length; i += 6) {
      await Promise.all(jobs.slice(i, i + 6).map(one));
      notice.setMessage("Scaledex: images " + Math.min(i + 6, jobs.length) + " / " + jobs.length);
    }
    notice.hide();
    new obsidian.Notice("Scaledex: " + done + " downloaded, " + skipped + " already there" + (failed ? ", " + failed + " failed" : "") +
      ". Reopen the dex to use local images.", 8000);
    this.localChecked = null;
  }
};
