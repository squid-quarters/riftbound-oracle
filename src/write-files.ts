/** Stage a generated file group; restore prior bytes if installation fails. */
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function writeFileGroup(writes: Map<string, string | Buffer>, rename = renameSync): void {
  const staged: Array<{ path: string; temp: string; previous?: Buffer }> = [];
  const installed: typeof staged = [];
  let restored = true;
  try {
    for (const [name, contents] of writes) {
      const path = resolve(name), temp = `${path}.oracle-${process.pid}`;
      if (existsSync(path) && !lstatSync(path).isFile()) throw new Error(`Generated target is not a regular file: ${name}`);
      const previous = existsSync(path) ? readFileSync(path) : undefined;
      mkdirSync(dirname(path), { recursive: true });
      staged.push({ path, temp, previous });
      writeFileSync(temp, contents);
    }
    for (const item of staged) { rename(item.temp, item.path); installed.push(item); }
  } catch (error) {
    const failures: string[] = [];
    for (const item of installed.reverse()) {
      try {
        if (item.previous === undefined) rmSync(item.path, { force: true });
        else { writeFileSync(item.temp, item.previous); renameSync(item.temp, item.path); }
      } catch { restored = false; failures.push(item.path); }
    }
    if (failures.length) throw new Error(`Installation failed; rollback also failed for ${failures.join(", ")}. Recovery bytes retained in .oracle-${process.pid} files.`, { cause: error });
    throw error;
  } finally {
    // If the filesystem prevents rollback, retain recovery bytes instead of
    // deleting the only copy available to a maintainer.
    if (restored) for (const item of staged) rmSync(item.temp, { force: true });
  }
}
