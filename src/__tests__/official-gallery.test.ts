import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractRadiance, htmlText, normalizeRadiance, readProcessedRadiance, readSourcePackage, sha256, type GalleryCard, type MetadataOverlay } from "../official-gallery.js";
import { mergeCardIndices, updateContext } from "../import-radiance.js";
import type { SkillCard } from "../skill-data.js";
import { buildCardIndex } from "../skill-data.js";

function cards(): GalleryCard[] {
  return Array.from({ length: 167 }, (_, i) => ({
    id: `rad-${String(i + 1).padStart(3, "0")}-167`, publicCode: `RAD-${String(i + 1).padStart(3, "0")}/167`, collectorNumber: i + 1,
    name: `Fixture ${i + 1}`, set: { value: { id: "RAD", label: "Radiance" } }, cardType: { type: [{ id: "unit", label: "Unit" }] },
    rarity: { value: { id: "common", label: "Common" } }, domain: { values: [{ id: "fury", label: "Fury" }] },
    cardImage: { url: `https://cmsassets.rgpub.io/fixture-${i}.png`, accessibilityText: `Riftbound Unit: Fixture ${i + 1}.` },
    orientation: "portrait", text: { richText: { body: "<p>First instruction.<br />Second &amp; final.</p>" } },
    energy: { value: { id: 1 } }, might: { value: { id: 2 } }, tags: { tags: ["Bandle City"] },
  }));
}
const hash = "a".repeat(64);
const emptyProof: MetadataOverlay = { snapshot_sha256: hash, cards: {} };

