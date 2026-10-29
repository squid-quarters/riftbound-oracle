import { describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";

describe("refresh workflow verifier status", () => {
  const workflow = YAML.parse(readFileSync(resolve(import.meta.dirname, "../../.github/workflows/watch.yml"), "utf-8"));
  const verify = workflow.jobs.regenerate.steps.find((step: { name?: string }) => step.name === "Verify the corpus");
  for (const status of [0, 7]) {
    it(`retains verifier exit ${status} and its diagnostics`, () => {
      const work = mkdtempSync(join(tmpdir(), "oracle-workflow-status-"));
      const log = join(work, "selftest.log");
      mkdirSync(join(work, ".claude/skills/rules-report/lib"), { recursive: true });
      mkdirSync(join(work, "bin"));
      const python = join(work, "bin/python3");
      writeFileSync(python, '#!/bin/sh\necho "fixture verifier diagnostic"\nexit "$FIXTURE_STATUS"\n');
      chmodSync(python, 0o755);
      try {
        const script = verify.run.replaceAll("/tmp/selftest.log", log);
        const result = spawnSync("bash", ["-e", "-c", script], {
          cwd: work, encoding: "utf-8",
          env: { ...process.env, PATH: `${join(work, "bin")}:${process.env.PATH}`, FIXTURE_STATUS: String(status), GITHUB_OUTPUT: join(work, "output") },
        });
        expect(result.status).toBe(status);
        expect(result.stdout).toContain("fixture verifier diagnostic");
        expect(readFileSync(log, "utf-8")).toContain("fixture verifier diagnostic");
      } finally { rmSync(work, { recursive: true, force: true }); }
    });
  }
});
