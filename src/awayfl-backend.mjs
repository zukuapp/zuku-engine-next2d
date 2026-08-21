import { SWF_PLAYER_CAPABILITY } from "./swf-compat.mjs";

export const AWAYFL_PACKAGES = Object.freeze({
  avm1: Object.freeze({ name: "@awayfl/avm1", version: "0.2.181" }),
  avm2: Object.freeze({ name: "@awayfl/avm2", version: "0.2.236" }),
  swfLoader: Object.freeze({ name: "@awayfl/swf-loader", version: "0.4.133" }),
});

const IMPORTERS = Object.freeze({
  avm1: () => import("@awayfl/avm1"),
  avm2: () => import("@awayfl/avm2"),
  swfLoader: () => import("@awayfl/swf-loader"),
});

function assertLifecycle(runtime) {
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError("AwayFL runtime factory must return an object");
  }
  for (const method of ["start", "pause", "stop"]) {
    if (runtime[method] !== undefined && typeof runtime[method] !== "function") {
      throw new TypeError(`AwayFL runtime ${method} must be a function`);
    }
  }
}

function loadedAvm(modules, avm) {
  return avm === "avm1" ? modules.avm1 : avm === "avm2" ? modules.avm2 : undefined;
}

/**
 * Load AwayFL's AVM and SWF-loader packages without making them mandatory at
 * import time. AwayFL supplies AVM layers and parsing/loading primitives, not
 * the complete zuku player or its sandbox enforcement.
 */
export async function loadAwayflModules({ importers = IMPORTERS } = {}) {
  const entries = await Promise.all(
    Object.entries(importers).map(async ([name, load]) => {
      try {
        return [name, { status: "loaded", module: await load() }];
      } catch (error) {
        return [name, { status: "unavailable", error }];
      }
    }),
  );
  return Object.fromEntries(entries);
}

export async function createAwayflBackend({
  importers = IMPORTERS,
  runtimeFactory,
  requirePackages = false,
} = {}) {
  const loaded = await loadAwayflModules({ importers });
  const missing = Object.entries(loaded)
    .filter(([, result]) => result.status !== "loaded")
    .map(([name]) => AWAYFL_PACKAGES[name].name);
  if (requirePackages && missing.length) {
    throw new Error(`AwayFL optional packages are unavailable: ${missing.join(", ")}`);
  }

  const modules = Object.fromEntries(
    Object.entries(loaded)
      .filter(([, result]) => result.status === "loaded")
      .map(([name, result]) => [name, result.module]),
  );
  let runtime;

  const capabilities = Object.freeze({
    ...SWF_PLAYER_CAPABILITY,
    provider: "awayfl-avm",
    avm: ["avm1", "avm2"],
    compression: ["uncompressed", "zlib"],
    versions: { avm1: [6, 10], avm2: [9, 32] },
    packages: AWAYFL_PACKAGES,
    package_status: Object.fromEntries(
      Object.entries(loaded).map(([name, result]) => [name, result.status]),
    ),
    execution_ready: typeof runtimeFactory === "function" && missing.length === 0,
  });

  return Object.freeze({
    capabilities,
    modules: Object.freeze(modules),
    supports(metadata) {
      return (
        capabilities.package_status[metadata.avm] === "loaded" &&
        capabilities.package_status.swfLoader === "loaded" &&
        capabilities.compression.includes(metadata.compression) &&
        metadata.version >= capabilities.versions[metadata.avm][0] &&
        metadata.version <= capabilities.versions[metadata.avm][1]
      );
    },
    async playOriginal(source, target, assessment) {
      if (!this.supports(assessment.metadata)) {
        throw new Error("AwayFL does not support this SWF metadata");
      }
      if (typeof runtimeFactory !== "function") {
        const error = new Error(
          "AwayFL AVM modules are loaded, but no zuku player runtimeFactory was provided",
        );
        error.code = "AWAYFL_RUNTIME_REQUIRED";
        throw error;
      }
      runtime = await runtimeFactory({
        source,
        target,
        assessment,
        avm: assessment.metadata.avm,
        avmModule: loadedAvm(modules, assessment.metadata.avm),
        swfLoaderModule: modules.swfLoader,
      });
      assertLifecycle(runtime);
      return runtime;
    },
    start(...args) {
      return runtime?.start?.(...args);
    },
    pause(...args) {
      return runtime?.pause?.(...args);
    },
    stop(...args) {
      return runtime?.stop?.(...args);
    },
  });
}
