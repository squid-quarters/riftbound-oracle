import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFileGroup } from "../write-files.js";

describe("generated source installation", () => {
  it("preflights every destination before replacing any prior bytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "oracle-install-target-"));
    try {
      const first = join(dir, "core.pdf"), second = join(dir, "tournament.pdf");
      writeFileSync(first, "verified prior core"); mkdirSync(second);
      expect(() => writeFileGroup(new Map([[first, "new core"], [second, "new tournament"]]))).toThrow(/not a regular file/);
      expect(readFileSync(first, "utf-8")).toBe("verified prior core");
      expect(readdirSync(dir).sort()).toEqual(["core.pdf", "tournament.pdf"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("rolls back an IO failure after one rename has succeeded", () => {
    const dir = mkdtempSync(join(tmpdir(), "oracle-install-rollback-"));
    try {
      const first = join(dir, "core.pdf"), second = join(dir, "rules.md");
      writeFileSync(first, "verified old core"); writeFileSync(second, "curated old rules");
      let calls = 0;
      expect(() => writeFileGroup(new Map([[first, "new core"], [second, "new rules"]]), (from, to) => {
        if (++calls === 2) throw new Error("injected rename failure");
        renameSync(from, to);
      })).toThrow(/injected rename failure/);
      expect(readFileSync(first, "utf-8")).toBe("verified old core");
      expect(readFileSync(second, "utf-8")).toBe("curated old rules");
      expect(readdirSync(dir).sort()).toEqual(["core.pdf", "rules.md"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
