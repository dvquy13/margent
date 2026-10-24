# Corpus fixtures

`margent/` is a frozen copy of this repo's `docs/` folder, without `docs/results/`. The corpus walks in `test/` read it instead of the live docs, so a walk does not change when the docs change.

The copy is refreshed deliberately, by replacing its content with the current `docs/` (minus `results/`) and running `npm run test:full`. Tests never write to this folder. Helpers that expose the path are in `test/helpers/corpus.mjs`.
