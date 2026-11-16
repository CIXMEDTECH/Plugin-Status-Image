// Status images: the live state of nodes drawn as SVG, at addresses anyone can
// embed with a plain <img>. Every request draws the current state (kept for a few
// seconds), so the picture is as fresh as its last load. Hidden nodes are never
// drawn, and a private site has no images at all.
const v = require("vespera");

const GREEN = "#2fa36b", AMBER = "#d48a0b", RED = "#dc3d43", GRAY = "#8a909c";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Verdana,sans-serif";
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/** Rough width of text at a font size: wide for CJK, narrow for the rest. */
const width = (s, size) => [...String(s)].reduce((w, ch) => w + (ch.charCodeAt(0) < 128 ? 0.6 : 1.04) * size, 0);
/** Cut text to fit a width, with an ellipsis. */
function fit(s, max, size) {
  s = String(s);
  if (width(s, size) <= max) return s;
  let out = "";
  for (const ch of s) {
    if (width(out + ch + "…", size) > max) break;
    out += ch;
  }
  return out + "…";
}
function query(req) {
  const out = {};
  for (const part of (req.query || "").split("&")) {
    const [k, val] = part.split("=");
    if (k) {
      try {
        out[decodeURIComponent(k)] = decodeURIComponent((val || "").replace(/\+/g, " "));
      } catch (e) {
        /* a broken escape: skip the parameter */
      }
    }
  }
  return out;
}
function size(bytes) {
  const units = ["B", "K", "M", "G", "T"];
  let n = Math.max(0, bytes || 0), i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)}${units[i]}`;
}
function ago(secs) {
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600);
  return d > 0 ? `${d}d` : h > 0 ? `${h}h` : `${Math.max(1, Math.floor(secs / 60))}m`;
}

// ---- what there is to draw ----------------------------------------------------
// Kept for a moment, so many viewers at once cost one look at the nodes.
let snapshot = null;
async function state() {
  const now = Date.now();
  if (snapshot && now - snapshot.at < 3000) return snapshot;
  const [site, cfg, nodes, live] = [await v.site.info(), await v.config.get(), await v.nodes.list(), await v.nodes.live()];
  snapshot = {
    at: now,
    site,
    usage: cfg.show_usage !== false,
    limit: Math.min(Math.max(Math.round(Number(cfg.board_limit) || 30), 1), 100),
    // Hidden nodes stay out of every image.
    nodes: nodes.filter((n) => !n.hidden).map((n) => Object.assign({}, n, { live: live[n.id] || {} })),
  };
  return snapshot;
}
let uptimes = null;
async function uptime() {
  if (!uptimes || Date.now() - uptimes.at > 60000) uptimes = { at: Date.now(), of: await v.nodes.uptime(30) };
  return uptimes.of;
}
/** up, maintenance or down, with its words and color. */
function status(n, zh) {
  if (n.online) return { key: "up", text: zh ? "在线" : "online", color: GREEN };
  if (n.live.maintenance) return { key: "maintenance", text: zh ? "维护中" : "maintenance", color: AMBER };
  return { key: "down", text: zh ? "离线" : "offline", color: RED };
}
function percent(p) {
  if (p === null || p === undefined) return { text: "–", color: GRAY };
  const color = p >= 99 ? GREEN : p >= 95 ? AMBER : RED;
  // Downtime never rounds up to a clean 100%.
  return { text: p >= 100 ? "100%" : `${Math.min(p, 99.99).toFixed(2)}%`, color };
}

// ---- drawing ------------------------------------------------------------------
/** A two-part badge: label on gray, value on a color. */
function badge(label, value, color) {
  label = fit(label, 260, 11);
  const lw = Math.ceil(width(label, 11) + 14), vw = Math.ceil(width(value, 11) + 14), w = lw + vw;
  const [l, val] = [esc(label), esc(value)];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${l}: ${val}"><title>${l}: ${val}</title>` +
    `<clipPath id="r"><rect width="${w}" height="20" rx="4"/></clipPath><g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#444b57"/>` +
    `<rect x="${lw}" width="${vw}" height="20" fill="${color}"/></g><g fill="#fff" text-anchor="middle" font-family="${FONT}" font-size="11">` +
    `<text x="${lw / 2}" y="14">${l}</text><text x="${lw + vw / 2}" y="14">${val}</text></g></svg>`
  );
}

