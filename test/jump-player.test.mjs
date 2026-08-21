import test from "node:test";
import assert from "node:assert/strict";
import { zipSync } from "fflate";
import { JumpPlayerController } from "../src/jump-player.mjs";

const bytes = zipSync({
  "jump.manifest.json": new TextEncoder().encode(JSON.stringify({
    schema_version: "1",
    id: "game_test",
    version: "1.0.0",
    title: "Test",
    entry_point: "index.html",
    format: "html5",
    platform: { pc: true },
  })),
  "index.html": new TextEncoder().encode("<canvas></canvas>"),
});

test("Jump player loads and transitions through controls", async () => {
  const calls = [];
  const player = new JumpPlayerController({
    runtime: {
      async load() { calls.push("load"); },
      async start() { calls.push("start"); },
      async pause() { calls.push("pause"); },
      async stop() { calls.push("stop"); },
    },
  });

  await player.load(bytes);
  assert.equal(player.state, "ready");
  await player.start();
  await player.pause();
  await player.resume();
  await player.stop();
  assert.deepEqual(calls, ["load", "start", "pause", "start", "stop"]);
  assert.equal(player.state, "stopped");
});

test("Jump player reports loading failures and allows retry", async () => {
  const player = new JumpPlayerController();
  await assert.rejects(() => player.load(new Uint8Array([1, 2, 3])), /valid ZIP/);
  assert.equal(player.state, "error");
  await player.load(bytes);
  assert.equal(player.state, "ready");
});
