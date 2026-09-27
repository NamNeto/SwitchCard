# Changelog

## Unreleased

- **Repository:** `CONTRIBUTING.md` (feature requests and bug reports welcome as issues; outside pull requests are proposals and changes come from the maintainer), `CODEOWNERS`, and issue forms that ask for placeholder values only. Security problems now go through GitHub private vulnerability reporting (`SECURITY.md`). The README states that `SwitchCard.html` is the only file needed to use the tool. No change to `SwitchCard.html`.

## v0.7.1 — 2026-09-27

Fleet usability release. Single-card output is byte-for-byte the same as v0.7.0 (golden tests) and project files stay schema v5.

- **Duplicate switch (new).** In Fleet export, enter the number of switches and click *Duplicate switch*: row 1 is the switch on the page and every further row counts the hostname's trailing number and the management IP up by one (`…-01`, `…-02`; `.10`, `.11`). Only those two columns are written, so everything else keeps following Device details, and the rows are checked straight away. It refuses, with the reason, a hostname without a trailing number and a range that would run past the last usable address of the management subnet (Loopback mode has no shared subnet, so no limit there).
- **The fleet CSV explains itself.** A line above the CSV box lists every column the recipe uses, and the empty box shows a grey two-row example built from the values on the page. The check table now lists every field of every switch, with values taken from Device details in italics.
- **Aligned buttons.** File buttons (Load CSV file, Open project, Open team package) sat 3 px above the buttons beside them because they kept the generic label margin, and inputs (44 px), selects (43 px) and buttons (38 px) had different heights. All of them now share one 40 px height with centred text, and paired buttons split their row into equal columns, so stacked rows line up and a wrapped row fills the card. The empty table frame under the fleet CSV box stays hidden until there is a result.
- **Review note for routed ports in a fleet.** When a fleet has more than one switch and Routed ports carry addresses, a note says those addresses come from the shared port table and repeat on every switch.
- **Reference EEM applet replaced by the workflow's real one.** `examples/eem-applet-example.md` (and the plain-text `examples/eem-applet-SyncConfig.txt`) now document the `SyncConfig` applet used in the field: copy `editcontent.txt` into the startup-config, merge it into the running configuration, remove the applet's own trigger, `write memory`. The page also describes how the baseline card is created from an empty switch with `sync sdflash:`. The earlier merge-and-rename sketch is kept only as a described alternative. EEM-CONTRACT gained a "Reference flow" section and A5, A7 and A11 were reworded to match. Documentation only.

## v0.7.0 — 2026-09-27

Tooling and workflow release. Existing recipes produce the same `editcontent.txt` as v0.6.0; the golden tests in `tests/golden/` prove it for the built-in examples. Project files are now schema **v5**: team policy rules can block export, so an older release must refuse a file whose rules it cannot enforce. v3 and v4 files open unchanged. Still not device-tested (see `docs/TESTED.md`).

- **Team policy rules (new, blocking).** Under *Team security hints* in Manage: `require <regex>` / `forbid <regex>` lines, matched against the generated text without `!` comments and `no …` lines. A failing or invalid rule blocks Export SD-card ZIP, Save text only and fleet export; hints stay advisory.
- **Fleet export (new).** Paste or load a CSV whose header holds placeholder names; empty cells inherit the Device details. *Check fleet* runs every check on every row and shows result, line count and SHA-256; export writes one card ZIP per switch plus a manifest, or one text-only ZIP with `HOSTNAME/editcontent.txt` per switch. Same gates as a single card, plus duplicate hostname and address detection.
- **Changes since the last export (new).** Every export remembers its text per hostname inside the recipe (bounded, hash-checked on open, saved with the project). Rebuilding the same switch shows a line diff under the preview.
- **Baseline fingerprints (new).** Loading a folder hashes every file (SHA-256, hashes only). Save project and team packages record the fingerprint; a folder loaded later is compared with the record and differences are listed, the export confirm repeats the verdict, and a team package whose files no longer match its manifest is refused.
- **Fill from show ip interface brief (new).** Paste the switch output in the recipe editor; physical Ethernet ports become the interface list, while Vlan, Loopback, Port-channel, Tunnel, AppGigabitEthernet, subinterfaces and `GigabitEthernet0/0` are skipped and listed.
- **Transliterate to ASCII (new).** When non-ASCII characters block export, one click converts values and port descriptions (ue/oe/ae/ss, accents, dashes, curly quotes, invisible characters) and loads a transliterated template into the recipe editor for review.
- **Light theme (new).** Auto / Dark / Light picker in the header; Auto follows the operating system. Browser-local; removed by Clear browser autosave.
- **Loopback gateway note** now recognises a transit SVI or other L3 interface typed literally into the template.
- **Source tree, tests, CI and demo.** `src/` + `build.py` assemble the unchanged single file; pytest + Playwright tests with golden outputs run in GitHub Actions; GitHub Pages serves a demo; `docs/DEVELOPMENT.md`, `docs/TESTED.md` (device matrix, empty) and `examples/eem-applet-example.md` (reference apply-once applet, untested) were added.
- An autosave written by v0.6.0 is offered for restore with the usual "saved by another version" confirmation.

