# SwitchCard v0.8.0 (Switches and Cards views) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a left rail with Switches and Cards views to v1 (a saved, CSV-compatible switch list per recipe and a per-switch export list), replace every browser pop-up with in-page dialogs, and make every check clickable — with byte-identical `editcontent.txt`.

**Architecture:** v1 stays one script concatenated from `src/js/NN-*.js` by `build.py`. New files: `04b-dialogs.js` (dialog kit), `09c-switches.js` (pure switch-list engine), `10b-views.js` (rail, Switches, Cards, click-to-focus), `11-boot.js` (async boot). `generate()` gains `findings` with locations; strings unchanged.

**Tech Stack:** plain ES2022 classic script, CSS, native `<dialog>`; tests pytest + Playwright (installed Edge via `SWITCHCARD_PW_CHANNEL=msedge`).

**Spec:** `docs/superpowers/specs/2026-10-10-switchcard-v080-switches-cards-design.md`

## Global Constraints

- Branch `v0.8-switches-cards`; commit identity `NamNeto <11177435+NamNeto@users.noreply.github.com>`; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push, tag or release without the owner's request.
- After every source change: `python build.py`, commit `SwitchCard.html` with the source (`build.py --check` in CI).
- Test command: `SWITCHCARD_PW_CHANNEL=msedge python -m pytest -q` (all tests, goldens included, must pass at the end of every task).
- `generate()` output bytes unchanged (`tests/golden/example-*.txt`); `errors`/`warnings` strings, order and de-duplication unchanged.
- Project files stay schema v5 (`PROJECT_VERSION` 5); `recipe.switches` optional; autosave key unchanged.
- Shipped file: no `confirm(`, `alert(`, `prompt(`; CSP unchanged; printable-ASCII output rules unchanged.
- `MAX_FLEET_ROWS` (500) caps switches per recipe.
- Version 0.8.0 only in Task 15.

## Review Focus

1. **Typing in a grid cell while the list re-renders** — focus and caret must stay in the cell (no full table rebuild on value edits). Test in Task 10.
2. **A stored row value for a placeholder the template no longer uses** must survive edits, save, re-open and CSV export must not emit it. Test in Task 8.
3. **Opening a v0.8.0 project in the async boot while an autosave dialog is pending** — no autosave write happens until the dialog is answered. Test in Task 5.
4. **CSV saved by Excel as ANSI (U+FFFD cells)** — the import dialog warns before rows are added. Test in Task 10.
5. **Cards "changed since" after a template edit** — exactly the rows whose text changed are offered by "Changed and new only". Test in Task 11.

---

## File structure

| File | Responsibility |
|---|---|
| `tests/conftest.py` | optional `SWITCHCARD_PW_CHANNEL`; wait for `bootDone` |
| `tests/helpers.py` | `click_dialog(page, label) -> str`, `stub_downloads(page)`, `downloads(page) -> list` |
| `src/js/04b-dialogs.js` | `el(tag, attrs, ...children)`, `showDialog`, `confirmDialog`, `infoDialog`, `writeDialog` |
| `src/js/05-validation.js` | `portVlanFindings(r)`; `portVlanErrors(r)` = its texts |
| `src/js/06-generate.js` | `findings` with `where` |
| `src/js/09c-switches.js` | switch-list engine (pure) |
| `src/js/10b-views.js` | rail, views, Switches and Cards DOM, Ports/Import/diff dialogs, `focusFinding` |
| `src/js/11-boot.js` | boot sequence (moved out of `10-events-boot.js`) |
| `tests/test_v080.py` | new tests (one section per task) |

`where` kinds (used by Tasks 2, 7, 13): `{kind:"field", key}`, `{kind:"port", name, attr}` (attr ∈ role, vlan, description, ip, mask), `{kind:"ports"}`, `{kind:"interfaces"}`, `{kind:"template"}`, `{kind:"sources"}`, `{kind:"file", line?, col?}`, `{kind:"policy"}`, `{kind:"row", key}`. (Ruling vs spec §8: no `roles` kind — v1 has no role-template-specific check; `ports` and `interfaces` added for the port-count and interface-family notes.)

---

### Task 1: Local test run with Edge, dialog/download helpers

**Files:** Modify `tests/conftest.py`, `tests/helpers.py`.

**Interfaces — Produces:** `click_dialog(page, label: str) -> str` (waits for `dialog[open]`, returns its inner text, clicks the `.dialog-actions` button whose text is exactly `label`); `stub_downloads(page)` (replaces global `download` with a recorder `window.__dl = [{name, text}]`, text read from the Blob); `downloads(page) -> list[dict]`.