describe("official gallery source validation", () => {
  const html = (items: GalleryCard[]) => `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { page: { blades: [
    { type: "unrelated" }, { cards: { items, async: { metadata: { totalItems: 168 } } } },
  ] } } } })}</script>`;
  it("finds the gallery dynamically and keeps advertised coverage distinct", () => {
    const result = extractRadiance(html(cards()));
    expect(result.cards).toHaveLength(167);
    expect(result.embeddedRecords).toBe(167);
    expect(result.advertisedRecords).toBe(168);
  });
  it("refuses an empty, partial, or duplicate set", () => {
    expect(() => extractRadiance(html([]))).toThrow(/empty/);
    expect(() => extractRadiance(html(cards().slice(1)))).toThrow(/rad-001-167/);
    expect(() => extractRadiance(html([...cards(), cards()[0]]))).toThrow(/duplicate/);
  });
  it("does not accept arbitrary source-image hosts", () => {
    const raw = cards(); raw[0].cardImage.url = "https://unrelated.example/image.png";
    expect(() => extractRadiance(html(raw))).toThrow(/official Riot/);
  });
  it("rejects a manifest that does not pin the consumed files", () => {
    const dir = mkdtempSync(join(tmpdir(), "oracle-source-proof-"));
    try {
      writeFileSync(join(dir, "manifest.json"), '{"bundled_files":[]}');
      expect(() => readSourcePackage(dir)).toThrow(/missing required/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("evidence-derived normalization", () => {
  it("keeps unknown numeric values null and genuine zero values zero", () => {
    const raw = cards(); raw[0].energy = { value: { id: 0 } };
    const c = normalizeRadiance(raw, emptyProof, hash)[0];
    expect(c.attributes.energy).toBe(0);
    expect(c.attributes.power).toBeNull();
    expect(c.text.plain).toBe("First instruction.\nSecond & final.");
  });
  it("requires evidence for absent or contradictory types", () => {
    const raw = cards(); raw[0].cardType.type = [];
    expect(() => normalizeRadiance(raw, emptyProof, hash)).toThrow(/Unresolved card type/);
    raw[0].cardType.type = [{ id: "gear", label: "Gear" }];
    expect(() => normalizeRadiance(raw, emptyProof, hash)).toThrow(/contradicts/);
    const proof: MetadataOverlay = { snapshot_sha256: hash, cards: { [raw[0].id]: {
      type: "Unit", domain: ["Calm"], tags: ["Piltover"], image_url: raw[0].cardImage.url,
      image_sha256: "b".repeat(64), basis: "Printed type/domain/tag line inspected",
    } } };
    const c = normalizeRadiance(raw, proof, hash)[0];
    expect(c.classification.type).toBe("Unit");
    expect(c.classification.domain).toEqual(["Calm"]);
    expect(c.tags).toEqual(["Piltover"]);
    expect(raw[0].cardType.type[0].id).toBe("gear"); // source untouched
    expect(c.source?.metadata_evidence?.source_record_id).toBe(raw[0].id);
    expect(() => normalizeRadiance(raw, proof, "c".repeat(64))).toThrow(/different raw snapshot/);
  });
  it("separates equipment-granted Might and effect from base Might", () => {
    const raw = cards(); raw[0].cardType.type = [{ id: "gear", label: "Gear" }];
    raw[0].cardImage.accessibilityText = "Riftbound Gear: Fixture 1.";
    raw[0].might = { value: { id: 1 } }; raw[0].mightBonus = { value: { id: 0 } };
    raw[0].effect = { richText: { body: "<p>[Tank]</p>" } };
    const c = normalizeRadiance(raw, emptyProof, hash)[0];
    expect(c.attributes.might).toBeNull();
    expect(c.text.plain).toContain("[Tank]");
    expect(c.text.plain).toContain("Grants +0 Might.");
  });
  it("preserves text while decoding HTML, without executing scripts", () => {
    expect(htmlText('<p>One &lt; two</p><script>steal()</script><ul><li>Three</li><li>Four</li></ul>'))
      .toBe("One < two\nThree\nFour");
  });
  it("keeps raw variant wording but selects the reviewed base printing for canonical text", () => {
    const raw = cards();
    raw.push({ ...structuredClone(raw[0]), id: "rad-sp1-005", publicCode: "RAD-SP1/005", collectorNumber: 1,
      text: { richText: { body: "<p>Variant without reminder.</p>" } },
      rarity: { value: { id: "showcase", label: "Showcase" } } });
    const normalized = normalizeRadiance(raw, emptyProof, hash);
    expect(normalized.find(c => c.id === "rad-sp1-005")?.text.plain).toBe("Variant without reminder.");
    const index = buildCardIndex(normalized);
    expect(index["fixture 1"].text).toBe("First instruction.\nSecond & final.");
    expect(index["fixture 1"].stats.rarity).toBe("Common");
  });
});

describe("safe integration", () => {
  const card = (name: string) => ({ name, text: "Verified text", stats: {} } as SkillCard);
  it("preserves custom fields and earlier printings while marking new ambiguous aliases", () => {
    const prior = { ahri: { ...card("Ahri - Alluring"), custom_note: "keep", ambiguous: ["Ahri - Alluring", "Ahri - Inquisitive"] } };
    const result = mergeCardIndices(prior, { ahri: card("Ahri - Confident"), "ahri - confident": card("Ahri - Confident") });
    expect(result.ahri.name).toBe("Ahri - Alluring");
    expect(result.ahri).toHaveProperty("custom_note", "keep");
    expect(result.ahri.ambiguous).toEqual(["Ahri - Alluring", "Ahri - Confident", "Ahri - Inquisitive"]);
    expect(prior.ahri.ambiguous).toHaveLength(2);
  });
  it("preserves annotations outside managed context and refuses edits inside it", () => {
    const section = "<!-- oracle:radiance-context:start -->\nOfficial source\n<!-- oracle:radiance-context:end -->";
    const result = updateContext("Personal ruling: keep\n", section);
    expect(updateContext(result + "\nOther annotation", section, sha256(section))).toContain("Other annotation");
    expect(() => updateContext(result.replace("Official source", "Personal change"), section, sha256(section))).toThrow(/annotations/);
  });
  it("rejects tampered processed supplemental cards before a future rebuild", () => {
    const dir = mkdtempSync(join(tmpdir(), "oracle-processed-proof-"));
    try {
      const path = join(dir, "cards.json"), provenance = join(dir, "source.json");
      writeFileSync(path, "[]"); writeFileSync(provenance, JSON.stringify({ normalized_sha256: sha256("[]") }));
      expect(() => readProcessedRadiance(path, provenance)).toThrow(/Invalid processed/);
      writeFileSync(path, "changed");
      expect(() => readProcessedRadiance(path, provenance)).toThrow(/differ/);
      expect(readFileSync(path, "utf-8")).toBe("changed");
      rmSync(path);
      expect(() => readProcessedRadiance(path, provenance)).toThrow(/bytes are missing/);
      rmSync(provenance);
      expect(readProcessedRadiance(path, provenance)).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
