/** Offline, source-pinned import of the public Riot Radiance gallery snapshot. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { JSDOM } from "jsdom";
import type { RiftcodexCard } from "./riftcodex.js";

export const RAD_CARDS_PATH = "output/cards-rad.json";
export const RAD_PROVENANCE_PATH = "manifests/radiance-source.json";
export const GALLERY_URL = "https://playriftbound.com/en-us/card-gallery/";
export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

interface Labeled { id: string; label: string }
interface Numeric { value?: { id: number; label?: string } }
export interface GalleryCard {
  id: string; publicCode: string; collectorNumber: number; name: string; subtitle?: string;
  set: { value: Labeled }; cardType: { type: Labeled[]; superType?: Labeled[] };
  rarity: { value: Labeled }; domain: { values: Labeled[] };
  cardImage: { url: string; accessibilityText?: string }; orientation: string;
  text?: { richText?: { body: string } }; effect?: { richText?: { body: string } };
  energy?: Numeric; power?: Numeric; might?: Numeric; mightBonus?: Numeric;
  tags?: { tags?: string[] }; illustrator?: { values?: Labeled[] };
}
export interface MetadataEvidence {
  image_url: string; image_sha256: string;
  type?: string; domain?: string[]; tags?: string[];
  supertype?: string | null;
  basis: string;
}
export interface MetadataOverlay {
  snapshot_sha256: string;
  cards: Record<string, MetadataEvidence>;
}

export function htmlText(html = ""): string {
  const fragment = JSDOM.fragment(html);
  for (const node of fragment.querySelectorAll("script,style")) node.remove();
  for (const br of fragment.querySelectorAll("br")) br.replaceWith("\n");
  for (const block of fragment.querySelectorAll("p,li")) block.append("\n");
  return (fragment.textContent ?? "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

export function extractRadiance(html: string) {
  const payload = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!payload) throw new Error("Official gallery has no __NEXT_DATA__ payload");
  const blades = JSON.parse(payload[1])?.props?.pageProps?.page?.blades;
  if (!Array.isArray(blades)) throw new Error("Official gallery blades are missing");
  const galleries = blades.filter(b => b && Array.isArray(b.cards?.items));
  if (galleries.length !== 1) throw new Error("Expected exactly one official card gallery");
  const gallery = galleries[0].cards;
  const cards = gallery.items.filter((c: GalleryCard) => c?.set?.value?.id === "RAD") as GalleryCard[];
  validateRadiance(cards);
  return { cards, embeddedRecords: gallery.items.length, advertisedRecords: gallery.async?.metadata?.totalItems ?? null,
    updatedAt: gallery.async?.metadata?.resultsUpdatedAt ?? null };
}

export function validateRadiance(cards: GalleryCard[]): void {
  if (!cards.length) throw new Error("No Radiance records; refusing an empty import");
  for (const field of ["id", "publicCode"] as const) {
    const values = cards.map(c => c[field]);
    if (values.some(v => typeof v !== "string" || !v) || new Set(values).size !== cards.length)
      throw new Error(`Missing or duplicate Radiance ${field}`);
  }
  const ids = new Set(cards.map(c => c.id));
  const missing = Array.from({ length: 167 }, (_, i) => `rad-${String(i + 1).padStart(3, "0")}-167`).filter(id => !ids.has(id));
  if (missing.length) throw new Error(`Incomplete Radiance base set: ${missing.join(", ")}`);
  for (const c of cards) {
    if (c.set?.value?.id !== "RAD" || !c.name?.trim() || !Number.isInteger(c.collectorNumber))
      throw new Error(`Invalid Radiance identity: ${c.id}`);
    const image = new URL(c.cardImage?.url);
    if (image.protocol !== "https:" || image.hostname !== "cmsassets.rgpub.io")
      throw new Error(`Not an official Riot image: ${c.id}`);
  }
}

const TYPES = new Set(["Unit", "Spell", "Gear", "Legend", "Rune", "Battlefield"]);
const DOMAINS = new Set(["Fury", "Calm", "Mind", "Body", "Chaos", "Order"]);
const title = (s: string) => s.slice(0, 1).toUpperCase() + s.slice(1).toLowerCase();
const fullName = (c: GalleryCard) => [c.name, c.subtitle].filter(Boolean).join(" - ").replace(/[‘’]/g, "'");
function number(c: GalleryCard, field: "energy" | "power" | "might" | "mightBonus"): number | null {
  const value = c[field]?.value?.id;
  if (value == null) return null; // Absence is unknown; never infer a zero.
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid ${field}: ${c.id}`);
  return value;
}

export function normalizeRadiance(cards: GalleryCard[], overlay: MetadataOverlay, snapshotHash: string): RiftcodexCard[] {
  validateRadiance(cards);
  if (overlay.snapshot_sha256 !== snapshotHash) throw new Error("Metadata evidence belongs to a different raw snapshot");
  const rawById = new Map(cards.map(c => [c.id, c]));
  for (const [id, proof] of Object.entries(overlay.cards)) {
    const raw = rawById.get(id);
    if (!raw || raw.cardImage.url !== proof.image_url || !/^[a-f0-9]{64}$/.test(proof.image_sha256) || !proof.basis)
      throw new Error(`Invalid printed-image evidence: ${id}`);
  }
  // A variant may use the reviewed base printing only when its full card name
  // matches. The original record and evidence printing remain distinguishable.
  const evidenceByName = new Map<string, { id: string; proof: MetadataEvidence }>();
  for (const [id, proof] of Object.entries(overlay.cards)) {
    const c = rawById.get(id)!;
    if ((/^rad-\d{3}-167$/.test(id) && c.collectorNumber <= 167) || /^rad-r0[1-6]$/.test(id))
      evidenceByName.set(fullName(c), { id, proof });
  }
  return [...cards].sort((a, b) => a.id.localeCompare(b.id)).map(c => {
    const reviewed = overlay.cards[c.id] ? { id: c.id, proof: overlay.cards[c.id] } : evidenceByName.get(fullName(c));
    const evidence = reviewed?.proof;
    const rawType = c.cardType?.type ?? [];
    const type = title(evidence?.type ?? (rawType.length === 1 ? rawType[0].id : ""));
    if (!TYPES.has(type)) throw new Error(`Unresolved card type: ${c.id}`);
    const caption = c.cardImage.accessibilityText?.match(/^Riftbound (Unit|Spell|Gear|Legend|Rune|Battlefield):/i)?.[1];
    if (caption && title(caption) !== type) throw new Error(`Type evidence contradicts official accessibility label: ${c.id}`);
    const domain = (evidence?.domain ?? (c.domain?.values ?? []).map(d => d.id)).map(title).filter(d => d !== "Colorless");
    if (domain.some(d => !DOMAINS.has(d))) throw new Error(`Unknown domain: ${c.id}`);
    const tags = evidence?.tags ?? c.tags?.tags ?? [];
    // Riot omits keyword brackets on Nazuman Ntofo's Equip heading. Preserve
    // its words/cost, while using the notation the existing keyword bridge
    // recognizes; no free-text occurrences of "equip" are rewritten.
    const ability = htmlText(c.text?.richText?.body).replace(/^Equip(?=\s+:rb_energy_\d+:)/, "[Equip]");
    const effect = htmlText(c.effect?.richText?.body);
    const bonus = number(c, "mightBonus");
    const text = [ability, effect, bonus === null ? "" : `Grants +${bonus} Might.`].filter(Boolean).join("\n");
    if (!text && type !== "Rune") throw new Error(`Missing ability text: ${c.id}`);
    const supertype = c.cardType?.superType ?? [];
    if (supertype.length > 1) throw new Error(`Ambiguous supertype: ${c.id}`);
    const resolvedSupertype = evidence && Object.hasOwn(evidence, "supertype")
      ? evidence.supertype : supertype[0]?.id;
    if (resolvedSupertype != null && !["Champion", "Signature", "Basic"].includes(title(resolvedSupertype)))
      throw new Error(`Unknown supertype: ${c.id}`);
    return {
      id: c.id, riftbound_id: c.publicCode, tcgplayer_id: "", collector_number: c.collectorNumber,
      name: fullName(c), set: { set_id: "RAD", label: "Radiance" },
      attributes: { energy: number(c, "energy"), power: number(c, "power"), might: type === "Unit" ? number(c, "might") : null },
      classification: { type, supertype: resolvedSupertype ? title(resolvedSupertype) : null, rarity: c.rarity?.value?.label ?? "", domain },
      text: { plain: text, rich: c.text?.richText?.body ?? "", flavour: null }, tags,
      media: { image_url: c.cardImage.url, accessibility_text: c.cardImage.accessibilityText ?? "", artist: (c.illustrator?.values ?? []).map(x => x.label).join(", ") },
      orientation: c.orientation,
      metadata: { clean_name: fullName(c), updated_on: "", alternate_art: !/^rad-\d{3}-167$/.test(c.id) || c.collectorNumber > 167,
        overnumbered: /^rad-\d{3}-167$/.test(c.id) && c.collectorNumber > 167, signature: supertype.some(s => s.id === "signature") },
      source: { url: GALLERY_URL, record_id: c.id, public_code: c.publicCode, snapshot_sha256: snapshotHash,
        ...(reviewed ? { metadata_evidence: { source_record_id: reviewed.id, image_url: reviewed.proof.image_url,
          image_sha256: reviewed.proof.image_sha256, basis: reviewed.proof.basis } } : {}) },
    };
  });
}

/** Validate all bundled bytes before consuming a resolved source package. */
export function readSourcePackage(directory: string) {
  const root = resolve(directory);
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf-8"));
  if (!Array.isArray(manifest.bundled_files)) throw new Error("Source package has no file manifest");
  const declared = new Set(manifest.bundled_files.map((f: { path: string }) => f.path));
  if (declared.size !== manifest.bundled_files.length ||
      !declared.has("immutable-snapshot/gallery.html") || !declared.has("immutable-snapshot/rad-official-cards.json"))
    throw new Error("Source manifest is missing required bytes or repeats a path");
  for (const f of manifest.bundled_files) {
    const path = resolve(root, f.path);
    if (!path.startsWith(root + sep)) throw new Error("Source manifest path escapes its directory");
    const bytes = readFileSync(path);
    if (bytes.length !== f.bytes || sha256(bytes) !== f.sha256) throw new Error(`Source bytes fail verification: ${f.path}`);
  }
  const rawText = readFileSync(resolve(root, "immutable-snapshot/rad-official-cards.json"), "utf-8");
  const raw = JSON.parse(rawText) as GalleryCard[];
  const gallery = extractRadiance(readFileSync(resolve(root, "immutable-snapshot/gallery.html"), "utf-8"));
  if (JSON.stringify(gallery.cards) !== JSON.stringify(raw)) throw new Error("RAD JSON does not match the immutable gallery HTML");
  return { root, manifest, raw, snapshotHash: sha256(rawText), gallery };
}

/** A normal future skill-data run must retain the separately reviewed set. */
export function readProcessedRadiance(path = RAD_CARDS_PATH, provenancePath = RAD_PROVENANCE_PATH): RiftcodexCard[] {
  if (!existsSync(resolve(path))) {
    if (existsSync(resolve(provenancePath))) throw new Error("Reviewed Radiance provenance exists but its supplemental card bytes are missing");
    return [];
  }
  const bytes = readFileSync(resolve(path));
  const provenance = JSON.parse(readFileSync(resolve(provenancePath), "utf-8"));
  if (sha256(bytes) !== provenance.normalized_sha256) throw new Error("Processed Radiance cards differ from their reviewed provenance");
  const cards = JSON.parse(bytes.toString("utf-8")) as RiftcodexCard[];
  if (!cards.length || cards.some(c => c.set?.set_id !== "RAD") || new Set(cards.map(c => c.id)).size !== cards.length)
    throw new Error("Invalid processed Radiance card set");
  return cards;
}
