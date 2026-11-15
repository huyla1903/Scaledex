#!/usr/bin/env python3
"""
@title        Scaledex - data builder
@version      0.2.0
@author       La Gia Huy
@since        2026-11-14
@updated      2026-11-15
@engine       Python 3 (standard library only)
@target       Windows / any OS; network access to bandai.co.jp, web.archive.org,
              raw.githubusercontent.com (PokeAPI CSV)
@about        Builds data/scaledex.json and data/images/ for the Scaledex
              (Obsidian plugin + PWA). Sources:
              - Official dex  bandai.co.jp/candy/pokemonscaleworld/lineup/ (figures,
                images, scale height, every product a figure was sold in)
              - Official item list  .../item/ (release / ship dates)
              - Bandai Candy product pages (price, release date, sales channel)
              - Premium Bandai pages through the Wayback Machine, because
                p-bandai.jp blocks non-Japanese IPs (price, ship date)
              - Bandai Candy Scale World brand page (products the official dex
                does not list yet, incl. upcoming releases, and their figures)
              - PokeAPI CSVs (English names, types, forms, evolution chains)
              Every HTTP response is cached in scraper/cache/, so re-runs only
              fetch what is new. Delete the cache folder to force a full refresh.
              Usage:  python build_data.py [--no-images] [--refresh-index]
@changelog    0.2.0  brand-page products/figures, types, evolution chains, trainer roles
                     and Bulbapedia trainer order,
                     Lumiose City region alias; --refresh-index also re-reads
                     the brand list and pages of unreleased products
              0.1.0  first version
"""

import csv
import gzip
import html
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, "cache")
OUT_DIR = os.path.join(ROOT, "data")
IMG_DIR = os.path.join(OUT_DIR, "images")

SITE = "https://www.bandai.co.jp/candy/pokemonscaleworld/"
POKEAPI_CSV = ("https://raw.githubusercontent.com/PokeAPI/pokeapi/master/"
               "data/v2/csv/pokemon_species_names.csv")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Scaledex/0.1 (personal collection index)"
DELAY = 0.6  # seconds between live requests
ARCHIVE_DELAY = 4.0  # web.archive.org rate-limits harder

# ---------------------------------------------------------------- lookups

REGIONS = [  # order = Scale World release order
    ("kanto", "Kanto", "カントー地方"),
    ("johto", "Johto", "ジョウト地方"),
    ("hoenn", "Hoenn", "ホウエン地方"),
    ("sinnoh", "Sinnoh", "シンオウ地方"),
    ("hisui", "Hisui", "ヒスイ地方"),
    ("unova", "Unova", "イッシュ地方"),
    ("kalos", "Kalos", "カロス地方"),
    ("alola", "Alola", "アローラ地方"),
    ("galar", "Galar", "ガラル地方"),
    ("paldea", "Paldea", "パルデア地方"),
    ("special", "Special", "その他"),
]

TRAINERS = {  # official lineup id base -> English name
    "red": "Red", "leaf": "Leaf", "green": "Blue", "oak": "Professor Oak",
    "takeshi": "Brock", "kasumi": "Misty", "katsura": "Blaine",
    "matisse": "Lt. Surge", "erika": "Erika", "kyou": "Koga",
    "natsume": "Sabrina", "sakaki": "Giovanni", "hibiki": "Ethan",
    "kotone": "Lyra", "silver": "Silver", "tsukushi": "Bugsy",
    "akane": "Whitney", "matsuba": "Morty", "mikan": "Jasmine",
    "chris": "Kris", "wataru": "Lance", "haruka": "May", "yuuki": "Brendan",
    "mitsuru": "Wally", "mikuri": "Wallace", "daigo": "Steven",
    "kouki": "Lucas", "hikari": "Dawn", "jun": "Barry", "natane": "Gardenia",
    "denzi": "Volkner", "shirona": "Cynthia", "calem": "Calem",
    "korrina": "Korrina", "masaru": "Victor", "yuuri": "Gloria", "hop": "Hop",
    "mary": "Marnie", "beet": "Bede", "rurina": "Nessa", "saitou": "Bea",
    "onion": "Allister", "nezu": "Piers", "kibana": "Raihan", "dande": "Leon",
    "aoi": "Juliana", "nanjamo": "Iono", "nemo": "Nemona", "haruto": "Florian",
    "peper": "Arven", "chili": "Rika", "botan": "Penny", "teru": "Rei",
    "volo": "Volo", "seki": "Adaman", "kai": "Irida", "sho": "Akari",
    "serena": "Serena", "fura": "Lysandre", "furadari": "Lysandre",
}

# Japanese names that appear in product titles but have no own lineup page.
EXTRA_NAMES = {
    "フラダリ": "Lysandre", "セレナ": "Serena", "ムサシ": "Jessie",
    "コジロウ": "James", "サトシ": "Ash", "ロケット団": "Team Rocket",
}

# Japanese variant / form labels -> English
LABELS = [
    ("ヒスイのすがた", "Hisuian Form"), ("ガラルのすがた", "Galarian Form"),
    ("アローラのすがた", "Alolan Form"), ("パルデアのすがた", "Paldean Form"),
    ("ハイなすがた", "Amped Form"), ("ローなすがた", "Low Key Form"),
    ("まんぷくもよう", "Full Belly Mode"), ("はらぺこもよう", "Hangry Mode"),
    ("のびたすがた", "Stretchy Form"), ("はこフォルム", "Chest Form"),
    ("オスのすがた", "Male"), ("メスのすがた", "Female"),
    ("にしのうみ", "West Sea"), ("ひがしのうみ", "East Sea"),
    ("ユニフォームver.", "Uniform ver."), ("ユニフォームVer.", "Uniform ver."),
    ("通常ver.", "Standard ver."), ("バイオレットVer.", "Violet ver."),
    ("スカーレットVer.", "Scarlet ver."), ("HGSSver.", "HGSS ver."),
    ("ORASver.", "ORAS ver."), ("RSver.", "RS ver."), ("DPver.", "DP ver."),
    ("Ptver.", "Pt ver."), ("シールドフォルム", "Shield Forme"), ("10％フォルム", "10% Forme"),
    ("スカイフォルム", "Sky Forme"), ("ロトムのすがた", "Rotom"),
]

