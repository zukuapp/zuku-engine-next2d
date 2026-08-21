import { SWF_PLAYER_CAPABILITY, assessSwfCompatibility } from "./swf-compat.mjs";

export const SWF_BACKEND_INTERFACE_VERSION = "1";

export const SWF_BACKEND_REQUIREMENTS = Object.freeze({
  interfaceVersion: SWF_BACKEND_INTERFACE_VERSION,
  execution: SWF_PLAYER_CAPABILITY.execution,
  sandbox: SWF_PLAYER_CAPABILITY.sandbox,
  resourcePolicy: SWF_PLAYER_CAPABILITY.resourcePolicy,
  directOriginal: true,
  browserPlugins: false,
  activeX: false,
  npapi: false,
  ruffle: false,
});

function assertCapabilities(capabilities) {
  if (!capabilities || typeof capabilities !== "object") {
    throw new TypeError("SWF backend must expose capabilities");
  }
  for (const [key, expected] of Object.entries(SWF_BACKEND_REQUIREMENTS)) {
    if (capabilities[key] !== expected) {
      throw new Error(`SWF backend capability ${key} must be ${String(expected)}`);
    }
  }
}

function assertManifestCapability(manifest, capabilities) {
  const declared = manifest?.swf_backend;
  if (!declared) return;
  if (declared.interface_version !== SWF_BACKEND_INTERFACE_VERSION) {
    throw new Error("manifest swf_backend interface_version is unsupported");
  }
  if (declared.provider !== capabilities.provider) {
    throw new Error("manifest swf_backend provider does not match the selected backend");
  }
  for (const avm of declared.avm ?? []) {
    if (!capabilities.avm?.includes(avm)) {
      throw new Error(`manifest swf_backend does not support ${avm}`);
    }
  }
}

/**
 * Wraps an optional original-SWF backend without exposing sandbox internals.
 * The backend remains opt-in; the adapter never loads converted packages.
 */
export function createSwfBackendAdapter(backend, { manifest } = {}) {
  if (!backend || typeof backend !== "object") {
    throw new TypeError("backend must be an object");
  }
  assertCapabilities(backend.capabilities);
  if (typeof backend.playOriginal !== "function") {
    throw new TypeError("SWF backend must implement playOriginal()");
  }
  assertManifestCapability(manifest, backend.capabilities);

  return Object.freeze({
    capabilities: Object.freeze({ ...backend.capabilities }),
    async playOriginal(source, target = "pc") {
      const assessment = assessSwfCompatibility(source, { player: backend });
      if (assessment.status !== "playable") {
        const error = new Error(
          `${assessment.message} (${assessment.classification}); 상태: ${assessment.status}`,
        );
        error.code = "SWF_BACKEND_INCOMPATIBLE";
        error.assessment = assessment;
        throw error;
      }
      return backend.playOriginal(source, target, assessment);
    },
    start: (...args) => backend.start?.(...args),
    pause: (...args) => backend.pause?.(...args),
    stop: (...args) => backend.stop?.(...args),
  });
}