- [ ] **Step 1:** `conftest.py`: `p.chromium.launch(channel=os.environ.get("SWITCHCARD_PW_CHANNEL") or None)`; page fixture waits for `"typeof generate === 'function' && typeof recipes !== 'undefined' && (typeof bootDone === 'undefined' || bootDone === true)"`.
- [ ] **Step 2:** add the three helpers to `helpers.py`. For ZIP blobs `stub_downloads` stores `{name, size, b64}` (base64 of bytes) instead of text when the name ends in `.zip`.
- [ ] **Step 3:** Run `SWITCHCARD_PW_CHANNEL=msedge python -m pytest -q` → Expected `47 passed`.
- [ ] **Step 4:** Commit `tests: run locally with the installed Edge; dialog and download helpers`.

### Task 2: Locations on every check

**Files:** Modify `src/js/05-validation.js` (`portVlanErrors` → `portVlanFindings`), `src/js/06-generate.js`. Test `tests/test_v080.py`.

**Interfaces — Produces:** `generate(r)` returns `{ text, errors, warnings, asciiIssue, findings: [{ level: "error"|"warning", text, where }] }`; `portVlanFindings(r) -> [{text, where}]`.

- [ ] **Step 1: Failing tests**

```python
def test_every_check_has_a_location_and_strings_are_unchanged(page):
    r = ev(page, r"""() => {
        const cases = recipes.map((x) => structuredClone(x));
        const bad = structuredClone(recipes[0]); normalizePorts(bad);
        bad.values.MGMT_IP = '192.0.2.0'; bad.values.GATEWAY = '10.0.0.1'; bad.values.SITE = 'München';
        bad.ports[1].role = 'access'; bad.ports[1].vlan = '5000'; bad.ports[2].role = 'routed';
        bad.ports[3].description = 'x'.repeat(201); bad.interfaces.push('Gi9/9/9'); cases.push(bad);
        return cases.map((c) => { normalizePorts(c); const g = generate(c);
          return { e: g.errors, w: g.warnings, fe: g.findings.filter((f) => f.level === 'error').map((f) => f.text),
                   fw: g.findings.filter((f) => f.level === 'warning').map((f) => f.text),
                   kinds: g.findings.map((f) => f.where && f.where.kind),
                   wh: g.findings.map((f) => [f.text.slice(0, 30), f.where]) }; });
    }""")
    allowed = {"field", "port", "ports", "interfaces", "template", "sources", "file"}
    for c in r:
        assert c["fe"] == c["e"] and c["fw"] == c["w"]
        assert all(k in allowed for k in c["kinds"]), c["wh"]
    bad = dict((t, w) for t, w in r[-1]["wh"])
    assert any(w == {"kind": "field", "key": "MGMT_IP"} for w in bad.values())
    assert any(w == {"kind": "field", "key": "GATEWAY"} for w in bad.values())
    assert any(w.get("kind") == "port" and w.get("attr") == "vlan" for w in bad.values())
    assert any(w.get("kind") == "port" and w.get("attr") == "ip" for w in bad.values())
    assert any(w.get("kind") == "file" and w.get("line") for w in bad.values())
    assert any(w.get("kind") == "interfaces" for w in bad.values())
```

- [ ] **Step 2:** Run `... -k location` → FAIL (`findings` undefined).
- [ ] **Step 3:** In `generate()` add local `E(text, where)` / `W(text, where)` that push to `errors`/`warnings` and to `findings`; replace every `errors.push`/`warnings.push`. Mapping: per-device-key checks → `field{k}`; MGMT_IP/GATEWAY address, subnet and link-local checks → `field` of that key; mask checks → `field MGMT_MASK`; management VLAN reachability → `field MGMT_VLAN`; loopback gateway reachability → `field GATEWAY`; unmatched port, unknown role, role without commands → `port{name,"role"}`; routed IP/mask checks → `port{name,"ip"|"mask"}`; description checks and "description is not used" → `port{name,"description"}`; role line with empty value → `port{name, vlan|ip|mask}`; port VLAN checks (from `portVlanFindings`) → `port{name,"vlan"}`; "no active data ports" → `ports`; interface family → `interfaces`; `{{MGMT_SOURCES}}` empty → `sources`; invisible/non-ASCII file char → `file{line,col}` from the hit; VLAN block count notes → `file`; everything else (template markers, credentials, size, unresolved placeholders, empty config) → `template`. De-duplicate `findings` by `level|text`, first wins, matching `new Set`.
- [ ] **Step 4:** Run full suite → all pass (goldens prove bytes).
- [ ] **Step 5:** build, commit `checks: every check records where it points (strings unchanged)`.

### Task 3: Dialog kit

**Files:** Create `src/js/04b-dialogs.js`; Modify `src/styles.css`, `src/index.html` (nothing else).

