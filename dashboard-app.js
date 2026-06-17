/*
 * Arkoris — Dashboard SPA (Discord-native redesign, live)
 * ------------------------------------------------------------
 * This IS the customer dashboard. It started as the dashboard-next
 * preview fork and was merged back once approved; the design layer
 * lives in dashboard.css (scoped under body.dash-app).
 *
 * Renders ~20 module pages from a single backend schema endpoint.
 * Talks to the bot's Express server (Square Cloud) over fetch +
 * cookies. No secrets in this file.
 *
 * Loads after dashboard-boot.js which provides a 4-second safety
 * timer in case this script fails to boot.
 */

(function () {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  const API_BASE = (cfg.backendApiUrl || "").replace(/\/$/, "");
  const root = document.getElementById("dashboard-root");
  if (!root) return;

  window.__DASH_TOUCHED__ = true;

  const DEBUG = false; // keep internal API wiring out of the production console
  if (DEBUG) {
    console.log("[dashboard] backendApiUrl:", cfg.backendApiUrl || "(empty)");
    console.log("[dashboard] resolved API_BASE:", API_BASE || "(empty)");
  }

  /* ============================================================
     API client with timeout + structured errors
     ============================================================ */
  const API_TIMEOUT_MS = 8000;

  // CSRF double-submit header for state-changing calls. The token comes from
  // GET /auth/csrf (session-bound, backend-minted). Fails OPEN: if the route
  // doesn't exist yet (older backend) we simply send no header — the backend's
  // sameSite=Lax cookie + Origin guard still protect, and nothing breaks.
  const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  let csrfToken = "";
  async function getCsrfToken() {
    if (csrfToken) return csrfToken;
    try {
      const res = await fetch(API_BASE + "/auth/csrf", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return "";
      const body = await res.json().catch(() => null);
      csrfToken = (body && typeof body.csrfToken === "string" && body.csrfToken) || "";
      return csrfToken;
    } catch {
      return "";
    }
  }

  async function api(path, opts) {
    opts = opts || {};
    // API_BASE is empty in production — requests go to this origin's
    // /api/* and /auth/* paths, which Cloudflare Pages Functions proxy
    // to the backend. An absolute API_BASE is only used for local dev.
    const url = API_BASE + path;
    const method = (opts.method || "GET").toUpperCase();
    const headers = opts.body
      ? { "Content-Type": "application/json", Accept: "application/json" }
      : { Accept: "application/json" };
    if (UNSAFE_METHODS.has(method)) {
      const token = await getCsrfToken();
      if (token) headers["X-Arkoris-CSRF"] = token;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        method,
        credentials: "include",
        signal: ctrl.signal,
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e?.name === "AbortError") throw Object.assign(new Error("Backend timed out"), { code: "timeout" });
      throw Object.assign(new Error("Backend unreachable"), { code: "network" });
    }
    clearTimeout(timer);
    const ct = res.headers.get("content-type") || "";
    let body = null;
    try {
      if (ct.includes("application/json")) body = await res.json();
      else { const t = await res.text(); body = t ? { error: t.slice(0, 200) } : null; }
    } catch {}
    if (DEBUG) console.log(`[dashboard] ${path} → ${res.status}`, body || "");
    if (res.ok) return body;
    // Stale/missing CSRF token → refresh it once and retry the call.
    if (res.status === 403 && body?.error === "csrf_failed" && !opts._csrfRetry) {
      csrfToken = "";
      return api(path, Object.assign({}, opts, { _csrfRetry: true }));
    }
    // Only ever surface STRING candidates — a structured {error:{...}} payload
    // would otherwise coerce into the user-visible "[object Object]".
    const msg = [body?.error, body?.message, res.statusText].find((v) => typeof v === "string" && v) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.code = res.status;
    err.data = body;
    throw err;
  }

  /* ============================================================
     Icon library — small inline SVGs keyed by name.
     ------------------------------------------------------------
     Kept minimal (24x24 stroke icons) so we don't ship an icon
     library just for the dashboard. Use icon(name, opts?) to get
     a <span class="dash-tab-ico"> wrapping the SVG, or call
     iconSvg(name) for the raw SVG element.
  */
  const ICON_PATHS = {
    // Layout / nav
    grid:      'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    list:      'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    activity:  'M22 12h-4l-3 9L9 3l-3 9H2',
    flag:      'M4 22V4l9 5-9 5M4 4l16 6-16 6',
    // Modules
    hand:      'M9 11V6a2 2 0 1 1 4 0v5M13 11V4a2 2 0 1 1 4 0v9M17 11V7a2 2 0 1 1 4 0v10a6 6 0 0 1-6 6h-2a8 8 0 0 1-8-8v-3a2 2 0 0 1 4 0v4',
    shield:    'M12 2L4 5v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V5l-8-3z',
    palette:   'M12 2a10 10 0 1 0 10 10c0-1.66-1.34-3-3-3h-2a3 3 0 0 1-3-3V4a2 2 0 0 0-2-2z',
    masks:     'M8 4a4 4 0 0 0-4 4v3a6 6 0 0 0 12 0V8a4 4 0 0 0-4-4zM4 11s2 2 8 2 8-2 8-2',
    poll:      'M3 3v18h18M7 14v4M12 9v9M17 13v5',
    sword:     'M14 14l7 7v-7zM14 14L4 4 4 11l10 10z',
    ticket:    'M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4a2 2 0 0 0 0 4v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4a2 2 0 0 0 0-4z',
    coin:      'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v12M9 9h4.5a2.5 2.5 0 0 1 0 5H9',
    creditCard:'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20',
    wallet:    'M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7V5a2 2 0 0 1 2-2h12v4M17 13h3',
    flame:     'M14 2c0 6 4 7 4 12a6 6 0 1 1-12 0c0-4 3-5 3-9 2 2 2 4 5 6 0-3 0-6 0-9z',
    trophy:    'M8 4h8v4a4 4 0 0 1-8 0zM4 6h4M16 6h4M12 12v4M8 20h8',
    gift:      'M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7',
    calendar:  'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 2v4M16 2v4',
    template:  'M3 3h18v4H3zM3 11h7v10H3zM14 11h7v10h-7z',
    fileText:  'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6',
    lifeRing:  'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5M19.1 4.9l-3.5 3.5M8.4 15.6l-3.5 3.5',
    cog:       'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82h0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    // Utility / state
    lock:      'M5 11a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 9V7a4 4 0 1 1 8 0v2',
    sparkle:   'M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M5 19l4-4M15 9l4-4',
    terminal:  'M4 17l6-5-6-5M12 19h8',
    arrowRight:'M5 12h14M13 5l7 7-7 7',
    check:     'M20 6L9 17l-5-5',
    chevron:   'M6 9l6 6 6-6',
    menu:      'M3 6h18M3 12h18M3 18h18',
    user:      'M20 21a8 8 0 1 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
    logout:    'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    refresh:   'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
    plug:      'M9 2v6M15 2v6M5 8h14v4a7 7 0 0 1-14 0zM12 19v3',
    search:    'M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z',
  };
  function iconSvg(name) {
    const d = ICON_PATHS[name] || ICON_PATHS.list;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
    return svg;
  }
  function icon(name, cls) {
    const wrap = h("span", { class: cls || "dash-tab-ico" });
    wrap.appendChild(iconSvg(name));
    return wrap;
  }

  // Map every dashboard tab to an icon
  const TAB_ICONS = {
    "setup-hub":  "grid",
    overview:     "activity",
    analytics:    "poll",
    ark:          "shield",
    welcome:      "hand",
    autoRoles:    "shield",
    roleMenus:    "masks",
    customCommands: "terminal",
    polls:        "poll",
    moderation:   "shield",
    xp:           "trophy",
    tickets:      "ticket",
    payments:     "creditCard",
    staffPay:     "wallet",
    hype:         "flame",
    events:       "calendar",
    branding:     "palette",
    serverTemplates: "template",
    "embed-builder": "sparkle",
    logs:         "fileText",
    premium:      "sparkle",
    audit:        "fileText",
    support:      "lifeRing",
  };
  function tabIcon(id) { return icon(TAB_ICONS[id] || "list"); }

  /* ============================================================
     DOM helpers
     ============================================================ */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach((cc) => cc != null && cc !== false && el.append(cc.nodeType ? cc : document.createTextNode(cc)));
      else el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---- Emoji picker (used by the Embed Builder button/option emoji fields) ----
  const EMOJI_CATS = [
    { key: "smileys", name: "Smileys", icon: "😀", emojis: [["😀","grin"],["😃","smile happy"],["😄","laugh"],["😁","grin"],["😆","laugh"],["😅","sweat"],["😂","joy lol"],["🤣","rofl lol"],["🙂","slight smile"],["🙃","upside"],["😉","wink"],["😊","blush"],["😇","angel"],["🥰","love"],["😍","heart eyes love"],["🤩","star struck"],["😘","kiss"],["😗","kiss"],["😋","yum"],["😛","tongue"],["😜","wink tongue"],["🤪","zany"],["😝","tongue"],["🤑","money"],["🤗","hug"],["🤭","giggle"],["🤫","shh quiet"],["🤔","thinking"],["🤐","zip"],["🤨","raised brow"],["😐","neutral"],["😑","expressionless"],["😶","no mouth"],["😏","smirk"],["😒","unamused"],["🙄","eye roll"],["😬","grimace"],["😌","relieved"],["😔","pensive sad"],["😪","sleepy"],["🤤","drool"],["😴","sleep zzz"],["😷","mask sick"],["🤒","sick"],["🤕","hurt"],["🤢","nauseous"],["🤮","vomit"],["🤧","sneeze"],["🥵","hot"],["🥶","cold"],["🥳","party"],["😎","cool sunglasses"],["🤓","nerd"],["🧐","monocle"],["😕","confused"],["😟","worried"],["🙁","frown"],["☹️","frown"],["😮","wow"],["😲","astonished"],["😳","flushed"],["🥺","pleading"],["😨","fear"],["😰","anxious"],["😥","sad"],["😢","cry"],["😭","sob cry"],["😱","scream"],["😖","confounded"],["😞","disappointed"],["😩","weary"],["😫","tired"],["🥱","yawn"],["😤","triumph"],["😡","rage angry mad"],["😠","angry mad"],["🤬","cursing"],["😈","devil"],["👿","imp angry"],["💀","skull dead"],["☠️","skull"],["💩","poop"],["🤡","clown"],["👻","ghost"],["👽","alien"],["👾","invader"],["🤖","robot"],["🎃","pumpkin"]] },
    { key: "gestures", name: "Gestures & People", icon: "👍", emojis: [["👍","thumbs up like yes"],["👎","thumbs down no"],["👌","ok"],["🤌","pinch"],["🤏","small"],["✌️","peace victory"],["🤞","fingers crossed"],["🤟","love you"],["🤘","rock"],["🤙","call"],["👈","left"],["👉","right"],["👆","up"],["👇","down"],["☝️","point up"],["✋","raise hand stop"],["🤚","back hand"],["🖐️","hand"],["🖖","vulcan"],["👋","wave hi bye"],["🤝","handshake deal"],["🙏","pray thanks please"],["✍️","write"],["💪","muscle strong"],["🦾","mechanical arm"],["🙌","raise hands praise"],["👏","clap"],["🤲","palms"],["🙇","bow"],["🤦","facepalm"],["🤷","shrug"],["🧠","brain"],["👀","eyes look"],["👁️","eye"],["👶","baby"],["🧑","person"],["👑","crown king"],["🎩","top hat"],["🦸","hero"],["🦹","villain"]] },
    { key: "hearts", name: "Hearts & Symbols", icon: "❤️", emojis: [["❤️","red heart love"],["🧡","orange heart"],["💛","yellow heart"],["💚","green heart"],["💙","blue heart"],["💜","purple heart"],["🖤","black heart"],["🤍","white heart"],["🤎","brown heart"],["💔","broken heart"],["❣️","heart"],["💕","hearts"],["💞","hearts"],["💓","beating heart"],["💗","growing heart"],["💖","sparkle heart"],["💘","cupid"],["💝","gift heart"],["💟","heart deco"],["💯","100 perfect"],["✨","sparkles"],["⭐","star"],["🌟","glowing star"],["💫","dizzy star"],["⚡","lightning bolt"],["🔥","fire lit hot"],["💥","boom"],["💢","anger"],["💦","sweat drops"],["💨","dash wind"],["💬","speech"],["💭","thought"],["✅","check yes done"],["❌","cross no"],["❓","question"],["❗","exclamation"],["⚠️","warning"],["🚫","no ban"],["♻️","recycle"],["🔞","18"],["✔️","check"],["➕","plus"],["➖","minus"],["💲","dollar"],["🔱","trident"],["⚜️","fleur"]] },
    { key: "objects", name: "Objects", icon: "🎮", emojis: [["🎮","game controller"],["🕹️","joystick"],["🎲","dice"],["🎯","dart target"],["🎰","slot"],["🏆","trophy win"],["🥇","gold medal first"],["🥈","silver medal"],["🥉","bronze medal"],["🏅","medal"],["🎁","gift present"],["🎉","party tada"],["🎊","confetti"],["🎈","balloon"],["🔔","bell"],["🔕","mute bell"],["📣","megaphone"],["📢","loud"],["💡","idea bulb"],["🔦","flashlight"],["💰","money bag"],["💵","cash"],["💎","gem diamond"],["🔑","key"],["🗝️","old key"],["🔒","lock"],["🔓","unlock"],["🛡️","shield"],["⚔️","swords"],["🗡️","dagger"],["🏹","bow arrow"],["🔨","hammer"],["🛠️","tools"],["⚙️","gear settings"],["🔧","wrench"],["📌","pin"],["📍","location pin"],["📎","clip"],["✂️","scissors"],["📅","calendar"],["📊","bar chart"],["📈","chart up"],["📉","chart down"],["📜","scroll rules"],["📝","memo note"],["📁","folder"],["💻","laptop"],["🖥️","desktop"],["📱","phone"],["⌚","watch"],["🎵","music note"],["🎶","music"]] },
    { key: "nature", name: "Nature", icon: "🌿", emojis: [["🌿","herb leaf"],["🍀","clover luck"],["🌱","seedling"],["🌲","tree"],["🌳","tree"],["🌵","cactus"],["🌴","palm"],["🌸","blossom"],["🌹","rose"],["🌺","hibiscus"],["🌻","sunflower"],["🌼","flower"],["💐","bouquet"],["🍁","maple leaf"],["🍂","leaves"],["🌍","earth globe"],["🌙","moon"],["☀️","sun"],["⛅","cloud sun"],["☁️","cloud"],["🌧️","rain"],["⛈️","storm"],["❄️","snow"],["🌊","wave water"],["🐶","dog"],["🐱","cat"],["🦊","fox"],["🐺","wolf"],["🐉","dragon"],["🦁","lion"],["🐻","bear"],["🦅","eagle"]] },
    { key: "food", name: "Food & Drink", icon: "🍕", emojis: [["🍎","apple"],["🍕","pizza"],["🍔","burger"],["🍟","fries"],["🌭","hotdog"],["🍿","popcorn"],["🍩","donut"],["🍪","cookie"],["🎂","cake birthday"],["🍰","cake"],["🧁","cupcake"],["🍫","chocolate"],["🍬","candy"],["🍭","lollipop"],["🍺","beer"],["🍻","beers cheers"],["🥤","drink soda"],["☕","coffee"],["🍷","wine"],["🍸","cocktail"],["🥂","champagne cheers"],["🍒","cherry"],["🍓","strawberry"],["🍉","watermelon"],["🍇","grapes"],["🌮","taco"]] },
    { key: "travel", name: "Travel & Places", icon: "🚀", emojis: [["🚀","rocket launch"],["🛸","ufo"],["✈️","plane"],["🚁","helicopter"],["🚗","car"],["🏎️","race car"],["🏍️","motorcycle"],["⛵","sailboat"],["🚤","speedboat"],["🗺️","map"],["🧭","compass"],["🏝️","island"],["🏔️","mountain"],["🌋","volcano"],["🏕️","camp"],["🏰","castle"],["🗼","tower"],["🎡","ferris wheel"],["🎢","roller coaster"],["⛺","tent"],["🌐","globe web"]] },
    { key: "activity", name: "Activity & Sports", icon: "⚽", emojis: [["⚽","soccer football"],["🏀","basketball"],["🏈","football"],["⚾","baseball"],["🎾","tennis"],["🏐","volleyball"],["🎱","8ball pool"],["🥊","boxing"],["🎣","fishing"],["🎸","guitar"],["🎹","piano"],["🥁","drums"],["🎤","mic sing"],["🎧","headphones"],["🎬","movie film"],["🏆","trophy"],["🎯","target"],["🏹","archery"],["🎳","bowling"],["🛹","skateboard"],["⛳","golf"]] },
  ];
  let _ebEmojiPanel = null, _ebEmojiAnchor = null;
  // NOTE: the codebase already has a separate openEmojiPicker/closeEmojiPicker
  // (Role Menus, input-target based). These are DISTINCT names on purpose — do
  // not rename them back or they'll collide (function declarations hoist).
  function ebEmojiPickerClose() {
    if (!_ebEmojiPanel) return;
    _ebEmojiPanel.remove(); _ebEmojiPanel = null; _ebEmojiAnchor = null;
    document.removeEventListener("mousedown", _ebEmojiOutside, true);
    document.removeEventListener("keydown", _ebEmojiKeydown, true);
    window.removeEventListener("scroll", _ebEmojiScroll, true);
  }
  function _ebEmojiOutside(e) { if (_ebEmojiPanel && !_ebEmojiPanel.contains(e.target) && !(e.target.closest && e.target.closest(".eb-emoji-trigger"))) ebEmojiPickerClose(); }
  function _ebEmojiKeydown(e) { if (e.key === "Escape") ebEmojiPickerClose(); }
  // Close only when the PAGE scrolls (anchor moves), NOT when the user scrolls
  // the emoji grid itself to browse.
  function _ebEmojiScroll(e) { const t = e.target; if (_ebEmojiPanel && !(t && t.nodeType === 1 && _ebEmojiPanel.contains(t))) ebEmojiPickerClose(); }
  function ebEmojiPickerOpen(anchor, current, onPick) {
    ebEmojiPickerClose();
    const grid = h("div", { class: "eb-emoji-grid" });
    function renderGrid(filter) {
      clear(grid);
      const f = (filter || "").trim().toLowerCase();
      // This server's custom emojis first (rendered as images).
      const custom = (_ebGuildEmojis || []).filter((ce) => !f || ce.name.toLowerCase().indexOf(f) !== -1);
      if (custom.length) {
        grid.append(h("div", { class: "eb-emoji-cat-h", "data-cat": "server" }, "Server"));
        const crow = h("div", { class: "eb-emoji-cat-grid" });
        custom.forEach((ce) => { const tok = ebEmojiToken(ce); crow.append(h("button", { type: "button", class: "eb-emoji-cell" + (tok === current ? " sel" : ""), title: ":" + ce.name + ":", onclick: () => { onPick(tok); ebEmojiPickerClose(); } }, h("img", { class: "eb-emoji-cimg", src: ebCustomEmojiSrc(ce), alt: ce.name, onerror: "this.replaceWith(document.createTextNode(':'+this.alt+':'))" }))); });
        grid.append(crow);
      }
      EMOJI_CATS.forEach((c) => {
        const matches = c.emojis.filter(([e, kw]) => !f || (kw + " " + e).toLowerCase().indexOf(f) !== -1);
        if (!matches.length) return;
        grid.append(h("div", { class: "eb-emoji-cat-h", "data-cat": c.key }, c.name));
        const row = h("div", { class: "eb-emoji-cat-grid" });
        matches.forEach(([e]) => row.append(h("button", { type: "button", class: "eb-emoji-cell" + (e === current ? " sel" : ""), title: e, onclick: () => { onPick(e); ebEmojiPickerClose(); } }, e)));
        grid.append(row);
      });
      if (!grid.children.length) grid.append(h("div", { class: "eb-emoji-empty" }, "No emoji found"));
    }
    const search = h("input", { class: "eb-emoji-search", type: "text", placeholder: "Search emoji…", spellcheck: "false" });
    search.addEventListener("input", () => renderGrid(search.value));
    const jumpTo = (key) => { const head = grid.querySelector('[data-cat="' + key + '"]'); if (head) head.scrollIntoView({ block: "start" }); };
    const cats = h("div", { class: "eb-emoji-cats" },
      (_ebGuildEmojis && _ebGuildEmojis.length) ? h("button", { type: "button", class: "eb-emoji-cat-btn", title: "Server", onclick: () => jumpTo("server") }, "🏠") : null,
      ...EMOJI_CATS.map((c) => h("button", { type: "button", class: "eb-emoji-cat-btn", title: c.name, onclick: () => jumpTo(c.key) }, c.icon)));
    const foot = h("div", { class: "eb-emoji-foot" },
      h("input", { class: "eb-emoji-custom", type: "text", placeholder: "Custom: <:name:id>", value: /^<a?:/.test(current || "") ? current : "", onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); onPick(e.target.value.trim()); ebEmojiPickerClose(); } } }),
      h("button", { type: "button", class: "eb-emoji-clear", onclick: () => { onPick(""); ebEmojiPickerClose(); } }, "Clear"));
    const panel = h("div", { class: "eb-emoji-pop" }, search, cats, grid, foot);
    document.body.appendChild(panel);
    renderGrid("");
    const r = anchor.getBoundingClientRect();
    const pw = 300, ph = panel.offsetHeight || 340;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
    let top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    panel.style.left = left + "px"; panel.style.top = top + "px";
    _ebEmojiPanel = panel; _ebEmojiAnchor = anchor;
    try { search.focus(); } catch (_) {}
    setTimeout(() => {
      document.addEventListener("mousedown", _ebEmojiOutside, true);
      document.addEventListener("keydown", _ebEmojiKeydown, true);
      window.addEventListener("scroll", _ebEmojiScroll, true);
    }, 0);
  }
  // Custom Discord emoji helpers. A custom emoji is "<:name:id>" / "<a:name:id>".
  let _ebGuildEmojis = []; // [{id,name,animated}] for the current guild
  function ebParseEmoji(v) { const m = /^<(a)?:([^:]+):(\d+)>$/.exec(v || ""); return m ? { animated: !!m[1], name: m[2], id: m[3] } : null; }
  function ebCustomEmojiSrc(p) { return "https://cdn.discordapp.com/emojis/" + p.id + (p.animated ? ".gif" : ".png") + "?size=48"; }
  function ebEmojiToken(ce) { return (ce.animated ? "<a:" : "<:") + ce.name + ":" + ce.id + ">"; }
  // Render an emoji value as a node: an <img> for custom emojis, else text.
  function ebEmojiNode(v, cls) { const p = ebParseEmoji(v); if (p) return h("img", { class: cls || "eb-cemoji", src: ebCustomEmojiSrc(p), alt: ":" + p.name + ":", title: ":" + p.name + ":", onerror: "this.replaceWith(document.createTextNode(this.alt))" }); return document.createTextNode(v || ""); }
  // An emoji-input control: a trigger button that opens the picker. get/set bind
  // the model; onChange runs after a pick (re-render). Works in canvas + form.
  function ebEmojiField(get, set, onChange) {
    const trigger = h("button", { type: "button", class: "eb-emoji-trigger", title: "Pick an emoji", "aria-label": "Pick an emoji" });
    function setTrig(v) { clear(trigger); const p = ebParseEmoji(v); if (p) trigger.append(h("img", { class: "eb-emoji-trig-img", src: ebCustomEmojiSrc(p), alt: ":" + p.name + ":", onerror: "this.replaceWith(document.createTextNode('🔣'))" })); else trigger.textContent = v || "🙂"; trigger.classList.toggle("empty", !v); }
    setTrig(get() || "");
    trigger.onclick = (ev) => {
      ev.stopPropagation();
      if (_ebEmojiPanel && _ebEmojiAnchor === trigger) { ebEmojiPickerClose(); return; }
      ebEmojiPickerOpen(trigger, get() || "", (v) => { set(v); setTrig(v); if (onChange) onChange(); });
    };
    return h("span", { class: "eb-emoji-field" }, trigger);
  }

  function userAvatar(u) {
    if (u.avatar) return h("div", { class: "dash-avatar" }, h("img", { src: `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`, alt: "" }));
    return h("div", { class: "dash-avatar" }, (u.username || "U").charAt(0).toUpperCase());
  }
  function guildIcon(g) {
    if (g.icon) return h("div", { class: "gico" }, h("img", { src: `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`, alt: "" }));
    const initials = (g.name || "?").split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
    return h("div", { class: "gico" }, initials);
  }
  function notice(kind, title, detail) {
    return h("div", { class: `dash-notice ${kind}` },
      h("span", { class: "ni" }, kind === "warn" ? "!" : kind === "error" ? "✕" : kind === "success" ? "✓" : "i"),
      h("div", null,
        h("div", { style: { fontWeight: "600", marginBottom: detail ? "4px" : "0" } }, title),
        detail ? h("div", { style: { fontSize: "0.86rem", color: "var(--text-muted)" } }, detail) : null
      )
    );
  }
  function btn(label, opts) {
    opts = opts || {};
    return h(opts.href ? "a" : "button", {
      class: `btn ${opts.kind || "btn-primary"}`,
      type: opts.href ? null : "button",
      href: opts.href || null,
      target: opts.external ? "_blank" : null,
      rel: opts.external ? "noopener noreferrer" : null,
      onclick: opts.onclick || null,
      disabled: opts.disabled || null,
    }, label);
  }
  function toast(kind, msg, ms) {
    let host = document.getElementById("dash-toasts");
    if (!host) {
      host = h("div", { id: "dash-toasts" });
      document.body.appendChild(host);
    }
    const t = h("div", { class: `dash-toast ${kind || ""}` }, msg);
    host.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 300);
    }, ms || 3200);
  }

  /* ============================================================
     State
     ============================================================ */
  const state = {
    user: null,
    guilds: [],
    selectedGuildId: null,
    modules: null,         // schema list from /api/dashboard/modules
    channels: null,        // per-selected-guild
    categories: null,      // per-selected-guild (Discord category channels)
    roles: null,           // per-selected-guild
    activeTab: "overview", // module name OR "overview" OR "audit"
  };

  const auth = { loginUrl: () => API_BASE + "/auth/discord/login" };
  const data = {
    me: () => api("/api/dashboard/me"),
    guilds: () => api("/api/dashboard/guilds"),
    modules: () => api("/api/dashboard/modules"),
    overview: (gid) => api(`/api/dashboard/guilds/${gid}/overview`),
    setupOverride: (gid, module, done) =>
      api(`/api/dashboard/guilds/${gid}/setup/override`, { method: "POST", body: { module, done } }),
    module: (gid, name) => api(`/api/dashboard/guilds/${gid}/modules/${name}`),
    saveModule: (gid, name, body) => api(`/api/dashboard/guilds/${gid}/modules/${name}`, { method: "POST", body }),
    resetModule: (gid, name) => api(`/api/dashboard/guilds/${gid}/modules/${name}/reset`, { method: "POST" }),
    quickSetup: (gid, name, body) => api(`/api/dashboard/guilds/${gid}/modules/${name}/quick-setup`, { method: "POST", body: body || {} }),
    analytics: (gid, days) => api(`/api/dashboard/guilds/${gid}/analytics?days=${days || 7}`),
    // On-site premium checkout: creates a PayPal order for this server and returns
    // { approvalUrl } to redirect to. Activation is handled by the bot's webhook.
    subscribe: (gid, plan) => api(`/api/dashboard/guilds/${gid}/subscribe`, { method: "POST", body: plan ? { plan } : undefined }),
    // Recent-activity feed (Overview). The audit LIST page was removed, but
    // this client method must stay — renderOvActivity/renderRecentAuditCard
    // call it; removing it crashed Overview with "data.audit is not a function".
    audit: (gid) => api(`/api/dashboard/guilds/${gid}/audit-log`),
    channels: (gid) => api(`/api/dashboard/guilds/${gid}/discord/channels`),
    categories: (gid) => api(`/api/dashboard/guilds/${gid}/discord/categories`),
    roles: (gid) => api(`/api/dashboard/guilds/${gid}/discord/roles`),
    emojis: (gid) => api(`/api/dashboard/guilds/${gid}/discord/emojis`),
    // Role menu CRUD
    rmList: (gid) => api(`/api/dashboard/guilds/${gid}/role-menus`),
    rmGet: (gid, id) => api(`/api/dashboard/guilds/${gid}/role-menus/${id}`),
    rmCreate: (gid, body) => api(`/api/dashboard/guilds/${gid}/role-menus`, { method: "POST", body }),
    rmUpdate: (gid, id, body) => api(`/api/dashboard/guilds/${gid}/role-menus/${id}`, { method: "PATCH", body }),
    rmDelete: (gid, id) => api(`/api/dashboard/guilds/${gid}/role-menus/${id}`, { method: "DELETE" }),
    rmOptAdd: (gid, id, body) => api(`/api/dashboard/guilds/${gid}/role-menus/${id}/options`, { method: "POST", body }),
    rmOptUpdate: (gid, id, oid, body) => api(`/api/dashboard/guilds/${gid}/role-menus/${id}/options/${oid}`, { method: "PATCH", body }),
    rmOptDelete: (gid, id, oid) => api(`/api/dashboard/guilds/${gid}/role-menus/${id}/options/${oid}`, { method: "DELETE" }),
    rmPost: (gid, id) => api(`/api/dashboard/guilds/${gid}/role-menus/${id}/post`, { method: "POST" }),
    // Custom command CRUD
    ccList: (gid) => api(`/api/dashboard/guilds/${gid}/custom-commands`),
    ccCreate: (gid, body) => api(`/api/dashboard/guilds/${gid}/custom-commands`, { method: "POST", body }),
    ccUpdate: (gid, id, body) => api(`/api/dashboard/guilds/${gid}/custom-commands/${id}`, { method: "PATCH", body }),
    ccDelete: (gid, id) => api(`/api/dashboard/guilds/${gid}/custom-commands/${id}`, { method: "DELETE" }),
    // Staff Tiers (per-role pay amounts) — premium only
    tierList:   (gid)         => api(`/api/dashboard/guilds/${gid}/staff-tiers`),
    tierCreate: (gid, body)   => api(`/api/dashboard/guilds/${gid}/staff-tiers`, { method: "POST", body }),
    tierUpdate: (gid, id, body) => api(`/api/dashboard/guilds/${gid}/staff-tiers/${id}`, { method: "PATCH", body }),
    tierDelete: (gid, id)     => api(`/api/dashboard/guilds/${gid}/staff-tiers/${id}`, { method: "DELETE" }),
    // PayPal config (write-only secrets, masked on read) — premium only
    paypalGet:  (gid)         => api(`/api/dashboard/guilds/${gid}/payments/paypal`),
    paypalSave: (gid, body)   => api(`/api/dashboard/guilds/${gid}/payments/paypal`, { method: "POST", body }),
    paypalTest: (gid)         => api(`/api/dashboard/guilds/${gid}/payments/paypal/test`, { method: "POST" }),
    // ARK Server Suite — read-only live status of linked Nitrado maps
    arkServers: (gid)         => api(`/api/dashboard/guilds/${gid}/ark/servers`),
    // Discord & Game Logs — real recorded activity (counts + recent feed)
    logsRecent: (gid)         => api(`/api/dashboard/guilds/${gid}/logs/recent`),
    // Server templates — catalog + guarded apply
    templates: (gid)          => api(`/api/dashboard/guilds/${gid}/server-templates`),
    templateApply: (gid, id, body) => api(`/api/dashboard/guilds/${gid}/server-templates/${id}/apply`, { method: "POST", body: body || {} }),
    // Embed Builder
    embTplList:   (gid)         => api(`/api/dashboard/guilds/${gid}/embeds/templates`),
    embTplCreate: (gid, body)   => api(`/api/dashboard/guilds/${gid}/embeds/templates`, { method: "POST", body }),
    embTplUpdate: (gid, id, body) => api(`/api/dashboard/guilds/${gid}/embeds/templates/${id}`, { method: "PATCH", body }),
    embTplDelete: (gid, id)     => api(`/api/dashboard/guilds/${gid}/embeds/templates/${id}`, { method: "DELETE" }),
    embDraftGet:  (gid)         => api(`/api/dashboard/guilds/${gid}/embeds/draft`),
    embDraftSave: (gid, draft)  => api(`/api/dashboard/guilds/${gid}/embeds/draft`, { method: "PUT", body: { draft } }),
    embValidate:  (gid, payload) => api(`/api/dashboard/guilds/${gid}/embeds/validate`, { method: "POST", body: { payload } }),
    embSend:      (gid, body)   => api(`/api/dashboard/guilds/${gid}/embeds/send`, { method: "POST", body }),
    embSentList:  (gid)         => api(`/api/dashboard/guilds/${gid}/embeds/sent`),
    embSentDelete: (gid, id)    => api(`/api/dashboard/guilds/${gid}/embeds/sent/${id}`, { method: "DELETE" }),
  };

  /* ============================================================
     Top-level renderers
     ============================================================ */
  function render() {
    if (!state.user) return renderLoggedOut();
    if (!state.selectedGuildId) return renderGuildPicker();
    return renderGuildDashboard();
  }

  function renderNoBackend() {
    clear(root);
    // Premium full-page state — not a tiny notice
    const card = h("div", { class: "picker-empty large" });
    const ico = h("div", { class: "picker-empty-ico" });
    ico.appendChild(iconSvg("plug"));
    card.append(
      ico,
      h("h3", null, "Dashboard backend not connected"),
      h("p", null,
        "The dashboard UI is ready, but the backend API URL isn't configured yet. For now, manage the bot inside Discord with ",
        h("code", null, "/setup"), " and ", h("code", null, "/subscribe"),
        ". Once the backend goes live this page becomes a full control panel."),
      h("div", { class: "dash-actions", style: { justifyContent: "center" } },
        btn("Invite Bot",   { kind: "btn-primary", href: cfg.links?.inviteBot,      external: true }),
        btn("Join Support", { kind: "btn-ghost",   href: cfg.links?.supportDiscord, external: true }),
        btn("View Pricing", { kind: "btn-outline", href: "pricing.html" })
      )
    );
    root.append(card);
    // Also show the marketing-style feature preview + setup guide so the
    // page still feels useful while backend is offline.
    root.append(renderPickerFeaturePreview(), renderPickerSetupGuide());
  }

  // Discord's in-app browser breaks OAuth: the login cookie set at the start
  // of the flow lands in a different browser session than the callback, so
  // login never sticks — the user gets dumped back at this screen.
  function isInAppBrowser() {
    return /Discord|FBAN|FBAV|Instagram|\bLine\b|GSA|\bTwitter\b/i.test(navigator.userAgent || "");
  }
  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent || "");
  }

  function renderLoggedOut() {
    clear(root);
    const card = h("div", { class: "dash-empty-card", style: { maxWidth: "560px", margin: "40px auto" } });
    const ico = h("div", { class: "ico" });
    ico.appendChild(iconSvg("user"));
    card.append(
      ico,
      h("h4", null, "Sign in to your Arkoris dashboard"),
      h("p", null,
        "Manage every module, branding, role menus, staff tiers, events and more — securely synced with your Discord server.")
    );

    // Warn mobile users about Discord's in-app browser — the #1 cause of
    // "I sign in and it sends me right back to the login screen".
    if (isInAppBrowser() || isMobile()) {
      card.append(h("div", {
        style: {
          background: "rgba(241,196,15,0.10)",
          border: "1px solid rgba(241,196,15,0.38)",
          borderRadius: "12px",
          padding: "12px 14px",
          margin: "6px 0 10px",
          fontSize: "0.79rem",
          lineHeight: "1.55",
          textAlign: "left",
          color: "#f4d58d",
        },
      },
        h("strong", null, "⚠️  Opened this from Discord?"),
        h("br"),
        "Discord's built-in browser blocks login from completing — you'll get sent back to this screen. ",
        "Tap the ", h("strong", null, "•••"), " menu in the corner and choose ",
        h("strong", null, "“Open in Safari”"), " / ", h("strong", null, "“Open in Chrome”"),
        ", then sign in from there."
      ));
    }

    card.append(
      h("a", { class: "btn btn-lg",
        href: auth.loginUrl(),
        style: { background: "#5865f2", color: "#fff", boxShadow: "0 8px 24px rgba(88,101,242,0.45)", fontWeight: 700 } },
        "Continue with Discord"),
      h("p", { style: { fontSize: "0.74rem", color: "var(--dash-muted-2)", margin: "16px 0 0" } },
        "We request ", h("code", null, "identify"), ", ", h("code", null, "guilds"), " and ", h("code", null, "connections"), " (to link your Xbox gamertag for /kickmyself) — no message read, no member list.")
    );
    root.append(card);
  }

  // Server-picker local UI state (search query + filter pill)
  const pickerState = { query: "", filter: "all" };

  // Discord-native server picker. A calm "select a server" surface modeled on
  // Discord's own UI: neutral grays, one blurple accent, a vertical list of
  // server rows (health at a glance) instead of a card wall + aside + feature
  // wall. New `.dsx-*` classes (styled in dashboard.css) so styles.css
  // can't fight them.
  function renderGuildPicker() {
    clear(root);
    const wrap = h("div", { class: "dsx-picker" });
    wrap.append(renderPickerHead());

    if (!state.guilds.length) {
      wrap.append(renderPickerEmpty());
      root.append(wrap);
      return;
    }

    wrap.append(renderPickerControls());
    const list = h("div", { class: "dsx-server-list" });
    wrap.append(list);
    paintServerList(list);
    wrap.append(renderPickerFooter());
    root.append(wrap);
  }

  // Discord-styled avatar + server icon (own classes so styles.css can't reach them).
  function dscAvatar(u, size) {
    u = u || {};
    const el = h("div", { class: "dsx-avatar", style: { width: (size || 40) + "px", height: (size || 40) + "px" } });
    if (u.avatar) el.append(h("img", { src: `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`, alt: "" }));
    else el.append(h("span", null, (u.globalName || u.username || "U").charAt(0).toUpperCase()));
    return el;
  }
  function dscGuildIcon(g, size) {
    const el = h("div", { class: "dsx-gicon", style: { width: (size || 48) + "px", height: (size || 48) + "px" } });
    if (g.icon) el.append(h("img", { src: `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`, alt: "" }));
    else {
      const initials = (g.name || "?").split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
      el.append(h("span", null, initials || "?"));
    }
    return el;
  }

  // Head: title + subline on the left, account chip + log out on the right.
  function renderPickerHead() {
    const u = state.user || {};
    const name = u.globalName || u.username || "there";
    const logout = h("button", { type: "button", class: "dsx-icon-btn", title: "Log out", "aria-label": "Log out", onclick: handleLogout });
    logout.append(iconSvg("logout"));
    return h("header", { class: "dsx-pk-head" },
      h("div", { class: "dsx-pk-headline" },
        h("h1", { class: "dsx-pk-title" }, "Your servers"),
        h("p", { class: "dsx-pk-sub" }, `Welcome back, ${name}. Pick a server to manage Arkoris.`)
      ),
      h("div", { class: "dsx-account" },
        h("div", { class: "dsx-account-id" },
          dscAvatar(u, 30),
          h("span", { class: "dsx-account-name" }, u.globalName || u.username || "—")
        ),
        logout
      )
    );
  }

  // Search + segmented filter. Writes to the shared pickerState and repaints.
  function renderPickerControls() {
    const row = h("div", { class: "dsx-controls" });

    const sico = h("span", { class: "dsx-search-ico" }); sico.append(iconSvg("search"));
    const input = h("input", {
      type: "search", class: "dsx-search-input", placeholder: "Search servers",
      value: pickerState.query, autocomplete: "off", spellcheck: "false",
      "aria-label": "Search your servers",
    });
    input.addEventListener("input", () => {
      pickerState.query = input.value;
      paintServerList(root.querySelector(".dsx-server-list"));
    });
    const search = h("div", { class: "dsx-search" }, sico, input);

    const seg = h("div", { class: "dsx-seg", role: "tablist", "aria-label": "Filter servers" });
    [["all", "All"], ["premium", "Premium"], ["owner", "Owner"]].forEach(([id, label]) => {
      const active = pickerState.filter === id;
      seg.append(h("button", {
        type: "button", role: "tab", "aria-selected": active ? "true" : "false",
        class: "dsx-seg-btn" + (active ? " active" : ""),
        onclick: () => {
          if (pickerState.filter === id) return;
          pickerState.filter = id;
          row.replaceWith(renderPickerControls());
          paintServerList(root.querySelector(".dsx-server-list"));
        },
      }, label));
    });

    row.append(search, seg);
    return row;
  }

  function pickerFilter(guilds) {
    const q = (pickerState.query || "").trim().toLowerCase();
    const f = pickerState.filter;
    return guilds.filter((g) => {
      if (q && !(g.name || "").toLowerCase().includes(q)) return false;
      const premium = g.plan === "premium" || g.plan === "monthly" || g.plan === "annual" || g.plan === "lifetime";
      if (f === "premium" && !premium) return false;
      if (f === "owner" && !g.owner) return false;
      return true;
    });
  }

  function paintServerList(host) {
    if (!host) return;
    clear(host);
    const rows = pickerFilter(state.guilds);
    if (!rows.length) {
      host.append(h("div", { class: "dsx-list-empty" },
        pickerState.query
          ? `No servers match “${pickerState.query}”.`
          : "No servers in this filter."));
    } else {
      rows.forEach((g, i) => {
        const row = renderGuildRow(g);
        row.style.setProperty("--i", String(i));
        host.append(row);
      });
    }
    host.append(renderAddServerRow());
  }

  function renderGuildRow(g) {
    const premium = g.plan === "premium" || g.plan === "monthly" || g.plan === "annual" || g.plan === "lifetime";
    const planLabel = g.plan === "lifetime" ? "Lifetime" : premium ? "Premium" : "Free";
    const role = g.owner ? "Owner" : "Manage Server";

    const enter = h("span", { class: "dsx-enter", "aria-hidden": "true" }); enter.append(iconSvg("arrowRight"));
    return h("button", {
      type: "button", class: "dsx-server-row",
      onclick: () => selectGuild(g.id), "aria-label": `Manage ${g.name || "server"}`,
    },
      dscGuildIcon(g, 48),
      h("div", { class: "dsx-server-main" },
        h("div", { class: "dsx-server-name" }, g.name || "Unknown server"),
        h("div", { class: "dsx-server-meta" },
          h("span", { class: "dsx-status" }, h("span", { class: "dsx-dot online" }), "Installed"),
          h("span", { class: "dsx-sep", "aria-hidden": "true" }, "·"),
          h("span", null, role)
        )
      ),
      h("span", { class: "dsx-plan" + (premium ? " premium" : "") }, planLabel),
      enter
    );
  }

  function renderAddServerRow() {
    const enter = h("span", { class: "dsx-enter", "aria-hidden": "true" }); enter.append(iconSvg("arrowRight"));
    return h("a", {
      class: "dsx-add-row", href: cfg.links?.inviteBot || "#",
      target: "_blank", rel: "noopener noreferrer",
    },
      h("span", { class: "dsx-add-plus", "aria-hidden": "true" }, "+"),
      h("span", { class: "dsx-add-label" }, "Add Arkoris to another server"),
      enter
    );
  }

  function renderPickerFooter() {
    return h("div", { class: "dsx-pk-footer" },
      h("a", { href: cfg.links?.supportDiscord || "#", target: "_blank", rel: "noopener noreferrer" }, "Support"),
      h("span", { class: "dsx-dotsep", "aria-hidden": "true" }, "·"),
      h("a", { href: "pricing.html" }, "Pricing"),
      h("span", { class: "dsx-dotsep", "aria-hidden": "true" }, "·"),
      h("a", { href: "faq.html" }, "Help")
    );
  }

  function renderPickerEmpty() {
    const ico = h("div", { class: "dsx-empty-ico" }); ico.append(iconSvg("plug"));
    return h("div", { class: "dsx-empty" },
      ico,
      h("h2", null, "No servers to manage yet"),
      h("p", null, "Add Arkoris to a Discord server you own or help manage, then it'll show up here."),
      h("div", { class: "dsx-empty-actions" },
        btn("Add Arkoris to a server", { kind: "btn-primary", href: cfg.links?.inviteBot, external: true }),
        btn("Join support", { kind: "btn-ghost", href: cfg.links?.supportDiscord, external: true })
      )
    );
  }

  // ── Below-the-fold cards ────────────────────────────────────────
  function renderPickerFeaturePreview() {
    return h("div", { class: "picker-features-block" },
      h("div", { class: "picker-section-head" },
        h("h3", null, "What you can manage"),
        h("p", null, "Arkoris ships with a deep free toolkit and premium upgrades. Every module is also configurable inside Discord with /setup.")
      ),
      h("div", { class: "picker-features-grid" },
        renderFeatureChip("hand",     "Welcome",          "free"),
        renderFeatureChip("shield",   "Auto Roles",       "free"),
        renderFeatureChip("masks",    "Role Menus",       "free"),
        renderFeatureChip("activity", "/pop Population",  "free"),
        renderFeatureChip("trophy",   "XP & Leaderboards","free"),
        renderFeatureChip("flag",     "Pets",             "free"),
        renderFeatureChip("creditCard","Payments",        "premium"),
        renderFeatureChip("wallet",   "Staff Pay",        "premium"),
        renderFeatureChip("flame",    "Hype",             "premium"),
        renderFeatureChip("palette",  "Branding",         "premium"),
        renderFeatureChip("ticket",   "Tickets",          "premium"),
        renderFeatureChip("calendar", "Events",           "premium")
      )
    );
  }
  function renderFeatureChip(iconName, label, tier) {
    return h("div", { class: `picker-feature-chip ${tier}` },
      icon(iconName, "picker-feature-ico"),
      h("div", { class: "picker-feature-body" },
        h("div", { class: "picker-feature-label" }, label),
        h("div", { class: "picker-feature-tier" }, tier === "premium" ? "Premium" : "Free")
      )
    );
  }

  function renderPickerSetupGuide() {
    const steps = [
      { n: "1", title: "Invite the bot",            sub: "Click Invite Bot and pick your server." },
      { n: "2", title: "Open the dashboard",        sub: "Select that server from the list above." },
      { n: "3", title: "Configure modules",         sub: "Welcome, Role Menus, Tickets, and more — point-and-click or use /setup." },
      { n: "4", title: "Unlock premium (optional)", sub: "Run /subscribe inside Discord for staff pay, branding, hype, events." },
    ];
    return h("div", { class: "picker-guide" },
      h("div", { class: "picker-section-head" },
        h("h3", null, "Getting started"),
        h("p", null, "Four short steps from zero to a configured server.")
      ),
      h("ol", { class: "picker-stepper" },
        ...steps.map((s) => h("li", { class: "picker-step" },
          h("div", { class: "picker-step-num" }, s.n),
          h("div", null,
            h("div", { class: "picker-step-title" }, s.title),
            h("div", { class: "picker-step-sub" }, s.sub)
          )
        ))
      )
    );
  }

  /* ============================================================
     Per-guild dashboard — premium SaaS layout
     ============================================================ */
  async function renderGuildDashboard() {
    clear(root);
    const guild = state.guilds.find((g) => g.id === state.selectedGuildId);
    const plan = guild?.plan || "free";

    // Mobile drawer toggle bar — only visible <= 980px via CSS.
    // Lets users open the sidebar on phones.
    const mobileBar = h("div", { class: "dash-mobile-bar" },
      h("button", { type: "button", class: "menu-btn", "aria-label": "Open menu",
        onclick: () => {
          const side = root.querySelector(".dash-sidebar");
          if (side) {
            side.classList.toggle("open");
            document.body.classList.toggle("dash-drawer-open", side.classList.contains("open"));
          }
        },
      }, iconSvg("menu")),
      h("div", { class: "label" }, guild?.name || "Dashboard"),
      planPill(plan)
    );
    root.append(mobileBar);

    // Top bar — Discord-style header (.dsx-topbar)
    const premium = plan === "premium" || plan === "monthly" || plan === "annual" || plan === "lifetime";
    const planLabel = plan === "lifetime" ? "Lifetime" : premium ? "Premium" : "Free";
    const back = h("button", { type: "button", class: "dsx-topbar-back", "aria-label": "Back to servers",
      onclick: () => { state.selectedGuildId = null; render(); } });
    back.append((() => { const i = h("span", { class: "dsx-back-ico", "aria-hidden": "true" }); i.append(iconSvg("arrowRight")); return i; })(), "Servers");
    const logout = h("button", { type: "button", class: "dsx-icon-btn", title: "Log out", "aria-label": "Log out", onclick: handleLogout });
    logout.append(iconSvg("logout"));
    const topbar = h("div", { class: "dsx-topbar" },
      back,
      dscGuildIcon(guild || {}, 30),
      h("div", { class: "dsx-topbar-id" },
        h("div", { class: "dsx-topbar-name" }, guild?.name || "Loading…"),
        h("div", { class: "dsx-topbar-sub" },
          h("span", { class: "dsx-status" }, h("span", { class: "dsx-dot online" }), "Bot online"))
      ),
      h("span", { class: "dsx-plan" + (premium ? " premium" : "") }, planLabel),
      h("div", { id: "dash-save-status", class: "dsx-save" }, "Saved"),
      logout
    );
    root.append(topbar);

    // Load modules schema once
    if (!state.modules) {
      try {
        const m = await data.modules();
        // Modules intentionally hidden from the dashboard (still usable via their Discord commands).
        state.modules = (m.modules || []).filter((mod) => !["giveaways", "credits", "pets", "polls"].includes(mod.name));
      } catch (e) {
        return renderTabError(root, e);
      }
    }

    // Whether the Setup Hub is fully complete drives whether it appears in the
    // nav at all. Resolve it before building the sidebar so the first paint is
    // correct (cached per guild, so this only fetches once per server).
    await ensureSetupStatus();
    const hubComplete = hubAllDone(state.setupStatus && state.setupStatus.setup && state.setupStatus.setup.flags);
    // Hide the Setup Hub once complete — unless the user explicitly reopened it
    // from the Overview (so they can still un-mark an optional module).
    const hideSetupHub = hubComplete && !state._forceHub;
    // Never strand the user on a hub that's been hidden.
    if (hideSetupHub && state.activeTab === "setup-hub") state.activeTab = "overview";

    const layout = h("div", { class: "dash-layout" });
    layout.append(renderSidebar(plan, hideSetupHub));
    const content = h("div", { class: "dash-content" });
    layout.append(content);
    root.append(layout);
    renderActiveTab(content);
  }

  /** Premium plan pill — used in top bar + mobile bar */
  function planPill(plan) {
    if (plan === "lifetime") return h("span", { class: "dash-status-pill lifetime" }, h("span", { class: "pill-dot" }), "Lifetime");
    if (plan === "premium" || plan === "monthly") return h("span", { class: "dash-status-pill premium" }, h("span", { class: "pill-dot" }), "Premium");
    return h("span", { class: "dash-status-pill" }, "Free");
  }

  /** Grouped sidebar with icons, sections, premium-locked indicators. */
  function renderSidebar(plan, hideSetupHub) {
    const isPremium = plan === "premium" || plan === "monthly" || plan === "annual" || plan === "lifetime";
    // Keep .dash-sidebar for the mobile-drawer toggle + layout grid; the new
    // Discord-native look is driven entirely by .dsx-nav (+ children).
    const side = h("div", { class: "dash-sidebar dsx-nav", role: "tablist", "aria-label": "Dashboard navigation" });

    // Brand header
    const brandMark = h("div", { class: "dsx-nav-mark", "aria-hidden": "true" }); brandMark.append(iconSvg("flag"));
    side.append(
      h("div", { class: "dsx-nav-head" },
        brandMark,
        h("div", { class: "dsx-nav-head-text" },
          h("div", { class: "dsx-nav-brand" }, "Arkoris"),
          h("div", { class: "dsx-nav-brand-sub" }, "Dashboard")
        )
      )
    );

    // Group modules into the SAME five categories as the in-Discord /setup nav,
    // so the dashboard sidebar and /setup mirror each other. Any module not
    // explicitly mapped falls into "Discord Server" so nothing ever disappears.
    const CATEGORY_OF = {
      // Discord Server
      welcome: "discord", autoRoles: "discord", roleMenus: "discord", customCommands: "discord", xp: "discord",
      hype: "discord", moderation: "discord",
      events: "discord",
      // Tickets & Staff
      tickets: "tickets", staffPay: "tickets",
      // ARK Integration
      ark: "ark",
      // Logs & Monitoring
      logs: "logs",
      // Payments & Branding
      payments: "payments", branding: "payments",
      // System / admin tools
      serverTemplates: "system",
    };
    const inCat = (cat) => state.modules
      .filter((m) => (CATEGORY_OF[m.name] || "discord") === cat)
      .map((m) => m.name);

    const groups = [
      // Setup Hub drops out of the nav entirely once every module is configured.
      { label: "Core",                items: [...(hideSetupHub ? [] : ["setup-hub"]), "overview", "analytics", "embed-builder"] },
      { label: "Discord Server",      items: inCat("discord") },
      { label: "Tickets & Staff",     items: inCat("tickets") },
      { label: "ARK Integration",     items: inCat("ark") },
      { label: "Logs & Monitoring",   items: inCat("logs") },
      { label: "Payments & Branding", items: inCat("payments") },
      { label: "System",              items: [...inCat("system"), "premium", "audit", "support"] },
    ];

    const labels = {
      "setup-hub": "Setup Hub",
      overview:    "Overview",
      analytics:   "Analytics",
      "embed-builder": "Embed Builder",
      premium:     "Premium",
      audit:       "Audit Log",
      support:     "Support",
    };

    if (!state.collapsedGroups) state.collapsedGroups = new Set();
    const scroll = h("nav", { class: "dsx-nav-scroll" });
    groups.forEach((g) => {
      if (!g.items.length) return;
      const hasActive = g.items.includes(state.activeTab);
      // The group holding the active tab always renders expanded so the user
      // never loses sight of where they are.
      const collapsed = !hasActive && state.collapsedGroups.has(g.label);

      const group = h("div", { class: `dsx-nav-group ${collapsed ? "collapsed" : ""}` });
      const caret = h("span", { class: "dsx-nav-caret", "aria-hidden": "true" }); caret.append(iconSvg("arrowRight"));
      const header = h("button", {
        type: "button",
        class: "dsx-nav-cat",
        "aria-expanded": collapsed ? "false" : "true",
        onclick: () => {
          const nowCollapsed = !group.classList.contains("collapsed");
          group.classList.toggle("collapsed", nowCollapsed);
          header.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
          if (nowCollapsed) state.collapsedGroups.add(g.label);
          else              state.collapsedGroups.delete(g.label);
        },
      }, h("span", null, g.label), caret);
      group.append(header);

      const items = h("div", { class: "dsx-nav-items" });
      g.items.forEach((id) => {
        const mod = state.modules.find((m) => m.name === id);
        const label = labels[id] || (mod?.label || id);
        const isPremTier = !!mod && mod.tier === "premium";
        const locked = isPremTier && !isPremium;
        const item = h("button", {
          type: "button",
          class: `dsx-nav-item ${id === state.activeTab ? "active" : ""} ${locked ? "locked" : ""}`,
          role: "tab",
          "aria-selected": id === state.activeTab ? "true" : "false",
          onclick: () => {
            state._forceHub = false; // leaving via the nav re-arms auto-hide
            state.activeTab = id;
            // Close drawer on mobile after picking a tab
            const sb = root.querySelector(".dash-sidebar");
            if (sb && sb.classList.contains("open")) {
              sb.classList.remove("open");
              document.body.classList.remove("dash-drawer-open");
            }
            render();
          },
        });
        const ico = h("span", { class: "dsx-nav-ico", "aria-hidden": "true" }); ico.append(iconSvg(TAB_ICONS[id] || "list"));
        item.append(ico, h("span", { class: "dsx-nav-label" }, label));
        if (isPremTier) item.append(h("span", { class: "dsx-nav-pro" }, "PRO"));
        if (locked) { const lk = h("span", { class: "dsx-nav-lock", "aria-hidden": "true" }); lk.append(iconSvg("lock")); item.append(lk); }
        items.append(item);
      });
      group.append(items);
      scroll.append(group);
    });
    side.append(scroll);

    // Footer — support + invite
    side.append(
      h("div", { class: "dsx-nav-foot" },
        h("a", { class: "dsx-nav-foot-btn", href: cfg.links?.supportDiscord || "#", target: "_blank", rel: "noopener noreferrer" }, "Support"),
        h("a", { class: "dsx-nav-foot-btn primary", href: cfg.links?.inviteBot || "#", target: "_blank", rel: "noopener noreferrer" }, "Invite Bot")
      )
    );

    return side;
  }

  function renderActiveTab(content) {
    // Render a couple of shimmer skeleton cards instead of a tiny spinner —
    // gives the dashboard a real "loading" feel during fetch.
    clear(content);
    content.append(renderGenericSkeleton());
    const tab = state.activeTab;
    if (tab === "setup-hub") return loadSetupHub(content);
    if (tab === "overview") return loadOverview(content);
    if (tab === "analytics") return loadAnalytics(content);
    if (tab === "embed-builder") return loadEmbedBuilder(content);
    if (tab === "premium") return renderPremium(content);
    if (tab === "audit") return loadGameLogs(content);
    if (tab === "support") return renderSupportTab(content);
    return loadModule(content, tab);
  }

  /* ============================================================
     EMBED BUILDER — premium embed editor + live Discord preview
     ============================================================ */
  const EB_LIMITS = { content: 2000, title: 256, description: 4096, footer: 2048, authorName: 256, fieldName: 256, fieldValue: 1024, fields: 25, total: 6000, embeds: 10, rows: 5, buttonsPerRow: 5, options: 25, placeholder: 150, optLabel: 100, optValue: 100, optDesc: 100, label: 80 };
  const EB_PRESET_COLORS = ["#e23b2e", "#f5851f", "#ffcc4d", "#2ecc71", "#3498db", "#9b59b6", "#e91e63", "#1abc9c", "#34495e", "#95a5a6", "#000000", "#ffffff"];
  const EB_BTN_STYLES = [["primary", "Primary"], ["secondary", "Secondary"], ["success", "Success"], ["danger", "Danger"], ["link", "Link"]];
  const EB_ACTION_TYPES = [["none", "Nothing"], ["info_embed", "Show info embed"], ["text", "Send text reply"], ["give_role", "Give role"], ["remove_role", "Remove role"], ["toggle_role", "Toggle role"]];

  function ebBlankEmbed() { return { title: "", url: "", description: "", color: "#e23b2e", timestamp: null, author: { name: "", url: "", icon_url: "" }, thumbnail: { url: "" }, image: { url: "" }, footer: { text: "", icon_url: "" }, fields: [] }; }
  function ebEmbedEmpty(e) { return !s2(e.title) && !s2(e.description) && !(e.fields || []).length && !s2(e.image && e.image.url) && !s2(e.thumbnail && e.thumbnail.url) && !s2(e.author && e.author.name) && !s2(e.footer && e.footer.text); }
  function s2(v) { return (v == null ? "" : String(v)).trim(); }
  function ebCharCount(e) { let n = (e.title || "").length + (e.description || "").length + ((e.footer && e.footer.text) || "").length + ((e.author && e.author.name) || "").length; for (const f of (e.fields || [])) n += (f.name || "").length + (f.value || "").length; return n; }

  async function loadEmbedBuilder(content) {
    const gid = state.selectedGuildId;
    clear(content);
    content.append(renderGenericSkeleton());

    // Builder model + supporting data
    const eb = {
      channelId: "", content: "", allowedMentions: "default",
      embeds: [ebBlankEmbed()], activeEmbed: 0, components: [], templateId: null,
      tab: "message",
    };
    let channels = [], templates = [], roles = [];
    try {
      const [chRes, tplRes, draftRes, rolesRes, emoRes] = await Promise.all([
        data.channels(gid).catch(() => ({ channels: [] })),
        data.embTplList(gid).catch(() => ({ templates: [] })),
        data.embDraftGet(gid).catch(() => ({ draft: null })),
        data.roles(gid).catch(() => ({ roles: [] })),
        (data.emojis ? data.emojis(gid).catch(() => ({ emojis: [] })) : Promise.resolve({ emojis: [] })),
      ]);
      channels = chRes.channels || [];
      templates = tplRes.templates || [];
      roles = rolesRes.roles || [];
      _ebGuildEmojis = (emoRes && emoRes.emojis) || [];
      if (draftRes && draftRes.draft && draftRes.draft.draft) {
        try { applyModel(eb, draftRes.draft.draft); toast("info", "Restored your unsaved draft"); } catch {}
      }
    } catch (e) { return renderTabError(content, e); }

    clear(content);
    const page = h("div", { class: "eb-page" });
    content.append(page);

    // ---- elements we re-render into ----
    let editorEl, previewEl, validEl;
    let saveTimer = null;
    let formSyncTimer = null;
    // Re-render the side form on the next tick (after a pending click lands), so
    // it never shows a value stale relative to a just-made inline preview edit.
    function scheduleFormSync() { clearTimeout(formSyncTimer); formSyncTimer = setTimeout(() => renderEditor(), 0); }
    function scheduleAutosave() {
      const status = document.getElementById("dash-save-status");
      if (status) { status.textContent = "Saving…"; status.classList.add("saving"); }
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        try { await data.embDraftSave(gid, serializeModel(eb)); if (status) { status.textContent = "Draft saved ✓"; status.classList.remove("saving"); } }
        catch { if (status) status.textContent = "Save failed"; }
      }, 1100);
    }

    // ---- header + action bar ----
    page.append(
      h("div", { class: "eb-header" },
        h("div", null,
          h("h1", { class: "eb-title" }, "Embed Builder"),
          h("p", { class: "eb-sub" }, "Design, preview and publish rich Discord messages to your server.")
        ),
        h("div", { class: "eb-actionbar" },
          btn("↺ Reset", { kind: "btn-ghost", onclick: ebReset }),
          btn("⤓ Import", { kind: "btn-ghost", onclick: ebImport }),
          btn("⤒ Export", { kind: "btn-ghost", onclick: ebExport }),
          btn("⧉ Copy JSON", { kind: "btn-ghost", onclick: ebCopyJson }),
          btn("💾 Save template", { kind: "btn-secondary", onclick: ebSaveTemplate }),
          btn("📁 Templates", { kind: "btn-ghost", onclick: ebOpenTemplatesModal }),
          btn("📨 Post embed", { kind: "btn-primary eb-post-btn", onclick: ebOpenPost })
        )
      )
    );

    // Canvas-first layout: the live editor IS the preview (edit in place); the
    // full form collapses into an "Advanced settings" panel for the deep config
    // (channel/send, info-embed replies, exact values, templates).
    const split = h("div", { class: "eb-split eb-canvas-mode" });
    const previewCol = h("div", { class: "eb-preview-col" });
    previewEl = h("div", { class: "eb-preview" });
    previewCol.append(
      h("div", { class: "eb-preview-head" },
        h("span", { class: "eb-preview-label" }, "Live editor"),
        h("span", { class: "eb-preview-hint" }, "Click any text to edit · ⚙ for settings · + to add")
      ),
      previewEl
    );
    validEl = h("div", { class: "eb-valid" });
    previewCol.append(validEl);
    // Everything is edited in the live canvas — there is no separate form panel.
    // editorEl is created but NOT shown; it only keeps renderEditor()/renderAll()
    // safe no-ops (they still target it harmlessly off-screen).
    editorEl = h("div", { class: "eb-editor" });
    split.append(previewCol);
    page.append(split);

    // ---- render fns ----
    function curEmbed() { return eb.embeds[eb.activeEmbed] || eb.embeds[0]; }
    function syncPreview() { renderPreview(); renderValidation(); scheduleAutosave(); }
    // renderAll is the structural rebuild (used by the Advanced form's add/
    // remove/reorder). Clear any open canvas popover so its index-based key
    // can't re-open on the wrong element after indices shift.
    function renderAll() { eb._openPop = null; renderEditor(); renderPreview(); renderValidation(); }

    // Tabs replace the old accordion → one compact panel at a time.
    const EB_TABS = [["message", "Message"], ["embed", "Embed"], ["author", "Author"], ["media", "Media"], ["fields", "Fields"], ["buttons", "Buttons"], ["dropdowns", "Dropdowns"], ["footer", "Footer"], ["templates", "Templates"], ["send", "Send"]];
    function section(id, title, bodyFn) { return bodyFn(); } // body only; chrome lives on the tab panel
    function field(labelText, child, hint) {
      return h("label", { class: "eb-field" }, h("span", { class: "eb-label" }, labelText), child, hint ? h("span", { class: "eb-hint" }, hint) : null);
    }
    function counter(node, val, max) { const c = h("span", { class: `eb-count ${val > max ? "over" : ""}` }, `${val}/${max}`); return c; }
    function textInput(val, oninput, ph) { return h("input", { class: "eb-input", type: "text", value: val || "", placeholder: ph || "", oninput: (e) => oninput(e.target.value) }); }
    function urlInput(val, oninput, ph) { const i = textInput(val, oninput, ph || "https://…"); i.type = "url"; return i; }

    const EB_TAB_BUILDERS = {
      message: () => sectionMessage(), embed: () => sectionEmbed(), author: () => sectionAuthor(),
      media: () => sectionMedia(), fields: () => sectionFields(), footer: () => sectionFooter(),
      buttons: () => sectionButtons(), dropdowns: () => sectionDropdowns(),
      templates: () => sectionTemplates(), send: () => sectionSend(),
    };
    function renderEditor() {
      clear(editorEl);
      if (!eb.tab || !EB_TAB_BUILDERS[eb.tab]) eb.tab = "message";
      const counts = { fields: curEmbed().fields.length, buttons: eb.components.filter((c) => c.type === "buttons").length, dropdowns: eb.components.filter((c) => c.type === "select").length, templates: templates.length };
      const bar = h("div", { class: "eb-tabbar" }, ...EB_TABS.map(([id, label]) =>
        h("button", { type: "button", class: `eb-tab ${eb.tab === id ? "active" : ""}`, onclick: () => { eb.tab = id; renderEditor(); } },
          label, counts[id] ? h("span", { class: "eb-tab-badge" }, String(counts[id])) : null)));
      editorEl.append(bar, h("div", { class: "eb-tabpanel" }, EB_TAB_BUILDERS[eb.tab]()));
    }

    // ===== Section: Message & Channel =====
    function sectionMessage() {
      return section("message", "1 · Message", () => {
        const ta = h("textarea", { class: "eb-textarea", rows: 3, placeholder: "Optional text shown above the embed…", maxlength: EB_LIMITS.content, oninput: (e) => { eb.content = e.target.value; syncPreview(); } }, eb.content || "");
        const menSel = h("select", { class: "eb-select", onchange: (e) => { eb.allowedMentions = e.target.value; } },
          ...[["default", "Default (respect roles/users)"], ["none", "Suppress all mentions"], ["roles", "Allow role mentions"], ["users", "Allow user mentions"], ["all", "Allow @everyone / @here"]].map(([v, l]) => h("option", { value: v, selected: v === eb.allowedMentions ? true : null }, l))
        );
        return [
          h("p", { class: "eb-microcopy" }, "Build your message + embed, then hit “Post embed” to choose a channel and publish."),
          field("Message content", ta),
          field("Mentions", menSel),
        ];
      });
    }

    // ===== Section: Embed main =====
    function sectionEmbed() {
      return section("embed", "2 · Embed", () => {
        const e = curEmbed();
        // embed switcher
        const tabs = h("div", { class: "eb-embed-tabs" },
          ...eb.embeds.map((_, i) => h("button", { type: "button", class: `eb-chip ${i === eb.activeEmbed ? "active" : ""}`, onclick: () => { eb.activeEmbed = i; renderEditor(); } }, `Embed ${i + 1}`)),
          eb.embeds.length < EB_LIMITS.embeds ? h("button", { type: "button", class: "eb-chip add", onclick: () => { eb.embeds.push(ebBlankEmbed()); eb.activeEmbed = eb.embeds.length - 1; renderAll(); } }, "+ Add") : null,
          eb.embeds.length > 1 ? h("button", { type: "button", class: "eb-chip del", onclick: () => { eb.embeds.splice(eb.activeEmbed, 1); eb.activeEmbed = 0; renderAll(); } }, "✕ Remove") : null
        );
        const titleI = textInput(e.title, (v) => { e.title = v; titleCount.replaceWith(titleCount = counter(null, v.length, EB_LIMITS.title)); syncPreview(); });
        let titleCount = counter(null, (e.title || "").length, EB_LIMITS.title);
        const descTa = h("textarea", { class: "eb-textarea", rows: 5, placeholder: "Supports Discord markdown…", maxlength: EB_LIMITS.description, oninput: (e2) => { e.description = e2.target.value; descCount.replaceWith(descCount = counter(null, e2.target.value.length, EB_LIMITS.description)); syncPreview(); } }, e.description || "");
        let descCount = counter(null, (e.description || "").length, EB_LIMITS.description);
        // markdown toolbar
        const mdBar = h("div", { class: "eb-mdbar" }, ...[["B", "**", "**"], ["i", "*", "*"], ["U", "__", "__"], ["S", "~~", "~~"], ["</>", "`", "`"], ["▤", "```\n", "\n```"], ["❝", "> ", ""], ["•", "- ", ""]].map(([lbl, pre, post]) =>
          h("button", { type: "button", class: "eb-md", title: lbl, onclick: () => wrapSel(descTa, pre, post, (v) => { e.description = v; syncPreview(); }) }, lbl)));
        const colorRow = h("div", { class: "eb-color-row" },
          h("input", { class: "eb-color", type: "color", value: /^#[0-9a-f]{6}$/i.test(e.color || "") ? e.color : "#e23b2e", oninput: (ev) => { e.color = ev.target.value; hexI.value = ev.target.value; syncPreview(); } }),
          (function () { const hexI = textInput(e.color, (v) => { e.color = v; syncPreview(); }, "#RRGGBB"); hexI.classList.add("eb-hex"); sectionEmbed._hex = hexI; return hexI; })(),
          h("button", { type: "button", class: "eb-md", title: "Random", onclick: () => { const c = "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"); e.color = c; renderEditor(); syncPreview(); } }, "🎲")
        );
        const hexI = sectionEmbed._hex; void hexI;
        const presets = h("div", { class: "eb-presets" }, ...EB_PRESET_COLORS.map((c) => h("button", { type: "button", class: "eb-swatch", style: { background: c }, title: c, onclick: () => { e.color = c; renderEditor(); syncPreview(); } })));
        const tsSel = h("select", { class: "eb-select", onchange: (ev) => { eb_setTimestamp(e, ev.target.value); syncPreview(); } },
          ...[["none", "No timestamp"], ["now", "Current time (on send)"], ["custom", "Custom date/time"]].map(([v, l]) => h("option", { value: v, selected: (eb_tsMode(e) === v) ? true : null }, l)));
        const tsRow = h("div", { class: "eb-ts-row" }, tsSel,
          eb_tsMode(e) === "custom" ? h("input", { class: "eb-input", type: "datetime-local", value: eb_tsLocal(e), oninput: (ev) => { e.timestamp = ev.target.value ? new Date(ev.target.value).toISOString() : null; syncPreview(); } }) : null);
        return [
          tabs,
          field("Title", h("div", { class: "eb-with-count" }, titleI, titleCount)),
          field("Title URL", urlInput(e.url, (v) => { e.url = v; syncPreview(); })),
          field("Description", h("div", null, mdBar, h("div", { class: "eb-with-count" }, descTa, descCount))),
          field("Colour", h("div", null, colorRow, presets)),
          field("Timestamp", tsRow),
        ];
      });
    }

    // ===== Section: Author =====
    function sectionAuthor() {
      return section("author", "3 · Author", () => {
        const e = curEmbed();
        return [
          field("Author name", textInput(e.author.name, (v) => { e.author.name = v; syncPreview(); })),
          field("Author URL", urlInput(e.author.url, (v) => { e.author.url = v; syncPreview(); })),
          field("Author icon URL", urlInput(e.author.icon_url, (v) => { e.author.icon_url = v; syncPreview(); })),
          btn("Clear author", { kind: "btn-ghost", onclick: () => { e.author = { name: "", url: "", icon_url: "" }; renderEditor(); syncPreview(); } }),
        ];
      });
    }

    // ===== Section: Media =====
    function sectionMedia() {
      return section("media", "4 · Media", () => {
        const e = curEmbed();
        return [
          field("Thumbnail URL", urlInput(e.thumbnail.url, (v) => { e.thumbnail.url = v; syncPreview(); }), "Small image, top-right of the embed."),
          field("Large image URL", urlInput(e.image.url, (v) => { e.image.url = v; syncPreview(); }), "Full-width image below the content."),
          h("div", { class: "eb-row-btns" },
            btn("Clear thumbnail", { kind: "btn-ghost", onclick: () => { e.thumbnail.url = ""; renderEditor(); syncPreview(); } }),
            btn("Clear image", { kind: "btn-ghost", onclick: () => { e.image.url = ""; renderEditor(); syncPreview(); } })
          ),
        ];
      });
    }

    // ===== Section: Fields =====
    function sectionFields() {
      return section("fields", `5 · Fields (${curEmbed().fields.length}/${EB_LIMITS.fields})`, () => {
        const e = curEmbed();
        const list = h("div", { class: "eb-fields" });
        e.fields.forEach((f, i) => {
          list.append(h("div", { class: "eb-field-card" },
            h("div", { class: "eb-field-card-head" },
              h("span", { class: "eb-field-num" }, `#${i + 1}`),
              h("div", { class: "eb-field-actions" },
                h("button", { type: "button", class: "eb-icon-btn", title: "Move up", disabled: i === 0 ? true : null, onclick: () => { [e.fields[i - 1], e.fields[i]] = [e.fields[i], e.fields[i - 1]]; renderAll(); } }, "↑"),
                h("button", { type: "button", class: "eb-icon-btn", title: "Move down", disabled: i === e.fields.length - 1 ? true : null, onclick: () => { [e.fields[i + 1], e.fields[i]] = [e.fields[i], e.fields[i + 1]]; renderAll(); } }, "↓"),
                h("button", { type: "button", class: "eb-icon-btn", title: "Duplicate", onclick: () => { e.fields.splice(i + 1, 0, JSON.parse(JSON.stringify(f))); renderAll(); } }, "⧉"),
                h("button", { type: "button", class: "eb-icon-btn danger", title: "Remove", onclick: () => { e.fields.splice(i, 1); renderAll(); } }, "✕")
              )
            ),
            field(`Name`, textInput(f.name, (v) => { f.name = v; syncPreview(); })),
            field(`Value`, h("textarea", { class: "eb-textarea", rows: 2, maxlength: EB_LIMITS.fieldValue, oninput: (ev) => { f.value = ev.target.value; syncPreview(); } }, f.value || "")),
            h("label", { class: "eb-toggle" }, h("input", { type: "checkbox", checked: f.inline ? true : null, onchange: (ev) => { f.inline = ev.target.checked; syncPreview(); } }), h("span", null, "Inline"))
          ));
        });
        return [
          list,
          e.fields.length < EB_LIMITS.fields ? btn("+ Add field", { kind: "btn-secondary", onclick: () => { e.fields.push({ name: "", value: "", inline: false }); renderAll(); } }) : notice("warn", "Max 25 fields reached"),
        ];
      });
    }

    // ===== Section: Footer =====
    function sectionFooter() {
      return section("footer", "6 · Footer", () => {
        const e = curEmbed();
        let fc = counter(null, (e.footer.text || "").length, EB_LIMITS.footer);
        return [
          field("Footer text", h("div", { class: "eb-with-count" }, h("input", { class: "eb-input", type: "text", value: e.footer.text || "", oninput: (ev) => { e.footer.text = ev.target.value; fc.replaceWith(fc = counter(null, ev.target.value.length, EB_LIMITS.footer)); syncPreview(); } }), fc)),
          field("Footer icon URL", urlInput(e.footer.icon_url, (v) => { e.footer.icon_url = v; syncPreview(); })),
          btn("Clear footer", { kind: "btn-ghost", onclick: () => { e.footer = { text: "", icon_url: "" }; renderEditor(); syncPreview(); } }),
        ];
      });
    }

    // ===== Section: Components (buttons + selects) =====
    function compHead(row, ri, label) {
      return h("div", { class: "eb-comp-head" },
        h("span", { class: "eb-comp-type" }, label),
        h("div", { class: "eb-field-actions" },
          h("button", { type: "button", class: "eb-icon-btn", title: "Duplicate", onclick: () => { eb.components.splice(ri + 1, 0, JSON.parse(JSON.stringify(row))); renderAll(); } }, "⧉"),
          h("button", { type: "button", class: "eb-icon-btn", title: "Move up", disabled: ri === 0 ? true : null, onclick: () => { [eb.components[ri - 1], eb.components[ri]] = [eb.components[ri], eb.components[ri - 1]]; renderAll(); } }, "↑"),
          h("button", { type: "button", class: "eb-icon-btn", title: "Move down", disabled: ri === eb.components.length - 1 ? true : null, onclick: () => { [eb.components[ri + 1], eb.components[ri]] = [eb.components[ri], eb.components[ri + 1]]; renderAll(); } }, "↓"),
          h("button", { type: "button", class: "eb-icon-btn danger", title: "Remove", onclick: () => { eb.components.splice(ri, 1); renderAll(); } }, "✕")
        )
      );
    }

    // ===== Tab: Buttons =====
    function sectionButtons() {
      return section("buttons", "Buttons", () => {
        const wrap = h("div", { class: "eb-components" });
        eb.components.forEach((row, ri) => {
          if (row.type !== "buttons") return;
          const card = h("div", { class: "eb-comp-card" }, compHead(row, ri, "🔘 Button row"));
          (row.buttons || []).forEach((b, bi) => {
            card.append(h("div", { class: "eb-btn-row" },
              h("div", { class: "eb-btn-grid" },
                field("Label", textInput(b.label, (v) => { b.label = v; syncPreview(); })),
                field("Style", h("select", { class: "eb-select", onchange: (ev) => { b.style = ev.target.value; renderAll(); } }, ...EB_BTN_STYLES.map(([v, l]) => h("option", { value: v, selected: (b.style || "secondary") === v ? true : null }, l)))),
                field("Emoji", ebEmojiField(() => b.emoji, (v) => { b.emoji = v; }, () => syncPreview())),
                b.style === "link" ? field("URL", urlInput(b.url, (v) => { b.url = v; syncPreview(); })) : field("Custom ID", textInput(b.custom_id, (v) => { b.custom_id = v; syncPreview(); }, "my_button_id"))
              ),
              h("div", { class: "eb-btn-row-foot" },
                h("label", { class: "eb-toggle" }, h("input", { type: "checkbox", checked: b.disabled ? true : null, onchange: (ev) => { b.disabled = ev.target.checked; syncPreview(); } }), h("span", null, "Disabled")),
                h("button", { type: "button", class: "eb-icon-btn danger", title: "Remove button", onclick: () => { row.buttons.splice(bi, 1); renderAll(); } }, "✕")
              )
            ));
          });
          if ((row.buttons || []).length < EB_LIMITS.buttonsPerRow) card.append(btn("+ Add button", { kind: "btn-ghost", onclick: () => { row.buttons = row.buttons || []; row.buttons.push({ label: "Button", style: "primary", custom_id: "", url: "", emoji: "", disabled: false }); renderAll(); } }));
          wrap.append(card);
        });
        if (!eb.components.some((c) => c.type === "buttons")) wrap.append(h("div", { class: "eb-empty" }, "No buttons yet — add a button row below."));
        return [
          wrap,
          eb.components.length < EB_LIMITS.rows ? btn("+ Add button row", { kind: "btn-secondary", onclick: () => { eb.components.push({ type: "buttons", buttons: [{ label: "Button", style: "primary", custom_id: "", url: "", emoji: "", disabled: false }] }); renderAll(); } }) : notice("warn", "Max 5 action rows reached"),
          h("p", { class: "eb-microcopy" }, "Link buttons need a URL. Custom-ID buttons need a matching bot handler to do something."),
        ];
      });
    }

    // ===== Tab: Dropdown menus (with per-option actions) =====
    function sectionDropdowns() {
      return section("dropdowns", "Dropdowns", () => {
        const wrap = h("div", { class: "eb-components" });
        eb.components.forEach((row, ri) => {
          if (row.type !== "select") return;
          const card = h("div", { class: "eb-comp-card" }, compHead(row, ri, "▼ Dropdown menu"));
          card.append(
            field("Placeholder", textInput(row.placeholder, (v) => { row.placeholder = v; syncPreview(); })),
            h("div", { class: "eb-btn-grid" },
              field("Custom ID", textInput(row.custom_id, (v) => { row.custom_id = v; syncPreview(); }, "my_select_id")),
              field("Min values", h("input", { class: "eb-input", type: "number", min: 0, max: 25, value: row.min_values ?? 1, oninput: (ev) => { row.min_values = parseInt(ev.target.value, 10) || 0; scheduleAutosave(); } })),
              field("Max values", h("input", { class: "eb-input", type: "number", min: 1, max: 25, value: row.max_values ?? 1, oninput: (ev) => { row.max_values = parseInt(ev.target.value, 10) || 1; scheduleAutosave(); } }))
            ),
            h("label", { class: "eb-toggle" }, h("input", { type: "checkbox", checked: row.disabled ? true : null, onchange: (ev) => { row.disabled = ev.target.checked; syncPreview(); } }), h("span", null, "Disabled"))
          );
          (row.options || []).forEach((o, oi) => {
            o.action = o.action || { type: "none", ephemeral: true };
            card.append(h("div", { class: "eb-opt-card" },
              h("div", { class: "eb-opt-head" }, h("span", { class: "eb-field-num" }, `Option ${oi + 1}`),
                h("div", { class: "eb-field-actions" },
                  h("button", { type: "button", class: "eb-icon-btn", title: "Duplicate", onclick: () => { row.options.splice(oi + 1, 0, JSON.parse(JSON.stringify(o))); renderAll(); } }, "⧉"),
                  h("button", { type: "button", class: "eb-icon-btn", title: "Move up", disabled: oi === 0 ? true : null, onclick: () => { [row.options[oi - 1], row.options[oi]] = [row.options[oi], row.options[oi - 1]]; renderAll(); } }, "↑"),
                  h("button", { type: "button", class: "eb-icon-btn", title: "Move down", disabled: oi === row.options.length - 1 ? true : null, onclick: () => { [row.options[oi + 1], row.options[oi]] = [row.options[oi], row.options[oi + 1]]; renderAll(); } }, "↓"),
                  h("button", { type: "button", class: "eb-icon-btn danger", title: "Remove option", onclick: () => { row.options.splice(oi, 1); renderAll(); } }, "✕"))),
              h("div", { class: "eb-opt-grid" },
                field("Label", textInput(o.label, (v) => { o.label = v; syncPreview(); })),
                field("Value", textInput(o.value, (v) => { o.value = v; syncPreview(); })),
                field("Description", textInput(o.description, (v) => { o.description = v; syncPreview(); })),
                field("Emoji", ebEmojiField(() => o.emoji, (v) => { o.emoji = v; }, () => syncPreview()))
              ),
              h("label", { class: "eb-toggle" }, h("input", { type: "checkbox", checked: o.default ? true : null, onchange: (ev) => { o.default = ev.target.checked; syncPreview(); } }), h("span", null, "Selected by default")),
              h("div", { class: "eb-action" },
                field("On select → does", h("select", { class: "eb-select", onchange: (ev) => { o.action.type = ev.target.value; renderAll(); } }, ...EB_ACTION_TYPES.map(([v, l]) => h("option", { value: v, selected: o.action.type === v ? true : null }, l)))),
                ...actionFields(o.action)
              )
            ));
          });
          if ((row.options || []).length < EB_LIMITS.options) card.append(btn("+ Add option", { kind: "btn-ghost", onclick: () => { row.options = row.options || []; row.options.push({ label: "Option", value: "value_" + ((row.options || []).length + 1), description: "", emoji: "", default: false, action: { type: "none", ephemeral: true } }); renderAll(); } }));
          wrap.append(card);
        });
        if (!eb.components.some((c) => c.type === "select")) wrap.append(h("div", { class: "eb-empty" }, "No dropdown menus yet — add one below."));
        return [
          wrap,
          eb.components.length < EB_LIMITS.rows ? btn("+ Add dropdown menu", { kind: "btn-secondary", onclick: () => { eb.components.push({ type: "select", custom_id: "", placeholder: "Choose…", min_values: 1, max_values: 1, disabled: false, options: [{ label: "Option", value: "value_1", description: "", emoji: "", default: false, action: { type: "none", ephemeral: true } }] }); renderAll(); } }) : notice("warn", "Max 5 action rows reached"),
          h("p", { class: "eb-microcopy" }, "Each option can trigger an action when picked. Info-embed, text and role actions run automatically; ticket/custom need bot setup."),
        ];
      });
    }

    function actionFields(act) {
      const ephToggle = () => h("label", { class: "eb-toggle" }, h("input", { type: "checkbox", checked: act.ephemeral !== false ? true : null, onchange: (ev) => { act.ephemeral = ev.target.checked; scheduleAutosave(); } }), h("span", null, "Only the clicker sees the response (ephemeral)"));
      if (act.type === "info_embed") {
        act.embed = act.embed || { title: "", description: "", color: "#e23b2e", image: { url: "" }, footer: { text: "" } };
        const e = act.embed;
        return [
          field("Response title", textInput(e.title, (v) => { e.title = v; scheduleAutosave(); })),
          field("Response description", h("textarea", { class: "eb-textarea", rows: 3, oninput: (ev) => { e.description = ev.target.value; scheduleAutosave(); } }, e.description || "")),
          h("div", { class: "eb-btn-grid" },
            field("Colour", h("input", { class: "eb-color", type: "color", value: /^#[0-9a-f]{6}$/i.test(e.color || "") ? e.color : "#e23b2e", oninput: (ev) => { e.color = ev.target.value; scheduleAutosave(); } })),
            field("Footer", textInput(e.footer.text, (v) => { e.footer.text = v; scheduleAutosave(); }))
          ),
          field("Image URL", urlInput(e.image.url, (v) => { e.image.url = v; scheduleAutosave(); })),
          ephToggle(),
        ];
      }
      if (act.type === "text") return [field("Response text", h("textarea", { class: "eb-textarea", rows: 2, oninput: (ev) => { act.text = ev.target.value; scheduleAutosave(); } }, act.text || "")), ephToggle()];
      if (act.type === "give_role" || act.type === "remove_role" || act.type === "toggle_role") {
        return [field("Role", h("select", { class: "eb-select", onchange: (ev) => { act.roleId = ev.target.value; scheduleAutosave(); } },
          h("option", { value: "" }, roles.length ? "Select a role…" : "No roles found"),
          ...roles.map((r) => h("option", { value: r.id, selected: r.id === act.roleId ? true : null }, r.name))))];
      }
      if (act.type === "open_ticket") return [h("p", { class: "eb-microcopy" }, "Opens a ticket on select. Requires a configured Ticket Panel — until then the bot replies with a notice.")];
      if (act.type === "custom") return [field("Custom action ID", textInput(act.customActionId, (v) => { act.customActionId = v; scheduleAutosave(); }, "my_custom_action"))];
      return [];
    }

    // ===== Tab: Send =====
    function sectionSend() {
      return section("send", "Send", () => {
        const errs = ebValidate(eb);
        const chSel = h("select", { class: "eb-select", onchange: (ev) => { eb.channelId = ev.target.value; } },
          h("option", { value: "" }, channels.length ? "Choose a channel…" : "No sendable channels found"),
          ...channels.map((c) => h("option", { value: c.id, selected: c.id === eb.channelId ? true : null }, `#${c.name}${c.parentName ? "  ·  " + c.parentName : ""}`)));
        return [
          field("Channel", chSel, "Only channels the bot can post in are listed."),
          errs.length ? notice("warn", `${errs.length} issue${errs.length > 1 ? "s" : ""} to fix first`, errs[0]) : notice("success", "Everything looks valid — ready to post."),
          h("div", { class: "eb-row-btns" },
            btn("📨 Post to channel", { kind: "btn-primary eb-post-btn", onclick: ebOpenPost }),
            btn("💾 Save as template", { kind: "btn-secondary", onclick: ebSaveTemplate })
          ),
        ];
      });
    }

    // ===== Section: Templates =====
    function sectionTemplates() {
      return section("templates", `8 · Templates (${templates.length})`, () => {
        const search = h("input", { class: "eb-input", type: "search", placeholder: "Search templates…", oninput: (ev) => { const q = ev.target.value.toLowerCase(); grid.querySelectorAll(".eb-tpl-card").forEach((c) => { c.style.display = c.dataset.name.includes(q) ? "" : "none"; }); } });
        const grid = h("div", { class: "eb-tpl-grid" });
        if (!templates.length) grid.append(h("div", { class: "eb-empty" }, "No templates yet. Build an embed and hit “Save template”."));
        templates.forEach((t) => {
          grid.append(h("div", { class: "eb-tpl-card", "data-name": (t.name || "").toLowerCase() },
            h("div", { class: "eb-tpl-top" }, h("span", { class: "eb-tpl-name" }, t.name), t.category ? h("span", { class: "eb-tpl-cat" }, t.category) : null),
            h("div", { class: "eb-tpl-snippet" }, (t.embedJson && t.embedJson[0] && (t.embedJson[0].title || t.embedJson[0].description)) || t.messageContent || "—"),
            h("div", { class: "eb-tpl-meta" }, "Updated " + ebRel(t.updatedAt)),
            h("div", { class: "eb-tpl-actions" },
              btn("Load", { kind: "btn-secondary", onclick: () => ebLoadTemplate(t) }),
              btn("Duplicate", { kind: "btn-ghost", onclick: () => ebDuplicateTemplate(t) }),
              btn("Delete", { kind: "btn-ghost", onclick: () => ebDeleteTemplate(t) })
            )
          ));
        });
        return [search, grid];
      });
    }

    // ---- live preview ----
    // ---- inline-editable preview ("edit the preview itself") ----
    // plaintext-only contenteditable where supported (Chromium / Edge / Safari);
    // falls back to a normal contenteditable + paste-as-text elsewhere.
    const ebPlaintextOK = (() => { try { const d = document.createElement("div"); d.contentEditable = "plaintext-only"; return d.contentEditable === "plaintext-only"; } catch { return false; } })();
    function ebReadText(el) { return (el.innerText || "").replace(/\n$/, ""); }
    function ebCaretEnd(el) { try { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (_) {} }
    // A contenteditable region bound to a model getter/setter. Edits update the
    // model live WITHOUT re-rendering the preview (so the caret survives);
    // markdown fields edit raw source while focused and re-render on blur.
    function ebEditable(cls, get, set, opts) {
      opts = opts || {};
      const el = h(opts.tag || "div", { class: "eb-editable " + cls });
      el.contentEditable = ebPlaintextOK ? "plaintext-only" : "true";
      el.spellcheck = false;
      // Labelled for assistive tech (a contenteditable is otherwise an unnamed
      // edit field); placeholder stays as the visual hint.
      el.setAttribute("role", "textbox");
      el.setAttribute("aria-label", opts.label || opts.ph || "Edit");
      if (opts.multiline) el.setAttribute("aria-multiline", "true");
      if (opts.ph) el.setAttribute("data-ph", opts.ph);
      const v0 = get() || "";
      if (opts.markdown && s2(v0)) el.innerHTML = ebMarkdown(v0); else el.textContent = v0;
      el.addEventListener("focus", () => {
        // Swap rendered markdown -> raw source for editing, but only when there's
        // actually markup to unwrap (plain text keeps the click caret position).
        if (opts.markdown) { const raw = get() || ""; if (el.textContent !== raw) { el.textContent = raw; ebCaretEnd(el); } }
      });
      el.addEventListener("beforeinput", (ev) => {
        if (opts.max && ebReadText(el).length >= opts.max && /^insert/.test(ev.inputType || "")) ev.preventDefault();
      });
      el.addEventListener("input", () => {
        const v = ebReadText(el);
        if (!v && el.innerHTML !== "") el.innerHTML = ""; // keep the :empty placeholder working
        set(v); renderValidation(); scheduleAutosave();
      });
      el.addEventListener("blur", (ev) => {
        let v = ebReadText(el);
        if (!v.trim()) v = ""; // whitespace-only reads as empty (so the placeholder returns)
        set(v);
        if (opts.markdown) el.innerHTML = s2(v) ? ebMarkdown(v) : ""; else el.textContent = v;
        renderValidation();
        // Re-sync the side form so it never shows a stale value. If focus is
        // moving INTO the form, defer so the click lands before the rebuild.
        const to = ev.relatedTarget;
        if (to && editorEl.contains(to)) scheduleFormSync(); else renderEditor();
      });
      el.addEventListener("paste", (ev) => {
        ev.preventDefault();
        let t = ((ev.clipboardData || window.clipboardData).getData("text") || "");
        if (opts.max) { const room = opts.max - ebReadText(el).length; if (room <= 0) return; if (t.length > room) t = t.slice(0, room); }
        try { document.execCommand("insertText", false, t); } catch (_) { el.textContent += t; }
      });
      if (!opts.multiline) el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); el.blur(); } });
      return el;
    }

    // Canvas re-render helpers: cvSync = value-only change (keeps caret/focus on
    // the active control), cvRerender = structural change (rebuild the canvas).
    function cvSync() { renderValidation(); scheduleAutosave(); }
    function cvRerender() { renderPreview(); renderValidation(); scheduleAutosave(); }
    function ebNewButton() { return { label: "Button", style: "primary", custom_id: "", url: "", emoji: "", disabled: false, action: { type: "none", ephemeral: true } }; }
    function ebNewOption(n) { return { label: "Option", value: "value_" + n, description: "", emoji: "", default: false, action: { type: "none", ephemeral: true } }; }
    function ebNewSelect() { return { type: "select", custom_id: "", placeholder: "Choose…", min_values: 1, max_values: 1, disabled: false, options: [ebNewOption(1)] }; }

    function renderPreview() {
      clear(previewEl);
      const device = h("div", { class: "eb-discord eb-editing" });
      // Message content above the embed — always editable.
      device.append(ebEditable("eb-msg-content", () => eb.content, (v) => { eb.content = v; }, { label: "Message text above the embed", ph: "Message text above the embed (optional)", markdown: true, multiline: true, max: EB_LIMITS.content }));
      // The active embed always renders (so an empty one can be built inline);
      // any other embeds render only once they have content.
      eb.embeds.forEach((e, i) => { if (!ebEmbedEmpty(e) || i === eb.activeEmbed) device.append(ebPreviewEmbed(e, true, i)); });
      eb.components.forEach((row, ri) => device.append(ebPreviewComponentRow(row, ri)));
      // "Add" affordances — build the whole message from the canvas, no form.
      const add = h("div", { class: "eb-cv-add" });
      if (eb.embeds.length < EB_LIMITS.embeds) add.append(h("button", { type: "button", class: "eb-add-chip", onclick: () => { eb.embeds.push(ebBlankEmbed()); eb.activeEmbed = eb.embeds.length - 1; cvRerender(); } }, "+ Embed"));
      if (eb.components.length < EB_LIMITS.rows) {
        add.append(h("button", { type: "button", class: "eb-add-chip", onclick: () => { eb.components.push({ type: "buttons", buttons: [ebNewButton()] }); cvRerender(); } }, "+ Buttons"));
        add.append(h("button", { type: "button", class: "eb-add-chip", onclick: () => { eb.components.push(ebNewSelect()); cvRerender(); } }, "+ Menu"));
      }
      device.append(add);
      // Allowed-mentions (who actually gets pinged) — small inline control.
      device.append(h("div", { class: "eb-cv-mentions" },
        h("span", { class: "eb-cv-mentions-lbl" }, "Pings"),
        h("select", { class: "eb-cv-sel", onchange: (ev) => { eb.allowedMentions = ev.target.value; cvSync(); } },
          ...[["default", "Respect roles/users"], ["none", "Suppress all mentions"], ["roles", "Allow role mentions"], ["users", "Allow user mentions"], ["all", "Allow @everyone / @here"]].map(([v, l]) => h("option", { value: v, selected: v === (eb.allowedMentions || "default") ? true : null }, l)))));
      previewEl.append(device);
    }
    function ebPreviewEmbed(e, editable, i) {
      const col = /^#[0-9a-f]{6}$/i.test(e.color || "") ? e.color : "#e23b2e";
      const box = h("div", { class: "eb-embed", style: { borderColor: col } });
      const inner = h("div", { class: "eb-embed-inner" });

      // Embed tools (settings + delete) — top-right, shown on hover/focus.
      if (editable) {
        box.append(h("div", { class: "eb-cv-embed-tools" },
          h("button", { type: "button", class: "eb-cv-gear", title: "Embed settings (colour, images, timestamp)", onclick: (ev) => { ev.stopPropagation(); ebPopToggle("embed:" + i); } }, "⚙"),
          h("button", { type: "button", class: "eb-cv-rowdel", title: "Delete embed", onclick: () => { eb.embeds.splice(i, 1); if (!eb.embeds.length) eb.embeds.push(ebBlankEmbed()); eb.activeEmbed = Math.max(0, Math.min(eb.activeEmbed, eb.embeds.length - 1)); eb._openPop = null; cvRerender(); } }, "✕")));
      }

      // Author
      if (editable) {
        const a = h("div", { class: "eb-e-author" });
        if (s2(e.author && e.author.icon_url)) a.append(h("img", { class: "eb-e-author-ico", src: e.author.icon_url, onerror: "this.style.display='none'" }));
        a.append(ebEditable("eb-e-author-name", () => e.author && e.author.name, (v) => { (e.author = e.author || {}).name = v; }, { tag: "span", label: "Author name", ph: "Author name", max: EB_LIMITS.authorName }));
        inner.append(a);
      } else if (s2(e.author && e.author.name)) {
        inner.append(h("div", { class: "eb-e-author" }, s2(e.author.icon_url) ? h("img", { class: "eb-e-author-ico", src: e.author.icon_url, onerror: "this.style.display='none'" }) : null, h("span", null, e.author.name)));
      }

      // Title
      if (editable) {
        inner.append(ebEditable("eb-e-title", () => e.title, (v) => { e.title = v; }, { label: "Embed title", ph: "Title", max: EB_LIMITS.title }));
      } else if (s2(e.title)) {
        inner.append(e.url ? h("a", { class: "eb-e-title link", href: e.url, target: "_blank", rel: "noopener" }, e.title) : h("div", { class: "eb-e-title" }, e.title));
      }

      // Description
      if (editable) {
        inner.append(ebEditable("eb-e-desc", () => e.description, (v) => { e.description = v; }, { label: "Embed description", ph: "Description (markdown supported)", markdown: true, multiline: true, max: EB_LIMITS.description }));
      } else if (s2(e.description)) {
        inner.append(h("div", { class: "eb-e-desc", html: ebMarkdown(e.description) }));
      }

      // Fields
      if (editable) {
        const fg = h("div", { class: "eb-e-fields" });
        (e.fields || []).forEach((f, fi) => {
          fg.append(h("div", { class: "eb-e-field " + (f.inline ? "inline" : "") + " eb-cv-field" },
            ebEditable("eb-e-field-name", () => f.name, (v) => { f.name = v; }, { label: "Field name", ph: "Field name", markdown: true, max: EB_LIMITS.fieldName }),
            ebEditable("eb-e-field-val", () => f.value, (v) => { f.value = v; }, { label: "Field value", ph: "Field value", markdown: true, multiline: true, max: EB_LIMITS.fieldValue }),
            h("div", { class: "eb-cv-field-tools" },
              h("button", { type: "button", class: "eb-cv-field-tog" + (f.inline ? " on" : ""), title: "Toggle inline layout", onclick: () => { f.inline = !f.inline; cvRerender(); } }, "⇆"),
              h("button", { type: "button", class: "eb-cv-optdel", title: "Remove field", onclick: () => { e.fields.splice(fi, 1); cvRerender(); } }, "✕"))));
        });
        inner.append(fg);
        if ((e.fields || []).length < EB_LIMITS.fields) inner.append(h("button", { type: "button", class: "eb-add-chip sm eb-cv-addfield", onclick: () => { e.fields = e.fields || []; e.fields.push({ name: "Field name", value: "Field value", inline: false }); cvRerender(); } }, "+ Field"));
      } else {
        const showFields = (e.fields || []).filter((f) => s2(f.name) || s2(f.value));
        if (showFields.length) {
          const fg = h("div", { class: "eb-e-fields" });
          showFields.forEach((f) => fg.append(h("div", { class: `eb-e-field ${f.inline ? "inline" : ""}` }, h("div", { class: "eb-e-field-name", html: ebMarkdown(f.name) }), h("div", { class: "eb-e-field-val", html: ebMarkdown(f.value) }))));
          inner.append(fg);
        }
      }

      if (s2(e.image && e.image.url)) inner.append(h("img", { class: "eb-e-image", src: e.image.url, onerror: "this.style.display='none'" }));

      // Footer (+ timestamp)
      const ts = e.timestamp ? new Date(e.timestamp) : null;
      const tsStr = ts && !isNaN(ts) ? ts.toLocaleString() : "";
      if (editable) {
        const f = h("div", { class: "eb-e-footer" });
        if (s2(e.footer && e.footer.icon_url)) f.append(h("img", { class: "eb-e-footer-ico", src: e.footer.icon_url, onerror: "this.style.display='none'" }));
        f.append(ebEditable("eb-e-footer-text", () => e.footer && e.footer.text, (v) => { (e.footer = e.footer || {}).text = v; }, { tag: "span", label: "Footer text", ph: "Footer text", max: EB_LIMITS.footer }));
        if (tsStr) f.append(h("span", { class: "eb-e-foot-ts" }, " • " + tsStr));
        inner.append(f);
      } else if (s2(e.footer && e.footer.text) || e.timestamp) {
        inner.append(h("div", { class: "eb-e-footer" },
          s2(e.footer && e.footer.icon_url) ? h("img", { class: "eb-e-footer-ico", src: e.footer.icon_url, onerror: "this.style.display='none'" }) : null,
          h("span", null, [s2(e.footer && e.footer.text) ? e.footer.text : null, ts && !isNaN(ts) ? (s2(e.footer && e.footer.text) ? " • " : "") + ts.toLocaleString() : null].filter(Boolean).join(""))
        ));
      }

      box.append(inner);
      if (s2(e.thumbnail && e.thumbnail.url)) { box.classList.add("has-thumb"); inner.append(h("img", { class: "eb-e-thumb", src: e.thumbnail.url, onerror: "this.style.display='none'" })); }
      if (editable) box.append(ebPop("embed:" + i, (p) => ebEmbedSettings(p, e)));
      return box;
    }
    function ebPreviewComponentRow(row, ri) {
      if (row.type === "buttons") return ebEditButtonsRow(row, ri);
      if (row.type === "select") return ebEditSelectRow(row, ri);
      return h("div");
    }
    // Inline control popover, opened by a gear. Its open/closed state lives in
    // eb._openPop (keyed) so a canvas rerender re-opens the same one.
    function ebPopToggle(key) { eb._openPop = (eb._openPop === key) ? null : key; cvRerender(); }
    function ebPop(key, buildBody) {
      const pop = h("div", { class: "eb-cv-pop" });
      if (eb._openPop === key) { pop.classList.add("open"); buildBody(pop); }
      return pop;
    }
    function ebEditButtonsRow(row, ri) {
      const r = h("div", { class: "eb-comp-preview-row eb-cv-row" });
      (row.buttons || []).forEach((b, bi) => {
        const key = "btn:" + ri + ":" + bi;
        const btnEl = h("div", { class: "eb-d-btn " + (b.style || "secondary") + (b.disabled ? " disabled" : "") + " eb-cv-btn" });
        if (s2(b.emoji)) { const es = h("span", { class: "eb-d-btn-emoji" }); es.append(ebEmojiNode(b.emoji)); btnEl.append(es); }
        btnEl.append(ebEditable("eb-d-btn-label", () => b.label, (v) => { b.label = v; }, { tag: "span", label: "Button label", ph: "Button", max: EB_LIMITS.label }));
        btnEl.append(h("button", { type: "button", class: "eb-cv-gear", title: "Button settings", onclick: (e) => { e.stopPropagation(); ebPopToggle(key); } }, "▾"));
        const pop = ebPop(key, (p) => {
          const kids = [
            h("div", { class: "eb-cv-pop-lbl" }, "Style"),
            h("div", { class: "eb-cv-styles" }, ...EB_BTN_STYLES.map(([v, l]) => h("button", { type: "button", class: "eb-cv-style " + v + ((b.style || "secondary") === v ? " sel" : ""), title: l, onclick: () => { b.style = v; cvRerender(); } }))),
            h("label", { class: "eb-cv-lbl" }, "Emoji", ebEmojiField(() => b.emoji, (v) => { b.emoji = v; }, () => cvRerender())),
            b.style === "link"
              ? h("label", { class: "eb-cv-lbl" }, "Link URL", h("input", { class: "eb-cv-in", type: "url", value: b.url || "", placeholder: "https://…", oninput: (ev) => { b.url = ev.target.value; cvSync(); } }))
              : h("label", { class: "eb-cv-lbl" }, "Custom ID (auto from label)", h("input", { class: "eb-cv-in", type: "text", value: b.custom_id || "", placeholder: ebAutoId(b.label, "button"), oninput: (ev) => { b.custom_id = ev.target.value; cvSync(); } })),
            h("label", { class: "eb-cv-check" }, h("input", { type: "checkbox", checked: b.disabled ? true : null, onchange: (ev) => { b.disabled = ev.target.checked; cvRerender(); } }), h("span", null, "Disabled")),
          ];
          // Non-link buttons can DO something on click (same engine as dropdown
          // options). Link buttons just open their URL.
          if (b.style !== "link") {
            b.action = b.action || { type: "none", ephemeral: true };
            kids.push(
              h("div", { class: "eb-cv-pop-lbl" }, "On click → does"),
              h("select", { class: "eb-cv-sel", onchange: (ev) => { b.action.type = ev.target.value; cvRerender(); } }, ...EB_ACTION_TYPES.map(([v, l]) => h("option", { value: v, selected: (b.action.type || "none") === v ? true : null }, l))),
              ...ebOptActionInline(b.action));
          }
          kids.push(h("button", { type: "button", class: "eb-cv-del", onclick: () => { row.buttons.splice(bi, 1); if (!row.buttons.length) eb.components.splice(ri, 1); eb._openPop = null; cvRerender(); } }, "Delete button"));
          p.append(...kids);
        });
        r.append(h("div", { class: "eb-cv-btn-wrap" }, btnEl, pop));
      });
      if ((row.buttons || []).length < EB_LIMITS.buttonsPerRow) r.append(h("button", { type: "button", class: "eb-add-chip sm", title: "Add button", onclick: () => { row.buttons = row.buttons || []; row.buttons.push(ebNewButton()); cvRerender(); } }, "+"));
      r.append(h("button", { type: "button", class: "eb-cv-rowdel", title: "Delete this row", onclick: () => { eb.components.splice(ri, 1); eb._openPop = null; cvRerender(); } }, "✕"));
      return r;
    }
    function ebEditSelectRow(row, ri) {
      const key = "sel:" + ri;
      const wrap = h("div", { class: "eb-d-select-wrap eb-cv-selwrap" });
      wrap.append(h("div", { class: "eb-d-select " + (row.disabled ? "disabled" : "") },
        ebEditable("eb-d-select-ph", () => row.placeholder, (v) => { row.placeholder = v; }, { tag: "span", label: "Dropdown placeholder", ph: "Make a selection", max: EB_LIMITS.placeholder }),
        h("button", { type: "button", class: "eb-cv-gear", title: "Menu settings", onclick: (e) => { e.stopPropagation(); ebPopToggle(key); } }, "▾")));
      wrap.append(ebPop(key, (p) => p.append(
        h("label", { class: "eb-cv-lbl" }, "Custom ID (auto from placeholder)", h("input", { class: "eb-cv-in", type: "text", value: row.custom_id || "", placeholder: ebAutoId(row.placeholder, "menu"), oninput: (ev) => { row.custom_id = ev.target.value; cvSync(); } })),
        h("div", { class: "eb-cv-grid2" },
          h("label", { class: "eb-cv-lbl" }, "Min values", h("input", { class: "eb-cv-in", type: "number", min: 0, max: 25, value: row.min_values == null ? 1 : row.min_values, oninput: (ev) => { row.min_values = parseInt(ev.target.value, 10) || 0; cvSync(); } })),
          h("label", { class: "eb-cv-lbl" }, "Max values", h("input", { class: "eb-cv-in", type: "number", min: 1, max: 25, value: row.max_values == null ? 1 : row.max_values, oninput: (ev) => { row.max_values = parseInt(ev.target.value, 10) || 1; cvSync(); } }))),
        h("label", { class: "eb-cv-check" }, h("input", { type: "checkbox", checked: row.disabled ? true : null, onchange: (ev) => { row.disabled = ev.target.checked; cvRerender(); } }), h("span", null, "Disabled")),
        h("button", { type: "button", class: "eb-cv-del", onclick: () => { eb.components.splice(ri, 1); eb._openPop = null; cvRerender(); } }, "Delete menu"))));
      const list = h("div", { class: "eb-d-options eb-cv-opts" });
      (row.options || []).forEach((o, oi) => {
        o.action = o.action || { type: "none", ephemeral: true };
        const optKey = "opt:" + ri + ":" + oi;
        list.append(h("div", { class: "eb-d-option eb-cv-opt" },
          ebEmojiField(() => o.emoji, (v) => { o.emoji = v; }, () => cvRerender()),
          h("div", { class: "eb-d-opt-text" },
            ebEditable("eb-d-opt-label", () => o.label, (v) => { o.label = v; }, { tag: "div", label: "Option label", ph: "Option label", max: EB_LIMITS.optLabel }),
            ebEditable("eb-d-opt-desc", () => o.description, (v) => { o.description = v; }, { tag: "div", label: "Option description", ph: "Description (optional)", max: EB_LIMITS.optDesc })),
          h("button", { type: "button", class: "eb-cv-gear", title: "Option action", onclick: (e) => { e.stopPropagation(); ebPopToggle(optKey); } }, "⚙"),
          h("button", { type: "button", class: "eb-cv-optdel", title: "Remove option", onclick: () => { row.options.splice(oi, 1); eb._openPop = null; cvRerender(); } }, "✕")));
        list.append(ebPop(optKey, (p) => p.append(
          h("label", { class: "eb-cv-lbl" }, "On select → does",
            h("select", { class: "eb-cv-sel", onchange: (ev) => { o.action.type = ev.target.value; cvRerender(); } }, ...EB_ACTION_TYPES.map(([v, l]) => h("option", { value: v, selected: o.action.type === v ? true : null }, l)))),
          ...ebOptActionInline(o.action),
          h("label", { class: "eb-cv-check" }, h("input", { type: "checkbox", checked: o.default ? true : null, onchange: (ev) => { o.default = ev.target.checked; cvSync(); } }), h("span", null, "Selected by default")))));
      });
      if ((row.options || []).length < EB_LIMITS.options) list.append(h("button", { type: "button", class: "eb-add-chip sm", onclick: () => { row.options = row.options || []; row.options.push(ebNewOption((row.options || []).length + 1)); cvRerender(); } }, "+ Option"));
      wrap.append(list);
      wrap.append(h("button", { type: "button", class: "eb-cv-rowdel", title: "Delete this menu", onclick: () => { eb.components.splice(ri, 1); eb._openPop = null; cvRerender(); } }, "✕"));
      return wrap;
    }
    function ebOptActionInline(act) {
      const out = [];
      const eph = () => h("label", { class: "eb-cv-check" }, h("input", { type: "checkbox", checked: act.ephemeral !== false ? true : null, onchange: (ev) => { act.ephemeral = ev.target.checked; cvSync(); } }), h("span", null, "Only the clicker sees it"));
      if (act.type === "text") out.push(h("label", { class: "eb-cv-lbl" }, "Reply text", h("input", { class: "eb-cv-in", type: "text", value: act.text || "", oninput: (ev) => { act.text = ev.target.value; cvSync(); } })), eph());
      else if (act.type === "give_role" || act.type === "remove_role" || act.type === "toggle_role") out.push(h("label", { class: "eb-cv-lbl" }, "Role", h("select", { class: "eb-cv-sel", onchange: (ev) => { act.roleId = ev.target.value; cvSync(); } }, h("option", { value: "" }, "Select a role…"), ...roles.map((rl) => h("option", { value: rl.id, selected: act.roleId === rl.id ? true : null }, rl.name)))), eph());
      else if (act.type === "info_embed") {
        // Edit the reply embed right here (no detour to Advanced settings).
        act.embed = act.embed || { title: "", description: "", color: "#5865f2", image: { url: "" }, footer: { text: "" } };
        const e2 = act.embed;
        out.push(
          h("div", { class: "eb-cv-pop-lbl" }, "Reply embed"),
          h("label", { class: "eb-cv-lbl" }, "Title", h("input", { class: "eb-cv-in", type: "text", value: e2.title || "", oninput: (ev) => { e2.title = ev.target.value; cvSync(); } })),
          h("label", { class: "eb-cv-lbl" }, "Description", h("textarea", { class: "eb-cv-in", rows: 2, oninput: (ev) => { e2.description = ev.target.value; cvSync(); } }, e2.description || "")),
          h("div", { class: "eb-cv-grid2" },
            h("label", { class: "eb-cv-lbl" }, "Colour", h("input", { class: "eb-cv-color", type: "color", value: /^#[0-9a-f]{6}$/i.test(e2.color || "") ? e2.color : "#5865f2", oninput: (ev) => { e2.color = ev.target.value; cvSync(); } })),
            h("label", { class: "eb-cv-lbl" }, "Footer", h("input", { class: "eb-cv-in", type: "text", value: (e2.footer && e2.footer.text) || "", oninput: (ev) => { (e2.footer = e2.footer || {}).text = ev.target.value; cvSync(); } }))),
          h("label", { class: "eb-cv-lbl" }, "Image URL", h("input", { class: "eb-cv-in", type: "url", value: (e2.image && e2.image.url) || "", placeholder: "https://…", oninput: (ev) => { (e2.image = e2.image || {}).url = ev.target.value; cvSync(); } })),
          eph()
        );
      }
      return out;
    }
    function ebEmbedSettings(p, e) {
      const colorOk = /^#[0-9a-f]{6}$/i.test(e.color || "") ? e.color : "#5865f2";
      const urlField = (lbl, get, set, rerender) => h("label", { class: "eb-cv-lbl" }, lbl, h("input", { class: "eb-cv-in", type: "url", value: get() || "", placeholder: "https://…", oninput: (ev) => { set(ev.target.value); cvSync(); }, onchange: rerender ? () => cvRerender() : null }));
      p.append(
        h("div", { class: "eb-cv-pop-lbl" }, "Embed settings"),
        h("label", { class: "eb-cv-lbl" }, "Colour", h("input", { class: "eb-cv-color", type: "color", value: colorOk, oninput: (ev) => { e.color = ev.target.value; const bx = p.closest(".eb-embed"); if (bx) bx.style.borderColor = ev.target.value; cvSync(); } })),
        urlField("Large image URL", () => e.image && e.image.url, (v) => { (e.image = e.image || {}).url = v; }, true),
        urlField("Thumbnail URL", () => e.thumbnail && e.thumbnail.url, (v) => { (e.thumbnail = e.thumbnail || {}).url = v; }, true),
        urlField("Author icon URL", () => e.author && e.author.icon_url, (v) => { (e.author = e.author || {}).icon_url = v; }, true),
        urlField("Author link URL", () => e.author && e.author.url, (v) => { (e.author = e.author || {}).url = v; }, false),
        urlField("Footer icon URL", () => e.footer && e.footer.icon_url, (v) => { (e.footer = e.footer || {}).icon_url = v; }, true),
        urlField("Title link URL", () => e.url, (v) => { e.url = v; }, false),
        h("label", { class: "eb-cv-check" }, h("input", { type: "checkbox", checked: e.timestamp ? true : null, onchange: (ev) => { e.timestamp = ev.target.checked ? new Date().toISOString() : null; cvRerender(); } }), h("span", null, "Show timestamp"))
      );
    }
    function showTestResult(o) {
      const device = previewEl.querySelector(".eb-discord");
      if (!device) return;
      const old = device.querySelector(".eb-test-result"); if (old) old.remove();
      const act = (o && o.action) || { type: "none" };
      let body;
      if (act.type === "info_embed") body = ebPreviewEmbed(Object.assign({ color: "#e23b2e" }, act.embed || {}));
      else if (act.type === "text") body = h("div", { class: "eb-test-text" }, s2(act.text) ? act.text : "(no text set)");
      else if (act.type === "give_role" || act.type === "remove_role" || act.type === "toggle_role") { const rl = roles.find((x) => x.id === act.roleId); const verb = act.type === "give_role" ? "Gives you" : act.type === "remove_role" ? "Removes" : "Toggles"; body = h("div", { class: "eb-test-text" }, rl ? `${verb} the @${rl.name} role.` : "⚠ No role selected for this option."); }
      else if (act.type === "open_ticket") body = h("div", { class: "eb-test-text" }, "Would open a ticket (needs a Ticket Panel — bot replies with a notice for now).");
      else if (act.type === "custom") body = h("div", { class: "eb-test-text" }, s2(act.customActionId) ? `Runs custom action: ${act.customActionId}` : "Custom action (no ID set).");
      else body = h("div", { class: "eb-test-text muted" }, "No action configured — picking this does nothing.");
      const eph = act.type !== "none" && act.ephemeral !== false;
      device.append(h("div", { class: "eb-test-result" },
        h("div", { class: "eb-test-head" }, `🧪 Test · you picked “${o.label || "option"}”`, eph ? h("span", { class: "eb-test-eph" }, "only you see this") : null),
        body));
    }

    // ---- validation panel ----
    function renderValidation() {
      clear(validEl);
      const errs = ebValidate(eb);
      if (!errs.length) { validEl.append(h("div", { class: "eb-valid-ok" }, "✓ Ready to send")); return; }
      validEl.append(h("div", { class: "eb-valid-head" }, `${errs.length} issue${errs.length > 1 ? "s" : ""} to fix`));
      errs.slice(0, 8).forEach((m) => validEl.append(h("div", { class: "eb-valid-item" }, "• " + m)));
    }

    // ---- actions ----
    function ebReset() {
      ebModal("Reset the builder?", h("p", { class: "eb-modal-text" }, "This clears the current message and your saved draft. Your saved templates are not affected."), [
        { label: "Cancel", kind: "btn-ghost" },
        { label: "Reset", kind: "btn-danger", onConfirm: (close) => {
          eb.channelId = ""; eb.content = ""; eb.allowedMentions = "default"; eb.embeds = [ebBlankEmbed()]; eb.activeEmbed = 0; eb.components = []; eb.templateId = null; eb._openPop = null;
          data.embDraftSave(gid, serializeModel(eb)).catch(() => {});
          renderAll(); toast("info", "Builder reset"); close();
        } },
      ]);
    }
    function ebCopyJson() { navigator.clipboard.writeText(JSON.stringify(serializeModel(eb), null, 2)).then(() => toast("success", "JSON copied"), () => toast("error", "Copy failed")); }
    function ebExport() {
      const blob = new Blob([JSON.stringify({ _type: "quicksark_embed_template", name: "Embed export", payload: serializeModel(eb) }, null, 2)], { type: "application/json" });
      const a = h("a", { href: URL.createObjectURL(blob), download: "embed-template.json" }); document.body.append(a); a.click(); a.remove(); toast("success", "Exported JSON");
    }
    function ebImport() {
      const inp = h("input", { type: "file", accept: "application/json" });
      inp.onchange = () => { const file = inp.files[0]; if (!file) return; const rd = new FileReader(); rd.onload = () => { try { const j = JSON.parse(rd.result); const payload = j.payload || j; applyModel(eb, payload); renderAll(); syncPreview(); toast("success", "Template imported"); } catch { toast("error", "Invalid JSON file"); } }; rd.readAsText(file); };
      inp.click();
    }
    function ebSaveTemplate() {
      const input = h("input", { class: "eb-input eb-tpl-name", type: "text", value: eb._name || "My Embed", placeholder: "Template name", maxlength: 100, spellcheck: "false" });
      let closeModal = function () {};
      const doSave = async () => {
        const name = (input.value || "").trim();
        if (!name) { input.classList.add("eb-input-bad"); input.focus(); return; }
        try {
          const r = await data.embTplCreate(gid, { name, payload: serializeModel(eb) });
          if (r && r.template) { templates.unshift(r.template); eb.templateId = r.template.id; eb._name = r.template.name; toast("success", `Saved “${r.template.name}”`); }
          closeModal();
        } catch (e) { toast("error", ebErr(e) || "Could not save template"); }
      };
      input.addEventListener("input", () => input.classList.remove("eb-input-bad"));
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSave(); } });
      const body = h("div", { class: "eb-tpl-save" },
        h("p", { class: "eb-modal-text" }, "Save this message as a reusable template you can apply any time from ", h("strong", null, "📁 Templates"), "."),
        h("label", { class: "eb-tpl-save-lbl" }, "Template name"),
        input);
      closeModal = ebModal("Save as template", body, [
        { label: "Cancel", kind: "btn-ghost" },
        { label: "💾 Save template", kind: "btn-primary", onConfirm: () => doSave() },
      ]);
      setTimeout(() => { try { input.focus(); input.select(); } catch (_) {} }, 60);
    }
    function ebLoadTemplate(t) { applyModel(eb, { content: t.messageContent, allowedMentions: t.allowedMentions, embeds: t.embedJson, components: t.componentsJson }); eb.templateId = t.id; eb._name = t.name; renderAll(); syncPreview(); toast("success", `Loaded “${t.name}”`); }
    // Saved templates, in a modal (the Advanced form is gone — everything lives
    // in the canvas + the action bar).
    function ebOpenTemplatesModal() {
      const body = h("div", { class: "eb-tpl-modal" });
      let closeModal = function () {};
      let confirmId = null; // which template row is showing inline "Delete?" confirm
      async function removeTemplate(t) {
        try { await data.embTplDelete(gid, t.id); templates = templates.filter((x) => x.id !== t.id); toast("info", "Template deleted"); }
        catch { toast("error", "Could not delete"); }
      }
      function renderList() {
        clear(body);
        if (!templates.length) { body.append(h("div", { class: "eb-empty" }, "No templates yet. Build an embed and hit “Save template”.")); return; }
        templates.forEach((t) => {
          if (confirmId === t.id) {
            body.append(h("div", { class: "eb-tpl-row eb-tpl-row-confirm" },
              h("span", { class: "eb-tpl-row-name" }, "Delete “" + t.name + "”?"),
              h("div", { class: "eb-tpl-row-acts" },
                btn("Delete", { kind: "btn-danger", onclick: async () => { await removeTemplate(t); confirmId = null; renderList(); } }),
                btn("Cancel", { kind: "btn-ghost", onclick: () => { confirmId = null; renderList(); } }))));
          } else {
            body.append(h("div", { class: "eb-tpl-row" },
              h("span", { class: "eb-tpl-row-name" }, t.name),
              h("div", { class: "eb-tpl-row-acts" },
                btn("Apply", { kind: "btn-secondary", onclick: () => { ebLoadTemplate(t); closeModal(); } }),
                btn("Delete", { kind: "btn-ghost", onclick: () => { confirmId = t.id; renderList(); } }))));
          }
        });
      }
      renderList();
      closeModal = ebModal("Templates", body, [{ label: "Close", kind: "btn-ghost" }]);
    }
    async function ebDuplicateTemplate(t) {
      try { const r = await data.embTplCreate(gid, { name: t.name + " (copy)", category: t.category, payload: { content: t.messageContent, allowedMentions: t.allowedMentions, embeds: t.embedJson, components: t.componentsJson } }); if (r && r.template) { templates.unshift(r.template); renderEditor(); toast("success", "Duplicated"); } }
      catch (e) { toast("error", "Could not duplicate"); }
    }
    async function ebDeleteTemplate(t) {
      if (!confirm(`Delete template “${t.name}”?`)) return;
      try { await data.embTplDelete(gid, t.id); templates = templates.filter((x) => x.id !== t.id); renderEditor(); toast("info", "Template deleted"); }
      catch { toast("error", "Could not delete"); }
    }

    // ---- send flow ----
    function ebOpenPost() {
      const errs = ebValidate(eb);
      if (errs.length) { toast("error", "Fix the validation issues first"); renderValidation(); return; }
      const guild = state.guilds.find((g) => g.id === gid);
      const chSel = h("select", { class: "eb-select eb-post-channel" },
        h("option", { value: "" }, channels.length ? "Choose a channel…" : "No sendable channels found"),
        ...channels.map((c) => h("option", { value: c.id, selected: c.id === eb.channelId ? true : null }, `#${c.name}${c.parentName ? "  ·  " + c.parentName : ""}`))
      );
      const errLine = h("div", { class: "eb-post-err" });
      ebModal("Post embed", h("div", null,
        h("p", { class: "eb-modal-text" }, "Pick where to publish this message. It posts immediately."),
        h("label", { class: "eb-field" }, h("span", { class: "eb-label" }, "Channel"), chSel),
        errLine,
        h("div", { class: "eb-confirm-grid" },
          h("div", null, h("span", { class: "eb-confirm-k" }, "Server"), h("span", { class: "eb-confirm-v" }, (guild && guild.name) || gid)),
          h("div", null, h("span", { class: "eb-confirm-k" }, "Embeds"), h("span", { class: "eb-confirm-v" }, String(eb.embeds.filter((e) => !ebEmbedEmpty(e)).length))),
          h("div", null, h("span", { class: "eb-confirm-k" }, "Buttons/menus"), h("span", { class: "eb-confirm-v" }, String(eb.components.length) + " row(s)")),
          h("div", null, h("span", { class: "eb-confirm-k" }, "Content"), h("span", { class: "eb-confirm-v" }, s2(eb.content) ? "Yes" : "—"))
        )
      ), [
        { label: "Cancel", kind: "btn-ghost" },
        { label: "📨 Post now", kind: "btn-primary", onConfirm: (close) => {
            if (!chSel.value) { errLine.textContent = "Pick a channel to post to."; errLine.classList.add("show"); chSel.classList.add("eb-shake"); setTimeout(() => chSel.classList.remove("eb-shake"), 500); return; }
            eb.channelId = chSel.value; ebDoSend(close);
          } },
      ]);
    }
    async function ebDoSend(close) {
      try {
        const r = await data.embSend(gid, { channelId: eb.channelId, payload: serializeModel(eb), templateId: eb.templateId });
        close();
        if (r && r.ok) { toast("success", "Embed sent ✓"); if (r.messageUrl) ebModal("Sent!", h("div", null, h("p", { class: "eb-modal-text" }, "Your message is live."), h("a", { class: "eb-msg-link", href: r.messageUrl, target: "_blank", rel: "noopener" }, "Open message in Discord ↗")), [{ label: "Done", kind: "btn-primary" }]); }
        else { toast("error", ebSendErr(r)); }
      } catch (e) { close(); toast("error", ebErr(e) || "Send failed"); }
    }

    // ---- helpers ----
    function ebModal(title, bodyNode, actions) {
      const overlay = h("div", { class: "eb-modal-overlay" });
      const close = () => { overlay.classList.remove("show"); setTimeout(() => overlay.remove(), 200); };
      const acts = h("div", { class: "eb-modal-actions" });
      (actions || []).forEach((a) => acts.append(btn(a.label, { kind: a.kind, onclick: () => { if (a.onConfirm) a.onConfirm(close); else close(); } })));
      overlay.append(h("div", { class: "eb-modal", onclick: (e) => e.stopPropagation() }, h("div", { class: "eb-modal-title" }, title), bodyNode, acts));
      overlay.addEventListener("click", close);
      document.body.append(overlay); setTimeout(() => overlay.classList.add("show"), 10);
      return close;
    }

    renderAll();
    // keyboard: Ctrl+S save template, Ctrl+Enter send
    const keyHandler = (ev) => {
      if (state.activeTab !== "embed-builder") { document.removeEventListener("keydown", keyHandler); return; }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") { ev.preventDefault(); ebSaveTemplate(); }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") { ev.preventDefault(); ebOpenPost(); }
    };
    document.addEventListener("keydown", keyHandler);
  }

  /* Embed builder model (de)serialisation + validation + tiny markdown */
  // Auto custom_id from a label/placeholder so users never have to type one.
  function ebAutoId(text, fallback) {
    const slug = String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
    return slug || fallback;
  }
  function ebUniqId(used, base, fallback) {
    let id = ebAutoId(base, fallback), cand = id, n = 2;
    while (used.has(cand)) { cand = (id + "_" + n).slice(0, 100); n++; }
    used.add(cand);
    return cand;
  }
  // Fill in any missing button/select custom_id from its label/placeholder
  // (unique within the message). Manual ids are kept; link buttons need none.
  function ebSerializeComponents(components) {
    const used = new Set();
    components.forEach((row) => {
      if (row.type === "buttons") (row.buttons || []).forEach((b) => { if (b.style !== "link" && s2(b.custom_id)) used.add(b.custom_id); });
      else if (row.type === "select" && s2(row.custom_id)) used.add(row.custom_id);
    });
    return components.map((row) => {
      if (row.type === "buttons") {
        return Object.assign({}, row, { buttons: (row.buttons || []).map((b, i) => b.style === "link" ? b : Object.assign({}, b, { custom_id: s2(b.custom_id) ? b.custom_id : ebUniqId(used, b.label, "button_" + (i + 1)) })) });
      }
      if (row.type === "select") return Object.assign({}, row, { custom_id: s2(row.custom_id) ? row.custom_id : ebUniqId(used, row.placeholder, "menu") });
      return row;
    });
  }
  function serializeModel(eb) {
    return {
      content: eb.content || "", allowedMentions: eb.allowedMentions || "default",
      embeds: (eb.embeds || []).map((e) => ({ title: e.title || "", url: e.url || "", description: e.description || "", color: e.color || "", timestamp: e.timestamp || null, author: { name: (e.author || {}).name || "", url: (e.author || {}).url || "", icon_url: (e.author || {}).icon_url || "" }, thumbnail: { url: (e.thumbnail || {}).url || "" }, image: { url: (e.image || {}).url || "" }, footer: { text: (e.footer || {}).text || "", icon_url: (e.footer || {}).icon_url || "" }, fields: (e.fields || []).map((f) => ({ name: f.name || "", value: f.value || "", inline: !!f.inline })) })),
      components: ebSerializeComponents(eb.components || []),
    };
  }
  function applyModel(eb, m) {
    m = m || {};
    eb.content = m.content || "";
    eb.allowedMentions = m.allowedMentions || "default";
    const arr = Array.isArray(m.embeds) ? m.embeds : (m.embed ? [m.embed] : []);
    eb.embeds = (arr.length ? arr : [ebBlankEmbed()]).map((e) => Object.assign(ebBlankEmbed(), e, { author: Object.assign({ name: "", url: "", icon_url: "" }, e.author || {}), thumbnail: Object.assign({ url: "" }, e.thumbnail || {}), image: Object.assign({ url: "" }, e.image || {}), footer: Object.assign({ text: "", icon_url: "" }, e.footer || {}), fields: Array.isArray(e.fields) ? e.fields : [] }));
    eb.activeEmbed = 0;
    eb.components = Array.isArray(m.components) ? m.components : [];
  }
  function ebValidate(eb) {
    const errs = [];
    if ((eb.content || "").length > EB_LIMITS.content) errs.push(`Message content over ${EB_LIMITS.content}.`);
    if (eb.embeds.length > EB_LIMITS.embeds) errs.push(`Max ${EB_LIMITS.embeds} embeds.`);
    eb.embeds.forEach((e, i) => {
      if ((e.title || "").length > EB_LIMITS.title) errs.push(`Embed ${i + 1}: title over ${EB_LIMITS.title}.`);
      if ((e.description || "").length > EB_LIMITS.description) errs.push(`Embed ${i + 1}: description over ${EB_LIMITS.description}.`);
      if (((e.footer || {}).text || "").length > EB_LIMITS.footer) errs.push(`Embed ${i + 1}: footer over ${EB_LIMITS.footer}.`);
      if ((e.fields || []).length > EB_LIMITS.fields) errs.push(`Embed ${i + 1}: over ${EB_LIMITS.fields} fields.`);
      (e.fields || []).forEach((f, j) => { if ((s2(f.name) && !s2(f.value)) || (!s2(f.name) && s2(f.value))) errs.push(`Embed ${i + 1} field ${j + 1}: name and value both required.`); if ((f.value || "").length > EB_LIMITS.fieldValue) errs.push(`Embed ${i + 1} field ${j + 1}: value over ${EB_LIMITS.fieldValue}.`); });
      if (ebCharCount(e) > EB_LIMITS.total) errs.push(`Embed ${i + 1}: total over ${EB_LIMITS.total} characters.`);
    });
    const ids = new Set();
    if (eb.components.length > EB_LIMITS.rows) errs.push(`Max ${EB_LIMITS.rows} action rows.`);
    eb.components.forEach((row, i) => {
      if (row.type === "buttons") {
        if ((row.buttons || []).length > EB_LIMITS.buttonsPerRow) errs.push(`Row ${i + 1}: max ${EB_LIMITS.buttonsPerRow} buttons.`);
        (row.buttons || []).forEach((b, j) => {
          if (!s2(b.label) && !s2(b.emoji)) errs.push(`Row ${i + 1} button ${j + 1}: needs a label or emoji.`);
          if (b.style === "link") { if (!/^https?:\/\//i.test(b.url || "")) errs.push(`Row ${i + 1} button ${j + 1}: link needs http(s) URL.`); }
          // custom_id is auto-derived from the label on send; only flag a clash
          // between two MANUALLY-set ids.
          else if (s2(b.custom_id)) { if (ids.has(b.custom_id)) errs.push(`Duplicate custom ID “${b.custom_id}”.`); else ids.add(b.custom_id); }
        });
      } else if (row.type === "select") {
        if (s2(row.custom_id)) { if (ids.has(row.custom_id)) errs.push(`Duplicate custom ID “${row.custom_id}”.`); else ids.add(row.custom_id); }
        if (!(row.options || []).length) errs.push(`Row ${i + 1}: select needs an option.`);
        if ((row.options || []).length > EB_LIMITS.options) errs.push(`Row ${i + 1}: max ${EB_LIMITS.options} options.`);
        const minV = row.min_values == null ? 1 : row.min_values, maxV = row.max_values == null ? 1 : row.max_values;
        if (minV > maxV) errs.push(`Row ${i + 1}: min values can't exceed max values.`);
        if (maxV > (row.options || []).length) errs.push(`Row ${i + 1}: max values can't exceed the number of options.`);
        (row.options || []).forEach((o, j) => { if (!s2(o.label) || !s2(o.value)) errs.push(`Row ${i + 1} option ${j + 1}: label and value required.`); });
      }
    });
    const anyEmbed = eb.embeds.some((e) => !ebEmbedEmpty(e));
    if (!s2(eb.content) && !anyEmbed && !eb.components.length) errs.push("Message is empty — add content, an embed, or components.");
    return errs;
  }
  function ebMarkdown(t) {
    let x = escapeHtml(t || "");
    // Custom Discord emojis: <:name:id> / <a:name:id> → <img> (escaped to &lt;…&gt;).
    x = x.replace(/&lt;(a)?:(\w+):(\d+)&gt;/g, (_, anim, name, id) => `<img class="eb-cemoji-text" src="https://cdn.discordapp.com/emojis/${id}.${anim ? "gif" : "png"}?size=44" alt=":${name}:" title=":${name}:" onerror="this.replaceWith(document.createTextNode(':${name}:'))">`);
    x = x.replace(/```([\s\S]*?)```/g, (_, c) => `<pre>${c}</pre>`).replace(/`([^`]+)`/g, "<code>$1</code>");
    x = x.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>").replace(/__([^_]+)__/g, "<u>$1</u>").replace(/~~([^~]+)~~/g, "<s>$1</s>");
    x = x.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    x = x.replace(/^&gt; (.*)$/gm, "<span class='eb-quote'>$1</span>").replace(/^- (.*)$/gm, "• $1");
    return x.replace(/\n/g, "<br>");
  }
  function ebRel(dbStr) { const ms = dbStr ? Date.parse(String(dbStr).replace(" ", "T") + (String(dbStr).includes("Z") ? "" : "Z")) : NaN; if (isNaN(ms)) return "—"; const d = Math.round((Date.now() - ms) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : d + "d ago"; }
  function eb_tsMode(e) { return !e.timestamp ? "none" : (e.timestamp === true || e.timestamp === "now") ? "now" : "custom"; }
  function eb_tsLocal(e) { try { const d = new Date(e.timestamp); return isNaN(d) ? "" : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); } catch { return ""; } }
  function eb_setTimestamp(e, mode) { e.timestamp = mode === "none" ? null : mode === "now" ? "now" : new Date().toISOString(); }
  function wrapSel(ta, pre, post, cb) { const a = ta.selectionStart || 0, b = ta.selectionEnd || 0, v = ta.value; ta.value = v.slice(0, a) + pre + v.slice(a, b) + post + v.slice(b); ta.focus(); ta.selectionStart = a + pre.length; ta.selectionEnd = b + pre.length; cb(ta.value); }
  function ebErr(e) { return (e && e.body && (e.body.error || (e.body.errors && e.body.errors[0] && e.body.errors[0].msg))) || (e && e.message) || ""; }
  function ebSendErr(r) { const m = { validation: "Validation failed — check the issues panel.", channel_not_found: "Channel no longer exists.", not_text_channel: "That channel can't receive messages.", missing_send_permission: "The bot can't send messages in that channel.", missing_embed_permission: "The bot lacks the Embed Links permission there.", bot_not_in_guild: "The bot isn't in this server.", send_failed: "Discord rejected the message." }; return (r && (m[r.error] || r.detail || r.error)) || "Send failed"; }

  /** Generic shimmer used while a module / tab is loading. */
  function renderGenericSkeleton() {
    return h("div", null,
      h("div", { class: "skel-card" },
        h("div", { class: "skel skel-line lg w-30" }),
        h("div", { class: "skel skel-line w-70" })
      ),
      h("div", { class: "skel-card" },
        h("div", { class: "skel skel-line lg w-50" }),
        h("div", { class: "skel skel-line w-90" }),
        h("div", { class: "skel skel-line w-70" }),
        h("div", { class: "skel skel-line w-50" })
      )
    );
  }

  /** Standardized module-page hero. icon + title + tier + status badge. */
  function renderModuleHero(mod, statusBadge) {
    const ico = h("div", { class: "dash-module-hero-ico" });
    ico.appendChild(iconSvg(TAB_ICONS[mod.name] || "list"));
    return h("div", { class: "dash-module-hero" },
      ico,
      h("div", { class: "dash-module-hero-body" },
        h("div", { class: "dash-module-hero-row" },
          h("h2", { class: "dash-module-hero-title" }, mod.label),
          mod.tier === "premium"
            ? h("span", { class: "dash-status-pill premium" }, h("span", { class: "pill-dot" }), "Premium")
            : h("span", { class: "dash-status-pill" }, "Free"),
          statusBadge || null
        ),
        mod.description ? h("p", { class: "dash-module-hero-desc" }, mod.description) : null
      )
    );
  }

  /** Heuristic: do the saved values look "configured"? Used for the status pill. */
  function detectModuleStatus(mod, values) {
    if (!values || typeof values !== "object") return "missing";
    const enabledField = (mod.fields || []).find((f) => f.key === "enabled");
    if (enabledField) {
      if (values.enabled === true) return "configured";
      return "missing";
    }
    // Otherwise consider it configured if any non-default value is present
    const hasValue = Object.values(values).some((v) =>
      v !== "" && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && v !== false
    );
    return hasValue ? "configured" : "missing";
  }
  function statusBadgeFor(status) {
    if (status === "configured") return h("span", { class: "dash-status-pill ok" }, h("span", { class: "pill-dot" }), "Configured");
    return h("span", { class: "dash-status-pill warn" }, "Not set up");
  }

  /* ============================================================
     Tab: Setup Hub — mirrors the Discord /setup category grid.
     15 cards, same emojis, status pills, click-to-configure.
     ============================================================ */
  // Mirrors handlers/setup.js HUB_CATEGORIES on the bot. Order
  // matches Discord layout. Each `module` maps the card to a real
  // dashboard module tab; `comingSoon: true` means the dashboard
  // tab isn't wired yet (configure in Discord for now).
  const SETUP_HUB = [
    { id: "levels",      label: "Levels",      emoji: "⚡", module: "xp",            flag: "xp" },
    { id: "welcome",     label: "Welcome",     emoji: "👋", module: "welcome",       flag: "welcome" },
    { id: "roleMenus",   label: "Role Menus",  emoji: "🎭", module: "roleMenus",     flag: "roleMenus" },
    { id: "moderation",  label: "Moderation",  emoji: "🛡️", module: "moderation",   flag: "moderation" },
    { id: "tickets",     label: "Tickets",     emoji: "🎫", module: "tickets",       flag: "tickets",    tier: "premium" },
    { id: "payments",    label: "Payments",    emoji: "💳", module: "payments",      flag: "payments",   tier: "premium" },
    { id: "staffPay",    label: "Staff Pay",   emoji: "💷", module: "staffPay",      flag: "staffPay",   tier: "premium" },
    { id: "hype",        label: "Hype System", emoji: "🔥", module: "hype",          flag: "hype",       tier: "premium" },
    { id: "events",      label: "Events",      emoji: "📋", module: "events",        flag: null,         tier: "premium" },
    { id: "branding",    label: "Branding",    emoji: "🎨", module: "branding",      flag: "branding",   tier: "premium" },
    { id: "suggestions", label: "Suggestions", emoji: "🔔", module: null,            flag: null,         comingSoon: true },
    { id: "sticky",      label: "Sticky",      emoji: "📌", module: null,            flag: null,         comingSoon: true },
  ];

  // One-line descriptions for the Setup Hub cards (mockup style).
  const SETUP_HUB_DESC = {
    levels:      "Reward activity with XP and levels.",
    welcome:     "Greet new members with style.",
    roleMenus:   "Create reaction role menus.",
    polls:       "Run quick role-gated polls.",
    moderation:  "Ban, kick, timeout, URL filter.",
    tickets:     "Manage support tickets easily.",
    payments:    "Accept PayPal payments securely.",
    staffPay:    "Pay your staff automatically.",
    hype:        "Build hype and engage your community.",
    events:      "Dino, Number & Vault credit events.",
    branding:    "Customize bot text, colors and more.",
    suggestions: "Collect member suggestions.",
    sticky:      "Keep a message pinned to the bottom.",
  };

  // Setup Hub "mark as done" persistence. Flagged categories use the backend
  // override (it syncs with Discord /setup + the overview ring). The handful of
  // flagless categories (polls, events, suggestions, sticky) have no
  // backend flag to store against, so their manual "done" lives in localStorage,
  // keyed per guild.
  function hubLocalKey(gid) { return `arkoris:setupDone:${gid}`; }
  function hubLocalDone(gid) {
    try { return new Set(JSON.parse(localStorage.getItem(hubLocalKey(gid)) || "[]")); }
    catch { return new Set(); }
  }
  function hubSetLocalDone(gid, id, value) {
    const set = hubLocalDone(gid);
    if (value) set.add(id); else set.delete(id);
    try { localStorage.setItem(hubLocalKey(gid), JSON.stringify([...set])); } catch (_) {}
  }

  // True when EVERY Setup Hub card is done (flagged ones via backend flags,
  // flagless ones via localStorage). This is the signal for hiding the hub
  // entirely once a server is fully configured.
  function hubAllDone(flags) {
    const f = flags || {};
    const localDone = hubLocalDone(state.selectedGuildId);
    return SETUP_HUB.every((c) => c.flag ? !!f[c.flag] : localDone.has(c.id));
  }
  // Cache the latest setup status per guild so the sidebar — which renders
  // before any tab fetch — can decide whether to show the Setup Hub without a
  // fetch of its own. Refreshed whenever Overview / Setup Hub pull /overview.
  function cacheSetupStatus(gid, setup) {
    // Bind to the guild the data was fetched FOR, and drop a response that
    // resolved after the user already switched guilds (cross-guild bleed guard).
    if (gid !== state.selectedGuildId) return;
    state.setupStatus = { guildId: gid, setup: setup || {} };
  }
  async function ensureSetupStatus() {
    if (state.setupStatus && state.setupStatus.guildId === state.selectedGuildId) return state.setupStatus.setup;
    const gid = state.selectedGuildId;
    try { const o = await data.overview(gid); cacheSetupStatus(gid, o.setup); }
    catch { cacheSetupStatus(gid, (state.setupStatus && state.setupStatus.setup) || {}); }
    return (state.setupStatus && state.setupStatus.guildId === state.selectedGuildId) ? state.setupStatus.setup : {};
  }

  async function loadSetupHub(content) {
    try {
      const gid = state.selectedGuildId;
      const o = await data.overview(gid);
      cacheSetupStatus(gid, o.setup);
      const flags = o.setup?.flags || {};
      const overrides = o.setup?.overrides || {};
      const guild = state.guilds.find((g) => g.id === state.selectedGuildId) || {};
      const isPremium = !!o.premiumActive || (guild.plan && guild.plan !== "free")
        || o.plan === "premium" || o.plan === "monthly" || o.plan === "lifetime";
      const localDone = hubLocalDone(state.selectedGuildId);
      clear(content);

      // Done = auto-detected / backend-overridden (flagged) OR locally marked
      // (flagless). Manual = something we let the user undo (an explicit mark).
      const isDone = (cat) => cat.flag ? !!flags[cat.flag] : localDone.has(cat.id);
      const isManual = (cat) => cat.flag ? !!overrides[cat.flag] : localDone.has(cat.id);
      const isLocked = (cat) => cat.tier === "premium" && !isPremium;
      const todo = SETUP_HUB.filter((c) => !isDone(c));
      const doneCats = SETUP_HUB.filter((c) => isDone(c));

      // Persist a "done" mark (or undo it), then re-render this tab in place.
      async function markDone(cat, value, btn) {
        if (btn) btn.disabled = true;
        let stillConfigured = false;
        // Latest known flags, so we can detect when this was the final step.
        let flagsAfter = (state.setupStatus && state.setupStatus.setup && state.setupStatus.setup.flags) || flags;
        if (cat.flag) {
          try {
            const res = await data.setupOverride(gid, cat.flag, value);
            // The route returns the fresh setup status. Undo only clears the
            // manual mark — if the module is genuinely configured in Discord it
            // stays done, so don't claim we moved it back.
            if (res && res.flags) { flagsAfter = res.flags; cacheSetupStatus(gid, res); }
            if (!value && res && res.flags && res.flags[cat.flag]) stillConfigured = true;
          } catch (e) { toast("error", "Couldn't update — try again."); if (btn) btn.disabled = false; return; }
        } else {
          hubSetLocalDone(gid, cat.id, value);
        }

        // Final step done → the hub is about to disappear; take the user to the
        // Overview rather than re-render a hub that's being removed.
        if (value && hubAllDone(flagsAfter)) {
          state.activeTab = "overview";
          toast("success", "Setup complete — every module is configured. The Setup Hub is now hidden.");
          render();
          return;
        }

        if (value) toast("success", `Marked ${cat.label} as done.`);
        else if (stillConfigured) toast("info", `${cat.label} is still configured in Discord — change it there to move it back.`);
        else toast("success", `Moved ${cat.label} back to setup.`);
        // Re-render, then restore keyboard focus — the activated button was just
        // destroyed, so park focus somewhere sensible (Completed after a mark,
        // the to-do grid after an undo) instead of dropping it to <body>.
        await loadSetupHub(content);
        const tgt = value
          ? content.querySelector(".dsx-hub-done-head")
          : content.querySelector(".dsx-hub-card-main");
        (tgt || content.querySelector(".dsx-hub-done-head") || content.querySelector(".dsx-hub-card-main"))?.focus();
      }

      const wrap = h("div", { class: "dsx-hub" });

      // Header — hub-local tally (counts both backend flags and local marks).
      wrap.append(
        h("header", { class: "dsx-hub-head" },
          h("div", null,
            h("h1", { class: "dsx-hub-title" }, "Setup Hub"),
            h("p", { class: "dsx-hub-sub" },
              "What's left to configure. Finished modules move to Completed below — most save straight to the bot, same as ",
              h("code", null, "/setup"), " in Discord; a few optional extras are remembered only in this browser.")
          ),
          h("span", { class: "dsx-hub-progress" }, `${doneCats.length} / ${SETUP_HUB.length} set up`)
        )
      );

      // To-do grid (or an all-set state when nothing is left).
      if (todo.length === 0) {
        const allset = h("div", { class: "dsx-hub-allset" });
        const ai = h("span", { class: "dsx-hub-allset-ico", "aria-hidden": "true" }); ai.append(iconSvg("check"));
        allset.append(ai,
          h("div", { class: "dsx-hub-allset-title" }, "Everything's set up"),
          h("div", { class: "dsx-hub-allset-sub" }, "Every module is configured. Reopen one from Completed below if you need to change it.")
        );
        wrap.append(allset);
      } else {
        const grid = h("div", { class: "dsx-hub-grid" });
        todo.forEach((cat) => {
          const locked = isLocked(cat);
          const card = h("div", { class: "dsx-hub-card" + (locked ? " locked" : "") });
          const main = h("button", {
            type: "button",
            class: "dsx-hub-card-main",
            onclick: () => {
              if (cat.comingSoon) { toast("warn", `${cat.label} is configured in Discord via /setup for now.`, 4500); return; }
              if (cat.module) { state.activeTab = cat.module; render(); }
            },
          });
          const ico = h("span", { class: "dsx-hub-card-ico", "aria-hidden": "true" }); ico.append(iconSvg(TAB_ICONS[cat.module] || "grid"));
          const cta = h("span", { class: "dsx-enter", "aria-hidden": "true" }); cta.append(iconSvg("arrowRight"));
          main.append(
            h("div", { class: "dsx-hub-card-top" },
              ico,
              h("div", { class: "dsx-hub-card-badges" },
                cat.tier === "premium" ? h("span", { class: "dsx-nav-pro" }, "PRO") : null
              )
            ),
            h("div", { class: "dsx-hub-card-name" }, cat.label),
            h("div", { class: "dsx-hub-card-desc" }, SETUP_HUB_DESC[cat.id] || "Configure this module."),
            h("span", { class: "dsx-hub-card-cta" }, cat.comingSoon ? "Discord only" : "Configure", cta)
          );
          card.append(main);
          // "Mark as done" — hidden on locked premium cards (can't use them yet).
          if (!locked) {
            const foot = h("div", { class: "dsx-hub-card-foot" });
            const mark = h("button", { type: "button", class: "dsx-hub-card-mark",
              onclick: (ev) => markDone(cat, true, ev.currentTarget) });
            const mi = h("span", { class: "dsx-hub-card-mark-ico", "aria-hidden": "true" }); mi.append(iconSvg("check"));
            mark.append(mi, "Mark as done");
            foot.append(mark);
            card.append(foot);
          }
          grid.appendChild(card);
        });
        wrap.append(grid);
      }

      // Completed — collapsed disclosure; configured items live here, out of the way.
      if (doneCats.length) {
        const open = !!state._hubDoneOpen;
        const section = h("div", { class: "dsx-hub-done" + (open ? " open" : "") });
        const chev = h("span", { class: "dsx-hub-done-chev", "aria-hidden": "true" }); chev.append(iconSvg("chevron"));
        const head = h("button", { type: "button", class: "dsx-hub-done-head", "aria-expanded": open ? "true" : "false", "aria-controls": "dsx-hub-done-list" },
          chev, h("span", { class: "dsx-hub-done-head-label" }, `Completed (${doneCats.length})`)
        );
        head.onclick = () => {
          state._hubDoneOpen = !state._hubDoneOpen;
          const nowOpen = !!state._hubDoneOpen;
          section.classList.toggle("open", nowOpen);
          head.setAttribute("aria-expanded", nowOpen ? "true" : "false");
        };
        const list = h("div", { class: "dsx-hub-done-list", id: "dsx-hub-done-list" });
        doneCats.forEach((cat) => {
          const manual = isManual(cat);
          const row = h("div", { class: "dsx-hub-done-row" });
          const jump = h("button", { type: "button", class: "dsx-hub-done-jump",
            onclick: () => {
              if (cat.comingSoon || !cat.module) { toast("warn", `${cat.label} is managed in Discord via /setup.`, 4000); return; }
              state.activeTab = cat.module; render();
            } });
          const ck = h("span", { class: "dsx-hub-done-check", "aria-hidden": "true" }); ck.append(iconSvg("check"));
          jump.append(ck,
            h("span", { class: "dsx-hub-done-name" }, cat.label),
            h("span", { class: "dsx-hub-done-state" }, manual ? "Marked done" : "Configured")
          );
          row.append(jump);
          if (manual) {
            row.append(h("button", { type: "button", class: "dsx-hub-done-undo",
              title: "Move back to setup", onclick: (ev) => markDone(cat, false, ev.currentTarget) }, "Undo"));
          }
          list.append(row);
        });
        section.append(head, list);
        wrap.append(section);
      }

      content.append(wrap);
    } catch (e) { renderTabError(content, e); }
  }

  /** Right-rail quick-action row for the Setup Hub. `target` is either a
   *  URL string (external link) or a function (in-app navigation). */
  function renderHubAction(iconName, label, target) {
    const isFn = typeof target === "function";
    const el = h(isFn ? "button" : "a", {
      class: "hub-rail-action",
      type: isFn ? "button" : null,
      href: isFn ? null : (target || "#"),
      target: isFn ? null : "_blank",
      rel: isFn ? null : "noopener noreferrer",
      onclick: isFn ? target : null,
    },
      icon(iconName, "hub-rail-action-ico"),
      h("span", { class: "hub-rail-action-label" }, label),
      h("span", { class: "hub-rail-action-arrow" }, "›")
    );
    return el;
  }

  /* ============================================================
     Tab: Overview
     ============================================================ */
  async function loadOverview(content) {
    // Skeleton while we fetch
    clear(content);
    content.append(renderOverviewSkeleton());
    try {
      const gid = state.selectedGuildId;
      const guild = state.guilds.find((g) => g.id === gid) || {};
      // Overview + analytics in parallel. Analytics is best-effort.
      const [o, analytics] = await Promise.all([
        data.overview(gid),
        data.analytics(gid, 7).catch(() => null),
      ]);
      cacheSetupStatus(gid, o.setup);
      clear(content);
      // Rebuilt Discord-native overview (.dsx-ov-*): a health hero, a compact
      // weekly-activity row, quick actions, and recent activity. No old
      // .dash-card / .hub-shell / stat-grid / ring / pop-rail.
      const ovWrap = h("div", { class: "dsx-ov" });
      const upsell = renderOvUpgrade(o, guild);   // free servers only — null when premium
      if (upsell) ovWrap.append(upsell);
      ovWrap.append(
        renderOvHealth(o, guild),
        renderOvStats(analytics),
        renderOvActions(),
        renderOvActivity()
      );
      content.append(ovWrap);
    } catch (e) { renderTabError(content, e); }
  }

  // Free-plan upsell banner pinned to the top of the Overview. Premium / lifetime
  // servers never see it (returns null). The CTA jumps straight to the Premium
  // tab, where the on-site "Subscribe · Pay with PayPal" button lives — the
  // shortest path from a free user to a paying customer.
  function renderOvUpgrade(o, guild) {
    const plan = (guild && guild.plan) || "free";
    const premium = plan === "premium" || plan === "monthly" || plan === "annual" || plan === "lifetime"
      || !!(o && o.premiumActive);
    if (premium) return null;

    const perks = [
      "Full ARK management — lookup, controls, bans, wipes",
      "ARK Guard anti-cheat + auto-alerts",
      "Live in-game logs & game-chat relay",
      "Leaderboards, /grace timers & one-tap backup rollback",
      "Tickets, Staff Pay, Hype & advanced Credits",
      "Server templates & premium branding",
    ];
    const perkRow = h("div", { class: "dsx-up-perks" });
    perks.forEach((label) => {
      const chip = h("span", { class: "dsx-up-perk" });
      chip.append(iconSvg("check"));
      chip.append(h("span", null, label));
      perkRow.append(chip);
    });

    return h("section", { class: "dsx-ov-upgrade" },
      h("div", { class: "dsx-up-main" },
        h("div", { class: "dsx-up-text" },
          h("div", { class: "dsx-up-eyebrow" }, "Premium"),
          h("div", { class: "dsx-up-title" }, "Unlock the full Arkoris toolkit"),
          h("div", { class: "dsx-up-sub" },
            "This server is on the Free plan. Go Premium to switch on ARK management, "
            + "anti-cheat, live logs, leaderboards and more — $15/mo, cancel anytime.")
        ),
        h("button", { type: "button", class: "dsx-btn dsx-up-cta",
          onclick: () => { state.activeTab = "premium"; render(); } },
          "Upgrade to Premium")
      ),
      perkRow
    );
  }

  // Health-at-a-glance hero: identity + status + setup progress + CTA.
  function renderOvHealth(o, guild) {
    const setup = o.setup || {};
    const pct = Math.max(0, Math.min(100, Math.round(setup.percent || 0)));
    const setupComplete = hubAllDone(setup.flags);
    const members = (o.guild && o.guild.memberCount != null) ? o.guild.memberCount : null;
    const plan = guild.plan || "free";
    const premium = plan === "premium" || plan === "monthly" || plan === "annual" || plan === "lifetime";
    const planLabel = plan === "lifetime" ? "Lifetime" : premium ? "Premium" : "Free";

    const bar = h("div", { class: "dsx-ovh-bar" }, h("span", { style: { width: "0%" } }));
    requestAnimationFrame(() => setTimeout(() => { if (bar.firstChild) bar.firstChild.style.width = pct + "%"; }, 80));

    return h("section", { class: "dsx-ov-health" },
      h("div", { class: "dsx-ovh-main" },
        dscGuildIcon(guild, 56),
        h("div", { class: "dsx-ovh-id" },
          h("div", { class: "dsx-ovh-name" }, guild.name || "Your server"),
          h("div", { class: "dsx-ovh-meta" },
            h("span", { class: "dsx-status" }, h("span", { class: "dsx-dot online" }), "Bot online"),
            h("span", { class: "dsx-sep", "aria-hidden": "true" }, "·"),
            h("span", null, members != null ? fmtNum(members) + " members" : "Members syncing")
          )
        ),
        h("span", { class: "dsx-plan" + (premium ? " premium" : "") }, planLabel)
      ),
      setupComplete
        ? h("div", { class: "dsx-ovh-complete" },
            (() => { const i = h("span", { class: "dsx-ovh-complete-ico", "aria-hidden": "true" }); i.append(iconSvg("check")); return i; })(),
            h("span", null, "Setup complete — every module is configured"))
        : h("div", { class: "dsx-ovh-setup" },
            h("div", { class: "dsx-ovh-setup-head" },
              h("span", null, "Setup progress"),
              h("strong", null, pct + "%")
            ),
            bar
          ),
      setupComplete
        ? h("button", { type: "button", class: "dsx-btn dsx-btn-ghost",
            onclick: () => { state._forceHub = true; state.activeTab = "setup-hub"; render(); } },
            "Reopen Setup Hub")
        : h("button", { type: "button", class: "dsx-btn dsx-btn-primary",
            onclick: () => { state.activeTab = "setup-hub"; render(); } },
            pct >= 100 ? "Review setup" : "Continue setup")
    );
  }

  // Compact weekly activity (no big cards / sparklines).
  function renderOvStats(analytics) {
    const cards = (analytics && analytics.cards) || {};
    const mk = (label, c) => {
      c = c || {};
      const tile = h("div", { class: "dsx-ov-stat" },
        h("div", { class: "dsx-ov-stat-v" }, fmtNum(c.week || 0)),
        h("div", { class: "dsx-ov-stat-l" }, label)
      );
      if (typeof c.week === "number" && typeof c.prevWeek === "number") {
        const d = c.week - c.prevWeek;
        tile.append(h("div", { class: "dsx-ov-stat-d " + (d >= 0 ? "up" : "down") },
          (d >= 0 ? "▲ " : "▼ ") + fmtNum(Math.abs(d))));
      }
      return tile;
    };
    return h("section", { class: "dsx-ov-stats" },
      mk("Messages this week", cards.messages),
      mk("Commands this week", cards.commands),
      mk("/pop uses this week", cards.pop_uses)
    );
  }

  // Quick actions to configure (the user's stated priority).
  function renderOvActions() {
    const items = [
      ["welcome",   "hand",     "Welcome",    "Greet new members"],
      ["roleMenus", "masks",    "Role Menus", "Dropdown / button roles"],
      ["tickets",   "ticket",   "Tickets",    "Support tickets"],
      ["staffPay",  "wallet",   "Staff Pay",  "Per-role pay amounts"],
      ["events",    "calendar", "Events",     "Dino / vault credit events"],
      ["branding",  "palette",  "Branding",   "Customize embed look"],
    ];
    const grid = h("div", { class: "dsx-ov-actions" });
    items.forEach(([tab, ico, name, desc]) => {
      const icowrap = h("span", { class: "dsx-action-ico" }); icowrap.append(iconSvg(ico));
      const arrow = h("span", { class: "dsx-enter", "aria-hidden": "true" }); arrow.append(iconSvg("arrowRight"));
      grid.append(h("button", { type: "button", class: "dsx-action",
        onclick: () => { state.activeTab = tab; render(); }, "aria-label": "Configure " + name },
        icowrap,
        h("div", { class: "dsx-action-body" },
          h("div", { class: "dsx-action-name" }, name),
          h("div", { class: "dsx-action-desc" }, desc)
        ),
        arrow
      ));
    });
    return h("section", { class: "dsx-ov-section" },
      h("h2", { class: "dsx-ov-h" }, "Quick actions"),
      grid
    );
  }

  const OV_ACTION_LABELS = { module_save: "Saved settings", module_reset: "Reset module", panel_post: "Posted a panel", quick_setup: "Ran quick setup", paypal_save: "Saved PayPal", paypal_test: "Tested PayPal", login: "Signed in" };
  // Recent activity — compact list with empty state.
  function renderOvActivity() {
    const host = h("div", { class: "dsx-ov-activity" },
      h("div", { class: "dsx-ov-act-skel" }), h("div", { class: "dsx-ov-act-skel" }), h("div", { class: "dsx-ov-act-skel" }));
    data.audit(state.selectedGuildId).then((a) => {
      clear(host);
      const entries = (a.entries || []).slice(0, 6);
      if (!entries.length) {
        host.append(h("div", { class: "dsx-ov-empty" }, "No recent changes yet. Edits you make here will show up."));
        return;
      }
      entries.forEach((e) => {
        host.append(h("div", { class: "dsx-act-row" },
          h("span", { class: "dsx-act-dot " + (e.ok ? "ok" : "fail") }),
          h("span", { class: "dsx-act-label" }, OV_ACTION_LABELS[e.action] || e.action),
          h("span", { class: "dsx-act-target" }, e.target || ""),
          h("span", { class: "dsx-act-time" }, fmtAuditTime(e.ts))
        ));
      });
    }).catch(() => {
      clear(host);
      host.append(h("div", { class: "dsx-ov-empty" }, "Activity unavailable right now."));
    });
    return h("section", { class: "dsx-ov-section" },
      h("h2", { class: "dsx-ov-h" }, "Recent activity"),
      host
    );
  }
  function fmtAuditTime(ts) {
    try { return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
    catch (e) { return ""; }
  }

  /** Live cluster-population panel for the Overview right rail. Pulls the
   *  global /pop leaderboard (Wildcard snapshot poller) by game + platform.
   *  ASA is crossplay so it has no platform choice; ASE defaults to Xbox. */
  function renderLivePopPanel() {
    const st = { game: "ase", platform: "xbox" };
    const card = h("div", { class: "hub-rail-card livepop-card" });

    const gameRow = h("div", { class: "livepop-segs" });
    const platRow = h("div", { class: "livepop-segs" });
    const list = h("div", { class: "livepop-list" });

    const seg = (label, active, onclick) =>
      h("button", { type: "button", class: "livepop-seg" + (active ? " active" : ""), onclick }, label);

    function paintGameRow() {
      clear(gameRow);
      [["ase", "ASE"], ["asa", "ASA"]].forEach(([v, lbl]) =>
        gameRow.append(seg(lbl, st.game === v, () => {
          if (st.game === v) return;
          st.game = v;
          refresh();
        })));
    }

    function paintPlatRow() {
      clear(platRow);
      if (st.game === "asa") {
        platRow.append(h("div", { class: "livepop-note" },
          "ASA is crossplay — all platforms combined."));
        return;
      }
      [["steam", "Steam"], ["xbox", "Xbox"], ["ps", "PlayStation"]].forEach(([v, lbl]) =>
        platRow.append(seg(lbl, st.platform === v, () => {
          if (st.platform === v) return;
          st.platform = v;
          refresh();
        })));
    }

    async function refresh() {
      paintGameRow();
      paintPlatRow();
      clear(list);
      list.append(h("div", { class: "livepop-msg" }, "Loading live population…"));
      try {
        const qp = st.game === "asa"
          ? "game=asa"
          : `game=ase&platform=${st.platform}`;
        const r = await api(`/api/dashboard/pop/leaderboard?${qp}&limit=5`);
        clear(list);
        const clusters = r.clusters || [];
        if (!clusters.length) {
          list.append(h("div", { class: "livepop-msg" },
            "No live data for this selection yet."));
          return;
        }
        clusters.forEach((c, i) => {
          const cap = c.maxPlayers || 0;
          const pct = cap ? Math.min(100, Math.round((c.players / cap) * 100)) : 0;
          list.append(
            h("div", { class: "livepop-row" },
              h("span", { class: "livepop-rank" }, String(i + 1)),
              h("div", { class: "livepop-body" },
                h("div", { class: "livepop-name", title: c.name || "" }, c.name || "Unknown"),
                h("div", { class: "livepop-bar" },
                  h("span", { style: { width: pct + "%" } }))
              ),
              h("div", { class: "livepop-count" },
                h("strong", null, (c.players || 0).toLocaleString()),
                cap ? h("span", null, " / " + cap.toLocaleString()) : null)
            )
          );
        });
      } catch (e) {
        clear(list);
        list.append(h("div", { class: "livepop-msg" }, "Live population unavailable."));
      }
    }

    card.append(
      h("div", { class: "livepop-head" },
        h("div", { class: "hub-rail-label" }, "Live Cluster Population"),
        h("span", { class: "livepop-live" }, h("span", { class: "livepop-dot" }), "LIVE")
      ),
      gameRow,
      platRow,
      list
    );
    refresh();
    return card;
  }

  /** Animated circular progress ring (SVG). Returns a wrapper div. */
  function renderProgressRing(pct, opts) {
    opts = opts || {};
    const size = opts.size || 140;
    const stroke = opts.stroke || 12;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
    const offset = circ * (1 - clamped / 100);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("class", "ring-svg");
    const mk = (cls) => {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", size / 2);
      c.setAttribute("cy", size / 2);
      c.setAttribute("r", r);
      c.setAttribute("fill", "none");
      c.setAttribute("stroke-width", stroke);
      c.setAttribute("class", cls);
      return c;
    };
    const track = mk("ring-track");
    const fill = mk("ring-fill");
    fill.setAttribute("stroke-linecap", "round");
    fill.setAttribute("stroke-dasharray", circ);
    fill.setAttribute("stroke-dashoffset", circ); // start empty
    svg.append(track, fill);
    const wrap = h("div", { class: "ring-wrap", style: { width: size + "px", height: size + "px" } },
      svg,
      h("div", { class: "ring-label" },
        h("div", { class: "ring-pct" }, clamped + "%"),
        h("div", { class: "ring-sub" }, opts.label || "Complete")
      )
    );
    // Animate to target once mounted
    requestAnimationFrame(() => setTimeout(() => { fill.setAttribute("stroke-dashoffset", offset); }, 60));
    return wrap;
  }

  /** "Bot Setup Progress" card — ring on the left, clickable checklist
   *  of every module flag on the right. Real data from /overview. */
  function renderSetupProgressCard(o) {
    const setup = o.setup || { percent: 0, total: 0 };
    const flags = setup.flags || {};
    const overrides = setup.overrides || {};
    const entries = Object.entries(flags).filter(([k]) => k !== "population");
    const completed = entries.filter(([, v]) => v).length;

    const ringCol = h("div", { class: "setup-ring-col" },
      renderProgressRing(setup.percent || 0, { label: "Configured" }),
      h("div", { class: "setup-ring-meta" }, `${completed} of ${entries.length} modules`),
      btn("Continue setup", { kind: "btn-primary", onclick: () => { state.activeTab = "setup-hub"; render(); } })
    );

    // Manually mark a module done (or undo it) when auto-detection misses it.
    async function toggleOverride(k, done) {
      try {
        await data.setupOverride(state.selectedGuildId, k, done);
        toast("success", done
          ? `Marked ${prettyName(k)} as done.`
          : `${prettyName(k)} back to auto-detect.`);
        render();
      } catch (e) {
        toast("error", "Couldn't update — try again.");
      }
    }

    const checklist = h("div", { class: "setup-checklist" },
      ...entries.map(([k, v]) => {
        const ov = !!overrides[k];
        return h("div", { class: "setup-check-row " + (v ? "done" : "todo") },
          h("button", {
            type: "button",
            class: "setup-check-nav",
            onclick: () => { state.activeTab = mapFlagToModule(k); render(); },
          },
            h("span", { class: "setup-check-box" }, v ? "✓" : ""),
            h("span", { class: "setup-check-name" }, prettyName(k)),
            h("span", { class: "setup-check-state" },
              v ? (ov ? "Marked done" : "Configured") : "Set up →")
          ),
          // Mark-done / undo — hidden on purely auto-detected rows.
          (!v || ov)
            ? h("button", {
                type: "button",
                class: "setup-check-mark" + (ov ? " active" : ""),
                title: ov ? "Marked done manually — click to undo" : "Mark this module as done",
                onclick: () => toggleOverride(k, !ov),
              }, ov ? "Undo" : "Mark done")
            : null
        );
      })
    );

    return h("div", { class: "dash-card" },
      h("h3", null, "Bot Setup Progress"),
      h("p", null, "Track configuration across every module. Click a row to jump to it — or mark one done if detection misses it."),
      h("div", { class: "setup-progress-grid" }, ringCol, checklist)
    );
  }

  /* ============================================================
     Analytics rendering — real per-guild activity
     ============================================================ */
  const METRIC_META = {
    messages:    { label: "Messages",    iconName: "list" },
    commands:    { label: "Commands",    iconName: "grid" },
    voice_joins: { label: "Voice Joins", iconName: "activity" },
    welcomes:    { label: "Welcomes",    iconName: "hand" },
    pop_uses:    { label: "/pop Uses",   iconName: "activity" },
    members:     { label: "Members",     iconName: "user" },
  };

  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1000)    return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(Math.round(n));
  }

  /** Round up to a clean axis maximum. */
  function niceCeil(n) {
    if (n <= 5) return 5;
    const mag = Math.pow(10, Math.floor(Math.log10(n)));
    const norm = n / mag;
    const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return nice * mag;
  }

  /** Tiny inline sparkline SVG string from a [{day,value}] series. */
  function sparklineSvg(series) {
    const vals = (series || []).map((p) => p.value || 0);
    if (vals.length < 2) return "";
    const W = 120, H = 30;
    const max = Math.max(...vals), min = Math.min(...vals);
    const span = Math.max(1, max - min);
    const n = vals.length;
    const pts = vals.map((v, i) => [
      (i / (n - 1)) * W,
      H - 3 - ((v - min) / span) * (H - 6),
    ]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = line + ` L${W} ${H} L0 ${H} Z`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="spark-svg">`
      + `<path d="${area}" fill="rgba(88,101,242,0.16)"/>`
      + `<path d="${line}" fill="none" stroke="var(--dash-red-2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
      + `</svg>`;
  }

  /** Area chart from a [{day,value}] series. Returns { svg, geo } so the
   *  caller can wire hover tooltips (geo carries the point coordinates). */
  function areaChartSvg(series) {
    const W = 760, H = 280;
    const padL = 48, padR = 18, padT = 18, padB = 34;
    const pw = W - padL - padR, ph = H - padT - padB;
    const vals = (series || []).map((p) => p.value || 0);
    const n = vals.length;
    if (!n) return { svg: `<svg viewBox="0 0 ${W} ${H}"></svg>`, geo: { pts: [], series: [] } };
    const niceMax = niceCeil(Math.max(1, ...vals));
    const X = (i) => padL + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw);
    const Y = (v) => padT + ph - (v / niceMax) * ph;
    const pts = vals.map((v, i) => [X(i), Y(v)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const baseY = padT + ph;
    const area = line + ` L${X(n - 1).toFixed(1)} ${baseY} L${X(0).toFixed(1)} ${baseY} Z`;
    let grid = "", ylab = "";
    [0, niceMax / 2, niceMax].forEach((t) => {
      const y = Y(t);
      grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.06)"/>`;
      ylab += `<text x="${padL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="chart-axis">${fmtNum(t)}</text>`;
    });
    let xlab = "";
    const step = Math.max(1, Math.ceil(n / 6));
    series.forEach((p, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      const d = new Date(p.day + "T00:00:00Z");
      const lbl = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      xlab += `<text x="${X(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" class="chart-axis">${lbl}</text>`;
    });
    const dots = pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.4" class="chart-dot"/>`).join("");
    // Hover layer — a vertical guide line + emphasised dot, hidden until the
    // hover handler (wireChartHover) moves them to the nearest data point.
    const hover = `<line class="chart-guide" x1="0" y1="${padT}" x2="0" y2="${baseY.toFixed(1)}" style="opacity:0"/>`
      + `<circle class="chart-hover-dot" cx="0" cy="0" r="5" style="opacity:0"/>`;
    const svg = `<svg viewBox="0 0 ${W} ${H}" class="area-chart" preserveAspectRatio="xMidYMid meet">`
      + `<defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0%" stop-color="rgba(88,101,242,0.44)"/>`
      + `<stop offset="100%" stop-color="rgba(88,101,242,0.02)"/>`
      + `</linearGradient></defs>`
      + grid
      + `<path d="${area}" fill="url(#areaGrad)"/>`
      + `<path d="${line}" fill="none" stroke="var(--dash-red)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`
      + dots + ylab + xlab + hover
      + `</svg>`;
    return { svg, geo: { pts, series } };
  }

  /** Build a ready-to-insert area-chart element from a series. Wraps the SVG,
   *  adds the hover tooltip layer, and wires hover. Always use THIS — never
   *  pass areaChartSvg() (which returns { svg, geo }) to an `html` prop, or it
   *  stringifies the object to the literal "[object Object]". */
  function areaChartWrap(series, label) {
    const built = areaChartSvg(series);
    const wrap = h("div", { class: "area-chart-wrap" });
    wrap.innerHTML = built.svg;
    wrap.appendChild(h("div", { class: "chart-tip" }));
    if (label != null) { try { wireChartHover(wrap, built.geo, label); } catch {} }
    return wrap;
  }

  /** Wire a hover tooltip + guide line onto an .area-chart-wrap. Maps the
   *  cursor to the nearest data point and shows its date + value. Uses the
   *  SVG screen-CTM so it stays correct at any responsive scale. */
  function wireChartHover(wrap, geo, metricLabel) {
    const svg = wrap.querySelector("svg");
    const tip = wrap.querySelector(".chart-tip");
    const guide = wrap.querySelector(".chart-guide");
    const dot = wrap.querySelector(".chart-hover-dot");
    if (!svg || !tip || !geo.pts.length) return;

    function hide() {
      tip.classList.remove("show");
      if (guide) guide.style.opacity = "0";
      if (dot) dot.style.opacity = "0";
    }

    function move(src) {
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const sp = svg.createSVGPoint();
      sp.x = src.clientX; sp.y = src.clientY;
      const loc = sp.matrixTransform(ctm.inverse()); // → viewBox coords
      let best = 0, bestD = Infinity;
      geo.pts.forEach((p, i) => {
        const d = Math.abs(p[0] - loc.x);
        if (d < bestD) { bestD = d; best = i; }
      });
      const [px, py] = geo.pts[best];
      const datum = geo.series[best] || {};
      if (guide) { guide.setAttribute("x1", px); guide.setAttribute("x2", px); guide.style.opacity = "1"; }
      if (dot) { dot.setAttribute("cx", px); dot.setAttribute("cy", py); dot.style.opacity = "1"; }

      const dayLbl = datum.day
        ? new Date(datum.day + "T00:00:00Z").toLocaleDateString(undefined,
            { weekday: "short", month: "short", day: "numeric" })
        : "";
      clear(tip);
      tip.append(
        h("div", { class: "chart-tip-v" }, fmtNum(datum.value || 0) + " " + String(metricLabel).toLowerCase()),
        h("div", { class: "chart-tip-d" }, dayLbl)
      );
      // Place the tooltip in pixel space, above the point, clamped to the box.
      const scr = svg.createSVGPoint();
      scr.x = px; scr.y = py;
      const screenPt = scr.matrixTransform(ctm);
      const wr = wrap.getBoundingClientRect();
      const x = Math.max(58, Math.min(wr.width - 58, screenPt.x - wr.left));
      tip.style.left = x + "px";
      tip.style.top = (screenPt.y - wr.top) + "px";
      tip.classList.add("show");
    }

    svg.addEventListener("mousemove", move);
    svg.addEventListener("mouseleave", hide);
    svg.addEventListener("touchstart", (e) => { if (e.touches[0]) move(e.touches[0]); }, { passive: true });
    svg.addEventListener("touchmove", (e) => { if (e.touches[0]) move(e.touches[0]); }, { passive: true });
  }

  /** Activity stat grid — Members + Messages/Commands//pop this week. */
  function renderActivityStatGrid(o, analytics) {
    const grid = h("div", { class: "dash-stat-grid" });
    const cards = (analytics && analytics.cards) || {};
    const memberVal = (analytics && analytics.members != null)
      ? analytics.members
      : (o.guild && o.guild.memberCount != null ? o.guild.memberCount : null);

    grid.append(renderActivityCard({
      label: "Members",
      value: memberVal != null ? fmtNum(memberVal) : "—",
      iconName: "user",
      sub: "in this server",
      series: analytics && analytics.memberSeries,
    }));

    [["messages", "Messages"], ["commands", "Commands"], ["pop_uses", "/pop Uses"]].forEach(([m, label]) => {
      const c = cards[m] || { total: 0, week: 0, prevWeek: 0 };
      grid.append(renderActivityCard({
        label,
        value: fmtNum(c.week),
        delta: c.week - c.prevWeek,
        deltaSuffix: " this week",
        iconName: METRIC_META[m].iconName,
        series: analytics && analytics.series && analytics.series[m],
      }));
    });
    return grid;
  }

  function renderActivityCard({ label, value, sub, delta, deltaSuffix, iconName, series }) {
    const card = h("div", { class: "dash-stat activity-stat" });
    const ic = h("span", { class: "dash-stat-ico" });
    ic.appendChild(iconSvg(iconName));
    card.append(
      h("div", { class: "dash-stat-l" }, label),
      ic,
      h("div", { class: "dash-stat-v" }, value)
    );
    if (typeof delta === "number") {
      const up = delta >= 0;
      card.append(h("div", { class: "dash-stat-delta " + (up ? "up" : "down") },
        (up ? "▲ " : "▼ ") + fmtNum(Math.abs(delta)) + (deltaSuffix || "")));
    } else if (sub) {
      card.append(h("div", { class: "dash-stat-sub" }, sub));
    }
    if (series && series.length > 1) {
      card.append(h("div", { class: "spark-wrap", html: sparklineSvg(series) }));
    }
    return card;
  }

  /** Analytics card — metric-switchable area chart + mini-stat totals. */
  function renderAnalyticsCard(analytics) {
    const metrics = ["messages", "commands", "voice_joins", "welcomes"];
    let activeMetric = "messages";
    const hasData = metrics.some((m) => ((analytics.cards && analytics.cards[m] && analytics.cards[m].total) || 0) > 0);

    const card = h("div", { class: "dash-card" });
    const chartHost = h("div", { class: "analytics-chart-host" });

    function drawChart() {
      clear(chartHost);
      const series = (analytics.series && analytics.series[activeMetric]) || [];
      const built = areaChartSvg(series);
      const wrap = h("div", { class: "area-chart-wrap" });
      wrap.innerHTML = built.svg;
      wrap.appendChild(h("div", { class: "chart-tip" }));
      wireChartHover(wrap, built.geo, METRIC_META[activeMetric].label);
      chartHost.appendChild(wrap);
    }

    const pills = h("div", { class: "analytics-pills" });
    metrics.forEach((m) => {
      const pill = h("button", {
        type: "button",
        class: "analytics-pill" + (m === activeMetric ? " active" : ""),
        onclick: () => {
          activeMetric = m;
          pills.querySelectorAll(".analytics-pill").forEach((p) => p.classList.remove("active"));
          pill.classList.add("active");
          drawChart();
        },
      }, METRIC_META[m].label);
      pills.appendChild(pill);
    });

    card.append(
      h("div", { class: "analytics-head" },
        h("div", null,
          h("h3", null, "Analytics Overview"),
          h("p", null, `Real activity over the last ${analytics.days} days.`)
        ),
        pills
      )
    );

    if (hasData) {
      card.append(chartHost);
      drawChart();
    } else {
      card.append(notice("info", "No activity recorded yet",
        "Analytics populate as members chat, run commands, and join voice. Come back in a day or two — the chart fills itself."));
    }

    // Mini-stat totals row
    const mini = h("div", { class: "analytics-mini" });
    metrics.forEach((m) => {
      const total = (analytics.cards && analytics.cards[m] && analytics.cards[m].total) || 0;
      mini.appendChild(
        h("div", { class: "analytics-mini-stat" },
          icon(METRIC_META[m].iconName, "analytics-mini-ico"),
          h("div", null,
            h("div", { class: "analytics-mini-v" }, fmtNum(total)),
            h("div", { class: "analytics-mini-l" }, METRIC_META[m].label)
          )
        )
      );
    });
    card.append(mini);
    return card;
  }

  /* ============================================================
     Tab: Analytics — full per-guild activity breakdown
     ============================================================ */
  // Range options for the Analytics page (persisted on state)
  function analyticsDays() {
    return state._analyticsDays || 7;
  }
  function seriesSum(s)  { return (s || []).reduce((t, p) => t + (p.value || 0), 0); }
  function seriesAvg(s)  { return (s && s.length) ? seriesSum(s) / s.length : 0; }
  function seriesPeak(s) {
    let peak = { day: null, value: -1 };
    (s || []).forEach((p) => { if ((p.value || 0) > peak.value) peak = { day: p.day, value: p.value || 0 }; });
    return peak.value < 0 ? { day: null, value: 0 } : peak;
  }
  function fmtDay(dayStr) {
    if (!dayStr) return "—";
    return new Date(dayStr + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  // Inclusive [from,to] slice of a {day,value}[] series. ISO YYYY-MM-DD strings
  // compare correctly as plain strings, so no Date parsing needed.
  function sliceByDate(series, from, to) {
    return (series || []).filter((p) => p.day && p.day >= from && p.day <= to);
  }

  async function loadAnalytics(content) {
    try {
      // Pull the full retained window (90d) ONCE, then slice it client-side so
      // the user can pick any specific date range without re-hitting the backend
      // (which only understands a trailing "last N days").
      const gid = state.selectedGuildId;
      let raw = state._anRaw && state._anRaw.guildId === gid ? state._anRaw.data : null;
      if (!raw) {
        clear(content);
        content.append(renderGenericSkeleton());
        raw = await data.analytics(gid, 90);
        if (gid !== state.selectedGuildId) return; // guild switched mid-fetch; drop the stale response
        state._anRaw = { guildId: gid, data: raw };
        state._anFrom = null; state._anTo = null; // new guild → forget prior dates
      }
      clear(content);

      // Available window: derive the day axis from the member series (fall back
      // to the messages series), so the date pickers can't exceed real data.
      const axis = (raw.memberSeries && raw.memberSeries.length ? raw.memberSeries
        : (raw.series && raw.series.messages) || []).map((p) => p.day).filter(Boolean).sort();
      const minDay = axis[0] || null;
      const maxDay = axis[axis.length - 1] || null;
      const dayAt = (fromEnd) => axis.length >= fromEnd ? axis[axis.length - fromEnd] : (minDay || maxDay);

      // Default to the last 7 available days; clamp any chosen range to the window.
      if (!state._anFrom || !state._anTo) { state._anTo = maxDay; state._anFrom = dayAt(7); }
      if (minDay && state._anFrom < minDay) state._anFrom = minDay;
      if (maxDay && state._anTo > maxDay) state._anTo = maxDay;
      if (state._anFrom > state._anTo) state._anFrom = state._anTo;
      const from = state._anFrom, to = state._anTo;

      const wrap = h("div", { class: "dsx-an" });

      // Quick presets set [last-Nd .. latest]; the date inputs pick anything.
      const presets = h("div", { class: "dsx-an-range" });
      [[7, "7d"], [14, "14d"], [30, "30d"], [90, "90d"]].forEach(([d, label]) => {
        const pFrom = dayAt(d);
        const active = from === pFrom && to === maxDay;
        presets.appendChild(h("button", {
          type: "button",
          class: "dsx-an-range-btn" + (active ? " active" : ""),
          onclick: () => { state._anFrom = pFrom; state._anTo = maxDay; loadAnalytics(content); },
        }, label));
      });

      const mkDate = (label, val, onpick) => h("label", { class: "dsx-an-date" },
        h("span", { class: "dsx-an-date-lbl" }, label),
        h("input", { type: "date", class: "dsx-an-date-in", value: val || "",
          min: minDay || null, max: maxDay || null,
          onchange: (ev) => { const v = ev.target.value; if (v) onpick(v); else loadAnalytics(content); } })
      );
      const dates = h("div", { class: "dsx-an-dates" },
        mkDate("From", from, (v) => { state._anFrom = v; if (state._anTo && v > state._anTo) state._anTo = v; loadAnalytics(content); }),
        mkDate("To", to, (v) => { state._anTo = v; if (state._anFrom && v < state._anFrom) state._anFrom = v; loadAnalytics(content); })
      );

      // Slice every series to the chosen window once.
      const filtered = {
        members: raw.members,
        memberSeries: sliceByDate(raw.memberSeries, from, to),
        series: {
          messages:    sliceByDate(raw.series && raw.series.messages, from, to),
          commands:    sliceByDate(raw.series && raw.series.commands, from, to),
          voice_joins: sliceByDate(raw.series && raw.series.voice_joins, from, to),
          welcomes:    sliceByDate(raw.series && raw.series.welcomes, from, to),
          pop_uses:    sliceByDate(raw.series && raw.series.pop_uses, from, to),
        },
        donations: raw.donations ? { series: sliceByDate(raw.donations.series, from, to) } : null,
        cards: raw.cards,
      };

      const exportBtn = h("button", { type: "button", class: "dsx-an-export", onclick: () => exportAnalyticsCsv(filtered, from, to) }, "Export CSV");
      wrap.append(
        h("header", { class: "dsx-an-head" },
          h("div", null,
            h("h1", { class: "dsx-an-title" }, "Analytics"),
            h("p", { class: "dsx-an-sub" }, "Real activity across your server. Pick a metric to chart, and choose any date range.")
          ),
          h("div", { class: "dsx-an-actions" }, presets, dates, exportBtn)
        )
      );

      // Metric-selector chart — the whole view (no rectangular card wall)
      wrap.append(renderAnalyticsChart(filtered, from, to));

      content.append(wrap);
    } catch (e) { renderTabError(content, e); }
  }

  // Interactive analytics chart: click a metric to chart its series over the
  // selected range. Defaults to Members so member growth is shown first.
  function renderAnalyticsChart(a, from, to) {
    // A real guild's member count is never 0, so a 0 in the (zero-filled) member
    // series means an offline / pre-tracking day — scan back to the last real
    // value rather than showing "Latest: 0" for a historical end-date.
    const lastVal = (s) => { for (let i = (s ? s.length : 0) - 1; i >= 0; i--) { if ((s[i].value || 0) > 0) return s[i].value; } return 0; };
    // Members shows the latest count within the range; counters show the
    // in-range total — both computed from the already date-sliced series.
    const metrics = [
      { key: "members",     label: "Members",     series: a.memberSeries || [],                     total: lastVal(a.memberSeries), totalLabel: "Latest" },
      { key: "messages",    label: "Messages",    series: (a.series && a.series.messages) || [] },
      { key: "commands",    label: "Commands",    series: (a.series && a.series.commands) || [] },
      { key: "pop_uses",    label: "/pop uses",   series: (a.series && a.series.pop_uses) || [] },
      { key: "voice_joins", label: "Voice joins", series: (a.series && a.series.voice_joins) || [] },
      { key: "welcomes",    label: "Welcomes",    series: (a.series && a.series.welcomes) || [] },
    ];
    const startKey = state._anMetric && metrics.some((m) => m.key === state._anMetric) ? state._anMetric : "members";

    const card = h("div", { class: "dsx-an-chart" });
    const pills = h("div", { class: "dsx-an-pills", role: "tablist", "aria-label": "Metric" });
    const windowLabel = h("div", { class: "dsx-an-window" }, from && to ? `${fmtDay(from)} – ${fmtDay(to)}` : "All time");
    const summary = h("div", { class: "dsx-an-summary" });
    const host = h("div", { class: "dsx-an-host" });

    function sumStat(label, value) {
      return h("div", { class: "dsx-an-sum" },
        h("div", { class: "dsx-an-sum-v" }, value),
        h("div", { class: "dsx-an-sum-l" }, label));
    }

    function draw(m) {
      state._anMetric = m.key; // remember the choice across date changes / re-renders
      pills.querySelectorAll(".dsx-an-pill").forEach((p) => {
        const on = p.dataset.key === m.key;
        p.classList.toggle("active", on);
        p.setAttribute("aria-selected", on ? "true" : "false");
      });
      clear(summary); clear(host);
      const series = m.series || [];
      const hasData = series.some((p) => (p.value || 0) > 0);
      if (!hasData) {
        host.append(h("div", { class: "dsx-an-empty" },
          "No " + m.label.toLowerCase() + " data for this range yet — it fills in as the bot is used."));
      } else {
        host.append(areaChartWrap(series, m.label));
      }
      const total = m.total != null ? m.total : seriesSum(series);
      const peak = seriesPeak(series);
      summary.append(
        sumStat(m.totalLabel || "Total", fmtNum(total)),
        sumStat("Daily avg", fmtNum(Math.round(seriesAvg(series)))),
        sumStat("Peak", peak.value > 0 ? fmtNum(peak.value) + " · " + fmtDay(peak.day) : "—")
      );
    }

    metrics.forEach((m) => {
      const on = m.key === startKey;
      pills.appendChild(h("button", {
        type: "button", role: "tab", "data-key": m.key,
        class: "dsx-an-pill" + (on ? " active" : ""),
        "aria-selected": on ? "true" : "false",
        onclick: () => draw(m),
      }, m.label));
    });

    card.append(h("div", { class: "dsx-an-chart-head" }, pills, windowLabel), summary, host);
    draw(metrics.find((m) => m.key === startKey) || metrics[0]);
    return card;
  }

  /** Currency formatter with a safe fallback for odd codes. */
  function fmtMoney(amount, currency) {
    const n = Number(amount) || 0;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency", currency: currency || "USD", maximumFractionDigits: 2,
      }).format(n);
    } catch {
      return (currency || "USD") + " " + n.toFixed(2);
    }
  }

  /** Donations / revenue card — total, count, and a per-day chart. */
  function renderDonationsCard(donations, days) {
    const d = donations || { total: 0, count: 0, currency: "USD", week: 0, prevWeek: 0, series: [] };
    const hasData = (d.count || 0) > 0;
    const delta = (d.week || 0) - (d.prevWeek || 0);
    const up = delta >= 0;
    const card = h("div", { class: "dash-card" },
      h("div", { class: "analytics-head" },
        h("div", null,
          h("h3", null, "Donations & revenue"),
          h("p", null, "Completed payments processed through the bot.")
        ),
        h("div", { class: "donations-summary" },
          h("div", { class: "don-sum-item" },
            h("strong", null, fmtMoney(d.total, d.currency)),
            h("span", null, "All-time")
          ),
          h("div", { class: "don-sum-item" },
            h("strong", null, fmtMoney(d.week, d.currency)),
            h("span", null, "This week")
          ),
          h("div", { class: "don-sum-item" },
            h("strong", { class: up ? "pos" : "neg" }, (up ? "▲ " : "▼ ") + fmtMoney(Math.abs(delta), d.currency)),
            h("span", null, "vs last week")
          )
        )
      )
    );
    if (hasData) {
      card.append(areaChartWrap(d.series || [], "Donations"));
    } else {
      card.append(notice("info", "No payments recorded yet",
        "Once a payment is completed through /payment, donation totals and revenue trends show up here."));
    }
    return card;
  }

  /** Busiest-hours heatmap — 7×24 grid of message activity (UTC). */
  function renderHeatmapCard(heatmap) {
    const grid = heatmap || Array.from({ length: 7 }, () => new Array(24).fill(0));
    let max = 1;
    grid.forEach((row) => row.forEach((v) => { if (v > max) max = v; }));
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const anyData = grid.some((row) => row.some((v) => v > 0));

    const card = h("div", { class: "dash-card" },
      h("h3", null, "Busiest hours"),
      h("p", null, "When your server is most active — message volume by weekday and hour (UTC).")
    );
    if (!anyData) {
      card.append(notice("info", "No message activity yet",
        "This heatmap fills in as members chat. Give it a day or two."));
      return card;
    }

    const wrap = h("div", { class: "heatmap-wrap" });
    // Hour ruler
    const ruler = h("div", { class: "heatmap-ruler" }, h("span", { class: "heatmap-day-spacer" }));
    for (let hr = 0; hr < 24; hr++) {
      ruler.appendChild(h("span", { class: "heatmap-hr" }, hr % 6 === 0 ? String(hr) : ""));
    }
    wrap.appendChild(ruler);
    // Rows
    for (let dow = 0; dow < 7; dow++) {
      const row = h("div", { class: "heatmap-row" }, h("span", { class: "heatmap-day" }, dayNames[dow]));
      for (let hr = 0; hr < 24; hr++) {
        const v = grid[dow][hr] || 0;
        const intensity = v / max; // 0..1
        const cell = h("span", {
          class: "heatmap-cell",
          title: `${dayNames[dow]} ${String(hr).padStart(2, "0")}:00 UTC — ${v} message${v === 1 ? "" : "s"}`,
          style: {
            background: v === 0
              ? "rgba(255,255,255,0.03)"
              : `rgba(43,255,158,${(0.16 + intensity * 0.72).toFixed(3)})`,
          },
        });
        row.appendChild(cell);
      }
      wrap.appendChild(row);
    }
    card.append(wrap,
      h("div", { class: "heatmap-legend" },
        h("span", null, "Less"),
        h("span", { class: "heatmap-legend-grad" }),
        h("span", null, "More")
      )
    );
    return card;
  }

  /** Top channels by message volume. */
  function renderTopChannelsCard(channels) {
    const list = (channels || []).filter((c) => c && c.name);
    const card = h("div", { class: "dash-card" },
      h("h3", null, "Top channels"),
      h("p", null, "Most active channels by all-time message count.")
    );
    if (!list.length) {
      card.append(notice("info", "No channel data yet",
        "As members chat, the busiest channels rank here."));
      return card;
    }
    const max = Math.max(1, ...list.map((c) => c.value || 0));
    const rows = h("div", { class: "topchan-list" });
    list.forEach((c, i) => {
      const pct = Math.round(((c.value || 0) / max) * 100);
      rows.appendChild(
        h("div", { class: "topchan-row" },
          h("span", { class: "topchan-rank" }, String(i + 1)),
          h("div", { class: "topchan-body" },
            h("div", { class: "topchan-name" },
              h("span", { class: "topchan-hash" }, c.type === 15 ? "📋" : "#"),
              c.name
            ),
            h("div", { class: "topchan-bar" }, h("i", { style: { width: pct + "%" } }))
          ),
          h("span", { class: "topchan-count" }, fmtNum(c.value || 0))
        )
      );
    });
    card.append(rows);
    return card;
  }

  /** Build a CSV of the daily series + donations and trigger a download. */
  function exportAnalyticsCsv(a, from, to) {
    try {
      const counters = ["messages", "commands", "voice_joins", "welcomes", "pop_uses"];
      const days = (a.series && a.series.messages) ? a.series.messages.map((p) => p.day) : [];
      const memberByDay = {};
      (a.memberSeries || []).forEach((p) => { memberByDay[p.day] = p.value; });
      const donByDay = {};
      ((a.donations && a.donations.series) || []).forEach((p) => { donByDay[p.day] = p.value; });
      const header = ["date", ...counters, "members", "donations"];
      const lines = [header.join(",")];
      days.forEach((day, idx) => {
        const row = [day];
        counters.forEach((m) => {
          const s = (a.series && a.series[m]) || [];
          row.push(s[idx] ? s[idx].value : 0);
        });
        row.push(memberByDay[day] != null ? memberByDay[day] : "");
        row.push(donByDay[day] != null ? donByDay[day] : 0);
        lines.push(row.join(","));
      });
      const guild = state.guilds.find((g) => g.id === state.selectedGuildId);
      const safeName = ((guild && guild.name) || "server").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const range = from && to ? `${from}_to_${to}` : `${a.days || ""}d`;
      const link = h("a", { href: url, download: `analytics-${safeName}-${range}.csv` });
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("success", "Analytics CSV exported");
    } catch (e) {
      toast("error", "Couldn't export CSV");
    }
  }

  function renderBdRow(label, value) {
    return h("div", { class: "analytics-bd-row" },
      h("span", { class: "analytics-bd-label" }, label),
      h("span", { class: "analytics-bd-value" }, value)
    );
  }

  /** Big metric-switchable chart card used on the Analytics page. */
  function renderAnalyticsBigChart(a, metrics) {
    let active = "messages";
    const card = h("div", { class: "dash-card" });
    const chartHost = h("div", { class: "analytics-chart-host" });
    const summary = h("div", { class: "analytics-chart-summary" });

    function draw() {
      const series = (a.series && a.series[active]) || [];
      clear(chartHost);
      chartHost.appendChild(areaChartWrap(series, METRIC_META[active] && METRIC_META[active].label));
      clear(summary);
      const total = seriesSum(series);
      const avg = Math.round(seriesAvg(series));
      const peak = seriesPeak(series);
      summary.append(
        h("div", { class: "acs-item" }, h("strong", null, fmtNum(total)), h("span", null, "Total in range")),
        h("div", { class: "acs-item" }, h("strong", null, fmtNum(avg)),   h("span", null, "Daily average")),
        h("div", { class: "acs-item" }, h("strong", null, peak.value > 0 ? fmtNum(peak.value) : "—"), h("span", null, "Peak day"))
      );
    }

    const pills = h("div", { class: "analytics-pills" });
    metrics.forEach((m) => {
      const pill = h("button", {
        type: "button",
        class: "analytics-pill" + (m === active ? " active" : ""),
        onclick: () => {
          active = m;
          pills.querySelectorAll(".analytics-pill").forEach((p) => p.classList.remove("active"));
          pill.classList.add("active");
          draw();
        },
      }, METRIC_META[m].label);
      pills.appendChild(pill);
    });

    card.append(
      h("div", { class: "analytics-head" },
        h("div", null,
          h("h3", null, "Activity chart"),
          h("p", null, "Switch metric to compare daily activity.")
        ),
        pills
      ),
      chartHost,
      summary
    );
    draw();
    return card;
  }

  function renderStatCard({ label, value, sub, iconName, barPct }) {
    const card = h("div", { class: "dash-stat" });
    card.append(
      h("div", { class: "dash-stat-l" }, label),
      h("div", { class: "dash-stat-v" }, value),
      h("div", { class: "dash-stat-sub" }, sub || ""),
    );
    if (iconName) {
      const ic = h("span", { class: "dash-stat-ico" });
      ic.appendChild(iconSvg(iconName));
      card.appendChild(ic);
    }
    if (typeof barPct === "number") {
      card.append(h("div", { class: "dash-stat-bar" }, h("i", { style: { width: `${Math.min(100, Math.max(0, barPct))}%` } })));
    }
    return card;
  }

  function renderQuickAction(tabId, iconName, name, desc) {
    return h("button", {
      type: "button",
      class: "dash-quick-action",
      onclick: () => { state.activeTab = tabId; render(); },
    },
      icon(iconName, "dash-quick-action-ico"),
      h("div", { class: "dash-quick-action-body" },
        h("div", { class: "dash-quick-action-name" }, name),
        h("div", { class: "dash-quick-action-desc" }, desc)
      ),
      h("span", { style: { color: "var(--dash-muted-2)" } }, "→")
    );
  }

  /** Inline recent-audit preview (last 6 entries). Loads async, hides on error. */
  function renderRecentAuditCard() {
    const card = h("div", { class: "dash-card" },
      h("h3", null, "Recent activity"),
      h("p", null, "Last few configuration changes from this dashboard."),
      h("div", { id: "dash-recent-audit" }, h("div", { class: "skel skel-line lg w-90" }), h("div", { class: "skel skel-line w-70" }), h("div", { class: "skel skel-line w-50" }))
    );
    data.audit(state.selectedGuildId).then((a) => {
      const host = card.querySelector("#dash-recent-audit");
      if (!host) return;
      clear(host);
      const entries = (a.entries || []).slice(0, 6);
      if (!entries.length) {
        host.append(notice("info", "No recent activity", "Edits, panel posts, and config changes will appear here."));
        return;
      }
      const list = h("div", { class: "dash-audit-list" });
      entries.forEach((e) => {
        list.append(
          h("div", { class: "dash-audit-row" },
            h("span", { class: "dash-audit-time" }, new Date(e.ts).toLocaleString()),
            h("span", { class: `dash-audit-action ${e.ok ? "ok" : "fail"}` }, e.action),
            h("span", { class: "dash-audit-target" }, e.target || "—")
          )
        );
      });
      host.appendChild(list);
    }).catch(() => {
      const host = card.querySelector("#dash-recent-audit");
      if (host) host.replaceWith(h("div"));
    });
    return card;
  }

  /** Shimmer skeleton shown while the Overview fetch is in flight. */
  function renderOverviewSkeleton() {
    const wrap = h("div");
    wrap.append(
      h("div", { class: "skel-stat-grid" },
        ...new Array(4).fill(0).map(() => h("div", { class: "skel-card" },
          h("div", { class: "skel skel-line w-30" }),
          h("div", { class: "skel skel-line lg w-50" }),
          h("div", { class: "skel skel-line w-70" })
        ))
      ),
      h("div", { class: "skel-card" },
        h("div", { class: "skel skel-line lg w-30" }),
        h("div", { class: "skel skel-line w-90" }),
        h("div", { class: "skel skel-line w-70" })
      ),
      h("div", { class: "skel-card" },
        h("div", { class: "skel skel-line lg w-30" }),
        h("div", { class: "skel skel-line w-90" }),
        h("div", { class: "skel skel-line w-90" })
      )
    );
    return wrap;
  }

  function renderProgress(pct) {
    return h("div", { style: { height: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "999px", overflow: "hidden", marginTop: "12px" } },
      h("div", { style: { height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, var(--red), var(--red-bright))", transition: "width 0.5s" } })
    );
  }

  function mapFlagToModule(flag) {
    const map = { welcome: "welcome", autoRoles: "autoRoles", roleMenus: "roleMenus", population: "population", branding: "branding", payments: "payments", staffPay: "staffPay", hype: "hype", tickets: "tickets", xp: "xp", moderation: "moderation" };
    return map[flag] || "overview";
  }
  function prettyName(s) {
    return ({
      welcome: "Welcome", autoRoles: "Auto Roles", roleMenus: "Role Menus", population: "/pop Cluster",
      branding: "Branding", payments: "Payments", staffPay: "Staff Pay", hype: "Hype",
      tickets: "Tickets", xp: "XP / Leaderboards", moderation: "Moderation"
    }[s]) || s;
  }

  /* ============================================================
     Tab: Module (schema-driven form)
     ============================================================ */
  async function loadModule(content, name) {
    try {
      // Instant skeleton so switching tabs never lingers on the previous tab's
      // content (or a blank flash) while channels/roles/the module schema load.
      clear(content);
      content.append(renderGenericSkeleton());

      // Make sure channel/category/role pickers are ready
      if (!state.channels || !state.roles || !state.categories) await loadDiscordLists();

      const m = await data.module(state.selectedGuildId, name);
      clear(content);
      const mod = m.module;

      // Premium gate — this is a conversion moment, so sell it (don't just block).
      if (m.tierLocked) {
        const price = (cfg.pricing && cfg.pricing.monthly) ? `${cfg.pricing.monthly.price}${cfg.pricing.monthly.period || ""}` : "$15 / month";
        content.append(
          h("div", { class: "dash-card dash-upsell" },
            h("div", { class: "dash-upsell-badge" }, "✨ Premium"),
            h("h3", { class: "dash-upsell-title" }, `${mod.label} is a Premium feature`),
            h("p", { class: "dash-upsell-lead" }, mod.description || "Unlock this module with Premium."),
            h("div", { class: "dash-upsell-chips" },
              ...["Payments", "Staff Pay", "Hype Rewards", "Advanced Tickets", "Premium Branding", "Priority Support"]
                .map((t) => h("span", { class: "dash-upsell-chip" }, t))),
            h("div", { class: "dash-upsell-note" },
              `Premium is ${price} and unlocks every premium module for this server — your free modules keep working. Activate it by running `,
              h("code", null, "/subscribe"), " inside your Discord server."),
            h("div", { class: "dash-actions", style: { marginTop: "18px" } },
              btn("See how to subscribe →", { kind: "btn-primary", onclick: () => { state.activeTab = "premium"; render(); } }),
              btn("Invite Bot", { kind: "btn-ghost", href: cfg.links?.inviteBot, external: true })
            )
          )
        );
        return;
      }

      // Custom UI modules — render dedicated handlers
      if (mod.customUi) {
        if (mod.name === "branding") return renderBrandingForm(content, mod, m.values);
        if (mod.name === "population") return renderPopulationView(content);
        if (mod.name === "roleMenus") return renderRoleMenusInfo(content);
        if (mod.name === "customCommands") return renderCustomCommandsPage(content, mod);
        if (mod.name === "ark") return renderArkInfo(content);
        if (mod.name === "logs") return loadGameLogs(content);
      }

      // Welcome → live-preview canvas (edit the message in the Discord preview).
      if (mod.name === "welcome") return renderWelcomeCanvas(content, mod, m.values);
      if (mod.name === "autoRoles") return renderAutoRolesCanvas(content, mod, m.values);
      if (mod.name === "xp") return renderXpCanvas(content, mod, m.values);
      if (mod.name === "moderation") return renderModerationCanvas(content, mod, m.values);
      if (mod.name === "hype") return renderHypeCanvas(content, mod, m.values);
      if (mod.name === "events") return renderEventsCanvas(content, mod, m.values);
      if (mod.name === "tickets") return renderTicketsCanvas(content, mod, m.values);
      if (mod.name === "staffPay") return renderStaffPayCanvas(content, mod, m.values);
      if (mod.name === "payments") return renderPaymentsCanvas(content, mod, m.values);
      if (mod.name === "serverTemplates") return renderServerTemplatesCanvas(content, mod, m.values);

      // Generic schema-driven form
      renderModuleForm(content, mod, m.values);

      // Staff Pay gets an extra "Tiers" section below the standard form
      // for per-role pay amounts (ticket basic/medium/advanced + auction %
      // + event payouts). Loads async; failure is silent + non-blocking.
      if (mod.name === "staffPay") {
        renderStaffTiersSection(content);
      }
      // Payments gets an extra PayPal API + Webhooks section below the
      // standard form. Secrets are write-only — backend returns masks.
      if (mod.name === "payments") {
        renderPayPalConfigSection(content);
      }
    } catch (e) { renderTabError(content, e); }
  }

  async function loadDiscordLists() {
    try {
      const [c, cat, r] = await Promise.all([
        data.channels(state.selectedGuildId),
        data.categories(state.selectedGuildId),
        data.roles(state.selectedGuildId),
      ]);
      state.channels = c.channels || [];
      state.categories = cat.categories || [];
      state.roles = r.roles || [];
    } catch (e) {
      state.channels = [];
      state.categories = [];
      state.roles = [];
    }
  }

  /** Optional per-module accordion groups. When a module has an entry
   *  here, its fields are split into collapsible <details> sections so
   *  a long form (XP, Hype, Events, Tickets) becomes scannable. Any
   *  field not listed in a group ends up in a trailing "Other" group.
   *  Modules NOT in this map render as a single flat form (current
   *  behaviour). */
  const MODULE_GROUPS = {
    welcome: [
      { name: "Basic",          fields: ["enabled", "channelId"] },
      { name: "Message",        fields: ["title", "message", "mentionUser"] },
      { name: "Embed design",   fields: ["embedColor", "imageUrl"] },
    ],
    xp: [
      { name: "Basic",                  fields: ["enabled"] },
      { name: "XP rules",               fields: ["xpMin", "xpMax", "cooldownSec"] },
      { name: "Filters",                fields: ["ignoredChannels", "ignoredRoles"] },
      { name: "Level-up announcements", fields: ["levelUpAnnounce", "levelUpChannelId"] },
      { name: "Weekly leaderboard",     fields: ["weeklyResetDay", "weeklyChannelId"] },
      { name: "Rewards",                fields: ["rewardsMode", "rewardType", "reward1stCredits", "reward2ndCredits", "reward3rdCredits", "reward1stEggs", "reward2ndEggs", "reward3rdEggs"] },
    ],
    hype: [
      { name: "Branding",      fields: ["brand_name"] },
      { name: "Name reward",   fields: ["name_enabled", "name_keywords", "name_credits", "name_channel_id", "name_cooldown_hours", "name_role_id"] },
      { name: "Tag reward",    fields: ["tag_enabled", "tag_keywords", "tag_credits", "tag_channel_id", "tag_cooldown_hours", "tag_role_id", "tag_guild_id"] },
      { name: "Invite reward", fields: ["invite_enabled", "invite_credits", "invite_channel_id"] },
      { name: "Boost reward",  fields: ["boost_channel_id"] },
    ],
    events: [
      { name: "Basic",        fields: ["enabled", "announceChannelId", "trackChannelId"] },
      { name: "Permissions",  fields: ["pingRoleId", "allowedRoleIds"] },
      { name: "Dino event",   fields: ["dinoBase", "dinoBump", "dinoPer"] },
      { name: "Number guess", fields: ["numberBase", "numberBump", "numberPer"] },
      { name: "Vault event",  fields: ["vaultBase", "vaultBump", "vaultPer"] },
    ],
    tickets: [
      { name: "Basic",   fields: ["enabled", "panelChannelId", "ticketCategoryId"] },
      { name: "Staff",   fields: ["staffRoleIds", "claimEnabled"] },
      { name: "Logging", fields: ["logChannelId", "autoCloseHours"] },
    ],
    payments: [
      { name: "Basic",        fields: ["enabled", "logChannelId"] },
      { name: "Instructions", fields: ["instructions", "manualFallback"] },
    ],
    staffPay: [
      { name: "Basic", fields: ["enabled", "forumChannelId"] },
    ],
    moderation: [
      { name: "Basic",      fields: ["enabled", "modLogChannelId", "modRoleIds"] },
      { name: "URL filter", fields: ["urlFilterEnabled", "whitelistDomains"] },
      { name: "Auto-action",fields: ["maxWarnings"] },
    ],
    autoRoles: [
      { name: "Basic", fields: ["enabled", "roleIds", "ignoreBots"] },
    ],
  };

  /** Modules with a live right-rail preview. */
  const MODULES_WITH_PREVIEW = new Set(["welcome"]);

  /** Render fields either as accordion sections (when groups exist for
   *  this module) or as a flat list. Returns the wrapper element so
   *  callers can append it into a form. */
  function renderFieldsGrouped(mod, values) {
    const wrap = h("div", { class: "dash-form-fields" });
    const groups = MODULE_GROUPS[mod.name];
    if (!groups || !groups.length) {
      mod.fields.forEach((f) => wrap.appendChild(renderField(f, values[f.key])));
      return wrap;
    }
    const usedKeys = new Set();
    groups.forEach((g) => {
      const fields = g.fields
        .map((k) => mod.fields.find((f) => f.key === k))
        .filter(Boolean);
      if (!fields.length) return;
      fields.forEach((f) => usedKeys.add(f.key));
      wrap.appendChild(renderFormSection(g.name, fields, values, /* open */ groups.indexOf(g) === 0));
    });
    // Any leftover fields go into "Other"
    const leftover = mod.fields.filter((f) => !usedKeys.has(f.key));
    if (leftover.length) wrap.appendChild(renderFormSection("Other", leftover, values, false));
    return wrap;
  }

  function renderFormSection(name, fields, values, openByDefault) {
    const section = h("details", { class: "dash-form-section" });
    if (openByDefault) section.setAttribute("open", "");
    const summary = h("summary", null,
      h("span", { class: "sec-name" }, name),
      h("span", { class: "sec-count" }, String(fields.length)),
    );
    const chev = h("span", { class: "chev" });
    chev.appendChild(iconSvg("arrowRight"));
    summary.appendChild(chev);
    section.appendChild(summary);
    const body = h("div", { class: "sec-body" });
    fields.forEach((f) => body.appendChild(renderField(f, values[f.key])));
    section.appendChild(body);
    return section;
  }

  function renderModuleForm(content, mod, values) {
    // Hero (icon + name + tier + status)
    content.append(renderModuleHero(mod, statusBadgeFor(detectModuleStatus(mod, values))));

    const card = h("div", { class: "dash-card" });

    // Quick Setup banner — shown only when backend reports it's available
    if (mod.quickSetupAvailable) {
      card.append(renderQuickSetupBanner(mod, content));
    }

    const statusBox = h("div");
    const form = h("form", { class: "dash-form" });
    form.dataset.module = mod.name;

    // Snapshot baseline so we can detect dirty state
    form._baseline = JSON.stringify(values || {});
    form.appendChild(renderFieldsGrouped(mod, values));

    const saveBtn = h("button", { type: "submit", class: "btn btn-primary" }, "Save changes");
    const resetBtn = h("button", { type: "button", class: "btn btn-ghost", onclick: () => doResetModule(mod, content) }, "Reset to default");
    // Sticky bottom action bar so Save is always reachable, even on long forms
    form.appendChild(
      h("div", { class: "dash-sticky-actions" },
        saveBtn,
        resetBtn,
        h("span", { class: "dash-unsaved" }, h("span", { class: "dot" }), "Unsaved changes"),
        h("div", { class: "filler" }),
        h("span", { style: { fontSize: "0.78rem", color: "var(--dash-muted-2)" } },
          mod.tier === "premium" ? "Premium" : "Free", " module")
      )
    );

    // Track dirty state
    form.addEventListener("input", () => updateDirty(form, mod), { capture: true });
    form.addEventListener("change", () => updateDirty(form, mod), { capture: true });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      doSaveModule(form, mod, statusBox, saveBtn, content);
    });

    card.append(statusBox, form);

    // Two-column layout for modules with a meaningful preview
    if (MODULES_WITH_PREVIEW.has(mod.name)) {
      const grid = h("div", { class: "dash-mod-grid" });
      grid.appendChild(card);
      const aside = h("div", { class: "dash-mod-aside" }, renderModulePreviewPanel(mod, values, form));
      grid.appendChild(aside);
      content.append(grid);
    } else {
      content.append(card);
    }
  }

  /** Build the right-rail preview + tips panel for a module. */
  function renderModulePreviewPanel(mod, values, form) {
    const panel = h("div");
    if (mod.name === "welcome") {
      const card = h("div", { class: "dash-preview-card" },
        h("h4", null, "Live preview"),
        h("div", { id: "dc-preview-welcome" })
      );
      panel.append(card);
      // Build a refresh function the form input listener calls
      const refresh = () => {
        const host = panel.querySelector("#dc-preview-welcome");
        if (!host) return;
        clear(host);
        const v = collectFormValues(form, mod);
        host.appendChild(renderWelcomeEmbedPreview(v));
      };
      form._previewRefresh = refresh;
      // First render
      setTimeout(refresh, 0);

      // Helpful tip card under the preview
      panel.append(
        h("div", { class: "dash-tip" },
          (() => { const i = h("span", { class: "tip-ico" }); i.appendChild(iconSvg("sparkle")); return i; })(),
          h("div", null,
            h("strong", null, "Tips: "),
            "Use ", h("code", null, "{user}"),
            " to mention the new member and ", h("code", null, "{server}"),
            " for the server name."
          )
        )
      );
    }
    return panel;
  }

  /** Discord-style welcome embed preview, driven by the current form. */
  function renderWelcomeEmbedPreview(v) {
    const color = (v && v.embedColor && /^#[0-9a-f]{6}$/i.test(v.embedColor)) ? v.embedColor : "#dc2626";
    const guildName = (state.guilds.find((g) => g.id === state.selectedGuildId)?.name) || "your server";
    const username  = state.user?.username || "newmember";
    const title = (v?.title && v.title.trim())
      ? v.title.replace(/\{server\}/gi, guildName)
      : `🦖  Welcome to ${guildName}!`;
    const message = (v?.message && v.message.trim())
      ? v.message
          .replace(/\{user\}/gi, `@${username}`)
          .replace(/\{server\}/gi, guildName)
      : "Glad you're here! 🎉 Read the rules and say hi.";
    const shell = h("div", { class: "dc-embed-shell", style: { ["--dc-color"]: color } },
      h("div", { class: "dc-embed-bot" },
        h("div", { class: "dc-embed-bot-avatar" }),
        h("div", { class: "dc-embed-bot-name" }, "Arkoris"),
        h("span", { class: "dc-embed-bot-tag" }, "APP")
      ),
      v?.mentionUser !== false
        ? h("div", { style: { color: "#fff", marginBottom: "6px", fontSize: "0.86rem" } }, `@${username}`)
        : null,
      h("div", { class: "dc-embed-title" }, title),
      h("div", { class: "dc-embed-desc" }, message),
      v?.imageUrl && /^https:\/\//i.test(v.imageUrl)
        ? h("img", { class: "dc-embed-image", src: v.imageUrl, alt: "", onerror: function(){ this.style.display = "none"; } })
        : null,
      h("div", { class: "dc-embed-footer" }, `${guildName}`)
    );
    return shell;
  }

  // Welcome module as a live-preview canvas (like the Embed Builder): the title
  // and message are edited IN the styled Discord message; channel / colour /
  // image / toggles are compact controls right under it.
  function renderWelcomeCanvas(content, mod, values) {
    const wv = Object.assign({ enabled: true, channelId: "", title: "", message: "", mentionUser: true, embedColor: "#dc2626", imageUrl: "" }, values || {});
    const baseline = JSON.stringify(wv);
    content.append(renderModuleHero(mod, statusBadgeFor(detectModuleStatus(mod, wv))));

    const guildName = (state.guilds.find((g) => g.id === state.selectedGuildId)?.name) || "your server";
    const username = state.user?.username || "newmember";
    const statusBox = h("div");

    const saveBtn = h("button", { type: "button", class: "btn btn-primary", disabled: true }, "Save changes");
    function markDirty() { saveBtn.disabled = JSON.stringify(wv) === baseline; }

    const okColor = (c) => /^#[0-9a-f]{6}$/i.test(c || "") ? c : "#5865f2";
    const plainOK = (() => { try { const d = document.createElement("div"); d.contentEditable = "plaintext-only"; return d.contentEditable === "plaintext-only"; } catch { return false; } })();
    // contenteditable bound to wv[key], styled like the Embed Builder canvas.
    function wEdit(cls, key, ph, multiline) {
      const el = h("div", { class: "eb-editable " + cls });
      el.contentEditable = plainOK ? "plaintext-only" : "true";
      el.spellcheck = false;
      el.setAttribute("role", "textbox");
      el.setAttribute("aria-label", ph);
      if (ph) el.setAttribute("data-ph", ph);
      el.textContent = wv[key] || "";
      el.addEventListener("input", () => { wv[key] = (el.innerText || "").replace(/\n$/, ""); markDirty(); });
      el.addEventListener("paste", (ev) => { ev.preventDefault(); const t = (ev.clipboardData || window.clipboardData).getData("text") || ""; try { document.execCommand("insertText", false, t); } catch (_) { el.textContent += t; } });
      if (!multiline) el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); el.blur(); } });
      return el;
    }
    // Clean pill toggle.
    function wSwitch(label, getV, setV) {
      const cb = h("input", { type: "checkbox", checked: getV() ? true : null });
      cb.addEventListener("change", () => setV(cb.checked));
      return h("label", { class: "w-switch" }, cb, h("span", { class: "w-sw-track" }, h("span", { class: "w-sw-thumb" })), h("span", { class: "w-sw-label" }, label));
    }

    // ---- The Discord welcome message (Embed Builder look) ----
    const mentionLine = h("div", { class: "eb-msg-content w-mention-line" }, h("span", { class: "w-mention" }, "@" + username));
    const imageEl = h("img", { class: "eb-e-image", alt: "", onerror: "this.style.display='none'" });
    function syncMention() { mentionLine.style.display = wv.mentionUser !== false ? "" : "none"; }
    function syncImage() { if (/^https:\/\//i.test(wv.imageUrl || "")) { imageEl.src = wv.imageUrl; imageEl.style.display = ""; } else { imageEl.style.display = "none"; } }
    const inner = h("div", { class: "eb-embed-inner" },
      wEdit("eb-e-title", "title", "Welcome title", false),
      wEdit("eb-e-desc", "message", "Welcome message — use {user} and {server}", true),
      imageEl,
      h("div", { class: "eb-e-footer" }, h("span", null, guildName)));
    const box = h("div", { class: "eb-embed", style: { borderColor: okColor(wv.embedColor) } }, inner);
    const device = h("div", { class: "eb-discord w-discord" }, mentionLine, box);
    syncMention(); syncImage();

    // ---- Controls ----
    const chSel = renderChannelSelect("w-channel", "channelId", state.channels || [], wv.channelId);
    chSel.classList.add("w-select");
    chSel.addEventListener("change", () => { wv.channelId = chSel.value; markDirty(); });
    const colorIn = h("input", { type: "color", class: "w-color", value: okColor(wv.embedColor), title: "Accent colour" });
    colorIn.addEventListener("input", () => { wv.embedColor = colorIn.value; box.style.borderColor = colorIn.value; markDirty(); });
    const imgIn = h("input", { type: "url", class: "w-input", value: wv.imageUrl || "", placeholder: "Image URL (optional)" });
    imgIn.addEventListener("input", () => { wv.imageUrl = imgIn.value; markDirty(); });
    imgIn.addEventListener("change", syncImage);
    imgIn.addEventListener("blur", syncImage);

    const topbar = h("div", { class: "w-topbar" },
      h("div", { class: "w-topbar-channel" }, h("span", { class: "w-hash" }, "#"), chSel),
      wSwitch("Welcome enabled", () => wv.enabled !== false, (v) => { wv.enabled = v; markDirty(); }));
    const appearance = h("div", { class: "w-appearance" },
      h("label", { class: "w-app" }, h("span", { class: "w-app-lbl" }, "Accent"), colorIn),
      h("label", { class: "w-app w-app-grow" }, h("span", { class: "w-app-lbl" }, "Image"), imgIn),
      wSwitch("Mention the member", () => wv.mentionUser !== false, (v) => { wv.mentionUser = v; syncMention(); markDirty(); }));

    const tip = h("div", { class: "w-tip" },
      (() => { const i = h("span", { class: "w-tip-ico" }); i.appendChild(iconSvg("sparkle")); return i; })(),
      h("div", null, h("code", null, "{user}"), " mentions the new member · ", h("code", null, "{server}"), " is the server name — both are filled in when someone joins."));

    const resetBtn = h("button", { type: "button", class: "btn btn-ghost", onclick: () => doResetModule(mod, content) }, "Reset to default");
    const bar = h("div", { class: "dash-sticky-actions" }, saveBtn, resetBtn, h("span", { class: "dash-unsaved" }, h("span", { class: "dot" }), "Unsaved changes"), h("div", { class: "filler" }), h("span", { style: { fontSize: "0.78rem", color: "var(--dash-muted-2)" } }, mod.tier === "premium" ? "Premium" : "Free", " module"));
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true; saveBtn.textContent = "Saving…";
      try {
        await data.saveModule(state.selectedGuildId, mod.name, wv);
        toast("success", `${mod.label} saved`);
        const stat = document.getElementById("dash-save-status"); if (stat) { stat.classList.add("show"); setTimeout(() => stat.classList.remove("show"), 1800); }
        loadModule(content, mod.name);
      } catch (e) {
        saveBtn.textContent = "Save changes"; saveBtn.disabled = false;
        if (e.code === 403 && e.data && e.data.error === "premium_required") { statusBox.append(notice("warn", "Premium required", (e.data && e.data.message) || "Activate Premium with /subscribe in Discord.")); return; }
        toast("error", e.message || "Save failed");
        statusBox.append(notice("error", "Save failed", e.message));
      }
    });

    content.append(h("div", { class: "dash-card w-canvas" },
      h("div", { class: "w-canvas-head" }, h("span", { class: "w-canvas-label" }, "Live welcome message"), h("span", { class: "w-canvas-hint" }, "Click the title or text to edit")),
      topbar, device, appearance, tip, statusBox, bar));
  }

  // Shared pill toggle for the module canvases.
  function mcSwitch(label, getV, setV) {
    const cb = h("input", { type: "checkbox", checked: getV() ? true : null });
    cb.addEventListener("change", () => setV(cb.checked));
    return h("label", { class: "w-switch" }, cb, h("span", { class: "w-sw-track" }, h("span", { class: "w-sw-thumb" })), h("span", { class: "w-sw-label" }, label));
  }
  function roleHex(r) { return (r && typeof r.color === "number" && r.color) ? "#" + r.color.toString(16).padStart(6, "0") : "#b9bbbe"; }
  // Shared module-canvas save bar (Save / Reset + dirty tracking) — wires the
  // primary button to data.saveModule(av) and re-loads on success.
  function mcSaveBar(mod, content, getPayload, saveBtn, statusBox) {
    const resetBtn = h("button", { type: "button", class: "btn btn-ghost", onclick: () => doResetModule(mod, content) }, "Reset to default");
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true; saveBtn.textContent = "Saving…";
      try {
        await data.saveModule(state.selectedGuildId, mod.name, getPayload());
        toast("success", `${mod.label} saved`);
        const stat = document.getElementById("dash-save-status"); if (stat) { stat.classList.add("show"); setTimeout(() => stat.classList.remove("show"), 1800); }
        loadModule(content, mod.name);
      } catch (e) {
        saveBtn.textContent = "Save changes"; saveBtn.disabled = false;
        if (e.code === 403 && e.data && e.data.error === "premium_required") { statusBox.append(notice("warn", "Premium required", (e.data && e.data.message) || "Activate Premium with /subscribe in Discord.")); return; }
        toast("error", e.message || "Save failed");
        statusBox.append(notice("error", "Save failed", e.message));
      }
    });
    return h("div", { class: "dash-sticky-actions" }, saveBtn, resetBtn, h("span", { class: "dash-unsaved" }, h("span", { class: "dot" }), "Unsaved changes"), h("div", { class: "filler" }), h("span", { style: { fontSize: "0.78rem", color: "var(--dash-muted-2)" } }, mod.tier === "premium" ? "Premium" : "Free", " module"));
  }

  // Auto Roles as a live-preview canvas: a "member joined → gets these roles"
  // Discord card whose role list is the editable control.
  function renderAutoRolesCanvas(content, mod, values) {
    const av = Object.assign({ enabled: false, roleIds: [], ignoreBots: true }, values || {});
    av.roleIds = Array.isArray(av.roleIds) ? av.roleIds.slice() : [];
    const baseline = JSON.stringify(av);
    content.append(renderModuleHero(mod, statusBadgeFor(detectModuleStatus(mod, av))));

    const username = state.user?.username || "newmember";
    const allRoles = (state.roles || []).filter((r) => r.id && r.name !== "@everyone");
    const roleById = (id) => allRoles.find((r) => r.id === id);
    const statusBox = h("div");
    const saveBtn = h("button", { type: "button", class: "btn btn-primary", disabled: true }, "Save changes");
    function markDirty() { saveBtn.disabled = JSON.stringify(av) === baseline; }

    const rolesHost = h("div", { class: "ar-roles" });
    function renderRoles() {
      clear(rolesHost);
      if (!av.roleIds.length) rolesHost.append(h("span", { class: "ar-empty" }, "No roles yet — pick one →"));
      av.roleIds.forEach((id) => {
        const r = roleById(id), col = roleHex(r);
        rolesHost.append(h("span", { class: "ar-chip", style: { borderColor: col } },
          h("span", { class: "ar-chip-dot", style: { background: col } }),
          h("span", { class: "ar-chip-name" }, r ? r.name : "unknown role"),
          h("button", { type: "button", class: "ar-chip-x", title: "Remove role", onclick: () => { av.roleIds = av.roleIds.filter((x) => x !== id); markDirty(); renderRoles(); } }, "✕")));
      });
      const remaining = allRoles.filter((r) => !av.roleIds.includes(r.id));
      if (remaining.length) {
        const sel = h("select", { class: "ar-add" }, h("option", { value: "" }, "+ Add a role"), ...remaining.map((r) => h("option", { value: r.id }, r.name)));
        sel.addEventListener("change", () => { if (sel.value) { av.roleIds.push(sel.value); markDirty(); renderRoles(); } });
        rolesHost.append(sel);
      }
    }
    renderRoles();

    const preview = h("div", { class: "eb-discord ar-preview" },
      h("div", { class: "ar-join" }, h("span", { class: "ar-join-ico", "aria-hidden": "true" }, "👋"), h("span", null, h("strong", { class: "ar-join-name" }, "@" + username), " just joined the server")),
      h("div", { class: "ar-given-lbl" }, "Automatically given:"),
      rolesHost);

    const controls = h("div", { class: "w-appearance" },
      mcSwitch("Auto roles enabled", () => av.enabled === true, (v) => { av.enabled = v; markDirty(); }),
      mcSwitch("Skip bot accounts", () => av.ignoreBots !== false, (v) => { av.ignoreBots = v; markDirty(); }));

    const tip = h("div", { class: "w-tip" },
      (() => { const i = h("span", { class: "w-tip-ico" }); i.appendChild(iconSvg("sparkle")); return i; })(),
      h("div", null, "Every new member gets these roles the instant they join. Keep the Arkoris role ", h("strong", null, "above"), " them in Server Settings or it can't assign them."));

    content.append(h("div", { class: "dash-card w-canvas" },
      h("div", { class: "w-canvas-head" }, h("span", { class: "w-canvas-label" }, "Live preview"), h("span", { class: "w-canvas-hint" }, "Add or remove the roles new members receive")),
      preview, controls, tip, statusBox, mcSaveBar(mod, content, () => av, saveBtn, statusBox)));
  }

  // ---- Shared module-canvas field helpers (reused by every module canvas) ----
  function mcField(label, control, hint) {
    return h("label", { class: "mc-field" },
      h("span", { class: "mc-field-lbl" }, label),
      control,
      hint ? h("span", { class: "mc-hint" }, hint) : null);
  }
  function mcNumber(getV, setV, opts) {
    opts = opts || {};
    const inp = h("input", { type: "number", class: "mc-num" });
    if (opts.min != null) inp.min = String(opts.min);
    if (opts.max != null) inp.max = String(opts.max);
    inp.value = String(getV());
    const clamp = (n) => { if (isNaN(n)) n = opts.min != null ? opts.min : 0; if (opts.min != null && n < opts.min) n = opts.min; if (opts.max != null && n > opts.max) n = opts.max; return n; };
    inp.addEventListener("input", () => { const n = parseInt(inp.value, 10); if (!isNaN(n)) setV(clamp(n)); });
    inp.addEventListener("blur", () => { const n = clamp(parseInt(inp.value, 10)); inp.value = String(n); setV(n); });
    return inp;
  }
  function mcSelect(options, getV, setV) {
    const sel = h("select", { class: "mc-select" }, ...options.map((o) => h("option", { value: o.value }, o.label)));
    sel.value = String(getV());
    sel.addEventListener("change", () => setV(sel.value));
    return sel;
  }
  function mcSection(label, ...kids) {
    return h("div", { class: "mc-section" }, label ? h("div", { class: "mc-section-lbl" }, label) : null, ...kids);
  }
  // Channel/role chip multi-select (e.g. "don't earn XP here"). kind: 'channel'|'role'.
  function mcChips(kind, getIds, setIds, markDirty, opts) {
    opts = opts || {};
    const host = h("div", { class: "ar-roles mc-chips" });
    const pool = kind === "role"
      ? (state.roles || []).filter((r) => r.id && r.name !== "@everyone")
      : (state.channels || []).filter((c) => c && c.name);
    const byId = (id) => pool.find((x) => x.id === id);
    function draw() {
      clear(host);
      const ids = getIds();
      if (!ids.length && opts.empty) host.append(h("span", { class: "ar-empty" }, opts.empty));
      ids.forEach((id) => {
        const item = byId(id);
        const col = kind === "role" ? roleHex(item) : "#8b8d91";
        host.append(h("span", { class: "ar-chip", style: { borderColor: col } },
          kind === "role"
            ? h("span", { class: "ar-chip-dot", style: { background: col } })
            : h("span", { class: "mc-chip-hash" }, "#"),
          h("span", { class: "ar-chip-name" }, item ? item.name : "unknown"),
          h("button", { type: "button", class: "ar-chip-x", title: "Remove", onclick: () => { setIds(getIds().filter((x) => x !== id)); markDirty(); draw(); } }, "✕")));
      });
      const remaining = pool.filter((x) => !getIds().includes(x.id));
      if (remaining.length) {
        const sel = h("select", { class: "ar-add" }, h("option", { value: "" }, opts.add || "+ Add"), ...remaining.map((x) => h("option", { value: x.id }, (kind === "channel" ? "#" : "") + x.name)));
        sel.addEventListener("change", () => { if (sel.value) { setIds(getIds().concat([sel.value])); markDirty(); draw(); } });
        host.append(sel);
      }
    }
    draw();
    return host;
  }

  // XP & Leaderboards as a live-preview canvas: a level-up announcement +
  // weekly leaderboard preview, with the XP-shaping + reward controls below.
  function renderXpCanvas(content, mod, values) {
    const xv = Object.assign({
      enabled: false, xpMin: 5, xpMax: 15, cooldownSec: 60,
      ignoredChannels: [], ignoredRoles: [],
      levelUpAnnounce: true, levelUpChannelId: "",
      weeklyResetDay: "mon", weeklyChannelId: "",
      rewardsMode: "disabled", rewardType: "none",
      reward1stCredits: 0, reward2ndCredits: 0, reward3rdCredits: 0,
      reward1stEggs: 0, reward2ndEggs: 0, reward3rdEggs: 0,
    }, values || {});
    xv.ignoredChannels = Array.isArray(xv.ignoredChannels) ? xv.ignoredChannels.slice() : [];
    xv.ignoredRoles = Array.isArray(xv.ignoredRoles) ? xv.ignoredRoles.slice() : [];
    const baseline = JSON.stringify(xv);
    content.append(renderModuleHero(mod, statusBadgeFor(detectModuleStatus(mod, xv))));

    const username = state.user?.username || "newmember";
    const statusBox = h("div");
    const saveBtn = h("button", { type: "button", class: "btn btn-primary", disabled: true }, "Save changes");
    function markDirty() { saveBtn.disabled = JSON.stringify(xv) === baseline; }

    const DAYS = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
    const chName = (id) => { const c = (state.channels || []).find((x) => x.id === id); return c ? c.name : null; };

    // ---- Live preview: level-up bubble + weekly leaderboard embed ----
    const device = h("div", { class: "eb-discord xp-preview" });
    function drawPreview() {
      clear(device);
      if (xv.levelUpAnnounce !== false) {
        const where = chName(xv.levelUpChannelId);
        device.append(h("div", { class: "xp-lvl" },
          h("span", { class: "xp-lvl-ico", "aria-hidden": "true" }, "🎉"),
          h("span", { class: "xp-lvl-txt" }, h("strong", { class: "xp-lvl-name" }, "@" + username), " just reached ", h("strong", null, "Level 12"), "!"),
          where ? h("span", { class: "xp-lvl-ch" }, "#" + where) : null));
      } else {
        device.append(h("div", { class: "xp-lvl xp-lvl-off" }, "Level-up announcements are off — members still earn XP silently."));
      }
      const rows = [["🥇", "Aria", "4,820"], ["🥈", "Kade", "3,910"], ["🥉", "Nyx", "2,540"]];
      device.append(h("div", { class: "eb-embed xp-lb", style: { borderColor: "#f0b232" } },
        h("div", { class: "eb-embed-inner" },
          h("div", { class: "xp-lb-title" }, "🏆 Weekly Leaderboard"),
          ...rows.map(([m, n, xp]) => h("div", { class: "xp-lb-row" },
            h("span", { class: "xp-lb-medal" }, m), h("span", { class: "xp-lb-name" }, n), h("span", { class: "xp-lb-xp" }, xp + " XP"))),
          h("div", { class: "eb-e-footer" }, h("span", null, "Resets every " + DAYS[xv.weeklyResetDay || "mon"])))));
    }
    drawPreview();

    // ---- Top bar: enabled (the two channels live in their own sections) ----
    const lvlCh = renderChannelSelect("xp-lvlch", "levelUpChannelId", state.channels || [], xv.levelUpChannelId);
    lvlCh.classList.add("mc-select");
    lvlCh.addEventListener("change", () => { xv.levelUpChannelId = lvlCh.value; drawPreview(); markDirty(); });
    const topbar = h("div", { class: "w-topbar" },
      h("span", { class: "poll-topbar-lbl" }, "Chatting earns XP — level-ups and the weekly leaderboard post to the channels below"),
      mcSwitch("XP enabled", () => xv.enabled === true, (v) => { xv.enabled = v; markDirty(); }));

    // ---- XP rate ----
    const rateGrid = h("div", { class: "mc-grid" },
      mcField("XP per message — min", mcNumber(() => xv.xpMin, (v) => { xv.xpMin = v; markDirty(); }, { min: 1, max: 100 })),
      mcField("XP per message — max", mcNumber(() => xv.xpMax, (v) => { xv.xpMax = v; markDirty(); }, { min: 1, max: 200 })),
      mcField("Cooldown", mcNumber(() => xv.cooldownSec, (v) => { xv.cooldownSec = v; markDirty(); }, { min: 0, max: 600 }), "seconds between earns"));
    const rateSection = mcSection("How XP is earned", rateGrid);

    // ---- Level-up announcements (its own channel, separate from the weekly board) ----
    const levelSection = mcSection("Level-up announcements",
      h("div", { class: "mc-grid" },
        mcField("Level-up channel", lvlCh, "Where level-up messages are posted")),
      h("div", { class: "mc-switch-row" }, mcSwitch("Announce level-ups", () => xv.levelUpAnnounce !== false, (v) => { xv.levelUpAnnounce = v; drawPreview(); markDirty(); })));

    // ---- Ignored channels / roles ----
    const ignoreSection = mcSection("Where XP doesn't count",
      h("div", { class: "mc-grid" },
        mcField("Ignored channels", mcChips("channel", () => xv.ignoredChannels, (a) => { xv.ignoredChannels = a; }, markDirty, { empty: "Every channel earns XP", add: "+ Ignore a channel" })),
        mcField("Ignored roles", mcChips("role", () => xv.ignoredRoles, (a) => { xv.ignoredRoles = a; }, markDirty, { empty: "Every role earns XP", add: "+ Ignore a role" }))));

    // ---- Weekly leaderboard ----
    const weeklyCh = renderChannelSelect("xp-weeklych", "weeklyChannelId", state.channels || [], xv.weeklyChannelId);
    weeklyCh.classList.add("mc-select");
    weeklyCh.addEventListener("change", () => { xv.weeklyChannelId = weeklyCh.value; markDirty(); });
    const weeklySection = mcSection("Weekly leaderboard",
      h("div", { class: "mc-grid" },
        mcField("Reset day", mcSelect(
          [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]].map(([value, label]) => ({ value, label })),
          () => xv.weeklyResetDay, (v) => { xv.weeklyResetDay = v; drawPreview(); markDirty(); })),
        mcField("Weekly leaderboard channel", weeklyCh)));

    // ---- Weekly rewards (conditional detail) ----
    const rewardHost = h("div", { class: "xp-rewards-host" });
    function drawRewards() {
      clear(rewardHost);
      if (xv.rewardsMode === "disabled") {
        rewardHost.append(h("div", { class: "mc-hint mc-hint-block" }, "Set weekly rewards to Manual or Automatic to hand out prizes to the top 3 each week."));
        return;
      }
      rewardHost.append(mcField("Reward type", mcSelect(
        [["none", "None"], ["credits", "Credits"], ["eggs", "Pet eggs"], ["both", "Credits + eggs"]].map(([value, label]) => ({ value, label })),
        () => xv.rewardType, (v) => { xv.rewardType = v; markDirty(); drawRewards(); })));
      const showC = xv.rewardType === "credits" || xv.rewardType === "both";
      const showE = xv.rewardType === "eggs" || xv.rewardType === "both";
      if (!showC && !showE) { rewardHost.append(h("div", { class: "mc-hint mc-hint-block" }, "Pick a reward type to set prize amounts.")); return; }
      const grid = h("div", { class: "xp-rewards" });
      [["🥇", "1st"], ["🥈", "2nd"], ["🥉", "3rd"]].forEach(([medal, ord]) => {
        const row = h("div", { class: "xp-reward-row" }, h("span", { class: "xp-reward-place" }, medal + " " + ord));
        if (showC) row.append(h("span", { class: "xp-reward-cell" }, mcNumber(() => xv["reward" + ord + "Credits"], (v) => { xv["reward" + ord + "Credits"] = v; markDirty(); }, { min: 0, max: 100000 }), h("span", { class: "xp-reward-unit" }, "credits")));
        if (showE) row.append(h("span", { class: "xp-reward-cell" }, mcNumber(() => xv["reward" + ord + "Eggs"], (v) => { xv["reward" + ord + "Eggs"] = v; markDirty(); }, { min: 0, max: 100 }), h("span", { class: "xp-reward-unit" }, "eggs")));
        grid.append(row);
      });
      rewardHost.append(grid);
    }
    drawRewards();
    const rewardSection = mcSection("Weekly rewards",
      h("div", { class: "mc-grid" },
        mcField("Hand out rewards", mcSelect(
          [["disabled", "Off"], ["manual", "Manual (you approve)"], ["auto", "Automatic"]].map(([value, label]) => ({ value, label })),
          () => xv.rewardsMode, (v) => { xv.rewardsMode = v; markDirty(); drawRewards(); }))),
      rewardHost);

    const tip = h("div", { class: "w-tip" },
      (() => { const i = h("span", { class: "w-tip-ico" }); i.appendChild(iconSvg("sparkle")); return i; })(),
      h("div", null, "Members earn a random ", h("strong", null, "XP min–max"), " per message, once per cooldown. The weekly board ranks the most active members and resets on your chosen day."));

    content.append(h("div", { class: "dash-card w-canvas" },
      h("div", { class: "w-canvas-head" }, h("span", { class: "w-canvas-label" }, "Live preview"), h("span", { class: "w-canvas-hint" }, "What members see when they level up")),
      device, topbar, rateSection, levelSection, ignoreSection, weeklySection, rewardSection, tip, statusBox,
      mcSaveBar(mod, content, () => xv, saveBtn, statusBox)));
  }

  // Polls as a live-preview canvas: a Discord poll with live-result bars; the
  // editable control is which roles may start a poll.
  // (Polls was removed from the dashboard — /poll lives entirely in Discord.)

  // Reusable tag/keyword input (chips + free-text add) for module canvases.
  function mcKeywords(getList, setList, markDirty, opts) {
    opts = opts || {};
    const host = h("div", { class: "mc-kw" });
    const inp = h("input", { type: "text", class: "mc-kw-input", placeholder: opts.placeholder || "Type and press Enter…" });
    function drawChips() {
      host.querySelectorAll(".mc-kw-chip").forEach((n) => n.remove());
      getList().forEach((kw) => {
        const chip = h("span", { class: "ar-chip mc-kw-chip" },
          h("span", { class: "ar-chip-name" }, kw),
          h("button", { type: "button", class: "ar-chip-x", title: "Remove", onclick: () => { setList(getList().filter((x) => x !== kw)); markDirty(); drawChips(); } }, "✕"));
        host.insertBefore(chip, inp);
      });
    }
    const add = () => {
      let v = (inp.value || "").trim().toLowerCase();
      if (opts.stripUrl) v = v.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (v && !getList().includes(v)) { setList(getList().concat([v])); markDirty(); drawChips(); }
      inp.value = "";
    };
    inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === ",") { ev.preventDefault(); add(); } });
    inp.addEventListener("blur", add);
    host.append(inp);
    drawChips();
    return host;
  }

  // Moderation as a live-preview canvas: a mod-log entry + (optional) URL-filter
  // notice, with mod-roles, link-filter, and warning controls below.
  function renderModerationCanvas(content, mod, values) {
    const mv = Object.assign({ enabled: false, modLogChannelId: "", modRoleIds: [], urlFilterEnabled: false, whitelistDomains: [], maxWarnings: 3 }, values || {});
    mv.modRoleIds = Array.isArray(mv.modRoleIds) ? mv.modRoleIds.slice() : [];
    mv.whitelistDomains = Array.isArray(mv.whitelistDomains) ? mv.whitelistDomains.slice() : [];
    const baseline = JSON.stringify(mv);
    content.append(renderModuleHero(mod, statusBadgeFor(detectModuleStatus(mod, mv))));

    const statusBox = h("div");
    const saveBtn = h("button", { type: "button", class: "btn btn-primary", disabled: true }, "Save changes");
    function markDirty() { saveBtn.disabled = JSON.stringify(mv) === baseline; }
    const chName = (id) => { const c = (state.channels || []).find((x) => x.id === id); return c ? c.name : null; };
    const modField = (label, val) => h("div", { class: "mod-field" }, h("span", { class: "mod-field-l" }, label), h("span", { class: "mod-field-v" }, val));

    // ---- Live preview: a mod-log entry + (optional) URL-filter notice ----
    const device = h("div", { class: "eb-discord mod-preview" });
    function drawPreview() {
      clear(device);
      device.append(h("div", { class: "eb-embed mod-log", style: { borderColor: "#f0b232" } },
        h("div", { class: "eb-embed-inner" },
          h("div", { class: "mod-log-title" }, "⚠️ Warning issued"),
          h("div", { class: "mod-log-grid" },
            modField("Member", "@toxicraptor"),
            modField("Moderator", "@" + (state.user?.username || "staff")),
            modField("Reason", "Spamming in chat"),
            modField("Warnings", "2 / " + (mv.maxWarnings != null ? mv.maxWarnings : 3))),
          h("div", { class: "eb-e-footer" }, h("span", null, "Logged to #" + (chName(mv.modLogChannelId) || "mod-log"))))));
      if (mv.urlFilterEnabled) {
        device.append(h("div", { class: "mod-urlnotice" },
          h("span", { class: "mod-urlnotice-ico", "aria-hidden": "true" }, "🔗"),
          h("span", null, "Deleted a link from ", h("strong", null, "@newbie"), " — domain not on the allow-list.")));
      }
    }
    drawPreview();

    // ---- Top bar: mod-log channel + enabled ----
    const logCh = renderChannelSelect("mod-logch", "modLogChannelId", state.channels || [], mv.modLogChannelId);
    logCh.classList.add("w-select");
    logCh.addEventListener("change", () => { mv.modLogChannelId = logCh.value; drawPreview(); markDirty(); });
    const topbar = h("div", { class: "w-topbar" },
      h("div", { class: "w-topbar-channel" }, h("span", { class: "w-hash" }, "#"), logCh),
      mcSwitch("Moderation enabled", () => mv.enabled === true, (v) => { mv.enabled = v; markDirty(); }));

    const modRoleSection = mcSection("Who can moderate",
      mcChips("role", () => mv.modRoleIds, (a) => { mv.modRoleIds = a; }, markDirty, { empty: "Uses Discord's built-in permissions", add: "+ Add a mod role" }));

    const filterSection = mcSection("Link filter",
      h("div", { class: "mc-switch-row" }, mcSwitch("Delete links from non-whitelisted domains", () => mv.urlFilterEnabled === true, (v) => { mv.urlFilterEnabled = v; drawPreview(); markDirty(); })),
      mcField("Allowed domains", mcKeywords(() => mv.whitelistDomains, (a) => { mv.whitelistDomains = a; }, markDirty, { placeholder: "e.g. youtube.com — Enter to add", stripUrl: true }), "Links to these domains are never deleted"));

    const warnSection = mcSection("Warnings",
      h("div", { class: "mc-grid" },
        mcField("Warnings before auto-action", mcNumber(() => mv.maxWarnings, (v) => { mv.maxWarnings = v; drawPreview(); markDirty(); }, { min: 0, max: 20 }), "0 turns the warning cap off")));

    const tip = h("div", { class: "w-tip" },
      (() => { const i = h("span", { class: "w-tip-ico" }); i.appendChild(iconSvg("sparkle")); return i; })(),
      h("div", null, "Mods use ", h("code", null, "/warn"), ", ", h("code", null, "/timeout"), ", ", h("code", null, "/kick"), " and ", h("code", null, "/ban"), ". Every action is posted to the mod-log channel above."));

    content.append(h("div", { class: "dash-card w-canvas" },
      h("div", { class: "w-canvas-head" }, h("span", { class: "w-canvas-label" }, "Live preview"), h("span", { class: "w-canvas-hint" }, "What lands in your mod-log")),
      device, topbar, modRoleSection, filterSection, warnSection, tip, statusBox,
      mcSaveBar(mod, content, () => mv, saveBtn, statusBox)));
  }

  // Reusable single-role <select> bound to model[key] for module canvases.
  function mcRoleSelect(getV, setV, noneLabel) {
    const roles = (state.roles || []).filter((r) => r.id && r.name !== "@everyone");
    const sel = h("select", { class: "mc-select" }, h("option", { value: "" }, noneLabel || "— none —"), ...roles.map((r) => h("option", { value: r.id }, r.name)));
    sel.value = getV() || "";
    sel.addEventListener("change", () => setV(sel.value));
    return sel;
  }

  // Hype as a live-preview canvas: a segmented Name/Tag/Invite/Boost selector,
  // each its own reward post preview + config (enable, keywords, credits,
  // channel, cooldown, role). Keys match the bot's hype_configs columns.
  function renderHypeCanvas(content, mod, values) {
    const mv = Object.assign({
      brand_name: "",
      name_enabled: false, name_keywords: [], name_credits: 0, name_channel_id: "", name_cooldown_hours: 0, name_role_id: "",
      tag_enabled: false, tag_keywords: [], tag_credits: 0, tag_channel_id: "", tag_cooldown_hours: 0, tag_role_id: "", tag_guild_id: "",
      invite_enabled: false, invite_credits: 0, invite_channel_id: "",
      boost_channel_id: "",
    }, values || {});
    mv.name_keywords = Array.isArray(mv.name_keywords) ? mv.name_keywords.slice() : [];
    mv.tag_keywords = Array.isArray(mv.tag_keywords) ? mv.tag_keywords.slice() : [];
    const baseline = JSON.stringify(mv);

    const anyOn = () => mv.name_enabled || mv.tag_enabled || mv.invite_enabled || !!mv.boost_channel_id;
    content.append(renderModuleHero(mod, statusBadgeFor(anyOn() ? "configured" : "missing")));

    const statusBox = h("div");
    const saveBtn = h("button", { type: "button", class: "btn btn-primary", disabled: true }, "Save changes");
    function markDirty() { saveBtn.disabled = JSON.stringify(mv) === baseline; }
    const chName = (id) => { const c = (state.channels || []).find((x) => x.id === id); return c ? c.name : null; };
    const roleById = (id) => (state.roles || []).find((r) => r.id === id);
    const username = state.user?.username || "member";

    // Each reward detector + which fields it has.
    const DETS = {
      name:   { emoji: "👤", label: "Name", color: "#eb459e", title: "Name reward", hasKw: true, hasCd: true, hasRole: true,
                en: "name_enabled", kw: "name_keywords", cr: "name_credits", ch: "name_channel_id", cd: "name_cooldown_hours", role: "name_role_id",
                msg: (kw) => ["added ", h("code", { class: "hype-kw" }, kw || "[keyword]"), " to their name"] },
      tag:    { emoji: "🏷️", label: "Tag", color: "#5865f2", title: "Tag reward", hasKw: true, hasCd: true, hasRole: true, hasGuild: true,
                en: "tag_enabled", kw: "tag_keywords", cr: "tag_credits", ch: "tag_channel_id", cd: "tag_cooldown_hours", role: "tag_role_id",
                msg: () => ["repped the server tag"] },
      invite: { emoji: "📨", label: "Invite", color: "#57f287", title: "Invite reward",
                en: "invite_enabled", cr: "invite_credits", ch: "invite_channel_id",
                msg: () => ["invited a new member"] },
      boost:  { emoji: "🚀", label: "Boost", color: "#f47fff", title: "Boost reward", noCredits: true,
                ch: "boost_channel_id",
                msg: () => ["boosted the server"] },
    };
    let active = "name";
    const detOn = (d) => d.en ? !!mv[d.en] : !!mv[d.ch];

    // ---- Live preview: the reward post for the active detector ----
    const device = h("div", { class: "eb-discord hype-preview" });
    function drawPreview() {
      clear(device);
      const d = DETS[active];
      const kw = d.kw ? (mv[d.kw] && mv[d.kw][0]) : null;
      const cr = d.cr ? (mv[d.cr] || 0) : 0;
      const role = d.role && mv[d.role] ? roleById(mv[d.role]) : null;
      const kids = [
        h("div", { class: "hype-head" }, h("span", { class: "hype-ico", "aria-hidden": "true" }, "✨"), h("span", null, d.title)),
        h("div", { class: "hype-msg" }, h("strong", null, "@" + username), " ", ...d.msg(kw)),
      ];
      if (!d.noCredits) {
        kids.push(h("div", { class: "hype-award" },
          h("span", { class: "hype-credits" }, "+" + cr + " credit" + (cr === 1 ? "" : "s")),
          role ? h("span", { class: "hype-role" }, "+ @" + role.name) : null));
      } else {
        kids.push(h("div", { class: "hype-award" }, h("span", { class: "hype-role" }, "🎉 Thank-you posted")));
      }
      kids.push(h("div", { class: "eb-e-footer" }, h("span", null, detOn(d) ? ("Posts to #" + (chName(mv[d.ch]) || "hype")) : "Off — turn it on below")));
      device.append(h("div", { class: "eb-embed hype-card", style: { borderColor: d.color } }, h("div", { class: "eb-embed-inner" }, ...kids)));
    }

    // ---- Segmented detector selector (green dot = enabled) ----
    const tabs = h("div", { class: "ev-tabs" });
    function renderTabs() {
      clear(tabs);
      Object.keys(DETS).forEach((k) => {
        const d = DETS[k];
        const b = h("button", { type: "button", class: "ev-tab" + (k === active ? " active" : "") + (detOn(d) ? " hype-tab-on" : ""), onclick: () => { active = k; renderTabs(); drawPreview(); drawDetector(); } }, d.emoji + " " + d.label);
        if (k === active) b.style.setProperty("--ev-accent", d.color);
        tabs.append(b);
      });
    }

    // ---- Per-detector config ----
    const detectorHost = h("div");
    function drawDetector() {
      clear(detectorHost);
      const d = DETS[active];
      const rows = [];
      if (d.en) {
        rows.push(h("div", { class: "mc-switch-row" }, mcSwitch(d.title + " enabled", () => mv[d.en] === true, (v) => { mv[d.en] = v; renderTabs(); drawPreview(); markDirty(); })));
      }
      if (d.hasKw) {
        rows.push(mcField(d.label + " keywords", mcKeywords(() => mv[d.kw], (a) => { mv[d.kw] = a; }, () => { markDirty(); drawPreview(); }, { placeholder: "Type a keyword — Enter to add" }), "Members with one of these in their name are rewarded"));
      }
      const grid = [];
      if (d.cr) grid.push(mcField("Credits per reward", mcNumber(() => mv[d.cr], (v) => { mv[d.cr] = v; drawPreview(); markDirty(); }, { min: 0, max: 1000000 })));
      if (d.ch) {
        const sel = renderChannelSelect("hype-" + active + "-ch", d.ch, state.channels || [], mv[d.ch]);
        sel.classList.add("mc-select");
        sel.addEventListener("change", () => { mv[d.ch] = sel.value; renderTabs(); drawPreview(); markDirty(); });
        grid.push(mcField("Reward channel", sel, d.noCredits ? "Set a channel to enable boost thank-yous" : null));
      }
      if (d.hasCd) grid.push(mcField("Cooldown (hours)", mcNumber(() => mv[d.cd], (v) => { mv[d.cd] = v; markDirty(); }, { min: 0, max: 8760 }), "0 = once per season"));
      if (grid.length) rows.push(h("div", { class: "mc-grid" }, ...grid));
      if (d.hasRole) rows.push(mcField("Reward role", mcRoleSelect(() => mv[d.role], (v) => { mv[d.role] = v; drawPreview(); markDirty(); }, "— no role —")));
      if (d.hasGuild) {
        const gi = h("input", { type: "text", class: "mc-num", value: mv.tag_guild_id || "", placeholder: "Blank = this server", maxlength: 32 });
        gi.addEventListener("input", () => { mv.tag_guild_id = gi.value.trim(); markDirty(); });
        rows.push(mcField("Tag server ID (advanced)", gi, "Reward members repping another server's tag"));
      }
      detectorHost.append(mcSection(d.title, ...rows));
    }

    drawPreview(); renderTabs(); drawDetector();

    // ---- Brand name (applies to every reward embed) ----
    const brandIn = h("input", { type: "text", class: "mc-num", value: mv.brand_name || "", placeholder: "Defaults to the server name", maxlength: 64 });
    brandIn.addEventListener("input", () => { mv.brand_name = brandIn.value; markDirty(); });
    const brandSection = mcSection("Branding", h("div", { class: "mc-grid" }, mcField("Brand name", brandIn, "Shown in every hype reward embed")));

    const tip = h("div", { class: "w-tip" },
      (() => { const i = h("span", { class: "w-tip-ico" }); i.appendChild(iconSvg("sparkle")); return i; })(),
      h("div", null, "Each reward works on its own — pick a tab, turn it on, and set its credits, channel and role. Members earn the moment Arkoris spots the activity."));

    content.append(h("div", { class: "dash-card w-canvas" },
      h("div", { class: "w-canvas-head" }, h("span", { class: "w-canvas-label" }, "Live preview"), h("span", { class: "w-canvas-hint" }, "Pick a reward type to set it up")),
      tabs, device, detectorHost, brandSection, tip, statusBox,
      mcSaveBar(mod, content, () => mv, saveBtn, statusBox)));
  }

  // Events as a live-preview canvas: a segmented Dino/Number/Vault selector
  // drives both the announcement preview and that type's reward fields.
  function renderEventsCanvas(content, mod, values) {
    const mv = Object.assign({
      enabled: false, announceChannelId: "", trackChannelId: "", pingRoleId: "", allowedRoleIds: [],
      dinoBase: 5, dinoBump: 1, dinoPer: 50, numberBase: 5, numberBump: 1, numberPer: 100, vaultBase: 5, vaultBump: 1, vaultPer: 50,
    }, values || {});
    mv.allowedRoleIds = Array.isArray(mv.allowedRoleIds) ? mv.allowedRoleIds.slice() : [];
    const baseline = JSON.stringify(mv);
    content.append(renderModuleHero(mod, statusBadgeFor(detectModuleStatus(mod, mv))));

    const statusBox = h("div");
    const saveBtn = h("button", { type: "button", class: "btn btn-primary", disabled: true }, "Save changes");
    function markDirty() { saveBtn.disabled = JSON.stringify(mv) === baseline; }
    const chName = (id) => { const c = (state.channels || []).find((x) => x.id === id); return c ? c.name : null; };
    const roleById = (id) => (state.roles || []).find((r) => r.id === id);

    const TYPES = {
      dino: { emoji: "🦖", label: "Dino", color: "#57f287", title: "Dino Guessing Event", blurb: "Guess which dino is hidden", baseKey: "dinoBase", bumpKey: "dinoBump", perKey: "dinoPer", noun: "wrong guesses" },
      number: { emoji: "🔢", label: "Number", color: "#5865f2", title: "Number Guess", blurb: "Guess the secret number", baseKey: "numberBase", bumpKey: "numberBump", perKey: "numberPer", noun: "wrong guesses" },
      vault: { emoji: "🔐", label: "Vault", color: "#faa61a", title: "Vault Crack", blurb: "Crack the vault code", baseKey: "vaultBase", bumpKey: "vaultBump", perKey: "vaultPer", noun: "wrong attempts" },
    };
    let active = "dino";

    // ---- Live preview: event announcement (themed by active type) ----
    const device = h("div", { class: "eb-discord event-preview" });
    function drawPreview() {
      clear(device);
      const t = TYPES[active];
      const base = mv[t.baseKey] != null ? mv[t.baseKey] : 0;
      const bump = mv[t.bumpKey] != null ? mv[t.bumpKey] : 0;
      const per = mv[t.perKey] != null ? mv[t.perKey] : 1;
      const role = mv.pingRoleId ? roleById(mv.pingRoleId) : null;
      device.append(h("div", { class: "eb-embed event-card", style: { borderColor: t.color } },
        h("div", { class: "eb-embed-inner" },
          role ? h("div", { class: "event-ping" }, "🔔 ", h("span", { class: "w-mention" }, "@" + role.name)) : null,
          h("div", { class: "event-head" }, h("span", { class: "event-emoji", "aria-hidden": "true" }, t.emoji), h("span", null, t.title)),
          h("div", { class: "event-blurb" }, t.blurb + " — first correct answer wins the pot."),
          h("div", { class: "event-prize", style: { borderColor: t.color } },
            h("span", { class: "event-prize-amt", style: { color: t.color } }, "🏆 " + base + " credits"),
            h("span", { class: "event-prize-sub" }, bump > 0 ? ("grows +" + bump + " every " + per + " " + t.noun) : "fixed prize")),
          h("div", { class: "event-foot-line" }, "Guess in #" + (chName(mv.trackChannelId) || "events")),
          h("div", { class: "eb-e-footer" }, h("span", null, "Announced in #" + (chName(mv.announceChannelId) || "events"))))));
    }

    // ---- Segmented event-type selector ----
    const tabs = h("div", { class: "ev-tabs" });
    function renderTabs() {
      clear(tabs);
      Object.keys(TYPES).forEach((k) => {
        const t = TYPES[k];
        const b = h("button", { type: "button", class: "ev-tab" + (k === active ? " active" : ""), onclick: () => { active = k; renderTabs(); drawPreview(); drawRewards(); } }, t.emoji + " " + t.label);
        if (k === active) b.style.setProperty("--ev-accent", t.color);
        tabs.append(b);
      });
    }

    // ---- Active type's reward fields ----
    const rewardHost = h("div");
    function drawRewards() {
      clear(rewardHost);
      const t = TYPES[active];
      const perLabel = t.noun.charAt(0).toUpperCase() + t.noun.slice(1) + " per bump";
      rewardHost.append(mcSection(t.label + " reward",
        h("div", { class: "mc-grid" },
          mcField("Base prize (credits)", mcNumber(() => mv[t.baseKey], (v) => { mv[t.baseKey] = v; drawPreview(); markDirty(); }, { min: 0, max: 10000 })),
          mcField("Added per interval", mcNumber(() => mv[t.bumpKey], (v) => { mv[t.bumpKey] = v; drawPreview(); markDirty(); }, { min: 0, max: 10000 })),
          mcField(perLabel, mcNumber(() => mv[t.perKey], (v) => { mv[t.perKey] = v; drawPreview(); markDirty(); }, { min: 1, max: 10000 }))),
        h("div", { class: "mc-hint mc-hint-block" }, "Switch the tab above to set rewards for the other event types.")));
    }

    drawPreview(); renderTabs(); drawRewards();

    // ---- Top bar: announce channel + enabled ----
    const annCh = renderChannelSelect("ev-annch", "announceChannelId", state.channels || [], mv.announceChannelId);
    annCh.classList.add("w-select");
    annCh.addEventListener("change", () => { mv.announceChannelId = annCh.value; drawPreview(); markDirty(); });
    const topbar = h("div", { class: "w-topbar" },
      h("div", { class: "w-topbar-channel" }, h("span", { class: "w-hash" }, "#"), annCh),
      mcSwitch("Events enabled", () => mv.enabled === true, (v) => { mv.enabled = v; markDirty(); }));

    // ---- Where it runs ----
    const trackCh = renderChannelSelect("ev-trackch", "trackChannelId", state.channels || [], mv.trackChannelId);
    trackCh.classList.add("mc-select");
    trackCh.addEventListener("change", () => { mv.trackChannelId = trackCh.value; drawPreview(); markDirty(); });
    const whereSection = mcSection("Where it runs",
      h("div", { class: "mc-grid" },
        mcField("Guess channel", trackCh, "Where players type their guesses"),
        mcField("Event ping role", mcRoleSelect(() => mv.pingRoleId, (v) => { mv.pingRoleId = v; drawPreview(); markDirty(); }, "— no ping —"))),
      mcField("Who can start events", mcChips("role", () => mv.allowedRoleIds, (a) => { mv.allowedRoleIds = a; }, markDirty, { empty: "Server admins only", add: "+ Add a host role" })));

    const tip = h("div", { class: "w-tip" },
      (() => { const i = h("span", { class: "w-tip-ico" }); i.appendChild(iconSvg("sparkle")); return i; })(),
      h("div", null, "Hosts run ", h("code", null, "/event-start"), " to launch one. The prize pot grows with every wrong guess, so the longer it runs the bigger the payout."));

    content.append(h("div", { class: "dash-card w-canvas" },
      h("div", { class: "w-canvas-head" }, h("span", { class: "w-canvas-label" }, "Live preview"), h("span", { class: "w-canvas-hint" }, "Pick an event type to preview")),
      tabs, device, topbar, whereSection, rewardHost, tip, statusBox,
      mcSaveBar(mod, content, () => mv, saveBtn, statusBox)));
  }

  // Reusable single-category <select> bound to model[key] for module canvases.
  function mcCategorySelect(getV, setV, noneLabel) {
    const cats = state.categories || [];
    const sel = h("select", { class: "mc-select" }, h("option", { value: "" }, noneLabel || "— none —"), ...cats.map((c) => h("option", { value: c.id }, c.name)));
    sel.value = getV() || "";
    sel.addEventListener("change", () => setV(sel.value));
    return sel;
  }

  // Tickets as a live-preview canvas: the ticket panel members click + a
  // staff-flow line that reflects the claim / auto-close / staff-role settings.
  function renderTicketsCanvas(content, mod, values) {
    const mv = Object.assign({ enabled: false, panelChannelId: "", ticketCategoryId: "", staffRoleIds: [], logChannelId: "", autoCloseHours: 0, claimEnabled: true }, values || {});
    mv.staffRoleIds = Array.isArray(mv.staffRoleIds) ? mv.staffRoleIds.slice() : [];
    const baseline = JSON.stringify(mv);
    content.append(renderModuleHero(mod, statusBadgeFor(detectModuleStatus(mod, mv))));
    // One-click bootstrap of the whole Support layout — same engine as /setup.
    content.append(renderQuickSetupBanner(mod, content));

    const statusBox = h("div");
    const saveBtn = h("button", { type: "button", class: "btn btn-primary", disabled: true }, "Save changes");
    function markDirty() { saveBtn.disabled = JSON.stringify(mv) === baseline; }
    const chName = (id) => { const c = (state.channels || []).find((x) => x.id === id); return c ? c.name : null; };
    const catName = (id) => { const c = (state.categories || []).find((x) => x.id === id); return c ? c.name : null; };
    const roleById = (id) => (state.roles || []).find((r) => r.id === id);

    // ---- Live preview: ticket panel + staff-flow line ----
    const device = h("div", { class: "eb-discord ticket-preview" });
    function drawPreview() {
      clear(device);
      const cat = mv.ticketCategoryId ? catName(mv.ticketCategoryId) : null;
      const staffNames = mv.staffRoleIds.map((id) => roleById(id)).filter(Boolean).map((r) => "@" + r.name);
      device.append(h("div", { class: "eb-embed ticket-card", style: { borderColor: "#5865f2" } },
        h("div", { class: "eb-embed-inner" },
          h("div", { class: "ticket-head" }, h("span", { class: "ticket-emoji", "aria-hidden": "true" }, "🎫"), h("span", null, "Support")),
          h("div", { class: "ticket-desc" }, "Need help? Open a ticket and our staff team will assist you privately."),
          h("div", { class: "ticket-open" }, "📩 Open a ticket"),
          h("div", { class: "eb-e-footer" }, h("span", null, "Panel in #" + (chName(mv.panelChannelId) || "support") + " · tickets under " + (cat || "Support"))))));
      const flow = [];
      flow.push(staffNames.length ? (staffNames.join(", ") + " get pinged") : "Staff get pinged");
      if (mv.claimEnabled !== false) flow.push("staff can claim it");
      if ((mv.autoCloseHours | 0) > 0) flow.push("auto-closes after " + mv.autoCloseHours + "h idle");
      device.append(h("div", { class: "ticket-flow" },
        h("span", { class: "ticket-flow-ico", "aria-hidden": "true" }, "→"),
        h("span", null, "When opened: " + flow.join(" · "))));
    }
    drawPreview();

    // ---- Top bar: panel channel + enabled ----
    const panelCh = renderChannelSelect("tk-panelch", "panelChannelId", state.channels || [], mv.panelChannelId);
    panelCh.classList.add("w-select");
    panelCh.addEventListener("change", () => { mv.panelChannelId = panelCh.value; drawPreview(); markDirty(); });
    const topbar = h("div", { class: "w-topbar" },
      h("div", { class: "w-topbar-channel" }, h("span", { class: "w-hash" }, "#"), panelCh),
      mcSwitch("Tickets enabled", () => mv.enabled === true, (v) => { mv.enabled = v; markDirty(); }));

    const catSection = mcSection("Tickets open under",
      mcField("Category", mcCategorySelect(() => mv.ticketCategoryId, (v) => { mv.ticketCategoryId = v; drawPreview(); markDirty(); }, "— pick a category —"), "New ticket channels are created in this category"));

    const staffSection = mcSection("Staff",
      mcField("Staff roles", mcChips("role", () => mv.staffRoleIds, (a) => { mv.staffRoleIds = a; }, () => { markDirty(); drawPreview(); }, { empty: "No staff roles yet", add: "+ Add a staff role" }), "Pinged when a ticket opens and given access to it"),
      h("div", { class: "mc-switch-row" }, mcSwitch("Let staff claim a ticket", () => mv.claimEnabled !== false, (v) => { mv.claimEnabled = v; drawPreview(); markDirty(); })));

    const logCh = renderChannelSelect("tk-logch", "logChannelId", state.channels || [], mv.logChannelId);
    logCh.classList.add("mc-select");
    logCh.addEventListener("change", () => { mv.logChannelId = logCh.value; markDirty(); });
    const lifeSection = mcSection("Lifecycle",
      h("div", { class: "mc-grid" },
        mcField("Ticket log channel", logCh, "Transcripts are archived here on close"),
        mcField("Auto-close after (hours)", mcNumber(() => mv.autoCloseHours, (v) => { mv.autoCloseHours = v; drawPreview(); markDirty(); }, { min: 0, max: 720 }), "0 = never auto-close")));

    const tip = h("div", { class: "w-tip" },
      (() => { const i = h("span", { class: "w-tip-ico" }); i.appendChild(iconSvg("sparkle")); return i; })(),
      h("div", null, "Members click the button to open a private ticket channel. Staff handle it, then close it to archive a transcript to the log channel."));

    content.append(h("div", { class: "dash-card w-canvas" },
      h("div", { class: "w-canvas-head" }, h("span", { class: "w-canvas-label" }, "Live preview"), h("span", { class: "w-canvas-hint" }, "The panel members use to get help")),
      device, topbar, catSection, staffSection, lifeSection, tip, statusBox,
      mcSaveBar(mod, content, () => mv, saveBtn, statusBox)));
  }

  // Staff Pay as a live-preview canvas: a monthly staff-earnings summary embed.
  // Only real control is the forum channel + enabled, so the preview leads.
  function renderStaffPayCanvas(content, mod, values) {
    const mv = Object.assign({ enabled: false, forumChannelId: "" }, values || {});
    const baseline = JSON.stringify(mv);
    content.append(renderModuleHero(mod, statusBadgeFor(detectModuleStatus(mod, mv))));

    const statusBox = h("div");
    const saveBtn = h("button", { type: "button", class: "btn btn-primary", disabled: true }, "Save changes");
    function markDirty() { saveBtn.disabled = JSON.stringify(mv) === baseline; }
    const chName = (id) => { const c = (state.channels || []).find((x) => x.id === id); return c ? c.name : null; };

    // ---- Live preview: monthly staff-earnings summary ----
    const device = h("div", { class: "eb-discord staffpay-preview" });
    function drawPreview() {
      clear(device);
      const rows = [["Aria", "24 tickets", "£120"], ["Kade", "17 tickets", "£85"], ["Nyx", "8 tickets", "£40"]];
      device.append(h("div", { class: "eb-embed staffpay-card", style: { borderColor: "#3ba55d" } },
        h("div", { class: "eb-embed-inner" },
          h("div", { class: "sp-title" }, "💼 Staff Earnings · June 2026"),
          ...rows.map(([n, sub, amt]) => h("div", { class: "sp-row" },
            h("div", { class: "sp-id" }, h("span", { class: "sp-name" }, "@" + n), h("span", { class: "sp-sub" }, sub)),
            h("span", { class: "sp-amt" }, amt))),
          h("div", { class: "eb-e-footer" }, h("span", null, "Logged in #" + (chName(mv.forumChannelId) || "staff-pay"))))));
    }
    drawPreview();

    // ---- Top bar: forum channel + enabled ----
    const forumCh = renderChannelSelect("sp-forumch", "forumChannelId", state.channels || [], mv.forumChannelId);
    forumCh.classList.add("w-select");
    forumCh.addEventListener("change", () => { mv.forumChannelId = forumCh.value; drawPreview(); markDirty(); });
    const topbar = h("div", { class: "w-topbar" },
      h("div", { class: "w-topbar-channel" }, h("span", { class: "w-hash" }, "#"), forumCh),
      mcSwitch("Staff Pay enabled", () => mv.enabled === true, (v) => { mv.enabled = v; markDirty(); }));

    const tip = h("div", { class: "w-tip" },
      (() => { const i = h("span", { class: "w-tip-ico" }); i.appendChild(iconSvg("sparkle")); return i; })(),
      h("div", null, "Arkoris tallies each staff member's ticket work and posts a monthly earnings thread to the forum channel above — pay amounts come from the tiers you manage below."));

    content.append(h("div", { class: "dash-card w-canvas" },
      h("div", { class: "w-canvas-head" }, h("span", { class: "w-canvas-label" }, "Live preview"), h("span", { class: "w-canvas-hint" }, "The monthly summary Arkoris posts")),
      device, topbar, tip, statusBox,
      mcSaveBar(mod, content, () => mv, saveBtn, statusBox)));

    // Per-role pay tiers — full create/edit/delete (ticket levels, auction %,
    // event payouts). Loads async; renders its own premium note on 403.
    renderStaffTiersSection(content);
  }

  // Payments as a live-preview canvas: a payment panel with inline-editable
  // instructions + PayPal/card buttons; currency & log channel are controls.
  function renderPaymentsCanvas(content, mod, values) {
    const mv = Object.assign({ enabled: false, defaultCurrency: "GBP", logChannelId: "", instructions: "" }, values || {});
    const baseline = JSON.stringify(mv);
    content.append(renderModuleHero(mod, statusBadgeFor(detectModuleStatus(mod, mv))));

    const statusBox = h("div");
    const saveBtn = h("button", { type: "button", class: "btn btn-primary", disabled: true }, "Save changes");
    function markDirty() { saveBtn.disabled = JSON.stringify(mv) === baseline; }
    const chName = (id) => { const c = (state.channels || []).find((x) => x.id === id); return c ? c.name : null; };
    const symbols = { GBP: "£", USD: "$" };
    const plainOK = (() => { try { const d = document.createElement("div"); d.contentEditable = "plaintext-only"; return d.contentEditable === "plaintext-only"; } catch { return false; } })();

    // ---- Live preview: payment panel (instructions are edited inline) ----
    const instrEl = h("div", { class: "eb-editable pay-instructions" });
    instrEl.contentEditable = plainOK ? "plaintext-only" : "true";
    instrEl.spellcheck = false;
    instrEl.setAttribute("role", "textbox");
    instrEl.setAttribute("aria-label", "Payment instructions");
    instrEl.setAttribute("data-ph", "Payment instructions members see…");
    instrEl.textContent = mv.instructions || "";
    instrEl.addEventListener("input", () => { mv.instructions = (instrEl.innerText || "").replace(/\n$/, ""); markDirty(); });
    instrEl.addEventListener("paste", (ev) => { ev.preventDefault(); const t = (ev.clipboardData || window.clipboardData).getData("text") || ""; try { document.execCommand("insertText", false, t); } catch (_) { instrEl.textContent += t; } });

    const sampleAmt = h("span", { class: "pay-sample-amt" });
    const logFooter = h("span");
    const curFooter = h("span");
    function syncCurrency() { const sym = symbols[mv.defaultCurrency] || "£"; sampleAmt.textContent = sym + "10.00"; curFooter.textContent = "prices in " + (mv.defaultCurrency || "GBP"); }
    function syncLogFooter() { logFooter.textContent = "Confirmations logged to #" + (chName(mv.logChannelId) || "payments"); }
    syncCurrency(); syncLogFooter();

    const device = h("div", { class: "eb-discord pay-preview" },
      h("div", { class: "eb-embed pay-card", style: { borderColor: "#3ba55d" } },
        h("div", { class: "eb-embed-inner" },
          h("div", { class: "pay-head" }, h("span", { class: "pay-emoji", "aria-hidden": "true" }, "💳"), h("span", null, "Payments")),
          instrEl,
          h("div", { class: "pay-sample" }, "Starter perks · ", sampleAmt),
          h("div", { class: "pay-buttons" }, h("div", { class: "pay-btn paypal" }, "PayPal"), h("div", { class: "pay-btn card" }, "Pay by card")),
          h("div", { class: "eb-e-footer" }, h("span", null, logFooter, " · ", curFooter)))));

    // ---- Top bar: log channel + enabled ----
    const logCh = renderChannelSelect("pay-logch", "logChannelId", state.channels || [], mv.logChannelId);
    logCh.classList.add("w-select");
    logCh.addEventListener("change", () => { mv.logChannelId = logCh.value; syncLogFooter(); markDirty(); });
    const topbar = h("div", { class: "w-topbar" },
      h("div", { class: "w-topbar-channel" }, h("span", { class: "w-hash" }, "#"), logCh),
      mcSwitch("Payments enabled", () => mv.enabled === true, (v) => { mv.enabled = v; markDirty(); }));

    const curSection = mcSection("Currency",
      h("div", { class: "mc-grid" },
        mcField("Default currency", mcSelect(
          [["GBP", "GBP (£)"], ["USD", "USD ($)"]].map(([value, label]) => ({ value, label })),
          () => mv.defaultCurrency, (v) => { mv.defaultCurrency = v; syncCurrency(); markDirty(); }))));

    const tip = h("div", { class: "w-tip" },
      (() => { const i = h("span", { class: "w-tip-ico" }); i.appendChild(iconSvg("sparkle")); return i; })(),
      h("div", null, "Connect your PayPal API keys in the section below — members pay from the panel, Arkoris auto-confirms and logs it to the channel above."));

    content.append(h("div", { class: "dash-card w-canvas" },
      h("div", { class: "w-canvas-head" }, h("span", { class: "w-canvas-label" }, "Live preview"), h("span", { class: "w-canvas-hint" }, "Click the text to edit your instructions")),
      device, topbar, curSection, tip, statusBox,
      mcSaveBar(mod, content, () => mv, saveBtn, statusBox)));

    // PayPal API + webhook configuration — secrets are write-only (the
    // backend only ever returns masks) + a live connection test button.
    renderPayPalConfigSection(content);
  }

  // Server Templates as a live-preview canvas: a segmented preset selector that
  // previews the channel tree + roles each template would build.
  async function renderServerTemplatesCanvas(content, mod, values) {
    content.append(renderModuleHero(mod, statusBadgeFor(detectModuleStatus(mod, values || {}))));
    const host = h("div", { class: "dash-card w-canvas" });
    content.append(host);
    host.append(h("div", { class: "skel-card" },
      h("div", { class: "skel skel-line lg w-30" }), h("div", { class: "skel skel-line w-80" })));

    let cat;
    try { cat = await data.templates(state.selectedGuildId); }
    catch (e) { clear(host); host.append(notice("warn", "Couldn't load templates", e.message || "Backend error")); return; }
    const templates = (cat && cat.templates) || [];
    if (!templates.length) { clear(host); host.append(notice("info", "No templates available", "The backend returned an empty catalog.")); return; }

    const EMOJI = { ARK: "🦖", SUPPORT: "🛟", COMMUNITY: "🏠" };
    let active = templates[0].id;
    const byId = Object.fromEntries(templates.map((t) => [t.id, t]));
    const guildName = (state.guilds.find((g) => g.id === state.selectedGuildId) || {}).name || "";

    const tabs = h("div", { class: "ev-tabs" });
    const device = h("div", { class: "template-preview" });
    const applyHost = h("div");

    function drawTabs() {
      clear(tabs);
      for (const t of templates) {
        const b = h("button", {
          type: "button",
          class: "ev-tab" + (t.id === active ? " active" : ""),
          onclick: () => { active = t.id; drawTabs(); drawPreview(); drawApply(); },
        }, (EMOJI[t.id] || "📦") + " " + t.label, " ",
          h("span", { class: "tpl-tier " + (t.tier === "free" ? "free" : "prem") }, t.tier === "free" ? "FREE" : (t.locked ? "🔒 PREMIUM" : "PREMIUM")));
        if (t.id === active) b.style.setProperty("--ev-accent", "#5865f2");
        tabs.append(b);
      }
    }

    function drawPreview() {
      clear(device);
      const t = byId[active];
      const channelsCol = h("div", { class: "tpl-channels" });
      for (const c of (t.preview?.channels || [])) {
        channelsCol.append(h("div", { class: "tpl-cat" }, c.cat));
        for (const it of c.items) channelsCol.append(h("div", { class: "tpl-ch" }, it));
      }
      const rolesCol = h("div", { class: "tpl-roles" },
        h("div", { class: "tpl-roles-lbl" }, "Roles"),
        h("div", { class: "tpl-roles-list" }, ...(t.preview?.roles || []).map((r) => h("span", { class: "tpl-role" }, r))));
      device.append(h("div", { class: "tpl-card" },
        t.blurb ? h("div", { class: "tpl-blurb" }, t.blurb + (t.live ? " Updated live from the source server." : "")) : null,
        h("div", { class: "tpl-cols" }, channelsCol, rolesCol),
        h("div", { class: "tpl-foot" }, `Creates ${t.channels} channels in ${t.categories} categories · ${t.roles} roles`)));
    }

    function drawApply() {
      clear(applyHost);
      const t = byId[active];
      if (t.locked) {
        applyHost.append(h("div", { class: "tpl-locked" },
          h("span", { class: "tpl-locked-ico", "aria-hidden": "true" }, "🔒"),
          h("div", null,
            h("strong", null, t.label + " is a Premium template. "),
            "Unlock it (and the rest of Premium) with ", h("code", null, "/subscribe"), " in Discord.")));
        return;
      }
      let mode = "seed";
      const seedBtn = h("button", { type: "button", class: "ev-tab active", onclick: () => setMode("seed") }, "➕ Add what's missing");
      const replBtn = h("button", { type: "button", class: "ev-tab", onclick: () => setMode("replace") }, "💥 Full replace");
      const modeNote = h("p", { class: "tpl-mode-note" });
      const confirmWrap = h("div", { class: "tpl-confirm", style: { display: "none" } },
        h("label", { class: "tpl-confirm-lbl", for: "tpl-confirm-name" }, "Type the server name to confirm the wipe:"),
        h("input", { type: "text", id: "tpl-confirm-name", class: "mc-input", placeholder: guildName }));
      function setMode(m) {
        mode = m;
        seedBtn.classList.toggle("active", m === "seed");
        replBtn.classList.toggle("active", m === "replace");
        modeNote.textContent = m === "seed"
          ? "Safe: only creates roles/channels that don't exist yet — nothing is touched or deleted."
          : "⚠ Destructive: deletes the server's existing roles and channels FIRST, then builds the template. There is no undo.";
        confirmWrap.style.display = m === "replace" ? "" : "none";
      }
      setMode("seed");
      const go = h("button", {
        type: "button", class: "btn btn-primary",
        onclick: async () => {
          const body = { mode };
          if (mode === "replace") {
            const typed = confirmWrap.querySelector("input").value;
            if (typed !== guildName) { toast("error", "Server name doesn't match — full replace not started.", 5000); return; }
            body.confirmName = typed;
            if (!confirm(`FULL REPLACE on “${guildName}”: every existing role and channel the bot can delete will be wiped, then “${t.label}” is built. This cannot be undone. Continue?`)) return;
          } else if (!confirm(`Apply “${t.label}” to ${guildName}? Missing roles/channels will be created; existing ones are left untouched.`)) return;
          go.disabled = true; go.textContent = "Applying…";
          try {
            const r = await data.templateApply(state.selectedGuildId, t.id, body);
            toast("success", r.summary || "Template apply started — watch your server build out.", 9000);
            go.textContent = "Apply started ✓";
          } catch (e) {
            go.disabled = false; go.textContent = "Apply this template";
            toast("error", e.data?.message || e.message || "Apply failed", 6500);
          }
        },
      }, "Apply this template");
      applyHost.append(h("div", { class: "tpl-apply" },
        h("div", { class: "ev-tabs tpl-modes" }, seedBtn, replBtn),
        modeNote, confirmWrap,
        h("div", { class: "dash-actions" }, go)));
    }

    clear(host);
    host.append(
      h("div", { class: "w-canvas-head" },
        h("span", { class: "w-canvas-label" }, "Server templates"),
        h("span", { class: "w-canvas-hint" }, "Pick a layout, preview it, apply it — right from here")),
      tabs, device, applyHost);
    drawTabs(); drawPreview(); drawApply();
  }

  /** Mark the form as dirty/clean by comparing live values to baseline. */
  function updateDirty(form, mod) {
    try {
      const live = collectFormValues(form, mod);
      const same = JSON.stringify(live) === form._baseline;
      form.classList.toggle("dirty", !same);
    } catch {}
    // Also refresh the live preview if one is wired
    if (form._previewRefresh) {
      try { form._previewRefresh(); } catch {}
    }
  }

  /* ============================================================
     Quick Setup — wraps the same logic /setup uses in Discord.
     One-click create channels / categories / role-menu panels.
     ============================================================ */

  // Module-specific copy. Keep short, action-oriented.
  const QUICK_SETUP_COPY = {
    welcome: {
      title: "⚡ Quick Setup — Welcome",
      blurb: "Pick a sensible welcome channel automatically (system channel → #welcome → #general → first writable text) and enable welcome messages with the default text. Idempotent — re-runs just update the channel.",
      cta: "Run Welcome Quick Setup",
    },
    tickets: {
      title: "⚡ Quick Setup — Tickets",
      blurb: "Bootstrap the full Support layout: Support category, ticket channels, ticket-logs, staff-pay channel, and staff-earnings forum. Channels are reused if they already exist with similar names.",
      cta: "Run Tickets Quick Setup",
    },
    roleMenus: {
      title: "⚡ Quick Setup — Role Menus",
      blurb: "Auto-create a Ping Roles dropdown using your configured Announcements / Auctions / Events / Giveaways roles, and post it to a channel of your choice. Requires those ping roles to be set (use /setup → Role Menus once if not).",
      cta: "Run Role Menus Quick Setup",
    },
  };

  function renderQuickSetupBanner(mod, content) {
    const copy = QUICK_SETUP_COPY[mod.name] || {
      title: `⚡ Quick Setup — ${mod.label}`,
      blurb: `Run the same Quick Setup ${mod.label} uses in Discord /setup.`,
      cta: `Run Quick Setup`,
    };
    return h("div", { class: "dash-quick-banner" },
      h("div", { class: "dqb-icon" }, "⚡"),
      h("div", { class: "dqb-body" },
        h("div", { class: "dqb-title" }, copy.title),
        h("div", { class: "dqb-blurb" }, copy.blurb)
      ),
      h("button", {
        type: "button",
        class: "btn btn-primary dqb-btn",
        onclick: () => doQuickSetup(mod, content),
      }, copy.cta)
    );
  }

  async function doQuickSetup(mod, content) {
    // Module-specific input gathering
    let body = {};

    if (mod.name === "roleMenus") {
      if (!state.channels) await loadDiscordLists();
      const channelId = await modalChannelPicker(
        "Pick a channel for the Ping Roles menu",
        "The bot will create a dropdown role menu and post it to this channel.",
        state.channels || []
      );
      if (!channelId) return;
      body = { channelId };
    } else {
      const messages = {
        welcome: "Run Welcome Quick Setup? The bot will pick the best welcome channel and enable welcome messages.",
        tickets: "Run Tickets Quick Setup? The bot will create (or reuse) a Support category with ticket channels, log channels, staff-pay, and staff-earnings forum. This may take a few seconds.",
      };
      if (!confirm(messages[mod.name] || `Run Quick Setup for ${mod.label}?`)) return;
    }

    // Run
    const btn = content.querySelector(".dqb-btn");
    const original = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = "Running…"; }
    try {
      const res = await data.quickSetup(state.selectedGuildId, mod.name, body);
      toast("success", res.summary || `${mod.label} Quick Setup complete.`, 6000);

      // Quick Setup (especially Tickets) creates brand-new Discord channels
      // and roles. The cached state.channels / state.roles lists are now
      // stale — if we re-render the form against them, the channel/role
      // <select>s won't contain an <option> for the freshly-created IDs and
      // will show "— none —" even though the backend saved them correctly.
      // Bust the cache so loadModule re-fetches the live Discord lists.
      state.channels = null;
      state.categories = null;
      state.roles = null;

      // Show a skeleton immediately so the reload feels responsive while
      // we re-fetch channels/roles + module values.
      clear(content);
      content.append(renderGenericSkeleton());
      await loadModule(content, mod.name); // reload to pick up new config
      // Pulse the top-bar Saved indicator
      const stat = document.getElementById("dash-save-status");
      if (stat) { stat.classList.add("show"); setTimeout(() => stat.classList.remove("show"), 1800); }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = original; }
      const msg = e.data?.summary || e.data?.message || e.message || "Quick Setup failed";
      toast("error", msg, 6500);
    }
  }

  /** Channel picker modal — returns Promise<string|null>. */
  function modalChannelPicker(title, blurb, channels) {
    return new Promise((resolve) => {
      const overlay = h("div", { class: "dash-modal-overlay" });
      const close = (value) => {
        overlay.classList.remove("show");
        setTimeout(() => overlay.remove(), 200);
        resolve(value);
      };
      const sel = renderChannelSelect("modal-channel-select", "channel", channels, "");
      const modal = h("div", { class: "dash-modal" },
        h("h3", null, title),
        h("p", null, blurb),
        h("div", { class: "dash-field", style: { margin: "12px 0" } }, sel),
        h("div", { class: "dash-modal-actions" },
          h("button", { type: "button", class: "btn btn-ghost", onclick: () => close(null) }, "Cancel"),
          h("button", { type: "button", class: "btn btn-primary", onclick: () => {
            const el = document.getElementById("modal-channel-select");
            const v = el ? el.value : "";
            close(v || null);
          } }, "Confirm")
        )
      );
      overlay.append(modal);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
      document.addEventListener("keydown", function esc(ev) {
        if (ev.key === "Escape") { document.removeEventListener("keydown", esc); close(null); }
      });
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add("show"));
    });
  }

  function renderField(f, value) {
    const id = `field-${f.key}`;
    const label = h("label", { for: id }, f.label || f.key);
    let input;
    switch (f.type) {
      case "text":
        input = h("input", { id, name: f.key, type: "text", value: value ?? "" });
        if (f.max) input.setAttribute("maxlength", f.max);
        break;
      case "textarea":
        input = h("textarea", { id, name: f.key, rows: 4 }, value ?? "");
        if (f.max) input.setAttribute("maxlength", f.max);
        break;
      case "boolean":
        input = h("label", { class: "dash-switch" },
          h("input", { id, name: f.key, type: "checkbox", checked: !!value }),
          h("span", { class: "slider" }),
          h("span", { class: "switch-label" }, value ? "On" : "Off"));
        break;
      case "integer":
        input = h("input", { id, name: f.key, type: "number", value: value ?? 0,
          min: f.min ?? null, max: f.max ?? null, step: 1 });
        break;
      case "hex":
        input = h("input", { id, name: f.key, type: "color", value: value || "#dc2626" });
        break;
      case "url":
      case "image-url":
        input = h("input", { id, name: f.key, type: "url", value: value ?? "", placeholder: "https://…" });
        break;
      case "channel":
        input = renderChannelSelect(id, f.key, state.channels || [], value);
        break;
      case "category":
        input = renderSelect(id, f.key,
          [{ id: "", name: "— none —" }, ...(state.categories || [])], value,
          (c) => c.id ? "▸ " + c.name : c.name);
        break;
      case "role":
        input = renderSelect(id, f.key, [{ id: "", name: "— none —" }, ...(state.roles || [])], value, (r) => `@${r.name}`);
        break;
      case "channels":
      case "roles":
        input = renderMultiPicker(id, f.key, f.type, value);
        break;
      case "choice":
        input = renderSelect(id, f.key, (f.options || []).map((o) => ({ id: o, name: o })), value);
        break;
      case "keywords":
        input = h("input", { id, name: f.key, type: "text", value: (value || []).join(", "), placeholder: "comma-separated" });
        input.dataset.kind = "keywords";
        break;
      default:
        input = h("div", { style: { fontSize: "0.84rem", color: "var(--text-dim)" } }, `(unsupported field type: ${f.type})`);
    }
    return h("div", { class: "dash-field" }, label, input, f.help ? h("div", { class: "hint" }, f.help) : null);
  }

  function channelHash(c) {
    if (c.id === "") return "";
    if (c.type === 15) return "📋"; // forum
    if (c.type === 5) return "📢"; // announcement
    return "#";          // text (categories never appear in channels list)
  }
  function renderSelect(id, name, options, value, labelFn) {
    const sel = h("select", { id, name });
    options.forEach((o) => {
      const opt = h("option", { value: o.id, selected: (o.id === value) || null }, labelFn ? labelFn(o) : o.name);
      sel.appendChild(opt);
    });
    return sel;
  }

  /** Channel picker — groups channels under their parent category as
      <optgroup> for clearer scanning. Channels without a parent go
      into an "Uncategorized" group at the bottom. */
  function renderChannelSelect(id, name, channels, value) {
    const sel = h("select", { id, name });
    sel.appendChild(h("option", { value: "", selected: !value || null }, "— none —"));
    const byParent = new Map();
    const noParent = [];
    for (const c of channels) {
      if (c.parentName) {
        if (!byParent.has(c.parentName)) byParent.set(c.parentName, []);
        byParent.get(c.parentName).push(c);
      } else {
        noParent.push(c);
      }
    }
    const sortedParents = Array.from(byParent.keys()).sort((a, b) => a.localeCompare(b));
    for (const parent of sortedParents) {
      const group = h("optgroup", { label: parent });
      for (const c of byParent.get(parent)) {
        group.appendChild(h("option", { value: c.id, selected: (c.id === value) || null },
          `${channelHash(c)} ${c.name}`));
      }
      sel.appendChild(group);
    }
    if (noParent.length) {
      const group = h("optgroup", { label: "Uncategorized" });
      for (const c of noParent) {
        group.appendChild(h("option", { value: c.id, selected: (c.id === value) || null },
          `${channelHash(c)} ${c.name}`));
      }
      sel.appendChild(group);
    }
    return sel;
  }
  /**
   * Multi-picker (channels / roles) — search box + selected-on-top + scroll.
   *
   * Why the rewrite: with 30+ roles (Hall-of-Fame Quicks setup) the original
   * "flex-wrap chip cloud" was unusable — chips overflowed the 220px box,
   * users had no way to find a specific role, and selected ones were buried
   * inside the cloud. New layout:
   *   - sticky search input that filters in-place
   *   - "Selected (N)" header above the picked chips (so they're always visible)
   *   - "All N roles" header above the rest
   *   - taller scrollable container (max 360px)
   * `collectFormValues` still reads
   *   wrap.querySelectorAll('input[type="checkbox"]:checked')
   * so the data contract is unchanged.
   */
  function renderMultiPicker(id, name, kind, value) {
    const items = kind === "channels" ? (state.channels || []) : (state.roles || []);
    const selectedSet = new Set(Array.isArray(value) ? value : []);

    const wrap = h("div", { class: "dash-multi", id });
    wrap.dataset.kind = kind;
    wrap.dataset.field = name;

    const search = h("input", {
      type: "search",
      class: "dash-multi-search",
      placeholder: kind === "channels" ? "Search channels…" : "Search roles…",
      autocomplete: "off",
      spellcheck: "false",
    });
    const selectedHeader = h("div", { class: "dash-multi-section" }, "Selected (0)");
    const selectedBox = h("div", { class: "dash-multi-chips" });
    const allHeader = h("div", { class: "dash-multi-section" }, "All");
    const allBox = h("div", { class: "dash-multi-chips" });
    const empty = h("div", { class: "dash-multi-empty" }, "No matches.");
    empty.style.display = "none";

    function labelFor(it) {
      return kind === "channels" ? channelHash(it) + " " + it.name : "@" + it.name;
    }

    function makeChip(it) {
      const checked = selectedSet.has(it.id);
      const cb = h("input", { type: "checkbox", name: `${name}[]`, value: it.id, checked: checked || null });
      const chip = h("label", { class: "dash-chip" + (checked ? " selected" : "") }, cb, labelFor(it));
      cb.addEventListener("change", () => {
        if (cb.checked) selectedSet.add(it.id); else selectedSet.delete(it.id);
        chip.classList.toggle("selected", cb.checked);
        layout(); // re-bucket after toggle
      });
      return chip;
    }

    function layout() {
      const q = (search.value || "").trim().toLowerCase();
      const matches = (it) => !q || it.name.toLowerCase().includes(q);
      clear(selectedBox);
      clear(allBox);
      let selCount = 0;
      let allCount = 0;
      items.forEach((it) => {
        if (!matches(it)) return;
        const chip = makeChip(it);
        if (selectedSet.has(it.id)) {
          selectedBox.appendChild(chip);
          selCount++;
        } else {
          allBox.appendChild(chip);
          allCount++;
        }
      });
      selectedHeader.textContent = `Selected (${selCount})`;
      selectedHeader.style.display = selCount ? "" : "none";
      selectedBox.style.display = selCount ? "" : "none";
      allHeader.textContent = q ? `Matches (${allCount})` : `All ${items.length} ${kind === "channels" ? "channels" : "roles"}`;
      empty.style.display = (selCount + allCount === 0) ? "" : "none";
    }

    search.addEventListener("input", layout);

    wrap.append(search, selectedHeader, selectedBox, allHeader, allBox, empty);
    layout();
    return wrap;
  }

  function collectFormValues(form, mod) {
    const out = {};
    for (const f of mod.fields) {
      if (f.type === "boolean") {
        const el = form.querySelector(`#field-${f.key}`);
        out[f.key] = !!(el && el.checked);
        continue;
      }
      if (f.type === "integer") {
        const el = form.querySelector(`#field-${f.key}`);
        const v = el ? parseInt(el.value, 10) : NaN;
        out[f.key] = Number.isFinite(v) ? v : 0;
        continue;
      }
      if (f.type === "channels" || f.type === "roles") {
        const wrap = form.querySelector(`#field-${f.key}`);
        if (!wrap) { out[f.key] = []; continue; }
        const ids = Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
        out[f.key] = ids;
        continue;
      }
      if (f.type === "keywords") {
        const el = form.querySelector(`#field-${f.key}`);
        const raw = el ? el.value : "";
        out[f.key] = raw.split(",").map((s) => s.trim()).filter(Boolean);
        continue;
      }
      const el = form.querySelector(`#field-${f.key}`);
      out[f.key] = el ? el.value : "";
    }
    return out;
  }

  /** Map a server-returned `invalid_<fieldKey>` token back to a human label
   *  from the module schema so the user knows what to fix. */
  function fieldLabelFromErrorToken(mod, token) {
    if (typeof token !== "string" || !token.startsWith("invalid_")) return token;
    const key = token.slice("invalid_".length);
    const f = (mod.fields || []).find((x) => x.key === key);
    return f ? (f.label || key) : key;
  }

  /** Clear any "invalid" highlight added by a prior save attempt. */
  function clearFieldErrors(form) {
    form.querySelectorAll(".dash-field.has-error").forEach((el) => el.classList.remove("has-error"));
  }
  function markFieldError(form, key) {
    const f = form.querySelector(`#field-${key}`);
    if (!f) return;
    const wrap = f.closest(".dash-field");
    if (wrap) wrap.classList.add("has-error");
  }

  async function doSaveModule(form, mod, statusBox, saveBtn, content) {
    clear(statusBox);
    clearFieldErrors(form);
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const payload = collectFormValues(form, mod);
      const res = await data.saveModule(state.selectedGuildId, mod.name, payload);
      saveBtn.textContent = "Save changes";
      saveBtn.disabled = false;
      toast("success", `${mod.label} saved`);
      statusBox.append(notice("success", "Saved", "Settings are live for this server."));
      // Pulse the top-bar "Saved ✓" indicator
      const stat = document.getElementById("dash-save-status");
      if (stat) {
        stat.classList.add("show");
        setTimeout(() => stat.classList.remove("show"), 1800);
      }
      // Re-render the form from the server's merged values so the user
      // visibly sees that the change persisted (and so multi-pickers /
      // checkboxes show the exact state the backend now has). Falls back
      // to refetching if the response doesn't include `values`.
      if (content) {
        if (res && res.values) {
          // Lightweight: just refetch the whole module GET so any
          // server-side normalization (e.g. dedupe, default fill) is
          // reflected in the visible form fields.
          loadModule(content, mod.name);
        } else {
          loadModule(content, mod.name);
        }
      }
    } catch (e) {
      saveBtn.textContent = "Save changes";
      saveBtn.disabled = false;
      if (e.code === 403 && e.data?.error === "premium_required") {
        statusBox.append(notice("warn", "Premium required", e.data?.message || "Activate Premium with /subscribe in Discord."));
        return;
      }
      if (e.code === 400 && Array.isArray(e.data?.errors)) {
        // Highlight each invalid field on the form so user can find it
        const labels = [];
        e.data.errors.forEach((tok) => {
          const key = typeof tok === "string" && tok.startsWith("invalid_") ? tok.slice("invalid_".length) : null;
          if (key) markFieldError(form, key);
          labels.push(fieldLabelFromErrorToken(mod, tok));
        });
        toast("error", `${mod.label}: fix ${labels.length} field${labels.length === 1 ? "" : "s"}`, 4500);
        statusBox.append(notice("error", "Some fields are invalid",
          `Fix and try again: ${labels.join(", ")}`));
        // Scroll first invalid into view so user notices it
        const firstBad = form.querySelector(".dash-field.has-error");
        if (firstBad) firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      toast("error", e.message || "Save failed");
      statusBox.append(notice("error", "Save failed", e.message));
    }
  }

  async function doResetModule(mod, content) {
    if (!confirm(`Reset all ${mod.label} settings to default?`)) return;
    try {
      await data.resetModule(state.selectedGuildId, mod.name);
      toast("success", `${mod.label} reset`);
      loadModule(content, mod.name);
    } catch (e) {
      toast("error", e.message || "Reset failed");
    }
  }

  /* ============================================================
     Tab: Branding (bespoke with live preview)
     ============================================================ */
  function renderBrandingForm(content, mod, values) {
    const v = values || {};
    const card = h("div", { class: "dash-card" }, h("h3", null, "Branding"), h("p", null, mod.description));
    const statusBox = h("div");
    const form = h("form", { class: "dash-form" });

    mod.fields.forEach((f) => form.appendChild(renderField(f, v[f.key])));

    const saveBtn = h("button", { type: "submit", class: "btn btn-primary" }, "Save changes");
    const resetBtn = h("button", { type: "button", class: "btn btn-ghost", onclick: () => doResetModule(mod, content) }, "Reset to default");
    form.appendChild(h("div", { class: "dash-actions" }, saveBtn, resetBtn));

    form.addEventListener("submit", (e) => { e.preventDefault(); doSaveModule(form, mod, statusBox, saveBtn, content); });

    const previewWrap = h("div", { class: "dash-card" }, h("h3", null, "Live preview"), h("div", { id: "brand-preview-host" }));
    function refresh() {
      const color = form.querySelector("#field-embedColor")?.value || "#dc2626";
      const brand = form.querySelector("#field-brandName")?.value || "Arkoris";
      const footer = form.querySelector("#field-footerText")?.value || `${brand} · v1`;
      const host = previewWrap.querySelector("#brand-preview-host");
      clear(host);
      host.append(
        h("div", { class: "preview-embed", style: { "--brand-accent": color, borderLeftColor: color } },
          h("div", { class: "pe-title" }, `${brand} · /pop Cluster Population`),
          h("div", { class: "pe-desc" }, "Total players: 184 / 620 · 11 / 12 maps online · Peak today 231"),
          h("div", { class: "pe-footer" }, footer)
        )
      );
    }
    form.addEventListener("input", refresh);

    card.append(statusBox, form);
    content.append(card, previewWrap);
    refresh();
  }

  /* ============================================================
     Tab: /pop Population (read-only with link to Discord)
     ============================================================ */
  /** Right-rail "Top 5 Clusters" panel — ranks configured clusters by their
   *  cached live population so the /pop tab's empty right side shows useful
   *  at-a-glance data. */
  function renderTopClustersPanel(clusters) {
    const ranked = (clusters || [])
      .map((c) => ({ name: c.name || "Unnamed cluster", total: Number(c.cachedTotal) || 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    const withData = ranked.filter((r) => r.total > 0);
    const grandTotal = withData.reduce((s, r) => s + r.total, 0);
    return h("div", { class: "hub-rail-card" },
      h("div", { class: "hub-rail-label" }, "Top 5 Clusters"),
      withData.length
        ? withData.map((r, i) =>
            h("div", { class: "hub-info-row" },
              h("span", null, `${i + 1}. ${r.name}`),
              h("strong", null, `${r.total.toLocaleString()} online`)))
        : h("div", { class: "hub-info-row" },
            h("span", null, "No live population data yet")),
      withData.length
        ? h("div", { class: "hub-info-row" },
            h("span", null, "Total online"),
            h("strong", null, grandTotal.toLocaleString()))
        : null
    );
  }

  async function renderArkInfo(content) {
    clear(content);
    content.append(
      h("div", { class: "dash-card" },
        h("h3", { style: { margin: "0 0 6px" } }, "🦖 ARK Server Suite"),
        h("p", { style: { margin: 0 } },
          "Your linked Nitrado ARK servers, live. Player intel, anti-cheat, logs, bans, wipes and rollbacks run from the ", h("code", null, "/ark"), " panel in Discord — destructive actions stay behind in-server confirmation + audit on purpose.")
      )
    );

    // ── Live server grid ─────────────────────────────────────────────────
    const liveHost = h("div");
    content.append(liveHost);
    liveHost.append(h("div", { class: "skel-card" },
      h("div", { class: "skel skel-line lg w-30" }),
      h("div", { class: "skel skel-line w-70" })));

    async function drawServers() {
      let r;
      try { r = await data.arkServers(state.selectedGuildId); }
      catch (e) { r = null; }
      clear(liveHost);
      if (!r || (!r.connected && !(r.servers || []).length)) {
        liveHost.append(h("div", { class: "dash-card" },
          h("h3", { style: { margin: "0 0 6px" } }, "No ARK servers linked yet"),
          h("p", { style: { margin: "0 0 12px", color: "var(--text-muted)" } },
            "Connect your Nitrado token and link your maps once — this page then shows their live status."),
          h("ol", { style: { margin: "0 0 4px", paddingLeft: "20px", color: "var(--text-muted)", lineHeight: "1.8" } },
            h("li", null, h("code", null, "/setup → 🦖 ARK Server"), " — paste your Nitrado token"),
            h("li", null, "Pick the maps to link"),
            h("li", null, "Refresh this page"))));
        return;
      }
      const servers = r.servers || [];
      const head = h("div", { class: "ark-live-head" },
        h("h3", { style: { margin: 0 } }, `Linked servers (${servers.length})`),
        h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => { clear(liveHost); liveHost.append(h("div", { class: "skel-card" }, h("div", { class: "skel skel-line w-50" }))); drawServers(); } }, "↻ Refresh"));
      const grid = h("div", { class: "ark-live-grid" });
      for (const s of servers) {
        const st = String(s.status || "").toLowerCase();
        const cls = st === "started" ? "up" : st === "restarting" ? "mid" : st ? "down" : "unknown";
        const players = (s.players != null) ? `${s.players}${s.maxPlayers ? " / " + s.maxPlayers : ""} online` : "player count syncs on the next poll";
        grid.append(h("div", { class: "ark-srv-card " + cls },
          h("div", { class: "ark-srv-top" },
            h("span", { class: "ark-srv-dot", "aria-hidden": "true" }),
            h("span", { class: "ark-srv-name" }, s.name || "Server"),
            h("span", { class: "ark-srv-state" }, st ? st : "status pending")),
          h("div", { class: "ark-srv-meta" },
            h("span", { class: "ark-srv-map" }, s.map || "map unknown"),
            h("span", { class: "ark-srv-players" }, players))));
      }
      liveHost.append(h("div", { class: "dash-card" }, head, grid,
        h("p", { class: "ark-live-note" },
          "Live from the Nitrado API" + (r.lastSync ? ` · last sync ${new Date(String(r.lastSync).includes("T") ? r.lastSync : r.lastSync.replace(" ", "T") + "Z").toLocaleString()}` : "") + ". Refresh re-checks (cached for 3 minutes).")));
    }
    await drawServers();

    // ── What the suite does (run from /ark in Discord) ───────────────────
    const featCard = (title, body) => h("div", { class: "dash-card" },
      h("h3", { style: { margin: "0 0 6px" } }, title),
      h("p", { style: { margin: 0, color: "var(--text-muted)" } }, body));
    const feats = [
      ["🔎 Player Lookup", "Search any player or tribe — sessions, maps, in-game chat, tribemates, names, bans and risk flags."],
      ["🛡️ ARK Guard", "19 cheater-detection signals (ban-evasion, dupes, aimbot cadence, account-sharing…) with auto-alerts on top suspects."],
      ["📜 Live Logs", "Cluster-wide chat, joins/leaves, kills, tribe events and admin commands — timestamped and map-labelled."],
      ["🏆 Leaderboards", "Playtime and K/D rankings across your maps."],
      ["🔨 Bans", "Banlist management across every linked map, with durations + audit."],
      ["🧨 Wipe & ⏪ Rollback", "Confirmed, audited save wipes — and one-tap rollback to a Nitrado backup."],
      ["💬 Game-Chat Relay", "Mirror in-game chat into a Discord channel so everyone can read it."],
      ["🎛️ Server Controls", "Start / stop / restart, join password & cluster ID — per map or in bulk."],
    ];
    const grid = h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px", margin: "14px 0" } });
    for (const [t, d] of feats) grid.append(featCard(t, d));
    content.append(grid);
  }

  async function renderPopulationView(content) {
    try {
      const p = await api(`/api/dashboard/guilds/${state.selectedGuildId}/population`);
      clear(content);

      const intro = h("div", { class: "dash-card" },
        h("h3", null, "/pop Cluster Population"),
        h("p", null, "Free for every server. Cluster CRUD currently lives in Discord — run ", h("code", null, "/setup › Cluster Population"), ". The dashboard previews configured clusters.")
      );

      if (p.notice === "population_config_not_wired" || !p.clusters?.length) {
        content.append(
          intro,
          notice("info", "No clusters configured", "Run /setup in Discord to add your first cluster. The dashboard will list them here."),
          h("div", { class: "dash-actions", style: { marginTop: "12px" } },
            btn("Open in Discord", { kind: "btn-primary", href: cfg.links?.inviteBot, external: true })
          )
        );
        return;
      }

      // Two-column shell: cluster cards on the left, live Top-5 rail on the
      // right (reuses the Setup Hub's hub-shell/hub-rail layout + styling).
      const main = h("div", { class: "hub-main" });
      const rail = h("aside", { class: "hub-rail" });
      main.append(intro);
      (p.clusters || []).forEach((c) => {
        main.append(
          h("div", { class: "dash-card" },
            h("h3", null, c.name || "Unnamed cluster"),
            h("dl", { class: "meta" },
              h("dt", null, "Provider"), h("dd", null, c.provider || "manual"),
              h("dt", null, "Visibility"), h("dd", null, c.public ? "Public" : "Private"),
              h("dt", null, "Maps"), h("dd", null, (c.maps && c.maps.length) || 0),
              h("dt", null, "Last updated"), h("dd", null, c.lastUpdated ? new Date(c.lastUpdated).toLocaleString() : "—"),
              h("dt", null, "Cached total"), h("dd", null, c.cachedTotal != null ? c.cachedTotal : "—")
            )
          )
        );
      });
      rail.append(renderTopClustersPanel(p.clusters));

      content.append(h("div", { class: "hub-shell" }, main, rail));
    } catch (e) { renderTabError(content, e); }
  }

  /* ============================================================
     Tab: Role Menus (info card, deeper UI on roadmap)
     ============================================================ */
  /* ============================================================
     Role Menus — full CRUD: profiles → options → post to Discord
     ============================================================ */

  // Local state for which menu we're editing (null = list view)
  /* ============================================================
     Tab: Custom Commands — per-guild prefix commands (CRUD +
     live Discord preview). Dashboard-only by design: the bot has
     no /setup surface for these.
     ============================================================ */
  let _ccEditing = null; // null = list view, "new" = create, number = edit that id
  let _ccPrefixes = ["!", "$", "?", ".", "-", ">"];
  let _ccLimits = { max: 30, used: 0 };

  function ccOkColor(c) { return /^#[0-9a-f]{6}$/i.test(c || "") ? c : "#dc2626"; }

  // A Discord-canvas preview: the member typing the command, then the bot's
  // reply (plain message or embed). Reuses the Embed Builder canvas classes.
  function ccPreview(v) {
    const guildName = (state.guilds.find((g) => g.id === state.selectedGuildId)?.name) || "your server";
    const username = state.user?.username || "member";
    const sub = (s) => String(s || "")
      .replace(/\{user\}/gi, "@" + username)
      .replace(/\{server\}/gi, guildName)
      .replace(/\{channel\}/gi, "#general");

    const trigger = h("div", { class: "cc-pv-trigger" },
      h("span", { class: "cc-pv-user" }, "@" + username),
      h("span", { class: "cc-pv-cmd" }, (v.prefix || "!") + (v.name || "command")));

    const botRow = h("div", { class: "dc-embed-bot" },
      h("div", { class: "dc-embed-bot-avatar" }),
      h("div", { class: "dc-embed-bot-name" }, "Arkoris"),
      h("span", { class: "dc-embed-bot-tag" }, "APP"));

    let body;
    if (v.responseType === "embed") {
      const e = v.embed || {};
      const hasImg = /^https:\/\//i.test(e.imageUrl || "");
      const hasThumb = /^https:\/\//i.test(e.thumbnailUrl || "");
      const inner = h("div", { class: "eb-embed-inner cc-pv-inner" + (hasThumb ? " has-thumb" : "") },
        hasThumb ? h("img", { class: "cc-pv-thumb", src: e.thumbnailUrl, alt: "", onerror: function () { this.style.display = "none"; } }) : null,
        (e.title || "").trim() ? h("div", { class: "eb-e-title" }, sub(e.title)) : null,
        (e.description || "").trim() ? h("div", { class: "eb-e-desc" }, sub(e.description)) : null,
        hasImg ? h("img", { class: "eb-e-image", src: e.imageUrl, alt: "", onerror: function () { this.style.display = "none"; } }) : null,
        (e.footer || "").trim() ? h("div", { class: "eb-e-footer" }, h("span", null, sub(e.footer))) : null);
      if (!(e.title || "").trim() && !(e.description || "").trim()) {
        inner.append(h("div", { class: "eb-e-desc", style: { color: "#949ba4" } }, "Add a title or description…"));
      }
      body = h("div", { class: "eb-embed", style: { borderLeftColor: ccOkColor(e.color) } }, inner);
    } else {
      body = h("div", { class: "eb-msg-content" }, sub(v.content) || "Your reply text…");
    }
    return h("div", { class: "eb-discord cc-pv" }, trigger, botRow, body);
  }

  async function renderCustomCommandsPage(content, mod) {
    if (_ccEditing != null) return renderCustomCommandEditor(content, mod);
    try {
      clear(content); content.append(renderGenericSkeleton());
      const r = await data.ccList(state.selectedGuildId);
      const commands = r.commands || [];
      if (Array.isArray(r.prefixes) && r.prefixes.length) _ccPrefixes = r.prefixes;
      if (r.limits) _ccLimits = r.limits;
      clear(content);

      content.append(renderModuleHero(mod, statusBadgeFor(commands.length ? "configured" : "missing")));

      const atCap = commands.length >= _ccLimits.max;
      const header = h("div", { class: "dash-card" },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" } },
          h("div", null,
            h("h3", { style: { margin: 0 } }, "Your commands"),
            h("p", { style: { margin: "4px 0 0", color: "var(--text-muted)" } },
              `${commands.length} / ${_ccLimits.max} used · members type the prefix + name in any channel and the bot replies.`)),
          commands.length
            ? h("button", { type: "button", class: "btn btn-primary", disabled: atCap ? true : null, title: atCap ? "Command limit reached" : null,
                onclick: () => { _ccEditing = "new"; renderActiveTab(content); } }, "+ New command")
            : null));
      content.append(header);

      if (!commands.length) {
        const sample = ccPreview({ prefix: "!", name: "wiki", responseType: "text", content: "Everything ARK: https://ark.wiki.gg — items, creatures, breeding, commands." });
        content.append(
          h("div", { class: "dash-card" },
            h("div", { class: "w-canvas-head" },
              h("span", { class: "w-canvas-label" }, "Example custom command"),
              h("span", { class: "w-canvas-hint" }, "What members see in Discord")),
            h("div", { class: "cc-pv-sample" }, sample),
            h("div", { class: "rm-pv-emptymsg" },
              h("h4", null, "No custom commands yet"),
              h("p", null, "Create your own — pick a prefix like ! or $, name it, and reply with plain text or a rich embed. Great for FAQs, links, server info."),
              h("button", { type: "button", class: "btn btn-primary", onclick: () => { _ccEditing = "new"; renderActiveTab(content); } }, "+ Create your first command"))));
        return;
      }

      const grid = h("div", { class: "cc-grid" });
      commands.forEach((c) => {
        const pv = ccPreview(c);
        grid.append(h("div", { class: "dash-card cc-card" + (c.enabled ? "" : " disabled") },
          h("div", { class: "cc-card-head" },
            h("code", { class: "cc-code" }, c.prefix + c.name),
            h("span", { class: "cc-tag " + (c.responseType === "embed" ? "embed" : "text") }, c.responseType === "embed" ? "Embed" : "Text"),
            c.enabled ? null : h("span", { class: "cc-tag off" }, "Disabled"),
            h("span", { class: "cc-uses" }, `${c.uses} use${c.uses === 1 ? "" : "s"}`),
            h("button", { type: "button", class: "btn btn-primary cc-edit", onclick: () => { _ccEditing = c.id; renderActiveTab(content); } }, "Edit →")),
          pv));
      });
      content.append(grid);
    } catch (e) { renderTabError(content, e); }
  }

  async function renderCustomCommandEditor(content, mod) {
    try {
      clear(content); content.append(renderGenericSkeleton());
      const isNew = _ccEditing === "new";
      let v = { prefix: "!", name: "", responseType: "text", content: "", enabled: true,
        embed: { title: "", description: "", color: "#dc2626", imageUrl: "", thumbnailUrl: "", footer: "" } };
      if (!isNew) {
        const r = await data.ccList(state.selectedGuildId);
        const found = (r.commands || []).find((c) => c.id === _ccEditing);
        if (!found) { _ccEditing = null; return renderCustomCommandsPage(content, mod); }
        v = {
          prefix: found.prefix, name: found.name, responseType: found.responseType,
          content: found.content || "", enabled: found.enabled,
          embed: Object.assign({ title: "", description: "", color: "#dc2626", imageUrl: "", thumbnailUrl: "", footer: "" }, found.embed || {}),
        };
      }
      clear(content);

      const back = () => { _ccEditing = null; renderActiveTab(content); };

      // ── Header row ──
      const headTitle = h("h3", { style: { margin: 0 } }, isNew ? "New command" : "Edit command");
      content.append(h("div", { class: "dash-card" },
        h("div", { style: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" } },
          h("button", { type: "button", class: "btn btn-ghost", onclick: back }, "← All commands"),
          h("div", { style: { flex: 1 } }, headTitle),
          isNew ? null : h("button", { type: "button", class: "btn btn-ghost cc-danger", onclick: async () => {
            const ok = await modalForm("Delete this command?",
              h("p", { style: { margin: 0, color: "var(--text-muted)" } }, `Members will no longer be able to use ${v.prefix}${v.name}. This can't be undone.`),
              { okLabel: "Delete" });
            if (!ok) return;
            try {
              await data.ccDelete(state.selectedGuildId, _ccEditing);
              toast("success", `Deleted ${v.prefix}${v.name}.`);
              back();
            } catch (e) { toast("error", e.message || "Couldn't delete"); }
          } }, "Delete"))));

      // ── Live preview (updates as you type) ──
      const pvHost = h("div", { class: "cc-pv-host" });
      function redraw() { clear(pvHost); pvHost.append(ccPreview(v)); }

      // ── Form ──
      const fld = (label, node, hint) => h("div", { class: "dash-field" },
        h("label", null, label), node,
        hint ? h("div", { class: "cc-hint" }, hint) : null);

      // Trigger: prefix chips + name
      const prefixRow = h("div", { class: "cc-prefix-row" });
      function drawPrefixes() {
        clear(prefixRow);
        _ccPrefixes.forEach((p) => prefixRow.append(
          h("button", { type: "button", class: "cc-prefix-chip" + (v.prefix === p ? " active" : ""),
            onclick: () => { v.prefix = p; drawPrefixes(); redraw(); } }, p)));
      }
      drawPrefixes();
      const nameInput = h("input", { type: "text", value: v.name, placeholder: "e.g. wiki, rules, discord", maxlength: 32, spellcheck: "false" });
      nameInput.addEventListener("input", () => { v.name = nameInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, ""); redraw(); });

      // Response type segmented control
      const segText = h("button", { type: "button", class: "cc-seg-btn" }, "Text reply");
      const segEmbed = h("button", { type: "button", class: "cc-seg-btn" }, "Embed reply");
      const seg = h("div", { class: "cc-seg" }, segText, segEmbed);

      // Text fields
      const contentTa = h("textarea", { rows: 5, maxlength: 2000, placeholder: "What the bot replies with. Use {user}, {server} and {channel}." }, v.content);
      contentTa.addEventListener("input", () => { v.content = contentTa.value; redraw(); });
      const textPane = h("div", null, fld("Reply text", contentTa));

      // Embed fields
      const e = v.embed;
      const titleIn = h("input", { type: "text", value: e.title, maxlength: 256, placeholder: "Embed title" });
      titleIn.addEventListener("input", () => { e.title = titleIn.value; redraw(); });
      const descTa = h("textarea", { rows: 5, maxlength: 2048, placeholder: "Embed description. {user}, {server} and {channel} work here too." }, e.description);
      descTa.addEventListener("input", () => { e.description = descTa.value; redraw(); });
      const colorIn = h("input", { type: "color", value: ccOkColor(e.color), class: "cc-color" });
      colorIn.addEventListener("input", () => { e.color = colorIn.value; redraw(); });
      const imgIn = h("input", { type: "url", value: e.imageUrl, placeholder: "https:// … big image under the text (optional)" });
      imgIn.addEventListener("input", () => { e.imageUrl = imgIn.value.trim(); redraw(); });
      const thumbIn = h("input", { type: "url", value: e.thumbnailUrl, placeholder: "https:// … small image top-right (optional)" });
      thumbIn.addEventListener("input", () => { e.thumbnailUrl = thumbIn.value.trim(); redraw(); });
      const footIn = h("input", { type: "text", value: e.footer, maxlength: 256, placeholder: "Footer text (optional)" });
      footIn.addEventListener("input", () => { e.footer = footIn.value; redraw(); });
      const embedPane = h("div", null,
        fld("Title", titleIn),
        fld("Description", descTa),
        fld("Accent color", colorIn),
        fld("Image URL", imgIn),
        fld("Thumbnail URL", thumbIn),
        fld("Footer", footIn));

      const paneHost = h("div", null);
      function drawType() {
        segText.classList.toggle("active", v.responseType !== "embed");
        segEmbed.classList.toggle("active", v.responseType === "embed");
        clear(paneHost);
        paneHost.append(v.responseType === "embed" ? embedPane : textPane);
        redraw();
      }
      segText.addEventListener("click", () => { v.responseType = "text"; drawType(); });
      segEmbed.addEventListener("click", () => { v.responseType = "embed"; drawType(); });

      // Enabled toggle
      const enCb = h("input", { type: "checkbox", checked: v.enabled ? true : null });
      enCb.addEventListener("change", () => { v.enabled = enCb.checked; });
      const enabledRow = h("label", { class: "w-switch", style: { marginTop: "4px" } }, enCb,
        h("span", { class: "w-sw-track" }, h("span", { class: "w-sw-thumb" })),
        h("span", { class: "w-sw-label" }, "Command enabled"));

      // Save
      const saveBtn = h("button", { type: "button", class: "btn btn-primary" }, isNew ? "Create command" : "Save changes");
      saveBtn.addEventListener("click", async () => {
        const body = { prefix: v.prefix, name: v.name, responseType: v.responseType, enabled: v.enabled,
          content: v.content, embed: v.embed };
        saveBtn.disabled = true;
        try {
          if (isNew) {
            const r = await data.ccCreate(state.selectedGuildId, body);
            toast("success", `Created ${r.command.prefix}${r.command.name} — it's live now.`);
          } else {
            const r = await data.ccUpdate(state.selectedGuildId, _ccEditing, body);
            toast("success", `Saved ${r.command.prefix}${r.command.name}.`);
          }
          back();
        } catch (err) {
          toast("error", err.message || "Couldn't save");
          saveBtn.disabled = false;
        }
      });

      const formCard = h("div", { class: "dash-card" },
        fld("Prefix", prefixRow, "The character members type before the name."),
        fld("Command name", nameInput, "Lowercase letters, numbers, - and _ only."),
        fld("Response", seg),
        paneHost,
        enabledRow,
        h("div", { class: "cc-hint", style: { marginTop: "10px" } }, "Placeholders: {user} mentions whoever ran it · {server} = server name · {channel} = current channel."),
        h("div", { class: "dash-actions", style: { marginTop: "16px" } }, saveBtn,
          h("button", { type: "button", class: "btn btn-ghost", onclick: back }, "Cancel")));

      const pvCard = h("div", { class: "dash-card cc-pv-card" },
        h("div", { class: "w-canvas-head" },
          h("span", { class: "w-canvas-label" }, "Live preview"),
          h("span", { class: "w-canvas-hint" }, "Updates as you type")),
        pvHost);

      content.append(h("div", { class: "cc-editor" }, formCard, pvCard));
      drawType();
    } catch (e) { renderTabError(content, e); }
  }

  let _rmEditingId = null;

  async function renderRoleMenusInfo(content) {
    if (!state.channels || !state.roles) await loadDiscordLists();
    if (_rmEditingId) return renderRoleMenuDetail(content, _rmEditingId);
    return renderRoleMenuList(content);
  }

  async function renderRoleMenuList(content) {
    try {
      clear(content); content.append(renderGenericSkeleton());
      const r = await data.rmList(state.selectedGuildId);
      const menus = r.menus || [];
      clear(content);

      // Header card — only show "+ New Menu" CTA here when at least one
      // menu exists. When empty, the empty-state below owns the CTA so we
      // don't have two competing buttons on one screen.
      const header = h("div", { class: "dash-card" },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" } },
          h("div", null,
            h("h3", { style: { margin: 0 } }, "Role Menus"),
            h("p", { style: { margin: "4px 0 0", color: "var(--text-muted)" } },
              "Build role-selection panels — dropdowns or buttons — and post them to any channel. No artificial limits.")
          ),
          menus.length
            ? h("button", { type: "button", class: "btn btn-primary", onclick: () => openCreateMenuModal(content) }, "+ New Menu")
            : null
        )
      );
      content.append(header);

      // Quick Setup banner (still useful for "auto Ping Roles menu")
      data.module(state.selectedGuildId, "roleMenus").then((mod) => {
        if (mod.module?.quickSetupAvailable) {
          const card = h("div", { class: "dash-card" });
          card.append(renderQuickSetupBanner(mod.module, content));
          header.after(card);
        }
      }).catch(() => {});

      // Empty state — show an example Discord preview alongside the create CTA
      if (!menus.length) {
        const sample = { name: "Ping Roles", description: "Pick the pings you want to get", type: "dropdown", options: [
          { roleId: "", label: "Announcements", description: "Server news & updates", emoji: "📢" },
          { roleId: "", label: "Events", description: "Get pinged for events", emoji: "🎉" },
          { roleId: "", label: "Giveaways", description: "Never miss a drop", emoji: "🎁" },
        ] };
        const spv = renderRoleMenuPreview(sample, { name: sample.name, description: sample.description, type: sample.type });
        spv.draw();
        content.append(
          h("div", { class: "dash-card" },
            h("div", { class: "w-canvas-head" },
              h("span", { class: "w-canvas-label" }, "Example role menu"),
              h("span", { class: "w-canvas-hint" }, "What members see in Discord")),
            h("div", { class: "rm-pv-sample" }, spv.device),
            h("div", { class: "rm-pv-emptymsg" },
              h("h4", null, "No role menus yet"),
              h("p", null, "Create one to let members pick roles from a dropdown or button panel — post it to any channel and update it any time."),
              h("button", { type: "button", class: "btn btn-primary", onclick: () => openCreateMenuModal(content) }, "+ Create your first menu")))
        );
        return;
      }

      // Menu cards — each is a live Discord preview
      const grid = h("div", { class: "rm-pv-list" });
      menus.forEach((m) => grid.appendChild(renderMenuCard(m, content)));
      content.append(grid);
    } catch (e) { renderTabError(content, e); }
  }

  // Each saved menu renders as its actual Discord panel preview, with a compact
  // header (name / channel / type / status) and an Edit button into the editor.
  function renderMenuCard(m, content) {
    const ch = (state.channels || []).find((c) => c.id === m.channelId);
    const pv = renderRoleMenuPreview(m, { name: m.name, description: m.description || "", type: m.type });
    pv.draw();
    return h("div", { class: "dash-card rm-pv-card" },
      h("div", { class: "rm-pv-cardhead" },
        h("div", { class: "rm-pv-cardinfo" },
          h("div", { class: "rm-pv-cardname" }, m.name),
          h("div", { class: "rm-pv-cardsub" },
            (ch ? `${ch.type === 15 ? "📋" : "#"} ${ch.name}` : "(no channel)") +
            ` · ${m.options.length} option${m.options.length === 1 ? "" : "s"} · ${m.type === "button" ? "Buttons" : "Dropdown"}`)),
        m.posted ? h("span", { class: "rm-tag posted" }, "Posted") : h("span", { class: "rm-tag draft" }, "Draft"),
        h("button", { type: "button", class: "btn btn-primary rm-pv-edit", onclick: () => { _rmEditingId = m.id; renderActiveTab(content); } }, "Edit →")),
      pv.device);
  }

  async function openCreateMenuModal(content) {
    const form = h("form");
    const nameInput = h("input", { id: "rm-new-name", type: "text", placeholder: "e.g. Ping Roles", maxlength: 64 });
    const descInput = h("input", { id: "rm-new-desc", type: "text", placeholder: "Pick the pings you want to get", maxlength: 256 });
    const typeSelect = h("select", { id: "rm-new-type" },
      h("option", { value: "dropdown", selected: true }, "Dropdown (single panel)"),
      h("option", { value: "button" }, "Buttons (one per role)")
    );
    const channelSelect = renderChannelSelect("rm-new-channel", "channel", state.channels || [], "");

    form.appendChild(h("div", { class: "dash-field" }, h("label", { for: "rm-new-name" }, "Menu name"), nameInput));
    form.appendChild(h("div", { class: "dash-field" }, h("label", { for: "rm-new-desc" }, "Description (optional)"), descInput));
    form.appendChild(h("div", { class: "dash-field" }, h("label", { for: "rm-new-type" }, "Type"), typeSelect));
    form.appendChild(h("div", { class: "dash-field" }, h("label", { for: "rm-new-channel" }, "Post in channel"), channelSelect));

    const result = await modalForm("Create new role menu", form);
    if (!result) return;

    try {
      const r = await data.rmCreate(state.selectedGuildId, {
        name: nameInput.value.trim(),
        description: descInput.value.trim(),
        type: typeSelect.value,
        channelId: channelSelect.value,
      });
      toast("success", `Created "${r.menu.name}".`);
      _rmEditingId = r.menu.id;
      renderActiveTab(content);
    } catch (e) {
      toast("error", e.message || "Couldn't create menu");
    }
  }

  async function renderRoleMenuDetail(content, menuId) {
    try {
      const r = await data.rmGet(state.selectedGuildId, menuId);
      const m = r.menu;
      clear(content);

      // Back + identity + actions row
      content.append(
        h("div", { class: "dash-card" },
          h("div", { style: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" } },
            h("button", { type: "button", class: "btn btn-ghost", onclick: () => { _rmEditingId = null; renderActiveTab(content); } }, "← All menus"),
            h("div", { style: { flex: 1 } },
              h("h3", { style: { margin: 0 } }, m.name),
              h("div", { style: { color: "var(--text-muted)", fontSize: "0.86rem", marginTop: "2px" } },
                m.posted ? h("span", { class: "rm-tag posted" }, "Posted to Discord") : h("span", { class: "rm-tag draft" }, "Draft — not posted yet")
              )
            ),
            h("button", { type: "button", class: "btn btn-primary", onclick: () => doPostMenu(menuId, content) },
              m.posted ? "🔄 Re-post" : "📤 Post to Discord"),
            h("button", { type: "button", class: "btn btn-ghost", onclick: () => doDeleteMenu(menuId, content) },
              "Delete menu")
          )
        )
      );

      // Live Discord preview of the panel (matches how it actually posts)
      const live = { name: m.name, description: m.description || "", type: m.type };
      const pv = renderRoleMenuPreview(m, live);
      content.append(h("div", { class: "dash-card rm-preview-card" },
        h("div", { class: "w-canvas-head" },
          h("span", { class: "w-canvas-label" }, "Live preview"),
          h("span", { class: "w-canvas-hint" }, "Exactly how this panel posts in Discord")),
        pv.device));
      pv.draw();

      // Menu settings form (wired to update the preview as you type)
      content.append(renderMenuSettings(m, content, live, pv.draw));

      // Options editor
      content.append(renderOptionsEditor(m, content));
    } catch (e) { renderTabError(content, e); }
  }

  // Read-only Discord render of a role-menu panel: an embed (title = name,
  // description = description) followed by a dropdown or button row — the same
  // shape roleMenuService posts. `live` holds the (possibly unsaved) name /
  // description / type so the settings form can update the preview live.
  function renderRoleMenuPreview(m, live) {
    const device = h("div", { class: "eb-discord rm-preview" });
    function draw() {
      clear(device);
      const opts = m.options || [];
      const inner = h("div", { class: "eb-embed-inner" },
        h("div", { class: "eb-e-title" }, live.name || "Role Menu"),
        h("div", { class: "eb-e-desc" }, live.description || "Pick the roles you want."));
      device.append(h("div", { class: "eb-embed", style: { borderColor: "#dc2626" } }, inner));
      if (!opts.length) {
        device.append(h("div", { class: "rm-pv-empty" }, "Add role options below — they'll show up here."));
        return;
      }
      if (live.type === "button") {
        // Buttons chunk into rows of 5, Secondary style (matches the bot).
        for (let i = 0; i < opts.length; i += 5) {
          const row = h("div", { class: "eb-comp-preview-row" });
          opts.slice(i, i + 5).forEach((o) => {
            const b = h("div", { class: "eb-d-btn secondary" });
            if (o.emoji) b.append(h("span", { class: "eb-d-btn-emoji" }, o.emoji + " "));
            b.append(h("span", { class: "eb-d-btn-label" }, o.label));
            row.append(b);
          });
          device.append(row);
        }
      } else {
        const wrap = h("div", { class: "eb-d-select-wrap" });
        wrap.append(h("div", { class: "eb-d-select" },
          h("span", { class: "eb-d-select-ph" }, "🎭 Select roles…"),
          h("span", { class: "rm-pv-arrow" }, "▾")));
        const list = h("div", { class: "eb-d-options" });
        opts.forEach((o) => {
          list.append(h("div", { class: "eb-d-option" },
            o.emoji ? h("span", { class: "eb-d-opt-emoji" }, o.emoji) : null,
            h("div", { class: "eb-d-opt-text" },
              h("div", { class: "eb-d-opt-label" }, o.label),
              o.description ? h("div", { class: "eb-d-opt-desc" }, o.description) : null)));
        });
        wrap.append(list);
        device.append(wrap);
      }
    }
    return { device, draw };
  }

  function renderMenuSettings(m, content, live, drawPreview) {
    const nameInput = h("input", { id: "rm-edit-name", type: "text", value: m.name, maxlength: 64 });
    const descInput = h("input", { id: "rm-edit-desc", type: "text", value: m.description || "", maxlength: 256 });
    const typeSelect = h("select", { id: "rm-edit-type" },
      h("option", { value: "dropdown", selected: m.type === "dropdown" || null }, "Dropdown (single panel)"),
      h("option", { value: "button", selected: m.type === "button" || null }, "Buttons (one per role)")
    );
    const channelSelect = renderChannelSelect("rm-edit-channel", "channel", state.channels || [], m.channelId);

    // Live-update the Discord preview as the panel's text / type change.
    if (live && drawPreview) {
      nameInput.addEventListener("input", () => { live.name = nameInput.value; drawPreview(); });
      descInput.addEventListener("input", () => { live.description = descInput.value; drawPreview(); });
      typeSelect.addEventListener("change", () => { live.type = typeSelect.value; drawPreview(); });
    }

    const card = h("div", { class: "dash-card" },
      h("h4", { style: { margin: "0 0 12px" } }, "Menu settings"),
      h("div", { class: "dash-form" },
        h("div", { class: "dash-field" }, h("label", { for: "rm-edit-name" }, "Menu name"), nameInput),
        h("div", { class: "dash-field" }, h("label", { for: "rm-edit-desc" }, "Description"), descInput),
        h("div", { class: "dash-form-row" },
          h("div", { class: "dash-field" }, h("label", { for: "rm-edit-type" }, "Type"), typeSelect),
          h("div", { class: "dash-field" }, h("label", { for: "rm-edit-channel" }, "Post in channel"), channelSelect)
        ),
        h("div", { class: "dash-actions" },
          h("button", { type: "button", class: "btn btn-primary", onclick: () => doSaveMenu(m.id, content) }, "Save settings")
        )
      )
    );
    return card;
  }

  async function doSaveMenu(menuId, content) {
    const body = {
      name: document.getElementById("rm-edit-name").value.trim(),
      description: document.getElementById("rm-edit-desc").value.trim(),
      type: document.getElementById("rm-edit-type").value,
      channelId: document.getElementById("rm-edit-channel").value,
    };
    try {
      await data.rmUpdate(state.selectedGuildId, menuId, body);
      toast("success", "Menu settings saved");
      renderActiveTab(content);
    } catch (e) {
      toast("error", e.message || "Save failed");
    }
  }

  function renderOptionsEditor(m, content) {
    const list = h("div", { class: "rm-options" });
    m.options.forEach((o) => list.appendChild(renderOptionRow(m, o, content)));

    // Add option form
    const addForm = renderAddOptionForm(m, content);

    return h("div", { class: "dash-card" },
      h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" } },
        h("h4", { style: { margin: 0 } }, "Role options"),
        h("span", { style: { color: "var(--text-dim)", fontSize: "0.82rem" } },
          `${m.options.length} / 25 options`)
      ),
      m.options.length ? list : h("div", { class: "rm-empty" }, "No options yet. Add the first role below."),
      addForm
    );
  }

  function renderOptionRow(m, o, content) {
    const role = (state.roles || []).find((r) => r.id === o.roleId);
    const row = h("div", { class: "rm-option-row" },
      h("div", { class: "rm-option-emoji" }, o.emoji || "·"),
      h("div", { class: "rm-option-info" },
        h("div", { class: "rm-option-label" }, o.label),
        h("div", { class: "rm-option-role" },
          role ? `@${role.name}` : `(role missing: ${o.roleId})`,
          o.description ? ` · ${o.description}` : ""
        )
      ),
      h("button", { type: "button", class: "btn btn-ghost rm-option-del", title: "Remove option",
        onclick: () => doDeleteOption(m.id, o.id, content) }, "×")
    );
    return row;
  }

  function renderAddOptionForm(m, content) {
    if (m.options.length >= 25) {
      return h("div", { class: "rm-empty" }, "Maximum of 25 options reached.");
    }
    const roleSel = renderSelect("rm-add-role", "role", [{ id: "", name: "— pick a role —" }, ...(state.roles || [])], "", (r) => r.id ? `@${r.name}` : r.name);
    const labelIn = h("input", { id: "rm-add-label", type: "text", placeholder: "Label shown in menu", maxlength: 80 });
    const descIn = h("input", { id: "rm-add-desc", type: "text", placeholder: "Description (optional)", maxlength: 100 });
    const emojiIn = h("input", { id: "rm-add-emoji", type: "text", placeholder: "🎮", maxlength: 32, style: { textAlign: "center" } });
    const emojiBtn = h("button", {
      type: "button",
      class: "btn btn-ghost emoji-pick-btn",
      title: "Pick an emoji",
      onclick: (e) => openEmojiPicker(emojiIn, e.currentTarget),
    }, "😀");
    const wrap = h("div", { class: "rm-add-form" },
      h("div", { class: "dash-field" }, h("label", { for: "rm-add-role" }, "Role"), roleSel),
      h("div", { class: "dash-field" }, h("label", { for: "rm-add-label" }, "Label"), labelIn),
      h("div", { class: "rm-add-grid" },
        h("div", { class: "dash-field" },
          h("label", { for: "rm-add-emoji" }, "Emoji"),
          h("div", { class: "emoji-input-group" }, emojiIn, emojiBtn)
        ),
        h("div", { class: "dash-field" }, h("label", { for: "rm-add-desc" }, "Description"), descIn)
      ),
      h("button", { type: "button", class: "btn btn-primary",
        onclick: () => doAddOption(m.id, roleSel, labelIn, descIn, emojiIn, content) }, "+ Add option")
    );
    return wrap;
  }

  /* ============================================================
     Emoji picker — categorized unicode emoji popover
     ============================================================
     Used by role-menu option rows. Click the 😀 button next to an
     emoji input to open the picker; click an emoji to insert it
     into the bound input. Escape / click-outside dismisses it.
  */
  const EMOJI_CATEGORIES = [
    {
      name: "ARK & Gaming",
      emojis: ["🦖","🦕","🐉","🐲","🦅","🦁","🐺","🐗","🐍","🕷️","🦂","🦴","💀","☠️","⚔️","🗡️","🛡️","🏹","🪓","⛏️","🔫","💣","🎮","🕹️","🎯","🏆","🏅","🥇","🥈","🥉","🎖️","🏟️"]
    },
    {
      name: "Pings & Hype",
      emojis: ["📢","📣","🔔","🔕","🎉","🎊","🎁","🎀","🪅","🪩","✨","⭐","🌟","💫","🔥","⚡","💥","🚀","💎","🪙","💰","💵","💸","🎈","🎆","🎇"]
    },
    {
      name: "Roles & Staff",
      emojis: ["👑","🛡️","⚔️","🎖️","🏆","🥇","🥈","🥉","🎗️","📛","💼","🧑‍💼","👨‍💻","🧑‍💻","🧙‍♂️","🧙","🧝‍♂️","🦸‍♂️","🦹‍♂️","🥷","🧛","🏴‍☠️"]
    },
    {
      name: "Tickets & Support",
      emojis: ["🎫","🎟️","📩","📨","💬","🗨️","🆘","⛑️","🔧","🛠️","⚙️","📋","📝","✉️","📞","☎️","📡","🗣️","👂","🙋","🙋‍♂️","🙋‍♀️"]
    },
    {
      name: "Status & Reactions",
      emojis: ["✅","❌","⚠️","ℹ️","❓","❗","‼️","⁉️","✔️","❎","✳️","❇️","🟢","🟡","🔴","🟠","🟣","🔵","⚫","⚪","🔘","🚫","⛔","📵"]
    },
    {
      name: "Hearts & Faces",
      emojis: ["❤️","🧡","💛","💚","💙","💜","🤎","🖤","🤍","💖","💗","💓","💞","💕","💔","💯","💢","💨","💦","💤","🫶","🤝","👍","👎","👏","🙏","🤘","✊","✌️","🫡","🤔","😎","😅","😂","🤣","😤","😡","🥳","🤩","😍","😭","🥺"]
    },
    {
      name: "Communication",
      emojis: ["💬","🗨️","🗯️","💭","🔊","🔇","📡","📨","📩","📧","📮","📬","📭","📪","📫","✏️","📌","📍","🔖","🏷️"]
    },
    {
      name: "Misc",
      emojis: ["🌍","🌎","🌏","🌐","🗺️","⏰","⏳","⌛","🔒","🔓","🔑","🗝️","💾","💿","📀","💼","📁","📂","🧰","🧲","🔗","⚗️","🧪","🔬","🔭","📊","📈","📉"]
    },
  ];

  let _emojiPickerEl = null;

  function closeEmojiPicker() {
    if (_emojiPickerEl) {
      _emojiPickerEl.remove();
      _emojiPickerEl = null;
      document.removeEventListener("click", _emojiPickerOutside, true);
      document.removeEventListener("keydown", _emojiPickerEsc, true);
    }
  }
  function _emojiPickerOutside(ev) {
    if (_emojiPickerEl && !_emojiPickerEl.contains(ev.target) && !ev.target.closest(".emoji-pick-btn")) {
      closeEmojiPicker();
    }
  }
  function _emojiPickerEsc(ev) {
    if (ev.key === "Escape") closeEmojiPicker();
  }

  /** Open the emoji picker above the given button, inserting the chosen
   *  emoji into `targetInput.value`. */
  function openEmojiPicker(targetInput, anchorBtn) {
    closeEmojiPicker();
    const popover = h("div", { class: "emoji-popover" });

    const search = h("input", {
      type: "search",
      class: "emoji-search",
      placeholder: "Search emojis…",
      autocomplete: "off",
    });
    const tabs = h("div", { class: "emoji-tabs" });
    const grid = h("div", { class: "emoji-grid" });
    const empty = h("div", { class: "emoji-empty" }, "No matches.");
    empty.style.display = "none";

    function pick(e) {
      targetInput.value = e;
      targetInput.dispatchEvent(new Event("input", { bubbles: true }));
      closeEmojiPicker();
    }

    function renderCategory(cat) {
      clear(grid);
      cat.emojis.forEach((e) => {
        grid.appendChild(h("button", { type: "button", class: "emoji-btn", title: e, onclick: () => pick(e) }, e));
      });
      empty.style.display = "none";
    }

    function renderSearch(q) {
      clear(grid);
      const needle = q.trim().toLowerCase();
      let hits = 0;
      EMOJI_CATEGORIES.forEach((cat) => {
        cat.emojis.forEach((e) => {
          // Crude name match using category name as label hint
          if (cat.name.toLowerCase().includes(needle) || e.includes(needle)) {
            grid.appendChild(h("button", { type: "button", class: "emoji-btn", title: e, onclick: () => pick(e) }, e));
            hits++;
          }
        });
      });
      empty.style.display = hits ? "none" : "";
    }

    EMOJI_CATEGORIES.forEach((cat, i) => {
      const tab = h("button", {
        type: "button",
        class: "emoji-tab" + (i === 0 ? " active" : ""),
        title: cat.name,
        onclick: () => {
          tabs.querySelectorAll(".emoji-tab").forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");
          search.value = "";
          renderCategory(cat);
        },
      }, cat.emojis[0]); // use first emoji as the tab icon
      tabs.appendChild(tab);
    });

    search.addEventListener("input", () => {
      if (search.value.trim()) renderSearch(search.value);
      else renderCategory(EMOJI_CATEGORIES[0]);
    });

    popover.append(search, tabs, grid, empty);
    document.body.appendChild(popover);
    _emojiPickerEl = popover;

    // Position above anchor button (prefer above; fall back to below)
    const rect = anchorBtn.getBoundingClientRect();
    const popH = 320;
    const popW = 320;
    const top = rect.top + window.scrollY - popH - 8;
    const left = Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - popW - 8));
    if (top > window.scrollY + 8) {
      popover.style.top = top + "px";
    } else {
      popover.style.top = (rect.bottom + window.scrollY + 8) + "px";
    }
    popover.style.left = left + "px";

    renderCategory(EMOJI_CATEGORIES[0]);

    // Bind close handlers (deferred so this click doesn't immediately close)
    setTimeout(() => {
      document.addEventListener("click", _emojiPickerOutside, true);
      document.addEventListener("keydown", _emojiPickerEsc, true);
    }, 0);
  }

  async function doAddOption(menuId, roleSel, labelIn, descIn, emojiIn, content) {
    const body = {
      roleId: roleSel.value,
      label: labelIn.value.trim(),
      description: descIn.value.trim(),
      emoji: emojiIn.value.trim() || null,
    };
    if (!body.roleId) return toast("error", "Pick a role first");
    if (!body.label) return toast("error", "Add a label");
    try {
      await data.rmOptAdd(state.selectedGuildId, menuId, body);
      toast("success", "Option added");
      renderActiveTab(content);
    } catch (e) {
      toast("error", e.message || "Couldn't add option");
    }
  }

  async function doDeleteOption(menuId, optionId, content) {
    if (!confirm("Remove this option from the menu?")) return;
    try {
      await data.rmOptDelete(state.selectedGuildId, menuId, optionId);
      toast("success", "Option removed");
      renderActiveTab(content);
    } catch (e) {
      toast("error", e.message);
    }
  }

  async function doPostMenu(menuId, content) {
    try {
      const r = await data.rmPost(state.selectedGuildId, menuId);
      toast("success", r.summary || "Menu posted to Discord", 5000);
      renderActiveTab(content);
    } catch (e) {
      toast("error", e.data?.summary || e.message || "Couldn't post menu", 5500);
    }
  }

  async function doDeleteMenu(menuId, content) {
    if (!confirm("Delete this entire role menu? The Discord message will be deleted too.")) return;
    try {
      await data.rmDelete(state.selectedGuildId, menuId);
      toast("success", "Menu deleted");
      _rmEditingId = null;
      renderActiveTab(content);
    } catch (e) {
      toast("error", e.message);
    }
  }

  /** Generic form modal — confirms or cancels, returns Promise<boolean>.
   *  opts: { okLabel?: string }
   */
  function modalForm(title, formNode, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const overlay = h("div", { class: "dash-modal-overlay" });
      const close = (ok) => {
        overlay.classList.remove("show");
        setTimeout(() => overlay.remove(), 200);
        resolve(ok);
      };
      const modal = h("div", { class: "dash-modal" },
        h("h3", null, title),
        formNode,
        h("div", { class: "dash-modal-actions" },
          h("button", { type: "button", class: "btn btn-ghost", onclick: () => close(false) }, "Cancel"),
          h("button", { type: "button", class: "btn btn-primary", onclick: () => close(true) }, opts.okLabel || "Create")
        )
      );
      overlay.append(modal);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
      document.addEventListener("keydown", function esc(ev) {
        if (ev.key === "Escape") { document.removeEventListener("keydown", esc); close(false); }
      });
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add("show"));
    });
  }

  /* ============================================================
     PayPal API + Webhooks — appears below the Payments form.
     ============================================================
     Secrets (client_id, client_secret, webhook_id) are write-only:
     the backend never sends the actual values back, only:
       { configured: true|false, source: 'guild'|'env'|'unset',
         last4: '...' }
     The UI shows the masked state, lets the user enter a NEW value
     to overwrite, or click Clear to fall back to the env default.
     Includes a Test Connection button that hits PayPal's OAuth
     endpoint with the stored credentials.
  */
  async function renderPayPalConfigSection(content) {
    const host = h("div", { class: "dash-paypal-host" });
    content.append(host);
    host.append(h("div", { class: "skel-card" },
      h("div", { class: "skel skel-line lg w-30" }),
      h("div", { class: "skel skel-line w-90" }),
      h("div", { class: "skel skel-line w-70" })
    ));
    try {
      const r = await data.paypalGet(state.selectedGuildId);
      renderPayPalInto(host, r);
    } catch (e) {
      clear(host);
      if (e.code === 403) return; // tierLocked already shown above
      host.append(notice("warn", "Couldn't load PayPal config", e.message || "Backend error"));
    }
  }

  function renderPayPalInto(host, cfg) {
    clear(host);

    // ── Header card with status pill + brief explanation ───────────
    const statusPill = cfg.isConfigured
      ? h("span", { class: "dash-status-pill ok" }, h("span", { class: "pill-dot" }), "Configured")
      : h("span", { class: "dash-status-pill warn" }, "Not set up");
    const preferredLabel =
      cfg.preferredMode === "orders"   ? "PayPal Orders API (auto-confirm)" :
      cfg.preferredMode === "paypalme" ? "PayPal.me link (manual)" :
      "Not configured";

    host.append(
      h("div", { class: "dash-card" },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" } },
          h("div", null,
            h("h3", { style: { margin: 0 } }, "PayPal API & Webhooks"),
            h("p", { style: { margin: "4px 0 0", color: "var(--dash-muted)" } },
              "Wire up your own PayPal app so /payment can issue checkouts and auto-confirm via webhooks. Currently active flow: ",
              h("strong", null, preferredLabel), ".")
          ),
          statusPill
        )
      )
    );

    // ── Webhook URLs (read-only, copyable) ─────────────────────────
    host.append(
      h("div", { class: "dash-card" },
        h("h3", null, "Webhook & return URLs"),
        h("p", null, "Paste these into your PayPal Developer dashboard when creating the app."),
        copyRow("Webhook URL", cfg.webhookUrl, "Add this as a Webhook in your PayPal app."),
        copyRow("Return URL",  cfg.returnUrl,  "Used after successful payment."),
        copyRow("Cancel URL",  cfg.cancelUrl,  "Used if the buyer cancels.")
      )
    );

    // ── Credentials editor ─────────────────────────────────────────
    const form = h("form", { class: "dash-form", onsubmit: (e) => { e.preventDefault(); doSavePayPal(host, form, saveBtn); } });

    // Mode select
    const modeSel = h("select", { id: "pp-mode" },
      h("option", { value: "live",    selected: (cfg.mode === "live")    || null }, "Live"),
      h("option", { value: "sandbox", selected: (cfg.mode === "sandbox") || null }, "Sandbox")
    );
    // Prefer select
    const preferSel = h("select", { id: "pp-prefer" },
      h("option", { value: "orders",   selected: (cfg.prefer === "orders")   || null }, "Orders API (auto-confirm)"),
      h("option", { value: "paypalme", selected: (cfg.prefer === "paypalme") || null }, "PayPal.me link (manual)")
    );

    const brandIn   = h("input", { id: "pp-brand",  type: "text", value: cfg.brandName || "", placeholder: "Arkoris", maxlength: 128 });
    const handleIn  = h("input", { id: "pp-handle", type: "text", value: cfg.paypalMeHandle || "", placeholder: "yourhandle", maxlength: 64 });

    const cidIn     = h("input", { id: "pp-cid",  type: "password", autocomplete: "off", spellcheck: "false", placeholder: secretPlaceholder(cfg.clientId) });
    const cidShow   = makeShowToggle(cidIn);
    const csIn      = h("input", { id: "pp-cs",   type: "password", autocomplete: "off", spellcheck: "false", placeholder: secretPlaceholder(cfg.clientSecret) });
    const csShow    = makeShowToggle(csIn);
    const whIn      = h("input", { id: "pp-wh",   type: "text",     autocomplete: "off", spellcheck: "false", placeholder: secretPlaceholder(cfg.webhookId) });

    form.append(
      h("div", { class: "dash-form-row" },
        h("div", { class: "dash-field" }, h("label", { for: "pp-mode" }, "Mode"), modeSel,
          h("div", { class: "hint" }, "Use Sandbox while testing. Switch to Live once your PayPal app is approved.")),
        h("div", { class: "dash-field" }, h("label", { for: "pp-prefer" }, "Preferred flow"), preferSel,
          h("div", { class: "hint" }, "Orders API auto-confirms payments. PayPal.me requires staff to mark paid manually."))
      ),
      h("div", { class: "dash-form-row" },
        h("div", { class: "dash-field" }, h("label", { for: "pp-brand" }, "Brand name (on checkout)"), brandIn),
        h("div", { class: "dash-field" }, h("label", { for: "pp-handle" }, "PayPal.me handle"), handleIn,
          h("div", { class: "hint" }, "Without the @. Used when Preferred flow is PayPal.me."))
      ),
      h("div", { class: "dash-field" },
        h("label", { for: "pp-cid" }, "Client ID ", secretLabel(cfg.clientId)),
        h("div", { class: "pp-secret-row" }, cidIn, cidShow),
        h("div", { class: "hint" }, "From your PayPal app. Leave blank to keep current value. Type 'clear' and save to remove.")
      ),
      h("div", { class: "dash-field" },
        h("label", { for: "pp-cs" }, "Client Secret ", secretLabel(cfg.clientSecret)),
        h("div", { class: "pp-secret-row" }, csIn, csShow),
        h("div", { class: "hint" }, "Never displayed back. Stored on the bot server only — never sent to your browser.")
      ),
      h("div", { class: "dash-field" },
        h("label", { for: "pp-wh" }, "Webhook ID ", secretLabel(cfg.webhookId)),
        whIn,
        h("div", { class: "hint" }, "PayPal Developer → your app → Webhooks → the ID after you register the Webhook URL above.")
      )
    );

    const saveBtn = h("button", { type: "submit", class: "btn btn-primary" }, "Save credentials");
    const testBtn = h("button", { type: "button", class: "btn btn-ghost",
      onclick: () => doTestPayPal(host, testBtn) }, "Test connection");
    form.append(
      h("div", { class: "dash-actions" },
        saveBtn,
        testBtn,
        h("span", { style: { fontSize: "0.78rem", color: "var(--dash-muted-2)", marginLeft: "auto" } },
          "Secrets are stored server-side only.")
      )
    );

    host.append(
      h("div", { class: "dash-card" },
        h("h3", null, "Credentials"),
        h("p", null,
          "Get these from ",
          h("a", { href: "https://developer.paypal.com/dashboard/applications/live", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--dash-red-2)" } },
            "developer.paypal.com → My Apps"),
          ". Sandbox vs Live credentials are different — match the Mode you pick above."),
        form
      )
    );

    // Keep a handle so submit handler can reference saveBtn
    form._ppSaveBtn = saveBtn;
  }

  function secretPlaceholder(rec) {
    if (rec && rec.configured) return `••••••••${rec.last4 || ""} (${rec.source}) — type to replace`;
    return "Not set";
  }
  function secretLabel(rec) {
    if (rec && rec.configured) {
      const src = rec.source === "env" ? "from environment" : "set for this server";
      return h("span", { class: "pp-secret-tag" }, "●●●●●●●● " + (rec.last4 || ""), " · " + src);
    }
    return h("span", { class: "pp-secret-tag unset" }, "Not set");
  }
  function copyRow(label, value, hint) {
    if (!value) return null;
    const input = h("input", { type: "text", readonly: true, value, style: { fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: "0.82rem" } });
    const btn = h("button", { type: "button", class: "btn btn-ghost", style: { whiteSpace: "nowrap" },
      onclick: () => {
        navigator.clipboard?.writeText(value).then(() => {
          btn.textContent = "Copied ✓";
          setTimeout(() => { btn.textContent = "Copy"; }, 1500);
        }).catch(() => toast("error", "Couldn't copy"));
      }
    }, "Copy");
    return h("div", { class: "dash-field" },
      h("label", null, label),
      h("div", { class: "pp-copy-row" }, input, btn),
      hint ? h("div", { class: "hint" }, hint) : null
    );
  }
  function makeShowToggle(input) {
    const btn = h("button", { type: "button", class: "btn btn-ghost pp-show-btn", "aria-label": "Show/hide",
      onclick: () => {
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        btn.textContent = isHidden ? "Hide" : "Show";
      }
    }, "Show");
    return btn;
  }

  async function doSavePayPal(host, form, saveBtn) {
    const body = {
      mode:           form.querySelector("#pp-mode").value,
      prefer:         form.querySelector("#pp-prefer").value,
      brandName:      form.querySelector("#pp-brand").value.trim(),
      paypalMeHandle: form.querySelector("#pp-handle").value.trim(),
    };
    // Secret fields — only include in payload if user typed something.
    // Empty input means "keep current". The literal word 'clear' (case-i)
    // clears the value.
    const cidV = form.querySelector("#pp-cid").value;
    const csV  = form.querySelector("#pp-cs").value;
    const whV  = form.querySelector("#pp-wh").value;
    if (cidV.trim() !== "") body.clientId     = (/^clear$/i.test(cidV.trim()) ? "" : cidV.trim());
    if (csV.trim()  !== "") body.clientSecret = (/^clear$/i.test(csV.trim())  ? "" : csV.trim());
    if (whV.trim()  !== "") body.webhookId    = (/^clear$/i.test(whV.trim())  ? "" : whV.trim());

    saveBtn.disabled = true;
    const original = saveBtn.textContent;
    saveBtn.textContent = "Saving…";
    try {
      const r = await data.paypalSave(state.selectedGuildId, body);
      toast("success", "PayPal config saved");
      // Pulse the top-bar Saved indicator
      const stat = document.getElementById("dash-save-status");
      if (stat) { stat.classList.add("show"); setTimeout(() => stat.classList.remove("show"), 1800); }
      renderPayPalInto(host, r);
    } catch (e) {
      toast("error", e.message || "Save failed");
      saveBtn.disabled = false;
      saveBtn.textContent = original;
    }
  }

  async function doTestPayPal(host, btn) {
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Testing…";
    try {
      const r = await data.paypalTest(state.selectedGuildId);
      const msg = `PayPal OK (${r.mode}) · token valid ${Math.round((r.expiresIn || 0) / 60)} min`;
      toast("success", msg, 5000);
    } catch (e) {
      const detail = e.data?.message || e.message || "Test failed";
      toast("error", `PayPal: ${detail}`, 6500);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  /* ============================================================
     Staff Tiers — per-role pay amount editor (Staff Pay module)
     ============================================================
     Lives beneath the standard Staff Pay form. Lists the tiers
     this guild already has, lets you add new ones (pick a role +
     amounts), edit existing ones inline, and delete them. The bot's
     /log command resolves the highest-priority tier the user has and
     uses its amounts for ticket / auction / event earnings.
  */

  const EVENT_TYPES_DEFAULT = ["Raid Base", "Vault Event", "Scav", "Other"];

  // Helper: USD formatting for read-only displays
  function fmtUSD(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "$0.00";
    return "$" + num.toFixed(2);
  }

  async function renderStaffTiersSection(content) {
    // Placeholder so it appears immediately under the form
    const host = h("div", { class: "dash-tiers-host" });
    content.append(host);
    try {
      const r = await data.tierList(state.selectedGuildId);
      renderTiersInto(host, r.tiers || [], r.defaults || {});
    } catch (e) {
      // 403 (no premium) was already handled by tierLocked path above; this
      // is a defensive catch for unexpected errors. Hide silently.
      if (e.code !== 403) {
        host.append(notice("warn", "Couldn't load staff tiers", e.message || "Backend error"));
      }
    }
  }

  function renderTiersInto(host, tiers, defaults) {
    clear(host);
    const card = h("div", { class: "dash-card" },
      h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" } },
        h("div", null,
          h("h3", { style: { margin: 0 } }, "Staff Tiers — pay per role"),
          h("p", { style: { margin: "4px 0 0", color: "var(--text-muted)" } },
            "Set per-role pay amounts for tickets, auctions, and events. The bot uses the highest-priority tier a staff member has.")
        ),
        h("button", { type: "button", class: "btn btn-primary", onclick: () => openCreateTierModal(host) }, "+ New Tier")
      )
    );
    host.append(card);

    if (!tiers.length) {
      host.append(
        h("div", { class: "dash-card", style: { textAlign: "center", padding: "32px 20px" } },
          h("div", { style: { fontSize: "2rem", marginBottom: "8px" } }, "💷"),
          h("h4", { style: { margin: "0 0 4px", fontSize: "1.02rem" } }, "No staff tiers yet"),
          h("p", { style: { color: "var(--text-muted)", margin: "0 0 14px", maxWidth: "440px", marginLeft: "auto", marginRight: "auto" } },
            "Without tiers the bot uses default amounts: $", defaults.ticket?.basic?.amount?.toFixed(2) || "0.20", " basic, $",
            defaults.ticket?.medium?.amount?.toFixed(2) || "0.30", " medium, $",
            defaults.ticket?.advanced?.amount?.toFixed(2) || "0.40", " advanced.")
        )
      );
      return;
    }

    const list = h("div", { class: "dash-tiers-list" });
    tiers.forEach((t) => list.appendChild(renderTierCard(t, host)));
    host.append(list);
  }

  function renderTierCard(t, host) {
    const role = (state.roles || []).find((r) => r.id === t.role_id);
    const roleColor = role && role.color ? "#" + role.color.toString(16).padStart(6, "0") : "var(--red)";
    return h("div", { class: "dash-tier-card" },
      h("div", { class: "tier-head" },
        h("span", { class: "tier-dot", style: { background: roleColor } }),
        h("div", { class: "tier-head-info" },
          h("div", { class: "tier-name" }, t.tier_name || "Tier"),
          h("div", { class: "tier-role" }, role ? "@" + role.name : `(role missing: ${t.role_id})`, " · priority ", String(t.priority || 0))
        ),
        h("div", { class: "tier-head-actions" },
          h("button", { type: "button", class: "btn btn-ghost", onclick: () => openEditTierModal(t, host) }, "Edit"),
          h("button", { type: "button", class: "btn btn-ghost tier-del", title: "Delete tier", onclick: () => deleteTier(t, host) }, "×")
        )
      ),
      h("div", { class: "tier-grid" },
        renderTierStat("Ticket — basic",    fmtUSD(t.ticket_basic)),
        renderTierStat("Ticket — medium",   fmtUSD(t.ticket_medium)),
        renderTierStat("Ticket — advanced", fmtUSD(t.ticket_advanced)),
        renderTierStat("Auction %",         (t.auction_percentage ?? 20) + "%"),
      ),
      Object.keys(t.event_payouts || {}).length
        ? h("div", { class: "tier-events" },
            h("div", { class: "tier-events-h" }, "Event payouts"),
            h("div", { class: "tier-events-grid" },
              ...Object.entries(t.event_payouts).map(([k, v]) =>
                h("div", { class: "tier-event-chip" },
                  h("span", { class: "tier-event-k" }, k),
                  h("span", { class: "tier-event-v" }, fmtUSD(v))
                )
              )
            )
          )
        : null,
      h("div", { class: "tier-perms" },
        t.can_payment          ? h("span", { class: "perm-chip ok" }, "Can /payment") : h("span", { class: "perm-chip off" }, "No /payment"),
        t.can_log              ? h("span", { class: "perm-chip ok" }, "Can /log")     : h("span", { class: "perm-chip off" }, "No /log"),
        t.can_approve_payout   ? h("span", { class: "perm-chip ok" }, "Approve payout") : null,
        t.can_configure_tickets? h("span", { class: "perm-chip ok" }, "Configure tickets") : null,
      )
    );
  }

  function renderTierStat(label, value) {
    return h("div", { class: "tier-stat" },
      h("div", { class: "tier-stat-l" }, label),
      h("div", { class: "tier-stat-v" }, value)
    );
  }

  function openCreateTierModal(host) {
    openTierModal({ host, mode: "create", tier: null });
  }
  function openEditTierModal(t, host) {
    openTierModal({ host, mode: "edit", tier: t });
  }

  /** Tier editor modal — works for both create and edit. */
  async function openTierModal({ host, mode, tier }) {
    if (!state.roles) await loadDiscordLists();
    const isEdit = mode === "edit";

    const roleSel = renderSelect("tier-role", "role", [{ id: "", name: "— pick a role —" }, ...(state.roles || [])], tier?.role_id || "", (r) => r.id ? `@${r.name}` : r.name);
    if (isEdit) roleSel.disabled = true; // role is the identity, don't let edit change it
    const nameIn = h("input", { id: "tier-name", type: "text", value: tier?.tier_name || "", placeholder: "e.g. Admin, Mod, Trial Staff", maxlength: 64 });
    const prioIn = h("input", { id: "tier-prio", type: "number", value: tier?.priority ?? 100, min: 0, max: 999 });

    const basicIn    = h("input", { id: "tier-basic",    type: "number", step: "0.01", min: "0", value: tier?.ticket_basic    ?? 0.20 });
    const mediumIn   = h("input", { id: "tier-medium",   type: "number", step: "0.01", min: "0", value: tier?.ticket_medium   ?? 0.30 });
    const advancedIn = h("input", { id: "tier-advanced", type: "number", step: "0.01", min: "0", value: tier?.ticket_advanced ?? 0.40 });
    const auctionIn  = h("input", { id: "tier-auction",  type: "number", step: "1",    min: "0", max: "100", value: tier?.auction_percentage ?? 20 });

    // Event payouts: render an input per known event type, prefilled if tier
    // already has an override for it.
    const eventTypes = Array.from(new Set([
      ...EVENT_TYPES_DEFAULT,
      ...Object.keys(tier?.event_payouts || {}),
    ]));
    const eventInputs = {};
    const eventFields = h("div", { class: "tier-events-edit" },
      ...eventTypes.map((ev) => {
        const v = tier?.event_payouts?.[ev];
        const input = h("input", { type: "number", step: "0.01", min: "0", value: (v ?? "").toString(), placeholder: "0.00" });
        eventInputs[ev] = input;
        return h("label", { class: "dash-field tier-event-field" },
          h("span", null, ev),
          h("div", { class: "tier-event-input" }, h("span", null, "$"), input)
        );
      })
    );

    const canPayment   = h("input", { type: "checkbox", checked: tier?.can_payment ? true : null });
    const canLog       = h("input", { type: "checkbox", checked: tier?.can_log !== false ? true : null });
    const canApprove   = h("input", { type: "checkbox", checked: tier?.can_approve_payout ? true : null });
    const canCfgTicket = h("input", { type: "checkbox", checked: tier?.can_configure_tickets ? true : null });

    function permRow(label, cb) {
      return h("label", { class: "tier-perm-row" }, cb, h("span", null, label));
    }

    const form = h("form", null,
      h("div", { class: "dash-field" }, h("label", { for: "tier-role" }, "Role"), roleSel),
      h("div", { class: "dash-form-row" },
        h("div", { class: "dash-field" }, h("label", { for: "tier-name" }, "Tier name"), nameIn),
        h("div", { class: "dash-field" }, h("label", { for: "tier-prio" }, "Priority (higher = wins)"), prioIn)
      ),
      h("h4", { style: { margin: "16px 0 6px", fontSize: "0.9rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" } }, "Ticket pay (USD per ticket)"),
      h("div", { class: "dash-form-row" },
        h("div", { class: "dash-field" }, h("label", { for: "tier-basic" }, "Basic"),    h("div", { class: "tier-event-input" }, h("span", null, "$"), basicIn)),
        h("div", { class: "dash-field" }, h("label", { for: "tier-medium" }, "Medium"),  h("div", { class: "tier-event-input" }, h("span", null, "$"), mediumIn))
      ),
      h("div", { class: "dash-form-row" },
        h("div", { class: "dash-field" }, h("label", { for: "tier-advanced" }, "Advanced"), h("div", { class: "tier-event-input" }, h("span", null, "$"), advancedIn)),
        h("div", { class: "dash-field" }, h("label", { for: "tier-auction" }, "Auction %"), auctionIn)
      ),
      h("h4", { style: { margin: "16px 0 6px", fontSize: "0.9rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" } }, "Event payouts (USD, leave blank for default)"),
      eventFields,
      h("h4", { style: { margin: "16px 0 6px", fontSize: "0.9rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" } }, "Permissions"),
      h("div", { class: "tier-perms-edit" },
        permRow("Can use /payment",        canPayment),
        permRow("Can use /log",            canLog),
        permRow("Can approve payouts",     canApprove),
        permRow("Can configure tickets",   canCfgTicket)
      )
    );

    const ok = await modalForm(isEdit ? `Edit tier — ${tier.tier_name || "Tier"}` : "New staff tier", form, {
      okLabel: isEdit ? "Save tier" : "Create tier",
    });
    if (!ok) return;

    const body = {
      role_id:    roleSel.value,
      tier_name:  nameIn.value.trim() || "Staff",
      priority:   parseInt(prioIn.value, 10) || 0,
      ticket_basic:    Number(basicIn.value)    || 0,
      ticket_medium:   Number(mediumIn.value)   || 0,
      ticket_advanced: Number(advancedIn.value) || 0,
      auction_percentage: Number(auctionIn.value) || 0,
      event_payouts: Object.fromEntries(
        Object.entries(eventInputs)
          .map(([k, el]) => [k, el.value.trim() === "" ? null : Number(el.value)])
          .filter(([, v]) => Number.isFinite(v) && v > 0)
      ),
      can_payment:          canPayment.checked,
      can_log:              canLog.checked,
      can_approve_payout:   canApprove.checked,
      can_configure_tickets: canCfgTicket.checked,
    };

    if (!body.role_id) return toast("error", "Pick a role first");

    try {
      if (isEdit) {
        await data.tierUpdate(state.selectedGuildId, tier.id, body);
        toast("success", `Updated ${body.tier_name}`);
      } else {
        await data.tierCreate(state.selectedGuildId, body);
        toast("success", `Created ${body.tier_name}`);
      }
      // Refresh the tiers section
      const newR = await data.tierList(state.selectedGuildId);
      renderTiersInto(host, newR.tiers || [], newR.defaults || {});
    } catch (e) {
      toast("error", e.message || (isEdit ? "Update failed" : "Create failed"));
    }
  }

  async function deleteTier(t, host) {
    if (!confirm(`Delete tier "${t.tier_name}"? Staff with this role will fall back to default amounts.`)) return;
    try {
      await data.tierDelete(state.selectedGuildId, t.id);
      toast("success", "Tier deleted");
      const newR = await data.tierList(state.selectedGuildId);
      renderTiersInto(host, newR.tiers || [], newR.defaults || {});
    } catch (e) {
      toast("error", e.message);
    }
  }

  /* ============================================================
     Tab: Premium (subscribe flow info)
     ============================================================ */
  function renderPremium(content) {
    clear(content);
    const gid = state.selectedGuildId;
    const g = state.guilds.find((x) => x.id === gid) || {};
    const plan = g.plan || "free";
    const premium = plan === "premium" || plan === "monthly" || plan === "annual" || plan === "lifetime";
    const planLabel = plan === "lifetime" ? "Lifetime" : premium ? "Premium" : "Free";
    const monthlyPrice = (cfg.pricing && cfg.pricing.monthly && cfg.pricing.monthly.price) || "$15";
    const annualPrice  = (cfg.pricing && cfg.pricing.annual  && cfg.pricing.annual.price)  || "$150";

    content.append(
      h("div", { class: "dash-card" },
        h("h3", null, "Current Plan"),
        h("dl", { class: "meta" },
          h("dt", null, "Plan"), h("dd", null, planLabel),
          h("dt", null, "Status"), h("dd", null, g.status || "—"),
          h("dt", null, "Expires"), h("dd", null, g.expiresAt ? new Date(g.expiresAt).toLocaleString() : "—")
        )
      )
    );

    // On-site checkout: create a PayPal order for THIS server (monthly OR annual)
    // and redirect to it. The price for each plan is fixed server-side — the
    // client only sends the plan key.
    const statusBox = h("div");
    const monthlyBtn = h("button", { class: "btn btn-primary", type: "button" },
      (premium ? "Renew Monthly" : "Subscribe Monthly") + " · " + monthlyPrice + "/mo");
    const annualBtn = h("button", { class: "btn btn-ghost", type: "button" },
      "Pay Annually · " + annualPrice + "/yr (save 2 months)");
    const payBtns = [monthlyBtn, annualBtn];

    function startCheckout(planKey) {
      return async () => {
        payBtns.forEach((b) => { b.disabled = true; });
        clear(statusBox).append(notice("info", "Starting checkout…", "Taking you to PayPal — please don't close this tab."));
        try {
          const res = await data.subscribe(gid, planKey);
          if (res && res.approvalUrl) { window.location.href = res.approvalUrl; return; }
          clear(statusBox).append(notice("error", "Couldn't start checkout", "PayPal didn't return a checkout link. Please try again."));
          payBtns.forEach((b) => { b.disabled = false; });
        } catch (e) {
          const msg = (e && e.data && e.data.message) || (e && e.message) || "Please try again.";
          if (e && e.data && e.data.error === "bot_not_in_guild") {
            clear(statusBox).append(
              notice("warn", "Add Arkoris first", msg),
              h("div", { class: "dash-actions" }, btn("Invite Bot", { kind: "btn-primary", href: cfg.links?.inviteBot, external: true })));
          } else {
            clear(statusBox).append(notice("error", "Couldn't start checkout", msg));
          }
          payBtns.forEach((b) => { b.disabled = false; });
        }
      };
    }
    monthlyBtn.addEventListener("click", startCheckout("monthly"));
    annualBtn.addEventListener("click", startCheckout("annual"));

    content.append(
      h("div", { class: "dash-card" },
        h("h3", null, premium ? "Renew or extend Premium" : "Upgrade to Premium"),
        h("p", { style: { color: "var(--text-muted)", marginTop: "4px" } },
          "Pay securely with PayPal — your server activates automatically the moment payment confirms (usually a few seconds). Premium is " + monthlyPrice + "/month, or " + annualPrice + "/year (save 2 months)."),
        h("div", { class: "dash-actions" }, monthlyBtn, annualBtn),
        statusBox,
        h("p", { style: { color: "var(--text-muted)", fontSize: "12px", marginTop: "10px" } },
          "Prefer Discord? You can also run ", h("code", null, "/subscribe"), " in your server."),
        h("div", { class: "dash-actions" },
          btn("Invite Bot", { kind: "btn-ghost", href: cfg.links?.inviteBot, external: true }),
          btn("Join Support", { kind: "btn-ghost", href: cfg.links?.supportDiscord, external: true })
        )
      )
    );
  }

  /* ============================================================
     Tab: Audit log
     ============================================================ */
  // Discord & Game Logs — LIVE recorded activity for this guild: per-stream
  // counts + last event + a recent mixed feed from the bot's real ingestion
  // tables. Falls back to an honest "nothing recorded yet" state.
  function loadGameLogs(content) {
    clear(content);
    content.append(h("div", { class: "dash-card" },
      h("h3", null, "Discord & Game Logs"),
      h("p", { style: { margin: 0, color: "var(--text-muted)" } },
        "What the bot has actually recorded for this server. Full logs live in your Discord forums — organised per map, readable by staff, searchable forever.")));

    const liveHost = h("div");
    content.append(liveHost);
    liveHost.append(h("div", { class: "skel-card" },
      h("div", { class: "skel skel-line lg w-30" }),
      h("div", { class: "skel skel-line w-70" }),
      h("div", { class: "skel skel-line w-50" })));

    const fmtAgo = (iso) => {
      if (!iso) return "never";
      const d = new Date(String(iso).includes("T") ? iso : iso.replace(" ", "T") + "Z");
      if (isNaN(d)) return iso;
      const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
      if (s < 60) return s + "s ago";
      if (s < 3600) return Math.floor(s / 60) + "m ago";
      if (s < 86400) return Math.floor(s / 3600) + "h ago";
      return Math.floor(s / 86400) + "d ago";
    };

    data.logsRecent(state.selectedGuildId).then((r) => {
      clear(liveHost);
      const streams = r.streams || [];
      const anyData = streams.some((s) => s.total > 0);

      // Per-stream live tiles.
      const grid = h("div", { class: "ark-live-grid" });
      const TYPE_ICON = { chat: "💬", kills: "⚔️", joins: "📥", tribe: "🏷️", admin: "🛠️", bans: "🔨" };
      streams.forEach((s) => {
        grid.append(h("div", { class: "ark-srv-card " + (s.week > 0 ? "up" : s.total > 0 ? "mid" : "unknown") },
          h("div", { class: "ark-srv-top" },
            h("span", { class: "ark-srv-dot", "aria-hidden": "true" }),
            h("span", { class: "ark-srv-name" }, `${TYPE_ICON[s.key] || ""} ${s.label}`)),
          h("div", { class: "ark-srv-meta" },
            h("span", { class: "ark-srv-map" }, `${(s.total || 0).toLocaleString()} recorded · ${(s.week || 0).toLocaleString()} this week`),
            h("span", { class: "ark-srv-players" }, "last: " + fmtAgo(s.lastAt)))));
      });
      liveHost.append(h("div", { class: "dash-card" },
        h("h3", { style: { margin: "0 0 10px" } }, "Live streams"),
        grid,
        h("p", { class: "ark-live-note" }, anyData
          ? "Counts come from the bot's real log ingestion for this server."
          : "Nothing recorded yet — link your Nitrado servers and the streams fill up automatically.")));

      // Recent mixed feed (only when there is real data).
      const recent = r.recent || [];
      if (recent.length) {
        const list = h("div", { class: "dash-audit-list" });
        recent.forEach((e) => {
          list.append(h("div", { class: "dash-audit-row" },
            h("span", { class: "dash-audit-action ok" }, (TYPE_ICON[e.type] || "") + " " + (e.type || "event")),
            h("span", { class: "dash-audit-target" }, e.text || ""),
            h("span", { class: "dash-audit-time" }, (e.map ? e.map + " · " : "") + fmtAgo(e.at))));
        });
        liveHost.append(h("div", { class: "dash-card" },
          h("h3", { style: { margin: "0 0 10px" } }, "Latest events"),
          list));
      }
    }).catch(() => {
      clear(liveHost);
      liveHost.append(h("div", { class: "dash-card" },
        h("h3", { style: { margin: "0 0 6px" } }, "Live data unavailable"),
        h("p", { style: { margin: 0, color: "var(--text-muted)" } }, "Couldn't load this server's recorded activity right now — try again in a minute.")));
    });

    content.append(h("div", { class: "dash-card" },
      h("h3", { style: { margin: "0 0 6px" } }, "Turn it on"),
      h("p", { style: { margin: 0, color: "var(--text-muted)" } },
        "One click creates the whole forum system: ", h("code", null, "/setup → 📋 Logs & Monitoring → Generate Logs"),
        " — then pick which ARK streams you want under ", h("code", null, "Forum Log Categories"), ".")));
  }

  /* ============================================================
     Tab: Support
     ============================================================ */
  function renderSupportTab(content) {
    clear(content);
    content.append(
      h("div", { class: "dash-card" },
        h("h3", null, "Support"),
        h("p", null, "Common commands:"),
        h("ul", { style: { color: "var(--text-muted)", paddingLeft: "20px", margin: "0 0 16px" } },
          h("li", null, h("code", null, "/setup"), " — Setup Hub"),
          h("li", null, h("code", null, "/subscribe"), " — start or renew premium"),
          h("li", null, h("code", null, "/pop"), " — show cluster population"),
          h("li", null, h("code", null, "/rank"), " — your XP"),
          h("li", null, h("code", null, "/leaderboard"), " — server leaderboard")
        ),
        h("div", { class: "dash-actions" },
          btn("Join Support Discord", { kind: "btn-primary", href: cfg.links?.supportDiscord, external: true }),
          btn("Email Support", { kind: "btn-ghost", href: `mailto:${cfg.links?.contactEmail || ""}?subject=${encodeURIComponent("Arkoris Support")}` })
        )
      )
    );
  }

  /* ============================================================
     Error rendering
     ============================================================ */
  function renderTabError(content, err) {
    clear(content);
    if (err.code === 401) {
      state.user = null;
      return render();
    }
    if (err.code === 403) {
      const msg = err.data?.message || "You don't have permission for this. Manage Server or Administrator required.";
      return content.append(notice("error", "Access denied", msg));
    }
    if (err.code === "no_backend") {
      state.user = null;
      return renderNoBackend();
    }
    if (err.code === "timeout") {
      return content.append(notice("error", "Backend timed out", "The backend didn't respond in 8 seconds."));
    }
    if (err.code === "network") {
      return content.append(notice("error", "Backend unreachable", "CORS or network failure."));
    }
    if (err.code === 404) {
      return content.append(notice("error", "Route not found", "This route isn't deployed on the backend yet."));
    }
    content.append(notice("error", "Couldn't load", err.message || "Unknown error"));
  }

  /* ============================================================
     Boot
     ============================================================ */
  // OAuth handoff — after Discord login the callback sends us back with a
  // one-time id in the URL fragment. Trade it for a real session (same-origin
  // via the Pages proxy, so the cookie is first-party). Runs before boot().
  async function consumeAuthHandoff() {
    const m = (location.hash || "").match(/[#&]auth=([^&]+)/);
    if (!m) return;
    // Strip the id from the URL immediately so it can't be re-used or shared.
    history.replaceState(null, "", location.pathname + location.search);
    try {
      await fetch(API_BASE + "/auth/session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth: decodeURIComponent(m[1]) }),
      });
    } catch (e) {
      console.error("[dashboard] auth handoff failed:", e);
    }
  }

  // Preview-only mock mode: append ?mock=1 to the URL to render the picker with
  // sample servers and skip the backend. Lets us iterate on dashboard UI states
  // locally (npm run dev) without a live session. Harmless in production: the
  // page is password-gated, and this only shows fake data when explicitly asked.
  function maybeRenderMock() {
    const m = location.search.match(/[?&]mock=([a-z0-9]+)/i);
    if (!m) return false;
    const mode = m[1].toLowerCase(); // "1" = picker, "overview" = in-server overview
    state.user = { id: "0", username: "previewuser", globalName: "Preview User", avatar: null };
    state.guilds = [
      { id: "100000000000000001", name: "Velated PVP",          icon: null, owner: true,  plan: "premium" },
      { id: "100000000000000002", name: "Ark Legends Cluster",  icon: null, owner: false, plan: "free" },
      { id: "100000000000000003", name: "The Island Survivors", icon: null, owner: true,  plan: "lifetime" },
      { id: "100000000000000004", name: "Ragnarok Raiders",     icon: null, owner: false, plan: "free" },
      { id: "100000000000000005", name: "Genesis Tribe",        icon: null, owner: true,  plan: "monthly" },
    ];

    // Stub the data layer so in-server views render without a backend.
    const MOCK_MODULES = [
      { name: "welcome", label: "Welcome", tier: "free" }, { name: "autoRoles", label: "Auto Roles", tier: "free" },
      { name: "roleMenus", label: "Role Menus", tier: "free" }, { name: "xp", label: "XP / Leaderboards", tier: "free" },
      { name: "moderation", label: "Moderation", tier: "free" },
      { name: "hype", label: "Hype", tier: "premium" }, { name: "events", label: "Events", tier: "premium" },
      { name: "tickets", label: "Tickets", tier: "premium" },
      { name: "staffPay", label: "Staff Pay", tier: "premium" }, { name: "ark", label: "ARK Management", tier: "premium" },
      { name: "logs", label: "Discord & Game Logs", tier: "free" }, { name: "payments", label: "Payments", tier: "premium" },
      { name: "branding", label: "Branding", tier: "premium" }, { name: "serverTemplates", label: "Server Templates", tier: "premium" },
    ];
    state.modules = MOCK_MODULES;
    data.modules = async () => ({ modules: MOCK_MODULES });
    // Mutable so ?mock= "Mark as done" visibly updates the Setup Hub. Includes
    // credits/hype so those flagged cards are testable as to-do + markable.
    const mockBaseFlags = { welcome: true, autoRoles: true, roleMenus: false, tickets: true, staffPay: false, branding: true, ark: true, payments: false, events: true, xp: true, moderation: false, hype: false };
    const mockOverrides = {};
    const mockStatus = () => {
      const flags = Object.assign({}, mockBaseFlags);
      for (const k of Object.keys(mockOverrides)) flags[k] = true;
      const total = Object.keys(flags).length;
      const completed = Object.values(flags).filter(Boolean).length;
      return { percent: Math.round((completed / total) * 100), total, flags, overrides: Object.assign({}, mockOverrides) };
    };
    data.setupOverride = async (gid, moduleKey, done) => {
      if (done) mockOverrides[moduleKey] = true; else delete mockOverrides[moduleKey];
      return mockStatus(); // mirror the real route, which returns the fresh status
    };
    data.overview = async () => ({
      guild: { memberCount: 1247 },
      premiumActive: true, plan: "premium", botInstalled: true,
      setup: mockStatus(),
    });
    // 90 days of deterministic synthetic data so the date pickers + presets have
    // a real window to slice (no Math.random — stable across reloads).
    const mkDays = (n) => {
      const out = []; const base = new Date("2026-06-09T00:00:00Z");
      for (let i = n - 1; i >= 0; i--) out.push(new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10));
      return out;
    };
    const MOCK_DAYS = mkDays(90);
    const synth = (b, amp, period, seed) => MOCK_DAYS.map((day, i) => ({ day, value: Math.max(0, Math.round(b + amp * Math.sin(i / period) + ((i * 37 + seed) % 13) - 6)) }));
    const memberSeries = MOCK_DAYS.map((day, i) => ({ day, value: 1000 + Math.round(i * 2.75 + 9 * Math.sin(i / 5)) }));
    data.analytics = async () => ({
      days: 90, members: memberSeries[memberSeries.length - 1].value, memberSeries,
      cards: {
        messages: { total: 18432, week: 4210, prevWeek: 3870 }, commands: { total: 2304, week: 540, prevWeek: 610 },
        pop_uses: { total: 892, week: 210, prevWeek: 180 }, voice_joins: { total: 430, week: 96, prevWeek: 88 },
        welcomes: { total: 312, week: 74, prevWeek: 65 },
      },
      series: {
        messages: synth(560, 120, 6, 3), commands: synth(78, 22, 5, 7),
        voice_joins: synth(14, 5, 7, 1), welcomes: synth(10, 4, 8, 5),
        pop_uses: synth(30, 12, 6, 9),
      },
    });
    // New-feature stubs: ARK live grid, staff tiers, PayPal config, templates.
    data.arkServers = async () => ({ connected: true, servers: [
      { id: "1", name: "Velated PVP — Ragnarok",   map: "Ragnarok",   status: "started",    players: 38, maxPlayers: 70 },
      { id: "2", name: "Velated PVP — The Island", map: "The Island", status: "started",    players: 22, maxPlayers: 70 },
      { id: "3", name: "Velated PVP — Aberration", map: "Aberration", status: "restarting", players: 0,  maxPlayers: 70 },
      { id: "4", name: "Velated PVP — Extinction", map: "Extinction", status: "stopped",    players: 0,  maxPlayers: 70 },
    ] });
    data.logsRecent = async () => ({
      streams: [
        { key: "chat", label: "In-game chat", total: 1212, week: 412, lastAt: new Date(Date.now() - 240000).toISOString() },
        { key: "kills", label: "Kill log", total: 357, week: 57, lastAt: new Date(Date.now() - 1500000).toISOString() },
        { key: "joins", label: "Joins & sessions", total: 980, week: 184, lastAt: new Date(Date.now() - 60000).toISOString() },
        { key: "tribe", label: "Tribe events", total: 145, week: 23, lastAt: new Date(Date.now() - 7200000).toISOString() },
        { key: "admin", label: "Admin commands", total: 41, week: 6, lastAt: new Date(Date.now() - 86400000).toISOString() },
        { key: "bans", label: "Bans", total: 9, week: 1, lastAt: new Date(Date.now() - 172800000).toISOString() },
      ],
      recent: [
        { type: "join", map: "Ragnarok", at: new Date(Date.now() - 60000).toISOString(), text: "Nyx joined" },
        { type: "chat", map: "Ragnarok", at: new Date(Date.now() - 240000).toISOString(), text: "Vexa: anyone selling element?" },
        { type: "kill", map: "The Island", at: new Date(Date.now() - 1500000).toISOString(), text: "Yutyrannus (wild) killed Daeodon" },
        { type: "tribe", map: "Aberration", at: new Date(Date.now() - 7200000).toISOString(), text: "Apex — tamed" },
      ],
    });
    data.tierList = async () => ({
      tiers: [
        { id: 1, role_id: "22", tier_name: "Senior Staff", priority: 10, ticket_basic: 5, ticket_medium: 8, ticket_advanced: 12, auction_percentage: 5, event_payouts: { "Raid Base": 20, "Vault Event": 15 }, can_payment: true,  can_log: true, can_approve_payout: true,  can_configure_tickets: false },
        { id: 2, role_id: "23", tier_name: "Support",      priority: 5,  ticket_basic: 3, ticket_medium: 5, ticket_advanced: 8,  auction_percentage: 0, event_payouts: {},                                     can_payment: false, can_log: true, can_approve_payout: false, can_configure_tickets: false },
      ],
      currency: { code: "GBP", symbol: "£" },
      defaults: { ticket: { basic: { amount: 0.2 }, medium: { amount: 0.3 }, advanced: { amount: 0.4 } }, event: { "Raid Base": 20, "Vault Event": 15, "Scav": 10, "Other": 10 } },
    });
    data.tierCreate = async (g, b) => ({ ok: true, tier: Object.assign({ id: 99 }, b) });
    data.tierUpdate = async (g, id, b) => ({ ok: true, tier: Object.assign({ id }, b) });
    data.tierDelete = async () => ({ ok: true });
    data.paypalGet = async () => ({
      mode: "sandbox", brandName: "Velated PVP", prefer: "orders",
      webhookUrl: "https://quicksark.squareweb.app/webhooks/paypal",
      returnUrl: "https://quicksark.squareweb.app/paypal/return",
      cancelUrl: "https://quicksark.squareweb.app/paypal/cancel",
      clientId: { configured: true, source: "guild", last4: "x7Qk", length: 80 },
      clientSecret: { configured: true, source: "guild", last4: "p2Lm", length: 80 },
      webhookId: { configured: false },
    });
    data.paypalSave = async () => Object.assign({ ok: true }, await data.paypalGet());
    data.paypalTest = async () => ({ ok: true, mode: "sandbox", tokenType: "Bearer", expiresIn: 32400, appId: "APP-80W284485P519543T" });
    const MOCK_TPL = (cat, items) => ({ cat, items });
    data.templates = async () => ({ isPremium: true, templates: [
      { id: "ARK", label: "ARK Server Layout", tier: "premium", locked: false, live: true, blurb: "The full layout of our flagship ARK community, copied live.", categories: 6, channels: 29, roles: 6,
        preview: { channels: [MOCK_TPL("WELCOME", ["# 👋｜welcome", "# 📜｜rules", "📣 📢｜announcements"]), MOCK_TPL("ARK SERVERS", ["# 🗺｜server-status", "# 📈｜rates", "🔊 Tribe VC"]), MOCK_TPL("STAFF", ["# 🛠｜staff-chat"])], roles: ["Admin", "Moderator", "Tribe Leader", "Supporter", "Member", "Muted"] } },
      { id: "SUPPORT", label: "Support Discord", tier: "premium", locked: false, live: false, blurb: "A ticket-first support server with a private staff wing.", categories: 5, channels: 19, roles: 6,
        preview: { channels: [MOCK_TPL("WELCOME", ["# 👋｜welcome", "# ❓｜faq", "📣 🟢｜status"]), MOCK_TPL("SUPPORT", ["# 🎫｜open-a-ticket", "# 💬｜help-chat", "# 🐛｜bug-reports"]), MOCK_TPL("STAFF", ["# 🛠｜staff-chat", "🔊 Staff Room"])], roles: ["Admin", "Support Manager", "Support Agent", "Verified", "Member", "Muted"] } },
      { id: "COMMUNITY", label: "Community Hub", tier: "free", locked: false, live: false, blurb: "A clean general-purpose community layout.", categories: 6, channels: 20, roles: 6,
        preview: { channels: [MOCK_TPL("START HERE", ["# 👋｜welcome", "# 🎭｜get-roles"]), MOCK_TPL("COMMUNITY", ["# 💬｜general", "# 🖼｜media", "# 🤖｜bot-commands"]), MOCK_TPL("EVENTS", ["📣 📅｜event-announcements", "# 🎉｜event-chat"])], roles: ["Admin", "Moderator", "Event Host", "Active Member", "Member", "Muted"] } },
    ] });
    data.templateApply = async () => ({ ok: true, started: true, summary: "Template apply started (mock) — nothing was changed." });
    // Module-form stubs (for ?mock=welcome etc.)
    data.channels = async () => ({ channels: [
      { id: "1", name: "general", type: 0 }, { id: "2", name: "welcome", type: 0 },
      { id: "3", name: "announcements", type: 0 }, { id: "4", name: "mod-logs", type: 0 },
      { id: "5", name: "level-up", type: 0 }, { id: "6", name: "bot-spam", type: 0 },
      { id: "7", name: "staff-pay", type: 0 },
    ] });
    data.categories = async () => ({ categories: [{ id: "10", name: "INFORMATION" }, { id: "11", name: "COMMUNITY" }] });
    data.roles = async () => ({ roles: [{ id: "20", name: "Member" }, { id: "21", name: "Admin" }, { id: "22", name: "Staff" }] });
    // Embed Builder stubs (for ?mock=embed) — no backend in mock.
    data.embTplList = async () => ({ templates: [{ id: 1, name: "Welcome banner", messageContent: "", allowedMentions: "default", embedJson: [], componentsJson: [] }, { id: 2, name: "Server rules", messageContent: "", allowedMentions: "default", embedJson: [], componentsJson: [] }] });
    data.embDraftGet = async () => ({ draft: null });
    data.embDraftSave = async () => ({ ok: true });
    data.embTplDelete = async () => ({ ok: true });
    data.emojis = async () => ({ emojis: [{ id: "1001", name: "pog", animated: false }, { id: "1002", name: "kekw", animated: false }, { id: "1003", name: "blobdance", animated: true }, { id: "1004", name: "pepega", animated: false }] });
    // Role Menus stubs — a dropdown menu + a button menu (?mock=rolemenus list,
    // ?mock=rolemenu detail editor).
    const RM_MENUS = [
      { id: 1, name: "Ping Roles", description: "Pick the pings you want to get", type: "dropdown", channelId: "3", posted: true, options: [
        { id: 11, roleId: "20", label: "Announcements", description: "Server news & updates", emoji: "📢" },
        { id: 12, roleId: "22", label: "Events", description: "Get pinged for events", emoji: "🎉" },
        { id: 13, roleId: "21", label: "Giveaways", description: "Never miss a drop", emoji: "🎁" },
      ] },
      { id: 2, name: "Game Roles", description: "Tap a game to get its role", type: "button", channelId: "1", posted: false, options: [
        { id: 21, roleId: "20", label: "ARK", description: "", emoji: "🦖" },
        { id: 22, roleId: "22", label: "Minecraft", description: "", emoji: "⛏️" },
        { id: 23, roleId: "21", label: "Valheim", description: "", emoji: "🛡️" },
      ] },
    ];
    const rmFind = (id) => RM_MENUS.find((x) => String(x.id) === String(id)) || RM_MENUS[0];
    data.rmList = async () => ({ menus: RM_MENUS });
    data.rmGet = async (gid, id) => ({ menu: rmFind(id) });
    data.rmCreate = async (gid, body) => ({ menu: Object.assign({ id: 99, posted: false, options: [] }, body) });
    data.rmUpdate = async (gid, id, body) => { const m = rmFind(id); Object.assign(m, body); return { menu: m }; };
    data.rmOptAdd = async (gid, id, body) => { const m = rmFind(id); const o = Object.assign({ id: 900 + m.options.length }, body); m.options.push(o); return { option: o }; };
    data.rmOptDelete = async (gid, id, oid) => { const m = rmFind(id); m.options = m.options.filter((o) => String(o.id) !== String(oid)); return { ok: true }; };
    data.rmPost = async () => ({ summary: "Posted to #announcements" });
    data.rmDelete = async () => ({ ok: true });
    const MOD_DEFS = {
      roleMenus: { module: { name: "roleMenus", label: "Role Menus", customUi: true, tier: "free", quickSetupAvailable: false }, values: {} },
      welcome: {
        module: {
          name: "welcome", label: "Welcome", description: "Greet new members with a custom embed when they join.", tier: "free",
          fields: [
            { key: "enabled", type: "boolean", label: "Enabled", help: "Turn welcome messages on or off." },
            { key: "channelId", type: "channel", label: "Welcome channel", help: "Where greetings are posted." },
            { key: "title", type: "text", label: "Embed title", max: 256 },
            { key: "message", type: "textarea", label: "Message", help: "Use {user} to mention the new member.", max: 2000 },
            { key: "mentionUser", type: "boolean", label: "Mention the new member" },
            { key: "embedColor", type: "hex", label: "Embed color" },
            { key: "imageUrl", type: "image-url", label: "Image URL" },
          ],
        },
        values: { enabled: true, channelId: "2", title: "Welcome to the server!", message: "Hey {user}, glad you're here — check the rules and have fun!", mentionUser: true, embedColor: "#5865f2", imageUrl: "" },
      },
      branding: {
        module: {
          name: "branding", label: "Branding", customUi: true, tier: "premium", description: "Customize the look of every Arkoris embed across the server.",
          fields: [
            { key: "primaryColor", type: "hex", label: "Primary color", help: "Accent color used on embeds." },
            { key: "footerText", type: "text", label: "Footer text", max: 2048 },
            { key: "footerIcon", type: "image-url", label: "Footer icon URL" },
            { key: "thumbnail", type: "image-url", label: "Default thumbnail URL" },
            { key: "showTimestamp", type: "boolean", label: "Show timestamp on embeds" },
          ],
        },
        values: { primaryColor: "#5865f2", footerText: "Velated PVP · Powered by Arkoris", footerIcon: "", thumbnail: "", showTimestamp: true },
      },
      ark: { module: { name: "ark", label: "ARK Server Suite", customUi: true, tier: "premium" }, values: {} },
      logs: { module: { name: "logs", label: "Discord & Game Logs", customUi: true, tier: "free" }, values: {} },
      autoRoles: {
        module: {
          name: "autoRoles", label: "Auto Roles", tier: "free", description: "Assign roles automatically to new members.",
          fields: [
            { key: "enabled", type: "boolean", label: "Enabled" },
            { key: "roleIds", type: "roles", label: "Auto Roles", help: "Roles granted on join." },
            { key: "ignoreBots", type: "boolean", label: "Skip bot accounts" },
          ],
        },
        values: { enabled: true, roleIds: ["20", "22"], ignoreBots: true },
      },
      xp: {
        module: {
          name: "xp", label: "XP & Leaderboards", tier: "free", description: "Message-based XP, levels, weekly leaderboard. No quests.",
          fields: [
            { key: "enabled", type: "boolean", label: "Enabled" },
            { key: "xpMin", type: "integer", label: "XP per message — min" },
            { key: "xpMax", type: "integer", label: "XP per message — max" },
            { key: "cooldownSec", type: "integer", label: "Cooldown (seconds)" },
            { key: "ignoredChannels", type: "channels", label: "Ignored channels" },
            { key: "ignoredRoles", type: "roles", label: "Ignored roles" },
            { key: "levelUpAnnounce", type: "boolean", label: "Announce level-ups" },
            { key: "levelUpChannelId", type: "channel", label: "Level-up channel" },
            { key: "weeklyResetDay", type: "choice", label: "Weekly reset day" },
            { key: "weeklyChannelId", type: "channel", label: "Weekly leaderboard channel" },
            { key: "rewardsMode", type: "choice", label: "Weekly rewards" },
            { key: "rewardType", type: "choice", label: "Reward type" },
          ],
        },
        values: { enabled: true, xpMin: 5, xpMax: 15, cooldownSec: 60, ignoredChannels: ["6"], ignoredRoles: [], levelUpAnnounce: true, levelUpChannelId: "5", weeklyResetDay: "mon", weeklyChannelId: "3", rewardsMode: "auto", rewardType: "both", reward1stCredits: 500, reward2ndCredits: 250, reward3rdCredits: 100, reward1stEggs: 3, reward2ndEggs: 2, reward3rdEggs: 1 },
      },
      moderation: {
        module: {
          name: "moderation", label: "Moderation", tier: "free", description: "Ban, kick, timeout, URL filter, whitelist.",
          fields: [
            { key: "enabled", type: "boolean", label: "Enabled" },
            { key: "modLogChannelId", type: "channel", label: "Mod log channel" },
            { key: "modRoleIds", type: "roles", label: "Mod roles" },
            { key: "urlFilterEnabled", type: "boolean", label: "URL filter enabled" },
            { key: "whitelistDomains", type: "keywords", label: "Whitelisted domains" },
            { key: "maxWarnings", type: "integer", label: "Warning cap before auto-action" },
          ],
        },
        values: { enabled: true, modLogChannelId: "4", modRoleIds: ["22"], urlFilterEnabled: true, whitelistDomains: ["youtube.com", "twitch.tv", "arkoris.net"], maxWarnings: 3 },
      },
      hype: {
        module: {
          name: "hype", label: "Hype", tier: "premium", description: "Reward name/tag/invite/boost activity with credits.",
          fields: [
            { key: "brand_name", type: "text", label: "Brand name" },
            { key: "name_enabled", type: "boolean", label: "Name reward enabled" },
            { key: "name_keywords", type: "keywords", label: "Name keywords" },
            { key: "name_credits", type: "integer", label: "Name reward credits" },
            { key: "name_channel_id", type: "channel", label: "Name reward channel" },
            { key: "name_cooldown_hours", type: "integer", label: "Name cooldown (hours)" },
            { key: "name_role_id", type: "role", label: "Name reward role" },
            { key: "tag_enabled", type: "boolean", label: "Tag reward enabled" },
            { key: "tag_keywords", type: "keywords", label: "Tag keywords" },
            { key: "tag_credits", type: "integer", label: "Tag reward credits" },
            { key: "tag_channel_id", type: "channel", label: "Tag reward channel" },
            { key: "tag_cooldown_hours", type: "integer", label: "Tag cooldown (hours)" },
            { key: "tag_role_id", type: "role", label: "Tag reward role" },
            { key: "tag_guild_id", type: "text", label: "Tag server ID" },
            { key: "invite_enabled", type: "boolean", label: "Invite reward enabled" },
            { key: "invite_credits", type: "integer", label: "Invite reward credits" },
            { key: "invite_channel_id", type: "channel", label: "Invite reward channel" },
            { key: "boost_channel_id", type: "channel", label: "Boost reward channel" },
          ],
        },
        values: { brand_name: "Velated PVP", name_enabled: true, name_keywords: ["velated", "vel"], name_credits: 25, name_channel_id: "3", name_cooldown_hours: 168, name_role_id: "22", tag_enabled: true, tag_keywords: [], tag_credits: 50, tag_channel_id: "3", tag_cooldown_hours: 0, tag_role_id: "20", tag_guild_id: "", invite_enabled: true, invite_credits: 10, invite_channel_id: "1", boost_channel_id: "1" },
      },
      events: {
        module: {
          name: "events", label: "Events", tier: "premium", description: "Dino / Number / Vault guessing events with credit rewards.",
          fields: [
            { key: "enabled", type: "boolean", label: "Enabled" },
            { key: "announceChannelId", type: "channel", label: "Event announce channel" },
            { key: "trackChannelId", type: "channel", label: "Guess channel" },
            { key: "pingRoleId", type: "role", label: "Event ping role" },
            { key: "allowedRoleIds", type: "roles", label: "Allowed host roles" },
          ],
        },
        values: { enabled: true, announceChannelId: "3", trackChannelId: "1", pingRoleId: "20", allowedRoleIds: ["22"], dinoBase: 50, dinoBump: 5, dinoPer: 25, numberBase: 30, numberBump: 2, numberPer: 100, vaultBase: 100, vaultBump: 10, vaultPer: 50 },
      },
      tickets: {
        module: {
          name: "tickets", label: "Tickets", tier: "premium", description: "Forum-based support tickets, staff workflows, transcripts.",
          fields: [
            { key: "enabled", type: "boolean", label: "Enabled" },
            { key: "panelChannelId", type: "channel", label: "Ticket panel channel" },
            { key: "ticketCategoryId", type: "category", label: "Ticket category" },
            { key: "staffRoleIds", type: "roles", label: "Staff roles" },
            { key: "logChannelId", type: "channel", label: "Ticket log channel" },
            { key: "autoCloseHours", type: "integer", label: "Auto-close after (hours, 0=off)" },
            { key: "claimEnabled", type: "boolean", label: "Allow staff claim" },
          ],
        },
        values: { enabled: true, panelChannelId: "3", ticketCategoryId: "11", staffRoleIds: ["22"], logChannelId: "4", autoCloseHours: 48, claimEnabled: true },
      },
      staffPay: {
        module: {
          name: "staffPay", label: "Staff Pay", tier: "premium", description: "Track staff earnings and monthly logs.",
          fields: [
            { key: "enabled", type: "boolean", label: "Enabled" },
            { key: "forumChannelId", type: "channel", label: "Staff Pay forum channel" },
          ],
        },
        values: { enabled: true, forumChannelId: "7" },
      },
      payments: {
        module: {
          name: "payments", label: "Payments", tier: "premium", description: "Per-server PayPal & Stripe payments with auto-confirm.",
          fields: [
            { key: "enabled", type: "boolean", label: "Enabled" },
            { key: "defaultCurrency", type: "choice", label: "Default currency" },
            { key: "logChannelId", type: "channel", label: "Payment log channel" },
            { key: "instructions", type: "textarea", label: "Payment instructions" },
          ],
        },
        values: { enabled: true, defaultCurrency: "GBP", logChannelId: "4", instructions: "Pick a package below and pay with PayPal or card. Your perks are applied automatically once payment clears." },
      },
      serverTemplates: {
        module: {
          name: "serverTemplates", label: "Server Templates", tier: "premium", description: "Apply preset channel/role/permission templates.",
          fields: [{ key: "enabled", type: "boolean", label: "Enabled" }],
        },
        values: { enabled: true },
      },
    };
    data.module = async (gid, name) => MOD_DEFS[name] || MOD_DEFS.welcome;

    const TAB_FOR = { overview: "overview", setup: "setup-hub", setuphub: "setup-hub", hub: "setup-hub", welcome: "welcome", module: "welcome", analytics: "analytics", branding: "branding", ark: "ark", embed: "embed-builder", embedbuilder: "embed-builder", autoroles: "autoRoles", xp: "xp", moderation: "moderation", logs: "logs", hype: "hype", events: "events", tickets: "tickets", staffpay: "staffPay", payments: "payments", servertemplates: "serverTemplates", rolemenus: "roleMenus", rolemenu: "roleMenus", customcommands: "customCommands", commands: "customCommands" };
    if (TAB_FOR[mode]) {
      state.selectedGuildId = state.guilds[0].id;
      state.activeTab = TAB_FOR[mode];
    }
    if (mode === "rolemenu") _rmEditingId = 1; // ?mock=rolemenu → detail editor; ?mock=rolemenus → list of previews
    if (mode === "upsell") {
      data.module = async () => ({ tierLocked: true, module: { name: "tickets", label: "Tickets", tier: "premium", description: "Forum-based support tickets with staff claim, logging, and auto-close." } });
      state.selectedGuildId = state.guilds[0].id;
      state.activeTab = "tickets";
    }
    render();
    return true;
  }

  async function boot() {
    clear(root);
    if (maybeRenderMock()) return;
    // Premium skeleton while we fetch identity + guild list.
    root.append(renderPickerBootSkeleton());
    await consumeAuthHandoff();
    try {
      const me = await data.me();
      state.user = me.user;
      const g = await data.guilds();
      state.guilds = g.guilds || [];
      render();
    } catch (e) {
      console.error("[dashboard] boot failed:", e);
      if (e.code === 401) { state.user = null; return renderLoggedOut(); }
      if (e.code === "no_backend") return renderNoBackend();
      // Network/timeout/500 — show a friendly retry card, not raw error text.
      return renderPickerBootError(e);
    }
  }

  /** Skeleton mirroring the picker layout so the loading state feels
   *  intentional, not blank. */
  function renderPickerBootSkeleton() {
    const wrap = h("div");
    wrap.append(
      h("div", { class: "skel-card", style: { padding: "20px" } },
        h("div", { class: "skel skel-line lg w-30" }),
        h("div", { class: "skel skel-line w-70" }),
        h("div", { class: "skel skel-line w-50" })
      ),
      h("div", { class: "picker-grid" },
        h("div", { class: "picker-main" },
          h("div", { class: "skel-card", style: { padding: "12px" } },
            h("div", { class: "skel skel-line w-50" })
          ),
          h("div", { class: "picker-servers" },
            ...new Array(4).fill(0).map(() => h("div", { class: "skel-card" },
              h("div", { class: "skel skel-line lg w-50" }),
              h("div", { class: "skel skel-line w-30" }),
              h("div", { class: "skel skel-line w-70" })
            ))
          )
        ),
        h("div", { class: "picker-aside" },
          h("div", { class: "skel-card" },
            h("div", { class: "skel skel-line lg w-30" }),
            h("div", { class: "skel skel-line w-70" })
          ),
          h("div", { class: "skel-card" },
            h("div", { class: "skel skel-line lg w-30" }),
            h("div", { class: "skel skel-line w-90" })
          )
        )
      )
    );
    return wrap;
  }

  /** Premium boot-error state. Shown when /me or /guilds fails (network,
   *  500, timeout). Always offers a clear Retry + Support. */
  function renderPickerBootError(err) {
    clear(root);
    const card = h("div", { class: "picker-empty large" });
    const ico = h("div", { class: "picker-empty-ico" });
    ico.appendChild(iconSvg("refresh"));
    const detail = err?.code === "timeout" ? "The backend didn't respond in 8 seconds."
                  : err?.code === "network" ? "Couldn't reach the backend (CORS or network)."
                  : (err?.message || "Unknown error");
    card.append(
      ico,
      h("h3", null, "Couldn't load your servers"),
      h("p", null, detail, " You can try again, or manage the bot inside Discord while we look into it."),
      h("div", { class: "dash-actions", style: { justifyContent: "center" } },
        btn("Retry",        { kind: "btn-primary", onclick: () => boot() }),
        btn("Join Support", { kind: "btn-ghost",   href: cfg.links?.supportDiscord, external: true }),
        btn("Invite Bot",   { kind: "btn-outline", href: cfg.links?.inviteBot,      external: true })
      )
    );
    root.append(card);
  }

  function selectGuild(id) {
    state.selectedGuildId = id;
    state.activeTab = "overview";
    state.channels = null; // reset cached lists for new guild
    state.categories = null;
    state.roles = null;
    state.setupStatus = null; // never carry one guild's setup completeness to another
    state._forceHub = false;
    _rmEditingId = null; // never carry an open editor across guilds
    _ccEditing = null;
    render();
  }

  async function handleLogout() {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    state.user = null;
    state.guilds = [];
    state.selectedGuildId = null;
    state.modules = null;
    state.channels = null;
    state.categories = null;
    state.roles = null;
    state.setupStatus = null;
    render();
  }

  boot();
})();
