/*
@title        Scaledex - shared UI core
@author       La Gia Huy
@since        2026-11-14
@updated      2026-11-15
@about        Framework-free Pokédex UI for Bandai's Pokémon Scale World figures.
              Used by both the PWA (pwa/) and the Obsidian plugin (obsidian-plugin/).
              Usage:
                Scaledex.mount(rootEl, {
                  data,                       // parsed data/scaledex.json
                  img: (rel, url) => src,     // resolve a bundled image (fallback: url)
                  load: () => state,          // { owned:{}, wish:{}, prefs:{} }
                  save: (state) => void,
                  history: true,              // use history.pushState (PWA only)
                  menu: [{ label, run }],     // extra menu entries (export/import...)
                  dark: false | true | 'auto',
                  today: 'YYYY-MM-DD'         // optional; "Upcoming" = releases after this date
                })
*/
(function (global) {
  "use strict";

  var REGION_COLORS = {
    all: "#1b86b6", kanto: "#2aa6dc", johto: "#e0a526", hoenn: "#3caa66", sinnoh: "#6b7fd6",
    hisui: "#8f7a52", unova: "#5c6470", kalos: "#3a6fd0", alola: "#f08a30", galar: "#c5427e",
    paldea: "#d4473b", special: "#8c6bd1", upcoming: "#e2732a"
  };
  var TYPE_COLORS = {
    normal: "#9fa19f", fire: "#e62829", water: "#2980ef", electric: "#fac000", grass: "#3fa129", ice: "#3dcef3",
    fighting: "#ff8000", poison: "#9141cb", ground: "#915121", flying: "#81b9ef", psychic: "#ef4179", bug: "#91a119",
    rock: "#afa981", ghost: "#704170", dragon: "#5060e1", dark: "#624d4e", steel: "#60a1b8", fairy: "#ef70ef"
  };
  var UPCOMING = { id: "upcoming", nameEn: "Upcoming", nameJa: "発売予定" };
  // header logo: same drawing as pwa/icons/icon.svg, flat colours, rounded
  var LOGO = '<svg class="sw-logo" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#d8352c"/>' +
    '<path d="M40 252H226L262 214H472" fill="none" stroke="#8e1b17" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="150" cy="140" r="76" fill="#fff"/><circle cx="150" cy="140" r="60" fill="#2f9be0"/><circle cx="128" cy="116" r="16" fill="#fff" opacity=".85"/>' +
    '<circle cx="266" cy="104" r="18" fill="#ff8a80"/><circle cx="318" cy="104" r="18" fill="#ffd54a"/><circle cx="370" cy="104" r="18" fill="#6fdc8c"/>' +
    '<rect x="106" y="292" width="300" height="156" rx="22" fill="#f4f7f8"/><rect x="126" y="310" width="260" height="120" rx="12" fill="#183b48"/>' +
    '<rect x="168" y="382" width="34" height="30" rx="8" fill="#58d0ff"/><rect x="239" y="352" width="34" height="60" rx="8" fill="#58d0ff"/>' +
    '<rect x="310" y="326" width="34" height="86" rx="8" fill="#58d0ff"/></svg>';
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var FILTERS = [
    ["all", "All"], ["pokemon", "Pokémon"], ["trainer", "Trainers"],
    ["owned", "Owned"], ["missing", "Missing"], ["wish", "Wishlist"]
  ];
  var SORTS = [["dex", "Dex no."], ["name", "Name"], ["year", "Release year"]];

  var ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  var ICON_MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad4(n) { return ("000" + n).slice(-4); }
  function fmtDate(d) {
    if (!d) return "";
    var p = String(d).split("-");
    if (p.length === 3) return (+p[2]) + " " + MONTHS[+p[1] - 1] + " " + p[0];
    if (p.length === 2) return MONTHS[+p[1] - 1] + " " + p[0];
    return p[0];
  }
  function yen(n) { return "¥" + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function norm(s) {
    // lower-case, strip accents, katakana -> hiragana so either script matches
    s = String(s || "").toLowerCase();
    if (s.normalize) s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    return s.replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  }

  // Katakana/hiragana -> Hepburn romaji ("サカキ" -> "Sakaki", "オーキド博士" -> "Ōkido Hakase").
  var KANA = (function () {
    var rows = "ア a イ i ウ u エ e オ o カ ka キ ki ク ku ケ ke コ ko サ sa シ shi ス su セ se ソ so " +
      "タ ta チ chi ツ tsu テ te ト to ナ na ニ ni ヌ nu ネ ne ノ no ハ ha ヒ hi フ fu ヘ he ホ ho " +
      "マ ma ミ mi ム mu メ me モ mo ヤ ya ユ yu ヨ yo ラ ra リ ri ル ru レ re ロ ro ワ wa ヲ o ン n " +
      "ガ ga ギ gi グ gu ゲ ge ゴ go ザ za ジ ji ズ zu ゼ ze ゾ zo ダ da ヂ ji ヅ zu デ de ド do " +
      "バ ba ビ bi ブ bu ベ be ボ bo パ pa ピ pi プ pu ペ pe ポ po ヴ vu " +
      "ァ a ィ i ゥ u ェ e ォ o ャ ya ュ yu ョ yo " +
      "キャ kya キュ kyu キョ kyo シャ sha シュ shu ショ sho チャ cha チュ chu チョ cho " +
      "ニャ nya ニュ nyu ニョ nyo ヒャ hya ヒュ hyu ヒョ hyo ミャ mya ミュ myu ミョ myo " +
      "リャ rya リュ ryu リョ ryo ギャ gya ギュ gyu ギョ gyo ジャ ja ジュ ju ジョ jo " +
      "ビャ bya ビュ byu ビョ byo ピャ pya ピュ pyu ピョ pyo " +
      "シェ she ジェ je チェ che ティ ti ディ di トゥ tu ドゥ du デュ dyu " +
      "ファ fa フィ fi フェ fe フォ fo ウィ wi ウェ we ウォ wo ヴァ va ヴィ vi ヴェ ve ヴォ vo";
    var m = {}, a = rows.split(" "), i;
    for (i = 0; i < a.length; i += 2) m[a[i]] = a[i + 1];
    return m;
  })();
  var KANJI = { "博士": " Hakase" };
  var MACRON = { a: "ā", i: "ī", u: "ū", e: "ē", o: "ō" };
  function romaji(s) {
    var out = "", i, ch, two, r, k, gem = false;
    if (!s) return "";
    for (k in KANJI) if (KANJI.hasOwnProperty(k)) s = s.split(k).join(KANJI[k]);
    s = s.replace(/[\u3041-\u3096]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i); two = s.substr(i, 2);
      if (ch === "ッ") { gem = true; continue; }
      if (ch === "ー") {
        r = out.slice(-1);
        if (MACRON[r]) out = out.slice(0, -1) + MACRON[r];
        continue;
      }
      if (KANA[two] && two.length === 2) { r = KANA[two]; i++; }
      else if (KANA[ch]) r = KANA[ch];
      else { out += ch; gem = false; continue; }
      if (gem && !/^[aiueo]/.test(r)) out += r.indexOf("ch") === 0 ? "t" : r.charAt(0);
      gem = false;
      out += r;
    }
    out = out.replace(/\s+/g, " ").trim();
    return out.replace(/(^|\s)(\S)/g, function (x, sp, c) { return sp + c.toUpperCase(); });
  }

  function mount(root, opts) {
    var data = opts.data;
    var st = opts.load() || {};
    st.owned = st.owned || {}; st.wish = st.wish || {}; st.prefs = st.prefs || {};
    var prefs = st.prefs;
    if (!prefs.sort) prefs.sort = "dex";
    if (prefs.dim == null) prefs.dim = false;
    if (!prefs.theme) prefs.theme = "auto";

    var ui = { screen: "home", region: "all", filter: "all", query: "", detail: null, fig: null, menu: false, search: false };
    var idx = buildIndex(data);
    var scrollMemo = {};

    root.classList.add("swdex");
    root.innerHTML = '<div class="sw-scroll"><div class="sw-wrap"></div></div><div class="sw-bottom"></div>';
    var scroller = root.querySelector(".sw-scroll");
    var wrap = root.querySelector(".sw-wrap");
    var bottom = root.querySelector(".sw-bottom");
    var sheet = null;
    var mq = global.matchMedia ? global.matchMedia("(prefers-color-scheme: dark)") : null;

    function applyTheme() {
      var dark = prefs.theme === "dark" || (prefs.theme === "auto" && (opts.dark === true || (opts.dark !== false && mq && mq.matches)));
      root.classList.toggle("sw-dark", !!dark);
      root.classList.toggle("sw-dim", !!prefs.dim);
    }
    function save() { try { opts.save(st); } catch (e) { console.error("Scaledex save failed", e); } }

    // ------------------------------------------------------------ data index
    function buildIndex(d) {
      var o = { fig: {}, chr: {}, prod: {}, reg: {}, chain: {}, upcoming: {} };
      var today = opts.today || new Date().toISOString().slice(0, 10);
      d.figures.forEach(function (f) { o.fig[f.id] = f; });
      d.products.forEach(function (p) {
        o.prod[p.id] = p;
        // compare at the precision of the date: "2026-12" is upcoming until December starts
        p.upcoming = !!p.date && p.date > today.slice(0, p.date.length);
      });
      d.characters.forEach(function (c) {
        o.chr[c.id] = c;
        if (c.chain) (o.chain[c.chain] = o.chain[c.chain] || []).push(c);
      });
      d.regions.forEach(function (r) { o.reg[r.id] = r; });
      o.reg.upcoming = UPCOMING;
      d.figures.forEach(function (f) {
        if (f.productIds.some(function (id) { return o.prod[id] && o.prod[id].upcoming; })) o.upcoming[f.id] = true;
      });
      return o;
    }
    function src(rel, url) { return opts.img ? opts.img(rel, url) : (rel || url || ""); }
    function imgTag(rel, url, cls, alt, eager) {
      var s = src(rel, url);
      return '<img' + (cls ? ' class="' + cls + '"' : "") + (eager ? "" : ' loading="lazy"') + ' decoding="async" alt="' + esc(alt || "") +
        '" src="' + esc(s) + '"' + (url && s !== url ? ' data-fb="' + esc(url) + '"' : "") + ">";
    }
    // trimmed render fills a tile; the original keeps Bandai's true relative scale
    function figImg(f, cls, alt, forceTrim) {
      var useTrim = forceTrim || !prefs.trueScale;
      return imgTag(useTrim && f.imageTrim ? f.imageTrim : f.image, f.imageUrl, cls, alt);
    }
    function figsIn(region) {
      if (region === "upcoming") return data.figures.filter(function (f) { return idx.upcoming[f.id]; });
      return data.figures.filter(function (f) { return region === "all" || f.regions.indexOf(region) >= 0; });
    }
    function charName(c) { return c.nameEn; }
    // "gym:rock" -> { en: "Gym Leader · Rock", ja: "ジムリーダー", type: "rock" }
    function roleInfo(r) {
      var k = r.split(":"), d = (data.roles && data.roles[k[0]]) || { en: k[0], ja: "" };
      var t = k[1] && data.types && data.types[k[1]];
      return { en: d.en + (t ? " · " + t.en : ""), short: d.en, ja: d.ja + (t ? "（" + t.ja + "）" : ""), type: k[1] || "", id: k[0] };
    }
    function figLabel(f) {
      var c = idx.chr[f.characterId];
      return f.labelEn || (idx.reg[f.region] ? idx.reg[f.region].nameEn : "") || c.nameEn;
    }

    function tilesFor(region) {
      var map = {}, order = [];
      figsIn(region).forEach(function (f) {
        var t = map[f.characterId];
        if (!t) { t = map[f.characterId] = { c: idx.chr[f.characterId], figs: [] }; order.push(t); }
        t.figs.push(f);
      });
      order.forEach(function (t) {
        t.owned = t.figs.filter(function (f) { return st.owned[f.id]; }).length;
        t.wish = t.figs.some(function (f) { return st.wish[f.id]; });
        t.year = Math.min.apply(null, t.figs.map(function (f) { return f.firstYear || 9999; }));
      });
      return order;
    }

    function matches(t) {
      var f = ui.filter;
      if (f === "pokemon" && t.c.kind !== "pokemon") return false;
      if (f === "trainer" && t.c.kind !== "trainer") return false;
      if (f === "owned" && !t.owned) return false;
      if (f === "missing" && t.owned >= t.figs.length) return false;
      if (f === "wish" && !t.wish) return false;
      if (ui.query) {
        var q = norm(ui.query).trim();
        if (!q) return true;
        var hay = [t.c.nameEn, t.c.nameJa, romaji(t.c.nameJa), t.c.dex ? pad4(t.c.dex) : "", t.c.dex || ""];
        // the whole evolution line: "charmander" also finds Charmeleon and Charizard
        (t.c.chain && idx.chain[t.c.chain] || []).forEach(function (o) { hay.push(o.nameEn, o.nameJa, romaji(o.nameJa)); });
        (t.c.roles || []).forEach(function (r) { var i = roleInfo(r); hay.push(i.en, i.ja); });
        t.figs.forEach(function (x) { hay.push(x.labelEn, x.labelJa, x.nameJa); });
        if (norm(hay.join(" ")).indexOf(q) < 0) return false;
      }
      return true;
    }

    function sortTiles(list) {
      var s = prefs.sort;
      return list.slice().sort(function (a, b) {
        if (s === "name") return charName(a.c).localeCompare(charName(b.c));
        if (s === "year") return (a.year - b.year) || cmpDex(a, b);
        return cmpDex(a, b);
      });
    }
    function cmpDex(a, b) {
      var ka = a.c.kind === "pokemon" ? 0 : 1, kb = b.c.kind === "pokemon" ? 0 : 1;
      if (ka !== kb) return ka - kb;
      if (ka === 0) return a.c.dex - b.c.dex;
      // trainers: Bulbapedia's "List of Trainer figurines" order, then unlisted ones by year
      var oa = a.c.order == null ? 1e4 : a.c.order, ob = b.c.order == null ? 1e4 : b.c.order;
      return (oa - ob) || (a.year - b.year) || a.c.nameEn.localeCompare(b.c.nameEn);
    }

    // ------------------------------------------------------------ screens
    function render() {
      applyTheme();
      if (ui.screen === "home" && !ui.query) renderHome(); else renderGrid();
      renderBottom();
    }

    function regionStats(region) {
      var figs = figsIn(region);
      var owned = figs.filter(function (f) { return st.owned[f.id]; }).length;
      return { total: figs.length, owned: owned };
    }

    function regionArt(region) {
      var figs = figsIn(region).filter(function (f) { return f.image || f.imageUrl; });
      var poke = figs.filter(function (f) { return f.kind === "pokemon"; })
        .sort(function (a, b) { return idx.chr[a.characterId].dex - idx.chr[b.characterId].dex; });
      var trainer = figs.filter(function (f) { return f.kind === "trainer"; });
      var pick = [];
      if (trainer[0]) pick.push(trainer[0]);
      for (var i = 0; i < poke.length && pick.length < 3; i++) {
        if (!pick.some(function (p) { return p.characterId === poke[i].characterId; })) pick.push(poke[i]);
      }
      var pos = [["right:3%", 2], ["right:34%", 1], ["right:62%", 0]];
      return pick.slice(0, 3).map(function (f, i) {
        return figImg(f, "", "", true).replace("<img", '<img style="' + pos[i][0] + ";z-index:" + pos[i][1] + '"');
      }).join("");
    }

    function renderHome() {
      var all = regionStats("all");
      var h = '<div class="sw-top"><h1>' + LOGO + 'Scaledex</h1><span class="sw-count">Owned: ' + all.owned + "</span></div>";
      h += '<div class="sw-sub">' + data.characters.length + " characters · " + data.figures.length + " figures · " +
        data.products.length + " releases</div>";
      var regs = [{ id: "all", nameEn: "All", nameJa: "すべてのフィギュア" }].concat(data.regions);
      if (figsIn("upcoming").length) {
        var at = regs.map(function (r) { return r.id; }).indexOf("special");
        regs.splice(at < 0 ? regs.length : at, 0, UPCOMING);
      }
      regs.forEach(function (r) {
        var s = regionStats(r.id);
        var done = s.total > 0 && s.owned >= s.total;
        var pct = s.total ? Math.round(100 * s.owned / s.total) : 0;
        h += '<button class="sw-region' + (done ? " is-complete" : "") + '" data-act="region" data-id="' + r.id +
          '" style="--rc:' + (REGION_COLORS[r.id] || "#1b86b6") + '">' +
          '<div class="sw-region-art">' + regionArt(r.id) + "</div>" +
          '<div class="sw-region-text"><div class="sw-region-name">' + esc(r.nameEn) + "</div>" +
          '<div class="sw-region-ja">' + esc(r.nameJa) + "</div>" +
          (done ? '<div class="sw-done">Complete!</div>' : '<div class="sw-bar"><i style="width:' + pct + '%"></i></div>') +
          '<div class="sw-region-progress">' + s.owned + " / " + s.total + "</div></div></button>";
      });
      h += '<div class="sw-note" style="text-align:center;margin:18px 0">Data ' + esc(data.generated) +
        " · official Bandai Scale World dex, Bandai Candy & Premium Bandai pages</div>";
      wrap.innerHTML = h;
    }

    function renderGrid() {
      var region = ui.screen === "home" ? "all" : ui.region;
      var r = region === "all" ? { nameEn: "All figures" } : idx.reg[region];
      var tiles = tilesFor(region);
      var s = regionStats(region);
      var nP = tiles.filter(function (t) { return t.c.kind === "pokemon"; }).length;
      var nW = figsIn(region).filter(function (f) { return st.wish[f.id]; }).length;
      var h = '<div class="sw-statcard"><div class="sw-stat-head">' +
        '<button class="sw-back" data-act="home" aria-label="Back">‹</button>' +
        '<div class="sw-stat-title">' + esc(r.nameEn) + "</div>" +
        '<div class="sw-pill">' + s.owned + " / " + s.total + "</div></div>" +
        '<div class="sw-stats">' +
        "<div><b>" + nP + "</b><span>Pokémon</span></div>" +
        "<div><b>" + (tiles.length - nP) + "</b><span>Trainers</span></div>" +
        "<div><b>" + s.total + "</b><span>Figures</span></div>" +
        "<div><b>" + nW + "</b><span>Wishlist</span></div>" +
        "<div><b>" + (s.total ? Math.round(100 * s.owned / s.total) : 0) + "%</b><span>★ Owned</span></div>" +
        "</div></div>";

      var shown = sortTiles(tiles.filter(matches));
      if (!shown.length) {
        h += '<div class="sw-empty">' + (ui.query ? "No figures match “" + esc(ui.query) + "”" : "Nothing here yet") + "</div>";
      } else if (prefs.sort === "dex" && ui.filter === "all") {
        var p = shown.filter(function (t) { return t.c.kind === "pokemon"; });
        var tr = shown.filter(function (t) { return t.c.kind !== "pokemon"; });
        if (p.length) h += '<div class="sw-section">Pokémon</div><div class="sw-grid">' + p.map(tileHtml).join("") + "</div>";
        if (tr.length) h += '<div class="sw-section">Trainers</div><div class="sw-grid">' + tr.map(tileHtml).join("") + "</div>";
      } else {
        h += '<div class="sw-grid">' + shown.map(tileHtml).join("") + "</div>";
      }
      wrap.innerHTML = h;
    }

    function tileHtml(t) {
      var f = t.figs[0];
      var n = t.figs.length;
      var badgeL = t.owned >= n ? '<span class="sw-dot own">✓</span>' :
        t.owned ? '<span class="sw-dot part">' + t.owned + "/" + n + "</span>" : (n > 1 ? '<span class="sw-dot multi">×' + n + "</span>" : "<span></span>");
      var badgeR = t.wish ? '<span class="sw-dot wish">♥</span>' : "";
      var label = t.c.kind === "pokemon" ? '<div class="sw-tile-no">' + pad4(t.c.dex) + "</div>" :
        (t.c.roles && t.c.roles.length ? '<div class="sw-tile-role">' + esc(roleInfo(t.c.roles[0]).short) + "</div>" : "");
      return '<button class="sw-tile' + (t.owned ? "" : " is-missing") + '" data-act="open" data-id="' + esc(t.c.id) +
        '" data-fig="' + esc(f.id) + '">' +
        '<div class="sw-tile-badges">' + badgeL + badgeR + "</div>" +
        '<div class="sw-tile-img">' + figImg(f, "", t.c.nameEn) + "</div>" +
        label + '<div class="sw-tile-name">' + esc(t.c.nameEn) + "</div></button>";
    }

    function renderBottom() {
      var h = "";
      if (ui.screen !== "home" || ui.query) {
        h += '<div class="sw-chips">' + FILTERS.map(function (f) {
          return '<button class="sw-chip' + (ui.filter === f[0] ? " on" : "") + '" data-act="filter" data-id="' + f[0] + '">' + f[1] + "</button>";
        }).join("") + "</div>";
      }
      h += '<div class="sw-fabs">';
      if (ui.search) {
        h += '<button class="sw-fab" data-act="search-close" aria-label="Close search">' + ICON_X + "</button>" +
          '<input class="sw-search" type="search" placeholder="Name, 名前 or dex no." value="' + esc(ui.query) + '" autocomplete="off">';
      } else {
        h += '<button class="sw-fab" data-act="search" aria-label="Search">' + ICON_SEARCH + "</button>";
      }
      h += '<button class="sw-fab" data-act="menu" aria-label="Menu">' + ICON_MENU + "</button></div>";
      bottom.innerHTML = h;
      var input = bottom.querySelector(".sw-search");
      if (input) {
        input.addEventListener("input", function () {
          var hadChips = !!bottom.querySelector(".sw-chips");
          ui.query = input.value;
          if (ui.screen === "home" && !ui.query) renderHome(); else renderGrid();
          var needChips = ui.screen !== "home" || !!ui.query;
          if (hadChips !== needChips) { ui.focusSearch = true; renderBottom(); }
        });
        if (ui.focusSearch) { input.focus(); ui.focusSearch = false; }
      }
    }

    // ------------------------------------------------------------ detail sheet
    function openDetail(cid, figId, push) {
      ui.detail = cid;
      var c = idx.chr[cid];
      var figs = c.figures.map(function (id) { return idx.fig[id]; }).filter(Boolean);
      ui.fig = figId && idx.fig[figId] ? figId : figs[0].id;
      if (push !== false) pushHistory();
      renderSheet();
    }

    function renderSheet() {
      if (!ui.detail) { if (sheet) { sheet.remove(); sheet = null; } return; }
      var c = idx.chr[ui.detail];
      var figs = c.figures.map(function (id) { return idx.fig[id]; }).filter(Boolean);
      var f = idx.fig[ui.fig] || figs[0];
      if (!sheet) { sheet = document.createElement("div"); sheet.className = "sw-sheet"; root.appendChild(sheet); }
      var prevScroll = sheet.scrollTop;

      var h = '<div class="sw-hero">' +
        (c.dex ? '<div class="sw-hero-no">#' + pad4(c.dex) + "</div>" : '<div class="sw-hero-no">Trainer</div>') +
        figImg(f, "", c.nameEn) +
        '<button class="sw-close" data-act="close" aria-label="Close">✕</button></div><div class="sw-body">' +
        '<h2 class="sw-name">' + esc(c.nameEn) + '</h2><div class="sw-name-ja">' + esc(c.nameJa) +
        (romaji(c.nameJa) ? ' <span class="sw-romaji">· ' + esc(romaji(c.nameJa)) + "</span>" : "") + "</div>";
      var types = f.types || c.types || [];
      if (types.length) h += '<div class="sw-types">' + types.map(function (t) {
        var n = data.types && data.types[t];
        return '<span class="sw-type" style="--tc:' + (TYPE_COLORS[t] || "#888") + '" title="' + esc(n ? n.ja : "") + '">' +
          esc(n ? n.en : t) + "</span>";
      }).join("") + "</div>";
      if (c.roles && c.roles.length) h += '<div class="sw-types">' + c.roles.map(function (r) {
        var i = roleInfo(r);
        return '<span class="sw-type sw-role role-' + esc(i.id) + '"' + (i.type ? ' style="--tc:' + (TYPE_COLORS[i.type] || "#888") + '"' : "") +
          ' title="' + esc(i.ja) + '">' + esc(i.en) + "</span>";
      }).join("") + "</div>";

      if (figs.length > 1) {
        var labels = figs.map(figLabel), count = {};
        labels.forEach(function (l) { count[l] = (count[l] || 0) + 1; });
        h += '<div class="sw-figtabs">' + figs.map(function (x, i) {
          var dot = st.owned[x.id] ? '<span class="sw-dot own">✓</span>' : st.wish[x.id] ? '<span class="sw-dot wish">♥</span>' : "";
          var lab = labels[i] + (count[labels[i]] > 1 && x.firstYear ? " " + x.firstYear : "");
          return '<button class="sw-figtab' + (x.id === f.id ? " on" : "") + '" data-act="fig" data-id="' + esc(x.id) + '">' +
            dot + figImg(x, "", "", true) + esc(lab) + "</button>";
        }).join("") + "</div>";
      }

      var reg = idx.reg[f.region];
      h += '<div class="sw-card">';
      var showJa = f.labelJa && /[^\x00-\x7f]/.test(f.labelJa);
      if (f.labelEn || f.labelJa) h += '<div class="sw-label">' + esc(f.labelEn || f.labelJa) + (showJa && f.labelEn ? ' <span style="opacity:.7">' + esc(f.labelJa) + "</span>" : "") + "</div>";
      h += '<div class="sw-facts">' +
        "<div><b>" + (f.heightCm ? f.heightCm + " cm" : "—") + "</b><span>Scale height</span></div>" +
        "<div><b>" + esc(reg ? reg.nameEn : "—") + "</b><span>Line</span></div>" +
        "<div><b>" + (f.firstYear || "—") + "</b><span>First release</span></div></div>" +
        '<div class="sw-toggles">' +
        '<button class="sw-toggle own' + (st.owned[f.id] ? " on" : "") + '" data-act="own" data-id="' + esc(f.id) + '">' + (st.owned[f.id] ? "✓ Owned" : "Owned") + "</button>" +
        '<button class="sw-toggle wish' + (st.wish[f.id] ? " on" : "") + '" data-act="wish" data-id="' + esc(f.id) + '">' + (st.wish[f.id] ? "♥ Wishlist" : "Wishlist") + "</button>" +
        "</div></div>";

      h += evolutionHtml(c, f);

      var prods = f.productIds.map(function (id) { return idx.prod[id]; }).filter(Boolean);
      h += '<div class="sw-h">Releases (' + prods.length + ")</div>";
      var firstDate = prods.length ? (prods[0].date || "") : "";
      if (!prods.length) h += '<div class="sw-card sw-note">No release information found.</div>';
      else h += '<div class="sw-card">' + prods.map(function (p) {
        // later than the first release (by month) or flagged as re-order/re-sale
        var later = p.date && firstDate && p.date.slice(0, 7) > firstDate.slice(0, 7);
        return releaseHtml(p, p.rerelease || later);
      }).join("") + "</div>";

      h += '<div class="sw-note">Prices are Japanese retail prices including tax unless marked “+ tax”. Candy-aisle prices are per box. ' +
        "Premium Bandai prices come from archived product pages. " +
        '<a href="' + esc(f.source) + '" target="_blank" rel="noopener">' +
        (/\/lineup\//.test(f.source || "") ? "Official dex page ↗" : "Product page ↗ (not in the official dex yet)") + "</a></div></div>";
      sheet.innerHTML = h;
      sheet.scrollTop = prevScroll;
    }

    // Charmander › Charmeleon › Charizard › Mega Charizard X; grey = no figure yet
    function evolutionHtml(c, cur) {
      if (c.kind !== "pokemon") return "";
      var rows = (c.chain && data.evolution && data.evolution[c.chain]) || [[c.dex, null]];
      var from = {}, stage = {}, stages = [], megas = [];
      rows.forEach(function (r) { from[r[0]] = r[1]; });
      function depth(d) {
        if (stage[d] != null) return stage[d];
        var p = from[d];
        return (stage[d] = p && from.hasOwnProperty(p) ? depth(p) + 1 : 0);
      }
      rows.forEach(function (r) { var k = depth(r[0]); (stages[k] = stages[k] || []).push(r[0]); });
      rows.forEach(function (r) {
        var o = idx.chr["p" + pad4(r[0])];
        (o ? o.figures : []).forEach(function (id) {
          var x = idx.fig[id];
          if (x && /^Mega /.test(x.labelEn || "")) megas.push({ c: o, f: x });
        });
      });
      if (megas.length) stages.push(megas);
      if (stages.length < 2) return "";
      function item(o, x, name) {
        if (!o) return '<span class="sw-evo is-none"><span class="sw-evo-img">?</span><span class="sw-evo-name">' + esc(name) + "</span></span>";
        var on = x ? x.id === cur.id : o.id === c.id && !/^Mega /.test(cur.labelEn || "");
        var f = x || idx.fig[o.figures[0]];
        return '<button class="sw-evo' + (on ? " on" : "") + '" data-act="open" data-id="' + esc(o.id) + '" data-fig="' + esc(f.id) + '">' +
          '<span class="sw-evo-img">' + figImg(f, "", "", true) + '</span><span class="sw-evo-name">' + esc(name) + "</span></button>";
      }
      var h = stages.map(function (list) {
        return '<div class="sw-evo-stage">' + list.map(function (e) {
          if (e.f) return item(e.c, e.f, e.f.labelEn);
          var o = idx.chr["p" + pad4(e)], n = data.speciesNames && data.speciesNames[e];
          return item(o, null, o ? o.nameEn : (n ? n[0] : "#" + e));
        }).join("") + "</div>";
      }).join('<span class="sw-evo-arrow">›</span>');
      return '<div class="sw-h">Evolution</div><div class="sw-card sw-evos">' + h + "</div>";
    }

    function releaseHtml(p, isRe) {
      var tags = [];
      if (p.date) {
        var ships = /発送|お届け/.test(p.dateText || "");
        tags.push('<span class="sw-tag">' + (ships ? "Ships " : "") + esc(fmtDate(p.date)) + "</span>");
      }
      (p.channels || []).forEach(function (k) {
        var ch = data.channels[k];
        tags.push('<span class="sw-tag ch-' + esc(k) + '" title="' + esc(ch ? ch.ja : "") + '">' + esc(ch ? ch.en : k) + "</span>");
      });
      if (p.priceJPY) tags.push('<span class="sw-tag price">' + yen(p.priceJPY) + "</span>");
      else if (p.priceExTax) tags.push('<span class="sw-tag price">' + yen(p.priceExTax) + " + tax</span>");
      if (isRe) tags.push('<span class="sw-tag re">Re-release</span>');
      if (p.upcoming) tags.push('<span class="sw-tag soon">Upcoming</span>');
      var links = p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + (p.store === "pbandai" ? "Premium Bandai ↗" : "Official page ↗") + "</a>" : "";
      if (p.priceSource && p.priceSource.indexOf("wayback:") === 0) {
        links += '<a href="https://web.archive.org/web/' + esc(p.priceSource.slice(8)) + "/" + esc(p.url) + '" target="_blank" rel="noopener">Archived ↗</a>';
      }
      return '<div class="sw-rel"><div class="sw-rel-img">' + imgTag(p.image, p.imageUrl, "", "", true) + "</div>" +
        '<div class="sw-rel-main"><div class="sw-rel-name">' + esc(p.nameEn) + "</div>" +
        '<div class="sw-rel-ja">' + esc(p.nameJa) + (p.shopTextJa ? " · 売場: " + esc(p.shopTextJa) : "") + "</div>" +
        '<div class="sw-rel-meta">' + tags.join("") + "</div>" +
        '<div class="sw-rel-meta">' + links + "</div></div></div>";
    }

    // ------------------------------------------------------------ menu
    function openMenu() {
      ui.menu = true;
      if (!sheet) { sheet = document.createElement("div"); sheet.className = "sw-sheet"; root.appendChild(sheet); }
      var nOwn = Object.keys(st.owned).length, nWish = Object.keys(st.wish).length;
      var h = '<div class="sw-body" style="padding-top:calc(env(safe-area-inset-top,0px) + 18px)">' +
        '<div class="sw-top" style="padding-left:0;padding-right:0"><h1>Settings</h1>' +
        '<button class="sw-close" style="position:static" data-act="close" aria-label="Close">✕</button></div>' +
        '<div class="sw-h">Sort grid by</div><div class="sw-sort">' + SORTS.map(function (s) {
          return '<button class="' + (prefs.sort === s[0] ? "on" : "") + '" data-act="sort" data-id="' + s[0] + '">' + s[1] + "</button>";
        }).join("") + "</div>" +
        '<div class="sw-h">Theme</div><div class="sw-sort">' + [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(function (s) {
          return '<button class="' + (prefs.theme === s[0] ? "on" : "") + '" data-act="theme" data-id="' + s[0] + '">' + s[1] + "</button>";
        }).join("") + "</div>" +
        '<div class="sw-h">Display</div><div class="sw-menu">' +
        '<label>Grey out figures I don’t own <input type="checkbox" data-act="dim"' + (prefs.dim ? " checked" : "") + "></label>" +
        '<label>Show figures at true relative scale <input type="checkbox" data-act="truescale"' + (prefs.trueScale ? " checked" : "") + "></label></div>" +
        '<div class="sw-h">Collection</div><div class="sw-menu">' +
        '<div class="sw-note" style="margin:0 4px 4px">' + nOwn + " owned · " + nWish + " on wishlist</div>" +
        (opts.menu || []).map(function (m, i) { return '<button data-act="xmenu" data-id="' + i + '">' + esc(m.label) + " <span>›</span></button>"; }).join("") +
        '<button data-act="reset">Clear owned & wishlist <span>›</span></button></div>' +
        '<div class="sw-h">About the data</div><div class="sw-card sw-note" style="margin-top:6px">' +
        "Generated " + esc(data.generated) + ". " + data.characters.length + " characters, " + data.figures.length + " figures, " +
        data.products.length + " releases.<br>Sources: official Pokémon Scale World dex (bandai.co.jp), Bandai Candy product pages, " +
        "Premium Bandai pages via the Internet Archive, PokeAPI names. Figure and product images © Bandai / Pokémon.</div></div>";
      sheet.innerHTML = h;
      sheet.scrollTop = 0;
    }

    // ------------------------------------------------------------ history (PWA)
    function pushHistory() {
      if (!opts.history || !global.history) return;
      try { global.history.pushState({ sw: { screen: ui.screen, region: ui.region, detail: ui.detail, fig: ui.fig } }, ""); } catch (e) { /* ignore */ }
    }
    function onPop(ev) {
      var s = ev.state && ev.state.sw;
      if (!s) { s = { screen: "home", region: "all", detail: null }; }
      ui.menu = false;
      var screenChanged = s.screen !== ui.screen || s.region !== ui.region;
      ui.screen = s.screen; ui.region = s.region;
      ui.detail = s.detail || null; ui.fig = s.fig || null;
      if (screenChanged) { render(); scroller.scrollTop = scrollMemo[ui.screen + ui.region] || 0; }
      renderSheet();
    }
    if (opts.history && global.addEventListener) {
      global.addEventListener("popstate", onPop);
      try { global.history.replaceState({ sw: { screen: "home", region: "all", detail: null } }, ""); } catch (e) { /* ignore */ }
    }

    function closeSheet() {
      if (ui.menu) { ui.menu = false; if (sheet) { sheet.remove(); sheet = null; } return; }
      if (opts.history && ui.detail) { global.history.back(); return; }
      ui.detail = null; renderSheet();
    }

    // ------------------------------------------------------------ events
    function onClick(e) {
      var el = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!el || !root.contains(el)) return;
      var act = el.getAttribute("data-act"), id = el.getAttribute("data-id");
      if (act === "dim" || act === "truescale") return; // handled by change
      switch (act) {
        case "region":
          scrollMemo[ui.screen + ui.region] = scroller.scrollTop;
          ui.screen = "grid"; ui.region = id; ui.filter = "all";
          pushHistory(); render(); scroller.scrollTop = 0; break;
        case "home":
          if (opts.history && ui.screen !== "home") { global.history.back(); break; }
          ui.screen = "home"; ui.query = ""; ui.search = false; render(); scroller.scrollTop = scrollMemo.homeall || 0; break;
        case "filter": ui.filter = id; renderGrid(); renderBottom(); scroller.scrollTop = 0; break;
        case "open": scrollMemo[ui.screen + ui.region] = scroller.scrollTop; openDetail(id, el.getAttribute("data-fig")); break;
        case "fig": ui.fig = id; renderSheet(); break;
        case "close": closeSheet(); break;
        case "own": case "wish":
          var bag = act === "own" ? st.owned : st.wish;
          if (bag[id]) delete bag[id]; else bag[id] = new Date().toISOString().slice(0, 10);
          if (act === "own" && st.owned[id] && st.wish[id]) delete st.wish[id];
          save(); renderSheet(); var keep = scroller.scrollTop; render(); scroller.scrollTop = keep; break;
        case "search": ui.search = true; ui.focusSearch = true; renderBottom(); break;
        case "search-close": ui.search = false; ui.query = ""; render(); break;
        case "menu": openMenu(); break;
        case "sort": prefs.sort = id; save(); openMenu(); render(); break;
        case "theme": prefs.theme = id; save(); applyTheme(); openMenu(); break;
        case "xmenu": opts.menu[+id].run(api); break;
        case "reset":
          if (global.confirm && !global.confirm("Clear all owned and wishlist marks?")) break;
          st.owned = {}; st.wish = {}; save(); openMenu(); render(); break;
      }
    }
    function onChange(e) {
      var act = e.target.getAttribute && e.target.getAttribute("data-act");
      if (act === "dim") { prefs.dim = e.target.checked; save(); applyTheme(); }
      if (act === "truescale") { prefs.trueScale = e.target.checked; save(); render(); }
    }
    function onError(e) {
      var t = e.target;
      if (t && t.tagName === "IMG" && t.getAttribute("data-fb") && t.src !== t.getAttribute("data-fb")) {
        t.src = t.getAttribute("data-fb"); t.removeAttribute("data-fb");
      }
    }
    function onKey(e) {
      if (e.key === "Escape" && (ui.detail || ui.menu)) closeSheet();
    }
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    root.addEventListener("error", onError, true);
    root.addEventListener("keydown", onKey);
    if (mq && mq.addEventListener) mq.addEventListener("change", applyTheme);

    var api = {
      getState: function () { return st; },
      setState: function (s) { st = s || {}; st.owned = st.owned || {}; st.wish = st.wish || {}; st.prefs = st.prefs || prefs; prefs = st.prefs; save(); render(); if (ui.menu) openMenu(); },
      setData: function (d) { data = d; idx = buildIndex(d); render(); },
      setDark: function (v) { opts.dark = v; applyTheme(); },
      destroy: function () {
        root.removeEventListener("click", onClick); root.removeEventListener("change", onChange);
        root.removeEventListener("error", onError, true); root.removeEventListener("keydown", onKey);
        if (opts.history) global.removeEventListener("popstate", onPop);
        if (mq && mq.removeEventListener) mq.removeEventListener("change", applyTheme);
        root.innerHTML = ""; root.classList.remove("swdex", "sw-dark", "sw-dim");
      }
    };
    render();
    return api;
  }

  var Scaledex = { mount: mount, romaji: romaji };
  if (typeof module !== "undefined" && module.exports) module.exports = Scaledex;
  global.Scaledex = Scaledex;
})(typeof window !== "undefined" ? window : this);
