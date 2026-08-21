# zuku-engine-next2d

Next2D 기반 zuku Jump 실행 및 패키지 계약의 공개 골격입니다.

온라인 패키지는 WASM/HTML5 ZIP을 사용하며 PC 기본 한도는 500MB, 모바일은 인증된 경우 100MB입니다.
실행 경계는 unprivileged 샌드박스 계약을 따르며, 사유 syscall 필터와 메모리 계측 내부는
이 공개 레포에 포함하지 않습니다.

manifest 예시는 [`schemas/jump-manifest.schema.json`](schemas/jump-manifest.schema.json)을
확인하세요.

## 레거시 SWF 호환 경계

이 공개 엔진은 Ruffle, 브라우저 플러그인, ActiveX, NPAPI 또는 Flash 플러그인을
사용하지 않습니다. SWF의 시그니처·압축 방식·버전·일부 태그를 판독하고
AVM1/AVM2 및 자체 플레이어 지원 상태를 판정합니다. 원본 SWF는 zuku 자체
플레이어/AVM 실행 계층이 unprivileged sandbox, 공개 리소스 한도와 capability
정책을 적용할 때만 재생할 수 있습니다. 현재 이 저장소에는 AVM 전체 구현이 없으므로
기본 결과는 `player-required`이며, 지원 범위 밖이면 변환을 요구합니다.

```js
import { renderSwfValidationResult } from "@zuku/engine-next2d/swf-guidance";

const result = renderSwfValidationResult(swfBytes);
// result.status: player-required | playable | conversion-required | rejected
// 자체 player가 없으면 result.executable === false
```

변환 결과에는 `jump.manifest.json`과 `index.html` 진입점이 있어야 하며,
그 다음 일반 Jump 패키지 검증 및 WASM/HTML5 샌드박스 실행 계약을 따릅니다.

`createConvertedPackageProvider`의 `playOriginal`은 capability를 명시한
zuku-owned provider에만 위임합니다. syscall filter와 memory accounting의
proprietary 내부 구현은 이 공개 계약에 포함되지 않습니다.

### 선택적 SWF backend

외부 런타임을 기본 의존성으로 포함하지 않습니다. `swf-backend`의
`createSwfBackendAdapter()`는 zuku-owned AVM provider를 공개 capability와
unprivileged sandbox 계약으로 검증한 뒤에만 원본 SWF 실행을 위임합니다.
패키지 manifest의 `swf_backend` capability는 선택 사항이며 WASM 패키지에서만
허용됩니다.

AwayFL AVM 계층을 optional provider wiring으로 연결했습니다. `@awayfl/avm1@0.2.181`,
`@awayfl/avm2@0.2.236`, `@awayfl/swf-loader@0.4.133`은 Apache-2.0이며
설치·로딩 가능 여부를 런타임에 확인합니다. AwayFL은 AVM 및 SWF loading primitive를
제공하지만 이 저장소의 완전한 SWF player, 렌더러, zuku sandbox enforcement는
제공하지 않으므로 `runtimeFactory`를 주입하기 전에는 원본 실행이 준비되지 않습니다.
Lightspark는 활성 C/C++ 후보이나 공식
WASM browser build가 확인되지 않았고, Gnash와 avmplus/Tamarin은 각각 유지보수
또는 범위가 부족합니다. 따라서 “Ruffle보다 가볍다”는 주장은 측정 전 사용하지
않습니다. 비교 기준과 공식 링크는
[`docs/swf-backend-selection.md`](docs/swf-backend-selection.md)에 있습니다.

```js
import { createAwayflBackend } from "@zuku/engine-next2d/awayfl-backend";
import { createSwfBackendAdapter } from "@zuku/engine-next2d/swf-backend";

const awayfl = await createAwayflBackend({
  // zuku-owned player/sandbox bridge; AwayFL modules alone do not execute SWF.
  runtimeFactory: async ({ avm, avmModule, swfLoaderModule, source }) =>
    createZukuSandboxRuntime({ avm, avmModule, swfLoaderModule, source }),
});
const backend = createSwfBackendAdapter(awayfl);
```

`optionalDependencies`가 설치되지 않은 환경에서도 패키지 import 자체는 실패하지
않으며, `requirePackages: true`일 때만 명시적으로 실패합니다. AwayFL의 직접 및
transitive 의존성은 각 npm 배포물의 라이선스 고지를 따라야 하며, 배포 전 NOTICE와
라이선스 집계를 갱신해야 합니다.

## Contract file

`schemas/jump-manifest.schema.json`은 canonical ID, semver, `index.html` 진입점,
플랫폼 지원을 고정합니다.
