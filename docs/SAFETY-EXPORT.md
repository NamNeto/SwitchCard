# Safety: export, drafts, and preview ≡ ZIP

Reference for every export gate and input check. SwitchCard does **not** validate Cisco syntax or ensure remote reachability — these guards reduce common operator mistakes when building many cards.

## Unapplied Maintain drafts (`editorPending`)

- Edits on **Manage recipes & baseline** (name, template, interfaces, roles, example flag, SKU fill) set `editorPending` until you click **Apply recipe changes** or **Discard unapplied draft**.
- Preview, Build fields, and `generate(current())` always use the **last applied** recipe — never the unapplied textarea draft.
- While pending, SwitchCard **blocks**:
  - **Export SD-card ZIP**
  - **Save text only**
  - **Save team package**
  - the **Switches** and **Cards** views (locked until Apply or Discard) and every Cards export
- Status message: "Apply recipe changes or Discard unapplied draft first."
- Copy preview stays allowed (still the applied preview text). Clear the draft with Apply or Discard before packaging a card.

## Export dialog and review tick

Every export (Build's Export SD-card ZIP, Card ZIP and the Cards bulk exports) opens an in-page write dialog (`writeDialog()`). Its download button stays disabled until the box *I reviewed this configuration and the baseline selection.* is ticked; the tick is created with the dialog, so it can never be left ticked from an earlier card. *Copy summary* copies the text. A single card shows the summary from `exportConfirmSummary()`, run on the effective switch for Card ZIP: recipe name, **bound** hostname / MGMT_IP / GATEWAY / MGMT_VLAN / MGMT_LOOPBACK, the resolved management interface (for example `Vlan100 (SVI mode)`), **every extra bound value without truncation**, preview lines/bytes, the **SHA-256 of editcontent.txt**, advanced options, baseline model/label, and the reminder that root `editcontent.txt` is **exactly** the preview. Extra values used outside ASCII-space-indented `!` lines come first; comment-only extras follow. Binding scans the main template and used role templates. Unbound identity fields show **NOT SET (not bound in template)**. ZIP filename uses the bound hostname or a neutral `switch-…` name. Cancel or Esc aborts with no download. Long summaries stay complete; review them before accepting. A bulk export shows the row list with per-row hashes instead.

## Team policy rules (blocking)

`teamPolicies` lines are parsed as `require <regex>` / `forbid <regex>` [`  # note`] and evaluated by `policyViolations()` on `positiveConfigText(text)` (comments and `no …` lines removed; flags `im`). Violations are added by `blockers()`, appear as a red box above the preview and disable **Export SD-card ZIP**, **Save text only** and every Cards export. In Switches and Cards a row with a policy failure counts as a row with errors (fail closed). A rule that cannot be parsed or an invalid regular expression counts as a violation (fail closed). Rules never alter generated text. Copy preview is not gated.

## Switch list (Switches)

`recipe.switches` is an optional array of `{ id, values, ports }` inside each recipe (schema v5 unchanged; v0.7.3 opens and re-saves it untouched). `switchRowRecipe()` builds one recipe clone per row: the row's own non-empty values and port settings override Device details and the shared port table, and an empty value inherits. `checkSwitchRows()` runs the full `generate()` plus the team policies on every row and adds duplicate hostnames (case-insensitive) and duplicate `MGMT_IP` across rows as errors on every row involved (each names another row of the duplicate, so neither can export a single card); results are cached per row against a recipe stamp. Limit: `MAX_FLEET_ROWS` per recipe. A list of more than one switch whose Routed ports carry addresses from the shared port table gets a review note, because those addresses repeat on every switch.

- **Validation on open** (`validateSwitchRows()`): a list that is not an array or has more than `MAX_FLEET_ROWS` rows, an entry that is not an object, `values` that are not text, `ports` that are not text maps, and control characters in a saved port VLAN refuse the file ("The project contains an invalid switch list."). Control or invisible characters in values, reserved or derived keys (`PORTS`, `VLANS`, `INTERFACE`, `VLAN`, `DESCRIPTION`, `PORT_IP`, `PORT_MASK`, `MGMT_INTERFACE`, `MGMT_SOURCES`), unknown port attributes and duplicate ids are cleaned with a migration note. An unknown role, or a setting for an interface the recipe does not have, is a row error, never dropped silently.
- **Template and interface changes:** columns are derived from the current template, so stored values for a placeholder the template no longer uses are kept but unused. `alignSwitchOverrides()` keeps per-switch port settings by interface name; when *Apply recipe changes*, Open, a team package or an autosave restore would drop settings on interfaces that left the list, the drop dialog lists them first, and only those settings are removed.
- **Add counted up** (`countedUpRows()`, using `fleetCopyRows()`) writes only `HOSTNAME` and `MGMT_IP`, counted up from the last row's effective values (on an empty list, starting with the Build page's switch): trailing number of the hostname, keeping leading zeros; the address as a 32-bit integer. It refuses a count outside 1-`MAX_FLEET_ROWS` or past the list limit, a hostname without a trailing number, an invalid address, and, for SVI recipes with a bound `MGMT_MASK`, a range that leaves the usable hosts of the management subnet.
- **CSV** (`switchRowsFromCsv()`, `switchRowsToCsv()`): `parseCsv` accepts comma, semicolon or tab, quoted cells and a BOM; header names map to the recipe's bound fields, reserved names cannot be columns, unknown columns are ignored with a note, and empty cells inherit. Cells that could not be decoded as UTF-8 are reported. A file larger than 2 MiB is refused. Export writes the rows as stored, so a round trip reproduces the list.
- **Port columns** (`portColumnOf()`, `resolvePortName()`): a header of the form `<interface> <description|role|vlan|ip|mask>` sets that port for the row (role first; a role other than Routed clears IP and mask). Short names resolve only when exactly one interface matches; unknown interfaces, duplicate columns and unknown roles are errors, and every resulting value goes through the same `generate()` checks. The **port CSV** on Build uses the same functions on a copy of the port table and replaces the table only when every row is valid.

