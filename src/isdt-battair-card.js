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
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
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

  _level(charge) {
    if (charge == null) return "none";
    if (charge <= 15) return "low";
    if (charge <= 40) return "mid";
    return "high";
  }

  /* ── Render ─────────────────────────────────────────── */

  _render() {
    if (!this._hass) return;
    let packs = this._findPacks(this._hass);
    const total = packs.length;
    if (this._config.hide_unavailable) packs = packs.filter((p) => p.available);
    packs = this._sortPacks(packs);
    this._packCount = packs.length;

    const key = JSON.stringify([this._config, this._lang(), total, packs]);
    if (key === this._lastKey) return;
    this._lastKey = key;

    const h = this._hass;
    const warnings = packs.filter((p) => p.available && (p.lowCell || p.errorLog)).length;
    const away = packs.filter((p) => !p.available).length;
    const title = this._config.title || "BattAir";

    const chips = [`<span class="chip">${total} ${t(h, total === 1 ? "battair_pack" : "battair_packs")}</span>`];
    if (warnings) chips.push(`<span class="chip warn"><ha-icon icon="mdi:alert"></ha-icon>${warnings}</span>`);
    if (away) chips.push(`<span class="chip away"><ha-icon icon="mdi:bluetooth-off"></ha-icon>${away}</span>`);

    const rows = packs.length
      ? packs.map((p) => this._row(p)).join("")
      : `<div class="empty">${t(h, total ? "battair_all_hidden" : "battair_empty")}</div>`;

    this.shadowRoot.innerHTML = `
      <style>${this._css()}</style>
      <ha-card>
        <div class="header">
          <div class="title">${esc(title)}</div>
          <div class="chips">${chips.join("")}</div>
        </div>
        <div class="list">${rows}</div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-entity]").forEach((el) => {
      el.addEventListener("click", () => {
        const ev = new Event("hass-more-info", { bubbles: true, composed: true });
        ev.detail = { entityId: el.dataset.entity };
        this.dispatchEvent(ev);
      });
    });
  }

  _row(p) {
    const h = this._hass;
    const spec = [];
    if (p.cells != null) spec.push(`${p.cells}S`);
    if (p.type) spec.push(BATTERY_TYPE_LABELS[p.type] || p.type);
    if (p.capacity != null) spec.push(`${Math.round(p.capacity)} mAh`);
    if (p.plugin) spec.push(t(h, "battair_plugin"));

    const badges = [];
    if (p.errorLog) badges.push(`<span class="badge bad" data-entity="${p.ids.error_log}"><ha-icon icon="mdi:alert-circle"></ha-icon>${t(h, "battair_error_log")}</span>`);
    if (p.lowCell) badges.push(`<span class="badge bad" data-entity="${p.ids.cell_voltage_low}"><ha-icon icon="mdi:battery-alert-variant-outline"></ha-icon>${t(h, "battair_low_cell")}</span>`);
    if (p.available && p.storage) badges.push(`<span class="badge info" data-entity="${p.ids.storage_discharge}"><ha-icon icon="mdi:battery-arrow-down-outline"></ha-icon>${t(h, "battair_storage")}</span>`);
    if (p.available && p.transport) badges.push(`<span class="badge" data-entity="${p.ids.transport_mode}"><ha-icon icon="mdi:truck-outline"></ha-icon>${t(h, "battair_transport")}</span>`);
    if (!p.available) badges.push(`<span class="badge away" data-entity="${p.ids.last_seen || ""}"><ha-icon icon="mdi:bluetooth-off"></ha-icon>${t(h, "battair_last_seen")} ${esc(this._ago(p.lastSeen))}</span>`);

    const level = p.available ? this._level(p.charge) : "none";
    const pct = p.available && p.charge != null ? Math.max(0, Math.min(100, p.charge)) : 0;
    const chargeText = p.available && p.charge != null ? `${Math.round(p.charge)} %` : "—";

    const metric = (value, unit, label) =>
      `<div class="m"><span class="mv">${value}<small>${unit}</small></span><span class="ml">${label}</span></div>`;
    const metrics = p.available
      ? [
          metric(this._fmt(p.voltage, 2), "V", t(h, "battair_voltage")),
          metric(this._fmt(p.cell, 3), "V", t(h, "battair_per_cell")),
          metric(this._fmt(p.temperature, 0), "°C", t(h, "battair_temperature")),
          metric(this._fmt(p.cycles, 0), "", t(h, "battair_cycles")),
        ].join("")
      : "";

    return `
      <div class="row ${p.available ? "" : "off"} ${p.lowCell || p.errorLog ? "problem" : ""}" >
        <div class="top" data-entity="${p.ids.battery || ""}">
          <ha-icon class="pack-icon ${level}" icon="${p.plugin ? "mdi:power-plug-battery-outline" : "mdi:battery-outline"}"></ha-icon>
          <div class="ident">
            <div class="name">${esc(p.name)}</div>
            <div class="spec">${esc(spec.join(" · ")) || "&nbsp;"}</div>
          </div>
          <div class="charge ${level}">${chargeText}</div>
        </div>
        <div class="bar"><div class="fill ${level}" style="width:${pct}%"></div></div>
        ${metrics ? `<div class="metrics">${metrics}</div>` : ""}
        ${badges.length ? `<div class="badges">${badges.join("")}</div>` : ""}
      </div>`;
  }

  _css() {
    return `
    ha-card {
      overflow: hidden;
      container-type: inline-size;
    }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 16px 16px 8px;
    }
    .title {
      font-size: 16px; font-weight: 700; color: var(--primary-text-color);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .chips { display: flex; gap: 6px; flex-shrink: 0; }
    .chip {
      display: inline-flex; align-items: center; gap: 3px;
      font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 12px;
      background: var(--secondary-background-color, rgba(0,0,0,0.05));
      color: var(--secondary-text-color);
    }
    .chip ha-icon { --mdc-icon-size: 14px; }
    .chip.warn { color: var(--error-color, #db4437); }
    .list { display: flex; flex-direction: column; gap: 8px; padding: 8px 12px 12px; }
    .empty { padding: 12px 4px; color: var(--secondary-text-color); font-size: 14px; }
    .row {
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 12px; padding: 10px 12px;
    }
    .row.problem { border-color: var(--error-color, #db4437); }
    .row.off .top, .row.off .bar { opacity: 0.45; }
    .top { display: flex; align-items: center; gap: 10px; cursor: pointer; }
    .pack-icon { --mdc-icon-size: 26px; color: var(--secondary-text-color); flex-shrink: 0; }
    .pack-icon.high { color: var(--success-color, #43a047); }
    .pack-icon.mid { color: var(--warning-color, #ffa600); }
    .pack-icon.low { color: var(--error-color, #db4437); }
    .ident { flex: 1; min-width: 0; }
    .name {
      font-size: 14px; font-weight: 600; color: var(--primary-text-color);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .spec { font-size: 12px; color: var(--secondary-text-color); margin-top: 1px; }
    .charge {
      font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums;
      color: var(--primary-text-color);
    }
    .charge.low { color: var(--error-color, #db4437); }
    .bar {
      height: 6px; border-radius: 3px; margin: 8px 0 2px;
      background: var(--secondary-background-color, rgba(0,0,0,0.06));
      overflow: hidden;
    }
    .fill { height: 100%; border-radius: 3px; transition: width 0.4s; }
    .fill.high { background: var(--success-color, #43a047); }
    .fill.mid { background: var(--warning-color, #ffa600); }
    .fill.low { background: var(--error-color, #db4437); }
    .metrics {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 8px;
    }
    .m { display: flex; flex-direction: column; min-width: 0; }
    .mv {
      font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums;
      color: var(--primary-text-color); white-space: nowrap;
    }
    .mv small { font-size: 11px; font-weight: 400; margin-left: 2px; color: var(--secondary-text-color); }
    .ml {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px;
      color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .badge {
      display: inline-flex; align-items: center; gap: 4px; cursor: pointer;
      font-size: 12px; font-weight: 500; padding: 3px 8px; border-radius: 10px;
      background: var(--secondary-background-color, rgba(0,0,0,0.05));
      color: var(--secondary-text-color);
    }
    .badge ha-icon { --mdc-icon-size: 15px; }
    .badge.bad {
      color: var(--error-color, #db4437);
      background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent);
    }
    .badge.info { color: var(--info-color, #039be5); }
    @container (max-width: 330px) {
      .metrics { grid-template-columns: repeat(2, 1fr); row-gap: 6px; }
    }
    `;
  }
}
