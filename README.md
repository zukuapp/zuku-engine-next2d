<!-- BEGIN ZUKU OFFICIAL BRAND -->
<!-- markdownlint-disable MD033 MD041 -->
<p align="center">
  <a href="https://docs.zuzunza.com/">
    <picture>
      <source media="(prefers-color-scheme: dark)"
        srcset="docs/branding/zuku-logo-dark.png">
      <img src="docs/branding/zuku-logo-light.png"
        alt="ZUKU" width="320">
    </picture>
  </a>
</p>
<p align="center">ZUKU - 내가 불러 일으키는 새로운 창작.</p>
<!-- markdownlint-enable MD033 MD041 -->
<!-- END ZUKU OFFICIAL BRAND -->

# zuku-engine-next2d: Jump 공개 계약과 어댑터

![version](https://img.shields.io/badge/version-v27.26102701-informational)

## 개요

이 저장소는 ZUKU Jump의 ZIP 패키지 검증기, 매니페스트 스키마, 런타임 경계, Next2D 연결 어댑터를 공개합니다. 플랫폼의 완전한 게임 호스트와 운영 샌드박스 구현은 이 패키지에 포함되지 않습니다.

| 문서 | 내용 |
| --- | --- |
| [`schemas/jump-manifest.schema.json`](schemas/jump-manifest.schema.json) | `jump.manifest.json`의 전체 JSON Schema |
| [`contracts/jump-runtime.contract.json`](contracts/jump-runtime.contract.json) | 공개 실행 경계와 한도 |
| [`docs/package-validation.md`](docs/package-validation.md) | ZIP 검증 정책과 한도 |
| [`docs/swf-backend-selection.md`](docs/swf-backend-selection.md) | SWF 백엔드 선택과 검증 결과 |

Jump ZIP 패키지의 요건은 다음과 같습니다.

| 항목 | 값 |
| --- | --- |
| 루트 필수 파일 | `index.html`, `jump.manifest.json` |
| `schema_version` | `"1"` |
| `entry_point` | `"index.html"` |
| `format` | `"html5"` 또는 `"wasm"` |
| PC 패키지 상한 | 500 MiB |
| 모바일 패키지 상한 | 100 MiB |

최소 예제는 [`fixtures/sample-jump/jump.manifest.json`](fixtures/sample-jump/jump.manifest.json)입니다.

## 요구 사항

- Node.js 20 (CI 기준 버전)
- npm

## 설치

```sh
git clone https://github.com/zukuapp/zuku-engine-next2d.git
cd zuku-engine-next2d
npm ci
npm test
```

## 사용법

### 예제 패키지 검증

1. 저장소의 예제로 ZIP을 만듭니다.
2. 검증기를 실행합니다.

```sh
node --input-type=module -e "import { zipSync } from 'fflate'; import { readFileSync, writeFileSync } from 'node:fs'; writeFileSync('sample-jump.zip', zipSync({ 'index.html': readFileSync('fixtures/sample-jump/index.html'), 'jump.manifest.json': readFileSync('fixtures/sample-jump/jump.manifest.json') }))"
node --input-type=module -e "import { validatePackage } from './src/package-validator.mjs'; const result = await validatePackage('sample-jump.zip'); console.log(result.valid, result.manifest.title)"
```

### Node.js API

```js
import { validatePackage } from './src/package-validator.mjs';

const result = await validatePackage('./game.zip', 'pc');
console.log(result.manifest, result.sha256);
```

| 함수 | 입력 | 동작 |
| --- | --- | --- |
| `validatePackage(path, target)` | ZIP 파일 경로, `'pc'` 또는 `'mobile'` | 파일을 읽어 `validatePackageBytes`와 같은 검사를 수행합니다. |
| `validatePackageBytes(bytes, target)` | `ArrayBuffer` 또는 typed byte view | ZIP 구조, 크기 한도, 매니페스트 JSON Schema, 대상 플랫폼을 검사합니다. |

브라우저 검증기는 `./browser-validator`로 가져옵니다. 세부 정책은 [패키지 검증 문서](docs/package-validation.md)에 있습니다.

### 검증 범위

- `validatePackage`는 실행 샌드박스가 아닙니다. 검증 통과는 게임 실행 성공을 의미하지 않습니다.
- `Next2DAdapter`는 호스트가 제공한 `load`, `start` 등의 메서드를 연결합니다.
- `Next2DAdapter`는 권한 격리와 자원 한도를 집행하지 않습니다.

### SWF와 `.zwf` 형식

- 이 저장소는 브라우저 플러그인이나 범용 SWF 실행기가 아닙니다.
- SWF 원본의 검증과 실행 범위는 [SWF 백엔드 문서](docs/swf-backend-selection.md)에 정의돼 있습니다.
- SWF 실행 여부는 호스트의 플레이어, 권한, 샌드박스 계약이 결정합니다.
- HTML5 ZIP을 ZWF2 `.zwf`로 만드는 도구는 [`zwf`](https://github.com/zukuapp/zwf)입니다.
- ZUKBOX 런타임의 ZWF1 바이너리는 [`zukbox-runtime`](https://github.com/zukuapp/zukbox-runtime)의 별도 형식입니다.
- `jump.manifest.json`은 ZWF2 매니페스트와 호환되지 않습니다.

## 설정

매니페스트 스키마를 수정한 뒤에는 생성된 검증기를 갱신합니다.

| 명령 | 동작 |
| --- | --- |
| `npm run generate:manifest` | 스키마에서 검증기를 재생성합니다. |
| `npm run check:manifest` | 스키마와 생성된 검증기의 차이를 검사합니다. |
| `npm run lint` | 소스 파일의 구문을 검사합니다. |
| `npm test` | 매니페스트 검사와 테스트를 실행합니다. |

## 기여

- 패키지, 매니페스트, 런타임 계약을 바꾸면 해당 테스트와 스키마 또는 계약 파일을 함께 갱신합니다.
- 공개 범위와 기여 절차는 [CONTRIBUTING.md](CONTRIBUTING.md)를 따릅니다.
- 취약점 신고는 [SECURITY.md](SECURITY.md)를 따릅니다.
- 전체 공개 문서의 시작점은 [ZUKU 개발자 허브](https://github.com/zukuapp/.github/blob/main/docs/README.md)입니다.

## 변경 이력

[CHANGELOG.md](CHANGELOG.md)
