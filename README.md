# Cavalry MoGraph Panel

A Cinema 4D-style MoGraph panel for Cavalry. Create Cloners, Effectors, and
Fields with one click — they build and auto-wire native Cavalry layers.

## Install
1. `node build.js --install` — builds `dist/MoGraph.js` and copies it to
   `%APPDATA%\Cavalry\Scripts\MoGraph.js`.
2. In Cavalry: Scripts menu → MoGraph. Dock the panel where you like.

## Develop
- Edit files in `src/`. Run `npm test` (`node --test`) for the logic suite.
- `node build.js` regenerates `dist/MoGraph.js`.
- In Cavalry's JS Editor you can run `MG.selftest()` and read the report in
  the JS Console to verify every recipe against the live app.

## Verifying Cavalry attribute names
Some attribute strings in `src/typemap.js` (`paths`, generator config, field
`shapeType`, the `math` combiner `operation`) are best-known and confirmed by
`MG.selftest()` running live in Cavalry. If a recipe does nothing in the app,
run the self-test, check `report.warnings`, and correct the string in
`src/typemap.js` (and the matching unit test).
