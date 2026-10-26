/** Source-verified local recovery; no network, deployment, or upstream mutation. */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { extractArticleBody } from "./processors/rules-hub.js";
import { countErrataMarkers, parseErrata } from "./errata.js";
import { applyErratum, buildCardIndex, CARD_DATA_TARGETS, loadOverlays, matchErratum, stripTrailingArtifact, type CardIndex } from "./skill-data.js";
import { cardsToMarkdown } from "./riftcodex.js";
import { GALLERY_URL, normalizeRadiance, RAD_CARDS_PATH, RAD_PROVENANCE_PATH, readSourcePackage, sha256, type MetadataOverlay } from "./official-gallery.js";
import { normalize } from "./normalize.js";
import { writeFileGroup } from "./write-files.js";

const START = "<!-- oracle:radiance-context:start -->";
const END = "<!-- oracle:radiance-context:end -->";

export function mergeCardIndices(prior: CardIndex, incoming: CardIndex): CardIndex {
  const merged: CardIndex = structuredClone(prior);
  for (const [key, card] of Object.entries(incoming)) {
    const old = merged[key];
    if (!old) { merged[key] = card; continue; }
    // Preserve earlier printings and custom fields. Entries already supplied
    // by this importer can refresh their known fields without losing notes.
    if (old.name === card.name && old.source?.url === GALLERY_URL) merged[key] = { ...old, ...card };
    const names = [...new Set([...(old.ambiguous ?? [old.name]), ...(card.ambiguous ?? [card.name])])].sort();
    if (names.length > 1) merged[key].ambiguous = names;
  }
  return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
}

export function updateContext(prior: string, section: string, expectedPreviousHash?: string): string {
  const start = prior.indexOf(START), end = prior.indexOf(END);
  if ((start < 0) !== (end < 0) || (start >= 0 && end < start)) throw new Error("Malformed managed Radiance context; preserving prior rules");
  if (start < 0) return prior.trimEnd() + "\n\n" + section + "\n";
  const existing = prior.slice(start, end + END.length);
  if (!expectedPreviousHash || sha256(existing) !== expectedPreviousHash)
    throw new Error("Radiance context changed outside the importer; preserve/review annotations before refreshing");
  return prior.slice(0, start) + section + prior.slice(end + END.length);
}

