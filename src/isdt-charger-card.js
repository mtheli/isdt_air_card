/**
 * ISDT Charger Card v0.2.0 – Device-based, Battery Style, HA Theme-Aware
 * Custom Lovelace Card for Home Assistant
 *
 * Selects a device from the isdt_air_ble integration and dynamically
 * discovers all entities via translation_key and sub-device mapping.
 */

import { t } from './translations.js';

export const CARD_VERSION = "0.4.0";

export class ISDTChargerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
    this._entities = null;
    this._timeInterval = null;
    this._lastSlotKey = null;
  }

  static getConfigForm() {
    return {
      schema: [
        {
          name: "device_id",
          required: true,
          selector: {
            device: {
              filter: {
                integration: "isdt_air_ble",
                entity: [{ domain: "switch" }],
              },
              multiple: false,
            },
          },
        },
        {
          name: "title",
          label: t(null, "config_title"),
          selector: { text: {} },
        },
        {
          name: "show_model",
          label: t(null, "config_show_model"),
          selector: { boolean: {} },
          default: true,
        },
        {
          name: "show_header",
          label: t(null, "config_show_header"),
          selector: { boolean: {} },
        },
      ],
    };
  }

  static getStubConfig(hass) {
    const entry = Object.values(hass.entities).find(
      (e) => e.platform === "isdt_air_ble" && e.translation_key === "connected"
    );
    return { device_id: entry ? entry.device_id : "" };
  }

  setConfig(config) {
    this._isPreview = !config.device_id;
    if (!this._isPreview) {
      this._config = { show_header: config.show_header !== false, ...config };
      if (this._hass) {
        this._entities = this._findEntities(this._hass, config.device_id);
      }
    } else {
      this._config = { show_header: true, ...config };
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._isPreview && this._config?.device_id && !this._entities) {
      this._entities = this._findEntities(hass, this._config.device_id);
    }
    this._render();
  }

  /* ── Entity discovery ───────────────────────────────── */

  _findEntities(hass, deviceId) {
    const main = {
      input_voltage: null,
      input_current: null,
      total_charging_current: null,
      connected: null,
      beep: null,
    };
    const slots = {};

    // Find slot sub-devices (via_device_id === main device)
    const slotDeviceMap = {}; // { subDeviceId: slotNumber }
    for (const [devId, device] of Object.entries(hass.devices || {})) {
      if (device.via_device_id === deviceId) {
        const match = device.name.match(/Slot\s+(\d+)/i);
        if (match) {
          slotDeviceMap[devId] = parseInt(match[1]);
        }
      }
    }

    // Map entities by translation_key
    for (const [entityId, entity] of Object.entries(hass.entities || {})) {
      const tk = entity.translation_key;

      if (entity.device_id === deviceId) {
        // Main device
        switch (tk) {
          case "input_voltage":          main.input_voltage = entityId; break;
          case "input_current":          main.input_current = entityId; break;
          case "total_charging_current": main.total_charging_current = entityId; break;
          case "connected":              main.connected = entityId; break;
          case "beep":                   main.beep = entityId; break;
          case "status": {
            // One status sensor per slot — differentiate via entity_id (…_slot_N_status)
            const m = entityId.match(/_slot_(\d+)_status/);
            if (m) {
              const slotNum = parseInt(m[1]);
              if (!slots[slotNum]) slots[slotNum] = {};
              slots[slotNum].status = entityId;
            }
            break;
          }
        }
        // Fallback: main-device entities via device_class
        const state = hass.states[entityId];
        const dc = state?.attributes?.device_class;
        if (dc && entity.device_id === deviceId) {
          if (!main.input_voltage && dc === "voltage") main.input_voltage = entityId;
          if (!main.input_current && dc === "current") main.input_current = entityId;
        }
      } else if (entity.device_id in slotDeviceMap) {
        // Slot sub-device
        const slotNum = slotDeviceMap[entity.device_id];
        if (!slots[slotNum]) slots[slotNum] = {};
        switch (tk) {
          case "output_voltage":   slots[slotNum].output_voltage = entityId; break;
          case "charging_current": slots[slotNum].charging_current = entityId; break;
          case "capacity":         slots[slotNum].capacity = entityId; break;
          case "capacity_done":    slots[slotNum].capacity_done = entityId; break;
          case "energy_done":      slots[slotNum].energy_done = entityId; break;
          case "charge_time":      slots[slotNum].charge_time = entityId; break;
          case "battery_type":     slots[slotNum].battery_type = entityId; break;
        }
        // Fallback: slot entities via device_class
        const slotState = hass.states[entityId];
        const slotDc = slotState?.attributes?.device_class;
        if (slotDc) {
          if (!slots[slotNum].output_voltage && slotDc === "voltage") slots[slotNum].output_voltage = entityId;
          if (!slots[slotNum].charging_current && slotDc === "current") slots[slotNum].charging_current = entityId;
        }
      }
    }

    return { main, slots };
  }

  _t(key) { return t(this._hass, key); }

  /* ── Entity state helpers ───────────────────────────── */

  _st(eid, fb) {
    if (!eid || !this._hass?.states[eid]) return fb ?? "unavailable";
    const s = this._hass.states[eid].state;
    return s === "unknown" || s === "unavailable" ? (fb ?? s) : s;
  }

  _num(eid, fb = 0) {
    const v = parseFloat(this._st(eid, null));
    return isNaN(v) ? fb : v;
  }

  /* ── Render ─────────────────────────────────────────── */

  _render() {
    if (!this._hass || !this._config) return;

    if (this._isPreview) {
      this._renderPreview();
      return;
    }

    if (!this._entities) {
      this._entities = this._findEntities(this._hass, this._config.device_id);
    }

    if (!this._entities || !this._config.device_id) {
      const root = this.shadowRoot;
      root.innerHTML = "";
      const style = document.createElement("style");
      style.textContent = this._css();
      root.appendChild(style);
      const card = document.createElement("ha-card");
      card.innerHTML = `<div class="unavailable">${this._t("error_no_device")}</div>`;
      root.appendChild(card);
      return;
    }

    // Compute structural key: visible slots + their statuses
    const use56 = [5, 6].some((n) => {
      const s = this._entities.slots[n];
      return s && this._st(s.status, "empty") !== "empty";
    });
    const visibleSlots = use56 ? [5, 6] : [1, 2, 3, 4];
    const slotKey = visibleSlots.map((n) => {
      const s = this._entities.slots[n];
      const status = this._st(s?.status, "empty");
      return `${n}:${status}`;
    }).join("|");

    const needsFull = this._lastSlotKey !== slotKey
      || !this.shadowRoot.querySelector(".isdt-card");
    this._lastSlotKey = slotKey;

    if (needsFull) {
      const root = this.shadowRoot;
      root.innerHTML = "";

      const style = document.createElement("style");
      style.textContent = this._css();
      root.appendChild(style);

      const card = document.createElement("ha-card");
      card.innerHTML = this._html();
      root.appendChild(card);
      this._bind(card);
    } else {
      this._updateDynamic();
    }
  }

  _renderPreview() {
    const root = this.shadowRoot;
    root.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = this._css();
    root.appendChild(style);

    const card = document.createElement("ha-card");
    const demos = [
      { slot: 1, status: "charging", pct: 62, vol: 1.38, cur: 0.500, mah: 1240, wh: 1.71, type: "NiMH" },
      { slot: 2, status: "done",     pct: 100, vol: 1.47, cur: 0, mah: 1950, wh: 2.87, type: "NiMH" },
      { slot: 3, status: "charging", pct: 28, vol: 3.92, cur: 1.000, mah: 870, wh: 3.41, type: "LiIon" },
      { slot: 4, status: "empty" },
    ];

    let h = '<div class="isdt-card">';
    h += `
      <div class="header">
        <div class="header-top">
          <div class="header-title">
            <span class="isdt-logo">ISDT</span>
            <span class="model-name">C4 Air</span>
          </div>
          <div class="header-icons">
            <svg class="conn-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"
                 title="${this._t("tooltip_connected")}">
              <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
            </svg>
            <button class="beep-btn on">
              <ha-icon icon="mdi:volume-high"></ha-icon>
            </button>
            <svg class="more-info-btn" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <circle cx="12" cy="5" r="1.5"/>
              <circle cx="12" cy="12" r="1.5"/>
              <circle cx="12" cy="19" r="1.5"/>
            </svg>
          </div>
        </div>
        <div class="header-stats">
          <div class="stat"><span class="stat-value">5.1<small>V</small></span><span class="stat-label">${this._t("header_input")}</span></div>
          <div class="stat-div"></div>
          <div class="stat"><span class="stat-value">1.50<small>A</small></span><span class="stat-label">${this._t("header_current")}</span></div>
          <div class="stat-div"></div>
          <div class="stat"><span class="stat-value">7.7<small>W</small></span><span class="stat-label">${this._t("header_power")}</span></div>
          <div class="stat-div"></div>
          <div class="stat"><span class="stat-value">1.50<small>A</small></span><span class="stat-label">${this._t("header_total_charge")}</span></div>
        </div>
      </div>`;
    h += '<div class="battery-grid">';

    for (const d of demos) {
      const isEmpty = d.status === "empty";
      const isCharging = d.status === "charging";
      const isActive = isCharging || d.status === "done";
      const pct = d.pct || 0;
      const fillH = isEmpty ? 0 : Math.max(4, pct);
      const color = isCharging ? this._chargeColor(pct) : null;
      const fillStyle = `width:${fillH}%${color ? `;background:linear-gradient(90deg,${color.deep},${color.fill})` : ""}`;
      const terminalStyle = color ? `background:${color.fill};box-shadow:0 0 8px ${color.glow}` : "";
      const bodyStyle = color ? `border-color:${color.glow};box-shadow:0 0 16px ${color.shadow}` : "";
      const accentColor = color?.fill ?? null;
      const badgeStyle = accentColor ? `style="color:${accentColor}"` : "";

      let center = "";
      if (isEmpty) {
        center = '<ha-icon icon="mdi:battery-off-outline" class="empty-icon-lg"></ha-icon>';
      } else {
        const pctStyle = accentColor ? `style="color:#fff;text-shadow:0 1px 6px rgba(0,0,0,0.35)"` : "";
        const symStyle = accentColor ? `style="color:rgba(255,255,255,0.75)"` : "";
        const boltStyle = accentColor ? `style="color:#fff"` : "";
        center = `<div class="battery-pct">
          <span class="pct-num" ${pctStyle}>${pct}</span><span class="pct-sym" ${symStyle}>%</span>${isCharging ? `<ha-icon icon="mdi:lightning-bolt" class="charging-bolt" ${boltStyle}></ha-icon>` : ""}
        </div>`;
      }

      h += `
        <div class="battery-slot ${d.status}" data-slot="${d.slot}">
          <div class="battery-shell">
            <div class="battery-body" ${bodyStyle ? `style="${bodyStyle}"` : ""}>
              <div class="battery-fill" style="${fillStyle}"></div>
              <div class="battery-content">
                <span class="slot-badge">${d.slot}</span>
                <span class="status-badge ${d.status}" ${badgeStyle}>${this._t("status_" + d.status)}</span>
                ${center}
              </div>
            </div>
            <div class="battery-terminal" ${terminalStyle ? `style="${terminalStyle}"` : ""}></div>
          </div>
          ${!isEmpty ? `<div class="battery-info">
            <div class="info-row"><span class="lbl"><ha-icon icon="mdi:flash"></ha-icon>${this._t("info_volt")}</span><span class="val">${d.vol.toFixed(2)} V</span></div>
            <div class="info-row"><span class="lbl"><ha-icon icon="mdi:current-dc"></ha-icon>${this._t("info_amp")}</span><span class="val">${d.cur.toFixed(3)} A</span></div>
            <div class="info-row"><span class="lbl"><ha-icon icon="mdi:timer-outline"></ha-icon>${this._t("info_time")}</span><span class="val">00:42:15</span></div>
            <div class="info-row"><span class="lbl"><ha-icon icon="mdi:atom"></ha-icon>${this._t("info_type")}</span><span class="val">${d.type}</span></div>
            ${isActive ? `<div class="info-sep"></div><div class="info-sub"><span>${d.mah} mAh</span><span>${d.wh.toFixed(2)} Wh</span></div>` : ""}
          </div>` : ""}
        </div>`;
    }

    h += "</div></div>";
    card.innerHTML = h;
    root.appendChild(card);
  }

  _html() {
    const { show_header } = this._config;
    const device = this._hass.devices[this._config.device_id];
    const customTitle = this._config.title;
    const model = (device?.model || device?.name || "ISDT Charger").replace(/^ISDT\s+/i, "");
    const title = customTitle || model;

    // Determine mode: show slots 5+6 if any of them is non-empty, else slots 1–4
    const use56 = [5, 6].some((n) => {
      const s = this._entities.slots[n];
      return s && this._st(s.status, "empty") !== "empty";
    });
    const visibleSlots = use56 ? [5, 6] : [1, 2, 3, 4];

    let h = '<div class="isdt-card">';
    if (show_header) h += this._headerHTML(title);
    h += '<div class="battery-grid">';
    for (const slot of visibleSlots) h += this._slotHTML(slot);
    h += "</div></div>";
    return h;
  }

  _updateDynamic() {
    const root = this.shadowRoot;
    if (!root) return;

    // Update header stats
    const { main } = this._entities;
    const iV = this._num(main.input_voltage);
    const iA = this._num(main.input_current);
    const tA = this._num(main.total_charging_current);
    const iW = (iV * iA).toFixed(1);

    this._setField(root, "input-v", `${iV.toFixed(1)}<small>V</small>`);
    this._setField(root, "input-a", `${iA.toFixed(2)}<small>A</small>`);
    this._setField(root, "input-w", `${iW}<small>W</small>`);
    this._setField(root, "total-a", `${tA.toFixed(2)}<small>A</small>`);

    // Update connection icon
    const connected = this._st(main.connected, "off") === "on";
    const connIcon = root.querySelector(".conn-icon");
    if (connIcon) {
      connIcon.classList.toggle("disconnected", !connected);
      connIcon.setAttribute("title", this._t(connected ? "tooltip_connected" : "tooltip_disconnected"));
    }

    // Update beep button
    const beep = this._st(main.beep, "off") === "on";
    const beepBtn = root.querySelector(".beep-btn");
    if (beepBtn) {
      beepBtn.className = `beep-btn ${beep ? "on" : ""}`;
      const icon = beepBtn.querySelector("ha-icon");
      if (icon) icon.setAttribute("icon", beep ? "mdi:volume-high" : "mdi:volume-off");
    }

    // Update each slot
    const use56 = [5, 6].some((n) => {
      const s = this._entities.slots[n];
      return s && this._st(s.status, "empty") !== "empty";
    });
    const visibleSlots = use56 ? [5, 6] : [1, 2, 3, 4];

    for (const slot of visibleSlots) {
      const slotEl = root.querySelector(`[data-slot="${slot}"]`);
      if (!slotEl) continue;

      const e = this._entities.slots[slot];
      const isCharging = this._st(e?.status, "empty") === "charging";
      const pct = this._num(e?.capacity, 0);
      const cur = this._num(e?.charging_current, 0);
      const vol = this._num(e?.output_voltage, 0);
      const btype = this._st(e?.battery_type, "–");
      const mah = this._num(e?.capacity_done, 0);
      const wh = this._num(e?.energy_done, 0);

      // Update fill width and colors
      const fillEl = slotEl.querySelector(".battery-fill");
      if (fillEl) {
        const status = this._st(e?.status, "empty");
        const fillH = status === "empty" ? 0 : Math.max(4, pct);
        const color = isCharging ? this._chargeColor(pct) : null;
        fillEl.style.width = `${fillH}%`;
        if (color) fillEl.style.background = `linear-gradient(90deg,${color.deep},${color.fill})`;
      }

      // Update terminal/body colors when charging
      if (isCharging) {
        const color = this._chargeColor(pct);
        const termEl = slotEl.querySelector(".battery-terminal");
        if (termEl) { termEl.style.background = color.fill; termEl.style.boxShadow = `0 0 8px ${color.glow}`; }
        const bodyEl = slotEl.querySelector(".battery-body");
        if (bodyEl) { bodyEl.style.borderColor = color.glow; bodyEl.style.boxShadow = `0 0 16px ${color.shadow}`; }
      }

      // Update percentage text
      const pctNum = slotEl.querySelector(".pct-num");
      if (pctNum) pctNum.textContent = Math.round(pct);

      // Update info row values
      const vals = slotEl.querySelectorAll(".info-row .val");
      if (vals.length >= 4) {
        vals[0].textContent = `${vol.toFixed(2)} V`;
        vals[1].textContent = `${cur.toFixed(3)} A`;
        // vals[2] is time-val — updated by the timer interval
        vals[3].textContent = btype !== "unavailable" ? btype : "–";
      }

      // Update mAh/Wh sub-row
      const subs = slotEl.querySelectorAll(".info-sub span");
      if (subs.length >= 2) {
        subs[0].textContent = `${mah.toFixed(0)} mAh`;
        subs[1].textContent = `${wh.toFixed(2)} Wh`;
      }
    }
  }

  _setField(root, name, html) {
    const el = root.querySelector(`[data-field="${name}"]`);
    if (el) el.innerHTML = html;
  }

  _navigateToDevice() {
    const deviceId = this._config?.device_id;
    if (!deviceId) return;
    const path = `/config/devices/device/${deviceId}`;
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  _headerHTML(title) {
    const { main } = this._entities;
    const device = this._hass.devices[this._config.device_id];
    const customTitle = this._config.title;
    const model = (device?.model || device?.name || "").replace(/^ISDT\s+/i, "");
    const showModel = this._config.show_model !== false;
    const iV = this._num(main.input_voltage);
    const iA = this._num(main.input_current);
    const tA = this._num(main.total_charging_current);
    const iW = (iV * iA).toFixed(1);
    const beep = this._st(main.beep, "off") === "on";
    const connected = this._st(main.connected, "off") === "on";

    return `
      <div class="header">
        <div class="header-top">
          <div class="header-title">
            ${customTitle
              ? `<span class="title-text">${customTitle}</span>`
              : `<span class="isdt-logo">ISDT</span>`}
            ${showModel && model ? `<span class="model-name">${model}</span>` : ""}
          </div>
          <div class="header-icons">
            <svg class="conn-icon ${connected ? "" : "disconnected"}" viewBox="0 0 24 24" fill="currentColor" stroke="none"
                 data-entity="${main.connected || ""}"
                 title="${this._t(connected ? "tooltip_connected" : "tooltip_disconnected")}">
              <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
            </svg>
            <button class="beep-btn ${beep ? "on" : ""}" data-entity="${main.beep || ""}">
              <ha-icon icon="mdi:${beep ? "volume-high" : "volume-off"}"></ha-icon>
            </button>
            <svg class="more-info-btn" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <circle cx="12" cy="5" r="1.5"/>
              <circle cx="12" cy="12" r="1.5"/>
              <circle cx="12" cy="19" r="1.5"/>
            </svg>
          </div>
        </div>
        <div class="header-stats">
          <div class="stat"><span class="stat-value" data-field="input-v">${iV.toFixed(1)}<small>V</small></span><span class="stat-label">${this._t("header_input")}</span></div>
          <div class="stat-div"></div>
          <div class="stat"><span class="stat-value" data-field="input-a">${iA.toFixed(2)}<small>A</small></span><span class="stat-label">${this._t("header_current")}</span></div>
          <div class="stat-div"></div>
          <div class="stat"><span class="stat-value" data-field="input-w">${iW}<small>W</small></span><span class="stat-label">${this._t("header_power")}</span></div>
          <div class="stat-div"></div>
          <div class="stat"><span class="stat-value" data-field="total-a">${tA.toFixed(2)}<small>A</small></span><span class="stat-label">${this._t("header_total_charge")}</span></div>
        </div>
      </div>`;
  }

  _chargeColor(pct) {
    // Thresholds from ISDT Link app (PublicUIHandling.setProgress)
    if (pct <= 20) return { fill: "#ff5555", deep: "#cc2222", glow: "rgba(255,85,85,0.45)",   shadow: "rgba(255,85,85,0.12)" };
    if (pct <  75) return { fill: "#ff9955", deep: "#cc6622", glow: "rgba(255,153,85,0.45)",  shadow: "rgba(255,153,85,0.12)" };
    if (pct <  90) return { fill: "#aad400", deep: "#779200", glow: "rgba(170,212,0,0.45)",   shadow: "rgba(170,212,0,0.12)" };
    return               { fill: "#37c871", deep: "#1a8a4a", glow: "rgba(55,200,113,0.45)",  shadow: "rgba(55,200,113,0.12)" };
  }

  _slotHTML(slot) {
    const e = this._entities.slots[slot];
    const status = this._st(e?.status, "empty");
    const isEmpty = status === "empty";
    const isCharging = status === "charging";
    const isActive = isCharging || status === "done";

    const pct = this._num(e?.capacity, 0);
    const cur = this._num(e?.charging_current, 0);
    const vol = this._num(e?.output_voltage, 0);
    const btype = this._st(e?.battery_type, "–");
    const mah = this._num(e?.capacity_done, 0);
    const wh = this._num(e?.energy_done, 0);

    const since = this._st(e?.charge_time, null);
    let timeStr = "–";
    if (since && !["unavailable", "unknown", "–"].includes(since)) {
      const d = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
      const hh = String(Math.floor(d / 3600)).padStart(2, "0");
      const mm = String(Math.floor((d % 3600) / 60)).padStart(2, "0");
      const ss = String(d % 60).padStart(2, "0");
      timeStr = `${hh}:${mm}:${ss}`;
    }

    const fillH = isEmpty ? 0 : Math.max(4, pct);

    // Hybrid color: when charging, fill color reflects charge level
    const color = isCharging ? this._chargeColor(pct) : null;
    const fillStyle = `width:${fillH}%${color ? `;background:linear-gradient(90deg,${color.deep},${color.fill})` : ""}`;
    const terminalStyle = color ? `background:${color.fill};box-shadow:0 0 8px ${color.glow}` : "";
    const bodyStyle = color ? `border-color:${color.glow};box-shadow:0 0 16px ${color.shadow}` : "";

    let bubbles = "";
    for (let i = 0; i < 6; i++) {
      const t = 10 + Math.random() * 80;
      const dur = 2.5 + Math.random() * 3;
      const del = Math.random() * 3;
      const sz = 2 + Math.random() * 2;
      bubbles += `<div class="bubble" style="left:3%;top:${t}%;width:${sz}px;height:${sz}px;animation-duration:${dur}s;animation-delay:${del}s"></div>`;
    }

    const accentColor = color?.fill ?? null;

    let center = "";
    if (isEmpty) {
      center = '<ha-icon icon="mdi:battery-off-outline" class="empty-icon-lg"></ha-icon>';
    } else if (status === "error") {
      center = `
        <ha-icon icon="mdi:alert-circle" class="error-icon-lg"></ha-icon>
        <div class="battery-pct"><span class="pct-num sm">${Math.round(pct)}</span><span class="pct-sym">%</span></div>`;
    } else {
      const pctStyle = accentColor ? `style="color:#fff;text-shadow:0 1px 6px rgba(0,0,0,0.35)"` : "";
      const symStyle = accentColor ? `style="color:rgba(255,255,255,0.75)"` : "";
      const boltStyle = accentColor ? `style="color:#fff"` : "";
      center = `
        <div class="battery-pct">
          <span class="pct-num" ${pctStyle}>${Math.round(pct)}</span><span class="pct-sym" ${symStyle}>%</span>${isCharging ? `<ha-icon icon="mdi:lightning-bolt" class="charging-bolt" ${boltStyle}></ha-icon>` : ""}
        </div>`;
    }

    const badgeStyle = accentColor ? `style="color:${accentColor}"` : "";

    return `
      <div class="battery-slot ${status}" data-slot="${slot}">
        <div class="battery-shell">
          <div class="battery-body" data-entity="${e?.capacity || ""}" ${bodyStyle ? `style="${bodyStyle}"` : ""}>
            <div class="battery-fill" style="${fillStyle}">
              <div class="battery-fill-wave"></div>
              <div class="battery-bubbles">${bubbles}</div>
            </div>
            <div class="battery-content">
              <span class="slot-badge">${slot}</span>
              <span class="status-badge ${status}" data-entity="${e?.status || ""}" ${badgeStyle}>${this._t("status_" + status)}</span>
              ${center}
            </div>
          </div>
          <div class="battery-terminal" ${terminalStyle ? `style="${terminalStyle}"` : ""}></div>
        </div>
        <div class="battery-info ${isEmpty ? "hidden" : ""}">
          <div class="info-row" data-entity="${e?.output_voltage || ""}">
            <span class="lbl"><ha-icon icon="mdi:flash"></ha-icon>${this._t("info_volt")}</span>
            <span class="val">${vol.toFixed(2)} V</span>
          </div>
          <div class="info-row" data-entity="${e?.charging_current || ""}">
            <span class="lbl"><ha-icon icon="mdi:current-dc"></ha-icon>${this._t("info_amp")}</span>
            <span class="val">${cur.toFixed(3)} A</span>
          </div>
          <div class="info-row" data-entity="${e?.charge_time || ""}">
            <span class="lbl"><ha-icon icon="mdi:timer-outline"></ha-icon>${this._t("info_time")}</span>
            <span class="val time-val" ${isCharging ? `data-since="${since || ""}"` : ""}>${timeStr}</span>
          </div>
          <div class="info-row" data-entity="${e?.battery_type || ""}">
            <span class="lbl"><ha-icon icon="mdi:atom"></ha-icon>${this._t("info_type")}</span>
            <span class="val">${btype !== "unavailable" ? btype : "–"}</span>
          </div>
          ${isActive ? `
            <div class="info-sep"></div>
            <div class="info-sub">
              <span data-entity="${e?.capacity_done || ""}">${mah.toFixed(0)} mAh</span>
              <span data-entity="${e?.energy_done || ""}">${wh.toFixed(2)} Wh</span>
            </div>` : ""}
        </div>
      </div>`;
  }

  /* ── Events ─────────────────────────────────────────── */

  _bind(card) {
    const beepBtn = card.querySelector(".beep-btn");
    if (beepBtn?.dataset.entity) {
      beepBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._hass.callService("switch", "toggle", {
          entity_id: beepBtn.dataset.entity,
        });
      });
    }

    const moreBtn = card.querySelector(".more-info-btn");
    if (moreBtn) {
      moreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._navigateToDevice();
      });
    }

    card.querySelectorAll("[data-entity]").forEach((el) => {
      if (!el.dataset.entity) return;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const ev = new Event("hass-more-info", { bubbles: true, composed: true });
        ev.detail = { entityId: el.dataset.entity };
        this.dispatchEvent(ev);
      });
    });

    this._startTimers(card);
  }

  _startTimers(card) {
    if (this._timeInterval) clearInterval(this._timeInterval);
    this._timeInterval = setInterval(() => {
      card.querySelectorAll(".time-val").forEach((el) => {
        const s = el.dataset.since;
        if (!s) return;
        const d = Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 1000));
        el.textContent = `${String(Math.floor(d / 3600)).padStart(2, "0")}:${String(Math.floor((d % 3600) / 60)).padStart(2, "0")}:${String(d % 60).padStart(2, "0")}`;
      });
    }, 1000);
  }

  disconnectedCallback() {
    if (this._timeInterval) clearInterval(this._timeInterval);
  }

  getCardSize() {
    return 6;
  }

  /* ── Styles ─────────────────────────────────────────── */

  _css() {
    return `
    :host {
      --isdt-charging: #4caf50;
      --isdt-charging-deep: #2e7d32;
      --isdt-done: #42a5f5;
      --isdt-done-deep: #1565c0;
      --isdt-error: #ef5350;
      --isdt-error-deep: #c62828;
    }

    ha-card {
      background: var(--ha-card-background, var(--card-background-color, #fff));
      color: var(--primary-text-color, #212121);
      border-radius: var(--ha-card-border-radius, 12px);
      border: 1px solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
      overflow: hidden;
      container-type: inline-size;
      font-family: var(--paper-font-body1_-_font-family, -apple-system, 'Segoe UI', sans-serif);
    }

    .isdt-card { padding: 0; }

    /* ════════ Header ════════ */
    .header {
      padding: 18px 20px 14px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }
    .header-top {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px;
    }
    .header-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; overflow: hidden; }
    .header-icons { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .isdt-logo {
      font-weight: 800; font-size: 18px; letter-spacing: 2.5px;
      color: var(--primary-color, #03a9f4);
    }
    .title-text {
      font-weight: 700; font-size: 15px; letter-spacing: -0.01em;
      color: var(--primary-text-color);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .model-name {
      font-size: 13px; font-weight: 500;
      color: var(--secondary-text-color, #727272);
    }
    .conn-icon {
      width: 18px; height: 18px; flex-shrink: 0;
      color: var(--primary-color, #03a9f4);
      fill: currentColor; cursor: pointer;
      opacity: 1; transition: color 0.4s, opacity 0.4s;
    }
    .conn-icon.disconnected {
      color: var(--disabled-text-color, #9ca3af);
      opacity: 0.3;
    }
    .beep-btn {
      background: none; border: none; padding: 4px; cursor: pointer;
      color: var(--secondary-text-color); display: flex; align-items: center;
      opacity: 0.5; transition: opacity 0.2s, color 0.2s;
    }
    .beep-btn:hover { opacity: 1; }
    .beep-btn.on {
      color: var(--primary-color, #03a9f4);
      opacity: 0.85;
    }
    .beep-btn.on:hover { opacity: 1; }
    .beep-btn ha-icon { --mdc-icon-size: 20px; }
    .more-info-btn {
      width: 18px; height: 18px; cursor: pointer;
      opacity: 0.5; transition: opacity 0.2s;
      color: var(--secondary-text-color);
    }
    .more-info-btn:hover { opacity: 1; }
    .header-stats {
      display: flex; align-items: center; justify-content: space-between;
      background: var(--secondary-background-color, rgba(0,0,0,0.04));
      border-radius: 10px; padding: 10px 6px;
    }
    .stat { display: flex; flex-direction: column; align-items: center; flex: 1; }
    .stat-value {
      font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums;
      color: var(--primary-text-color); line-height: 1.2;
    }
    .stat-value small {
      font-size: 10px; font-weight: 400;
      color: var(--secondary-text-color); margin-left: 2px;
    }
    .stat-label {
      font-size: 9px; text-transform: uppercase; letter-spacing: 1px;
      color: var(--secondary-text-color); margin-top: 3px;
    }
    .stat-div { width: 1px; height: 24px; background: var(--divider-color); }

    /* ════════ Grid ════════ */
    .battery-grid {
      display: grid; grid-template-columns: repeat(2, 1fr);
      gap: 10px; padding: 12px;
    }

    /* ════════ Slot ════════ */
    .battery-slot {
      display: flex; flex-direction: column; align-items: stretch;
    }
    .battery-body { cursor: pointer; }

    .battery-shell {
      display: flex; flex-direction: row; align-items: center; width: 100%;
      transition: transform 0.2s;
    }
    .battery-slot:hover .battery-shell { transform: translateX(2px); }
    .battery-terminal {
      width: 7px; height: 40%; min-height: 22px; flex-shrink: 0;
      background: var(--divider-color, #e0e0e0);
      border-radius: 0 3px 3px 0;
      transition: background 0.4s, box-shadow 0.4s;
    }
    .battery-body {
      position: relative; flex: 1; height: 95px;
      background: var(--secondary-background-color, rgba(0,0,0,0.04));
      border: 2px solid var(--divider-color, #e0e0e0);
      border-radius: 10px 4px 4px 10px;
      overflow: hidden; transition: border-color 0.4s, box-shadow 0.4s;
    }
    .battery-fill {
      position: absolute; top: 0; left: 0; bottom: 0;
      transition: width 1.2s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .battery-fill::after {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(255,255,255,0.14) 0%, transparent 55%);
      pointer-events: none;
    }
    .battery-fill-wave { display: none; }
    .charging .battery-fill-wave { display: none; }

    .battery-bubbles {
      position: absolute; inset: 0; overflow: hidden;
      opacity: 0; pointer-events: none;
    }
    .charging .battery-bubbles { opacity: 1; }
    .bubble {
      position: absolute; border-radius: 50%;
      background: rgba(255,255,255,0.2);
      animation: rise linear infinite;
    }
    @keyframes rise {
      from { transform: translateX(0) scale(1); opacity: 0.5; }
      to   { transform: translateX(90px) scale(0.3); opacity: 0; }
    }

    /* charging body/terminal/fill colors are set via inline style (hybrid level-based scheme) */

    .done .battery-body      { border-color: rgba(66,165,245,0.4); box-shadow: 0 0 16px rgba(66,165,245,0.1); }
    .done .battery-terminal  { background: var(--isdt-done); box-shadow: 0 0 8px rgba(66,165,245,0.4); }
    .done .battery-fill      { background: linear-gradient(90deg, var(--isdt-done-deep), var(--isdt-done)); }

    .idle .battery-fill      { background: var(--divider-color, #e0e0e0); opacity: 0.5; }

    .error .battery-body     { border-color: rgba(239,83,80,0.45); box-shadow: 0 0 16px rgba(239,83,80,0.1); animation: err-b 2s ease-in-out infinite; }
    .error .battery-terminal { background: var(--isdt-error); box-shadow: 0 0 8px rgba(239,83,80,0.45); }
    .error .battery-fill     { background: linear-gradient(90deg, var(--isdt-error-deep), var(--isdt-error)); }
    @keyframes err-b {
      0%,100% { border-color: rgba(239,83,80,0.3); }
      50%     { border-color: rgba(239,83,80,0.6); }
    }

    .empty .battery-body     { border-color: var(--divider-color, #e0e0e0); opacity: 0.5; }
    .empty .battery-terminal { opacity: 0.4; }

    .battery-content {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; z-index: 2;
    }
    .slot-badge {
      position: absolute; top: 7px; left: 7px;
      font-size: 11px; font-weight: 700;
      color: var(--secondary-text-color);
      background: var(--card-background-color, rgba(255,255,255,0.85));
      width: 20px; height: 20px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .status-badge {
      position: absolute; top: 7px; right: 6px;
      font-size: 7.5px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 1.2px;
      padding: 2px 6px; border-radius: 3px;
      background: var(--card-background-color, rgba(255,255,255,0.85));
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      color: var(--secondary-text-color);
    }
    .status-badge.done     { color: var(--isdt-done); }
    .status-badge.error    { color: var(--isdt-error); }

    .battery-pct { display: flex; align-items: center; }
    .pct-num { font-size: 32px; font-weight: 800; line-height: 1; color: var(--primary-text-color); }
    .pct-num.sm { font-size: 24px; }
    .pct-sym { font-size: 13px; font-weight: 500; color: var(--secondary-text-color); margin-left: 1px; }

    .done .pct-num { color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,0.3); }
    .done .pct-sym { color: rgba(255,255,255,0.7); }

    .charging-bolt { --mdc-icon-size: 20px; margin-left: 3px; animation: bolt 1.2s ease-in-out infinite; }
    @keyframes bolt {
      0%,100% { opacity: 0.6; transform: scale(1);    filter: drop-shadow(0 0 0px currentColor); }
      50%     { opacity: 1;   transform: scale(1.3);  filter: drop-shadow(0 0 5px currentColor); }
    }

    .empty-icon-lg { --mdc-icon-size: 34px; color: var(--disabled-text-color, #bdbdbd); }
    .error-icon-lg { --mdc-icon-size: 22px; color: #fff; margin-bottom: 4px; }
    .error .pct-num { color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,0.3); }
    .error .pct-sym { color: rgba(255,255,255,0.7); }

    /* ════════ Info ════════ */
    .battery-info {
      width: 100%; margin-top: 8px;
      display: flex; flex-direction: column; gap: 1px; padding: 0 2px;
    }
    .battery-info.hidden { display: none; }
    .info-row {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 10.5px; color: var(--secondary-text-color); line-height: 1.7;
      cursor: pointer;
    }
    .info-row:hover { color: var(--primary-text-color); }
    .info-row .lbl { display: flex; align-items: center; gap: 5px; }
    .info-row .lbl ha-icon { --mdc-icon-size: 13px; opacity: 0.55; }
    .info-row .val {
      font-family: ui-monospace, 'Roboto Mono', monospace;
      font-variant-numeric: tabular-nums; font-size: 10.5px; font-weight: 500;
      color: var(--primary-text-color);
    }
    .info-sep { height: 1px; background: var(--divider-color, #e0e0e0); margin: 3px 0 2px; opacity: 0.6; }
    .info-sub {
      display: flex; justify-content: space-between;
      font-variant-numeric: tabular-nums; font-size: 9.5px;
      color: var(--secondary-text-color);
    }
    .info-sub span { cursor: pointer; }
    .info-sub span:hover { color: var(--primary-text-color); }
    .status-badge { cursor: pointer; }
    .status-badge:hover { filter: brightness(0.85); }

    /* ════════ Unavailable ════════ */
    .unavailable {
      padding: 32px 16px;
      text-align: center;
      color: var(--secondary-text-color);
      font-size: 14px;
    }

    /* ════════ Narrow card ════════ */
    @container (max-width: 350px) {
      .battery-info { display: none; }
      .header-stats { padding: 8px 4px; }
      .stat-value { font-size: 13px; }
      .stat-label { font-size: 8px; }
      .battery-grid { gap: 8px; padding: 8px; }
    }
    `;
  }
}
