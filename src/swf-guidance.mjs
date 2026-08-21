import { assessSwfCompatibility } from "./swf-compat.mjs";

export function createSwfUnsupportedView(container, assessment) {
  if (!container || typeof document === "undefined") return;
  const detail = assessment ?? {
    classification: "legacy-swf",
    status: "player-required",
    route: "provide-zuku-owned-swf-player",
  };
  container.replaceChildren();
  const panel = document.createElement("section");
  panel.setAttribute("role", "alert");
  panel.innerHTML = `
    <h2>zuku 자체 SWF 플레이어가 필요합니다</h2>
    <p>원본 SWF는 zuku 소유의 AVM 실행 계층과 unprivileged sandbox 경계에서만 실행할 수 있습니다.</p>
    <p>Ruffle, ActiveX, NPAPI 및 브라우저 Flash 플러그인은 사용하지 않습니다.</p>
    <p>호환성: <strong>${detail.classification}</strong></p>
    <p>판정 상태: <strong>${detail.status}</strong></p>
    <p>권장 변환 경로: <code>${detail.route}</code></p>
    <p>변환 후 <code>jump.manifest.json</code>과 <code>index.html</code>이 포함된 HTML5/WASM ZIP을 제출하세요.</p>
  `;
  container.append(panel);
}

export function renderSwfValidationResult(source) {
  const assessment = assessSwfCompatibility(source);
  return {
    ...assessment,
    executable: assessment.status === "playable",
    guidance:
      assessment.metadata.isSwf && assessment.status === "playable"
        ? "zuku 자체 SWF 플레이어 경계에서 원본 SWF를 재생할 수 있습니다."
        : assessment.metadata.isSwf
          ? assessment.status === "player-required"
            ? "자체 SWF 플레이어가 필요합니다. 현재 실행 계층이 없어 안전하게 재생하지 않습니다."
            : "자체 플레이어 지원 범위 밖입니다. 변환된 HTML5/WASM Jump 패키지가 필요합니다."
        : "SWF가 아니므로 HTML5/WASM Jump 패키지 검증기를 사용하세요.",
  };
}
