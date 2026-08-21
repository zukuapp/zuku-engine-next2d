import test from "node:test";
import assert from "node:assert/strict";
import {
  createLegacyFallbackMessage,
  getLegacyJumpPresentation,
} from "../src/legacy-jump.mjs";
import { JumpPlayerController } from "../src/jump-player.mjs";

test("normalizes legacy metadata for list and detail views", () => {
  const presentation = getLegacyJumpPresentation({
    id: "game_legacy_42",
    legacy_game_id: "hg-42",
    title: "추억의 게임",
    source_format: "swf",
    conversion_status: "pending",
    thumbnail_url: "/thumbs/42.webp",
  });

  assert.equal(presentation.legacyGameId, "hg-42");
  assert.equal(presentation.legacyFormatLabel, "SWF");
  assert.equal(presentation.conversionStatusLabel, "변환 대기");
  assert.equal(presentation.compatibility, "pending");
  assert.equal(presentation.canPlay, false);
  assert.equal(presentation.sourceIsExecutable, false);
});

test("uses a converted HTML5/WASM package for playable legacy entries", () => {
  const presentation = getLegacyJumpPresentation({
    legacy_format: "swf",
    conversion_status: "converted",
    converted_package_url: "https://cdn.example.test/game.zip",
  });

  assert.equal(presentation.canPlay, true);
  assert.equal(presentation.convertedPackageUrl, "https://cdn.example.test/game.zip");
  assert.equal(presentation.compatibility, "playable");
});

test("legacy fallback never attempts to execute an unavailable source", async () => {
  const player = new JumpPlayerController();
  const events = [];
  player.addEventListener("fallback", ({ detail }) => events.push(detail));

  await assert.rejects(
    () => player.loadLegacy({
      id: "game_legacy_7",
      legacy_format: "swf",
      conversion_status: "unavailable",
    }),
    /호환 가능한 변환본/,
  );
  assert.equal(player.presentation.sourceIsExecutable, false);
  assert.equal(events.length, 1);
  assert.match(createLegacyFallbackMessage(player.presentation), /호환 가능한 변환본/);
});