**Interfaces — Produces:**
- `el(tag, attrs?, ...children) -> HTMLElement` (attrs: properties; `on*` listeners; `data*` → dataset; `aria*` → attributes; strings → text nodes; null/false skipped).
- `showDialog({ title, body: Node, actions: [{label, value, primary?, danger?, disabled?}], onOpen?(dlg) }) -> Promise<value|null>`: native modal `<dialog class="dlg">`, `h2` title, `.dialog-body`, `.dialog-actions`; resolves on the clicked action (not on the native `close` event); Esc/cancel → `null`; dialog removed after.
- `confirmDialog(title, textOrNode, { ok="OK", cancel="Cancel", danger=false }) -> Promise<boolean>`.
- `infoDialog(title, textOrNode) -> Promise<void>` (one "Close").
- `writeDialog({ title, summary: string, primary }) -> Promise<boolean>`: body = `<pre class="dlg-summary">` (summary with any final "Cancel = no download." line removed), "Copy summary" button (uses `copyText`), checkbox "I reviewed this configuration and the baseline selection." that enables the primary action.
- CSS: `dialog.dlg`, `.dialog-body` (max-height 60vh, scroll), `.dialog-actions` (right-aligned), `button.danger`, `.dlg-summary`.

- [ ] **Step 1: Failing tests** `test_dialog_kit`: resolves with clicked value; Esc → `null` (dispatch `cancel`); `confirmDialog` danger button has class `danger`; `writeDialog` primary disabled until the checkbox is ticked, then resolves `true`; no `dialog` left in the DOM afterwards. Drive with `page.evaluate("() => { window.__p = showDialog(...); }")`, `click_dialog`, then `page.evaluate("() => window.__p")`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** build, commit `ui: in-page dialog kit`.

### Task 4: Simple pop-ups become dialogs

**Files:** Modify `src/js/10-events-boot.js` (handlers for deleteSkuPreset, deleteRecipe, discardDraft, clearAutosave, portCsvFromTable, saveProject).

Each handler becomes `async`; copy keeps today's sentences. Buttons: Delete SKU preset → `confirmDialog("Delete custom SKU preset?", …, {ok:"Delete", danger:true})`; Delete recipe → `{ok:"Delete recipe", danger:true}`, text adds " and its N switch(es)" when `switches` is non-empty; Discard draft → `{ok:"Discard", danger:true}`; Clear browser autosave → `{ok:"Clear", danger:true}`; Copy table to CSV over existing text → `{ok:"Replace"}`; Save project with an unapplied draft → `{ok:"Save without the draft"}`.

- [ ] **Step 1: Failing tests** `test_simple_pop_ups_are_in_page_dialogs`: for delete recipe — click `#deleteRecipe`, `click_dialog(page, "Cancel")` → `recipes.length == 4`; again with "Delete recipe" → 3. For discard draft — set `editorPending` via an input event on `#template`, click `#discardDraft`, `click_dialog(page,"Discard")` → `editorPending === false`. Clear autosave → after "Clear", no `switchcard-` key except the legacy-read marker. Assert no native dialog fired: register `page.on("dialog")` counter in the test, expect 0.
- [ ] **Steps 2–5:** fail → implement → pass → build, commit `dialogs: delete, discard, clear, replace, save-with-draft`.

### Task 5: Async decision points and async boot

**Files:** Modify `src/js/03-utils-autosave.js` (`restoreAutosave`, `restoreAutosaveRaw`, `restoreSelectedBackup`, `confirmAndDropUnmatchedPorts` → async), `src/js/07-editor.js` (`applyRecipe` → async), `src/js/08-persistence.js` (`acceptProject`, `confirmReplaceUnsavedWork` → async), `src/js/10-events-boot.js` (callers await; boot code removed), Create `src/js/11-boot.js`.

**Interfaces — Produces:** `async restoreAutosave()`, `async restoreAutosaveRaw(raw, key, opts)`, `async restoreSelectedBackup()`, `async confirmAndDropUnmatchedPorts(recipeList, actionLabel) -> boolean`, `async applyRecipe()`, `async acceptProject(p, b, restoredFile)`, `async confirmReplaceUnsavedWork(kind) -> boolean`; global `let bootDone = false` set `true` at the end of boot.

Dialog copy: version mismatch → title "Restore an autosave from v<x>?", body = today's text minus the OK/Cancel lines, `{ok:"Restore it", cancel: fromBackup ? "Keep the current workspace" : "Start with the examples"}`; unmatched ports → title "Drop unmatched port assignments?", `{ok:"Drop and continue", danger:true}`; apply drop → `{ok:"Drop and apply", danger:true}`; replace unsaved work → `{ok:"Open and replace"}`.

Boot (`11-boot.js`): theme, presets, onboarding, `renderAll(); loadEditor();` (examples visible), then `await restoreAutosave()` and today's success/failure branch, `refreshBackupButtons()`, `bootDone = true`. Autosave stays unscheduled until `touch()`; `autosavePaused = true` while a boot dialog is open, restored afterwards.

