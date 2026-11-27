/*
@title        Scaledex - shared UI core
@author       La Gia Huy
@since        2026-11-14
@updated      2026-11-27
@about        Framework-free Pokédex UI for Bandai's Pokémon Scale World figures.
              Used by both the PWA (pwa/) and the Obsidian plugin (obsidian-plugin/).
              Usage:
                Scaledex.mount(rootEl, {
                  data,                       // parsed data/scaledex.json
                  img: (rel, url) => src,     // resolve a bundled image (fallback: url)
                  load: () => state,          // { owned:{}, wish:{}, prefs:{} }
                  save: (state) => void,
                  history: true,              // use history.pushState (PWA only)
                  menu: [{ label, labelVi, run }], // extra menu entries (export/import...)
                  dark: false | true | 'auto',
                  hostTheme: false,           // true (Obsidian): on Auto, take colours from the host's CSS variables
                  today: 'YYYY-MM-DD',        // optional; "Upcoming" = releases after this date
                  keyboard: 'global'          // "/" and Ctrl/Cmd+K open search page-wide (PWA);
                                              // hosts can call api.openSearch() themselves
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
  // home-card landscapes (app/landscapes/<region>.jpg), filled in by tools/build.mjs: file URLs
  // for the PWA, data URIs for the Obsidian plugin. A region without one shows its figure row.
  var LANDSCAPES = /*__LANDSCAPES__*/ {};
  // donation QR in the menu (app/donate.jpg), filled in by tools/build.mjs the same way; "" hides the section
  var DONATE_QR = /*__DONATE__*/ "";
  // Ko-fi page for supporters outside Vietnam, shown under the QR; "" hides the button
  var KOFI_URL = "https://ko-fi.com/huyla";
  var UPCOMING = { id: "upcoming", nameEn: "Upcoming", nameJa: "発売予定" };
  var STATUS = { legendary: ["Legendary", "伝説のポケモン"], mythical: ["Mythical", "幻のポケモン"],
                 powerhouse: ["Powerhouse", "600族 (pseudo-legendary)"] };
  var ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
  var ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
  // header logo: same drawing as pwa/icons/icon.svg, flat colours, rounded
  var LOGO = '<svg class="sw-logo" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#d8352c"/>' +
    '<path d="M40 252H226L262 214H472" fill="none" stroke="#8e1b17" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="150" cy="140" r="76" fill="#fff"/><circle cx="150" cy="140" r="60" fill="#2f9be0"/><circle cx="128" cy="116" r="16" fill="#fff" opacity=".85"/>' +
    '<circle cx="266" cy="104" r="18" fill="#ff8a80"/><circle cx="318" cy="104" r="18" fill="#ffd54a"/><circle cx="370" cy="104" r="18" fill="#6fdc8c"/>' +
    '<rect x="106" y="292" width="300" height="156" rx="22" fill="#f4f7f8"/><rect x="126" y="310" width="260" height="120" rx="12" fill="#183b48"/>' +
    '<rect x="168" y="382" width="34" height="30" rx="8" fill="#58d0ff"/><rect x="239" y="352" width="34" height="60" rx="8" fill="#58d0ff"/>' +
    '<rect x="310" y="326" width="34" height="86" rx="8" fill="#58d0ff"/></svg>';
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var FILTERS = ["all", "pokemon", "trainer", "owned", "missing", "wish"];  // labels: "f_" + id
  var SORTS = ["dex", "name", "year"];                                     // labels: "s_" + id
  var TILE_SIZES = ["s", "m", "l"];                                        // labels: "ts_" + id

  // UI text, English / Vietnamese. Character, region, product and form names stay as they are.
  // "{0}" is replaced by t()'s second argument.
  var I18N = {
    en: {
      f_all: "All", f_pokemon: "Pokémon", f_trainer: "Trainers", f_owned: "Owned", f_missing: "Missing", f_wish: "Wishlist",
      s_dex: "Dex no.", s_name: "Name", s_year: "Release year",
      reg_all: "All", reg_upcoming: "Upcoming", allFigures: "All figures",
      ownedCount: "Owned: {0}", dark: "Dark theme", toLight: "Switch to light theme", toDark: "Switch to dark theme",
      lang: "Language", toOther: "Tiếng Việt",
      sub: "{0} characters · {1} figures · {2} releases", complete: "Complete!",
      footer: "Data {0} · official Bandai Scale World dex, Bandai Candy & Premium Bandai pages",
      pokemon: "Pokémon", trainers: "Trainers", figures: "Figures", wishlist: "Wishlist", ownedPct: "★ Owned",
      noMatch: "No figures match “{0}”", nothing: "Nothing here yet",
      search: "Search", closeSearch: "Close search", searchPh: "Name, 名前 or dex no.", menu: "Menu", back: "Back", close: "Close",
      trainer: "Trainer", height: "Scale height", region: "Region", firstRelease: "First release",
      owned: "Owned", wish: "Wishlist", releases: "Releases ({0})", noReleases: "No release information found.",
      priceNote: "Prices are Japanese retail prices including tax unless marked “+ tax”. Candy-aisle prices are per box. " +
        "Premium Bandai prices come from archived product pages. ",
      dexPage: "Official dex page ↗", productPage: "Product page ↗ (not in the official dex yet)",
      evolution: "Evolution", ships: "Ships {0}", plusTax: "{0} + tax", rerelease: "Re-release", upcoming: "Upcoming",
      officialPage: "Official page ↗", archived: "Archived ↗",
      settings: "Settings", sortBy: "Sort grid by", display: "Display", dim: "Grey out figures I don’t own",
      tileSize: "Tile size", ts_s: "Small", ts_m: "Medium", ts_l: "Large", tint: "Tint tiles by type", tabAbout: "About",
      trueScale: "Show figures at true relative scale", collection: "Collection", collCount: "{0} owned · {1} on wishlist",
      reset: "Clear owned & wishlist", resetAsk: "Clear all owned and wishlist marks?", about: "About the data", prev: "Previous", next: "Next", keys: "Keyboard shortcuts",
      k_search: "Search", k_menu: "Menu", k_lang: "Language", k_theme: "Light / dark theme", k_home: "Region list",
      k_back: "Back", k_close: "Close", k_step: "Previous / next figure page", k_own: "Mark owned / wishlist (figure page)", k_filter: "Grid filters",
      support: "Buy me a coffee", supportText: "Enjoying Scaledex? Scan with MoMo or any Vietnamese banking app (VietQR / Napas 247) to chip in.",
      kofi: "Support on Ko-fi ↗", kofiText: "Outside Vietnam? Ko-fi takes cards and PayPal.",
      aboutText: "Generated {0}. {1} characters, {2} figures, {3} releases.<br>Sources: official Pokémon Scale World dex (bandai.co.jp), " +
        "Bandai Candy product pages, Premium Bandai pages via the Internet Archive, PokeAPI names. Figure and product images © Bandai / Pokémon."
    },
    vi: {
      f_all: "Tất cả", f_pokemon: "Pokémon", f_trainer: "HLV", f_owned: "Đã có", f_missing: "Còn thiếu", f_wish: "Muốn mua",
      s_dex: "Số dex", s_name: "Tên", s_year: "Năm phát hành",
      reg_all: "Tất cả", reg_upcoming: "Sắp ra mắt", allFigures: "Tất cả mô hình",
      ownedCount: "Đã có: {0}", dark: "Giao diện tối", toLight: "Chuyển sang giao diện sáng", toDark: "Chuyển sang giao diện tối",
      lang: "Ngôn ngữ", toOther: "English",
      sub: "{0} nhân vật · {1} mô hình · {2} đợt phát hành", complete: "Hoàn thành!",
      footer: "Dữ liệu {0} · dex chính thức Bandai Scale World, trang Bandai Candy & Premium Bandai",
      pokemon: "Pokémon", trainers: "HLV", figures: "Mô hình", wishlist: "Muốn mua", ownedPct: "★ Đã có",
      noMatch: "Không có mô hình nào khớp “{0}”", nothing: "Chưa có gì ở đây",
      search: "Tìm kiếm", closeSearch: "Đóng tìm kiếm", searchPh: "Tên, 名前 hoặc số dex", menu: "Menu", back: "Quay lại", close: "Đóng",
      trainer: "Huấn luyện viên", height: "Chiều cao", region: "Vùng", firstRelease: "Phát hành lần đầu",
      owned: "Đã có", wish: "Muốn mua", releases: "Các đợt phát hành ({0})", noReleases: "Không tìm thấy thông tin phát hành.",
      priceNote: "Giá bán lẻ tại Nhật, đã gồm thuế trừ khi ghi “+ thuế”. Giá hàng quầy bánh kẹo tính theo hộp. " +
        "Giá Premium Bandai lấy từ các trang sản phẩm được lưu trữ. ",
      dexPage: "Trang dex chính thức ↗", productPage: "Trang sản phẩm ↗ (chưa có trong dex chính thức)",
      evolution: "Tiến hóa", ships: "Giao {0}", plusTax: "{0} + thuế", rerelease: "Tái bản", upcoming: "Sắp ra mắt",
      officialPage: "Trang chính thức ↗", archived: "Bản lưu trữ ↗",
      settings: "Cài đặt", sortBy: "Sắp xếp theo", display: "Hiển thị", dim: "Làm mờ mô hình chưa có",
      tileSize: "Cỡ ô", ts_s: "Nhỏ", ts_m: "Vừa", ts_l: "Lớn", tint: "Tô màu ô theo hệ", tabAbout: "Thông tin",
      trueScale: "Hiển thị mô hình theo đúng tỉ lệ", collection: "Bộ sưu tập", collCount: "Đã có {0} · Muốn mua {1}",
      reset: "Xóa đã có & muốn mua", resetAsk: "Xóa toàn bộ đánh dấu đã có và muốn mua?", about: "Về dữ liệu", prev: "Trước", next: "Tiếp", keys: "Phím tắt",
      k_search: "Tìm kiếm", k_menu: "Menu", k_lang: "Ngôn ngữ", k_theme: "Giao diện sáng / tối", k_home: "Danh sách vùng",
      k_back: "Quay lại", k_close: "Đóng", k_step: "Trang mô hình trước / sau", k_own: "Đánh dấu đã có / muốn mua (trang mô hình)", k_filter: "Bộ lọc lưới",
      support: "Mời mình ly cà phê", supportText: "Thấy Scaledex hữu ích? Quét mã bằng MoMo hoặc app ngân hàng bất kỳ (VietQR / Napas 247) để ủng hộ mình nhé.",
      kofi: "Ủng hộ qua Ko-fi ↗", kofiText: "Ở nước ngoài? Ko-fi nhận thẻ và PayPal.",
      aboutText: "Tạo ngày {0}. {1} nhân vật, {2} mô hình, {3} đợt phát hành.<br>Nguồn: dex chính thức Pokémon Scale World (bandai.co.jp), " +
        "trang sản phẩm Bandai Candy, trang Premium Bandai qua Internet Archive, tên từ PokeAPI. Ảnh mô hình và sản phẩm © Bandai / Pokémon."
    }
  };
  // Vietnamese names for data.types / data.roles / data.channels / STATUS (no official ones exist: fan terms)
  var VI_TYPES = {
    normal: "Thường", fighting: "Giác đấu", flying: "Bay", poison: "Độc", ground: "Đất", rock: "Đá", bug: "Côn trùng",
    ghost: "Ma", steel: "Thép", fire: "Lửa", water: "Nước", grass: "Cỏ", electric: "Điện", psychic: "Siêu linh",
    ice: "Băng", dragon: "Rồng", dark: "Bóng tối", fairy: "Tiên"
  };
  var VI_ROLES = {
    protagonist: "Nhân vật chính", rival: "Đối thủ", professor: "Giáo sư", gym: "Trưởng Gym", e4: "Tứ Thiên Vương",
    champion: "Nhà vô địch", boss: "Trùm phản diện", clan: "Thủ lĩnh tộc", teammz: "Đội MZ", friend: "Bạn bè",
    merchant: "Thương nhân", detective: "Thám tử"
  };
  var VI_CHANNELS = {
    supermarket: "Siêu thị & đại siêu thị (quầy bánh kẹo)", convenience: "Cửa hàng tiện lợi", hobby: "Cửa hàng mô hình",
    pokecen: "Pokémon Center", pbandai: "Premium Bandai (đặt trước)", pbandai_std: "Premium Bandai (bán lẻ thường xuyên)", other: "Khác"
  };
  var VI_STATUS = { legendary: "Huyền thoại", mythical: "Thần thoại", powerhouse: "Bán huyền thoại" };

  var ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  var ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
  var ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>';
  // filter rail icons; the filter's name is the tooltip / aria-label
  var FILTER_ICONS = {
    all: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>',
    pokemon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h5.5M15 12h5.5"/><circle cx="12" cy="12" r="3"/></svg>',
    trainer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/></svg>',
    owned: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    missing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3.2 3.2"><circle cx="12" cy="12" r="8"/></svg>',
    wish: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/></svg>'
  };
  var ICON_MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad4(n) { return ("000" + n).slice(-4); }
  function fmtDate(d, lang) {
    if (!d) return "";
    var p = String(d).split("-");
    if (lang === "vi") return p.slice().reverse().join("/");  // 15/11/2026, 11/2026
    if (p.length === 3) return (+p[2]) + " " + MONTHS[+p[1] - 1] + " " + p[0];
    if (p.length === 2) return MONTHS[+p[1] - 1] + " " + p[0];
    return p[0];
  }
  function yen(n) { return "¥" + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function norm(s) {
    // lower-case, strip accents, katakana -> hiragana so either script matches
    s = String(s || "").toLowerCase();
    if (s.normalize) s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    s = s.replace(/đ/g, "d");  // Vietnamese: "dat" finds "Đất"
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
    // a figure whose id changed (brand-page "x" id, later listed in the official dex) keeps its
    // owned / wishlist marks: data.idAliases maps old id -> current id. Returns true if anything moved.
    function migrateMarks() {
      var al = (data && data.idAliases) || {}, moved = false;
      [st.owned, st.wish].forEach(function (bag) {
        Object.keys(bag).forEach(function (k) {
          var to = al[k];
          if (!to || to === k) return;
          if (!bag[to]) bag[to] = bag[k];
          delete bag[k];
          moved = true;
        });
      });
      return moved;
    }
    var marksMoved = migrateMarks();
    if (!prefs.sort) prefs.sort = "dex";
    if (prefs.dim == null) prefs.dim = false;
    if (!prefs.theme) prefs.theme = "auto";
    if (TILE_SIZES.indexOf(prefs.tileSize) < 0) prefs.tileSize = "m";
    if (prefs.tint == null) prefs.tint = true;
    if (!I18N[prefs.lang]) prefs.lang = /^vi\b/i.test((global.navigator && global.navigator.language) || "") ? "vi" : "en";

    function t(k, a, b, c, d) {
      var s = I18N[prefs.lang][k], args = [a, b, c, d];
      if (s == null) s = I18N.en[k] != null ? I18N.en[k] : k;
      return s.replace(/\{(\d)\}/g, function (x, i) { return args[i]; });
    }
    function vi() { return prefs.lang === "vi"; }
    function typeName(id) {
      var n = data.types && data.types[id];
      return vi() && VI_TYPES[id] ? VI_TYPES[id] : (n ? n.en : id);
    }
    function statusName(s) { return vi() ? VI_STATUS[s] : STATUS[s][0]; }
    // Vietnamese: real regions (…地方) get "Vùng": "Vùng Kanto"
    function regionName(r) {
      if (I18N.en["reg_" + r.id]) return t("reg_" + r.id);
      return vi() && /地方$/.test(r.nameJa || "") ? "Vùng " + r.nameEn : r.nameEn;
    }
    // home cards: just the name ("Kanto"), no "Vùng"; the card already reads as a region
    function homeRegionName(r) {
      return I18N.en["reg_" + r.id] ? t("reg_" + r.id) : r.nameEn;
    }
    // language + theme switches: top bar (medium / wide only) and the figure page / menu bar
    function togglesHtml() {
      var dk = isDark();  // until the theme switch is used the theme follows the system
      return '<button class="sw-theme sw-lang" data-act="lang-toggle" aria-label="' + esc(t("lang")) + '" title="' + esc(t("toOther")) + ' (L)">' +
        (vi() ? "VI" : "EN") + "</button>" +
        '<button class="sw-theme" data-act="theme-toggle" role="switch" aria-checked="' + dk + '" aria-label="' + esc(t("dark")) + '" title="' +
        esc(dk ? t("toLight") : t("toDark")) + ' (T)">' + (dk ? ICON_MOON : ICON_SUN) + "</button>";
    }

    var ui = { screen: "home", region: "all", filter: "all", query: "", detail: null, fig: null, menu: false, search: false };
    var idx = buildIndex(data);
    var scrollMemo = {};

    root.classList.add("swdex");
    // top bar (sticky, inside the scroller) holds every control: back, title, search, menu, filters
    root.innerHTML = '<div class="sw-scroll"><div class="sw-topbar"></div><div class="sw-wrap"></div></div>';
    var scroller = root.querySelector(".sw-scroll");
    var wrap = root.querySelector(".sw-wrap");
    var bar = root.querySelector(".sw-topbar");
    var sheet = null;
    var mq = global.matchMedia ? global.matchMedia("(prefers-color-scheme: dark)") : null;

    // host's (Obsidian) or system's theme: what "auto" follows
    function systemDark() { return opts.dark === true || (opts.dark !== false && !!(mq && mq.matches)); }
    function isDark() {
      return prefs.theme === "dark" || (prefs.theme === "auto" && systemDark());
    }
    function applyTheme() {
      var dark = isDark();
      root.classList.toggle("sw-dark", !!dark);
      // Obsidian's own theme colours, while the in-app theme follows Obsidian's (opts.hostTheme)
      root.classList.toggle("sw-host", !!opts.hostTheme && prefs.theme === "auto");
      root.classList.toggle("sw-dim", !!prefs.dim);
      root.classList.toggle("sw-tint", !!prefs.tint);
      TILE_SIZES.forEach(function (k) { root.classList.toggle("sw-ts-" + k, prefs.tileSize === k); });
      root.setAttribute("lang", prefs.lang);
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
    // "gym:rock" -> { label: "Gym Leader · Rock" (current language), short: "Gym Leader", ja: "ジムリーダー（いわ）",
    //               search: every language's wording, type: "rock" }
    function roleInfo(r) {
      var k = r.split(":"), d = (data.roles && data.roles[k[0]]) || { en: k[0], ja: "" };
      var ty = k[1] && data.types && data.types[k[1]];
      var short = vi() && VI_ROLES[k[0]] ? VI_ROLES[k[0]] : d.en;
      return { label: short + (ty ? " · " + typeName(k[1]) : ""), short: short, ja: d.ja + (ty ? "（" + ty.ja + "）" : ""),
               search: [d.en, VI_ROLES[k[0]] || "", ty ? ty.en : "", k[1] ? VI_TYPES[k[1]] || "" : ""].join(" "), type: k[1] || "", id: k[0] };
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
      return matchesQuery(t);
    }
    // the search text alone (the numbers card counts these, whatever the filter)
    function matchesQuery(t) {
      if (ui.query) {
        var q = norm(ui.query).trim();
        if (!q) return true;
        var hay = [t.c.nameEn, t.c.nameJa, romaji(t.c.nameJa), t.c.dex ? pad4(t.c.dex) : "", t.c.dex || ""];
        // the whole evolution line: "charmander" also finds Charmeleon and Charizard
        (t.c.chain && idx.chain[t.c.chain] || []).forEach(function (o) { hay.push(o.nameEn, o.nameJa, romaji(o.nameJa)); });
        (t.c.roles || []).forEach(function (r) { var i = roleInfo(r); hay.push(i.search, i.ja); });
        // types (all forms) and Legendary / Mythical / Powerhouse, in either language: "fire", "lửa", "legendary" ...
        var ts = (t.c.types || []).slice();
        t.figs.forEach(function (x) { (x.types || []).forEach(function (y) { ts.push(y); }); });
        ts.forEach(function (y) { var n = data.types && data.types[y]; hay.push(n ? n.en : y, n ? n.ja : "", VI_TYPES[y] || ""); });
        if (t.c.status && STATUS[t.c.status]) hay.push(STATUS[t.c.status][0], VI_STATUS[t.c.status]);
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
      renderBar();
    }

    function regionStats(region) {
      var figs = figsIn(region);
      var owned = figs.filter(function (f) { return st.owned[f.id]; }).length;
      return { total: figs.length, owned: owned };
    }

    // card figures, left to right. Regions: the three first-stage starters, the protagonist
    // and the region's boss / champion / best-known character. "All": a Legendary, a Mythical,
    // a Powerhouse and two Champions. Upcoming: only ids that are still upcoming. Missing ids
    // are skipped; under three left, the card picks its own.
    var REGION_PICKS = {
      all: ["150", "151", "149", "shirona", "dande"],
      kanto: ["001", "004", "007", "red", "sakaki"],
      johto: ["152", "155", "158", "hibiki", "silver"],
      hoenn: ["252", "255", "258", "yuuki_rs", "daigo"],
      sinnoh: ["387", "390", "393", "kouki_dp", "x4570117928949000_11"],
      hisui: ["722_hisui", "155_hisui", "501_hisui", "teru", "volo"],
      kalos: ["x4570117923258000_6", "x4570117923258000_4", "x4570117923258000_1", "calem", "x1000248354_1"],
      galar: ["810", "813", "816", "masaru", "hop"],
      paldea: ["906", "909", "912", "haruto", "nemo"],
      upcoming: ["x1000256579_1", "x1000258097_2", "x4570117932496000_11"]
    };
    function picksFor(region) {
      var pick = (REGION_PICKS[region] || []).map(function (id) { return idx.fig[id]; }).filter(function (f) {
        return f && (f.image || f.imageUrl) && (region !== "upcoming" || idx.upcoming[f.id]);
      });
      return pick.length >= 3 ? pick : null;
    }
    // one size rule for every card: (cm / 9)^0.45 of the row height, capped at 1, so a 2 cm
    // starter stands at about half a 9 cm trainer and big Pokémon don't tower over the row
    function figUnit(f) { return Math.min(1, Math.pow((f.heightCm || f.heightEst || 5) / 9, 0.45)); }
    function rowWidth(pick) {  // row width in row heights
      return pick.reduce(function (w, f) { return w + figUnit(f) * (f.trimRatio || 0.6); }, 0);
    }
    var cardRowWidth = 1;  // widest region row: every card uses its scale (a wider All / Upcoming row shrinks to fit)
    function pickedArt(region) {
      var pick = picksFor(region);
      if (!pick) return null;
      var sum = Math.max(cardRowWidth, rowWidth(pick));
      return '<div class="sw-region-figs is-row" style="--sum:' + sum.toFixed(3) + '">' + pick.map(function (f) {
        return '<span class="sw-region-fig" style="--u:' + figUnit(f).toFixed(3) + ";--r:" + (f.trimRatio || 0.6) + '">' +
          imgTag(f.imageTrim || f.image, f.imageUrl, "", "", true) + "</span>";
      }).join("") + "</div>";
    }

    function regionArt(region) {
      var picked = pickedArt(region);
      if (picked) return picked;
      var figs = figsIn(region).filter(function (f) { return f.image || f.imageUrl; });
      if (region !== "upcoming") {  // card art: released figures first
        var out = figs.filter(function (f) { return !idx.upcoming[f.id]; });
        if (out.length) figs = out.concat(figs.filter(function (f) { return idx.upcoming[f.id]; }));
      }
      var poke = figs.filter(function (f) { return f.kind === "pokemon"; })
        .sort(function (a, b) { return (!!idx.upcoming[a.id] - !!idx.upcoming[b.id]) || (idx.chr[a.characterId].dex - idx.chr[b.characterId].dex); });
      var trainer = figs.filter(function (f) { return f.kind === "trainer"; });
      var pick = [];
      if (trainer[0]) pick.push(trainer[0]);
      for (var i = 0; i < poke.length && pick.length < 3; i++) {
        if (!pick.some(function (p) { return p.characterId === poke[i].characterId; })) pick.push(poke[i]);
      }
      // three even slots, trainer on the right; photos blend into the pattern (CSS multiply)
      return '<div class="sw-region-figs">' + pick.slice(0, 3).map(function (f) {
        return '<span class="sw-region-fig">' + imgTag(f.imageTrim || f.image, f.imageUrl, "", "", true) + "</span>";
      }).join("") + "</div>";
    }

    function renderHome() {
      var h = '<div class="sw-sub">' + esc(t("sub", data.characters.length, data.figures.length, data.products.length)) + '</div><div class="sw-regions">';
      var regs = [{ id: "all", nameEn: "All", nameJa: "すべてのフィギュア" }].concat(data.regions);
      if (figsIn("upcoming").length) {
        var at = regs.map(function (r) { return r.id; }).indexOf("special");
        regs.splice(at < 0 ? regs.length : at, 0, UPCOMING);
      }
      cardRowWidth = Math.max.apply(null, data.regions.map(function (r) { var p = picksFor(r.id); return p ? rowWidth(p) : 1; }));
      regs.forEach(function (r) {
        var s = regionStats(r.id);
        var done = s.total > 0 && s.owned >= s.total;
        var pct = s.total ? Math.round(100 * s.owned / s.total) : 0;
        h += '<button class="sw-region' + (done ? " is-complete" : "") + '" data-act="region" data-id="' + r.id +
          '" style="--rc:' + (REGION_COLORS[r.id] || "#1b86b6") + '">' +
          (LANDSCAPES[r.id] ? '<div class="sw-region-art is-photo" style="background-image:url(' + LANDSCAPES[r.id] + ')"></div>'
            : '<div class="sw-region-art">' + regionArt(r.id) + "</div>") +
          '<div class="sw-region-text"><div class="sw-region-name">' +
          esc(homeRegionName(r)) + "</div>" +
          '<div class="sw-region-ja">' + esc(r.nameJa) + "</div>" +
          (done ? '<div class="sw-done">' + esc(t("complete")) + "</div>" : '<div class="sw-bar"><i style="width:' + pct + '%"></i></div>') +
          '<div class="sw-region-progress">' + s.owned + " / " + s.total + "</div></div></button>";
      });
      h += '</div><div class="sw-note" style="text-align:center;margin:18px 0">' + esc(t("footer", data.generated)) + "</div>";
      wrap.innerHTML = h;
      fitRegionNames();
    }

    // shrink a region name that is wider than the room left of the card art (its CSS max-width):
    // narrow phones, "UPCOMING", Vietnamese "VÙNG ..." names. Reset all, then measure all, then write.
    function fitRegionNames() {
      var els = wrap.querySelectorAll(".sw-region-name"), i, el, fit = [];
      for (i = 0; i < els.length; i++) els[i].style.fontSize = "";
      for (i = 0; i < els.length; i++) {
        el = els[i];
        if (el.clientWidth && el.scrollWidth > el.clientWidth + 1) {
          fit.push([el, parseFloat(global.getComputedStyle(el).fontSize) * el.clientWidth / el.scrollWidth]);
        }
      }
      for (i = 0; i < fit.length; i++) fit[i][0].style.fontSize = Math.max(14, Math.floor(fit[i][1] * 10) / 10) + "px";
    }
    function onResize() { if (wrap.querySelector(".sw-region-name")) fitRegionNames(); }
    var resizeObs = global.ResizeObserver ? new global.ResizeObserver(onResize) : null;
    if (resizeObs) resizeObs.observe(root); else global.addEventListener("resize", onResize);
    // web font arriving after the first render changes the widths
    if (global.document && global.document.fonts && global.document.fonts.ready) global.document.fonts.ready.then(onResize);

    function renderGrid() {
      var region = gridRegion();
      var tiles = tilesFor(region);
      // the numbers card: the region, or while searching just what the search finds (filters don't change it)
      var counted = ui.query ? tiles.filter(matchesQuery) : tiles;
      var figs = [];
      counted.forEach(function (x) { figs = figs.concat(x.figs); });
      var s = { total: figs.length, owned: figs.filter(function (f) { return st.owned[f.id]; }).length };
      var nP = counted.filter(function (t) { return t.c.kind === "pokemon"; }).length;
      var nW = figs.filter(function (f) { return st.wish[f.id]; }).length;
      // the region's name is in the top bar; this card is the numbers only
      var h = '<div class="sw-statcard"><div class="sw-stats">' +
        '<div class="is-own"><b>' + s.owned + " / " + s.total + "</b><span>" + esc(t("figures")) + "</span></div>" +
        "<div><b>" + nP + "</b><span>" + esc(t("pokemon")) + "</span></div>" +
        "<div><b>" + (counted.length - nP) + "</b><span>" + esc(t("trainers")) + "</span></div>" +
        "<div><b>" + nW + "</b><span>" + esc(t("wishlist")) + "</span></div>" +
        "<div><b>" + (s.total ? Math.round(100 * s.owned / s.total) : 0) + "%</b><span>" + esc(t("ownedPct")) + "</span></div>" +
        "</div></div>";

      var shown = shownTiles(tiles);
      if (!shown.length) {
        h += '<div class="sw-empty">' + esc(ui.query ? t("noMatch", ui.query) : t("nothing")) + "</div>";
      } else if (prefs.sort === "dex" && ui.filter === "all") {
        var p = shown.filter(function (x) { return x.c.kind === "pokemon"; });
        var tr = shown.filter(function (x) { return x.c.kind !== "pokemon"; });  // same split as shownTiles()
        if (p.length) h += '<div class="sw-section">' + esc(t("pokemon")) + '</div><div class="sw-grid">' + p.map(tileHtml).join("") + "</div>";
        if (tr.length) h += '<div class="sw-section">' + esc(t("trainers")) + '</div><div class="sw-grid">' + tr.map(tileHtml).join("") + "</div>";
      } else {
        h += '<div class="sw-grid">' + shown.map(tileHtml).join("") + "</div>";
      }
      wrap.innerHTML = h;
      fitRegionNames();
    }

    // the grid's tiles in on-screen order (dex sort, no filter: Pokémon section, then Trainers)
    function shownTiles(tiles) {
      var shown = sortTiles((tiles || tilesFor(gridRegion())).filter(matches));
      if (prefs.sort !== "dex" || ui.filter !== "all") return shown;
      return shown.filter(function (x) { return x.c.kind === "pokemon"; }).concat(shown.filter(function (x) { return x.c.kind !== "pokemon"; }));
    }

    // first type's colour (tile / picture tint, CSS --tt); trainers have none
    function typeColor(f, c) {
      var ty = (f.types && f.types[0]) || (c.types && c.types[0]);
      return ty && TYPE_COLORS[ty] ? TYPE_COLORS[ty] : "";
    }
    function tileHtml(t) {
      var f = t.figs[0];
      var n = t.figs.length;
      var badgeL = t.owned >= n ? '<span class="sw-dot own">✓</span>' :
        t.owned ? '<span class="sw-dot part">' + t.owned + "/" + n + "</span>" : (n > 1 ? '<span class="sw-dot multi">×' + n + "</span>" : "<span></span>");
      var badgeR = t.wish ? '<span class="sw-dot wish">♥</span>' : "";
      var label = t.c.kind === "pokemon" ? '<div class="sw-tile-no">' + pad4(t.c.dex) + "</div>" :
        (t.c.roles && t.c.roles.length ? '<div class="sw-tile-role">' + esc(roleInfo(t.c.roles[0]).short) + "</div>" : "");
      var tc = typeColor(f, t.c);
      return '<button class="sw-tile' + (t.owned ? "" : " is-missing") + '" data-act="open" data-id="' + esc(t.c.id) +
        '" data-fig="' + esc(f.id) + '"' + (tc ? ' style="--tt:' + tc + '"' : "") + ">" +
        '<div class="sw-tile-badges">' + badgeL + badgeR + "</div>" +
        '<div class="sw-tile-img">' + figImg(f, "", t.c.nameEn) + "</div>" +
        label + '<div class="sw-tile-name">' + esc(t.c.nameEn) + "</div></button>";
    }

    // the grid's region: the home screen's search lists the whole dex
    function gridRegion() { return ui.screen === "home" ? "all" : ui.region; }
    function iconBtn(act, label, key, icon) {
      return '<button class="sw-ibtn" data-act="' + act + '" aria-label="' + esc(label) + '" title="' + esc(label) + (key ? " (" + key + ")" : "") + '">' + icon + "</button>";
    }

    // top bar. Row 1: back (grid) · logo or region name, or the search field · language + theme
    // (hidden on narrow screens: they are in the menu) · search · menu. Row 2 (grid): filter chips,
    // scrolling sideways when they don't fit.
    function renderBar() {
      var grid = ui.screen !== "home" || !!ui.query;
      var oldChips = bar.querySelector(".sw-chips"), chipX = oldChips ? oldChips.scrollLeft : 0;
      root.classList.toggle("is-grid", grid);
      var h = '<div class="sw-bar-row">';
      if (ui.screen !== "home") h += iconBtn("home", t("back"), "H", ICON_BACK);
      if (ui.search) {
        // type="text", not "search": a search field gets the browser's own clear button next to ours
        h += '<input class="sw-search" type="text" inputmode="search" enterkeyhint="search" spellcheck="false" aria-label="' + esc(t("search")) + '" placeholder="' + esc(t("searchPh")) + '" value="' + esc(ui.query) + '" autocomplete="off">' +
          iconBtn("search-close", t("closeSearch"), "Esc", ICON_X);
      } else {
        if (ui.screen === "home") {
          h += '<h1 class="sw-brand">' + LOGO + "Scaledex</h1>" +
            '<span class="sw-count">' + esc(t("ownedCount", regionStats("all").owned)) + "</span>";
        } else {
          var r = gridRegion();
          h += '<div class="sw-bar-title">' + esc(r === "all" ? t("allFigures") : regionName(idx.reg[r])) + "</div>";
        }
        h += '<span class="sw-bar-tools">' + togglesHtml() + "</span>" + iconBtn("search", t("search"), "/", ICON_SEARCH);
      }
      h += iconBtn("menu", t("menu"), "M", ICON_MENU) + "</div>";
      if (grid) {
        h += '<div class="sw-chips">' + FILTERS.map(function (f, i) {
          return '<button class="sw-chip' + (ui.filter === f ? " on" : "") + '" data-act="filter" data-id="' + f +
            '" title="' + esc(t("f_" + f)) + " (" + (i + 1) + ')"><span class="sw-chip-ico">' + FILTER_ICONS[f] + '</span><span class="sw-chip-label">' + esc(t("f_" + f)) + "</span></button>";
        }).join("") + "</div>";
      }
      bar.innerHTML = h;
      var chips = bar.querySelector(".sw-chips");
      if (chips) {  // keep the row where it was, but bring the active chip into view
        chips.scrollLeft = chipX;
        var on = chips.querySelector(".on");
        if (on && (on.offsetLeft < chips.scrollLeft || on.offsetLeft + on.offsetWidth > chips.scrollLeft + chips.clientWidth)) {
          chips.scrollLeft = on.offsetLeft - 16;
        }
      }
      var input = bar.querySelector(".sw-search");
      if (input) {
        input.addEventListener("input", function () {
          var hadChips = !!bar.querySelector(".sw-chips");
          ui.query = input.value;
          if (ui.screen === "home" && !ui.query) renderHome(); else renderGrid();
          var needChips = ui.screen !== "home" || !!ui.query;
          if (hadChips !== needChips) { ui.focusSearch = true; renderBar(); }
        });
        input.addEventListener("keydown", function (e) {
          if (e.key === "Escape") { e.stopPropagation(); ui.search = false; ui.query = ""; render(); }
        });
        if (ui.focusSearch) {
          input.focus(); ui.focusSearch = false;
          var n = input.value.length;
          try { input.setSelectionRange(n, n); } catch (e) { /* ignore */ }
        }
      }
    }

    // ------------------------------------------------------------ detail sheet
    function openDetail(cid, figId, push) {
      // opened from the grid: remember its order for the prev / next arrows (kept through detours
      // like the evolution row, so the arrows always walk the grid the page was opened from)
      if (!ui.detail) { ui.list = shownTiles().map(function (x) { return x.c.id; }); ui.listAt = -1; }
      ui.depth = ui.detail ? (ui.depth || 1) + 1 : 1;  // pages opened on top of each other
      ui.detail = cid;
      var c = idx.chr[cid];
      var figs = c.figures.map(function (id) { return idx.fig[id]; }).filter(Boolean);
      ui.fig = figId && idx.fig[figId] ? figId : figs[0].id;
      if (push !== false) pushHistory();
      renderSheet();
    }

    // prev / next character in ui.list; replaces the current page, so Back still returns to the grid
    function stepDetail(d) {
      var list = ui.list || [], i = ui.listAt + d;
      if (ui.listAt < 0 || i < 0 || i >= list.length || !idx.chr[list[i]]) return false;
      ui.detail = list[i];
      ui.fig = idx.chr[list[i]].figures.filter(function (id) { return idx.fig[id]; })[0];
      if (opts.history && global.history) {
        try { global.history.replaceState({ sw: { screen: ui.screen, region: ui.region, detail: ui.detail, fig: ui.fig, depth: ui.depth } }, ""); } catch (e) { /* ignore */ }
      }
      renderSheet();
      sheet.scrollTop = 0;
      return true;
    }

    function renderSheet() {
      if (!ui.detail) { if (sheet) { sheet.remove(); sheet = null; } return; }
      var at = (ui.list || []).indexOf(ui.detail);
      if (at >= 0) ui.listAt = at;
      var c = idx.chr[ui.detail];
      var figs = c.figures.map(function (id) { return idx.fig[id]; }).filter(Boolean);
      var f = idx.fig[ui.fig] || figs[0];
      if (!sheet) { sheet = document.createElement("div"); sheet.className = "sw-sheet"; root.appendChild(sheet); }
      var prevScroll = sheet.scrollTop;

      // Always shown: picture, name, types, owned / wishlist. Then three panes: About (figure
      // versions, facts), Evolution, Releases. Wide: two columns, every pane shown (About left,
      // the others right). One column: tabs, one pane at a time (ui.tab, kept while stepping).
      var evo = evolutionHtml(c, f);
      var tabs = [["about", t("tabAbout")]];
      if (evo) tabs.push(["evo", t("evolution")]);
      var prods = f.productIds.map(function (id) { return idx.prod[id]; }).filter(Boolean);
      tabs.push(["rel", t("releases", prods.length)]);
      if (!tabs.some(function (x) { return x[0] === ui.tab; })) ui.tab = "about";
      var tc = prefs.tint ? typeColor(f, c) : "";
      var h = sheetBar('<div class="sw-hero-no">' + (c.dex ? "#" + pad4(c.dex) : esc(t("trainer"))) + "</div>") +
        '<div class="sw-detail" data-tab="' + ui.tab + '"><div class="sw-detail-a"><div class="sw-hero"' + (tc ? ' style="--tt:' + tc + '"' : "") + ">" +
        figImg(f, "", c.nameEn) +
        (ui.listAt >= 0 && ui.list.length > 1 ?
          '<button class="sw-step prev" data-act="step" data-id="-1" aria-label="' + esc(t("prev")) + '" title="' + esc(t("prev")) + ' (←)"' + (ui.listAt > 0 ? "" : " disabled") + ">" + ICON_BACK + "</button>" +
          '<button class="sw-step next" data-act="step" data-id="1" aria-label="' + esc(t("next")) + '" title="' + esc(t("next")) + ' (→)"' + (ui.listAt < ui.list.length - 1 ? "" : " disabled") + ">" + ICON_NEXT + "</button>" : "") +
        "</div>" +
        '<h2 class="sw-name">' + esc(c.nameEn) + '</h2><div class="sw-name-ja">' + esc(c.nameJa) +
        (romaji(c.nameJa) ? ' <span class="sw-romaji">· ' + esc(romaji(c.nameJa)) + "</span>" : "") + "</div>";
      // chips: tap to list everything of that type / role / status
      var types = f.types || c.types || [];
      var chips = types.map(function (y) {
        var n = data.types && data.types[y];
        return '<button class="sw-type" data-act="find" data-id="' + esc(typeName(y)) + '" style="--tc:' + (TYPE_COLORS[y] || "#888") +
          '" title="' + esc(n ? n.ja : "") + '">' + esc(typeName(y)) + "</button>";
      });
      if (c.status && STATUS[c.status]) chips.push('<button class="sw-type sw-status st-' + c.status + '" data-act="find" data-id="' +
        esc(statusName(c.status)) + '" title="' + esc(STATUS[c.status][1]) + '">★ ' + esc(statusName(c.status)) + "</button>");
      (c.roles || []).forEach(function (r) {
        var i = roleInfo(r);
        chips.push('<button class="sw-type sw-role role-' + esc(i.id) + '" data-act="find" data-id="' + esc(i.short) + '"' +
          (i.type ? ' style="--tc:' + (TYPE_COLORS[i.type] || "#888") + '"' : "") + ' title="' + esc(i.ja) + '">' + esc(i.label) + "</button>");
      });
      if (chips.length) h += '<div class="sw-types">' + chips.join("") + "</div>";
      h += '<div class="sw-toggles">' +
        '<button class="sw-toggle own' + (st.owned[f.id] ? " on" : "") + '" data-act="own" data-id="' + esc(f.id) + '">' + (st.owned[f.id] ? "✓ " : "") + esc(t("owned")) + "</button>" +
        '<button class="sw-toggle wish' + (st.wish[f.id] ? " on" : "") + '" data-act="wish" data-id="' + esc(f.id) + '">' + (st.wish[f.id] ? "♥ " : "") + esc(t("wish")) + "</button>" +
        "</div></div>";  // .sw-toggles, .sw-detail-a
      // tabs and About are children of .sw-detail itself (not .sw-detail-a), so the sticky tab row
      // stays stuck down the whole page; wide, the grid puts About under .sw-detail-a
      h += '<div class="sw-tabs" role="tablist">' + tabs.map(function (x) {
        return '<button class="sw-tab' + (x[0] === ui.tab ? " on" : "") + '" role="tab" data-act="tab" data-id="' + x[0] + '">' + esc(x[1]) + "</button>";
      }).join("") + "</div>";

      h += '<div class="sw-pane p-about">';
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
        "<div><b>" + (f.heightCm ? f.heightCm + " cm" : "—") + "</b><span>" + esc(t("height")) + "</span></div>" +
        "<div><b>" + esc(reg ? reg.nameEn : "—") + "</b><span>" + esc(t("region")) + "</span></div>" +
        "<div><b>" + (f.firstYear || "—") + "</b><span>" + esc(t("firstRelease")) + "</span></div></div></div>" +
        '<div class="sw-note sw-source"><a href="' + esc(f.source) + '" target="_blank" rel="noopener">' +
        esc(/\/lineup\//.test(f.source || "") ? t("dexPage") : t("productPage")) + "</a></div>" +
        "</div>";  // .p-about

      h += '<div class="sw-detail-b">' + (evo ? '<div class="sw-pane p-evo">' + evo + "</div>" : "") + '<div class="sw-pane p-rel">';
      h += '<div class="sw-h">' + esc(t("releases", prods.length)) + "</div>";
      var firstDate = prods.length ? (prods[0].date || "") : "";
      if (!prods.length) h += '<div class="sw-card sw-note">' + esc(t("noReleases")) + "</div>";
      else h += '<div class="sw-card">' + prods.map(function (p) {
        // later than the first release (by month) or flagged as re-order/re-sale
        var later = p.date && firstDate && p.date.slice(0, 7) > firstDate.slice(0, 7);
        return releaseHtml(p, p.rerelease || later);
      }).join("") + "</div>";

      h += '<div class="sw-note">' + esc(t("priceNote")) + "</div></div></div></div>";  // .p-rel, .sw-detail-b, .sw-detail
      sheet.innerHTML = h;
      sheet.scrollTop = prevScroll;
    }

    // one-column figure page: show another pane without redrawing; if the tab row is stuck at
    // the top, start the new pane just under it
    function setTab(id) {
      ui.tab = id;
      if (!sheet) return;
      var d = sheet.querySelector(".sw-detail"), bar = sheet.querySelector(".sw-tabs");
      if (!d) return;
      d.setAttribute("data-tab", id);
      var b = sheet.querySelectorAll(".sw-tab"), i;
      for (i = 0; i < b.length; i++) b[i].classList.toggle("on", b[i].getAttribute("data-id") === id);
      var pane = sheet.querySelector(".p-" + id);
      if (pane && bar) {
        var gap = pane.getBoundingClientRect().top - bar.getBoundingClientRect().bottom;
        if (gap < 0) sheet.scrollTop += gap - 8;
      }
    }

    // sticky bar at the top of a figure page / the menu: left part · language, theme · close
    function sheetBar(left, cls) {
      return '<div class="sw-sheet-bar' + (cls ? " " + cls : "") + '"><div class="sw-bar-row">' + left + '<span class="sw-grow"></span>' + togglesHtml() +
        iconBtn("close", t("close"), "Esc", ICON_X) + "</div></div>";
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
      return '<div class="sw-h">' + esc(t("evolution")) + '</div><div class="sw-card sw-evos">' + h + "</div>";
    }

    function releaseHtml(p, isRe) {
      var tags = [];
      if (p.date) {
        var ships = /発送|お届け/.test(p.dateText || "");
        var day = fmtDate(p.date, prefs.lang);
        tags.push('<span class="sw-tag">' + esc(ships ? t("ships", day) : day) + "</span>");
      }
      (p.channels || []).forEach(function (k) {
        var ch = data.channels[k];
        var name = vi() && VI_CHANNELS[k] ? VI_CHANNELS[k] : (ch ? ch.en : k);
        tags.push('<span class="sw-tag ch-' + esc(k) + '" title="' + esc(ch ? ch.ja : "") + '">' + esc(name) + "</span>");
      });
      if (p.priceJPY) tags.push('<span class="sw-tag price">' + yen(p.priceJPY) + "</span>");
      else if (p.priceExTax) tags.push('<span class="sw-tag price">' + esc(t("plusTax", yen(p.priceExTax))) + "</span>");
      if (isRe) tags.push('<span class="sw-tag re">' + esc(t("rerelease")) + "</span>");
      if (p.upcoming) tags.push('<span class="sw-tag soon">' + esc(t("upcoming")) + "</span>");
      var links = p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + (p.store === "pbandai" ? "Premium Bandai ↗" : esc(t("officialPage"))) + "</a>" : "";
      if (p.priceSource && p.priceSource.indexOf("wayback:") === 0) {
        links += '<a href="https://web.archive.org/web/' + esc(p.priceSource.slice(8)) + "/" + esc(p.url) + '" target="_blank" rel="noopener">' + esc(t("archived")) + "</a>";
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
      var h = sheetBar('<h1 class="sw-sheet-title">' + esc(t("settings")) + "</h1>", "is-menu") + '<div class="sw-body">' +
        '<div class="sw-h">' + esc(t("sortBy")) + '</div><div class="sw-sort">' + SORTS.map(function (s) {
          return '<button class="' + (prefs.sort === s ? "on" : "") + '" data-act="sort" data-id="' + s + '">' + esc(t("s_" + s)) + "</button>";
        }).join("") + "</div>" +
        '<div class="sw-h">' + esc(t("tileSize")) + '</div><div class="sw-sort">' + TILE_SIZES.map(function (k) {
          return '<button class="' + (prefs.tileSize === k ? "on" : "") + '" data-act="tilesize" data-id="' + k + '">' + esc(t("ts_" + k)) + "</button>";
        }).join("") + "</div>" +
        '<div class="sw-h">' + esc(t("display")) + '</div><div class="sw-menu">' +
        "<label>" + esc(t("tint")) + ' <input type="checkbox" data-act="tint"' + (prefs.tint ? " checked" : "") + "></label>" +
        "<label>" + esc(t("dim")) + ' <input type="checkbox" data-act="dim"' + (prefs.dim ? " checked" : "") + "></label>" +
        "<label>" + esc(t("trueScale")) + ' <input type="checkbox" data-act="truescale"' + (prefs.trueScale ? " checked" : "") + "></label></div>" +
        '<div class="sw-h">' + esc(t("collection")) + '</div><div class="sw-menu">' +
        '<div class="sw-note" style="margin:0 4px 4px">' + esc(t("collCount", nOwn, nWish)) + "</div>" +
        // host entries: { label, labelVi? }
        (opts.menu || []).map(function (m, i) {
          return '<button data-act="xmenu" data-id="' + i + '">' + esc(vi() && m.labelVi ? m.labelVi : m.label) + " <span>›</span></button>";
        }).join("") +
        '<button data-act="reset">' + esc(t("reset")) + " <span>›</span></button></div>" +
        '<div class="sw-keys"><div class="sw-h">' + esc(t("keys")) + '</div><div class="sw-card sw-keylist">' +
          [["/", "k_search"], ["M", "k_menu"], ["L", "k_lang"], ["T", "k_theme"], ["H", "k_home"], ["← →", "k_step"],
           ["O · W", "k_own"], ["1–6", "k_filter"], ["Backspace", "k_back"], ["Esc", "k_close"]].map(function (k) {
            return "<div><kbd>" + esc(k[0]) + "</kbd><span>" + esc(t(k[1])) + "</span></div>";
          }).join("") + "</div></div>" +
        (DONATE_QR || KOFI_URL ? '<div class="sw-h">' + esc(t("support")) + '</div><div class="sw-card sw-donate">' +
          (DONATE_QR ? '<img src="' + DONATE_QR + '" alt="MoMo / VietQR">' +
            '<div class="sw-note">' + esc(t("supportText")) + "</div>" : "") +
          (KOFI_URL ? '<a class="sw-kofi" href="' + esc(KOFI_URL) + '" target="_blank" rel="noopener">' + esc(t("kofi")) + "</a>" +
            '<div class="sw-note">' + esc(t("kofiText")) + "</div>" : "") +
          "</div>" : "") +
        '<div class="sw-h">' + esc(t("about")) + '</div><div class="sw-card sw-note" style="margin-top:6px">' +
        t("aboutText", esc(data.generated), data.characters.length, data.figures.length, data.products.length) + "</div></div>";
      sheet.innerHTML = h;
      sheet.scrollTop = 0;
    }

    // ------------------------------------------------------------ history (PWA)
    function pushHistory() {
      if (!opts.history || !global.history) return;
      try { global.history.pushState({ sw: { screen: ui.screen, region: ui.region, detail: ui.detail, fig: ui.fig, depth: ui.detail ? ui.depth : 0 } }, ""); } catch (e) { /* ignore */ }
    }
    function onPop(ev) {
      var s = ev.state && ev.state.sw;
      if (!s) { s = { screen: "home", region: "all", detail: null }; }
      ui.menu = false;
      var screenChanged = s.screen !== ui.screen || s.region !== ui.region;
      ui.screen = s.screen; ui.region = s.region;
      ui.detail = s.detail || null; ui.fig = s.fig || null; ui.depth = s.depth || 0;
      if (ui.afterClose && !ui.detail) { var then = ui.afterClose; ui.afterClose = null; renderSheet(); then(); return; }
      if (screenChanged) { render(); scroller.scrollTop = scrollMemo[ui.screen + ui.region] || 0; }
      renderSheet();
    }
    if (opts.history && global.addEventListener) {
      global.addEventListener("popstate", onPop);
      try { global.history.replaceState({ sw: { screen: "home", region: "all", detail: null } }, ""); } catch (e) { /* ignore */ }
    }

    // close every page opened on top of each other, then run then()
    function closeSheet(then) {
      if (ui.menu) { ui.menu = false; if (sheet) { sheet.remove(); sheet = null; } if (then) then(); return; }
      if (opts.history && ui.detail) { ui.afterClose = then || null; global.history.go(-(ui.depth || 1)); return; }
      ui.detail = null; ui.depth = 0; renderSheet();
      if (then) then();
    }
    // tap a type / role / status chip: search the whole dex for it
    function findAll(text) {
      closeSheet(function () {
        ui.screen = "grid"; ui.region = "all"; ui.filter = "all"; ui.query = text; ui.search = true;
        pushHistory(); render(); scroller.scrollTop = 0;
      });
    }

    // back button: region list
    function goHome() {
      if (opts.history && ui.screen !== "home") { global.history.back(); return; }
      ui.screen = "home"; ui.query = ""; ui.search = false; render(); scroller.scrollTop = scrollMemo.homeall || 0;
    }

    // ------------------------------------------------------------ events
    function onClick(e) {
      var el = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!el || !root.contains(el)) return;
      var act = el.getAttribute("data-act"), id = el.getAttribute("data-id");
      if (act === "dim" || act === "truescale" || act === "tint") return; // handled by change
      run(act, id, el);
    }
    // a button's action; also used by the keyboard shortcuts (shortcutKey)
    function run(act, id, el) {
      switch (act) {
        case "region":
          scrollMemo[ui.screen + ui.region] = scroller.scrollTop;
          ui.screen = "grid"; ui.region = id; ui.filter = "all";
          pushHistory(); render(); scroller.scrollTop = 0; break;
        case "home": goHome(); break;
        case "filter": ui.filter = id; renderGrid(); renderBar(); scroller.scrollTop = 0; break;
        case "open": scrollMemo[ui.screen + ui.region] = scroller.scrollTop; openDetail(id, el && el.getAttribute("data-fig")); break;
        case "fig": ui.fig = id; renderSheet(); break;
        case "close": closeSheet(); break;
        case "step": stepDetail(+id); break;
        case "find": findAll(id); break;
        case "own": case "wish":
          var bag = act === "own" ? st.owned : st.wish;
          if (bag[id]) delete bag[id]; else bag[id] = new Date().toISOString().slice(0, 10);
          if (act === "own" && st.owned[id] && st.wish[id]) delete st.wish[id];
          save(); renderSheet(); var keep = scroller.scrollTop; render(); scroller.scrollTop = keep; break;
        case "search": ui.search = true; ui.focusSearch = true; renderBar(); break;
        case "search-close": ui.search = false; ui.query = ""; render(); break;
        case "menu": openMenu(); break;
        case "sort": prefs.sort = id; save(); openMenu(); render(); break;
        case "tilesize": prefs.tileSize = id; save(); var ms0 = sheet.scrollTop; openMenu(); sheet.scrollTop = ms0; applyTheme(); break;
        case "tab": setTab(id); break;
        case "theme-toggle": case "lang-toggle":
          // switching to the system's / Obsidian's own theme goes back to "auto" (follow it from then on)
          if (act === "theme-toggle") prefs.theme = !isDark() === systemDark() ? "auto" : (isDark() ? "light" : "dark");
          else prefs.lang = vi() ? "en" : "vi";
          save(); var top = scroller.scrollTop; render(); scroller.scrollTop = top;
          if (ui.menu) { var ms = sheet.scrollTop; openMenu(); sheet.scrollTop = ms; } else renderSheet();  // redraw the open sheet in place
          break;
        case "xmenu": opts.menu[+id].run(api); break;
        case "reset":
          if (global.confirm && !global.confirm(t("resetAsk"))) break;
          st.owned = {}; st.wish = {}; save(); openMenu(); render(); break;
      }
    }
    function onChange(e) {
      var act = e.target.getAttribute && e.target.getAttribute("data-act");
      if (act === "dim") { prefs.dim = e.target.checked; save(); applyTheme(); }
      if (act === "tint") { prefs.tint = e.target.checked; save(); applyTheme(); }
      if (act === "truescale") { prefs.trueScale = e.target.checked; save(); render(); }
    }
    function onError(e) {
      var t = e.target;
      if (t && t.tagName === "IMG" && t.getAttribute("data-fb") && t.src !== t.getAttribute("data-fb")) {
        t.src = t.getAttribute("data-fb"); t.removeAttribute("data-fb");
      }
    }
    // Esc = close button (sheet, menu, search); Backspace = back button (previous page in a
    // sheet, else back to the region list). Returns true when it handled the key.
    function navKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      var t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "Escape") {
        if (ui.detail || ui.menu) { closeSheet(); return true; }
        if (ui.search) { ui.search = false; ui.query = ""; render(); return true; }
        return false;
      }
      if (!typing && shortcutKey(e)) return true;
      // ← / → : previous / next character on an open page
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && ui.detail && !ui.menu && !typing) {
        stepDetail(e.key === "ArrowLeft" ? -1 : 1);
        return true;
      }
      if (e.key !== "Backspace" || typing) return false;
      if (ui.menu || ui.detail) {
        if (opts.history && ui.detail && ui.depth > 1) global.history.back(); else closeSheet();
        return true;
      }
      if (ui.screen !== "home") { goHome(); return true; }
      return false;
    }
    // single-key shortcuts (listed in the menu): M menu, L language, T theme, H region list,
    // O / W owned / wishlist on a figure page, 1-6 grid filters
    function shortcutKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || !e.key || e.key.length !== 1) return false;
      var k = e.key.toLowerCase();
      if (k === "m") { if (ui.menu) closeSheet(); else if (ui.detail) closeSheet(openMenu); else openMenu(); return true; }
      if (k === "l") { run("lang-toggle"); return true; }
      if (k === "t") { run("theme-toggle"); return true; }
      if (k === "h") {
        var home = function () { if (ui.screen !== "home" || ui.query) { ui.search = false; ui.query = ""; goHome(); } };
        if (ui.detail || ui.menu) closeSheet(home); else home();
        return true;
      }
      if ((k === "o" || k === "w") && ui.detail && !ui.menu && ui.fig) { run(k === "o" ? "own" : "wish", ui.fig); return true; }
      var n = +k;
      if (n >= 1 && n <= FILTERS.length && !ui.detail && !ui.menu && (ui.screen !== "home" || ui.query)) { run("filter", FILTERS[n - 1]); return true; }
      return false;
    }
    function onKey(e) {
      if (opts.keyboard !== "global" && navKey(e)) e.preventDefault();
    }
    // "/" or Ctrl/Cmd+K opens the search, like Google or YouTube
    function isSearchKey(e) {
      var t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")) return true;
      return e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey;
    }
    function openSearch() {
      var go = function () { ui.search = true; ui.focusSearch = true; renderBar(); };
      if (ui.detail || ui.menu) closeSheet(go); else go();
    }
    function onGlobalKey(e) {
      if (isSearchKey(e)) { e.preventDefault(); openSearch(); }
      else if (navKey(e)) e.preventDefault();
    }
    if (opts.keyboard === "global") global.addEventListener("keydown", onGlobalKey);
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    root.addEventListener("error", onError, true);
    root.addEventListener("keydown", onKey);
    if (mq && mq.addEventListener) mq.addEventListener("change", applyTheme);
    if (marksMoved) save();  // store the moved marks under their new ids

    var api = {
      getState: function () { return st; },
      setState: function (s) { st = s || {}; st.owned = st.owned || {}; st.wish = st.wish || {}; st.prefs = st.prefs || prefs; prefs = st.prefs; migrateMarks(); save(); render(); if (ui.menu) openMenu(); },
      setData: function (d) { data = d; idx = buildIndex(d); if (migrateMarks()) save(); render(); },
      setDark: function (v) { opts.dark = v; applyTheme(); },
      lang: function () { return prefs.lang; },  // "en" | "vi", for host messages
      isSearchKey: isSearchKey,
      navKey: navKey,  // host-level Esc / Backspace (see navKey); true = handled
      openSearch: openSearch,
      destroy: function () {
        root.removeEventListener("click", onClick); root.removeEventListener("change", onChange);
        root.removeEventListener("error", onError, true); root.removeEventListener("keydown", onKey);
        if (opts.history) global.removeEventListener("popstate", onPop);
        if (opts.keyboard === "global") global.removeEventListener("keydown", onGlobalKey);
        if (mq && mq.removeEventListener) mq.removeEventListener("change", applyTheme);
        if (resizeObs) resizeObs.disconnect(); else global.removeEventListener("resize", onResize);
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
