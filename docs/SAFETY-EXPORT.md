# Safety: export, drafts, and preview ≡ ZIP

Reference for every export gate and input check. SwitchCard does **not** validate Cisco syntax or ensure remote reachability — these guards reduce common operator mistakes when building many cards.

## Unapplied Maintain drafts (`editorPending`)

- Edits on **Manage recipes & baseline** (name, template, interfaces, roles, example flag, SKU fill) set `editorPending` until you click **Apply recipe changes** or **Discard unapplied draft**.
- Preview, Build fields, and `generate(current())` always use the **last applied** recipe — never the unapplied textarea draft.
- While pending, SwitchCard **blocks**:
  - **Export SD-card ZIP**
  - **Save text only**
  - **Save team package**
- Status message: "Apply recipe changes or Discard unapplied draft first."
- Copy preview stays allowed (still the applied preview text). Clear the draft with Apply or Discard before packaging a card.

## Confirm before SD-card ZIP

Export shows a `confirm()` summary from `exportConfirmSummary()`: recipe name, **bound** hostname / MGMT_IP / GATEWAY / MGMT_VLAN / MGMT_LOOPBACK, the resolved management interface (for example `Vlan100 (SVI mode)`), **every extra bound value without truncation**, preview lines/bytes, the **SHA-256 of editcontent.txt**, advanced options, baseline model/label, and the reminder that root `editcontent.txt` is **exactly** the preview. Extra values used outside ASCII-space-indented `!` lines come first; comment-only extras follow. Binding scans the main template and used role templates. Unbound identity fields show **NOT SET (not bound in template)**. ZIP filename uses the bound hostname or a neutral `switch-…` name. Cancel aborts with no download. Long summaries stay complete; review them before accepting.

## Project load and port remapping

- Opening a current-format (schema v3 or v4) project, team package or autosave does **not** rewrite recipe templates. Legacy CLI migrations run only for schema v1/v2 and are reported as migration notes. Schema v4 (v0.6.0) adds the per-recipe `mgmtInterface` and `mgmtSources` fields; a v3 file gets the defaults (SVI, default source block), which do not change its output. An unknown `mgmtInterface` value or a non-text `mgmtSources` is reset with a migration note, never refused.
- Changing the interface list (e.g. a SKU preset) keeps port roles by interface name and **confirms** before dropping unmatched assignments. Open, team package and autosave restore confirm the same way (Cancel = no change); until then, unmatched ports stay visible and block export. Unknown roles are validation errors, never a silent shutdown.
- The confirm, the ZIP filename and "bound" fields use only placeholders from the main template and the role templates actually assigned to ports.
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
- **Autosave:** key `switchcard-autosave-v21`; an older-format or other-version autosave is fully validated and restored only after a confirmation. Unrestored autosaves are backed up with the reason; if preservation fails, autosave pauses instead of overwriting.
- **Optional (off by default):** provenance header/footer comments and `default interface` — see [EEM-CONTRACT.md](EEM-CONTRACT.md).

## Recovery

- **Restore:** cancels the debounce timer, pauses autosave, validates the candidate, then backs up the live workspace and pending draft before replacing current memory/storage. A failed validation or preservation write aborts with everything unchanged and autosave resumes on the next edit; a failure while writing the current autosave keeps it paused. Different prior stored autosave bytes are included as `preservedAutosaveRaw` (one level only) in the newest backup download. Firmware bytes are not backed up; reload the baseline folder after a successful restore.
- **Atomic backups:** one `switchcard-autosave-backups` array contains at most three entries (a fourth only after an interrupted restore collided with another writer; the next backup trims it). Each list update is one `setItem`; a failed write leaves the previous list intact. Older per-slot backup keys are migrated and deleted only after the new array is durable. Restore removes the selected entry, which becomes current, and inserts the previous workspace without dropping unrelated entries. An in-array recovery journal retains both sides while the separate current-autosave key is committed; if cleanup fails, autosave pauses and the next read/reload retries it. The journal fingerprints the replaced autosave, so a foreign write in between cannot drop the pre-restore workspace, and a normal autosave finishes any pending journal first.
- **Draft-aware Open:** opening autosave or backup wrappers restores an unapplied Maintain draft into the editor and says so. Export stays blocked until Apply/Discard. A draft that matches no recipe (or is malformed) does not block the workspace: the recipes open and the draft is kept verbatim as `parkedDraft` in autosave and downloads, with a status note.
- **Cleanup visibility:** Apply writes cleaned names/firmware labels back to the editor and gives a notice. Baseline labels use the same sanitation.
- **Clear:** removes every `switchcard-*` key, then writes only the non-config `switchcard-autosave-v20-read=1` marker. In-memory work remains; subsequent edits can save again.
- **Literal interfaces:** subnet/overlap checks only see `{{MGMT_IP}}`/`{{MGMT_MASK}}` and Routed-port addresses. Literal `ip address` lines are advisory-only; detection normalizes case/horizontal spacing and scans the main template plus roles actually used. It is not a Cisco parser. 169.254.0.0/16 management IP / gateway → warning.

## Preview ≡ ZIP identity

The Configuration preview and the ZIP's root `editcontent.txt` come from **separate** calls to `generate(current())` (render vs. `assertExportReady` → `buildCardFiles`). `generate()` is deterministic for the same applied recipe and contains no timestamp (even with the optional provenance header), so both calls produce identical bytes; export is blocked while a Maintain draft is unapplied, so the recipe cannot change in between. Under the preview, `#previewMeter` shows `Lines: N · Bytes: M`; the export confirm shows the SHA-256 so you can check the extracted file (`certutil -hashfile editcontent.txt SHA256`). ZIP entries carry the real export time.

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

Oversized templates/roles/interface lists fail `applyRecipe` and `validateProject` with a clear error.

## Soft remote-access warnings

Warnings (not hard blocks) may note missing default-gateway/default-route markers, missing SVI / `{{VLANS}}`, or soft SSH / credential patterns. Team security hints remain advisory-only. Always confirm reachability on your tested image before production use.