- [ ] **Step 1: Failing tests**
  - `test_apply_drop_dialog_cancel_and_accept`: change `#interfaces` to two names, click `#applyRecipe`, Cancel → interfaces unchanged and status contains "Apply cancelled"; repeat, "Drop and apply" → 2 ports.
  - `test_boot_restore_dialog_for_other_version`: seed `localStorage[AUTOSAVE_KEY]` with an autosave whose `release` is "0.7.3" and one renamed recipe, reload, `click_dialog(page, "Restore it")` → recipe name present; seed again, reload, "Start with the examples" → 4 examples and a backup entry exists.
  - `test_boot_dialog_blocks_autosave_until_answered` (Review Focus 3): seed as above, reload, before answering read `localStorage[AUTOSAVE_KEY]` → equals the seeded string; answer; then it may change.
  - `test_open_project_over_unsaved_work_dialog`: make the workspace dirty, set the file on `#projectInput` (`set_input_files` with a v5 JSON), Cancel → workspace kept; again "Open and replace" → opened.
- [ ] **Steps 2–5:** fail → implement → pass (full suite) → build, commit `dialogs: async decision points; boot awaits the restore dialog`.

### Task 6: Export summary dialog, review tick moves into it

**Files:** Modify `src/index.html` (remove `#reviewed` label), `src/js/07-editor.js` (`renderPreview` gates, `exportWhy`), `src/js/03-utils-autosave.js` (`touch`), `src/js/07-editor.js` (`newSwitch`), `src/js/08-persistence.js` (`acceptProject`), `src/js/10-events-boot.js` (`assertExportReady`, `downloadCard`, `restorePendingDraft`, `#reviewed` listener).

Rule: `downloadCard` enabled when no errors and no blockers; click → `writeDialog({ title: "Export SD-card ZIP?", summary: exportConfirmSummary(r, g), primary: "Download ZIP" })`; false → status "SD-card ZIP export cancelled." Every `$("reviewed")` reference removed.

- [ ] **Step 1: Failing test** `test_export_dialog_requires_review_tick`: make recipe 0 custom (`example=false`) and load a synthetic baseline via `baseline = {model:'IE3100', version:'x', files:[{path:'a.bin', blob:new Blob(['x'])}]}`; `renderPreview()`; `$('downloadCard').disabled === false`; stub downloads; click → dialog text contains "editcontent.txt SHA-256"; primary disabled; tick; click "Download ZIP" → one `.zip` download; `$('reviewed') === null`.
- [ ] **Steps 2–5:** fail → implement → pass → build, commit `export: summary dialog with the review tick`.

### Task 7: Switch-list engine (pure)

**Files:** Create `src/js/09c-switches.js`; Modify `src/js/09b-fleet-diff-policy.js` (`checkFleet` becomes a wrapper).

**Interfaces — Produces:**
- `newSwitchId() -> string` (`"sw-" + crypto.randomUUID()`).
- `switchRowRecipe(r, row) -> { rr, portErrors: string[] }` — `rr` = shallow copy of `r` with `values = {...r.values, ...non-empty row.values}`, copied ports with `row.ports` applied by `applyPortCells` (cells flattened in interface order), `exports: {}`, `switches: undefined`.
- `checkSwitchRows(r, rows) -> { rows: RowResult[], warnings: string[] }` where `RowResult = { n, row, values, own, inherited, host, ip, errors, findings, policy, warnings, text, sha256, lines, bytes, recipe, portSettings }` — messages identical to v0.7.3 `checkFleet` (duplicates "duplicate HOSTNAME (also row N)" with `where:{kind:"row", key}`, shared-routed note skips ports any row sets `ip` for); port errors get `where:{kind:"port", name, attr}`; per-row cache keyed by `quickHash` of the recipe without `exports`/`switches` plus `JSON.stringify(row)` (cache cleared when the recipe stamp changes).
- `switchRowsFromCsv(r, text) -> { errors, warnings, rows, header, portCols, decodeProblems }` — header rules and messages exactly as v0.7.3 `checkFleet`; rows `{id, values (non-empty cells only), ports {iface:{attr:value}}}`; `decodeProblems` counts cells containing U+FFFD.
- `switchRowsToCsv(r, rows) -> { columns, text }` — `fleetColumns(r)` then `"<iface> <attr>"` for every (iface, attr) some row sets, in interface then `PORT_ATTRS` order; cells are the row's own values (empty stays empty).
- `countedUpRows(r, rows, n) -> { rows } | { error }` — empty list: first row is `{HOSTNAME, MGMT_IP}` of Device details (bound keys only), then counting continues; otherwise continues from the last row's effective values via `fleetCopyRows` (messages with "in Device details" become "in the last row"); new rows carry only HOSTNAME/MGMT_IP; refuses when `rows.length + n > MAX_FLEET_ROWS` or `n` not 1–500.
- `exportState(r, host, sha256) -> { state: "nohost"|"new"|"current"|"changed", at?, entry? }`.
- `checkFleet(r, csvText)` — `switchRowsFromCsv` + `checkSwitchRows`, returning v0.7.3's shape (`errors, warnings, rows[{n, values, inherited, portCells, host, ip, errors, policy, warnings, text, sha256, lines, bytes, recipe}], header, fields, portCols`).