const THEMES = {
  light: { bg: "#ffffff", panel: "#f6f6f4", line: "#e4e2dc", fg: "#15171c", muted: "#5f6573", faint: "#9aa0ac", track: "#e9e8e3" },
  dark: { bg: "#14161b", panel: "#1b1e25", line: "#2a2f39", fg: "#e8eaef", muted: "#9aa1ae", faint: "#636a77", track: "#2a2f39" },
};
const level = (p) => (p >= 90 ? RED : p >= 70 ? AMBER : GREEN);
/** A usage bar with its percentage. */
function bar(x, y, w, p, c) {
  const pct = Math.max(0, Math.min(100, p || 0));
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="6" rx="3" fill="${c.track}"/>` +
    `<rect x="${x}" y="${y}" width="${Math.max(pct > 0 ? 3 : 0, (w * pct) / 100).toFixed(1)}" height="6" rx="3" fill="${level(pct)}"/>`
  );
}
const usage = (n) => {
  const r = n.live.report;
  if (!r) return null;
  const of = (a, b) => (b > 0 ? (a / b) * 100 : 0);
  return { cpu: r.cpu, mem: of(r.mem_used, r.mem_total), disk: of(r.disk_used, r.disk_total), rx: r.net_rx, tx: r.net_tx };
};

/** One node as a card: name, state, and its usage when that may be shown. */
function card(n, s, zh, c) {
  const st = status(n, zh);
  const u = s.usage ? usage(n) : null;
  const W = 340, H = u ? 132 : 64;
  let out =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(n.name)}: ${st.text}" font-family="${FONT}">` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${c.bg}" stroke="${c.line}"/>` +
    `<circle cx="22" cy="26" r="5" fill="${st.color}"/>` +
    `<text x="36" y="31" font-size="15" font-weight="600" fill="${c.fg}">${esc(fit(n.name, 190, 15))}</text>` +
    `<text x="${W - 16}" y="31" font-size="12" text-anchor="end" fill="${st.color}">${st.text}</text>` +
    `<text x="36" y="50" font-size="11" fill="${c.faint}">${esc(fit([n.region, n.os].filter(Boolean).join(" · "), 280, 11))}</text>`;
  if (u) {
    const rows = [["CPU", u.cpu], [zh ? "内存" : "MEM", u.mem], [zh ? "磁盘" : "DISK", u.disk]];
    rows.forEach(([label, p], i) => {
      const y = 72 + i * 16;
      out +=
        `<text x="16" y="${y + 7}" font-size="11" fill="${c.muted}">${label}</text>` + bar(60, y, 150, p, c) +
        `<text x="220" y="${y + 7}" font-size="11" font-family="${MONO}" fill="${c.fg}">${Math.round(p)}%</text>`;
    });
    out +=
      `<text x="${W - 16}" y="79" font-size="11" font-family="${MONO}" text-anchor="end" fill="${c.muted}">↑ ${size(u.tx)}/s</text>` +
      `<text x="${W - 16}" y="95" font-size="11" font-family="${MONO}" text-anchor="end" fill="${c.muted}">↓ ${size(u.rx)}/s</text>`;
  }
  return out + "</svg>";
}

