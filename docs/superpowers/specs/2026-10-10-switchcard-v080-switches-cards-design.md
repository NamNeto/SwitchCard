# SwitchCard v0.8.0 — Switches and Cards views

**Date:** 2026-10-10 · **Branch:** `v0.8-switches-cards` (from `main` at v0.7.3) · **Status:** design, awaiting review

The v2 design study (local branch `v2-designs`) produced three candidate pages. The owner chose to keep v1 and bring in two views from the *Roster* candidate: **Switches** (a grid with one row per switch) and **Cards** (a list of every card to export). Two more features come along: **in-page dialogs** in place of browser pop-ups, and **clickable checks**. Write to card folder and Undo/Redo were left out by choice.

## 1. Goals and success criteria

1. **Easier CSV steps.** A switch list is edited in a grid and checked as you type; CSV becomes import and export of that list. There is no *Check fleet* step any more.
2. **Easier multi-switch exports.** One list shows every card with its last export state ("not exported", "up to date", "changed since"). *Changed and new only* exports exactly the cards whose text changed.
3. **Everything follows template changes.**
   - Grid and CSV columns, checks, the export summary and the card states are derived from the current recipe each time the page renders.
   - Nothing is copied from the template and left to go stale.
4. **Measured by tests:**
   - The golden `editcontent.txt` files are unchanged.
   - The shipped file contains no `confirm(`, `alert(` or `prompt(`.
   - Every check produced for the built-in examples and for a crafted bad recipe has a location, and clicking it focuses the expected element.
   - Rows survive a CSV round trip unchanged.
   - Adding or removing a placeholder adds or removes its column, and stored values are kept.
   - 500 rows are checked in under 1.5 s when the view opens; a single cell edit re-checks in under 50 ms.

## 2. Non-negotiables (unchanged from v0.7.3)

- **One file:** a single offline `SwitchCard.html`, readable source, CSP `default-src 'none'; connect-src 'none'`.
- **Same bytes:** `generate()` output is byte-identical for the same input. Preview text is card text, and the whole file is printable ASCII with CRLF.
- **Fail-closed gates:** errors, example recipes, a missing or mismatched baseline and team policy rules all block exports.
- **No silent loss:** stored data is never dropped or overwritten silently.
- **File compatibility:** project files stay **schema v5**. v0.7.3 opens files saved by v0.8.0 and keeps the new data untouched. This was verified on 2026-10-10: the v0.7.3 page validated a project carrying a switch list with no migration notes, and kept the list through Save project, autosave and Duplicate recipe. The check is repeated before release.

## 3. Data model: the switch list

Each recipe gains an optional `switches` array; when it is absent the list is empty.

```text
recipe.switches[] = {
  id:     string, unique within the recipe
  values: { KEY: string }        cells set for this switch; a missing or "" key follows Device details
  ports:  { <interface>: { role?, vlan?, description?, ip?, mask? } }   this switch's port settings
}
```

- **Effective switch:**
  - Values are `{ ...recipe.values, ...non-empty row.values }`.
  - Ports are `recipe.ports` with `row.ports` applied by the existing `applyPortCells` rule: role first, and a role other than Routed clears IP and mask.
  - This is exactly v0.7.2's fleet-CSV rule, so a row produces the same text as the same CSV row did.
- **Device details are the defaults.**
  - Changing the gateway on *Build a card* changes every row that does not set its own.
  - The *Build a card* switch is not itself a row; adding counted-up rows to an empty list makes the first row that switch (§5).
- **Template changes:**
  - A row keeps values for placeholders the template no longer uses. They are not shown or emitted, the same as Device details today.
  - They reappear if the placeholder comes back. CSV export writes only bound columns.
- **Interface changes:**
  - Port settings are keyed by interface name.
  - When *Apply recipe changes* drops ports, the drop dialog also counts the per-switch settings on those ports. They are dropped with the port table on confirm, and Cancel changes nothing.
  - A case-only rename re-keys settings, matching how `normalizePorts` already matches names.
  - A setting whose interface is unknown stays and shows as a row error ("Gi9/9: not in the port table."), never dropped silently.
  - Open, team package and autosave restore list unmatched per-switch settings in the same drop dialog they already show for unmatched ports.