## v0.6.0 — 2026-09-27

Management-interface release. Existing recipes produce the same `editcontent.txt` as v0.5.14 unless they hit the corrected VLAN check below; the new placeholders act only when a template uses them. Project files are now schema **v4** (v3 files open unchanged; v0.5.x cannot open v4 files). Not device-tested: run the spare-switch checklist in `docs/EEM-CONTRACT.md` before production use.

- **Management interface: SVI or Loopback (new).** Each recipe chooses, in the recipe editor, whether `{{MGMT_INTERFACE}}` means `Vlan<MGMT_VLAN>` (SVI, the default and the behaviour of every older recipe) or `Loopback<MGMT_LOOPBACK>`. Write `interface {{MGMT_INTERFACE}}` in the template; Build then asks for the management VLAN or the loopback number.
- **`{{MGMT_SOURCES}}` block (new).** Expands to the recipe's editable list of management-plane source commands, by default `ntp source`, `ip radius source-interface`, `logging source-interface` and `ip ssh source-interface`, each pointing at `{{MGMT_INTERFACE}}`. Changing the management VLAN, or switching the recipe to a loopback, moves all of them at once. Add `ip tacacs source-interface` or `snmp-server trap-source` lines in the recipe editor if your standard uses them.
- **Loopback-aware checks.** In Loopback mode a /32 mask is normal and the gateway is expected outside the loopback subnet, so those SVI errors are not raised. New review notes flag a missing `ip routing`, an `ip default-gateway` that routing would ignore, a mask other than /32, and a gateway that sits in no Routed port subnet. The "no interface Vlan SVI" note accepts a Loopback in this mode.
- **Fix: hidden management VLAN.** `{{VLANS}}` created a `vlan N` line from a saved MGMT_VLAN value even when the template no longer used `{{MGMT_VLAN}}`, so nothing on Build showed where the line came from. Only a bound (visible) management VLAN now counts. A recipe in that situation loses that one line; the preview shows it.
- **SKU presets verified against Cisco data sheets (September 2026).** Every PID and port count was checked. **IE9300 uplinks corrected** to `Gi1/0/25–28` (1G models) and `Te1/0/25–28` (10G models); earlier releases guessed Catalyst-style `1/1/x` names. Added IE-3200-8P2S, the IE3300 base models (8T2S, 8P2S, 8T2X and 8U2X, with `Te1/1–2` uplinks on the 10G units), IE3300 and IE3400 + IEM-3300 combinations, and IE-9310-26S2C, IE-9320-26S2C and IE-9310-16P8S4X. Models whose mGig port names could not be verified (IEM-3300-4MU, IE-9320-16P8U4X) are deliberately not preset. Details and sources in `docs/models-and-interfaces.md`.
- **New example.** A fourth built-in example shows loopback management with a Routed uplink (documentation addresses only; export stays blocked). `examples/example-project.json` now carries both an SVI and a Loopback recipe.
- **New switch** keeps `MGMT_LOOPBACK` together with MGMT_MASK, MGMT_VLAN, GATEWAY and SITE.
- The export confirm lists the resolved management interface. Drafts, autosave, project and team-package checks cover the two new recipe fields; an unknown value in an older or edited file is reset with a migration note instead of refusing the file. A stray typed value for a placeholder SwitchCard fills itself (`MGMT_INTERFACE`, `MGMT_SOURCES`) is dropped with a note, like the per-port keys.
- An autosave written by v0.5.14 is offered for restore with the usual "saved by another version" confirmation.