PRODUCT_WORDS = [
    ("【定番単品販売】", "[Standard single sale] "), ("【再受注】", " [Re-order]"),
    ("（再受注）", " [Re-order]"), ("(再受注)", " [Re-order]"),
    ("【再販】", " [Re-release]"), ("【2次受注】", " [2nd order]"),
    ("【プレミアムバンダイ限定】", " [Premium Bandai exclusive]"),
    ("【PB・ポケモンセンター限定】", " [Premium Bandai & Pokémon Center exclusive]"),
    ("【プレミアムバンダイ・ポケモンセンター限定】", " [Premium Bandai & Pokémon Center exclusive]"),
    ("【ポケモンセンター限定】", " [Pokémon Center exclusive]"),
    ("ポケモンスケールワールド", "Pokémon Scale World"), ("ミアレシティ", "Lumiose City "),
    ("シルフカンパニー", "Silph Co."), ("ジムバトル", "Gym Battle"), ("草むらパーツ", "Tall Grass parts"),
    ("ポケモンの笛", "Poké Flute"), ("進化", " Evolution"), ("にしのうみ", "West Sea"),
    ("ひがしのうみ", "East Sea"),
    ("博士", "Professor "), ("セット", " Set"), ("＆", " & "), ("・", " & "),
    ("メガ", "Mega "), ("ジムリーダー", "Gym Leader "), ("チャンピオン", "Champion "),
    ("ディスプレイ", "Display"), ("ベース", "Base"), ("スペシャル", "Special"),
]

# The official dex links some candy boxes to the wrong page. Keys are product ids
# (model image ids); a key also covers its boxes ("<key>-<box>").
URL_OVERRIDES = {
    # Johto candy wave boxes point at the Premium Bandai Johto *set*
    "1000175683": "https://www.bandai.co.jp/candy/products/2020/4549660425250000.html",
}

BULBAPEDIA_RAW = "https://bulbapedia.bulbagarden.net/w/index.php?title=Pok%C3%A9mon_Scale_World&action=raw"

# Bandai Candy's Scale World brand page lists every product, newest first, 20 per
# page (?__offset=20, 40, ...). It runs months ahead of the official dex.
BRAND_LIST = "https://www.bandai.co.jp/candy/brand/brand154/index.html"

# Trainers that appear on product pages before they get an official dex page.
# Japanese name -> (id base, English name)
NEW_TRAINERS = {
    "プラターヌ": ("platane", "Professor Sycamore"), "カルネ": ("carnet", "Diantha"),
    "ガイ": ("gai", "Urbain"), "デウロ": ("deuro", "Lida"), "ピュール": ("pyuure", "Naveen"),
    "セイカ": ("seika", "Harmony"), "マチエール": ("matiere", "Emma"), "アカギ": ("akagi", "Cyrus"),
    "セレナ": ("serena", "Serena"),
}

# Trainer roles in the games (first = main one). "Role:type" adds the type specialty.
ROLES = {
    "protagonist": ("Protagonist", "主人公"), "rival": ("Rival", "ライバル"), "professor": ("Professor", "博士"),
    "gym": ("Gym Leader", "ジムリーダー"), "e4": ("Elite Four", "四天王"), "champion": ("Champion", "チャンピオン"),
    "boss": ("Team Boss", "ボス"), "clan": ("Clan Leader", "リーダー"), "teammz": ("Team MZ", "MZ団"),
    "friend": ("Friend", "友達"), "merchant": ("Merchant", "商人"), "detective": ("Detective", "探偵"),
}
TRAINER_ROLES = {
    # protagonists
    "red": ["protagonist"], "leaf": ["protagonist"], "hibiki": ["protagonist"], "kotone": ["protagonist"],
    "chris": ["protagonist"], "yuuki": ["protagonist"], "haruka": ["protagonist"], "kouki": ["protagonist"],
    "hikari": ["protagonist"], "teru": ["protagonist"], "sho": ["protagonist"], "calem": ["protagonist"],
    "serena": ["protagonist"], "masaru": ["protagonist"], "yuuri": ["protagonist"], "haruto": ["protagonist"],
    "aoi": ["protagonist"], "seika": ["protagonist"],
    # rivals and friends
    "green": ["rival", "champion"], "silver": ["rival"], "mitsuru": ["rival"], "jun": ["rival"],
    "hop": ["rival"], "mary": ["rival", "gym:dark"], "beet": ["rival", "gym:fairy"], "nemo": ["rival", "champion"],
    "peper": ["friend"], "botan": ["friend", "boss"],
    # professors
    "oak": ["professor"], "platane": ["professor"],
    # Gym Leaders
    "takeshi": ["gym:rock"], "kasumi": ["gym:water"], "matisse": ["gym:electric"], "erika": ["gym:grass"],
    "kyou": ["gym:poison"], "natsume": ["gym:psychic"], "katsura": ["gym:fire"], "sakaki": ["boss", "gym:ground"],
    "tsukushi": ["gym:bug"], "akane": ["gym:normal"], "matsuba": ["gym:ghost"], "mikan": ["gym:steel"],
    "natane": ["gym:grass"], "denzi": ["gym:electric"], "korrina": ["gym:fighting"],
    "rurina": ["gym:water"], "saitou": ["gym:fighting"], "onion": ["gym:ghost"], "nezu": ["gym:dark"],
    "kibana": ["gym:dragon"], "nanjamo": ["gym:electric"],
    # Elite Four and Champions
    "chili": ["e4:ground"], "wataru": ["champion", "e4:dragon"], "daigo": ["champion"],
    "mikuri": ["champion", "gym:water"], "shirona": ["champion"], "carnet": ["champion"], "dande": ["champion"],
    # villains, Hisui, Lumiose City
    "akagi": ["boss"], "furadari": ["boss"], "fura": ["boss"], "seki": ["clan"], "kai": ["clan"], "volo": ["merchant"],
    "gai": ["teammz"], "deuro": ["teammz"], "pyuure": ["teammz"], "matiere": ["detective"],
}

# Region words in product titles that are not "<region>地方"
REGION_ALIASES = {"ミアレシティ": "kalos"}

CHANNELS = {
    "supermarket": ("Supermarkets & mass retailers (candy aisle)", "全国量販店の菓子売場等"),
    "convenience": ("Convenience stores", "コンビニエンスストア"),
    "hobby": ("Hobby shops", "ホビー店"),
    "pokecen": ("Pokémon Center", "ポケモンセンター"),
    "pbandai": ("Premium Bandai (pre-order)", "プレミアムバンダイ（予約）"),
    "pbandai_std": ("Premium Bandai (standard single sale)", "プレミアムバンダイ（定番単品販売）"),
    "other": ("Other", "その他"),
}

# ---------------------------------------------------------------- http + cache

_last = [0.0]


def _cache_path(url):
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", url)[-180:]
    return os.path.join(CACHE, safe)