/** Every visible node in one picture: a row each, newest state. */
function board(s, nodes, zh, c, now) {
  const W = 720, ROW = 30, TOP = 52;
  const shown = nodes.slice(0, s.limit);
  const more = nodes.length - shown.length;
  const H = TOP + Math.max(shown.length, 1) * ROW + (more > 0 ? 26 : 10);
  const up = nodes.filter((n) => n.online).length;
  const cols = zh ? ["节点", "CPU", "内存", "磁盘", "网络"] : ["Node", "CPU", "Memory", "Disk", "Network"];
  let out =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.site.name)}" font-family="${FONT}">` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${c.bg}" stroke="${c.line}"/>` +
    `<text x="18" y="27" font-size="15" font-weight="600" fill="${c.fg}">${esc(fit(s.site.name, 300, 15))}</text>` +
    `<text x="${W - 18}" y="27" font-size="12" text-anchor="end" fill="${c.muted}">${zh ? `在线 ${up} / ${nodes.length}` : `${up} / ${nodes.length} online`} · ${now}</text>` +
    `<rect x="1" y="36" width="${W - 2}" height="16" fill="${c.panel}"/>`;
  const X = [34, 262, 372, 482, 592];
  if (s.usage) cols.forEach((t, i) => (out += `<text x="${X[i]}" y="48" font-size="10" fill="${c.faint}">${t}</text>`));
  shown.forEach((n, i) => {
    const y = TOP + i * ROW, st = status(n, zh), u = s.usage ? usage(n) : null;
    if (i > 0) out += `<line x1="18" x2="${W - 18}" y1="${y}" y2="${y}" stroke="${c.line}"/>`;
    out += `<circle cx="22" cy="${y + 15}" r="4" fill="${st.color}"/><text x="34" y="${y + 19}" font-size="12.5" fill="${c.fg}">${esc(fit(n.name, s.usage ? 210 : 520, 12.5))}</text>`;
    if (u) {
      [u.cpu, u.mem, u.disk].forEach((p, k) => {
        out += bar(X[k + 1], y + 12, 62, p, c) + `<text x="${X[k + 1] + 68}" y="${y + 19}" font-size="11" font-family="${MONO}" fill="${c.muted}">${Math.round(p)}%</text>`;
      });
      out += `<text x="${X[4]}" y="${y + 19}" font-size="11" font-family="${MONO}" fill="${c.muted}">↑${size(u.tx)} ↓${size(u.rx)}</text>`;
    } else {
      const since = n.live.since ? ago(Math.max(0, v.time.now().ts - n.live.since)) : "";
      out += `<text x="${W - 18}" y="${y + 19}" font-size="11.5" text-anchor="end" fill="${st.color}">${st.text}${!n.online && since ? ` · ${since}` : ""}</text>`;
    }
  });
  if (shown.length === 0) out += `<text x="${W / 2}" y="${TOP + 20}" font-size="12" text-anchor="middle" fill="${c.faint}">${zh ? "没有节点" : "No nodes"}</text>`;
  if (more > 0) out += `<text x="${W / 2}" y="${H - 9}" font-size="11" text-anchor="middle" fill="${c.faint}">${zh ? `还有 ${more} 个节点` : `and ${more} more`}</text>`;
  return out + "</svg>";
}

// ---- addresses ----------------------------------------------------------------
// Every picture comes as .svg, .png, .jpg, or .mjpeg: a live JPEG stream that draws
// itself again every few seconds for as long as it is on screen. The panel turns
// the SVG into pixels with the fonts in this plugin's fonts/ folder.
const KINDS = ["svg", "png", "jpg", "mjpeg"];
const missing = { status: 404, body: "" };
const gone = () => {
  throw new Error("no longer shown");
};
/** `/card/<name>.<kind>` → { name, kind }. */
function address(path, prefix) {
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length), dot = rest.lastIndexOf(".");
  const kind = rest.slice(dot + 1);
  return dot > 0 && KINDS.includes(kind) ? { name: rest.slice(0, dot), kind } : null;
}
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/**
 * Hand a drawing out as the kind of picture asked for. `draw` is called for every
 * picture of a stream, so it reads the state afresh each time.
 */
async function deliver(kind, q, draw, maxAge, background) {
  // ?scale=2 for sharp pictures on high-density screens.
  const scale = q.scale === "2" ? 2 : 1;
  const cache = { "cache-control": `public, max-age=${maxAge}` };
  if (kind === "svg") return { status: 200, headers: Object.assign({ "content-type": "image/svg+xml; charset=utf-8" }, cache), body: await draw() };
  if (kind === "png") return { image: await draw(), format: "png", scale, headers: cache };
  if (kind === "jpg") return { image: await draw(), format: "jpeg", scale, background, quality: 88, headers: cache };
  const cfg = await v.config.get();
  if (cfg.live === false) return missing;
  const min = clamp(Math.round(Number(cfg.live_interval) || 2), 1, 60);
  const every = clamp(parseInt(q.interval, 10) || min, min, 60);
  return { stream: draw, interval: every * 1000, scale, background, quality: 80 };
}

function clock() {
  const t = v.time.now(), p = (n) => String(n).padStart(2, "0");
  return `${p(t.hour)}:${p(t.minute)}:${p(t.second)}`;
}

// /badge/node/<uuid>.<kind> and /badge/page/<slug>.<kind>; ?metric=uptime, ?label=, ?lang=zh
v.route("GET", "/badge/*", async (req) => {
  const s = await state();
  if (s.site.private) return missing;
  const q = query(req), zh = q.lang === "zh";
  const node = address(req.path, "/badge/node/"), page = address(req.path, "/badge/page/");
  if (node) {
    const first = s.nodes.find((x) => x.uuid === node.name);
    if (!first) return missing;
    const label = (q.label || "").trim() || first.name;
    const draw = async () => {
      const n = (await state()).nodes.find((x) => x.uuid === node.name) || gone();
      if (q.metric === "uptime") {
        const p = percent((await uptime())[n.id]);
        return badge(label, p.text, p.color);
      }
      const st = status(n, zh);
      return badge(label, st.text, st.color);
    };
    return deliver(node.kind, q, draw, q.metric === "uptime" ? 60 : 30, "#ffffff");
  }
  if (page) {
    const first = (await v.status.pages()).find((p) => p.slug === page.name && p.enabled);
    if (!first) return missing;
    const label = (q.label || "").trim() || first.title;
    const draw = async () => {
      const pg = (await v.status.pages()).find((p) => p.slug === page.name && p.enabled) || gone();
      // A status page may list hidden nodes on purpose: its badge counts them too.
      const all = await v.nodes.list(), live = await v.nodes.live();
      const nodes = all.filter((n) => pg.node_ids.includes(n.id));
      if (q.metric === "uptime") {
        const of = await uptime();
        const known = nodes.map((n) => of[n.id]).filter((p) => p !== null && p !== undefined);
        const p = percent(known.length ? known.reduce((a, b) => a + b, 0) / known.length : null);
        return badge(label, p.text, p.color);
      }
      const down = nodes.filter((n) => !n.online && !(live[n.id] || {}).maintenance).length;
      if (nodes.length === 0) return badge(label, "–", GRAY);
      if (down === 0) return badge(label, zh ? "全部正常" : "operational", GREEN);
      const allDown = down === nodes.length;
      return badge(label, allDown ? (zh ? "全部故障" : "down") : zh ? "部分故障" : "degraded", allDown ? RED : AMBER);
    };
    return deliver(page.kind, q, draw, q.metric === "uptime" ? 60 : 30, "#ffffff");
  }
  return missing;
});

// /card/<uuid>.<kind>; ?theme=dark, ?lang=zh
v.route("GET", "/card/*", async (req) => {
  const s = await state();
  const a = address(req.path, "/card/");
  if (s.site.private || !a || !s.nodes.some((x) => x.uuid === a.name)) return missing;
  const q = query(req), c = THEMES[q.theme] || THEMES.light;
  const draw = async () => {
    const now = await state();
    if (now.site.private) gone();
    return card(now.nodes.find((x) => x.uuid === a.name) || gone(), now, q.lang === "zh", c);
  };
  return deliver(a.kind, q, draw, 10, c.bg);
});

// /board.<kind>; ?theme=dark, ?lang=zh, ?group=<node group>
for (const kind of KINDS) {
  v.route("GET", `/board.${kind}`, async (req) => {
    const s = await state();
    if (s.site.private) return missing;
    const q = query(req), c = THEMES[q.theme] || THEMES.light;
    const draw = async () => {
      const now = await state();
      if (now.site.private) gone();
      const nodes = q.group ? now.nodes.filter((n) => n.group === q.group) : now.nodes;
      return board(now, nodes, q.lang === "zh", c, clock());
    };
    return deliver(kind, q, draw, 10, c.bg);
  });
}

// For the page: what can be drawn.
v.route("GET", "/targets", async () => {
  const s = await state();
  const pages = await v.status.pages();
  const cfg = await v.config.get();
  return {
    private: !!s.site.private,
    live: cfg.live !== false,
    live_interval: clamp(Math.round(Number(cfg.live_interval) || 2), 1, 60),
    url: s.site.url || "",
    nodes: s.nodes.map((n) => ({ uuid: n.uuid, name: n.name })),
    groups: [...new Set(s.nodes.map((n) => n.group).filter(Boolean))].sort(),
    pages: pages.filter((p) => p.enabled).map((p) => ({ slug: p.slug, title: p.title })),
  };
});
