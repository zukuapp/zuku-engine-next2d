import { CAPABILITIES } from "./runtime-contract.mjs";

export const BRIDGE_VERSION = "1";
export const BRIDGE_MESSAGE = "zuku-jump-bridge";

const ACTIONS = new Set(["ready", "started", "paused", "stopped", "error"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertCapability(capabilities, capability) {
  if (!CAPABILITIES.includes(capability) || capabilities[capability] !== true) {
    throw new Error(`capability is not granted: ${capability}`);
  }
}

export function createCapabilityBridge({
  frame,
  targetOrigin = "*",
  expectedOrigin = "null",
  capabilities = {},
  sourceWindow,
  onEvent = () => {},
} = {}) {
  if (!frame || typeof frame.postMessage !== "function") {
    throw new TypeError("bridge frame must support postMessage");
  }
  const expectedSource = sourceWindow ?? frame;
  let closed = false;

  function send(action, payload = {}) {
    if (closed) return false;
    frame.postMessage({
      channel: BRIDGE_MESSAGE,
      version: BRIDGE_VERSION,
      action,
      ...payload,
    }, targetOrigin);
    return true;
  }

  function receive(event) {
    if (closed || event?.source !== expectedSource || event.origin !== expectedOrigin) return false;
    const message = event.data;
    if (!isObject(message) || message.channel !== BRIDGE_MESSAGE || message.version !== BRIDGE_VERSION) {
      return false;
    }
    if (message.action && !ACTIONS.has(message.action)) return false;
    onEvent(message);
    return true;
  }

  return Object.freeze({
    get closed() {
      return closed;
    },
    send,
    receive,
    start() {
      return send("started");
    },
    pause() {
      return send("paused");
    },
    resume() {
      return send("started");
    },
    stop() {
      return send("stopped");
    },
    request(capability, payload) {
      assertCapability(capabilities, capability);
      return send("request", { capability, payload });
    },
    close() {
      closed = true;
    },
  });
}

export function installRuntimeBridge({
  windowObject = globalThis,
  capabilities = {},
  parentOrigin = "null",
  onRequest = () => {},
  onControl = () => {},
} = {}) {
  const listener = (event) => {
    if (event.source !== windowObject.parent || event.origin !== parentOrigin) return;
    const message = event.data;
    if (!isObject(message) || message.channel !== BRIDGE_MESSAGE || message.version !== BRIDGE_VERSION) return;
    if (message.action === "request") {
      try {
        assertCapability(capabilities, message.capability);
      } catch {
        return;
      }
      onRequest(message.capability, message.payload);
      return;
    }
    if (["started", "paused", "stopped"].includes(message.action)) onControl(message.action);
  };
  windowObject.addEventListener?.("message", listener);
  return () => windowObject.removeEventListener?.("message", listener);
}