def fetch(url, binary=False, use_cache=True, tries=3):
    """GET with on-disk cache. Returns bytes (binary) or str, or None on 404."""
    p = _cache_path(url)
    if use_cache and os.path.exists(p):
        with open(p, "rb") as f:
            data = f.read()
        if data == b"__404__":
            return None
        return data if binary else _decode(data)
    slow = "archive.org" in url  # the Wayback Machine refuses bursts
    for attempt in range(tries + (2 if slow else 0)):
        wait = (ARCHIVE_DELAY if slow else DELAY) - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
                if r.headers.get("Content-Encoding") == "gzip" or data[:2] == b"\x1f\x8b":
                    data = gzip.decompress(data)
            os.makedirs(CACHE, exist_ok=True)
            with open(p, "wb") as f:
                f.write(data)
            return data if binary else _decode(data)
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                os.makedirs(CACHE, exist_ok=True)
                with open(p, "wb") as f:
                    f.write(b"__404__")
                return None
            err = e
        except Exception as e:  # network hiccup / timeout
            err = e
        time.sleep((20 if slow else 3) * (attempt + 1))
    print("   ! failed:", url, err)
    return None


def _decode(data):
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    head = data[:3000].lower()
    m = re.search(rb'charset=["\']?([a-z0-9_-]+)', head)
    encs = [m.group(1).decode()] if m else []
    encs += ["utf-8", "cp932"]
    for enc in encs:
        try:
            return data.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return data.decode("utf-8", "replace")


def text_of(fragment):
    s = re.sub(r"<script.*?</script>|<style.*?</style>", "", fragment, flags=re.S)
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    return re.sub(r"[ \t　]+", " ", s).strip()


def parse_jdate(s):
    """'2019年10月28日' -> ('2019-10-28', 2019); '2026年5月' -> ('2026-05', 2026)."""
    if not s:
        return None, None
    m = re.search(r"(20\d\d)\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?", s)
    if not m:
        m2 = re.search(r"(20\d\d)", s)
        return (m2.group(1), int(m2.group(1))) if m2 else (None, None)
    y, mo, d = int(m.group(1)), int(m.group(2)), m.group(3)
    return (f"{y:04d}-{mo:02d}-{int(d):02d}" if d else f"{y:04d}-{mo:02d}"), y


# ---------------------------------------------------------------- official site


def read_lineup():
    t = fetch(SITE + "lineup/")
    out = []
    for kind, fid, src, alt in re.findall(
            r'lineup/(pokemon|trainer)/\?id=([^"]+)"[^>]*>\s*<img src="([^"]+)" alt="([^"]*)"', t):
        out.append({"kind": kind, "id": fid, "btn": urllib.parse.urljoin(SITE + "lineup/", src.split("?")[0]),
                    "alt": html.unescape(alt)})
    return out


def read_detail(kind, fid):
    url = f"{SITE}lineup/{kind}/?id={fid}"
    t = fetch(url)
    if not t:
        return None
    name = re.search(r'p-lineup-main__name"><span>(.*?)</span>', t, re.S)
    img = re.search(r'p-lineup-main__detail-thumb[^>]*>\s*<img src="([^"]+)"', t)
    height = re.search(r'detail-data-scale-value">\s*([^<]*)<', t)
    has360 = "../view/?id=" in t
    prods = []
    for block in re.findall(r'<div class="c-item">(.*?)</a>\s*</div>', t, re.S):
        im = re.search(r'<img src="([^"]+)" alt="([^"]*)"', block)
        nm = re.search(r'c-item__detail-name">(.*?)</p>', block, re.S)
        href = re.search(r'href="([^"]+)"', block)
        if not (im and href):
            continue
        prods.append({
            "image": urllib.parse.urljoin(url, im.group(1).split("?")[0]),
            "nameJa": text_of(nm.group(1)) if nm else html.unescape(im.group(2)),
            "url": href.group(1).strip(),
        })
    return {
        "url": url,
        "nameJa": text_of(name.group(1)) if name else None,
        "img": urllib.parse.urljoin(url, img.group(1).split("?")[0]) if img else None,
        "height": (height.group(1).strip() if height else None),
        "has360": has360,
        "products": prods,
    }


def read_item_list():
    t = fetch(SITE + "item/")
    out = {}
    for block in re.findall(r'<li class="p-item-list__item">(.*?)</li>', t, re.S):
        im = re.search(r'<img src="([^"]+)" alt="([^"]*)"', block)
        rel = re.search(r'detail-info-release">(.*?)</p>', block, re.S)
        href = re.search(r'href="([^"]+)"', block)
        if not im:
            continue
        image = urllib.parse.urljoin(SITE + "item/", im.group(1).split("?")[0])
        out[image] = {"image": image, "nameJa": html.unescape(im.group(2)),
                      "url": href.group(1).strip() if href else None,
                      "releaseText": text_of(rel.group(1)) if rel else None}
    return out


# ---------------------------------------------------------------- product pages


def read_candy_page(url):
    t = fetch(url)
    if not t:
        return {}
    s = text_of(t)
    info = {}
    m = re.search(r"価格\s*([\d,]+)\s*円\s*[（(]\s*税込\s*[:：]?\s*([\d,]+)\s*円", s)
    if m:
        info["priceExTax"] = int(m.group(1).replace(",", ""))
        info["priceJPY"] = int(m.group(2).replace(",", ""))
    else:
        m = re.search(r"価格\s*([\d,]+)\s*円", s)
        if m:
            info["priceExTax"] = int(m.group(1).replace(",", ""))
    m = re.search(r"発売日\s*(.{0,30}?)\s*(?:発売|発送|売場|対象年齢)", s, re.S)
    if m:
        info["releaseText"] = re.sub(r"\s+", "", m.group(1))
    m = re.search(r"売場\s*(.{0,80}?)\s*(?:対象年齢|商品アンケート|$)", s, re.S)
    if m:
        info["shopText"] = re.sub(r"\s+", " ", m.group(1)).strip()
    return info


def _real_pbandai_page(page):
    # skip blank bot-check pages and the international region gate
    return bool(page) and ("priceCurrency" in page or "税込" in page) and "INTERNATIONAL SHIPPING AVAILABLE" not in page[:3000]


def candy_title(url):
    t = fetch(url) or ""
    m = re.search(r"<title>(.*?)</title>", t, re.S)
    if not m:
        return None
    name = html.unescape(m.group(1)).split("｜")[0].split("|")[0].strip()
    return re.sub(r"^ポケモンスケールワールド\s*", "", name) or None