- [ ] **Step 1: Failing tests**
  - `test_switch_rows_inherit_override_and_match_fleet_csv`: two rows from `switchRowsFromCsv(r, 'HOSTNAME,MGMT_IP,Gi1/2 role,Gi1/2 vlan\nA-01,192.0.2.11,access,10\nA-02,,,\n')`; `checkSwitchRows(r, rows).rows[i].text === checkFleet(r, same csv).rows[i].text`; row 2 `inherited` includes `MGMT_IP`; row 1 text contains ` switchport access vlan 10`.
  - `test_csv_round_trip`: rows → `switchRowsToCsv` → `switchRowsFromCsv` → same `values` and `ports` (ids ignored).
  - `test_counted_up_rows`: empty list, n=3 → hosts `IE3100-DEMO-01..03`, IPs `.10..12`; then n=2 from that list → `-04, -05`; last row host `EDGE` → error contains "does not end in a number"; 499 rows + 2 → error.
  - `test_export_state`: none → "new"; after `recordExport` with the same text → "current"; text changed → "changed"; template without HOSTNAME → "nohost".
  - Existing `checkFleet` tests (v070/v071/v072/v073) stay green unmodified.
- [ ] **Steps 2–5:** fail → implement → full suite pass → build, commit `switches: switch-list engine; checkFleet on top of it`.

### Task 8: Switch list in project files, recipes and interface changes

**Files:** Modify `src/js/08-persistence.js` (`validateProject` calls `validateSwitchRows`), `src/js/07-editor.js` (`applyRecipe` drop dialog lists per-switch settings; after apply `alignSwitchOverrides(r,{allowDrop:true})`), `src/js/03-utils-autosave.js` (`confirmAndDropUnmatchedPorts` lists them too), `src/js/10-events-boot.js` (duplicate recipe gives copies new ids), `src/js/09c-switches.js`.

**Interfaces — Produces:** `validateSwitchRows(r, notes, rname)` (throws "The project contains an invalid switch list." for structural problems; cleans values with notes; drops reserved/derived keys and unknown port attributes with notes; new id for missing/duplicate ids with a note; control characters in a port `vlan` refuse like v0.5.9); `probeSwitchOverrideDrops(r, interfaces) -> [{n, host, name}]`; `alignSwitchOverrides(r, {allowDrop}) -> { dropped: [{n, host, name}] }` (re-keys case-insensitively to current port names; drops unmatched only when `allowDrop`).

- [ ] **Step 1: Failing tests**
  - `test_switch_list_round_trips_and_is_optional`: project with `switches` validates with no notes; `projectPayload()` after `acceptProject` keeps it identical; a project without the field still opens.
  - `test_switch_list_validation_notes`: values with `​` cleaned + note; `INTERFACE` key dropped + note; `ports:{"GigabitEthernet1/2":{bogus:"x"}}` → attr dropped + note; `switches: 5` → refused with "invalid switch list".
  - `test_unused_value_kept_but_not_emitted` (Review Focus 2): row `values:{HOSTNAME:'A-01', NTP_SERVER:'10.0.0.5'}` on a template without `{{NTP_SERVER}}` → text has no `10.0.0.5`; after validate + save the value is still there; `switchRowsToCsv` columns exclude `NTP_SERVER`.
  - `test_interface_drop_removes_per_switch_settings_on_confirm`: row overrides `GigabitEthernet1/2`; set `#interfaces` to `GigabitEthernet1/1`, Apply, dialog text mentions "1 switch" and `GigabitEthernet1/2`; "Drop and apply" → row `ports` is `{}`.
  - `test_duplicate_recipe_copies_switches_with_new_ids`.
- [ ] **Steps 2–5:** fail → implement → pass → build, commit `switches: saved in recipes, validated, follow interface changes`.

### Task 9: Left rail and views

**Files:** Modify `src/index.html` (wrap content in `.app` grid: `<nav id="rail">` + `.views`; add empty `<section id="switches" hidden>` and `<section id="cards" hidden>`; remove `#tabs`, `#buildTab`, `#maintainTab`, `#backBuild`, `.tab-pin` card), `src/styles.css` (rail, `.app` 210px + content, `.shell` max-width 1600px, rail becomes a top row under 980px), `src/js/03-utils-autosave.js` (remove `showMaintainTabPinned`, `applyMaintainTabPin`; `tab(m)` = `showView(m ? "manage" : "build")`), `src/js/01-config.js` (drop `SHOW_MAINTAIN_TAB_KEY`), Create `src/js/10b-views.js`.