- **Validation on open** (`validateProject`):
  - **Refused** with "The project contains an invalid switch list.": a list that is not an array; an entry that is not an object; `values` that are not text; `ports` that are not text maps. The cap is `MAX_FLEET_ROWS` (500) per recipe.
  - **Cleaned with a migration note:** control or invisible characters in values; reserved or derived keys (`INTERFACE`, `VLAN`, `DESCRIPTION`, `PORT_IP`, `PORT_MASK`, `MGMT_INTERFACE`, `MGMT_SOURCES`, `PORTS`, `VLANS`); unknown attribute names in port settings; duplicate ids, which get new ones.
  - **Row error, not refused:** an unknown role in a port setting.
- **Recipe operations:**
  - *Duplicate recipe* copies the list with new ids (export history is cleared, as today).
  - *Delete recipe* deletes it with the recipe.
  - *New switch* on Build leaves the list alone.
- **Storage:** autosave and Save project include the list automatically, because it lives inside the recipe. The autosave key stays the same.

## 4. Navigation: buttons on the left

- **Left rail.** A column on the left replaces the hidden top tabs. It holds *Build a card · Switches · Cards · Manage recipes & baseline*, each with a small status:
  - Switches: "12" or "12 · 1 error".
  - Cards: "3 of 12 up to date".
  - Manage: the baseline label, or "no baseline".
- **Removed:** the "Show Manage in the top tabs" preference and *Back to card builder*. The rail is always visible; below 980 px it becomes a row at the top.
- **Shared recipe picker.** The recipe chosen in any view is the one Switches and Cards show.
- **Draft lock unchanged.** With an unapplied recipe-editor draft, the other views stay locked, with today's message.
- **Statuses update shortly after typing stops**, not on every keystroke.

## 5. Switches view

**Header**
- The recipe picker, plus one line: "Empty cells use Device details from *Build a card*."

**Toolbar**
- **[n] Add counted up** appends *n* rows that continue the numbering of the last row's effective values (the hostname's trailing number and the management IP), with v0.7.1's rules and refusals (no trailing number, past the last usable address of the management subnet). On an empty list the first row is the Build page's switch itself, as v0.7.1's *Duplicate switch* did.
- **Import CSV** opens a dialog with:
  - a paste box, *Load file* and *Start from template* (fills the box with the CSV template);
  - a live summary of rows found, columns used, ignored columns, port columns and a warning when cells could not be read as UTF-8;
  - *Add after* / *Replace* / *Cancel*.
  The CSV rules are v0.7.2's unchanged: comma, semicolon or tab; quoted cells; byte-order mark; port columns such as `Gi1/3 description`; reserved names refused; unknown columns ignored with a note; empty cells inherit.
- **Export CSV** downloads the rows as they are stored (empty stays empty), with port columns only for settings some row has. Importing that file reproduces the list.
- **CSV template** (fields only / + port descriptions / + all port settings) downloads v0.7.3's template: row 1 is the Build page's switch.
- **Remove all** asks first in a dialog.

**Grid**
- **Defaults row.** A grey, read-only first row shows the current Device details.
- **Columns**, each derived from the current recipe:
  - `#`;
  - the bound fields in identity order (HOSTNAME, MGMT_IP, MGMT_MASK, MGMT_VLAN, MGMT_LOOPBACK, GATEWAY, SITE, then the others in template order);
  - **Ports**, a count of overridden ports, which opens the Ports dialog;
  - **Status**: "OK", "OK · 2 notes" or "3 errors", including duplicate hostname or IP across rows;
  - **Copy** (an exact copy, flagged as a duplicate until edited) and **Remove**; removing asks first.
- **Cells.** An empty cell shows the inherited value as a grey placeholder. Typing sets the row's own value. Arrow keys and Enter move between rows.
- **Side panel for the selected row:**
  - its checks, clickable (§8);
  - its `editcontent.txt`;
  - "Changes since the last export" for its hostname.

**Ports dialog (per row)**
- One line per port: Interface · Role · VLAN · Description · IP · Mask · *Use table*.
- Shown values are effective. Inherited values are grey, and editing a cell sets this switch's own value.
- *Use table* clears that port's settings.
- Unknown-interface settings are listed with *Remove*.

**Performance.** Row results are cached against a recipe stamp plus the row's own data. A cell edit re-checks that row and the duplicate scan; a Device details or recipe change re-checks every row when the view is next shown.

## 6. Cards view