def bulbapedia_rereleases():
    """Rows of Bulbapedia's Scale World tables -> lists of candy URLs (first = original).
    Bulbapedia records candy-aisle re-releases the official dex does not link."""
    t = fetch(BULBAPEDIA_RAW)
    if not t:
        return []
    groups = []
    for row in t.split("\n|-"):
        urls = re.findall(r"https://www\.bandai\.co\.jp/candy/products/\d{4}/[0-9]+\.html", row)
        seen = []
        for u in urls:
            if u not in seen:
                seen.append(u)
        if len(seen) > 1:
            groups.append(seen)
    return groups


def bulbapedia_trainer_order():
    """English trainer names in the order of Bulbapedia's "List of Trainer figurines".
    Version rows ("Red (HGSS ver.)") count once, at the trainer's first row."""
    t = fetch(BULBAPEDIA_RAW) or ""
    i = t.find("==List of Trainer figurines==")
    if i < 0:
        return []
    section = t[i:t.find("\n==", i + 10)]
    names = []
    for line in section.split("\n"):
        if not line.startswith("|") or line.startswith("|-") or line.startswith("|}"):
            continue
        cell = line[1:].split("||")[0]
        m = (re.search(r"\{\{ga\|([^}|]+)", cell) or re.search(r"\[\[([^\]|]+)", cell)
             or re.search(r"\{\{([^}|]+)\}\}", cell))
        if m:
            name = m.group(1).strip()
            if name not in names:
                names.append(name)
    return names


def read_brand_list():
    """All product URLs on the Bandai Candy Scale World brand page (newest first)."""
    urls, offset = [], 0
    while offset < 1000:
        t = fetch(BRAND_LIST + ("?__offset=%d" % offset if offset else ""))
        found = re.findall(r'/candy/products/20\d\d/\d+\.html', t or "")
        new = [u for u in dict.fromkeys(found) if "https://www.bandai.co.jp" + u not in urls]
        if not new:
            break
        urls += ["https://www.bandai.co.jp" + u for u in new]
        offset += 20
    return urls


def _page_lines(t):
    s = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
    s = html.unescape(re.sub(r"<[^>]+>", "\n", s))
    return [re.sub(r"[ \t　]+", " ", x).strip() for x in s.split("\n") if x.strip()]


def read_brand_page(url):
    """Candy product page -> title, price, date, channel hints, figure names, sizes, image."""
    t = fetch(url)
    if not t:
        return None
    info = read_candy_page(url)
    m = re.search(r"<title>(.*?)</title>", t, re.S)
    title = html.unescape(m.group(1)).split("｜")[0].strip() if m else ""
    info["nameJa"] = re.sub(r"^ポケモンスケールワールド\s*", "", title)
    m = re.search(r'property="og:image"\s+content="([^"]+)"', t) or re.search(r'content="([^"]+)"\s+property="og:image"', t)
    info["image"] = m.group(1) if m and "__dummy" not in m.group(1) else None
    lines = _page_lines(t)
    body = lines[next((i for i, x in enumerate(lines) if x == "価格"), 0):]
    end = next((i for i, x in enumerate(body) if x.startswith("ポケットモンスター・ポケモン") or x.startswith("©Pok") or x.startswith("(C)Pok")), len(body))
    body = body[:end]
    for i in range(len(body) - 2, -1, -1):  # "1．" and its names can be split by markup
        if re.match(r"^\d+\s*[．.]$", body[i]):
            body[i:i + 2] = [body[i] + body[i + 1]]
    text = " ".join(body)
    info["route"] = (re.search(r"販売ルート[:：]\s*(\S+)", text) or [None, ""])[1]
    # figure names: 【ラインナップ】 bullets, numbered set lists, or ・A＆B under the contents
    names = []
    for i, x in enumerate(body):
        if x.startswith("【ラインナップ】"):
            for y in body[i + 1:]:
                if y.startswith("【"):
                    break
                names += [n for n in re.split(r"[・＆&]", y) if n.strip()]
            break
    if not names:
        for x in body:
            m = re.match(r"^(?:\d+\s*[．.]|・)\s*(.+)$", x)
            if m and not re.search(r"ガム|フィギュア", m.group(1)):
                names += [n for n in re.split(r"[＆&]", m.group(1)) if n.strip()]
    if not names:  # "<region> A＆B" in the title
        rest = re.sub(r"【.*?】", "", info["nameJa"])
        rest = re.sub(r"^\S*(?:地方|シティ)\d*\s*", "", rest).strip()
        if rest and not rest.endswith("セット"):
            names = re.split(r"[＆&]", rest)
    names = [re.sub(r"^スペシャル|[【】]", "", n).strip() for n in names]
    info["figureNames"] = [n for n in names if n]
    # sizes: "name：H約95mm×W..." per figure, or a single "H約270mm"
    sizes = {}
    sz = text[text.find("【サイズ】"):] if "【サイズ】" in text else ""
    sz = sz[:sz.find("【", 2)] if sz.find("【", 2) > 0 else sz
    for nm, mm in re.findall(r"([^\s：:…・【】]+?)\s*[：:…・\s]*H約\s*([\d.,]+)\s*[mｍ]", sz):
        sizes[re.sub(r"[（(].*?[）)]", "", nm)] = float(mm.replace(",", "")) / 10
    if not sizes:
        m = re.search(r"H約\s*([\d.,]+)\s*[mｍ]", sz)
        if m:
            sizes[""] = float(m.group(1).replace(",", "")) / 10
    info["sizes"] = sizes
    return info


def wayback_latest(url, max_tries=5):
    """Newest archived snapshot of url that is a real product page, or (None, None)."""
    q = ("https://web.archive.org/cdx/search/cdx?url=" + urllib.parse.quote(url, safe="")
         + "&filter=statuscode:200&output=json&fl=timestamp,original,digest,length")
    t = fetch(q)
    if not t:
        return None, None
    try:
        rows = json.loads(t)[1:]
    except ValueError:
        return None, None
    seen, tried = set(), 0
    for row in reversed(rows):
        ts, orig = row[0], row[1]
        digest = row[2] if len(row) > 2 else ts
        length = int(row[3]) if len(row) > 3 and str(row[3]).isdigit() else 99999
        if digest in seen or length < 13000:  # compressed size; real pages are ~25 KB
            continue
        seen.add(digest)
        page = fetch(f"https://web.archive.org/web/{ts}id_/{orig}")
        if _real_pbandai_page(page):
            return page, ts
        tried += 1
        if tried >= max_tries:
            break
    return None, None


