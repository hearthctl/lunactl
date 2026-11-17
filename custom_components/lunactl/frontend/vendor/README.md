# Lit 3.3.1

`lit-all.min.js` is the unmodified all-in-one ES module from
<https://cdn.jsdelivr.net/gh/lit/dist@3.3.1/all/lit-all.min.js>.
It includes LitElement, lit-html and the Lit directives; it has no external
imports. The adjacent BSD license is from the Lit 3.3.1 release.

SHA-256: `e44caa21b3f434eccbb580c00dba2d895aa81c65fc0bf84524ca4326fffaf3ae`.
`make check-frontend` verifies this digest before checking syntax and running
the Node tests. To update Lit, replace the release URL, file, license and
digest together. No npm or build step is used.

# Preview fonts

- `nunito-800.ttf`: Nunito ExtraBold, static weight 800, version 3.602,
  unmodified from
  <https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDDsmRTM.ttf>
  (Google Fonts `family=Nunito:wght@800`). SIL Open Font License 1.1 in
  `Nunito-OFL.txt`.
  SHA-256: `c5776505c7b3df3c3ca763477b795d6bbc6517760bede0462ab77d1fb44954a6`.
- `materialdesignicons-webfont.woff2`: unmodified Material Design Icons v7.4.47
  from <https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/fonts/materialdesignicons-webfont.woff2>.
  License and attribution in `MDI-LICENSE`; the font license is included in
  `Apache-2.0.txt`.
  SHA-256: `662fefa8f2f8a95c18588d21774789c107c64e771cbe65a69af46291c4311afc`.

`make check-frontend` verifies both font digests. The integration serves them
under the same versioned static path as Lit. The preview registers FontFaces
using URLs relative to its module; it makes no requests to a font CDN at runtime.
When updating a font, update the file, source/version, license and digest together.
`icons.js` mirrors `esphome/lunactl/icons.h`; a Node test compares all glyphs.
