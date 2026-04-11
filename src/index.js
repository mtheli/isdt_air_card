import { ISDTChargerCard, CARD_VERSION } from "./isdt-charger-card.js";

customElements.define("isdt-charger-card", ISDTChargerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "isdt-charger-card",
  name: "ISDT Air Card",
  description: "Dashboard card for ISDT Air BLE chargers and adapters (MASS2) — adapts to your HA theme",
  preview: true,
  documentationURL: "https://github.com/mtheli/isdt_air_card",
});

console.info(
  `%c ISDT-AIR-CARD %c v${CARD_VERSION} `,
  "color:#4caf50;background:#222;font-weight:bold;padding:2px 6px;border-radius:3px 0 0 3px",
  "color:#e1e1e1;background:#444;padding:2px 6px;border-radius:0 3px 3px 0"
);