**Interfaces — Produces:** `let currentView = "build"`; `showView(name: "build"|"switches"|"cards"|"manage") -> boolean` (refuses non-manage views while `editorPending`, message as today; sets `hidden`, `aria-current="page"` on the rail button, `#viewTitle`; loads the editor for manage; calls `renderSwitches()` / `renderCards()`); `scheduleRailUpdate()` (debounced 250 ms; chips: `#chipSwitches` "N" or "N · E error(s)", `#chipCards` "U of N up to date", `#chipManage` baseline label or "no baseline"); recipe pickers `#swRecipe`, `#cdRecipe` share the `#recipe` change handler; `renderAll()` fills them. `renderPreview()` ends with `scheduleRailUpdate()`.

- [ ] **Step 1: Failing tests** `test_rail_switches_views_and_locks_with_a_draft`: four rail buttons; `showView('switches')` shows `#switches` only; pending draft → `showView('cards')` false and status contains "Apply"; chips update after a row is added (wait 300 ms); `$('tabs') === null`.
- [ ] **Steps 2–5:** fail → implement → pass (update `test_controls_sharing_a_row_line_up` only where it calls removed elements) → build, commit `layout: left rail with Build, Switches, Cards, Manage`.

### Task 10: Switches view

**Files:** Modify `src/index.html` (`#switches` content: `#swRecipe`, toolbar `#swCount` (number, 1–500, default 1), `#swAdd` "Add counted up", `#swImport`, `#swExport`, `#swTemplateMode` (description/all/none as v0.7.3), `#swTemplate` "CSV template", `#swRemoveAll`; `#swNotes`; table `#swHead`/`#swRows`; `#swEmpty`; side panel `#swPanel` with `#swChecks`, `#swPreview`, `#swDiffPanel`/`#swDiff`), `src/styles.css`, `src/js/10b-views.js`.

**Interfaces — Produces:** `renderSwitches()`; `let swSelectedId = null`; `openPortsDialog(row, focus?: {name, attr})`; `openImportDialog()`; cells carry `data-row` (row id) and `data-key`; status cell `td.status` with `title` = the row's problems.

Behaviour:
- Grid: grey read-only defaults row (Device details); columns `#`, `fleetColumns(r)` (labels as on Device details; unknown keys humanised), Ports (button "N set" / "table"), Status ("OK", "OK · N notes", "N errors"), Copy, Remove.
- Empty cell: `placeholder` = inherited value, class `inherit`. `input` sets/deletes `row.values[key]`, `touch()`, re-checks (cache), patches status cells and inherit classes of all rows **without rebuilding** (rebuild only when columns or row ids change). `change` trims.
- Arrow Up/Down and Enter move to the same column; clicking a row or focusing a cell selects it (`swSelectedId`).
- Side panel: row label, clickable findings (wired in Task 13), `#swPreview` = row text, diff against `historyFor` (reuse `lineDiff`).
- Add counted up → `countedUpRows`; an error → status message, nothing added.
- Import dialog: textarea, "Load file" (2 MiB cap), "Start from template" (`fleetCsvTemplate(r, mode).text`), live summary (rows found, columns used, ignored columns, port columns; red "N cells could not be read as UTF-8 — save the CSV as UTF-8" when `decodeProblems`), placeholder `fleetCsvExample(r).text`, the v0.7.1 "Columns for this recipe: …" line; actions Cancel / Add after / Replace (disabled while there are errors or no rows).
- Export CSV → `download` of `switchcard-switches-<recipe>.csv` with BOM and CRLF; CSV template → v0.7.3 download behaviour.
- Ports dialog: one line per matched port (Interface, Role select, VLAN, Description, IP, Mask, "Use table"); shown values effective, inherited inputs grey; edits write `row.ports[name][attr]` (empty removes; a role other than routed removes ip/mask); unknown-interface settings listed with "Remove".
- Copy row → exact copy with a new id after it; Remove row / Remove all → `confirmDialog` danger.

- [ ] **Step 1: Failing tests**
  - `test_switches_grid_add_edit_inherit_keeps_focus` (Review Focus 1): `showView('switches')`; `#swCount` = 3, click `#swAdd` → 3 rows; focus row 2's SITE cell and type with `page.keyboard` → `document.activeElement` is still that input (same `data-row`), status cells updated; row 2 SITE stored, the other rows inherit (`placeholder` "Example site").
  - `test_switches_duplicate_flagged_and_cleared`: row 2 HOSTNAME = row 1's → row 2 status title contains "duplicate HOSTNAME"; fix → "OK".
  - `test_import_dialog_replace_add_and_decode_warning` (Review Focus 4): `HOSTNAME,SITE\nA-01,M�nchen\n` → summary contains "could not be read as UTF-8"; a valid CSV with `Gi1/3 description` → "Replace" sets rows and `ports`; "Add after" appends.
  - `test_ports_dialog_overrides_and_use_table`.
  - `test_switches_follow_template_changes`: add `{{NTP_SERVER}}` to the template in the editor + Apply → `#swHead` gains the column; remove it → column gone, stored value kept.
