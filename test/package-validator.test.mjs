import test from "node:test";
import assert from "node:assert/strict";
import { zipSync } from "fflate";
import { PACKAGE_LIMITS, validatePackageBytes } from "../src/package-validator.mjs";

const manifest = JSON.stringify({
  schema_version: "1",
  id: "game_test",
  version: "1.0.0",
  title: "Test",
  entry_point: "index.html",
  format: "html5",
  platform: { pc: true, mobile: true, tablet: false },
});

test("validates a HTML5 Jump ZIP", () => {
  const result = validatePackageBytes(
    zipSync({ "jump.manifest.json": new TextEncoder().encode(manifest), "index.html": new Uint8Array([60, 33, 45, 45]) }),
    "mobile",
  );
  assert.equal(result.valid, true);
  assert.equal(result.target, "mobile");
});

test("rejects a package over the target limit", () => {
  const oversized = new Uint8Array(PACKAGE_LIMITS.mobile + 1);
  assert.throws(() => validatePackageBytes(oversized, "mobile"), /exceeds mobile limit/);
});

test("rejects unsafe ZIP paths", () => {
  const packageBytes = zipSync({
    "jump.manifest.json": new TextEncoder().encode(manifest),
    "index.html": new Uint8Array([1]),
    "../escape": new Uint8Array([1]),
  });
  assert.throws(() => validatePackageBytes(packageBytes), /unsafe path/);
});
