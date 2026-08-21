import test from "node:test";
import assert from "node:assert/strict";
import {
  assessSwfCompatibility,
  createConvertedPackageProvider,
  inspectSwf,
  SWF_PLAYER_CAPABILITY,
} from "../src/swf-compat.mjs";
import { renderSwfValidationResult } from "../src/swf-guidance.mjs";
import { createSwfBackendAdapter } from "../src/swf-backend.mjs";
import { AWAYFL_PACKAGES, createAwayflBackend } from "../src/awayfl-backend.mjs";

function swfFixture(signature = "FWS", version = 10, tagCode) {
  const bytes = new Uint8Array(32);
  bytes.set(new TextEncoder().encode(signature));
  bytes[3] = version;
  bytes[4] = 32;
  if (tagCode !== undefined) {
    const header = tagCode << 6;
    bytes[13] = header & 0xff;
    bytes[14] = header >> 8;
  }
  return bytes;
}

test("identifies SWF signature and metadata without executing it", () => {
  const result = inspectSwf(swfFixture("CWS", 9));
  assert.equal(result.isSwf, true);
  assert.equal(result.compression, "zlib");
  assert.equal(result.version, 9);
});

test("requires the zuku-owned player for supported original SWF", () => {
  const result = assessSwfCompatibility(swfFixture());
  assert.equal(result.status, "rejected");
  assert.equal(result.executable, false);
  assert.equal(result.route, "inspect-and-manually-port");
});

test("classifies a supported AVM2 SWF as player-required without a player", () => {
  const result = assessSwfCompatibility(swfFixture("FWS", 10, 82));
  assert.equal(result.status, "player-required");
  assert.equal(result.executable, false);
  assert.equal(result.route, "provide-zuku-owned-swf-player");
});

test("allows original playback only through an explicit zuku player capability", async () => {
  const calls = [];
  const provider = createConvertedPackageProvider({
    capabilities: {
      ...SWF_PLAYER_CAPABILITY,
      compression: ["uncompressed"],
      versions: { avm2: [9, 32] },
    },
    load: async () => "loaded",
    playOriginal: async (source, target, assessment) => {
      calls.push({ source, target, status: assessment.status });
      return "playing";
    },
  });
  const result = await provider.playOriginal(swfFixture("FWS", 10, 82), "pc");
  assert.equal(result, "playing");
  assert.equal(calls[0].status, "playable");
});

test("returns player-required when the provider does not expose the capability", async () => {
  const provider = createConvertedPackageProvider({ load: async () => "loaded" });
  await assert.rejects(
    provider.playOriginal(swfFixture("FWS", 10, 82)),
    (error) => error.code === "SWF_PLAYER_REQUIRED" && error.assessment.status === "player-required",
  );
});

test("rejects SWF at the converted package provider boundary", async () => {
  const provider = createConvertedPackageProvider({ load: async () => "loaded" });
  await assert.rejects(provider.load(swfFixture()), /변환 패키지 provider는 SWF를 로드하지 않습니다/);
});

test("returns explicit non-executable CLI-style guidance", () => {
  const result = renderSwfValidationResult(swfFixture("ZWS"));
  assert.equal(result.executable, false);
  assert.equal(result.status, "conversion-required");
  assert.match(result.guidance, /HTML5\/WASM/);
});

test("recognizes non-SWF input for the normal package validator", () => {
  const result = renderSwfValidationResult(new Uint8Array([1, 2, 3]));
  assert.equal(result.metadata.isSwf, false);
  assert.equal(result.route, "use-jump-package-validator");
});

test("adapts an optional backend only with the public SWF contract", async () => {
  const calls = [];
  const backend = createSwfBackendAdapter({
    capabilities: {
      ...SWF_PLAYER_CAPABILITY,
      provider: "awayfl-avm",
      avm: ["avm1", "avm2"],
      compression: ["uncompressed"],
      versions: { avm2: [9, 32] },
    },
    playOriginal: async (source, target, assessment) => {
      calls.push({ source, target, status: assessment.status });
      return "playing";
    },
  }, {
    manifest: {
      swf_backend: {
        interface_version: "1",
        provider: "awayfl-avm",
        avm: ["avm2"],
      },
    },
  });

  assert.equal(await backend.playOriginal(swfFixture("FWS", 10, 82)), "playing");
  assert.equal(calls[0].status, "playable");
});

test("rejects a backend with forbidden execution integration", () => {
  assert.throws(
    () => createSwfBackendAdapter({
      capabilities: {
        ...SWF_PLAYER_CAPABILITY,
        provider: "plugin-backend",
        browserPlugins: true,
      },
      playOriginal: async () => "playing",
    }),
    /browserPlugins must be false/,
  );
});

test("loads AwayFL packages optionally and reports the verified versions", async () => {
  const backend = await createAwayflBackend({
    importers: {
      avm1: async () => ({ name: "avm1" }),
      avm2: async () => ({ name: "avm2" }),
      swfLoader: async () => ({ name: "loader" }),
    },
  });
  assert.deepEqual(backend.capabilities.packages, AWAYFL_PACKAGES);
  assert.deepEqual(backend.capabilities.package_status, {
    avm1: "loaded",
    avm2: "loaded",
    swfLoader: "loaded",
  });
  assert.equal(backend.capabilities.execution_ready, false);
});

test("selects AVM1 or AVM2 and delegates lifecycle to the zuku runtime bridge", async () => {
  const calls = [];
  const backend = await createAwayflBackend({
    importers: {
      avm1: async () => ({ name: "avm1" }),
      avm2: async () => ({ name: "avm2" }),
      swfLoader: async () => ({ name: "loader" }),
    },
    runtimeFactory: async (context) => {
      calls.push(context);
      return {
        start: () => "started",
        pause: () => "paused",
        stop: () => "stopped",
      };
    },
  });
  const adapter = createSwfBackendAdapter(backend);
  const result = await adapter.playOriginal(swfFixture("FWS", 10, 82));
  assert.equal(result.start(), "started");
  assert.equal(adapter.pause(), "paused");
  assert.equal(adapter.stop(), "stopped");
  assert.equal(calls[0].avm, "avm2");
  assert.equal(calls[0].avmModule.name, "avm2");
  assert.equal(calls[0].swfLoaderModule.name, "loader");
});

test("does not claim AwayFL execution without a zuku runtime bridge", async () => {
  const backend = await createAwayflBackend({
    importers: {
      avm1: async () => ({}),
      avm2: async () => ({}),
      swfLoader: async () => ({}),
    },
  });
  const adapter = createSwfBackendAdapter(backend);
  await assert.rejects(
    adapter.playOriginal(swfFixture("FWS", 10, 82)),
    (error) => error.code === "AWAYFL_RUNTIME_REQUIRED",
  );
});