- [ ] **Steps 2–5:** fail → implement → pass → build, commit `views: Switches grid with CSV import/export and per-switch ports`.

### Task 11: Cards view

**Files:** Modify `src/index.html` (`#cards`: `#cdRecipe`, `#cdGates`, table `#cdRows`, `#cdEmpty`, `#cdAll` "All card ZIPs" (primary), `#cdChanged` "Changed and new only", `#cdText` "Text-only ZIP", fine print), `src/styles.css`, `src/js/10b-views.js`, `src/js/09b-fleet-diff-policy.js` (`exportFleet` replaced).

**Interfaces — Produces:** `renderCards()`; `async exportSwitchCards(r, results, { textOnly })` (v0.7.3 `exportFleet` body: one ZIP per switch + manifest, or one text ZIP with `HOSTNAME/editcontent.txt` + `fleet-manifest.txt`; records history per row; `touch()`); `async exportOneCard(r, result)`.

Behaviour:
- Gate line = `blockers(r)` (draft, example, baseline model/label), plus "Rows with errors: 3, 7" and team-policy rows; otherwise "Ready to export N cards."
- Row: `#`, Hostname, Management IP, Status button (→ `showView('switches')` with that row selected), Last export from `exportState` ("not exported" / "up to date · YYYY-MM-DD HH:MM" / a "changed since …" button opening an `infoDialog` with the diff), "Card ZIP" button (disabled on errors, policy or gates).
- Bulk: `#cdAll` all rows; `#cdChanged` rows whose state is new or changed, label "Changed and new only (N)", disabled at N = 0; `#cdText` all rows. Any included row with errors → status names the rows, no dialog. Otherwise `writeDialog` with v0.7.3's fleet summary lines (row, host, ip, SHA-256 prefix, lines; first 20 then "… and N more").
- Single: `writeDialog({ title: "Export SD-card ZIP?", summary: exportConfirmSummary(result.recipe, g), primary: "Download ZIP" })`.

- [ ] **Step 1: Failing tests** (synthetic baseline + `example=false` as in Task 6, `stub_downloads`)
  - `test_cards_single_and_all_exports_record_history`: 3 rows; "Card ZIP" on row 2 → dialog, tick, download `IE3100-DEMO-02-switchcard-<RELEASE>-sdcard.zip`; row 2 shows "up to date"; "All card ZIPs" → 3 ZIPs + `switchcard-fleet-<RELEASE>-manifest.txt`.
  - `test_changed_only_after_template_edit` (Review Focus 5): export all; change only row 3's SITE → `#cdChanged` reads "(1)" and exports exactly row 3; edit the template and Apply → all 3 "changed since".
  - `test_cards_gates_example_and_errors`: example recipe → `#cdAll` disabled, gate line contains "Example recipe"; a row with a bad IP → bulk click names that row, no download.
  - `test_text_only_zip`: entries `HOSTNAME/editcontent.txt` + `fleet-manifest.txt`.
- [ ] **Steps 2–5:** fail → implement → pass → build, commit `views: Cards list with export states and changed-only export`.

### Task 12: Remove the Fleet export box; migrate its tests

**Files:** Modify `src/index.html` (delete the `#fleetPanel` card; under Device details add `<small>Many switches? Use <b>Switches</b> on the left.</small>`), `src/js/10-events-boot.js` (delete `runFleetCheck`, `currentFleetTemplate` and the handlers of `checkFleet`, `fillCopies`, `insertFleetTemplate`, `downloadFleetTemplate`, `fleetCount`, `fleetCsvInput`, `fleetCsv`, `exportFleet`, `exportFleetText`), `src/js/09b-fleet-diff-policy.js` (delete `fleetStamp`, `renderFleet`, `refreshFleetButtons`, `renderFleetColumns`; keep `fleetCsvExample`, `fleetCsvTemplate`, `fleetCopyRows`, `checkFleet`), `src/js/07-editor.js` (no calls to removed functions; drop the `fleet` state variable), `src/styles.css` (delete `#fleetTable`, `.fleet-*`, `#fleetScroll`), tests `test_v070.py`, `test_v071.py`, `test_v073.py`, `test_switchcard.py`.

