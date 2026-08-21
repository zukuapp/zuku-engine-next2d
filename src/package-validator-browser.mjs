import { unzipSync } from "fflate";
import { assertRuntimeManifest } from "./runtime-contract.mjs";

export const PACKAGE_LIMITS = Object.freeze({
  pc: 500 * 1024 * 1024,
  mobile: 100 * 1024 * 1024,
});

const REQUIRED = ["index.html"];

async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) return undefined;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function validatePackageBytes(bytes, target = "pc") {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("package must be bytes");
  if (!Object.hasOwn(PACKAGE_LIMITS, target)) throw new Error(`unsupported target: ${target}`);
  const limit = PACKAGE_LIMITS[target];
  if (bytes.byteLength > limit) {
    throw new Error(`package exceeds ${target} limit (${limit} bytes)`);
  }

  let files;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("package must be a valid ZIP archive");
  }
  const names = Object.keys(files);
  for (const required of REQUIRED) {
    if (!files[required]) throw new Error(`missing required file: ${required}`);
  }
  if (names.some((name) => name.startsWith("/") || name.includes("\\") || name.split("/").includes(".."))) {
    throw new Error("package contains an unsafe path");
  }
  const manifest = files["jump.manifest.json"];
  if (!manifest) throw new Error("missing required file: jump.manifest.json");

  let parsedManifest;
  try {
    parsedManifest = JSON.parse(new TextDecoder().decode(manifest));
  } catch {
    throw new Error("jump.manifest.json must be valid JSON");
  }
  if (parsedManifest.entry_point !== "index.html") {
    throw new Error("manifest entry_point must be index.html");
  }
  if (!["html5", "wasm"].includes(parsedManifest.format)) {
    throw new Error("manifest format must be html5 or wasm");
  }
  if (parsedManifest.format === "wasm" && !names.some((name) => name.endsWith(".wasm"))) {
    throw new Error("WASM packages must include a .wasm file");
  }
  if (parsedManifest.format === "html5" && !names.includes("index.html")) {
    throw new Error("HTML5 packages must include index.html");
  }
  if (parsedManifest.swf_backend && parsedManifest.format !== "wasm") {
    throw new Error("swf_backend capability requires a WASM package");
  }
  const capabilities = assertRuntimeManifest(parsedManifest);

  return {
    valid: true,
    target,
    size_bytes: bytes.byteLength,
    sha256: await sha256Hex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    files: names.map((name) => name.split("/").pop()).sort(),
    manifest: parsedManifest,
    capabilities,
  };
}
