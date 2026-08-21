/**
 * Public runtime boundary.
 *
 * This module intentionally exposes policy values and interface checks only.
 * OS-level enforcement and proprietary accounting remain outside this package.
 */
export const RUNTIME_LIMITS = Object.freeze({
  packageBytes: Object.freeze({
    pc: 524288000,
    mobile: 104857600,
  }),
  memoryBytes: Object.freeze({
    default: 268435456,
    max: 536870912,
  }),
  sandbox: Object.freeze({
    privilege: "unprivileged",
    filesystem: "sandbox_only",
    network: "deny_by_default",
    process: "no_exec_outside_runtime",
  }),
});

export const CAPABILITIES = Object.freeze([
  "storage",
  "fullscreen",
  "postMessage",
]);

const NETWORK_CAPABILITY = "network";

export function normalizeCapabilities(manifest = {}) {
  const permissions = manifest.permissions ?? {};
  const network = permissions.network ?? "none";
  const storage = permissions.storage ?? "sandbox";

  if (!["none", "allowlist"].includes(network)) {
    throw new Error("manifest permissions.network must be none or allowlist");
  }
  if (storage !== "sandbox") {
    throw new Error("manifest permissions.storage must be sandbox");
  }
  if (network === "allowlist") {
    throw new Error("network allowlist requires an approved host integration");
  }

  return Object.freeze({
    ...Object.fromEntries(CAPABILITIES.map((capability) => [capability, true])),
    [NETWORK_CAPABILITY]: false,
  });
}

export function assertRuntimeManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new TypeError("runtime manifest must be an object");
  }
  if (manifest.schema_version !== "1") throw new Error("unsupported manifest schema_version");
  if (manifest.entry_point !== "index.html") throw new Error("manifest entry_point must be index.html");
  if (!["html5", "wasm"].includes(manifest.format)) {
    throw new Error("manifest format must be html5 or wasm");
  }
  return normalizeCapabilities(manifest);
}