**Gate line**
- The same gates as a single card: draft, example recipe, baseline model and label.
- A summary of rows with errors or team-rule failures (for example "rows 3 and 7").

**Table**, one line per row
- `#` · Hostname · Management IP · Status · **Last export** · **Card ZIP**.
- Last export comes from the export history v0.7.0 keeps per hostname:
  - **"not exported"**;
  - **"up to date · <date>"** when the hash matches;
  - **"changed since <date>"**, a link to a diff dialog.
- Clicking a status opens Switches with that row selected.

**Bulk**
- **All card ZIPs:** one ZIP per switch, then the manifest, as in v0.7.0.
- **Changed and new only (n):** the rows whose last export is missing or differs; it is disabled when every card is up to date.
- **Text-only ZIP:** `HOSTNAME/editcontent.txt` per switch plus the manifest. It uses the same gates, baseline included, as v0.7.3's text-only fleet export did.
- Bulk exports stay all-or-nothing: an included row with errors stops them before any dialog opens, and the stopping rows are named.

**Write dialog** (every export, the Build page's single card included)
- **Single card:** today's `exportConfirmSummary` text, run on the effective switch.
- **Bulk:** the row list with hashes, as v0.7.3's fleet confirm showed.
- *Copy summary*, and the **review tick**, which enables the primary button. It replaces the page checkbox, so it can't be left ticked from an earlier card.
- After export, history is recorded per row and the states update.

## 7. In-page dialogs

One small dialog kit: a native modal `<dialog>`, resolved by its own buttons, with Esc meaning Cancel. Every `window.confirm` in v0.7.3 is replaced:

| v0.7.3 pop-up | v0.8.0 |
|---|---|
| Autosave from another version (at load) | dialog *Restore it* / *Start with the examples*; the page waits, and autosave stays paused until answered |
| Unmatched port assignments (open, package, autosave and backup restore) | dialog listing ports and per-switch settings: *Drop and continue* / *Cancel* |
| *Apply recipe changes* would drop ports | dialog *Drop and apply* / *Cancel* |
| Opening a file over unsaved work | dialog *Open and replace* / *Cancel* |
| Fleet export summary | the Cards bulk write dialog (§6) |
| Replace fleet CSV text (Duplicate switch, Insert template) | removed with the fleet CSV box |
| Replace the port CSV text | dialog *Replace* / *Cancel* |
| Delete custom SKU preset, Delete recipe, Discard draft, Clear browser autosave | red-button dialogs; Delete recipe names the switches it removes |
| Export SD-card ZIP summary | the write dialog (§6) |
| Save project with an unapplied draft | dialog *Save without the draft* / *Cancel* |

- **Async conversion.** The functions behind these dialogs become async and their callers await them. The boot sequence moves to its own last file and awaits the restore dialog. Recovery logic (backups, journal, paused autosave) is untouched; only the decision point changes.
- **New dialogs** come with the views: Remove switch, Remove all, Import CSV, Ports, and Changes since the last export.
- **What stays:** the browser's own "leave this page?" prompt on unsaved work, which pages cannot replace.

## 8. Clickable checks

- **Locations.** `generate()` also returns `findings: [{ level, text, where }]`. `errors` and `warnings` keep their exact strings, order and de-duplication, and every existing check gets a location. Location kinds:
  - `field{key}`, `port{name, attr}`, `template`, `roles{role}`, `sources`, `file{line, col}`;
  - plus `policy` for team-rule failures and `row{key}` for duplicate hostnames or IPs.
- **Rendering.** Checks render as buttons inside today's red and yellow boxes, with the same text.
- **On the Build page:**
  - a field → its Device details input;
  - a port → its cell in the port table;
  - template / roles / sources → Manage, the recipe editor, that textarea (opening its section);
  - a file line → that line selected in the preview;
  - a team rule → Manage, the rules box.
- **In the Switches side panel:**
  - a field or duplicate → that row's cell;
  - a port → the row's Ports dialog when the row sets that value, otherwise the Build port table cell;
  - the rest as on Build.
- **Highlighting.** The target scrolls into view and is briefly outlined.
- **Template changes.** Locations are computed at render time. If a target no longer exists, the click opens the template.

## 9. Build page changes

- **Removed:** the *Fleet export* box (its functions are §5–6), the page *I reviewed…* checkbox (now in the write dialog), and the hidden tabs.
- **Port table cells** get `data-port` / `data-attr` attributes, used as click targets.
- **New hint:** one line under Device details, "Many switches? Use *Switches* on the left."
- **Unchanged:** everything else, including *New switch*, *Save text only* and *Copy preview*.

## 10. Code layout

| File | Change |
|---|---|
| `src/index.html` | rail; `#switches` and `#cards` sections; dialog root; fleet box, tabs, pin preference, page review checkbox and *Back* button removed |
| `src/styles.css` | rail, views, grid, dialog, clickable findings, highlight |
| `src/js/04b-dialogs.js` (new) | element builder; `showDialog`, `confirmDialog`, `infoDialog` |
| `src/js/05-validation.js`, `06-generate.js` | locations on every check; strings unchanged |
| `src/js/03-utils-autosave.js`, `07-editor.js`, `08-persistence.js` | async decision points; switch-list validation; interface-drop handling |
| `src/js/09b-fleet-diff-policy.js` | fleet UI parts removed; the CSV helpers stay |
| `src/js/09c-switches.js` (new, pure) | `switchRowRecipe`, `checkSwitchRows`, `switchRowsFromCsv`, `switchRowsToCsv`, `countedUpRows`, `exportState`, `validateSwitchRows`, `alignSwitchOverrides`; `checkFleet(r, csv)` kept as a wrapper with its current return shape |
| `src/js/10-events-boot.js` | wiring updated; boot sequence moved out |
| `src/js/10b-views.js` (new) | rail, Switches view, Cards view, side panel, Ports and Import dialogs, click-to-focus |
| `src/js/11-boot.js` (new) | boot: render, then the awaited autosave restore |

The build is unchanged (`build.py` concatenates `src/js/*.js` in name order), and the output stays readable, as today.

## 11. Testing

- **Existing pytest + Playwright suite** (47 tests) stays green, including the golden files. The three tests that drive the removed fleet box (test_v070 fleet gates, test_v071 duplicate button and alignment, test_v073 insert template) move to the new views. The pure-function tests stay as they are.
- **New `tests/test_v080.py`** covers:
  - the switch-list engine (inheritance, overrides, duplicates, counted-up rows, CSV round trip);
  - template changes (columns appear and disappear, values kept, changed cards detected);
  - interface drops;
  - validation and migration notes;
  - every dialog path (accept and cancel), including the boot restore;
  - findings' locations and click targets;
  - Cards exports (single, all, changed-only, text) with history states;
  - the 500-row timings;
  - a static check for no `confirm(` / `alert(` / `prompt(`.
- **Native dialogs.** The test fixture keeps accepting native dialogs. In-page ones are clicked explicitly in each test.
- **Running locally.** Python has neither pytest nor Playwright installed here. **Recommended:** `pip install -r requirements-dev.txt` (about 40 MB from PyPI), with tests launching the installed Edge through an optional `SWITCHCARD_PW_CHANNEL=msedge` setting in `conftest.py`, so no browser download is needed. CI is unchanged. The alternatives are pushing the branch to GitHub so CI runs it, or headless-Edge checks only.

## 12. Docs and release

- **Docs:**
  - `USER-GUIDE.md`: the *Fleet export* section becomes *Many switches: Switches and Cards*; review-tick and dialog notes.
  - `SAFETY-EXPORT.md`: the switch list, gates, export states, dialogs.
  - `README.md` feature list.
  - `DEVELOPMENT.md` layout table.
  - Version mentions in `EEM-CONTRACT.md` and `TESTED.md`.
- **CHANGELOG v0.8.0:** single-card output unchanged; schema v5; v0.7.3 opens v0.8.0 files and keeps the list.
- **Version strings:** `RELEASE`, the header comment, the label and the footer become 0.8.0.
- **Release:** merged into `main` locally when done. Pushing, tagging and the GitHub release happen only when the owner asks; the PII sweep runs before any push.

## 13. Risks

- **Async decision points in the restore paths** are the most delicate change. Mitigation: the same logic, only the prompt replaced, and tests for each accept and cancel branch.
- **500-row checks.** Mitigation: per-row cache and a timing test.
- **File size** grows by an estimated 50–80 KB from 320 KB. There is no hard limit; it is reported at release.

## 14. Out of scope

Write to card folder, Undo/Redo, the v2 engine and shells, snapshot ring, toasts.
