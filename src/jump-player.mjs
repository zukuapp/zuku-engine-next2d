import { unzipSync } from "fflate";
import { validatePackageBytes } from "./package-validator-browser.mjs";
import { createLegacyFallbackMessage, getLegacyJumpPresentation } from "./legacy-jump.mjs";
import { createCapabilityBridge } from "./runtime-bridge.mjs";

export const PLAYER_STATES = Object.freeze([
  "idle",
  "loading",
  "ready",
  "running",
  "paused",
  "stopped",
  "error",
]);

const decoder = new TextDecoder();

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError("package source must be a URL, ArrayBuffer, or Uint8Array");
}

async function readSource(source) {
  if (typeof source === "string" || (typeof Request !== "undefined" && source instanceof Request)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`package request failed (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }
  if (typeof Response !== "undefined" && source instanceof Response) {
    if (!source.ok) throw new Error(`package request failed (${source.status})`);
    return new Uint8Array(await source.arrayBuffer());
  }
  return asBytes(source);
}

function createRuntime(container) {
  let frame;
  let files = new Map();
  let urls = new Map();
  let bridge;
  let onMessage;

  return {
    async load({ packageBytes, capabilities = {} }) {
      const archive = unzipSync(packageBytes);
      files = new Map(Object.entries(archive));
      if (!container || typeof document === "undefined") return;

      urls = new Map();
      for (const [name, bytes] of files) {
        const type = name.endsWith(".html")
          ? "text/html"
          : name.endsWith(".js")
            ? "text/javascript"
            : name.endsWith(".wasm")
              ? "application/wasm"
              : "application/octet-stream";
        urls.set(name, URL.createObjectURL(new Blob([bytes], { type })));
      }
      const entry = decoder.decode(files.get("index.html"));
      const html = entry.replace(
        /(["'(])((?:\.\/)?[^"'()#]+)(["')])/g,
        (match, prefix, name, suffix) => {
          const cleanName = name.replace(/^\.\//, "");
          return urls.has(cleanName) ? `${prefix}${urls.get(cleanName)}${suffix}` : match;
        },
      );
      frame = document.createElement("iframe");
      frame.title = "zuku Jump game";
      frame.setAttribute("sandbox", "allow-scripts");
      frame.setAttribute("allow", "fullscreen");
      frame.referrerPolicy = "no-referrer";
      frame.className = "zuku-jump-frame";
      frame.srcdoc = html;
      container.replaceChildren(frame);
      await new Promise((resolve, reject) => {
        onMessage = (event) => {
          if (bridge?.receive(event)) resolve();
        };
        window.addEventListener("message", onMessage, { once: false });
        frame.addEventListener("load", () => resolve(), { once: true });
        setTimeout(() => resolve(), 1000);
      });
      bridge = createCapabilityBridge({
        frame: frame.contentWindow,
        targetOrigin: "*",
        expectedOrigin: "null",
        sourceWindow: frame.contentWindow,
        capabilities,
      });
    },
    async start() {
      bridge?.start();
    },
    async pause() {
      bridge?.pause();
    },
    async stop() {
      bridge?.stop();
      bridge?.close();
      if (onMessage) window.removeEventListener("message", onMessage);
      frame?.remove();
      frame = undefined;
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      files.clear();
      bridge = undefined;
      onMessage = undefined;
    },
  };
}

export class JumpPlayerController extends EventTarget {
  #runtime;
  #state = "idle";
  #manifest;
  #presentation;

  constructor({ runtime } = {}) {
    super();
    this.#runtime = runtime;
  }

  get state() {
    return this.#state;
  }

  get manifest() {
    return this.#manifest;
  }

  get presentation() {
    return this.#presentation;
  }

  #setState(state) {
    this.#state = state;
    this.dispatchEvent(new CustomEvent("statechange", { detail: { state } }));
  }

  async load(source, target = "pc") {
    if (!["idle", "stopped", "error"].includes(this.#state)) {
      throw new Error(`cannot load while ${this.#state}`);
    }
    this.#setState("loading");
    try {
      const bytes = await readSource(source);
      const result = await validatePackageBytes(bytes, target);
      this.#manifest = result.manifest;
      await this.#runtime?.load?.({
        manifest: this.#manifest,
        packageBytes: bytes,
        capabilities: result.capabilities,
      });
      this.#setState("ready");
      return result;
    } catch (error) {
      this.#setState("error");
      this.dispatchEvent(new CustomEvent("error", { detail: { error } }));
      throw error;
    }
  }

  /**
   * Loads display metadata for a legacy game without executing its source format.
   * A converted HTML5/WASM package may be passed through the normal load path.
   */
  async loadLegacy(game) {
    if (!["idle", "stopped", "error"].includes(this.#state)) {
      throw new Error(`cannot load legacy game while ${this.#state}`);
    }
    this.#presentation = getLegacyJumpPresentation(game);
    this.dispatchEvent(new CustomEvent("legacyload", { detail: { presentation: this.#presentation } }));
    if (this.#presentation.canPlay) {
      return this.load(this.#presentation.convertedPackageUrl, game.target ?? "pc");
    }
    this.#setState("error");
    const error = new Error(createLegacyFallbackMessage(this.#presentation));
    this.dispatchEvent(new CustomEvent("fallback", {
      detail: { presentation: this.#presentation, message: error.message },
    }));
    this.dispatchEvent(new CustomEvent("error", { detail: { error, fallback: true } }));
    throw error;
  }

  async start() {
    if (!["ready", "paused"].includes(this.#state)) throw new Error(`cannot start while ${this.#state}`);
    await this.#runtime?.start?.();
    this.#setState("running");
  }

  async pause() {
    if (this.#state !== "running") throw new Error(`cannot pause while ${this.#state}`);
    await this.#runtime?.pause?.();
    this.#setState("paused");
  }

  async resume() {
    if (this.#state !== "paused") throw new Error(`cannot resume while ${this.#state}`);
    await this.start();
  }

  async stop() {
    if (["idle", "stopped"].includes(this.#state)) return;
    await this.#runtime?.stop?.();
    this.#setState("stopped");
  }
}

export function createJumpPlayer(container, options = {}) {
  const runtime = options.runtime ?? createRuntime(container);
  return new JumpPlayerController({ runtime });
}

export function defineJumpPlayer(tagName = "zuku-jump-player") {
  if (typeof customElements === "undefined" || customElements.get(tagName)) return;
  class ZukuJumpPlayer extends HTMLElement {
    #player;
    #game;
    #status;
    #source;
    #legacyGame;
    #target = "pc";

    connectedCallback() {
      const shadow = this.attachShadow({ mode: "open" });
      shadow.innerHTML = `
        <style>
          :host { display: block; color: #fff; background: #0a0a0f; border: 1px solid #2a4a3a; border-radius: 12px; overflow: hidden; }
          .toolbar { display: flex; gap: 8px; align-items: center; padding: 12px; background: #12121a; }
          button { min-width: 44px; min-height: 44px; color: #fff; background: #1a1a2e; border: 1px solid #00ff88; border-radius: 8px; cursor: pointer; }
          button:focus-visible { outline: 3px solid #00d4ff; outline-offset: 2px; }
          [data-game] { min-height: 240px; aspect-ratio: 16 / 9; background: #050508; }
          iframe { width: 100%; height: 100%; min-height: 240px; border: 0; display: block; }
          [role=status] { margin-inline-start: auto; color: #a0a0b8; }
          @media (max-width: 767px) { [data-game] { aspect-ratio: 9 / 16; } }
          @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
        </style>
        <div class="toolbar" role="toolbar" aria-label="Jump 플레이어 조작">
          <button type="button" data-action="start">시작</button>
          <button type="button" data-action="pause">일시정지</button>
          <button type="button" data-action="stop">중지</button>
          <button type="button" data-action="retry" hidden>재시도</button>
          <button type="button" data-action="fullscreen">전체화면</button>
          <span role="status" aria-live="polite">idle</span>
        </div>
        <div data-game tabindex="0" aria-label="Jump 게임 화면"></div>
        <section data-legacy hidden role="status" aria-live="polite">
          <strong data-legacy-title></strong>
          <p data-legacy-message></p>
          <p><span data-legacy-format></span> · <span data-legacy-status></span></p>
        </section>
      `;
      this.#game = shadow.querySelector("[data-game]");
      this.#status = shadow.querySelector("[role=status]");
      const legacyPanel = shadow.querySelector("[data-legacy]");
      this.#player = createJumpPlayer(this.#game);
      this.#player.addEventListener("statechange", ({ detail }) => {
        this.#status.textContent = detail.state;
        this.toggleAttribute("data-error", detail.state === "error");
        const retry = shadow.querySelector('[data-action="retry"]');
        retry.hidden = detail.state !== "error" || !this.#source;
      });
      this.#player.addEventListener("legacyload", ({ detail }) => {
        const { presentation } = detail;
        legacyPanel.hidden = false;
        shadow.querySelector("[data-legacy-title]").textContent = presentation.title;
        shadow.querySelector("[data-legacy-format]").textContent = presentation.legacyFormatLabel;
        shadow.querySelector("[data-legacy-status]").textContent = presentation.compatibilityLabel;
        shadow.querySelector("[data-legacy-message]").textContent = createLegacyFallbackMessage(presentation);
      });
      shadow.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", () => this.#handle(button.dataset.action));
      });
      this.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          void this.#handle(this.#player.state === "running" ? "pause" : "start");
        }
      });
    }

    async #handle(action) {
      if (action === "fullscreen") return this.#game.requestFullscreen?.();
      if (action === "retry" && this.#source) return this.#player.load(this.#source, this.#target);
      if (action === "start") return this.#player.state === "paused" ? this.#player.resume() : this.#player.start();
      if (action === "pause") return this.#player.pause();
      if (action === "stop") return this.#player.stop();
      return undefined;
    }

    async load(source, target = "pc") {
      this.#source = source;
      this.#target = target;
      return this.#player.load(source, target);
    }

    async loadLegacy(game) {
      this.#legacyGame = game;
      return this.#player.loadLegacy(game);
    }
  }
  customElements.define(tagName, ZukuJumpPlayer);
}

export { createRuntime as createIframeRuntime };