def read_pbandai_page(url):
    page, ts = wayback_latest(url)
    if not page:
        return {"archived": False}
    info = {"archived": True, "archiveTimestamp": ts}
    # most specific first; old (2020) layouts carry other numbers named "price"
    for pat in (r'"priceCurrency"\s*:\s*"JPY"\s*,\s*"price"\s*:\s*"?([\d,]+)',
                r'"price"\s*:\s*"?([\d,]+)"?\s*,\s*"priceCurrency"\s*:\s*"JPY"',
                r'sale_price"[^>]*>\s*[￥¥]\s*([\d,]+)',
                r"[￥¥]\s*([\d,]+)\s*(?:<[^>]+>)?\s*[（(]?\s*税込",
                r"price:\s*'(\d+)'"):
        m = re.search(pat, page)
        if m and int(m.group(1).replace(",", "")) >= 100:
            info["priceJPY"] = int(m.group(1).replace(",", ""))
            break
    m = re.search(r"<th>\s*(?:発送日|お届け予定|お届け時期|発送時期)\s*</th>\s*<td>(.*?)</td>", page, re.S)
    if m:
        info["shipText"] = text_of(m.group(1))
    s = text_of(page)
    m = re.search(r"(?:予約|受注|販売)(?:受付)?期間\s*[:：]?\s*(20\d\d年\d{1,2}月\d{1,2}日)", s)
    if m:
        info["orderStart"] = parse_jdate(m.group(1))[0]
    return info


# ---------------------------------------------------------------- names


def load_species_names():
    t = fetch(POKEAPI_CSV)
    names = {}
    for row in csv.DictReader(io.StringIO(t)):
        sid = int(row["pokemon_species_id"])
        lang = row["local_language_id"]
        if lang == "9":
            names.setdefault(sid, {})["en"] = row["name"]
        elif lang == "1":
            names.setdefault(sid, {})["ja"] = row["name"]
    return names


def load_pokeapi():
    """Evolution chains, forms and types from PokeAPI's CSV dump.
    Returns (species {id: {from, chain}}, forms {species_id: [(identifier, is_default, [types])]},
    type names {identifier: {en, ja}})."""
    base = POKEAPI_CSV.rsplit("/", 1)[0] + "/"
    rows = lambda name: list(csv.DictReader(io.StringIO(fetch(base + name + ".csv") or "")))
    sp = {}
    for r in rows("pokemon_species"):
        sp[int(r["id"])] = {"from": int(r["evolves_from_species_id"]) if r["evolves_from_species_id"] else None,
                            "chain": int(r["evolution_chain_id"]) if r["evolution_chain_id"] else None}
    types = {}
    for r in rows("types"):
        types[int(r["id"])] = {"id": r["identifier"]}
    for r in rows("type_names"):
        t = types.get(int(r["type_id"]))
        if t and r["local_language_id"] in ("9", "1"):
            t["en" if r["local_language_id"] == "9" else "ja"] = r["name"]
    ptypes = {}
    for r in sorted(rows("pokemon_types"), key=lambda r: int(r["slot"])):
        ptypes.setdefault(int(r["pokemon_id"]), []).append(types[int(r["type_id"])]["id"])
    forms = {}
    for r in rows("pokemon"):
        forms.setdefault(int(r["species_id"]), []).append(
            (r["identifier"], r["is_default"] == "1", ptypes.get(int(r["id"]), [])))
    names = {t["id"]: {"en": t.get("en", t["id"].title()), "ja": t.get("ja", "")} for t in types.values()
             if t["id"] not in ("unknown", "shadow", "stellar")}
    return sp, forms, names


FORM_WORDS = {"hisuian": "hisui", "galarian": "galar", "alolan": "alola", "paldean": "paldea",
              "10%": "10", "rotom": None, "ver.": None}


def form_types(forms, dex, label_en):
    """Types of the PokeAPI form that best matches a figure label ('Mega Charizard X')."""
    fs = forms.get(dex) or []
    default = next((f for f in fs if f[1]), fs[0] if fs else None)
    if not default:
        return []
    if not label_en:
        return default[2]
    words = []
    for w in re.split(r"[\s-]+", label_en.lower()):
        w = FORM_WORDS.get(w, w)
        if w and w not in ("form", "forme", "mode", "sea"):
            words.append(w)
    best = [f for f in fs if all(w in f[0].split("-") for w in words)]
    best.sort(key=lambda f: len(f[0]))
    return (best[0] if best else default)[2]


def split_label(name_ja):
    """'ガーディ（ヒスイのすがた）' -> ('ガーディ', 'ヒスイのすがた')."""
    m = re.match(r"^(.*?)\s*[（(](.+?)[）)]\s*$", name_ja or "")
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return (name_ja or "").strip(), None


def label_en(label_ja):
    if not label_ja:
        return None
    out = label_ja
    for ja, en in LABELS:
        out = out.replace(ja, en)
    return out


def region_of(name_ja):
    for rid, _, ja in REGIONS:
        if ja in name_ja:
            return rid
    for ja, rid in REGION_ALIASES.items():
        if ja in name_ja:
            return rid
    return None


def product_id(image_url, url):
    m = re.search(r"/images/model/(.+?)\.(?:jpg|png|jpeg)$", image_url or "")
    if m:
        return m.group(1).replace("/", "-")
    return re.sub(r"[^0-9A-Za-z]+", "-", url or "x")[-40:]


def store_of(url):
    if "p-bandai.jp" in url:
        return "pbandai"
    if "bandai.co.jp/candy/products" in url:
        return "candy"
    if "pokemoncenter" in url:
        return "pokecen"
    return "other"


def classify_channel(store, name_ja, shop_text):
    if store == "pbandai":
        keys = ["pbandai_std"] if "定番単品販売" in name_ja else ["pbandai"]
        if "ポケモンセンター" in name_ja:
            keys.append("pokecen")
        return keys
    if store == "pokecen":
        return ["pokecen"]
    keys = []
    st = shop_text or ""
    if "プレミアムバンダイ" in st:
        keys.append("pbandai")
    if "量販店" in st or "菓子売場" in st or "スーパー" in st:
        keys.append("supermarket")
    if "コンビニ" in st:
        keys.append("convenience")
    if "ホビー" in st or "玩具" in st:
        keys.append("hobby")
    if "ポケモンセンター" in st:
        keys.append("pokecen")
    return keys or (["supermarket"] if store == "candy" else ["other"])


