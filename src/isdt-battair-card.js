/**
 * ISDT BattAir Card – overview of all BattAir packs and plugins.
 *
 * Finds every isdt_air_ble device with BattAir entities (translation keys
 * "battair_*") and shows one row per pack: charge level, voltage, average
 * cell voltage, temperature, cycles and warnings. Packs that are out of
 * range stay in the list with the time they were last heard.
 */

import { t } from "./translations.js";

export const BATTAIR_TAG = "isdt-battair-card";

const PREFIX = "battair_";

const BATTERY_TYPE_LABELS = {
  lihv: "LiHV",
  lipo: "LiPo",
  liion: "Li-Ion",
  life: "LiFe",
  pb: "Pb",
  nimh: "NiMH",
  liuhv: "LiUHV",
};

const SORTS = ["name", "charge", "last_seen"];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

const BAD = new Set(["unavailable", "unknown", "", undefined, null]);

export function isBattAirEntity(hass, entityId) {
  const entity = hass?.entities?.[entityId];
  return (
    entity?.platform === "isdt_air_ble" &&
    typeof entity.translation_key === "string" &&
    entity.translation_key.startsWith(PREFIX)
  );
}

export class ISDTBattAirCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._lastKey = null;
    this._tick = null;
  }

  static getStubConfig() {
    return {};
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", label: t(null, "battair_config_title"), selector: { text: {} } },
        {
          name: "sort",
          label: t(null, "battair_config_sort"),
          selector: {
            select: {
              mode: "dropdown",
              options: SORTS.map((value) => ({
                value,
                label: t(null, `battair_sort_${value}`),
              })),
            },
          },
        },
        {
          name: "hide_unavailable",
          label: t(null, "battair_config_hide_unavailable"),
          selector: { boolean: {} },
        },
      ],
    };
  }

  setConfig(config) {
    this._config = { ...(config || {}) };
    this._lastKey = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  connectedCallback() {
    // Relative "last seen" times age without a state change.
    this._tick = setInterval(() => {
      this._lastKey = null;
      this._render();
    }, 60000);
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    this._tick = null;
  }

  getCardSize() {
    return 1 + Math.max(1, this._packCount || 0) * 2;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  /* ── Data ───────────────────────────────────────────── */

  _findPacks(hass) {
    const byDevice = {};
    for (const [entityId, entity] of Object.entries(hass.entities || {})) {
      if (entity.platform !== "isdt_air_ble") continue;
      const tk = entity.translation_key;
      if (typeof tk !== "string" || !tk.startsWith(PREFIX)) continue;
      if (!entity.device_id) continue;
      (byDevice[entity.device_id] ||= {})[tk.slice(PREFIX.length)] = entityId;
    }
    return Object.entries(byDevice).map(([deviceId, ids]) => {
      const dev = hass.devices?.[deviceId] || {};
      const st = (key) => (ids[key] ? hass.states[ids[key]] : undefined);
      const val = (key) => {
        const s = st(key)?.state;
        return BAD.has(s) ? null : s;
      };
      const num = (key) => {
        const v = parseFloat(val(key));
        return Number.isFinite(v) ? v : null;
      };
      const charge = st("battery");
      const available = !!charge && charge.state !== "unavailable";
      const lastSeen = val("last_seen");
      return {
        deviceId,
        ids,
        name: dev.name_by_user || dev.name || deviceId,
        // The card is titled BattAir already; "BattAir 4S 1300 mAh 88AD" reads
        // as "4S 1300 mAh 88AD" in the list.
        label: (dev.name_by_user || dev.name || deviceId).replace(/^BattAir\s+/i, "") ||
          dev.name || deviceId,
        plugin: (dev.model || "").toLowerCase().includes("plugin"),
        available,
        charge: num("battery"),
        voltage: num("voltage"),
        cell: num("cell_voltage_avg"),
        temperature: num("temperature"),
        cycles: num("cycles"),
        cells: num("cells"),
        capacity: num("capacity"),
        type: val("battery_type"),
        lastSeen: lastSeen ? new Date(lastSeen) : null,
        lowCell: val("cell_voltage_low") === "on",
        errorLog: val("error_log") === "on",
        storage: val("storage_discharge") === "on",
        transport: val("transport_mode") === "on",
      };
    });
  }

  _sortPacks(packs) {
    const sort = SORTS.includes(this._config.sort) ? this._config.sort : "name";
    const rank = (p) => (!p.available ? 2 : p.lowCell || p.errorLog ? 0 : 1);
    const byName = (a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
    return packs.sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r) return r;
      if (sort === "charge" && a.charge !== b.charge) {
        return (a.charge ?? 101) - (b.charge ?? 101);
      }
      if (sort === "last_seen" && +a.lastSeen !== +b.lastSeen) {
        return (+b.lastSeen || 0) - (+a.lastSeen || 0);
      }
      return byName(a, b);
    });
  }

  /* ── Formatting ─────────────────────────────────────── */

  _lang() {
    return this._hass?.locale?.language || this._hass?.language || "en";
  }

  _fmt(value, digits) {
    if (value == null) return "—";
    return value.toLocaleString(this._lang(), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  _ago(date) {
    if (!date || isNaN(+date)) return t(this._hass, "battair_never_seen");
    const seconds = Math.round((date - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(this._lang(), { numeric: "auto" });
    const abs = Math.abs(seconds);
    if (abs < 60) return rtf.format(0, "minute");
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
    return rtf.format(Math.round(seconds / 86400), "day");
  }

  _color(charge) {
    // Same thresholds and colours as the charge level in the charger card.
    if (charge == null) return null;
    if (charge <= 20) return { fill: "#ff5555", deep: "#cc2222", glow: "rgba(255,85,85,0.45)", shadow: "rgba(255,85,85,0.12)" };
    if (charge < 75) return { fill: "#ff9955", deep: "#cc6622", glow: "rgba(255,153,85,0.45)", shadow: "rgba(255,153,85,0.12)" };
    if (charge < 90) return { fill: "#aad400", deep: "#779200", glow: "rgba(170,212,0,0.45)", shadow: "rgba(170,212,0,0.12)" };
    return { fill: "#37c871", deep: "#1a8a4a", glow: "rgba(55,200,113,0.45)", shadow: "rgba(55,200,113,0.12)" };
  }

  /* ── Render ─────────────────────────────────────────── */

  _render() {
    if (!this._hass) return;
    let packs = this._findPacks(this._hass);
    const total = packs.length;
    const online = packs.filter((p) => p.available);
    if (this._config.hide_unavailable) packs = online.slice();
    packs = this._sortPacks(packs);
    this._packCount = packs.length;

    const key = JSON.stringify([this._config, this._lang(), total, packs]);
    if (key === this._lastKey) return;
    this._lastKey = key;

    const h = this._hass;
    const warnings = online.filter((p) => p.lowCell || p.errorLog).length;
    const away = total - online.length;
    const charges = online.map((p) => p.charge).filter((c) => c != null);
    const avg = charges.length ? Math.round(charges.reduce((a, b) => a + b, 0) / charges.length) : null;

    const stat = (value, unit, label, cls = "") =>
      `<div class="stat ${cls}"><span class="stat-value">${value}${unit ? `<small>${unit}</small>` : ""}</span><span class="stat-label">${label}</span></div>`;
    const stats = [
      stat(total, "", t(h, "battair_stat_packs")),
      stat(avg ?? "—", avg != null ? "%" : "", t(h, "battair_stat_avg")),
      stat(warnings, "", t(h, "battair_stat_warnings"), warnings ? "warn" : ""),
      stat(away, "", t(h, "battair_stat_away")),
    ].join('<div class="stat-div"></div>');

    const title = this._config.title
      ? `<span class="title-text">${esc(this._config.title)}</span>`
      : `<span class="isdt-logo">ISDT</span><span class="model-name">BattAir</span>`;

    const rows = packs.length
      ? packs.map((p) => this._row(p)).join("")
      : `<div class="empty">${t(h, total ? "battair_all_hidden" : "battair_empty")}</div>`;

    this.shadowRoot.innerHTML = `
      <style>${this._css()}</style>
      <ha-card>
        <div class="header">
          <div class="header-title">${title}</div>
          ${total ? `<div class="header-stats">${stats}</div>` : ""}
        </div>
        <div class="list">${rows}</div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-entity]").forEach((el) => {
      if (!el.dataset.entity) return;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const ev = new Event("hass-more-info", { bubbles: true, composed: true });
        ev.detail = { entityId: el.dataset.entity };
        this.dispatchEvent(ev);
      });
    });
  }

  _row(p) {
    const h = this._hass;
    const chem = [];
    if (p.type) chem.push(BATTERY_TYPE_LABELS[p.type] || p.type);
    if (p.cells != null) chem.push(`${p.cells}S`);
    const spec = [];
    if (p.capacity != null) spec.push(`${Math.round(p.capacity)} mAh`);
    if (p.plugin) spec.push(t(h, "battair_plugin"));

    // One status badge in the corner, most important first.
    let badge = null;
    if (!p.available) badge = { cls: "away", text: t(h, "battair_badge_away"), entity: p.ids.last_seen };
    else if (p.errorLog) badge = { cls: "error", text: t(h, "battair_error_log"), entity: p.ids.error_log };
    else if (p.lowCell) badge = { cls: "error", text: t(h, "battair_low_cell"), entity: p.ids.cell_voltage_low };
    else if (p.storage) badge = { cls: "info", text: t(h, "battair_storage"), entity: p.ids.storage_discharge };
    else if (p.transport) badge = { cls: "", text: t(h, "battair_transport"), entity: p.ids.transport_mode };
    // Further warnings that did not make it into the corner.
    const extra = [];
    if (p.available && p.errorLog && p.lowCell) {
      extra.push(`<span class="warn-line" data-entity="${p.ids.cell_voltage_low}"><ha-icon icon="mdi:alert"></ha-icon>${t(h, "battair_low_cell")}</span>`);
    }

    const problem = p.available && (p.errorLog || p.lowCell);
    const color = p.available ? this._color(p.charge) : null;
    const pct = color ? Math.max(4, Math.min(100, p.charge)) : 0;
    const fillStyle = color ? `width:${pct}%;background:linear-gradient(90deg,${color.deep},${color.fill})` : "width:0";
    const bodyStyle = problem ? "" : color ? `border-color:${color.glow};box-shadow:0 0 12px ${color.shadow}` : "";
    const termStyle = problem ? "" : color ? `background:${color.fill}` : "";

    const pctHTML = p.available && p.charge != null
      ? `<span class="pct-num">${Math.round(p.charge)}</span><span class="pct-sym">%</span>`
      : `<span class="pct-num dash">—</span>`;

    const info = p.available
      ? `<div class="pack-vi">
          <span data-entity="${p.ids.voltage || ""}"><ha-icon icon="mdi:lightning-bolt"></ha-icon>${this._fmt(p.voltage, 2)} V</span>
          <span data-entity="${p.ids.cell_voltage_avg || ""}">Ø ${this._fmt(p.cell, 3)} V/${t(h, "battair_cell")}</span>
          <span data-entity="${p.ids.temperature || ""}"><ha-icon icon="mdi:thermometer"></ha-icon>${this._fmt(p.temperature, 0)} °C</span>
          <span data-entity="${p.ids.cycles || ""}"><ha-icon icon="mdi:sync"></ha-icon>${this._fmt(p.cycles, 0)}</span>
        </div>`
      : `<div class="pack-vi away"><span data-entity="${p.ids.last_seen || ""}"><ha-icon icon="mdi:clock-outline"></ha-icon>${t(h, "battair_last_seen")} ${esc(this._ago(p.lastSeen))}</span></div>`;

    return `
      <div class="pack ${p.available ? "" : "off"} ${problem ? "problem" : ""}">
        <div class="shell" data-entity="${p.ids.battery || ""}">
          <div class="body" style="${bodyStyle}">
            <div class="fill" style="${fillStyle}"></div>
            <div class="content">
              <div class="ident">
                <div class="name" title="${esc(p.name)}">${esc(p.label)}</div>
                <div class="spec">
                  ${chem.length ? `<span class="btype-label">${esc(chem.join(" · "))}</span>` : ""}
                  ${spec.length ? `<span>${esc(spec.join(" · "))}</span>` : ""}
                </div>
              </div>
              <div class="pct">${pctHTML}</div>
            </div>
            ${badge ? `<span class="status-badge ${badge.cls}" data-entity="${badge.entity || ""}">${esc(badge.text)}</span>` : ""}
          </div>
          <div class="terminal" style="${termStyle}"></div>
        </div>
        ${info}
        ${extra.join("")}
      </div>`;
  }

  _css() {
    return `
    :host {
      --isdt-error: #ef5350;
      --isdt-done: #42a5f5;
    }
    ha-card {
      background: var(--ha-card-background, var(--card-background-color, #fff));
      color: var(--primary-text-color, #212121);
      border-radius: var(--ha-card-border-radius, 12px);
      border: 1px solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
      overflow: hidden;
      container-type: inline-size;
    }

    /* Header, as in the charger card */
    .header {
      padding: 18px 20px 14px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }
    .header-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; overflow: hidden; }
    .isdt-logo {
      font-weight: 800; font-size: 18px; letter-spacing: 2.5px;
      color: var(--primary-color, #03a9f4);
    }
    .title-text {
      font-weight: 700; font-size: 15px; letter-spacing: -0.01em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .model-name { font-size: 13px; font-weight: 500; color: var(--secondary-text-color, #727272); }
    .header-stats {
      display: flex; align-items: center; justify-content: space-between;
      background: var(--secondary-background-color, rgba(0,0,0,0.04));
      border-radius: 10px; padding: 10px 6px; margin-top: 14px;
    }
    .stat { display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 0; }
    .stat-value {
      font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums;
      color: var(--primary-text-color); line-height: 1.2;
    }
    .stat-value small { font-size: 10px; font-weight: 400; color: var(--secondary-text-color); margin-left: 2px; }
    .stat.warn .stat-value { color: var(--isdt-error); }
    .stat-label {
      font-size: 9px; text-transform: uppercase; letter-spacing: 1px;
      color: var(--secondary-text-color); margin-top: 3px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
    }
    .stat-div { width: 1px; height: 24px; background: var(--divider-color); }

    /* Pack list */
    /* One column on narrow cards, two or more once each pack gets ~210 px. */
    .list {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 14px 12px; padding: 12px 12px 16px;
    }
    .empty { grid-column: 1 / -1; }
    .empty { padding: 4px; color: var(--secondary-text-color); font-size: 14px; }
    .pack { display: flex; flex-direction: column; min-width: 0; container-type: inline-size; }
    .shell { display: flex; align-items: center; cursor: pointer; transition: transform 0.2s; }
    .shell:hover { transform: translateX(2px); }
    .body {
      position: relative; flex: 1; min-width: 0; min-height: 58px;
      background: var(--secondary-background-color, rgba(0,0,0,0.04));
      border: 2px solid var(--divider-color, #e0e0e0);
      border-radius: 12px 4px 4px 12px;
      overflow: hidden; transition: border-color 0.4s, box-shadow 0.4s;
    }
    .terminal {
      width: 6px; height: 26px; flex-shrink: 0;
      background: var(--divider-color, #e0e0e0);
      border-radius: 0 3px 3px 0;
    }
    .fill {
      position: absolute; top: 0; left: 0; bottom: 0; opacity: 0.3;
      transition: width 1.2s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .fill::after {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(255,255,255,0.14) 0%, transparent 55%);
    }
    .content {
      position: relative; z-index: 2;
      display: flex; align-items: center; gap: 10px;
      padding: 9px 14px 9px 14px;
    }
    .ident { flex: 1; min-width: 0; }
    .name {
      font-size: 14px; font-weight: 700; color: var(--primary-text-color);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      padding-right: 70px;
    }
    .spec {
      display: flex; align-items: center; gap: 6px; margin-top: 3px;
      font-size: 11px; color: var(--secondary-text-color); white-space: nowrap;
      min-width: 0; overflow: hidden;
    }
    .spec span:last-child:not(.btype-label) { overflow: hidden; text-overflow: ellipsis; }
    .btype-label { flex-shrink: 0; }
    .btype-label {
      font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
      background: rgba(128,128,128,0.15); padding: 1px 5px; border-radius: 3px;
    }
    .pct { display: flex; align-items: baseline; flex-shrink: 0; align-self: flex-end; }
    .pct-num { font-size: 26px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
    .pct-sym { font-size: 12px; font-weight: 500; color: var(--secondary-text-color); margin-left: 1px; }
    .pct-num.dash { color: var(--disabled-text-color, #bdbdbd); }
    .status-badge {
      position: absolute; top: 6px; right: 8px; z-index: 3;
      font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px;
      padding: 2px 6px; border-radius: 3px;
      background: var(--card-background-color, rgba(255,255,255,0.85));
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      color: var(--secondary-text-color);
    }
    .status-badge.error { color: var(--isdt-error); }
    .status-badge.info { color: var(--isdt-done); }

    .pack.problem .body {
      border-color: rgba(239,83,80,0.5);
      box-shadow: 0 0 16px rgba(239,83,80,0.12);
      animation: err-b 2s ease-in-out infinite;
    }
    .pack.problem .terminal { background: var(--isdt-error); }
    @keyframes err-b {
      0%,100% { border-color: rgba(239,83,80,0.3); }
      50%     { border-color: rgba(239,83,80,0.6); }
    }
    .pack.off .body { opacity: 0.55; }
    .pack.off .terminal { opacity: 0.4; }

    .pack-vi {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      margin-top: 6px; padding: 0 8px 0 4px;
      font-family: ui-monospace, 'Roboto Mono', monospace;
      font-variant-numeric: tabular-nums; font-size: 11px; font-weight: 600;
      color: var(--primary-text-color);
    }
    .pack-vi span { display: flex; align-items: center; gap: 2px; cursor: pointer; white-space: nowrap; }
    .pack-vi span:hover { color: var(--accent-color); }
    .pack-vi ha-icon { --mdc-icon-size: 13px; opacity: 0.45; }
    .pack-vi.away { color: var(--secondary-text-color); font-weight: 500; justify-content: flex-start; }
    .warn-line {
      display: flex; align-items: center; gap: 4px; margin: 4px 4px 0;
      font-size: 11px; font-weight: 600; color: var(--isdt-error); cursor: pointer;
    }
    .warn-line ha-icon { --mdc-icon-size: 13px; }
    @container (max-width: 360px) {
      .header { padding: 14px 14px 12px; }
      .header-stats { padding: 8px 4px; }
    }
    /* Narrow pack (two columns, phone): values in a 2 x 2 grid. */
    @container (max-width: 300px) {
      .pack-vi { display: grid; grid-template-columns: 1fr auto; row-gap: 3px; }
      .pack-vi.away { display: flex; }
      .name { padding-right: 0; }
      .content { padding-top: 20px; }
    }
    `;
  }
}