export function importRadiance(sourceDirectory: string, overlayPath = "manifests/radiance-metadata-overlays.json") {
  const source = readSourcePackage(sourceDirectory);
  const ruleDocuments = JSON.parse(readFileSync("manifests/rules-documents.json", "utf-8")) as Array<{
    doc: string; path: string; source_url: string; sha256: string; source_version: string; effective_date: string
  }>;
  const rulesIndex = JSON.parse(readFileSync(".claude/skills/rules-report/data/rules.json", "utf-8")) as Array<{ doc: string; version: string }>;
  if (ruleDocuments.length !== 2 || new Set(ruleDocuments.map(d => d.doc)).size !== 2)
    throw new Error("Both current official rules documents must be pinned before import");
  for (const document of ruleDocuments) {
    if (!/^output\/(core|tournament)-rules\.pdf$/.test(document.path) ||
        sha256(readFileSync(document.path)) !== document.sha256 ||
        !rulesIndex.some(r => r.doc === document.doc) ||
        rulesIndex.some(r => r.doc === document.doc && r.version !== document.source_version))
      throw new Error(`Rules document/index provenance disagrees: ${document.doc}`);
  }
  const evidence = JSON.parse(readFileSync(resolve(overlayPath), "utf-8")) as MetadataOverlay;
  const cards = normalizeRadiance(source.raw, evidence, source.snapshotHash);
  const extractionRepairs: Array<{ record_id: string; removed_trailing_artifact: string }> = [];
  for (const card of cards) {
    const clean = stripTrailingArtifact(card.text.plain);
    if (clean.removed) extractionRepairs.push({ record_id: card.id, removed_trailing_artifact: clean.removed });
    card.text.plain = clean.text;
  }
  const previousProvenance = existsSync(RAD_PROVENANCE_PATH) ? JSON.parse(readFileSync(RAD_PROVENANCE_PATH, "utf-8")) : undefined;
  const sections = [START, "## Radiance official source update", "",
    "Current Core and Tournament source documents are dated October 9, 2026; their Radiance update is effective October 16. The earlier Rules Hub snapshot above is retained as historical source context.",
    "Card errata overrides explanatory examples when their wording differs, including Neeko's choice of up to three additional legends.", ""];
  const articleSources = source.manifest.rule_context_sources as Array<{ url: string; path: string; sha256: string; retrieved_at_utc: string }>;
  if (!Array.isArray(articleSources) || articleSources.length !== 4) throw new Error("Expected the four reviewed official Radiance context articles");
  const approved = new Set(["radiance-errata-updates", "core-rules-radiance-patch-notes-effective-october-16-2026",
    "october-2026-tournament-rules-changelog", "preparing-for-the-radiance-pre-rift"]);
  for (const article of articleSources) {
    const slug = article.url.match(/^https:\/\/playriftbound\.com\/en-us\/news\/announcements\/([^/]+)\/$/)?.[1];
    if (!slug || !approved.delete(slug) || article.path !== `rule-context/${slug}.html` ||
        !source.manifest.bundled_files.some((f: { path: string; sha256: string }) => f.path === article.path && f.sha256 === article.sha256))
      throw new Error(`Unexpected or unverified official article: ${article.path}`);
    const html = readFileSync(resolve(source.root, article.path), "utf-8");
    if (sha256(html) !== article.sha256 || !article.url.startsWith("https://playriftbound.com/en-us/news/announcements/"))
      throw new Error(`Invalid official article provenance: ${article.path}`);
    const doc = new JSDOM(html).window.document;
    const title = doc.querySelector("h1")?.textContent?.trim();
    const body = extractArticleBody(html);
    if (!title || body.length < 100) throw new Error(`Official article extraction is empty: ${article.path}`);
    sections.push(`## ${title}`, "", `_Source: ${article.url}_`, `_Retrieved: ${article.retrieved_at_utc}; SHA-256: ${article.sha256}_`, "", body, "");
  }
  sections.push(END);
  const section = sections.join("\n").replace(/[ \t]+$/gm, "");
  const rulesPath = "output/rules.md";
  const rules = updateContext(readFileSync(rulesPath, "utf-8"), section, previousProvenance?.context_sha256);
  const errata = parseErrata(rules);
  if (errata.size !== countErrataMarkers(rules)) throw new Error("Errata marker/parse counts disagree; no data replaced");
  for (const name of ["Elnuk Herd", "Last Caress", "Forbidden Technique", "Neeko, Blending In"])
    if (!matchErratum(errata, name)) throw new Error(`Radiance erratum is missing: ${name}`);
  const newErrata = parseErrata(section);
  if (newErrata.size !== 4) throw new Error("Expected four reviewed Radiance corrections");
  const targetContents = CARD_DATA_TARGETS.map(path => readFileSync(resolve(path), "utf-8"));
  if (targetContents[0] !== targetContents[1]) throw new Error("The two prior card indices disagree; preserve both and resolve before importing");
  const prior = JSON.parse(targetContents[0]) as CardIndex;
  const reprintCrossChecks: Array<{ record_id: string; existing_card: string; fields: string[] }> = [];
  for (const card of cards.filter(c => !c.source?.metadata_evidence)) {
    const existing = prior[card.name.toLowerCase()];
    if (!existing || existing.ambiguous || existing.name !== card.name)
      throw new Error(`No reviewed base printing or existing unambiguous card for ${card.id}`);
    const comparisons = {
      type: [card.classification.type, existing.stats.type],
      supertype: [card.classification.supertype, existing.stats.supertype],
      domain: [[...card.classification.domain].sort(), [...existing.stats.domain].sort()],
      tags: [[...card.tags].sort(), [...existing.stats.tags].sort()],
      energy: [card.attributes.energy, existing.stats.energy],
      might: [card.attributes.might, existing.stats.might],
      power: [card.attributes.power, existing.stats.power],
    };
    for (const [field, [incoming, known]] of Object.entries(comparisons))
      if (JSON.stringify(incoming) !== JSON.stringify(known)) throw new Error(`Unaudited reprint ${card.id} disagrees with existing ${field}`);
    reprintCrossChecks.push({ record_id: card.id, existing_card: existing.name, fields: Object.keys(comparisons) });
  }
  const index = mergeCardIndices(prior, buildCardIndex(cards, loadOverlays(), newErrata));
  // Existing entries already compose older errata and hand-transcribed gear
  // effects. Reapplying the old errata alone would discard those additions.
  for (const key of Object.keys(index)) index[key] = applyErratum(index[key], matchErratum(newErrata, index[key].name));
  const normalized = JSON.stringify(cards, null, 2) + "\n";
  const rawIds = source.raw.map(c => c.id);
  const provenance = {
    source: GALLERY_URL, source_snapshot_sha256: source.snapshotHash,
    gallery_html_sha256: sha256(readFileSync(resolve(source.root, "immutable-snapshot/gallery.html"))),
    normalized_sha256: sha256(normalized), metadata_evidence_sha256: sha256(readFileSync(resolve(overlayPath))),
    context_sha256: sha256(section), source_updated_at: source.gallery.updatedAt,
    extraction_repairs: extractionRepairs,
    reprint_cross_checks: reprintCrossChecks,
    coverage: { records: cards.length, base_ids: 167,
      numbered_over_167: rawIds.filter(id => /^rad-\d{3}-167$/.test(id) && Number(id.split("-")[1]) > 167).length,
      a_suffix: rawIds.filter(id => /^rad-\d{3}a-167$/.test(id)).length,
      runes: rawIds.filter(id => /^rad-r/.test(id)).length, sp: rawIds.filter(id => /^rad-sp/.test(id)).length,
      embedded_gallery_records: source.gallery.embeddedRecords, advertised_gallery_records: source.gallery.advertisedRecords,
      variants_complete: false },
    article_sources: articleSources,
    rule_documents: ruleDocuments,
  };
  const serialised = JSON.stringify(index, null, 1);
  const writes = new Map(CARD_DATA_TARGETS.map(path => [path, serialised]));
  writes.set(RAD_CARDS_PATH, normalized);
  writes.set(RAD_PROVENANCE_PATH, JSON.stringify(provenance, null, 2) + "\n");
  writes.set("output/cards-rad.md", normalize(cardsToMarkdown(cards, "Radiance"), "cards"));
  writes.set(rulesPath, rules);
  writeFileGroup(writes);
  return { records: cards.length, keys: Object.keys(index).length, uniqueCards: new Set(Object.values(index).map(c => c.name)).size,
    errata: errata.size, proofRecords: Object.keys(evidence.cards).length, provenance };
}