def translate_product(name_ja, ja2en):
    out = re.sub(r"【再受注[:：]\s*(20\d\d)年(\d{1,2})月発送】",
                 lambda m: " [Re-order, ships %s %s]" % (["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep",
                                                          "Oct", "Nov", "Dec"][int(m.group(2)) - 1], m.group(1)), name_ja)
    for ja, en in PRODUCT_WORDS[:19]:
        out = out.replace(ja, en)
    for rid, en, ja in REGIONS:
        out = out.replace(ja, en + " Region ")
    for ja in sorted(ja2en, key=len, reverse=True):
        out = out.replace(ja, ja2en[ja])
    for ja, en in PRODUCT_WORDS[19:]:
        out = out.replace(ja, en)
    for ja, en in LABELS:
        out = out.replace(ja, en)
    out = out.replace("（", " (").replace("）", ")").replace("&", " & ")
    out = re.sub(r"\s+", " ", out).strip()
    return out


# ---------------------------------------------------------------- images


def save_image(url, sub, name):
    if not url:
        return None
    ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower() or ".jpg"
    rel = f"images/{sub}/{name}{ext}"
    dst = os.path.join(OUT_DIR, rel.replace("/", os.sep))
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return rel
    data = fetch(url, binary=True)
    if not data:
        return None
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "wb") as f:
        f.write(data)
    return rel


