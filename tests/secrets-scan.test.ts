// The secrets scanner itself (RULES.md 22). Fake values are assembled at run time and written to a temp folder,
// so no secret-shaped string is ever stored in the repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (dir: string) => {
  try {
    return { code: 0, out: execFileSync("node", ["scripts/scan-secrets.mjs", dir], { encoding: "utf8" }) };
  } catch (e) {
    const err = e as { status: number; stdout: string };
    return { code: err.status, out: err.stdout };
  }
};
const fake = ["Zx9f", "Q2pL", "m4Rt", "7Vb1", "Nc8K", "d3Hs", "6Jw0", "Ye5U"].join("");

test("scanner fails on hard-coded secrets and never prints their values", () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-"));
  writeFileSync(
    join(dir, "a.ts"),
    [
      `const ${"GEOAPIFY"}_KEY = "${fake}";`,
      `fetch("https://x.test/api?api${"Key"}=${fake}");`,
      `const h = "${"Bear"}er ${fake}";`,
      `const db = "postgres://u:${"pw"}12345@db.test/x";`,
      `-----BEGIN ${"RSA"} PRIVATE KEY-----`,
    ].join("\n"),
  );
  const r = run(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /GEOAPIFY_KEY/);
  assert.match(r.out, /5 secret\(s\)/);
  assert.ok(!r.out.includes(fake), "value never printed");
});

test("scanner passes on env reads and names only", () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-"));
  writeFileSync(join(dir, "b.ts"), `const k = Deno.env.get('GEOAPIFY_KEY');\nconst p = "weak-password-here";\n`);
  writeFileSync(join(dir, ".env.example"), "GEOAPIFY_KEY=\nDIAG_KEY=\n");
  assert.equal(run(dir).code, 0);
});
