/**
 * ISDT Charger Card v2.0 – Battery Style, HA Theme-Aware
 * Custom Lovelace Card for Home Assistant
 *
 * Uses HA CSS variables so the card automatically adapts to
 * any light or dark theme. Each slot is a battery shape with
 * liquid fill, wave animation, and status effects.
 */

export const CARD_VERSION = "2.0.0";

const STATUS_LABELS = {
  empty: "Empty", idle: "Idle", charging: "Charging", done: "Done", error: "Error",
};

export class ISDTChargerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
    this._timeInterval = null;
  }

  static getConfigElement() {
    return document.createElement("isdt-charger-card-editor");
  }

  static getStubConfig() {
    return { entity_prefix: "sensor.isdt_c4_air", title: "ISDT C4 Air", slots: 4 };
  }

  setConfig(config) {
    if (!config.entity_prefix) throw new Error("Please define entity_prefix");
    this._config = {
      title: config.title || "ISDT Charger",
      entity_prefix: config.entity_prefix,
      switch_prefix:
        config.switch_prefix ||
        config.entity_prefix.replace("sensor.", "switch."),
      slots: config.slots || 4,
      show_header: config.show_header !== false,
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  /* ── Entity helpers ─────────────────────────────────── */
  _st(eid, fb) {
    if (!this._hass?.states[eid]) return fb ?? "unavailable";
    const s = this._hass.states[eid].state;
    return s === "unknown" || s === "unavailable" ? (fb ?? s) : s;
  }
  _num(eid, fb = 0) {
    const v = parseFloat(this._st(eid, null));
    return isNaN(v) ? fb : v;
  }
  _slotE(sl, k) { return `${this._config.entity_prefix}_slot_${sl}_${k}`; }
  _mainE(k) { return `${this._config.entity_prefix}_${k}`; }
  _swE(k) { return `${this._config.switch_prefix}_${k}`; }
  _slotStatus(sl) { return this._st(this._mainE(`slot_${sl}_status`), "empty"); }

  /* ── Render ─────────────────────────────────────────── */
  _render() {
    if (!this._hass || !this._config) return;
    const root = this.shadowRoot;
    root.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = this._css();
    root.appendChild(style);

    const card = document.createElement("ha-card");
    card.innerHTML = this._html();
    root.appendChild(card);
    this._bind(card);
  }

  _html() {
    const { show_header, slots, title } = this._config;
    let h = '<div class="isdt-card">';
    if (show_header) h += this._headerHTML(title);
    h += '<div class="battery-grid">';
    for (let i = 1; i <= slots; i++) h += this._slotHTML(i);
    h += "</div></div>";
    return h;
  }

  _headerHTML(title) {
    const iV = this._num(this._mainE("input_voltage"));
    const iA = this._num(this._mainE("input_current"));
    const tA = this._num(this._mainE("total_charging_current"));
    const iW = (iV * iA).toFixed(1);
    const beep = this._st(this._swE("beep"), "off") === "on";

    return `
      <div class="header">
        <div class="header-top">
          <div class="header-title">
            <span class="isdt-logo">ISDT</span>
            <span class="model-name">${title}</span>
          </div>
          <button class="beep-btn ${beep ? "on" : ""}" data-entity="${this._swE("beep")}">
            <ha-icon icon="mdi:${beep ? "volume-high" : "volume-off"}"></ha-icon>
          </button>
        </div>
        <div class="header-stats">
          <div class="stat"><span class="stat-value">${iV.toFixed(1)}<small>V</small></span><span class="stat-label">Input</span></div>
          <div class="stat-div"></div>
          <div class="stat"><span class="stat-value">${iA.toFixed(2)}<small>A</small></span><span class="stat-label">Current</span></div>
          <div class="stat-div"></div>
          <div class="stat"><span class="stat-value">${iW}<small>W</small></span><span class="stat-label">Power</span></div>
          <div class="stat-div"></div>
          <div class="stat"><span class="stat-value">${tA.toFixed(2)}<small>A</small></span><span class="stat-label">Σ Charge</span></div>
        </div>
      </div>`;
  }

  _slotHTML(slot) {
    const status = this._slotStatus(slot);
    const isEmpty = status === "empty";
    const isActive = status === "charging" || status === "done";

    const pct = this._num(this._slotE(slot, "capacity"), 0);
    const cur = this._num(this._slotE(slot, "charging_current"), 0);
    const vol = this._num(this._slotE(slot, "output_voltage"), 0);
    const btype = this._st(this._slotE(slot, "battery_type"), "–");
    const mah = this._num(this._slotE(slot, "capacity_charged"), 0);
    const wh = this._num(this._slotE(slot, "energy_charged"), 0);

    const sinceE = this._slotE(slot, "charging_since");
    const since = this._st(sinceE, null);
    let timeStr = "–";
    if (since && !["unavailable", "unknown", "–"].includes(since)) {
      const d = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
      const hh = String(Math.floor(d / 3600)).padStart(2, "0");
      const mm = String(Math.floor((d % 3600) / 60)).padStart(2, "0");
      const ss = String(d % 60).padStart(2, "0");
      timeStr = `${hh}:${mm}:${ss}`;
    }

    const fillH = isEmpty ? 0 : Math.max(4, pct);

    let bubbles = "";
    for (let i = 0; i < 6; i++) {
      const l = 10 + Math.random() * 80;
      const dur = 2.5 + Math.random() * 3;
      const del = Math.random() * 3;
      const sz = 2 + Math.random() * 2;
      bubbles += `<div class="bubble" style="left:${l}%;bottom:5%;width:${sz}px;height:${sz}px;animation-duration:${dur}s;animation-delay:${del}s"></div>`;
    }

    let center = "";
    if (isEmpty) {
      center = '<ha-icon icon="mdi:battery-off-outline" class="empty-icon-lg"></ha-icon>';
    } else if (status === "error") {
      center = `
        <ha-icon icon="mdi:alert-circle" class="error-icon-lg"></ha-icon>
        <div class="battery-pct"><span class="pct-num sm">${Math.round(pct)}</span><span class="pct-sym">%</span></div>`;
    } else {
      center = `
        ${status === "charging" ? '<ha-icon icon="mdi:lightning-bolt" class="charging-bolt"></ha-icon>' : ""}
        <div class="battery-pct"><span class="pct-num">${Math.round(pct)}</span><span class="pct-sym">%</span></div>`;
    }

    return `
      <div class="battery-slot ${status}" data-slot="${slot}">
        <div class="battery-terminal"></div>
        <div class="battery-body">
          <div class="battery-fill" style="height:${fillH}%">
            <div class="battery-fill-wave"></div>
            <div class="battery-bubbles">${bubbles}</div>
          </div>
          <div class="battery-content">
            <span class="slot-badge">${slot}</span>
            <span class="status-badge ${status}">${STATUS_LABELS[status] || status}</span>
            ${center}
          </div>
        </div>
        <div class="battery-info ${isEmpty ? "hidden" : ""}">
          <div class="info-row">
            <span class="lbl"><ha-icon icon="mdi:flash"></ha-icon>Volt</span>
            <span class="val">${vol.toFixed(2)} V</span>
          </div>
          <div class="info-row">
            <span class="lbl"><ha-icon icon="mdi:current-dc"></ha-icon>Amp</span>
            <span class="val">${cur.toFixed(3)} A</span>
          </div>
          <div class="info-row">
            <span class="lbl"><ha-icon icon="mdi:timer-outline"></ha-icon>Time</span>
            <span class="val time-val" data-since="${since || ""}">${timeStr}</span>
          </div>
          <div class="info-row">
            <span class="lbl"><ha-icon icon="mdi:atom"></ha-icon>Type</span>
            <span class="val">${btype !== "unavailable" ? btype : "–"}</span>
          </div>
          ${isActive ? `
            <div class="info-sep"></div>
            <div class="info-sub">
              <span>${mah.toFixed(0)} mAh</span>
              <span>${wh.toFixed(2)} Wh</span>
            </div>` : ""}
        </div>
      </div>`;
  }

  /* ── Events ─────────────────────────────────────────── */
  _bind(card) {
    const beep = card.querySelector(".beep-btn");
    if (beep)
      beep.addEventListener("click", (e) => {
        e.stopPropagation();
        this._hass.callService("switch", "toggle", {
          entity_id: beep.dataset.entity,
        });
      });

    card.querySelectorAll(".battery-slot").forEach((el) => {
      el.addEventListener("click", () => {
        const ev = new Event("hass-more-info", {
          bubbles: true,
          composed: true,
        });
        ev.detail = {
          entityId: this._mainE(`slot_${el.dataset.slot}_status`),
        };
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
    /* ════════════ Token layer ════════════ */
    :host {
      /* Status palette — works on any background */
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
      font-family: var(--paper-font-body1_-_font-family, -apple-system, 'Segoe UI', sans-serif);
    }

    .isdt-card { padding: 0; }

    /* ════════════ Header ════════════ */
    .header {
      padding: 18px 20px 14px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }

    .header-top {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px;
    }
    .header-title { display: flex; align-items: baseline; gap: 8px; }

    .isdt-logo {
      font-weight: 800; font-size: 18px; letter-spacing: 2.5px;
      color: var(--primary-color, #03a9f4);
    }
    .model-name {
      font-size: 13px; font-weight: 500;
      color: var(--secondary-text-color, #727272);
    }

    .beep-btn {
      background: var(--card-background-color, #fff);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px; padding: 6px 10px; cursor: pointer;
      color: var(--secondary-text-color); display: flex; align-items: center;
      transition: all 0.15s;
    }
    .beep-btn:hover { filter: brightness(0.95); }
    .beep-btn.on {
      color: var(--primary-color, #03a9f4);
      border-color: var(--primary-color, #03a9f4);
    }
    .beep-btn ha-icon { --mdc-icon-size: 20px; }

    .header-stats {
      display: flex; align-items: center; justify-content: space-between;
      background: var(--secondary-background-color, rgba(0,0,0,0.04));
      border-radius: 10px; padding: 10px 6px;
    }
    .stat { display: flex; flex-direction: column; align-items: center; flex: 1; }
    .stat-value {
      font-size: 15px; font-weight: 700;
      font-variant-numeric: tabular-nums;
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

    /* ════════════ Battery Grid ════════════ */
    .battery-grid {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 10px; padding: 12px;
    }
    @media (max-width: 400px) { .battery-grid { grid-template-columns: repeat(2, 1fr); } }

    /* ════════════ Battery Slot ════════════ */
    .battery-slot {
      display: flex; flex-direction: column; align-items: center;
      cursor: pointer; transition: transform 0.2s;
    }
    .battery-slot:hover { transform: translateY(-2px); }

    /* Terminal */
    .battery-terminal {
      width: 36%; height: 7px;
      background: var(--divider-color, #e0e0e0);
      border-radius: 3px 3px 0 0; margin: 0 auto;
      transition: background 0.4s, box-shadow 0.4s;
    }

    /* Body */
    .battery-body {
      position: relative; width: 100%; height: 175px;
      background: var(--secondary-background-color, rgba(0,0,0,0.04));
      border: 2px solid var(--divider-color, #e0e0e0);
      border-radius: 4px 4px 10px 10px;
      overflow: hidden; transition: border-color 0.4s, box-shadow 0.4s;
    }

    /* Fill */
    .battery-fill {
      position: absolute; bottom: 0; left: 0; right: 0;
      transition: height 1.2s cubic-bezier(0.22, 1, 0.36, 1);
      border-radius: 0 0 8px 8px;
    }

    /* Wave */
    .battery-fill-wave {
      position: absolute; top: -8px; left: -10%; width: 120%; height: 16px;
      opacity: 0; pointer-events: none;
    }
    .charging .battery-fill-wave {
      opacity: 1;
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 16'%3E%3Cpath d='M0,8 Q15,2 30,8 T60,8 T90,8 T120,8 V16 H0 Z' fill='rgba(255,255,255,0.12)'/%3E%3C/svg%3E") repeat-x;
      background-size: 60px 16px;
      animation: wave 2.5s linear infinite;
    }
    @keyframes wave { from { background-position-x: 0 } to { background-position-x: 60px } }

    /* Bubbles */
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
      from { transform: translateY(0) scale(1); opacity: 0.5; }
      to   { transform: translateY(-180px) scale(0.3); opacity: 0; }
    }

    /* ── Status: charging ── */
    .charging .battery-body {
      border-color: rgba(76,175,80,0.45);
      box-shadow: 0 0 16px rgba(76,175,80,0.12);
    }
    .charging .battery-terminal {
      background: var(--isdt-charging);
      box-shadow: 0 0 8px rgba(76,175,80,0.45);
    }
    .charging .battery-fill {
      background: linear-gradient(0deg, var(--isdt-charging-deep), var(--isdt-charging));
    }

    /* ── Status: done ── */
    .done .battery-body {
      border-color: rgba(66,165,245,0.4);
      box-shadow: 0 0 16px rgba(66,165,245,0.1);
    }
    .done .battery-terminal {
      background: var(--isdt-done);
      box-shadow: 0 0 8px rgba(66,165,245,0.4);
    }
    .done .battery-fill {
      background: linear-gradient(0deg, var(--isdt-done-deep), var(--isdt-done));
    }

    /* ── Status: idle ── */
    .idle .battery-fill {
      background: var(--divider-color, #e0e0e0);
      opacity: 0.5;
    }

    /* ── Status: error ── */
    .error .battery-body {
      border-color: rgba(239,83,80,0.45);
      box-shadow: 0 0 16px rgba(239,83,80,0.1);
      animation: err-b 2s ease-in-out infinite;
    }
    .error .battery-terminal {
      background: var(--isdt-error);
      box-shadow: 0 0 8px rgba(239,83,80,0.45);
    }
    .error .battery-fill {
      background: linear-gradient(0deg, var(--isdt-error-deep), var(--isdt-error));
    }
    @keyframes err-b {
      0%,100% { border-color: rgba(239,83,80,0.3); }
      50%     { border-color: rgba(239,83,80,0.6); }
    }

    /* ── Status: empty ── */
    .empty .battery-body {
      border-color: var(--divider-color, #e0e0e0);
      opacity: 0.6;
    }
    .empty .battery-terminal { opacity: 0.5; }

    /* ════════════ Content overlay ════════════ */
    .battery-content {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      z-index: 2;
    }

    .slot-badge {
      position: absolute; top: 7px; left: 7px;
      font-size: 11px; font-weight: 700;
      color: var(--secondary-text-color);
      background: var(--card-background-color, rgba(255,255,255,0.85));
      width: 20px; height: 20px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 5px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
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
    .status-badge.charging { color: var(--isdt-charging); }
    .status-badge.done { color: var(--isdt-done); }
    .status-badge.error { color: var(--isdt-error); }

    .battery-pct { display: flex; align-items: baseline; }
    .pct-num {
      font-size: 32px; font-weight: 800; line-height: 1;
      color: var(--primary-text-color);
    }
    .pct-num.sm { font-size: 24px; }
    .pct-sym {
      font-size: 13px; font-weight: 500;
      color: var(--secondary-text-color); margin-left: 1px;
    }

    /* Charging overlay — ensure text readable on green fill */
    .charging .pct-num,
    .done .pct-num { color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,0.3); }
    .charging .pct-sym,
    .done .pct-sym { color: rgba(255,255,255,0.7); }

    .charging-bolt {
      --mdc-icon-size: 22px; color: #fff;
      margin-bottom: 2px; animation: bolt 1.5s ease-in-out infinite;
    }
    @keyframes bolt {
      0%,100% { opacity: 0.65; transform: scale(1); }
      50%     { opacity: 1; transform: scale(1.12); }
    }

    .empty-icon-lg {
      --mdc-icon-size: 34px;
      color: var(--disabled-text-color, #bdbdbd);
    }

    .error-icon-lg {
      --mdc-icon-size: 22px;
      color: #fff; margin-bottom: 4px;
    }
    .error .pct-num { color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,0.3); }
    .error .pct-sym { color: rgba(255,255,255,0.7); }

    /* ════════════ Info below battery ════════════ */
    .battery-info {
      width: 100%; margin-top: 8px;
      display: flex; flex-direction: column; gap: 1px; padding: 0 2px;
    }
    .battery-info.hidden { display: none; }

    .info-row {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 10.5px;
      color: var(--secondary-text-color);
      line-height: 1.7;
    }
    .info-row .lbl { display: flex; align-items: center; gap: 3px; }
    .info-row .lbl ha-icon { --mdc-icon-size: 12px; opacity: 0.5; }
    .info-row .val {
      font-variant-numeric: tabular-nums;
      font-size: 10.5px; font-weight: 600;
      color: var(--primary-text-color);
    }

    .info-sep {
      height: 1px;
      background: var(--divider-color, #e0e0e0);
      margin: 2px 0;
    }

    .info-sub {
      display: flex; justify-content: space-between;
      font-variant-numeric: tabular-nums;
      font-size: 9.5px;
      color: var(--secondary-text-color);
    }
    `;
  }
}

export class ISDTChargerCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
  }
  setConfig(c) { this._config = { ...c }; this._render(); }
  set hass(h) { this._hass = h; }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        .ed { padding: 16px; }
        .row { display: flex; flex-direction: column; margin-bottom: 12px; }
        label { font-size: 13px; font-weight: 500; margin-bottom: 4px; color: var(--primary-text-color); }
        input, select {
          padding: 8px 10px;
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 8px; font-size: 14px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
        }
        small { color: var(--secondary-text-color); font-size: 11px; margin-top: 3px; }
        .cb { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .cb input { width: auto; }
      </style>
      <div class="ed">
        <div class="row">
          <label>Title</label>
          <input id="title" value="${this._config.title || "ISDT C4 Air"}">
        </div>
        <div class="row">
          <label>Entity Prefix</label>
          <input id="entity_prefix" value="${this._config.entity_prefix || "sensor.isdt_c4_air"}">
          <small>e.g. sensor.isdt_c4_air</small>
        </div>
        <div class="row">
          <label>Switch Prefix</label>
          <input id="switch_prefix" value="${this._config.switch_prefix || ""}">
          <small>Leave empty to auto-detect</small>
        </div>
        <div class="row">
          <label>Number of Slots</label>
          <select id="slots">
            ${[2, 4, 6, 8].map((n) => `<option value="${n}"${this._config.slots == n ? " selected" : ""}>${n}</option>`).join("")}
          </select>
        </div>
        <div class="cb">
          <input type="checkbox" id="show_header" ${this._config.show_header !== false ? "checked" : ""}>
          <label for="show_header" style="margin:0">Show header with input stats</label>
        </div>
      </div>`;

    const fire = () => {
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
    };

    ["title", "entity_prefix", "switch_prefix"].forEach((k) => {
      this.shadowRoot.getElementById(k).addEventListener("change", (e) => {
        this._config = { ...this._config, [k]: e.target.value };
        fire();
      });
    });

    this.shadowRoot.getElementById("slots").addEventListener("change", (e) => {
      this._config = { ...this._config, slots: parseInt(e.target.value) };
      fire();
    });

    this.shadowRoot.getElementById("show_header").addEventListener("change", (e) => {
      this._config = { ...this._config, show_header: e.target.checked };
      fire();
    });
  }
}
