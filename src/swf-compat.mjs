/**
 * Public SWF compatibility boundary.
 *
 * This module identifies legacy SWF files and exposes the public boundary for a
 * zuku-owned player. It does not contain an AVM, plugin bridge, ActiveX
 * integration, proprietary sandbox enforcement, or a SWF execution path.
 */

const SWF_SIGNATURES = new Map([
  ["FWS", "uncompressed"],
  ["CWS", "zlib"],
  ["ZWS", "lzma"],
]);

const CONVERSION_ROUTES = Object.freeze({
  avm1: "convert-avm1-to-html5",
  avm2: "convert-avm2-to-wasm-or-html5",
  unknown: "inspect-and-manually-port",
});

export const SWF_PLAYER_CAPABILITY = Object.freeze({
  execution: "zuku-owned-avm",
  interfaceVersion: "1",
  directOriginal: true,
  browserPlugins: false,
  ruffle: false,
  activeX: false,
  npapi: false,
  sandbox: "unprivileged",
  resourcePolicy: "jump-runtime-contract",
  enforcement: "public-boundary-only",
});

const SUPPORTED_VERSIONS = Object.freeze({
  avm1: { min: 6, max: 10 },
  avm2: { min: 9, max: 32 },
});

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError("SWF source must be an ArrayBuffer or Uint8Array");
}

function readLittleEndian(bytes, offset, size) {
  let value = 0;
  for (let index = size - 1; index >= 0; index -= 1) value = value * 256 + bytes[offset + index];
  return value;
}

function readRectBitWidth(bytes) {
  if (bytes.length < 9) return undefined;
  const bitWidth = bytes[8] >> 3;
  return bitWidth >= 1 && bitWidth <= 31 ? bitWidth : undefined;
}

function readTags(bytes, start) {
  const tags = new Set();
  let offset = start;
  while (offset + 2 <= bytes.length) {
    const header = readLittleEndian(bytes, offset, 2);
    offset += 2;
    const code = header >> 6;
    let length = header & 0x3f;
    if (code === 0) break;
    if (length === 0x3f) {
      if (offset + 4 > bytes.length) break;
      length = readLittleEndian(bytes, offset, 4);
      offset += 4;
    }
    if (offset + length > bytes.length) break;
    tags.add(code);
    offset += length;
  }
  return tags;
}

export function inspectSwf(source) {
  const bytes = asBytes(source);
  const signature = bytes.length >= 3 ? String.fromCharCode(...bytes.subarray(0, 3)) : "";
  const compression = SWF_SIGNATURES.get(signature);
  if (!compression) {
    return { isSwf: false, reason: "not-a-swf" };
  }

  const version = bytes[3];
  const declaredLength = bytes.length >= 8 ? readLittleEndian(bytes, 4, 4) : undefined;
  const tags = compression === "uncompressed" ? readTags(bytes, 8 + Math.ceil((5 + (readRectBitWidth(bytes) ?? 0) * 4) / 8) + 4) : new Set();
  const hasAvm2Tag = tags.has(82);
  const hasAvm1Tag = tags.has(12) || tags.has(59);
  const avm = hasAvm2Tag ? "avm2" : hasAvm1Tag ? "avm1" : "unknown";

  return {
    isSwf: true,
    signature,
    compression,
    version,
    declaredLength,
    actualLength: bytes.byteLength,
    truncated: declaredLength !== undefined && declaredLength > bytes.byteLength,
    avm,
    tags: [...tags].sort((left, right) => left - right),
    capabilities: {
      compression,
      avm,
      version,
      tagInspection: compression === "uncompressed" ? "available" : "limited",
    },
  };
}

function isVersionSupported(metadata) {
  const range = SUPPORTED_VERSIONS[metadata.avm];
  return range ? metadata.version >= range.min && metadata.version <= range.max : false;
}

