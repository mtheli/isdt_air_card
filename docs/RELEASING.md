# Releasing

How a release is cut and, more importantly, how its notes are written. The
format is shared with the sibling cards and integrations (toothbrush-card,
gardena-smart-system-card, isdt_air_ble, philips_sonicare_ble,
philips_shaver) — this file exists so it stops drifting.

## Release notes

Written for someone who uses the card, not for someone who reads the diff.
What changed for them, and what they have to do about it.

**Written in English.** The card is localized, the notes are not — one text
every reader can open beats a partial set of translated ones. German belongs
in the German-language forum threads, where a release gets announced in the
reader's own language; the notes themselves stay English.

**One section per feature.** The bullets underneath carry the details. If it is
not obvious who a feature applies to, say so in one line under the heading.

**One sentence per bullet,** opening with two to five bold words that run into
the sentence. No labels, no whole sentence in bold. Write what the user sees,
with the previous behaviour as a short trailing clause where one is needed.

**Plain language.** No literary voice, no marketing tone, no idiom where a verb
will do. This holds for commit messages too. Reasoning belongs in the commit
message, not in the notes.

**No hard line breaks.** GitHub renders a single newline as a line break and
tears prose apart mid-sentence. One paragraph, one line.

```markdown
## Interrupted sessions

- **Finished zones** are marked on the tooth ring. The text already counted them.
- **The zones survive** a page reload.

## Source of the summary

Only for `philips_sonicare_ble` and `oralb_live`.

- **The tooltip distinguishes** "read from the brush" from "counted by Home Assistant". Both used to claim the first.
- **Late records** are accepted. A Sonicare for Kids delivers only on the next connection.
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
