const LEGACY_FORMAT_LABELS = Object.freeze({
  swf: "SWF",
  html5: "HTML5",
  unity: "Unity",
  godot: "Godot",
  unknown: "레거시 포맷",
});

const CONVERSION_LABELS = Object.freeze({
  converted: "변환 완료",
  pending: "변환 대기",
  unavailable: "변환 불가",
  not_required: "변환 불필요",
  unknown: "변환 상태 확인 필요",
});

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeFormat(value) {
  const format = String(value ?? "unknown").trim().toLowerCase();
  return Object.hasOwn(LEGACY_FORMAT_LABELS, format) ? format : "unknown";
}

function normalizeConversionStatus(value) {
  const status = String(value ?? "unknown").trim().toLowerCase().replaceAll("-", "_");
  return Object.hasOwn(CONVERSION_LABELS, status) ? status : "unknown";
}

function hasPlayablePackage(game) {
  const packageUrl = firstValue(game.converted_package_url, game.convertedPackageUrl, game.package?.url);
  return normalizeConversionStatus(firstValue(game.conversion_status, game.conversionStatus)) === "converted"
    && typeof packageUrl === "string"
    && packageUrl.length > 0;
}

/**
 * Converts legacy API data into a display-safe Jump view model.
 * This function never treats the legacy source as executable content.
 */
export function getLegacyJumpPresentation(game = {}) {
  const legacyFormat = normalizeFormat(firstValue(
    game.legacy_format,
    game.legacyFormat,
    game.source_format,
    game.sourceFormat,
    game.format,
  ));
  const conversionStatus = normalizeConversionStatus(firstValue(
    game.conversion_status,
    game.conversionStatus,
    game.migration?.status,
  ));
  const playable = hasPlayablePackage(game);
  const packageUrl = firstValue(game.converted_package_url, game.convertedPackageUrl, game.package?.url) ?? null;

  return Object.freeze({
    id: firstValue(game.id, game.game_id, game.gameId) ?? null,
    legacyGameId: firstValue(game.legacy_game_id, game.legacyGameId, game.old_id, game.oldId) ?? null,
    title: firstValue(game.title, game.name) ?? "레거시 Jump",
    description: game.description ?? null,
    thumbnailUrl: firstValue(game.thumbnail_url, game.thumbnailUrl) ?? null,
    legacyFormat,
    legacyFormatLabel: LEGACY_FORMAT_LABELS[legacyFormat],
    conversionStatus,
    conversionStatusLabel: CONVERSION_LABELS[conversionStatus],
    compatibility: playable ? "playable" : conversionStatus === "pending" ? "pending" : "fallback",
    compatibilityLabel: playable
      ? "HTML5/WASM으로 플레이 가능"
      : conversionStatus === "pending"
        ? "변환 후 플레이 가능"
        : "메타데이터·안내만 제공",
    convertedPackageUrl: packageUrl,
    canPlay: playable,
    canDownload: Boolean(game.download_url ?? game.downloadUrl),
    sourceIsExecutable: false,
  });
}

export function createLegacyFallbackMessage(presentation) {
  if (presentation.conversionStatus === "pending") {
    return "이 레거시 작품은 현재 HTML5/WASM 변환을 준비 중입니다.";
  }
  if (presentation.conversionStatus === "unavailable") {
    return "이 레거시 작품은 호환 가능한 변환본을 제공할 수 없습니다.";
  }
  return "원본 레거시 포맷은 실행하지 않습니다. 작품 정보와 변환 상태만 표시합니다.";
}

export { CONVERSION_LABELS, LEGACY_FORMAT_LABELS };