function playerSupports(player, metadata) {
  if (!player || typeof player !== "object") return false;
  if (player.capabilities?.execution !== SWF_PLAYER_CAPABILITY.execution) return false;
  if (player.capabilities?.sandbox !== SWF_PLAYER_CAPABILITY.sandbox) return false;
  if (typeof player.supports === "function") return player.supports(metadata) === true;
  const versions = player.capabilities?.versions?.[metadata.avm];
  return (
    Array.isArray(player.capabilities?.compression) &&
    player.capabilities.compression.includes(metadata.compression) &&
    Array.isArray(versions) &&
    versions.length === 2 &&
    metadata.version >= versions[0] &&
    metadata.version <= versions[1]
  );
}

export function assessSwfCompatibility(source, { player } = {}) {
  const metadata = inspectSwf(source);
  if (!metadata.isSwf) {
    return {
      compatible: false,
      status: "rejected",
      classification: "not-swf",
      route: "use-jump-package-validator",
      metadata,
    };
  }

  const classification = metadata.truncated
    ? "invalid-swf"
    : metadata.avm === "avm1"
      ? "legacy-avm1"
      : metadata.avm === "avm2"
        ? "legacy-avm2"
        : "legacy-swf-unknown-avm";
  const structurallySupported =
    !metadata.truncated &&
    metadata.avm !== "unknown" &&
    isVersionSupported(metadata) &&
    metadata.compression !== "lzma";
  const status = metadata.truncated
    ? "rejected"
    : metadata.avm === "unknown"
      ? metadata.compression === "lzma"
        ? "conversion-required"
        : "rejected"
      : !structurallySupported
      ? "conversion-required"
      : playerSupports(player, metadata)
        ? "playable"
        : "player-required";
  const route = metadata.truncated
    ? "repair-or-re-export-swf"
    : status === "playable"
      ? "zuku-owned-swf-player"
      : structurallySupported
        ? "provide-zuku-owned-swf-player"
        : CONVERSION_ROUTES[metadata.avm];

  return {
    compatible: status === "playable",
    status,
    executable: status === "playable",
    classification,
    route,
    metadata,
    playerCapability: SWF_PLAYER_CAPABILITY,
    message:
      status === "playable"
        ? "zuku 자체 SWF 플레이어 경계에서만 원본을 실행할 수 있습니다."
        : status === "player-required"
          ? "원본 SWF는 zuku 자체 플레이어가 아직 필요합니다. 브라우저 플러그인을 사용하지 않습니다."
          : status === "conversion-required"
            ? "SWF 버전 또는 압축 형식이 자체 플레이어 지원 범위 밖입니다. HTML5/WASM으로 변환하세요."
            : "SWF 구조 또는 AVM을 판정할 수 없습니다. 안전을 위해 실행하지 않고 변환 경로를 사용하세요.",
  };
}

export function createConvertedPackageProvider(provider) {
  if (!provider || typeof provider.load !== "function") {
    throw new TypeError("provider must implement load()");
  }
  return Object.freeze({
    async load(source, target = "pc") {
      const bytes = asBytes(source);
      const assessment = assessSwfCompatibility(bytes);
      if (assessment.metadata.isSwf) {
        throw new Error(
          `변환 패키지 provider는 SWF를 로드하지 않습니다 (${assessment.status}); 경로: ${assessment.route}`,
        );
      }
      return provider.load(bytes, target);
    },
    async playOriginal(source, target = "pc") {
      const bytes = asBytes(source);
      const assessment = assessSwfCompatibility(bytes, { player: provider });
      if (assessment.status !== "playable" || typeof provider.playOriginal !== "function") {
        const error = new Error(
          `${assessment.message} (${assessment.classification}); 상태: ${assessment.status}`,
        );
        error.code = "SWF_PLAYER_REQUIRED";
        error.assessment = assessment;
        throw error;
      }
      return provider.playOriginal(bytes, target, assessment);
    },
    start: (...args) => provider.start?.(...args),
    pause: (...args) => provider.pause?.(...args),
    stop: (...args) => provider.stop?.(...args),
  });
}

export const SWF_CONVERSION_ROUTES = CONVERSION_ROUTES;
