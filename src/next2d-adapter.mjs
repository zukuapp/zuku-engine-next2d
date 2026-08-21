/**
 * Minimal public adapter contract for a Next2D-compatible runtime.
 * The host owns the sandbox; this adapter does not implement enforcement.
 */
export class Next2DAdapter {
  #runtime;
  #state = "idle";

  constructor(runtime) {
    if (!runtime || typeof runtime.load !== "function" || typeof runtime.start !== "function") {
      throw new TypeError("runtime must implement load() and start()");
    }
    this.#runtime = runtime;
  }

  get state() {
    return this.#state;
  }

  async load(manifest, packageBytes) {
    if (this.#state !== "idle") throw new Error("engine is already loaded");
    this.#state = "loading";
    await this.#runtime.load({ manifest, packageBytes });
    this.#state = "ready";
  }

  async start() {
    if (this.#state !== "ready" && this.#state !== "paused") {
      throw new Error("engine must be ready or paused");
    }
    await this.#runtime.start();
    this.#state = "running";
  }

  async pause() {
    if (this.#state !== "running") throw new Error("engine is not running");
    await this.#runtime.pause?.();
    this.#state = "paused";
  }

  async stop() {
    if (this.#state === "idle" || this.#state === "stopped") return;
    await this.#runtime.stop?.();
    this.#state = "stopped";
  }
}

export function createNext2DExecution(runtime) {
  return new Next2DAdapter(runtime);
}
