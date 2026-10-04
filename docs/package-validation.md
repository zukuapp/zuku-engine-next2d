<picture><source media="(prefers-color-scheme: dark)" srcset="branding/zuku-logo-dark.png"><img src="branding/zuku-logo-light.png" alt="ZUKU" width="320"></picture>

# Jump package validation / Jump 패키지 검증

Node and browser validators use the same metadata and semantic policy. The full
canonical `schemas/jump-manifest.schema.json` is compiled ahead of time; browser
validation needs no `eval`, relaxed CSP or Node runtime module. Run
`npm run generate:manifest` after schema changes and `npm run check:manifest`
to detect drift. UTF-8 JSON and the requested target platform must be valid.

Node와 브라우저는 같은 ZIP 및 매니페스트 정책을 사용합니다. 파일 경로는 전체
상대 경로를 보존합니다. 스키마를 수정하면 검증기를 재생성해야 합니다.

| Budget / 제한 | Value / 값 |
| --- | --- |
| PC compressed and total expanded bytes | 500 MiB |
| Mobile compressed and total expanded bytes | 100 MiB |
| Entries, including directories | 4,096 |
| Path depth / UTF-8 name bytes | 16 / 512 |
| Manifest uncompressed bytes | 256 KiB |
| Expansion ratio for entries at least 1 MiB | 250:1 |

Metadata is checked before inflation. Output budgets and CRC are checked while
inflating in bounded input chunks. Only the manifest is retained. Unsafe paths,
NFC/case aliases, file/directory collisions, encrypted/split/ZIP64 archives,
links/special files, inconsistent headers/descriptors, unaccounted local-file
regions and trailing DEFLATE data are rejected. Stored/DEFLATE entries,
optional signed/unsigned data descriptors and ordinary ZIP comments remain
supported. Non-ASCII member names require the UTF-8 flag.

`validatePackage(path)` checks a regular-file descriptor and compressed size
before allocating the input; concurrent growth or truncation causes an error.
`validatePackageBytes(bytes)` also accepts an ArrayBuffer or typed byte view.
Browser hashing requires WebCrypto in a secure context and reports its absence.
Large browser inputs should be validated in a dedicated Worker to keep the UI
responsive. Asset/native host execution and OS sandbox enforcement are separate
host responsibilities; successful validation does not prove gameplay.

패키지 검증은 실제 게임 실행, 운영체제 샌드박스, 배포 성공을 의미하지 않습니다.
