# Offline PDF dependencies

All resources are served from this application's own origin. No runtime CDN, credentials, remote renderer or telemetry is used. Assets load only after the PDF action; the loading promise is reused and failed requests may be retried.

- pdf-lib 1.17.1: official npm `pdf-lib@1.17.1`, `dist/pdf-lib.esm.min.js`, MIT, license included.
- @pdf-lib/fontkit 1.1.1: official npm release, `dist/fontkit.umd.min.js`, MIT as declared by upstream metadata/README (both preserved). The bundled UMD entry is adapted to ESM by passing `globalThis` instead of top-level `this` and exporting `globalThis.fontkit`; this avoids an unresolved runtime pako import. The bundle contains its dependencies.
- Noto Sans TC: official Google Fonts source https://github.com/google/fonts/tree/main/ofl/notosanstc, SIL OFL 1.1 (included). `NotoSansTC[wght].ttf` instantiated at weight400 using fontTools varLib.instancer. No glyphs removed in the shipped font. Exported PDF embeds only used glyphs. Unsupported characters remain as explicit [U+CODEPOINT] text instead of crashing or silently disappearing.

`manifest.json` pins the exact distributed asset hashes. The publication checker rejects changed/unreviewed vendor files. This license attribution applies to the PDF dependencies only, not the financial/news datasets.
