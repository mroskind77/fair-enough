// Home-screen app (RULES.md 23): manifest fields and icon files/sizes. Reads files only, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const pngInfo = (p: string) => {
  const b = readFileSync(p);
  assert.equal(b.subarray(1, 4).toString(), "PNG", `${p} is a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
};

test("manifest has the required fields and four PNG icons", () => {
  const m = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
  assert.equal(m.id, "/");
  assert.equal(m.name, "Fair Enough");
  assert.equal(m.short_name, "FairEnough");
  assert.equal(m.start_url, "/");
  assert.equal(m.scope, "/");
  assert.equal(m.display, "standalone");
  assert.equal(m.orientation, "portrait");
  assert.match(m.background_color, /^#[0-9A-F]{6}$/i);
  assert.match(m.theme_color, /^#[0-9A-F]{6}$/i);
  const want = [["/icon-192.png", 192, "any"], ["/icon-512.png", 512, "any"], ["/icon-maskable-192.png", 192, "maskable"], ["/icon-maskable-512.png", 512, "maskable"]] as const;
  for (const [src, size, purpose] of want) {
    const icon = m.icons.find((i: { src: string }) => i.src === src);
    assert.ok(icon, `${src} listed`);
    assert.equal(icon.sizes, `${size}x${size}`);
    assert.equal(icon.type, "image/png");
    assert.equal(icon.purpose, purpose);
    const info = pngInfo(`public${src}`);
    assert.deepEqual([info.w, info.h], [size, size], `${src} is ${size}px`);
  }
});

test("apple-touch-icon is 180x180 with no alpha channel; favicon.svg exists", () => {
  const info = pngInfo("public/apple-touch-icon.png");
  assert.deepEqual([info.w, info.h], [180, 180]);
  assert.equal(info.colorType, 2, "RGB, no transparency");
  assert.ok(existsSync("public/favicon.svg"));
});
