import { ISDTChargerCard, CARD_VERSION } from "./isdt-charger-card.js";
import { CARD_ORIGIN } from "./version.js";
import { t } from "./translations.js";

const TAG = "isdt-charger-card";
const BANNER_ID = "isdt-charger-card-outdated-banner";

// Custom elements can only be defined once, so when two copies of the card are
// loaded (bundled with the integration + leftover standalone install) the first
// one wins. If an outdated copy won, this bundled copy patches the winner so
// every rendered card shows a visible hint on top of the console warning and
// the integration's repair issue.
function markOutdatedCards(WinnerClass) {
  const inject = (card) => {
    const root = card.shadowRoot;
    if (!root || root.querySelector(`#${BANNER_ID}`)) return;
    const haCard = root.querySelector("ha-card");
    if (!haCard) return; // not rendered yet — retry on the next render
    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.style.cssText =
      "background:var(--warning-color,#ffa600);color:var(--text-primary-color,#fff);" +
      "padding:6px 12px;font-size:12px;line-height:1.3;font-weight:500;" +
      "border-radius:var(--ha-card-border-radius,12px) var(--ha-card-border-radius,12px) 0 0;";
    banner.textContent = `⚠️ ${t(card._hass, "outdated_standalone_active")}`;
    haCard.prepend(banner);
  };

  // The card is a plain HTMLElement: a full render replaces the shadow root's
  // content, so the banner is added again after every render.
  const origRender = WinnerClass.prototype._render;
  if (typeof origRender !== "function") return;
  WinnerClass.prototype._render = function (...args) {
    const result = origRender.apply(this, args);
    try {
      inject(this);
    } catch (e) {
      // Never break the (old) card over a hint.
    }
    return result;
  };
}

const winner = customElements.get(TAG);
if (winner) {
  console.warn(
    `isdt-charger-card v${CARD_VERSION} [${CARD_ORIGIN}] was not loaded: ` +
      "another copy of the card is already registered. The card ships with the " +
      "ISDT Air BLE integration — if the standalone card is still installed " +
      "(HACS or manual resource), remove it to avoid running an outdated version.",
  );
  if (CARD_ORIGIN === "bundled" && winner.CARD_ORIGIN !== "bundled") {
    markOutdatedCards(winner);
  }
} else {
  // Marker for other copies to recognize which variant won the race.
  ISDTChargerCard.CARD_VERSION = CARD_VERSION;
  ISDTChargerCard.CARD_ORIGIN = CARD_ORIGIN;
  customElements.define(TAG, ISDTChargerCard);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: TAG,
    name: "ISDT Air Card",
    description: "Dashboard card for ISDT Air BLE chargers and adapters (MASS2) — adapts to your HA theme",
    preview: true,
    documentationURL: "https://github.com/mtheli/isdt_air_ble#lovelace-card",
    // Card picker suggestion (HA 2026.6+): suggest this card for any
    // isdt_air_ble entity. Slot/port entities live on sub-devices linked to
    // the charger via via_device_id — climb to the main device the card expects.
    getEntitySuggestion: (hass, entityId) => {
      const entity = hass.entities?.[entityId];
      if (!entity || entity.platform !== "isdt_air_ble") return null;
      let deviceId = entity.device_id;
      const parentId = hass.devices?.[deviceId]?.via_device_id;
      if (parentId && hass.devices?.[parentId]) deviceId = parentId;
      return { config: { type: `custom:${TAG}`, device_id: deviceId } };
    },
  });

  console.info(
    `%c ISDT-AIR-CARD %c v${CARD_VERSION} [${CARD_ORIGIN}] `,
    "color:#4caf50;background:#222;font-weight:bold;padding:2px 6px;border-radius:3px 0 0 3px",
    "color:#e1e1e1;background:#444;padding:2px 6px;border-radius:0 3px 3px 0"
  );
}
