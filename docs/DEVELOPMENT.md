# Development

SwitchCard ships as one file, `SwitchCard.html`, but it is edited as a small source tree and assembled by a dependency-free Python script. Nothing here changes what users receive: the committed `SwitchCard.html` is the build output.

## Layout

| Path | Contents |
|------|----------|
| `src/index.html` | HTML shell (header, Build panel, Maintain panel, footer). The lines `@@STYLES@@` and `@@SCRIPT@@` mark where the CSS and JS are inlined. |
| `src/styles.css` | The single `<style>` block. |
| `src/js/NN-*.js` | The single `<script>` block, split at the code-map sections and concatenated in file-name order. All files share one scope, so nothing is exported or imported. |
| `build.py` | Assembles `SwitchCard.html`; `--check` fails when the committed file differs from the build. |
| `tests/` | pytest + Playwright browser tests against the built file, plus `tests/golden/` with the expected `editcontent.txt` of every built-in example. |
| `.github/workflows/ci.yml` | Build drift check, browser tests, SHA-256 of the shipped file. |
| `.github/workflows/pages.yml` | Publishes the built file as a GitHub Pages demo. |

## Build

```bash
python build.py
```

Writes `SwitchCard.html` and prints its SHA-256. Commit the output together with the source change; CI runs `python build.py --check` and fails if they drift.

## Tests

```bash
pip install -r requirements-dev.txt
python -m playwright install chromium
python -m pytest -q
```

The tests open the built file in headless Chromium and call the page's own functions (`generate`, `validateProject`, `zip`, ...) through `page.evaluate`, so they exercise exactly the shipped code. Every fresh browser context starts without an autosave, which is why the examples generate deterministically.

Golden files: `tests/golden/example-N.txt` hold the exact CRLF bytes each built-in example produces. When an output change is intended, regenerate them and review the diff:

```bash
python -m pytest -q --update-golden
```

An unintended change to a golden file is the signal that a "no output change" claim in the changelog is wrong.

## Release

1. Bump the version in `src/js/01-config.js` (`RELEASE`), `src/index.html` (header comment, release label, footer) and `CHANGELOG.md`; bump `PROJECT_VERSION` only when older releases must refuse the new project files.
2. `python build.py`, run the tests, commit.
3. Tag and publish the built file with its hash so users can verify a downloaded copy:

```bash
git tag -a v0.7.0 -m "SwitchCard v0.7.0"
git push origin main --tags
sha256sum SwitchCard.html
gh release create v0.7.0 SwitchCard.html --title "SwitchCard v0.7.0" --notes-file release-notes.md
```

## Ground rules for changes

- Keep the safety invariants listed at the top of `src/js/01-config.js`: preview text equals the ZIP's `editcontent.txt`, whole-file printable ASCII, export gates, no silent overwrite of stored data, no network access.
- New per-recipe or per-project fields must be optional with a default so older files open unchanged, and must be covered by `validateProject`, the draft collector and the tests.
- No dependencies, no CDN, no build tooling beyond Python's standard library.
