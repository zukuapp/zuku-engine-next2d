# SWF backend 조사 및 선택 기준

## 결론

AwayFL은 optional provider wiring으로 연결하며 기본 backend로 강제하지 않습니다.
`swf-backend` 인터페이스와 `jump.manifest.json`의 optional `swf_backend` capability를
사용합니다.

backend 간 비교는 동일한 SWF corpus, 최적화 수준, 압축 방식, 기능 테스트로
다음 항목을 측정합니다.

- browser payload의 raw/minified/gzip/brotli 크기
- 초기화 시간
- peak memory
- AVM1/AVM2 호환성
- 샌드박스 경계 검증 결과

## 후보 비교

| 후보 | 범위·실행 형태 | 유지보수 근거 | 라이선스 | 결정 |
|---|---|---|---|---|
| AwayFL `@awayfl/avm1` / `@awayfl/avm2` + `@awayfl/swf-loader` | TypeScript/JavaScript AVM1·AVM2 계층 및 SWF loading primitive, 브라우저 지향 | 이 저장소의 `package.json`에 고정된 버전: AVM1 `0.2.181`, AVM2 `0.2.236`, loader `0.4.133` | Apache-2.0 | optional wiring으로 적용합니다. 완전한 SWF player·렌더러·sandbox bridge는 zuku가 주입합니다. |
| Lightspark | C/C++ standalone/plugin Flash player, AVM 범위 넓음 | 2026-07 development release | LGPL-3.0 | 활성 후보이지만 native 의존성이 커서 보류합니다. |
| Gnash | 주로 SWF 7/8/일부 9, AVM1 중심 | 마지막 실질 변경 2019년 | GPL-3.0 | 유지보수·AVM2·현대 빌드 요건이 맞지 않아 제외합니다. |
| Adobe `avmplus`/Tamarin | AVM2 VM 핵심, Flash API/player 아님 | GitHub archive, 2020년 read-only 전환 | MPL-2.0 | 직접 backend로는 보류합니다. |

근거 링크:

- [AwayFL](https://awayfl.org/)
- [`@awayfl/avm1`](https://github.com/awayfl/avm1)
- [`@awayfl/avm2`](https://github.com/awayfl/avm2)
- [Lightspark](https://github.com/lightspark/lightspark)
- [Gnash](https://github.com/strk/gnash)
- [Adobe avmplus](https://github.com/adobe/avmplus)

## 계약

`createSwfBackendAdapter()`는 provider에 다음 공개 capability를 요구합니다.

- interface version `1`
- `zuku-owned-avm` 실행 경계
- `unprivileged` sandbox
- `jump-runtime-contract` 리소스 정책
- 원본 SWF 직접 실행 명시
- browser plugin, ActiveX, NPAPI, Ruffle 모두 비활성

manifest의 `swf_backend`는 optional이며 WASM 패키지에서만 허용합니다.
provider 이름과 AVM 범위는 선택된 backend capability와 일치해야 합니다.

## 적용 및 검증 경계

1. `createAwayflBackend()`가 세 패키지를 optional dynamic import하고 AVM metadata에 따라
   AVM1/AVM2 모듈을 선택합니다.
2. `runtimeFactory`가 없으면 `playOriginal()`이 `AWAYFL_RUNTIME_REQUIRED` 코드의 오류를 던집니다.
   `capabilities.execution_ready`는 `runtimeFactory`가 있고 모든 패키지가 로드됐을 때만 `true`입니다.
3. zuku-owned runtime bridge는 SWF loader, 렌더러, 공개 리소스 계약, unprivileged sandbox
   경계를 구현한 뒤에만 `createSwfBackendAdapter()`에 주입합니다.
4. 고정 SWF corpus로 태그·압축·버전 판정과 원본 실행 결과를 회귀 테스트합니다.
5. 동일 브라우저 대상의 payload, 초기화 시간, peak memory, AVM 호환성을 측정합니다.
6. 직접 및 transitive 라이선스 NOTICE를 갱신한 뒤 provider를 활성화합니다.
