<a href="https://zukuapp.github.io/docs/">
  <img src="https://raw.githubusercontent.com/zukuapp/.github/main/profile/assets/developer-hero.png" alt="Trecillo × ZUKU 개발자 문서" width="760">
</a>

# zuku-engine-next2d: Jump 공개 계약과 어댑터

이 저장소는 ZUKU Jump의 **ZIP 패키지 검증기, 매니페스트 스키마, 런타임 경계와 Next2D 연결 어댑터**를 공개합니다. 플랫폼의 완전한 게임 호스트나 운영 샌드박스 구현은 이 패키지에 들어 있지 않습니다.

## 먼저 읽을 계약

| 문서 | 내용 |
| --- | --- |
| [`schemas/jump-manifest.schema.json`](schemas/jump-manifest.schema.json) | `jump.manifest.json`의 전체 JSON Schema |
| [`contracts/jump-runtime.contract.json`](contracts/jump-runtime.contract.json) | 공개 실행 경계와 한도 |
| [`docs/swf-backend-selection.md`](docs/swf-backend-selection.md) | SWF 백엔드 선택과 검증 결과 |

Jump ZIP은 루트에 `index.html`과 `jump.manifest.json`을 포함합니다. 매니페스트의 `schema_version`은 `"1"`, `entry_point`는 `"index.html"`, `format`은 `"html5"` 또는 `"wasm"`입니다. [최소 예제](fixtures/sample-jump/jump.manifest.json)를 참고하세요. PC 패키지 상한은 500 MiB, 모바일 상한은 100 MiB로 공개 계약에 정의돼 있습니다.

## 로컬에서 검사하기

```sh
git clone https://github.com/zukuapp/zuku-engine-next2d.git
cd zuku-engine-next2d
npm ci
npm test
```

저장소의 예제로 검증기를 직접 실행하려면 다음과 같이 ZIP을 만드세요.

```sh
node --input-type=module -e "import { zipSync } from 'fflate'; import { readFileSync, writeFileSync } from 'node:fs'; writeFileSync('sample-jump.zip', zipSync({ 'index.html': readFileSync('fixtures/sample-jump/index.html'), 'jump.manifest.json': readFileSync('fixtures/sample-jump/jump.manifest.json') }))"
node --input-type=module -e "import { validatePackage } from './src/package-validator.mjs'; const result = await validatePackage('sample-jump.zip'); console.log(result.valid, result.manifest.title)"
```

ZIP 파일이 있다면 Node.js에서 검증기를 호출할 수 있습니다.

```js
import { validatePackage } from './src/package-validator.mjs';

const result = await validatePackage('./game.zip', 'pc');
console.log(result.manifest, result.sha256);
```

`validatePackage`는 ZIP 크기와 필수 파일, 일부 경로 및 매니페스트 필드를 확인합니다. **전체 JSON Schema 검증기나 실행 샌드박스가 아닙니다.** 스키마 전체에 맞는지 확인해야 하는 도구는 별도 JSON Schema 검증을 수행해야 합니다. `Next2DAdapter`도 호스트가 제공한 `load`·`start` 등의 메서드를 연결하며, 권한 격리나 자원 한도를 직접 집행하지 않습니다.

## SWF와 다른 `.zwf` 형식

SWF 원본에 대한 검증과 실행 가능성 안내는 [SWF 백엔드 문서](docs/swf-backend-selection.md) 및 관련 소스의 결과 상태를 따릅니다. 이 저장소를 브라우저 플러그인이나 범용 SWF 실행기로 해석하지 마세요. 실행 여부는 호스트가 가진 플레이어·권한·샌드박스 계약에 달려 있습니다.

HTML5 ZIP을 **ZWF2 `.zwf`**로 만드는 별도 도구는 [`zwf`](https://github.com/zukuapp/zwf)입니다. ZUKBOX 런타임의 이전 **ZWF1 바이너리**는 [`zukbox-runtime`](https://github.com/zukuapp/zukbox-runtime)의 다른 형식입니다. 여기의 `jump.manifest.json`을 ZWF2 매니페스트로 바꿔 사용하지 마세요.

## 기여

패키지·매니페스트·런타임 계약을 바꾸면 해당 테스트와 스키마 또는 계약 파일을 함께 갱신해 주세요. 공개 범위와 기여 절차는 [CONTRIBUTING.md](CONTRIBUTING.md), 취약점 신고는 [SECURITY.md](SECURITY.md)를 따릅니다. 전체 공개 문서의 시작점은 [ZUKU 개발자 허브](https://github.com/zukuapp/.github/blob/main/docs/README.md)입니다.
