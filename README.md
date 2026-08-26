# zuku-engine-next2d

Next2D 기반 **공개 Jump 엔진**과 패키지 계약입니다.  
Jump 게임은 WASM/HTML5 ZIP으로 배포되며, unprivileged 샌드박스 **경계** 안에서 실행됩니다.

> 매니페스트 스키마: [`schemas/jump-manifest.schema.json`](schemas/jump-manifest.schema.json)  
> CLI: [`zuku-cli`](https://github.com/zukuapp/zuku-cli) · API: [`zuku-api`](https://github.com/zukuapp/zuku-api)

## 범위

- Jump 패키지 형식 · `jump.manifest.json` 계약
- Next2D 플레이어 연동 표면
- SWF 원본에 대한 **검증·가이던스** (플레이어 필수 / 변환 필요 등)
- 리소스 한도(예: PC 권장 패키지 상한, 모바일 축소 한도)는 스키마·문서를 따름

이 저장소는 샌드박스 **syscall 필터·메모리 카운팅 내부**를 공개하지 않습니다.  
공개하는 것은 경계·한도·인터페이스 계약뿐입니다.

## SWF 관련

레거시 SWF를 그대로 “Ruffle만으로 대체한다”는 서술을 하지 않습니다.  
검증 결과는 `player-required` · `playable` · `conversion-required` · `rejected` 등으로 안내하며,  
실행 가능 여부는 zuku 소유 provider·capability·샌드박스 계약에 따릅니다.

```js
import { renderSwfValidationResult } from "@zuku/engine-next2d/swf-guidance";

const result = renderSwfValidationResult(swfBytes);
// result.status, result.executable
```

세부: [`docs/swf-backend-selection.md`](docs/swf-backend-selection.md)

## 개발

```bash
npm install
npm test
```

## 관련

- [zuku-cli](https://github.com/zukuapp/zuku-cli)
- [zukbox-runtime](https://github.com/zukuapp/zukbox-runtime) — `.zwf` WASM 런타임
- [zuku-docs](https://github.com/zukuapp/zuku-docs)

---

**ZUKU (즈쿠)** · Tresillo · [zuzunza.com](https://zuzunza.com)