## Card exports (Cards)

- **Gates:** every Cards export applies `blockers()` (unapplied draft, example recipe, matching baseline, team policies) exactly like a single card; the gate line lists them plus the rows with errors or policy failures.
- **Export state** (`exportState()`): from the last export of the hostname (`lastExport()`: the newer of the text entry in `recipe.exports` and the hash-only entry in `recipe.exportStates`, compared by `at`), `new` (not exported), `current` (stored hash equals the hash of the current text: up to date) or `changed` (changed since; the dialog shows the line diff, or, when the text is no longer in the bounded text history, both SHA-256 values and "No stored text to compare"). The state needs only the hash, so it is right for every switch up to `MAX_FLEET_ROWS`, not only for the hostnames whose text is still stored. A recipe that does not bind `HOSTNAME` is not tracked.
- **Bulk** (*All card ZIPs*, *Changed and new only*, *Text-only ZIP*): rows are re-checked at click time; an included row with errors stops the export before any dialog opens and is named in the status line (all-or-nothing). After the write dialog, card exports write one ZIP per row (`buildCardFiles` on that row's text) followed by a manifest; the text-only export writes one ZIP with `HOSTNAME/editcontent.txt` per row plus the manifest. Each row is recorded in the history right after its own download, so if a later card fails the rows already downloaded stay recorded (and the project is marked changed); the text-only ZIP records every row after its single download.

## Export history and diff

`recordExport(recipe, host, text)` stores `{ host, at, release, sha256, text }` per lower-cased hostname in `recipe.exports`, pruned newest-first to `MAX_EXPORT_HISTORY` entries and `MAX_EXPORT_HISTORY_CHARS` characters. `validateProject` keeps only self-consistent entries (key equals the lower-cased host and the stored hash equals the hash of the text) and reports dropped ones. The Build panel and the Switches side panel diff the current text against the entry for the hostname (Myers line diff; beyond `MAX_DIFF_LINES` / `MAX_DIFF_EDITS` only the hashes are shown). Duplicate recipe starts the copy with an empty history.

The same call also stores `{ host, at, release, sha256 }` (no text) in `recipe.exportStates`, bounded to the newest `MAX_FLEET_ROWS` hostnames. This hash-only record feeds the Cards states, the Cards rail chip and *Changed and new only (n)*. It is separate from `recipe.exports` because v0.7.3 drops any `exports` entry without its text; v0.7.3 keeps `exportStates` unread when it opens and saves a v0.8.0 project, and a newer export made by v0.7.3 (text entry only) still wins by its `at`. `validateProject` keeps an entry only when it is an object with string `host` and `at`, a 64-hex `sha256` and a key equal to the lower-cased trimmed host, drops the rest with a migration note, and keeps the newest `MAX_FLEET_ROWS` (note when more were dropped). Duplicate recipe starts the copy with empty export states too.

## Baseline fingerprint

`fingerprintFiles()` hashes every file with SHA-256 (`crypto.subtle`, falling back to the built-in implementation) and derives one digest over the sorted `path / size / sha256` list. `projectPayload().baseline` carries `{ model, version, fingerprint }`, with per-file entries when the folder has at most `MAX_FINGERPRINT_FILES` files; when no folder is loaded, the record the project was opened with is preserved. Loading a folder compares digests and lists changed, added and missing paths; a mismatch is a warning repeated in the export dialog, never a hard block, because re-saving the project is how a new baseline is adopted. A team package is refused when its files do not match the manifest fingerprint. Invalid fingerprints in a file are dropped with a migration note.

## Project load and port remapping

- Opening a current-format (schema v3, v4 or v5) project, team package or autosave does **not** rewrite recipe templates. Legacy CLI migrations run only for schema v1/v2 and are reported as migration notes. Schema v4 (v0.6.0) adds the per-recipe `mgmtInterface` and `mgmtSources` fields; a v3 file gets the defaults (SVI, default source block), which do not change its output. An unknown `mgmtInterface` value or a non-text `mgmtSources` is reset with a migration note, never refused. Schema v5 (v0.7.0) adds `teamPolicies`, `baseline.fingerprint` and per-recipe `exports`; older releases refuse v5 files so a blocking rule is never silently ignored. v0.8.0 adds the optional per-recipe `switches` list without a schema bump.
- Changing the interface list (e.g. a SKU preset) keeps port roles by interface name and asks in a dialog before dropping unmatched assignments and per-switch port settings. Open, team package and autosave restore ask the same way (Cancel = no change); until then, unmatched ports stay visible and block export. Unknown roles are validation errors, never a silent shutdown.
- The export dialog, the ZIP filename and "bound" fields use only placeholders from the main template and the role templates actually assigned to ports.
- Team package save/import require a complete baseline (at least one file besides root `editcontent.txt`).
- Routed port IP/mask are trimmed once; the same normalized values are validated and emitted.
- Save project / team package refuse oversize payloads; opening a file warns if the workspace is dirty or has an unapplied draft; Clear autosave cancels any pending autosave write.

## Input and output checks

- **ASCII file policy:** the entire generated file, including `!` comments, must be printable ASCII 0x20–0x7E plus CRLF line endings. Tabs become single spaces. Errors give line and code-point column; similar characters in fields are described as “also found,” not proven sources. On Open/Apply, templates and roles are refused if they contain a bare CR or other listed control characters. Single-line fields are sanitized with notices/notes, and every placeholder value is trimmed (on output, when leaving the field, and on open). Control characters in a saved port VLAN refuse the file. Non-ASCII template text outside that narrow set stays editable but blocks export. Reserved per-port recipe-value keys are dropped with a migration note and cannot override port data.
- **Addressing:** network/broadcast used as a host, gateway outside the management subnet, 0.0.0.0/8, loopback, multicast/reserved, /32 management mask with a gateway, overlapping routed/SVI subnets → errors. /31 or very large management subnets, routed /32 → warnings. In **Loopback** management mode the /32 and gateway-outside-subnet rules do not apply (a /32 is expected; any other mask warns); notes flag a missing `ip routing`, an `ip default-gateway` without `ip route 0.0.0.0`, and a gateway that sits in no Routed port subnet.
- **Management interface:** `{{MGMT_INTERFACE}}` binds MGMT_VLAN (SVI) or MGMT_LOOPBACK (Loopback; a whole number 0–2147483647, leading zeros dropped) as a required field. `{{MGMT_SOURCES}}` expands the recipe's source block, which has the same size limit and invisible-character refusal as a role template (an empty block warns). `MGMT_INTERFACE` and `MGMT_SOURCES` are never taken from typed values: a saved value with one of those keys is dropped with a migration note, like the per-port keys. Only a bound (visible) management VLAN feeds `{{VLANS}}`.
- **VLANs:** 1002–1005 refused for Access / management and left out of `{{VLANS}}` for trunk lists (warning); >64 `vlan` lines warn, >256 refuse; management VLAN not carried by any Access port or Trunk → warning. Surrounding spaces accepted; leading zeros normalized (`007` → `7`).
- **Role lines:** a role-template line that uses `{{VLAN}}`, `{{PORT_IP}}` or `{{PORT_MASK}}` is an error when that port's value is empty (e.g. `switchport trunk allowed vlan {{VLAN}}` with no VLAN).
- **Descriptions:** empty → no `description` line; >200 characters or non-ASCII → error; `{{`/`}}` → field-specific error.
- **Autosave:** key `switchcard-autosave-v21`; an older-format or other-version autosave is fully validated and restored only after the in-page dialog is answered; autosave stays paused until then. Unrestored autosaves are backed up with the reason; if preservation fails, autosave pauses instead of overwriting.
- **Optional (off by default):** provenance header/footer comments and `default interface` — see [EEM-CONTRACT.md](EEM-CONTRACT.md).

## Recovery

- **Restore:** cancels the debounce timer, pauses autosave, validates the candidate, then backs up the live workspace and pending draft before replacing current memory/storage. A failed validation or preservation write aborts with everything unchanged and autosave resumes on the next edit; a failure while writing the current autosave keeps it paused. Different prior stored autosave bytes are included as `preservedAutosaveRaw` (one level only) in the newest backup download. Firmware bytes are not backed up; reload the baseline folder after a successful restore.
- **Atomic backups:** one `switchcard-autosave-backups` array contains at most three entries (a fourth only after an interrupted restore collided with another writer; the next backup trims it). Each list update is one `setItem`; a failed write leaves the previous list intact. Older per-slot backup keys are migrated and deleted only after the new array is durable. Restore removes the selected entry, which becomes current, and inserts the previous workspace without dropping unrelated entries. An in-array recovery journal retains both sides while the separate current-autosave key is committed; if cleanup fails, autosave pauses and the next read/reload retries it. The journal fingerprints the replaced autosave, so a foreign write in between cannot drop the pre-restore workspace, and a normal autosave finishes any pending journal first.
- **Draft-aware Open:** opening autosave or backup wrappers restores an unapplied Maintain draft into the editor and says so. Export stays blocked until Apply/Discard. A draft that matches no recipe (or is malformed) does not block the workspace: the recipes open and the draft is kept verbatim as `parkedDraft` in autosave and downloads, with a status note.
- **Cleanup visibility:** Apply writes cleaned names/firmware labels back to the editor and gives a notice. Baseline labels use the same sanitation.
- **Clear:** removes every `switchcard-*` key, then writes only the non-config `switchcard-autosave-v20-read=1` marker. In-memory work remains; subsequent edits can save again.
- **Literal interfaces:** subnet/overlap checks only see `{{MGMT_IP}}`/`{{MGMT_MASK}}` and Routed-port addresses. Literal `ip address` lines are advisory-only; detection normalizes case/horizontal spacing and scans the main template plus roles actually used. It is not a Cisco parser. 169.254.0.0/16 management IP / gateway → warning.

## Preview ≡ ZIP identity

The Configuration preview and the ZIP's root `editcontent.txt` come from **separate** calls to `generate(current())` (render vs. `assertExportReady` → `buildCardFiles`). `generate()` is deterministic for the same applied recipe and contains no timestamp (even with the optional provenance header), so both calls produce identical bytes; export is blocked while a Maintain draft is unapplied, so the recipe cannot change in between. Under the preview, `#previewMeter` shows `Lines: N · Bytes: M`; the export dialog shows the SHA-256 so you can check the extracted file (`certutil -hashfile editcontent.txt SHA256`). ZIP entries carry the real export time.

## Size limits (reject, don't truncate)

| Limit | Default |
|-------|---------|
| `MAX_TEMPLATE_CHARS` | 500,000 |
| `MAX_ROLE_CHARS` (each role template and the management source block) | 100,000 |
| `MAX_INTERFACES` / `MAX_PORTS` | 128 |
| `WARN_GENERATED_CHARS` warning | >100,000 chars (still exportable) |
| `MAX_GENERATED_CHARS` hard cap | 2 MiB generated text (refused, not truncated) |
| `MAX_VLAN_STATEMENTS` / `WARN_VLAN_STATEMENTS` | 256 refused / 64 warning (`vlan` lines from `{{VLANS}}`) |
| `MAX_DESCRIPTION_CHARS` | 200 per port description |
| `MAX_RECIPE_NAME_CHARS` / `MAX_PRESET_NAME_CHARS` | 120 / 60 |
| `MAX_TEAM_HINTS` / `MAX_TEAM_HINT_CHARS` | 50 hints / 300 chars each |
| `MAX_TEAM_POLICIES` / `MAX_TEAM_POLICY_CHARS` | 50 rules / 300 chars each |
| `MAX_FLEET_ROWS` | 500 switches per recipe |
| `MAX_EXPORT_HISTORY` / `MAX_EXPORT_HISTORY_CHARS` | 50 hostnames / 512 KiB of text per recipe (diffs) |
| `exportStates` (bounded by `MAX_FLEET_ROWS`) | 500 hash-only export records per recipe (Cards states) |
| `MAX_FINGERPRINT_FILES` | 2,000 per-file hashes saved in the project |
| `MAX_DIFF_LINES` / `MAX_DIFF_EDITS` | 6,000 lines / 2,000 edits before the diff falls back to hashes |

Oversized templates/roles/interface lists fail `applyRecipe` and `validateProject` with a clear error.

## Soft remote-access warnings

Warnings (not hard blocks) may note missing default-gateway/default-route markers, missing SVI / `{{VLANS}}`, or soft SSH / credential patterns. Team security hints remain advisory-only. Always confirm reachability on your tested image before production use.