def trim_image(rel, name):
    """Crop the white margin around an official render -> images/trim/<name>.jpg.
    The originals keep Bandai's true relative scale; trimmed copies fill a tile.
    Needs Pillow; returns None (and the UI falls back to the original) without it."""
    try:
        from PIL import Image, ImageChops
    except ImportError:
        return None
    if not rel:
        return None
    src = os.path.join(OUT_DIR, rel.replace("/", os.sep))
    out_rel = f"images/trim/{name}.jpg"
    dst = os.path.join(OUT_DIR, out_rel.replace("/", os.sep))
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        return out_rel
    try:
        im = Image.open(src).convert("RGB")
        diff = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255))).convert("L")
        box = diff.point(lambda v: 255 if v > 14 else 0).getbbox()
        if not box:
            return None
        pad = int(max(box[2] - box[0], box[3] - box[1]) * 0.04)
        box = (max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        im.crop(box).save(dst, "JPEG", quality=88, optimize=True)
        return out_rel
    except Exception as e:  # corrupt download etc.
        print("   ! trim failed:", rel, e)
        return None


# ---------------------------------------------------------------- main


def main():
    want_images = "--no-images" not in sys.argv
    if "--refresh-index" in sys.argv:  # re-read lineup/item/brand lists, keep the rest cached
        old = os.path.join(OUT_DIR, "scaledex.json")
        stale = [SITE + "lineup/", SITE + "item/", BULBAPEDIA_RAW] + [BRAND_LIST + ("?__offset=%d" % o if o else "") for o in range(0, 1000, 20)]
        if os.path.exists(old):  # pages of products that have not shipped yet (dates/prices change)
            this_month = date.today().isoformat()[:7]
            with open(old, encoding="utf-8") as fh:
                stale += [p["url"] for p in json.load(fh)["products"]
                          if p.get("date") and p["date"][:7] >= this_month and "bandai.co.jp/candy" in p["url"]]
        for u in stale:
            p = _cache_path(u)
            if os.path.exists(p):
                os.remove(p)

    print("1/5 Reading official lineup ...")
    lineup = read_lineup()
    print(f"    {len(lineup)} figures")
    species = load_species_names()

    print("2/5 Reading figure pages ...")
    figures, raw_products = [], {}
    for i, e in enumerate(lineup, 1):
        d = read_detail(e["kind"], e["id"])
        if not d:
            print("   ! no detail page for", e["id"])
            continue
        if i % 25 == 0:
            print(f"    {i}/{len(lineup)}")
        figures.append((e, d))
        for p in d["products"]:
            raw_products.setdefault(product_id(p["image"], p["url"]), p)

    item_list = read_item_list()
    for img, p in item_list.items():
        pid = product_id(img, p["url"])
        if pid in raw_products:
            raw_products[pid]["releaseText"] = p["releaseText"]
        elif p["url"]:
            raw_products[pid] = dict(p)

    # ---- characters
    print("3/5 Building characters ...")
    characters, ja2en, fig_out = {}, dict(EXTRA_NAMES), []
    for sp in species.values():
        if sp.get("ja") and sp.get("en") and len(sp["ja"]) >= 2:
            ja2en.setdefault(sp["ja"], sp["en"])
    for e, d in figures:
        fid = e["id"]
        name_ja_full = d["nameJa"] or e["alt"]
        base_ja, lab_ja = split_label(name_ja_full)
        if e["kind"] == "pokemon":
            dex = int(re.match(r"\d+", fid).group(0))
            sp = species.get(dex, {})
            cid = f"p{dex:04d}"
            if cid not in characters:
                characters[cid] = {"id": cid, "kind": "pokemon", "dex": dex,
                                   "nameEn": sp.get("en") or base_ja, "nameJa": sp.get("ja") or base_ja,
                                   "figures": []}
            en_name = sp.get("en") or base_ja
            if base_ja.startswith("メガ") and not (sp.get("ja") or "").startswith("メガ"):
                lab_ja = (lab_ja + " " if lab_ja else "") + "メガ"
                lab_en = "Mega " + en_name
            else:
                lab_en = label_en(lab_ja)
            ja2en[base_ja] = ("Mega " + en_name) if base_ja.startswith("メガ") and dex != 154 else en_name
        else:
            base = fid.split("_")[0]
            cid = "t-" + base
            en_name = TRAINERS.get(base, base.title())
            if cid not in characters:
                characters[cid] = {"id": cid, "kind": "trainer", "dex": None,
                                   "nameEn": en_name, "nameJa": base_ja, "figures": []}
            lab_en = label_en(lab_ja)
            ja2en.setdefault(base_ja, en_name)
        characters[cid]["figures"].append(fid)
        fig_out.append({"id": fid, "characterId": cid, "kind": e["kind"],
                        "nameJa": name_ja_full, "labelJa": lab_ja, "labelEn": lab_en,
                        "heightCm": (float(re.sub(r"[^\d.]", "", d["height"])) if d["height"] and re.search(r"\d", d["height"]) else None),
                        "source": d["url"], "has360": d["has360"],
                        "_img": d["img"], "_btn": e["btn"],
                        "productIds": [product_id(p["image"], p["url"]) for p in d["products"]]})
    ja2en["メガニウム"] = "Meganium"

    # ---- products
    print(f"4/5 Reading {len(raw_products)} product pages (cached after first run) ...")
    products = {}
    for pid, p in raw_products.items():
        key = pid.split("-")[0]
        if key in URL_OVERRIDES:
            p["url"] = URL_OVERRIDES[key]

    def make_product(pid, p, rerelease=False):
        url = p.get("url") or ""
        store = store_of(url)
        info = {}
        if store == "candy":
            info = read_candy_page(url)
        elif store == "pbandai":
            info = read_pbandai_page(url)
        name_ja = p["nameJa"]
        rel_text = info.get("releaseText") or p.get("releaseText") or info.get("shipText")
        d, y = parse_jdate(rel_text)
        if not d and info.get("orderStart"):
            d, y = info["orderStart"], int(info["orderStart"][:4])
        if not d:  # fall back to year in candy URL path
            m = re.search(r"/products/(20\d\d)/", url)
            if m:
                d, y = m.group(1), int(m.group(1))
        chans = classify_channel(store, name_ja, info.get("shopText"))
        return {
            "id": pid, "nameJa": name_ja, "nameEn": translate_product(name_ja, ja2en),
            "url": url, "store": store, "region": region_of(name_ja) or "special",
            "date": d, "year": y, "dateText": rel_text,
            "channels": chans, "shopTextJa": info.get("shopText"),
            "priceJPY": info.get("priceJPY"), "priceExTax": info.get("priceExTax"),
            "orderStart": info.get("orderStart"),
            "rerelease": rerelease or bool(re.search(r"再受注|再販|定番単品販売|2次受注", name_ja)),
            "priceSource": ("wayback:" + info["archiveTimestamp"]) if info.get("archiveTimestamp") else (
                "bandai-candy" if store == "candy" and info.get("priceJPY") else None),
            "_image": p["image"],
        }

    for n, (pid, p) in enumerate(sorted(raw_products.items()), 1):
        if n % 25 == 0:
            print(f"    {n}/{len(raw_products)}")
        products[pid] = make_product(pid, p)

    # boxes of a candy wave ("<wave>-<box>") inherit the wave's date when their page has none
    for pid, p in products.items():
        parent = products.get(pid.split("-")[0])
        if not p["date"] and parent and parent is not p and parent["date"]:
            p["date"], p["year"], p["dateText"] = parent["date"], parent["year"], parent["dateText"]

    # ---- candy-aisle re-releases recorded on Bulbapedia but not linked by the official dex
    url2pids = {}
    for pid, p in products.items():
        url2pids.setdefault(p["url"], []).append(pid)
    added = 0
    for group in bulbapedia_rereleases():
        known = [u for u in group if u in url2pids]
        if not known:
            continue
        base_pids = set(url2pids[known[0]])
        base = products[sorted(base_pids)[0]]
        for u in group:
            if u in url2pids:
                continue
            digits = re.search(r"/(\d+)\.html", u).group(1)
            # bandai.co.jp mirrors Premium Bandai items under the same number: not a new release
            if digits in products or any(f"item-{digits}/" in x for x in url2pids):
                continue
            new_id = "c" + digits
            name = candy_title(u) or base["nameJa"]
            products[new_id] = make_product(new_id, {"url": u, "nameJa": name, "image": base["_image"]}, rerelease=True)
            url2pids[u] = [new_id]
            for f in fig_out:
                if base_pids & set(f["productIds"]) and new_id not in f["productIds"]:
                    f["productIds"].append(new_id)
            added += 1
    print(f"    + {added} candy re-releases from Bulbapedia")

    # ---- products the official dex does not list yet (Bandai Candy brand page).
    #      Figures already in the dex get the product added; new ones get an "x" id.
    nfkc = lambda s: unicodedata.normalize("NFKC", s or "")
    ja2dex = {nfkc(sp["ja"]): sid for sid, sp in species.items() if sp.get("ja")}
    trainer_by_ja = {c["nameJa"]: cid for cid, c in characters.items() if c["kind"] == "trainer"}
    figs_by_char = {}
    for f in fig_out:
        figs_by_char.setdefault(f["characterId"], []).append(f)
    known_digits = set()
    for pid, p in products.items():
        known_digits.add(pid.split("-")[0].lstrip("c"))
        known_digits.update(re.findall(r"(\d{10,16})", p["url"]))
    squash = lambda s: re.sub(r"\s+", "", s or "").replace("（", "(").replace("）", ")").lower()
    bare = lambda s: re.sub(r"[\s【】（）()\[\]]+", "", s or "")
    is_reorder = lambda s: bool(re.search(r"再受注|再販|2次受注", s))
    known_names = {bare(p["nameJa"]): set() for p in products.values()}
    for p in products.values():
        known_names[bare(p["nameJa"])].add(p["year"])

    def resolve(name):
        """'メガリザードンX' -> (character id, labelJa, labelEn) or None."""
        base, lab = split_label(name)
        if not lab and " " in base:
            base, lab = base.split(" ", 1)
        mega, suffix = False, ""
        if base.startswith("メガ") and nfkc(base) not in ja2dex:
            mega, base = True, base[2:]
            m = re.match(r"^(.*?)([XY])$", base)
            if m and nfkc(m.group(1)) in ja2dex:
                base, suffix = m.group(1), m.group(2)
        if nfkc(base) in ja2dex:
            dex = ja2dex[nfkc(base)]
            base = species[dex].get("ja") or base
            cid = f"p{dex:04d}"
            en = species[dex].get("en") or base
            if cid not in characters:
                characters[cid] = {"id": cid, "kind": "pokemon", "dex": dex, "nameEn": en, "nameJa": base, "figures": []}
            if mega:
                lab_ja = "メガ" + (" " + suffix if suffix else "") + (" " + lab if lab else "")
                lab_en = "Mega " + en + (" " + suffix if suffix else "") + (" " + label_en(lab) if lab else "")
                ja2en.setdefault("メガ" + base + suffix, lab_en)
            else:
                lab_ja, lab_en = lab, label_en(lab)
            return cid, "pokemon", lab_ja, lab_en
        cid = trainer_by_ja.get(base)
        if not cid and base in NEW_TRAINERS:
            tid, en = NEW_TRAINERS[base]
            cid = "t-" + tid
            characters[cid] = {"id": cid, "kind": "trainer", "dex": None, "nameEn": en, "nameJa": base, "figures": []}
            trainer_by_ja[base] = cid
            ja2en.setdefault(base, en)
        if cid:
            return cid, "trainer", lab, label_en(lab)
        return None

    added_p = added_f = 0
    for url in read_brand_list():
        digits = re.search(r"/(\d+)\.html", url).group(1)
        if digits in known_digits:
            continue
        b = read_brand_page(url)
        if not b or not b.get("nameJa"):
            continue
        pid = digits if len(digits) <= 10 else "c" + digits
        p = make_product(pid, {"url": url, "nameJa": b["nameJa"], "image": b["image"]})
        seen = known_names.get(bare(p["nameJa"]))
        if seen is not None and (not is_reorder(p["nameJa"]) or p["year"] in seen):
            continue  # same product under another URL
        if "プレミアムバンダイ" in b["route"] or "発送" in (p["dateText"] or "") or len(digits) == 10:
            p["channels"] = ["pbandai_std" if "定番単品販売" in p["nameJa"] else "pbandai"]
            if "ポケモンセンター" in b["route"] or "ポケモンセンター" in p["nameJa"]:
                p["channels"].append("pokecen")
        products[pid] = p
        known_digits.add(digits)
        added_p += 1
        for k, name in enumerate(b["figureNames"], 1):
            r = resolve(name)
            if not r:
                print("   ! unknown figure name on", url, ":", name)
                continue
            cid, kind, lab_ja, lab_en = r
            match = next((f for f in figs_by_char.get(cid, []) if squash(f["labelJa"]) == squash(lab_ja)), None)
            if match:
                if pid not in match["productIds"]:
                    match["productIds"].append(pid)
                continue
            base_name = split_label(name)[0]
            sizes = b["sizes"]
            h = sizes.get(name) or sizes.get(base_name) or (
                next(iter(sizes.values())) if len(b["figureNames"]) == 1 and sizes else None)
            fid = f"x{digits}_{k}"
            f = {"id": fid, "characterId": cid, "kind": kind, "nameJa": name, "labelJa": lab_ja, "labelEn": lab_en,
                 "heightCm": h, "source": url, "has360": False, "_img": b["image"], "_btn": None, "productIds": [pid]}
            fig_out.append(f)
            figs_by_char.setdefault(cid, []).append(f)
            characters[cid]["figures"].append(fid)
            added_f += 1
    print(f"    + {added_p} products and {added_f} figures from the Bandai Candy brand page")

    # ---- re-release flags: a product is a re-release for a figure if an
    #      earlier product already contained that figure.
    for f in fig_out:
        ps = sorted((products[x] for x in f["productIds"] if x in products),
                    key=lambda p: (p["date"] or "9999"))
        f["productIds"] = [p["id"] for p in ps]
        regions = [p["region"] for p in ps if p["region"] != "special"]
        f["region"] = regions[0] if regions else (ps[0]["region"] if ps else "special")
        f["regions"] = sorted(set(regions or [f["region"]]), key=[r[0] for r in REGIONS].index)
        f["firstYear"] = next((p["year"] for p in ps if p["year"]), None)

    # ---- images
    if want_images:
        print("5/5 Downloading images ...")
        for i, f in enumerate(fig_out, 1):
            if i % 50 == 0:
                print(f"    figures {i}/{len(fig_out)}")
            f["image"] = save_image(f["_img"], "figures", f["id"])
            f["imageTrim"] = trim_image(f["image"], f["id"])
        for i, p in enumerate(products.values(), 1):
            if i % 50 == 0:
                print(f"    products {i}/{len(products)}")
            p["image"] = save_image(p["_image"], "products", p["id"])
    for f in fig_out:
        f["imageUrl"] = f.pop("_img")
        f.pop("_btn", None)
    for p in products.values():
        p["imageUrl"] = p.pop("_image")

    # ---- trainer roles (hand-mapped) and display order (Bulbapedia's trainer list)
    order = {n: k for k, n in enumerate(bulbapedia_trainer_order())}
    unlisted = [c["nameEn"] for c in characters.values() if c["kind"] == "trainer" and c["nameEn"] not in order]
    if unlisted:
        print("   trainers not in Bulbapedia's list (sorted after it):", ", ".join(unlisted))
    for c in characters.values():
        if c["kind"] == "trainer":
            c["roles"] = TRAINER_ROLES.get(c["id"][2:], [])
            c["order"] = order.get(c["nameEn"])
            if not c["roles"]:
                print("   ! no role in TRAINER_ROLES for", c["id"], c["nameEn"])

    # ---- types and evolution lines (PokeAPI)
    evo_sp, forms, type_names = load_pokeapi()
    for c in characters.values():
        if c["kind"] != "pokemon":
            continue
        c["types"] = form_types(forms, c["dex"], None)
        c["chain"] = evo_sp.get(c["dex"], {}).get("chain")
    for f in fig_out:
        c = characters[f["characterId"]]
        if c["kind"] == "pokemon" and f["labelEn"]:
            t = form_types(forms, c["dex"], f["labelEn"])
            if t != c["types"]:
                f["types"] = t
    chains, chain_names = {}, {}
    wanted = {c["chain"] for c in characters.values() if c.get("chain")}
    for sid, s in sorted(evo_sp.items()):
        if s["chain"] in wanted:
            chains.setdefault(str(s["chain"]), []).append([sid, s["from"]])
            if f"p{sid:04d}" not in characters and sid in species:
                chain_names[str(sid)] = [species[sid].get("en"), species[sid].get("ja")]
    chains = {k: v for k, v in chains.items() if len(v) > 1}

    used = {r for f in fig_out for r in f["regions"]}
    data = {
        "schema": 1,
        "generated": date.today().isoformat(),
        "sources": {
            "officialDex": SITE + "lineup/",
            "officialItems": SITE + "item/",
            "premiumBandai": "p-bandai.jp via web.archive.org (Japan-only site)",
            "names": "PokeAPI pokemon_species_names.csv; trainer names mapped by hand",
        },
        "regions": [{"id": r, "nameEn": en, "nameJa": ja} for r, en, ja in REGIONS if r in used],
        "channels": {k: {"en": v[0], "ja": v[1]} for k, v in CHANNELS.items()},
        "types": type_names,
        "roles": {k: {"en": v[0], "ja": v[1]} for k, v in ROLES.items()},  # trainer "roles": ["gym:rock", ...]
        "evolution": chains,           # chain id -> [[dex, evolves from dex], ...]
        "speciesNames": chain_names,   # dex -> [en, ja] for chain members without a figure
        "characters": sorted(characters.values(),
                             key=lambda c: (c["kind"] != "pokemon", c["dex"] or 0, c["id"])),
        "figures": fig_out,
        "products": sorted(products.values(), key=lambda p: (p["date"] or "9999", p["id"])),
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, "scaledex.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)

    # ---- report
    np = len(products)
    print(f"\nWrote {out}")
    print(f"  characters {len(characters)}  figures {len(fig_out)}  products {np}")
    print(f"  products with price {sum(1 for p in products.values() if p['priceJPY'])}/{np}, "
          f"with date {sum(1 for p in products.values() if p['date'])}/{np}")
    miss = [p for p in products.values() if not p["priceJPY"]]
    if miss:
        print("  missing price:")
        for p in miss[:40]:
            print("   -", p["id"], p["nameJa"], p["url"])


if __name__ == "__main__":
    main()