## v0.5.14 — 2026-09-25

Styling and layout pass. The generated `editcontent.txt` is byte-for-byte the same as v0.5.13 for the same input (only the optional provenance header shows the new version); every check and export gate is unchanged.

- **Checkboxes line up with their labels.** A generic input rule gave checkboxes a 40 px minimum height, which pushed each box above its text. Checkbox labels now use normal text size and colour.
- **One status box above the preview.** Errors appear as a single red list and review notes as a single yellow list (without the repeated "Soft:" prefix); a green "Checks passed" box appears only when there is nothing to review. Export blockers are listed once, under the Export button, in smaller text with an "Export blocked:" prefix.
- **Narrow windows no longer scroll sideways.** Below 980 px the single-column layout can shrink, so the ports table scrolls inside its own box instead of widening the page.
- **Less fine print.** Shorter New switch help; the baseline folder notes moved inside *View baseline files*; the Swap Drive disclaimer stays in the footer only; the redundant note under the tab preference is gone.
- **Navigation.** The tab bar is shown only when the Manage tab is pinned (a single "Build a card" pill did nothing); *Back to card builder* is the way back otherwise.
- **Small fixes.** The allowed-baseline-labels box is taller and its hint fits; leftover colours from the old cyan accent now use the teal accent.

## v0.5.13 — 2026-09-25

Robustness and clarity release. Card output is unchanged except where noted (the new role-line check can add an error; the optional provenance header now says v0.5.13). Not device-tested: run the spare-switch checklist in `docs/EEM-CONTRACT.md` before production use.

- **Unrestorable drafts no longer lock you out.** An unapplied Maintain draft that matches no recipe (or is malformed) used to make Open, boot restore and backup restore refuse the whole workspace. Now the recipes open, and the draft is kept unchanged as `parkedDraft` in browser autosave and autosave downloads. The status line says so on every load.
- **Autosave no longer grows with repeated restores.** Only one level of `preservedAutosaveRaw` is kept; the older nested copy is dropped because the backup list already covers it.
- **Safer interrupted restores.** The restore journal remembers a fingerprint of the autosave it replaced. If another tab or an older SwitchCard wrote the autosave before the journal was finished, the pre-restore workspace is kept as an extra (4th) backup; the next normal backup trims the list back to 3. A normal autosave write also finishes any pending journal first.
- **Stray spaces are trimmed.** Every placeholder value (HOSTNAME, SITE, custom fields) is trimmed for output and checks, trimmed when you leave the field, and trimmed when a file is opened. A trailing space in HOSTNAME no longer gives a confusing hostname error.
- **A failed restore that changed nothing no longer pauses autosave.** The next edit saves as usual. A failure while writing the current autosave still pauses it.
- **Role lines with an empty port value are errors (new check).** A role-template line that uses `{{VLAN}}`, `{{PORT_IP}}` or `{{PORT_MASK}}` now blocks export when that port's value is empty. Example: a team Trunk template with `switchport trunk allowed vlan {{VLAN}}` and an empty VLAN field used to emit a bare `switchport trunk allowed vlan`, leaving the trunk open to every VLAN.
- **Clearer messages.** The green "checks passed" notice says when export is still blocked; a recipe name made only of invisible characters gets its own message; pasted invisible characters in a recipe name are cleaned instead of refused; no more double periods; no dangling "·" in the header.
- **Upgrade note (applies since v0.5.12):** projects from v0.5.11 or earlier whose templates or values put non-ASCII text into `!` comments (an em dash, or a SITE such as `München`) open fine but **block export** until edited. Transliterate: ü→ue, ö→oe, ä→ae, ß→ss, — or – → `-`.
- **Code comments** rewritten for maintainers: a code map and safety invariants at the top of the script.
- An autosave written by v0.5.12 is offered for restore with the usual "saved by another version" confirmation.

## v0.5.12

