/**
 * ISDT BattAir Card – overview of all BattAir packs and plugins.
 *
 * Finds every isdt_air_ble device with BattAir entities (translation keys
 * "battair_*") and shows one compact line per pack: name, cells, capacity,
 * average cell voltage and charge level. Problems replace the sub line in
 * red, every active warning gets its own icon. Packs that are out of range
 * stay in the list with the time they were last heard.
 */

import { t } from "./translations.js";

export const BATTAIR_TAG = "isdt-battair-card";

const PREFIX = "battair_";

const SORTS = ["name", "charge", "last_seen"];

// Temperature outside this range counts as a problem (°C). The sensor reports
// in the unit set in Home Assistant, so °F is converted before comparing.
const TEMP_LOW = 5;
const TEMP_HIGH = 45;

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
        {
          name: "show_cycles",
          label: t(null, "battair_config_show_cycles"),
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
    return 2 + Math.max(1, this._packCount || 0);
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
        // as "4S 1300 mAh 88AD" in the list. Pack names from the advertisement
        // are cut to 16 characters, so "BattAi-3s-..." counts as well.
        label: (dev.name_by_user || dev.name || deviceId).replace(/^(BattAir?[\s-]+)+/i, "") ||
          dev.name || deviceId,
        plugin: (dev.model || "").toLowerCase().includes("plugin"),
        available,
        charge: num("battery"),
        voltage: num("voltage"),
        cell: num("cell_voltage_avg"),
        temperature: num("temperature"),
        temperatureUnit: st("temperature")?.attributes?.unit_of_measurement || "°C",
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
    const rank = (p) => (!p.available ? 2 : this._hasProblem(p) ? 0 : 1);
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

  /** Active warnings of a pack, problems (red) first. */
  _warnings(p) {
    if (!p.available) return [];
    const h = this._hass;
    const w = [];
    if (p.errorLog) {
      w.push({ cls: "error", icon: "mdi:alert-circle", text: t(h, "battair_error_log"), entity: p.ids.error_log });
    }
    if (p.lowCell) {
      w.push({
        cls: "error", icon: "mdi:battery-alert-variant-outline", entity: p.ids.cell_voltage_low,
        text: p.cell != null ? `${t(h, "battair_low_cell")} · ${this._fmt(p.cell, 2)} V` : t(h, "battair_low_cell"),
      });
    }
    const celsius = p.temperature == null ? null
      : p.temperatureUnit === "°F" ? (p.temperature - 32) * 5 / 9
      : p.temperature;
    if (celsius != null && (celsius < TEMP_LOW || celsius > TEMP_HIGH)) {
      w.push({
        cls: "error", icon: "mdi:thermometer-alert", entity: p.ids.temperature,
        text: `${t(h, "battair_temperature_alert")} · ${this._fmt(p.temperature, 0)} ${p.temperatureUnit}`,
      });
    }
    if (p.storage) {
      w.push({ cls: "info", icon: "mdi:battery-arrow-down-outline", text: t(h, "battair_storage"), entity: p.ids.storage_discharge });
    }
    if (p.transport) {
      w.push({ cls: "muted", icon: "mdi:truck-outline", text: t(h, "battair_transport"), entity: p.ids.transport_mode });
    }
    return w;
  }

  _hasProblem(p) {
    return this._warnings(p).some((w) => w.cls === "error");
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
    const warnings = online.filter((p) => this._hasProblem(p)).length;
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
    const warn = this._warnings(p);
    const errors = warn.filter((w) => w.cls === "error");
    const color = p.available ? this._color(p.charge) : null;
    const pct = color ? Math.max(3, Math.min(100, p.charge)) : 0;

    let sub;
    if (!p.available) {
      sub = `<div class="sub" data-entity="${p.ids.last_seen || ""}">${t(h, "battair_last_seen")} ${esc(this._ago(p.lastSeen))}</div>`;
    } else if (errors.length) {
      sub = `<div class="sub err" data-entity="${errors[0].entity || ""}">${esc(errors.map((w) => w.text).join(" · "))}</div>`;
    } else {
      const spec = [];
      if (p.cells != null) spec.push(`${p.cells}S`);
      if (p.capacity != null) spec.push(`${Math.round(p.capacity)} mAh`);
      if (p.cell != null) spec.push(`Ø ${this._fmt(p.cell, 2)} V`);
      if (this._config.show_cycles && p.cycles != null) {
        spec.push(`${this._fmt(p.cycles, 0)} ${t(h, p.cycles === 1 ? "battair_cycle" : "battair_cycles")}`);
      }
      sub = `<div class="sub" data-entity="${p.ids.cell_voltage_avg || ""}">${esc(spec.join(" · "))}</div>`;
    }

    const icons = p.available
      ? warn.map((w) => `<ha-icon class="${w.cls}" icon="${w.icon}" title="${esc(w.text)}" data-entity="${w.entity || ""}"></ha-icon>`).join("")
      : `<ha-icon class="muted" icon="mdi:bluetooth-off" title="${esc(t(h, "battair_stat_away"))}" data-entity="${p.ids.last_seen || ""}"></ha-icon>`;

    const pctHTML = p.available && p.charge != null
      ? `${Math.round(p.charge)}<small>%</small>`
      : `<span class="dash">–</span>`;

    return `
      <div class="line ${p.available ? "" : "off"} ${errors.length ? "problem" : ""}">
        <div class="who">
          <div class="name" title="${esc(p.name)}" data-entity="${p.ids.battery || ""}">${esc(p.label)}</div>
          ${sub}
        </div>
        <div class="bar" data-entity="${p.ids.battery || ""}"><div class="bar-fill" style="width:${pct}%;${color ? `background:${color.fill}` : ""}"></div></div>
        <div class="pct" data-entity="${p.ids.battery || ""}">${pctHTML}</div>
        <div class="icons">${icons}</div>
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

    /* Pack list: one compact line per pack */
    .list { padding: 4px 0 8px; }
    .empty { padding: 12px 20px; color: var(--secondary-text-color); font-size: 14px; }
    .line {
      display: grid; grid-template-columns: minmax(0, 1fr) 26% 44px 40px;
      align-items: center; gap: 10px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }
    .line:last-child { border-bottom: none; }
    .line.off { opacity: 0.5; }
    [data-entity]:not([data-entity=""]) { cursor: pointer; }
    .who { min-width: 0; }
    .name {
      font-size: 13px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .sub {
      font-size: 11px; color: var(--secondary-text-color); font-variant-numeric: tabular-nums;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .sub.err { color: var(--isdt-error); font-weight: 600; }
    .bar {
      height: 8px; border-radius: 4px 2px 2px 4px; overflow: hidden;
      background: var(--secondary-background-color, rgba(0,0,0,0.06));
    }
    .bar-fill { height: 100%; transition: width 1.2s cubic-bezier(0.22, 1, 0.36, 1); }
    .pct { text-align: right; font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .pct small { font-size: 10px; font-weight: 500; color: var(--secondary-text-color); }
    .pct .dash { color: var(--disabled-text-color, #bdbdbd); }
    .icons { display: flex; justify-content: flex-end; gap: 2px; }
    .icons ha-icon { --mdc-icon-size: 18px; }
    .icons .error { color: var(--isdt-error); }
    .icons .info { color: var(--isdt-done); }
    .icons .muted { color: var(--secondary-text-color); }
    @container (max-width: 360px) {
      .header { padding: 14px 14px 12px; }
      .header-stats { padding: 8px 4px; }
      .line { grid-template-columns: minmax(0, 1fr) 18% 40px 40px; gap: 8px; padding: 8px 12px; }
    }
    `;
  }
}
