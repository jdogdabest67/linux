# UNX Inspector build

The UNX Inspector is a read-only browser tool for inspecting supported parts of GameMaker `.unx` / `data.win` files.

## Open it

Visit the [UNX Inspector on GitHub Pages](https://jdogdabest67.github.io/linux/unx-inspector.html), then choose a local data file or drop it into the page. The selected file is processed in your browser. It is not uploaded, changed, or patched.

## Repository layout

- `unx-inspector.html`: browser interface.
- `gm-data-reader.js`: FORM chunk and metadata reader.
- `gm-code-scan.js`: compiled bytecode reference scanner.
- `tests/`: synthetic parser tests and a DOM smoke test.
- `tools/`: local research command-line utilities.
- `docs/TECHNICAL-REPORT-REAL-FILE.md`: findings and limitations from one real Chapter 1 data file.

## Tests

Requires Node.js 18 or newer:

```sh
node --check gm-data-reader.js
node --check gm-code-scan.js
node tests/test-reader.js
node tests/ui-smoke.js
```

The synthetic reader tests run without a game file. To run the optional real-file assertions and UI smoke test, set `GM_REAL_FILE` to the path of a game data file that you are authorized to inspect:

```sh
GM_REAL_FILE=/path/to/game.unx node tests/test-reader.js
GM_REAL_FILE=/path/to/game.unx node tests/ui-smoke.js
```

The research CLIs can be run locally:

```sh
node tools/probe-code.js /path/to/game.unx names enemy
node tools/extract-encounters.js /path/to/game.unx
```

Do not commit generated game-data dumps or redistribute proprietary game files or extracted assets.

## Limits

This is an analysis tool, not a GML decompiler or game patcher. It only parses the structures listed as supported in the technical report. Object event tables, complete room contents, textures, audio, exact engine version detection, and some bytecode branches remain unsupported or unverified. Findings from one game build do not establish compatibility with every GameMaker file.
