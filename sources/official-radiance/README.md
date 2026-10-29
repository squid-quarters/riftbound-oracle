# Official Radiance maintenance inputs

`package/` holds the unchanged official source package used for the October 26, 2026 local refresh.
It contains public Card Gallery HTML, its extracted raw RAD records, four official rules/errata
article HTML captures, a hash manifest, and the earlier image evidence. Raw inputs and downloaded
artwork in `images/` are ignored; they are never release assets or committed artwork.

The verified input ZIP has SHA-256 `0b1f2bee3e3a68e84ca45be046249d8bad98483139753d39a67f0a5464306f23`.
The raw RAD JSON hash is `f3525e832ed70a0af4a2fa39f1362b62cbbf60d3d1f8acae45a379e42c0b5dce`.
All bundled files were checked against the package manifest before use. `npm run oracle
import-radiance -- --source=sources/official-radiance/package` repeats those checks locally.

Reproducible processed data and provenance are committed in `output/cards-rad.json` and
`manifests/radiance-source.json`. Printed metadata corrections are separate, image-hash-pinned
observations in `manifests/radiance-metadata-overlays.json`; they never alter this raw snapshot.
See `docs/maintaining.md` for coverage, source limitations, and validation requirements.