- [ ] **Step 1:** Rewrite tests: `test_fleet_ui_gates` → Cards gate line + disabled `#cdAll` for the example recipe; `test_fleet_csv_example_and_column_hint` keeps its function asserts, the DOM asserts move to the import dialog (placeholder and columns line); `test_duplicate_button_fills_csv_and_checks` → `#swCount` = 3 + `#swAdd` → rows `IE3100-DEMO-01..03` / `.10..12`, statuses "OK"; `test_controls_sharing_a_row_line_up` drops the fleet-panel column checks and also runs on the Switches and Cards views; `test_insert_template_button` → import dialog "Start from template" puts the 16-column header in the textarea. Add `test_no_browser_pop_ups_in_the_shipped_file`: `re.search(r"\b(confirm|alert|prompt)\(", html) is None`.
- [ ] **Step 2:** Run → rewritten tests fail while the fleet box exists.
- [ ] **Step 3:** Remove the code listed above.
- [ ] **Steps 4–5:** full suite pass → build, commit `build page: fleet box replaced by Switches and Cards`.

### Task 13: Clickable checks

**Files:** Modify `src/js/07-editor.js` (`statusNotice` items may be `{text, where}`, rendered `<li><button type="button" class="finding-link">text</button></li>` with the same visible text), `src/js/04-render.js` (port inputs get `data-port` and `data-attr`), `src/js/10b-views.js`, `src/styles.css` (`.finding-link` looks like text with a hover underline; `.flash` 1.2 s accent outline).

**Interfaces — Produces:** `focusFinding(where, ctx: {view:"build"} | {view:"switches", rowId})`; `highlightPreviewLine(pre, line: number)` (selects that line and scrolls it to the middle).

Targets: field → Build `#value_<KEY>` or the Switches cell `[data-row][data-key]`; row → Switches cell; port → Build `#ports [data-port][data-attr]` (the role `select` for role), or in Switches the row's Ports dialog when the row sets that value; ports → first role select on Build; interfaces → Manage `#interfaces`; template → Manage `#template`; sources → Manage, open its `<details>`, `#mgmtSources`; file with line → `highlightPreviewLine` on `#preview` (Build) or `#swPreview`; file without line → the preview; policy → Manage, `#teamHintsPanel.open = true`, `#teamPoliciesEditor`. Missing target → Manage `#template`. Every target gets `.flash` and `scrollIntoView({block:"center"})`.

- [ ] **Step 1: Failing test** `test_clicking_checks_focuses_targets`: bad MGMT_IP → click its `.finding-link` → active element `#value_MGMT_IP`; bad port VLAN → active element has `data-attr="vlan"`; "é" in a template `!` line → selection equals that preview line; failing policy → `#teamPoliciesEditor`; Switches duplicate → that row's HOSTNAME cell; `$('checks').textContent` for example 0 equals the v0.7.3 text (captured before the change into the test as a literal).
- [ ] **Steps 2–5:** fail → implement → pass → build, commit `checks: click a check to jump to what it is about`.

### Task 14: 500-row performance

- [ ] **Step 1: Test** `test_500_rows_check_time`: recipe 0 with 500 counted-up rows; cold `checkSwitchRows` < 3000 ms (CI headroom over the spec's 1.5 s; print the measured value); change one row and re-check < 100 ms (spec 50 ms). Ruling: thresholds doubled for shared CI runners; local numbers are reported against the spec values.
- [ ] **Step 2:** If it fails, time generate vs sha256 vs copy per row and fix the slowest part in `09c-switches.js`.
- [ ] **Step 3:** Commit `switches: 500-row timing test`.

### Task 15: Docs, version 0.8.0, final verification, merge

**Files:** `src/js/01-config.js` (`RELEASE: "0.8.0"`), `src/index.html` (header comment, `#releaseLabel`, footer), `CHANGELOG.md` (v0.8.0: Switches, Cards, in-page dialogs, clickable checks, review tick in the export dialog, fleet box removed; single-card output unchanged; schema v5; v0.7.3 opens v0.8.0 files and keeps the list), `README.md`, `docs/USER-GUIDE.md` (*Fleet export* → *Many switches: Switches and Cards*; review tick; dialogs; clickable checks), `docs/SAFETY-EXPORT.md`, `docs/DEVELOPMENT.md` (layout table + `SWITCHCARD_PW_CHANNEL`), `docs/EEM-CONTRACT.md`, `docs/TESTED.md`.

- [ ] **Step 1:** Update; `python build.py`; `python build.py --check` → OK.
- [ ] **Step 2:** Full suite → all pass; static audit (CSP, no network tokens, every `$("id")` exists, no duplicate ids) → all pass.
- [ ] **Step 3:** Compatibility: load v0.7.3 (`git show main:SwitchCard.html` saved to the scratchpad) in the browser pane, open a v0.8.0 project with a switch list → no notes, list kept after Save project.
- [ ] **Step 4:** Live check: every view in dark and light, 900 px width, console clean; report the file size.
- [ ] **Step 5:** PII sweep of the diff; commit `SwitchCard v0.8.0: Switches and Cards views, in-page dialogs, clickable checks`; the finishing step merges into `main` locally. No push.
