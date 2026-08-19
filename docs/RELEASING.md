# Releasing

How a release is cut and, more importantly, how its notes are written. The
format is shared with the sibling cards and integrations (toothbrush-card,
gardena-smart-system-card, isdt_air_ble, philips_sonicare_ble,
philips_shaver) — this file exists so it stops drifting.

## Release notes

Written for someone who uses the card, not for someone who reads the diff.
What changed for them, and what they have to do about it.

**Structure:** `##` sections by theme, each holding bullets that open with a
bold phrase and then explain themselves in one or two sentences. A short
lead-in paragraph before the bullets is fine when they need context.

```markdown
## Card picker suggestions

- **The card suggests itself in the "Add card" picker** on Home Assistant
  2026.6 or newer — pick any entity of an ISDT charger, including a slot or
  port sensor, and the card appears preconfigured under *Community*.
- **Older Home Assistant versions are untouched.**
```

**Title:** `vX.Y.Z — what it is about`, e.g.
*v0.8.0 — Card picker suggestions*.

**Say which chargers it applies to.** The card serves several very different
devices — multi-slot chargers, LiPo balance chargers with per-cell readings,
power banks with output ports. Most changes reach only some of them, so name
the models a section applies to instead of leaving a reader to work it out
from the feature.

**Credit belongs in the notes.** Name whoever reported the problem, tested
the fix or supplied the screenshots, with `@handle` and the issue number, in
the bullet their work belongs to. The `@` is not decoration: it notifies
them and links their profile, and it is how the release and the issue thread
explain each other.

Link the external cause when one triggered the release — a Home Assistant
version, an integration release that changed which entities exist. A reader
who upgraded something and then saw behaviour change deserves to know the
two are connected.

**What does not belong:** commit lists, file names, internal symbol names,
test tallies, documentation-only changes, and the reasoning behind an
implementation choice.

## The version lives in two files

| File | Role |
| :--- | :--- |
| `package.json` | `version` — what the package declares. |
| `src/isdt-charger-card.js` | `CARD_VERSION` — rendered in the card's console banner. |

**Both must match the tag.** The banner is how a user proves which bundle
their browser actually loaded, which is the first question on any bug report
where a fix "did not work" — a stale cached bundle and a real regression look
identical until that value is read out.

`hacs.json` carries no version; HACS resolves that from the release.

## dist/ is committed, and it is what users install

`dist/isdt-charger-card.js` is built by `npm run build`. It has to be rebuilt
and committed **in the release commit**, so the tagged tree contains the
bundle that carries the tagged version — HACS installs the file named in
`hacs.json` from the tag, so a stale `dist/` ships a stale card no matter
what the source says.

## Cutting the release

1. Content commits first, pushed and green.
2. Bump `version` in `package.json` and `CARD_VERSION` in
   `src/isdt-charger-card.js` to the new version.
3. `npm run build`.
4. Commit the bump together with the rebuilt `dist/`.
5. Tag `vX.Y.Z` and push the tag with it.
6. `gh release create vX.Y.Z --title … --notes-file …`, attaching
   `dist/isdt-charger-card.js` as an asset.
