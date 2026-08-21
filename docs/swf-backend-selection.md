# SWF backend 조사 및 선택 기준

## 결론

AwayFL을 optional provider wiring으로 연결하되 기본 backend로 강제하지 않는다.
`swf-backend` 인터페이스와 `jump.manifest.json`의 optional `swf_backend` capability를
사용하며, 실행 구현은 zuku-owned provider가 공개 실행 계약을 통과한 경우에만 주입한다.

“Ruffle보다 가볍다”는 표현은 동일한 SWF corpus, 동일한 최적화 수준, 동일한
압축 방식과 기능 테스트를 사용한 측정 없이는 사용하지 않는다. 비교해야 할 값은
최소한 browser payload의 raw/minified/gzip/brotli 크기, 초기화 시간, peak memory,
AVM1/AVM2 호환성 및 샌드박스 경계 검증 결과다.

## 후보 비교

| 후보 | 범위·실행 형태 | 유지보수 근거 | 라이선스 | 이번 결정 |
|---|---|---|---|---|
| AwayFL `@awayfl/avm1` / `@awayfl/avm2` + `@awayfl/swf-loader` | TypeScript/JavaScript AVM1·AVM2 계층 및 SWF loading primitive, 브라우저 지향 | npm latest: AVM1 `0.2.181`, AVM2 `0.2.236`, loader `0.4.133` 확인 (2026-08-21) | Apache-2.0 | optional wiring 적용. 완전한 SWF player·렌더러·sandbox bridge는 zuku가 주입해야 함 |
| Lightspark | C/C++ standalone/plugin Flash player, AVM 범위 넓음 | 공식 저장소 및 2026-07 development release 확인 | LGPL-3.0 | 활성 후보이나 공식 WASM/browser build가 확인되지 않고 native 의존성이 큼. 보류 |
| Gnash | 주로 SWF 7/8/일부 9, AVM1 중심 | 마지막 실질 변경 2019년으로 확인 | GPL-3.0 | 유지보수·AVM2·현대 빌드 요건이 부적합. 제외 |
| Adobe `avmplus`/Tamarin | AVM2 VM 핵심, Flash API/player 아님 | GitHub archive, 2020년 read-only 전환 | MPL-2.0 | 참고 구현일 뿐 직접 backend로 보류 |

근거 링크:

- [AwayFL](https://awayfl.org/)
- [`@awayfl/avm1`](https://github.com/awayfl/avm1)
- [`@awayfl/avm2`](https://github.com/awayfl/avm2)
- [Lightspark](https://github.com/lightspark/lightspark)
- [Gnash](https://github.com/strk/gnash)
- [Adobe avmplus](https://github.com/adobe/avmplus)

## 계약

`createSwfBackendAdapter()`는 provider에 다음 공개 capability를 요구한다.

- interface version `1`
- `zuku-owned-avm` 실행 경계
- `unprivileged` sandbox
- `jump-runtime-contract` 리소스 정책
- 원본 SWF 직접 실행 명시
- browser plugin, ActiveX, NPAPI, Ruffle 모두 비활성

manifest의 `swf_backend`는 optional이며, 선언할 경우 WASM 패키지에서만 허용한다.
provider 이름과 AVM 범위는 선택된 backend capability와 일치해야 한다. 실제 syscall
필터 규칙과 memory accounting 내부는 이 계약에 포함하지 않는다.

## 적용 및 검증 경계

1. `createAwayflBackend()`가 세 패키지를 optional dynamic import하고 AVM metadata에 따라
   AVM1/AVM2 모듈을 선택한다.
2. `runtimeFactory`가 없으면 `AWAYFL_RUNTIME_REQUIRED`를 반환한다. 따라서 AVM 모듈 로딩을
   SWF 전체 실행 성공으로 표시하지 않는다.
3. zuku-owned runtime bridge가 SWF loader, 렌더러, 공개 리소스 계약과 unprivileged sandbox
   경계를 구현한 뒤에만 `createSwfBackendAdapter()`에 주입한다.
4. 고정 SWF corpus로 태그·압축·버전 판정과 원본 실행 결과를 회귀 테스트한다.
5. 동일 브라우저 대상의 payload, 초기화 시간, peak memory와 AVM 호환성을 측정하고,
   직접 및 transitive 라이선스 NOTICE를 갱신한 뒤 provider를 활성화한다.