- Restoring an autosave backup validates first and keeps the current workspace (including an unapplied draft) as a backup before replacing anything; a storage-quota failure changes nothing. A recovery journal protects interrupted restores.
- The three autosave backups live in one atomically written list (`switchcard-autosave-backups`); older per-slot keys migrate automatically.
- **Open project** accepts downloaded autosave and backup files and puts an unapplied draft back into the editor.
- The whole generated file, including `!` comments, must be printable ASCII with CRLF line endings; errors name the line and column.
- The export confirmation lists every bound value, operational values first.
- Apply shows cleaned recipe names and firmware labels; IP/mask/VLAN fields trim surrounding spaces.

## v0.5.11

- Every command line of `editcontent.txt` must be printable ASCII; hidden and look-alike characters block export with line, column and source field.
- Pasted invisible characters in single-line fields are cleaned (with a notice) instead of making a project unopenable.
- **New switch** keeps only MGMT_MASK, MGMT_VLAN, GATEWAY and SITE (plus port roles, VLANs and descriptions) and clears everything else.
- **Clear browser autosave** removes every SwitchCard key in the browser.
- Three rotating autosave backups with a selector for Restore / Download.
- Tabs in templates become single spaces; link-local management addresses warn; literal `ip address` lines in templates get an advisory note.
- EEM contract: apply-once assumption (A11) and checklist item C9.

## v0.5.10

- Bare CR, control, zero-width and bidi characters are detected everywhere (templates, values, ports, open/restore) and reported with line and column.
- New autosave key `switchcard-autosave-v21`; an older autosave is validated and restored only after confirmation. Unrestorable autosaves are kept as backups with the reason instead of being overwritten; Restore / Download autosave backup added; a warning appears when another tab writes the autosave.
- An empty port description omits the `description` line.
- Management addressing checks: network/broadcast as host, gateway outside the subnet, reserved ranges, overlapping subnets (errors); unusual masks (warnings).
- VLAN checks: 1002–1005 refused for access/management; `{{VLANS}}` warns above 64 and refuses above 256 statements; management-VLAN reachability warning; leading zeros normalized.
- SHA-256 of `editcontent.txt` in the export confirm; optional provenance header/footer and optional `default interface` (both off by default); real export time in ZIP entries.
- Limits on descriptions, recipe names and team hints; soft warning when interface names do not fit the model family.
- New `docs/EEM-CONTRACT.md` with the spare-switch checklist.

## v0.5.6 – v0.5.9

- Opening a current-format project never rewrites templates; legacy migrations run only for old schemas and are reported.
- Port assignments are re-matched by interface name; dropping unmatched ports always asks first (Apply, Open, package, restore). Unknown roles are errors, never a silent shutdown.
- The confirm and ZIP filename use only fields actually bound in the template and used roles.
- Team packages require a complete baseline; generated text is capped at 2 MiB; soft security hints ignore comments and `no` lines; Duplicate keeps the example flag.
- Port VLANs are validated whenever the template uses them; control characters in saved VLANs are refused; trunk lists are normalized.

## v0.5.0 – v0.5.5

- Export is blocked while the recipe editor has unapplied changes; a confirm dialog summarizes the card before download; preview and ZIP share one generated text, with a line/byte meter.
- Size limits for templates, roles and interface lists (refused, never truncated); soft remote-access warnings.
- Built-in SKU presets for IE3100, IE3200/3300, IE3400 with expansion modules (Gi2/x) and IE9300; custom presets saved with the project.
- Team security hints editable in Manage and shown on Build (advisory only).
- Visual refresh with a green-teal accent; reduced-motion support.

## v0.3.0 – v0.4.9

- `{{VLANS}}` generates Layer-2 `vlan` statements; Trunk role is `switchport mode trunk` only; Access role adds portfast and bpduguard; management SVI examples on VLAN 100.
- Bulk VLAN assignment; per-port IP/mask for Routed ports; address-collision checks.
- Delete recipe, Discard unapplied draft, Copy preview, Clear browser autosave, New switch.
- Browser autosave of the applied workspace plus an optional unapplied draft (never firmware); project format version 3.
- Export SD-card ZIP is the single card-export path; the Manage tab is hidden by default; optional security-hints panel.

## v0.1 – v0.2

- Initial offline single-file builder: recipes, baseline folder, project and team package files, CRC-checked ZIP, CSP `connect-src 'none'`.
- Onboarding tip, Routed port role, first SKU presets, post-export card checklist.
