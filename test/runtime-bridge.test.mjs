import test from "node:test";
import assert from "node:assert/strict";
import {
  BRIDGE_MESSAGE,
  BRIDGE_VERSION,
  createCapabilityBridge,
  installRuntimeBridge,
} from "../src/runtime-bridge.mjs";
import { assertRuntimeManifest, normalizeCapabilities } from "../src/runtime-contract.mjs";

const manifest = {
  schema_version: "1",
  entry_point: "index.html",
  format: "html5",
  permissions: { network: "none", storage: "sandbox" },
};

test("bridge sends lifecycle messages and verifies source and origin", () => {
  const messages = [];
  const source = {};
  const bridge = createCapabilityBridge({
    frame: { postMessage(message, origin) { messages.push({ message, origin }); } },
    sourceWindow: source,
    capabilities: normalizeCapabilities(manifest),
  });

  bridge.start();
  assert.equal(messages[0].message.channel, BRIDGE_MESSAGE);
  assert.equal(messages[0].message.version, BRIDGE_VERSION);
  assert.equal(messages[0].message.action, "started");
  assert.equal(bridge.receive({ source: {}, origin: "null", data: messages[0].message }), false);
  assert.equal(bridge.receive({ source, origin: "https://evil.example", data: messages[0].message }), false);
});

test("bridge rejects capabilities that are not granted", () => {
  const bridge = createCapabilityBridge({
    frame: { postMessage() {} },
    sourceWindow: {},
    capabilities: normalizeCapabilities(manifest),
  });
  assert.throws(() => bridge.request("network"), /not granted/);
  assert.throws(() => bridge.request("unknown"), /not granted/);
});

test("runtime bridge validates parent messages", () => {
  const requests = [];
  const controls = [];
  const listeners = new Set();
  const runtimeWindow = {
    parent: {},
    addEventListener(_type, listener) { listeners.add(listener); },
    removeEventListener(_type, listener) { listeners.delete(listener); },
  };
  const dispose = installRuntimeBridge({
    windowObject: runtimeWindow,
    parentOrigin: "null",
    capabilities: normalizeCapabilities(manifest),
    onRequest: (...args) => requests.push(args),
    onControl: (action) => controls.push(action),
  });
  const [listener] = listeners;
  listener({
    source: runtimeWindow.parent,
    origin: "null",
    data: { channel: BRIDGE_MESSAGE, version: BRIDGE_VERSION, action: "request", capability: "network" },
  });
  assert.equal(requests.length, 0);
  listener({
    source: runtimeWindow.parent,
    origin: "null",
    data: { channel: BRIDGE_MESSAGE, version: BRIDGE_VERSION, action: "started" },
  });
  assert.deepEqual(controls, ["started"]);
  dispose();
  assert.equal(listeners.size, 0);
});

test("runtime contract rejects network escalation", () => {
  assert.throws(() => normalizeCapabilities({
    permissions: { network: "allowlist", storage: "sandbox" },
  }), /allowlist/);
  assert.throws(() => assertRuntimeManifest({ ...manifest, schema_version: "2" }), /schema_version/);
});
