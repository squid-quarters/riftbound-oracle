import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "vite";

describe("maintenance CLI failures", () => {
  const root = resolve(import.meta.dirname, "../..");
  const bundle = mkdtempSync(join(root, ".oracle-cli-test-"));
  const preload = join(bundle, "deny-fetch.mjs");

  beforeAll(async () => {
    await build({ configFile: join(root, "vite.config.ts"), logLevel: "silent",
      build: { outDir: bundle, emptyOutDir: true } });
    // No real network is used, including when running this regression in CI.
    writeFileSync(preload, "globalThis.fetch = async () => new Response('Denied', {status: 403, statusText: 'Forbidden'});\n");
  });
  afterAll(() => rmSync(bundle, { recursive: true, force: true }));

  function denied(command: string[]) {
    const work = mkdtempSync(join(tmpdir(), "oracle-cli-failure-"));
    mkdirSync(join(work, "manifests"));
    mkdirSync(join(work, "output"));
    writeFileSync(join(work, "manifests/upstream.json"), '{"sets":[{"set_id":"OGN","card_count":1}]}\n');
    writeFileSync(join(work, "manifests/sources.yaml"), "entries:\n  - type: riftcodex\n    set_id: OGN\n    category: cards\n    output: output/cards-ogn.md\n");
    writeFileSync(join(work, "output/cards-ogn.md"), "curated existing cards\n");
    writeFileSync(join(work, "output/core-rules.pdf"), "not a PDF");
    writeFileSync(join(work, "output/core-rules.md"), "verified existing rules\n");
    const data = ["rules-report", "deck-lab"].map(skill => join(work, `.claude/skills/${skill}/data/cards.json`));
    for (const path of data) {
      mkdirSync(resolve(path, ".."), { recursive: true });
      writeFileSync(path, '{"curated":"keep"}\n');
    }
    try {
      const result = spawnSync(process.execPath, ["--import", preload, join(bundle, "cli.js"), ...command], {
        cwd: work, encoding: "utf-8", timeout: 15000,
        env: { ...process.env, RIFTCODEX_API_URL: "https://fixture.invalid", GITHUB_OUTPUT: join(work, "actions-output"), NO_COLOR: "1" },
      });
      expect(result.error).toBeUndefined();
      for (const path of data) expect(readFileSync(path, "utf-8")).toBe('{"curated":"keep"}\n');
      expect(readFileSync(join(work, "output/cards-ogn.md"), "utf-8")).toBe("curated existing cards\n");
      expect(readFileSync(join(work, "output/core-rules.md"), "utf-8")).toBe("verified existing rules\n");
      expect(readFileSync(join(work, "manifests/upstream.json"), "utf-8")).toContain('"card_count":1');
      return result;
    } finally { rmSync(work, { recursive: true, force: true }); }
  }

  for (const args of [["watch"], ["watch", "--write"], ["skill-data"], ["process", "--only=cards"]]) {
    it(`${args.join(" ")} reports upstream 403 as failure and preserves existing data`, () => {
      const result = denied(args);
      expect(result.stdout + result.stderr).toContain("403");
      expect(result.status).toBe(1);
    });
  }
  it("extract reports a failed PDF conversion and preserves verified markdown", () => {
    const result = denied(["extract"]);
    expect(result.stdout + result.stderr).toContain("Failed: core-rules.pdf");
    expect(result.status).toBe(1);
  });
});
