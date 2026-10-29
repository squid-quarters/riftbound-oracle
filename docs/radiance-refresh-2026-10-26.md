# Radiance refresh — 2026-10-26

This is a local, reviewed refresh candidate on
`chore/radiance-refresh-20261026`, based on
`7685f1cd21be34b5784021e02ad95501aa986965`. It has not been pushed, merged,
published, or deployed. The existing primary checkout was left untouched.

## Workflow result and recovery

The existing **Watch upstream** workflow was dispatched on `main` with
`force=true`: [run 40308971740](https://github.com/squid-quarters/riftbound-oracle/actions/runs/40308971740).
It concluded successfully but imported nothing: the Riftcodex requests returned
HTTP 403, and the CLI swallowed their failure status. There was no generated PR,
uploaded artifact, or remote data change. This workflow refreshes cards; it does
not fetch the current rules documents.

The candidate makes unreachable sources and failed extraction/regeneration exit
nonzero. It preserves the verifier's exit code in the workflow, and stages source
groups before replacing prior files, with rollback for reported write failures.
Negative regression tests cover these cases. Re-running the unchanged remote
workflow would still use the old code and inaccessible source.

## Imported cards and provenance

Riot's [official gallery](https://playriftbound.com/en-us/card-gallery/) supplied
219 distinct RAD printing records: all **167/167 base collector IDs**, 17 numbered
168–184, 18 `a` variants, 12 rune records, and five SP records. None is quarantined.
The combined pool has **1,121 distinct card names and 1,214 lookup keys**, up from
954 names and 1,037 keys. Both skills have byte-identical card indexes. Earlier
card fields and custom annotations are preserved; shared short names acquire
explicit ambiguity flags.

The immutable source package was materialized and verified locally:

```text
ZIP       0b1f2bee3e3a68e84ca45be046249d8bad98483139753d39a67f0a5464306f23
RAD JSON  f3525e832ed70a0af4a2fa39f1362b62cbbf60d3d1f8acae45a379e42c0b5dce
HTML      99ea5fcdf39db8e645c6ff53a36d0fbf75f67b5cd9f71adbb64752f8be36ed42
```

Raw HTML/JSON remain unchanged in the ignored maintenance source directory.
The separately committed metadata overlay records official image URLs, hashes,
printed observations, and original structured fields. Independent visual review
covers all 167 base images and six named rune references: 119 base records need
one or more corrections, comprising 36 type, 40 domain, and 86 tag-field
differences. Corrected types/domains/tags are evidence per card, not heuristics.
The other five older champion reprints are cross-checked against their existing
unambiguous card fields. Variants inherit reviewed metadata only for the same
complete card name; their raw wording remains available. A trailing `disa`
fragment on Rousing Display is absent from its printed image and is removed by
the existing text cleanup, with that repair recorded in the provenance manifest.

This is **not a claim of complete variant coverage**. The page embeds 1,408 total
gallery records while its metadata advertises 1,416. The image audit establishes
type/domain/tag metadata; it is not an exhaustive independent audit of every
ability and numeric value. Missing numeric fields remain unknown rather than
being filled with zero. No artwork is added to the release or re-licensed.

`output/cards-rad.json` is the supplemental set. Future `skill-data` runs retain
it and reject missing or altered bytes against `manifests/radiance-source.json`.
`import-radiance` is an offline, hash-verified import command; repeating it leaves
all six generated outputs byte-identical. See [maintaining.md](maintaining.md)
for the reproducible command and input layout.

## Current rules and context

The October 9 official PDFs, effective October 16, produce **2,494 Core Rules +
975 Tournament Rules = 3,469 rules**. An independent extraction of both PDFs
matches every indexed rule's semantic fields. PDF hashes and dates are pinned
in `manifests/rules-documents.json`.

Four current official articles are appended to a hash-guarded managed section
of `output/rules.md`, retaining older source context and annotations:

- [Radiance core patch notes](https://playriftbound.com/en-us/news/announcements/core-rules-radiance-patch-notes-effective-october-16-2026/)
- [Radiance errata](https://playriftbound.com/en-us/news/announcements/radiance-errata-updates/)
- [Tournament rules changelog](https://playriftbound.com/en-us/news/announcements/october-2026-tournament-rules-changelog/)
- [Pre-Rift FAQ and preparation](https://playriftbound.com/en-us/news/announcements/preparing-for-the-radiance-pre-rift/)

All 67 errata entries parse, including the four current corrections. Neeko's
actual errata says **up to three** additional legends and takes precedence over
the patch's shorter explanation. Experimental start-of-game playtests and future
January changes are not made canonical.

Two defects visibly printed in Riot's PDFs remain intact and receive source
notices: CR 133.7.b refers to absent 103.2.d; TR 702.13.d.2.a has no printed parent
702.13.d.2. Exceptions are pinned to exact document version, rule text, target,
and PDF hash. Other missing parents, broken references, empty rules, or ordering
defects stop regeneration while preserving the previous index.

Shipped samples, diagrams, and runtime citation strings now reference the current
rules. Runtime Python changes are citation strings only: independent AST review
found no gameplay/control-flow change. All three engine goldens retain their
decisions and intermediate state hashes; final reason strings and corresponding
hashes change only with the citation numbers. The existing engine remains
limited to its implemented card scripts; adding card data does not implement new
Radiance abilities in the engine.

## Validation

| Check | Result |
| --- | --- |
| TypeScript tests / typecheck / build | 279/279 in 21 files; pass / pass |
| Python extraction/provenance regressions | 9 test methods pass |
| Rules / deck / site checks | 378/378; 618/618; 12/12 |
| Rules / deck mutation batteries | 237/237; 251/251 caught |
| Invariant gate / workflow trigger tests | 12/12; 31/31 |
| Engine perft / goldens / soak | 3 boards at depth 6; 3/3; 1,000/1,000 finish |
| Repeated import | Six outputs byte-identical |
| Both release archives | Reproducible across two builds; standalone selftests pass |

The first rules mutation pass exposed a real ordering-test gap because the new
source was already ordered; a reversed-source fixture now catches it. A stale
Scoring test label was corrected from 467 to 469. Failed initial logs were
preserved, and the complete final battery passed. The final rules trials used
all 237 unchanged stock mutations on isolated temporary copies; independent
review verified their actual results, unchanged source fingerprints, and stock
verdict/proof-record handling. No mutation expectation was weakened.

Applicable checks ran locally on Python 3.12 and Node 24. The configured CI
Python 3.9/3.13 and Node 22 matrix has not run on this unpublished candidate.
Independent rules/citation, source metadata, and pipeline/import reviews are
clean after fixes.

## Publication boundary

No rerun, push, PR creation, merge, infrastructure revival, credential change,
or paid API call was used to publish this local recovery. The smallest next
publication step is pushing this reviewed branch and opening a draft data-refresh
PR, which would run the existing CI matrix. Merging corpus changes to `main`
also triggers GitHub Pages and needs a separate decision. The existing refresh
workflow cannot consume unpublished local changes.

The local commit attempt could not access the configured GPG keybox inside the
filesystem sandbox. It created no commit. Signing settings were preserved, and
all candidate changes remain staged on the local branch for a signed commit in
the designated signing session.
