# User guide

## You need

1. A **known-working sync-export folder**: the files that belong at the SD-card root for your EEM workflow. Typically that is what `sync sdflash:` writes from an empty switch that already holds the SyncConfig applet; see [../examples/eem-applet-example.md](../examples/eem-applet-example.md).
2. A **tested running configuration** to turn into a recipe template.
3. `SwitchCard.html`, opened in **Edge** or **Chrome**.

## Build your first card

1. Keep the SwitchCard release in its own folder, separate from older versions.
2. Open **SwitchCard.html**. Read the quick-start tip at the top and dismiss it when ready.
3. Click **Manage recipes & baseline**. Choose the model family (IE3100, IE3x00 or IE9300; IE9300 uses Catalyst-style `GigabitEthernet1/0/x`). Type a baseline label your team understands.
4. Click **Select sync export folder** and pick the folder whose **contents** belong at the card root. Check the file list.
5. Duplicate an example recipe and paste your tested configuration into the template:
   - Keep one management interface stanza: `interface {{MGMT_INTERFACE}}` with `ip address {{MGMT_IP}} {{MGMT_MASK}}`. The **Management interface** setting in the recipe editor decides whether that is `Vlan<MGMT_VLAN>` (SVI, the default) or `Loopback<MGMT_LOOPBACK>`; see [Management interface: SVI or Loopback](#management-interface-svi-or-loopback).
   - Put `{{HOSTNAME}}`, `{{MGMT_IP}}`, `{{MGMT_MASK}}`, `{{GATEWAY}}`, `{{SITE}}` where values change. `{{MGMT_INTERFACE}}` implies `{{MGMT_VLAN}}` or `{{MGMT_LOOPBACK}}` as a field (both can also be used directly). Any `{{UPPER_SNAKE}}` name adds a field.
   - Put `{{MGMT_SOURCES}}` where the NTP / RADIUS / logging / SSH source-interface lines belong; they follow the management interface automatically.
   - Put `{{VLANS}}` where Layer-2 `vlan` statements belong and `{{PORTS}}` where interface blocks belong.
   - The default Trunk role is `switchport mode trunk` only; the Access role adds portfast and bpduguard. Edit the role templates if your standard differs.
   - Set the interface names, or pick a SKU preset and confirm it with `show ip interface brief`.
6. For a spare-switch test, review a lab-only copy, deliberately uncheck **Example recipe**, and click **Apply recipe changes**. Replace the example header line `! EXAMPLE ONLY - replace with your tested configuration` in the template with your own header first, or export stays blocked. This allows a lab card; it does not approve production use. Complete the spare checklist ([EEM-CONTRACT.md](EEM-CONTRACT.md)) first.
7. Click **Build a card** in the rail on the left. Fill the device details and port roles (Access / Trunk / Unused / Routed).
   - To set one VLAN on several ports: tick them (or **Select all**) and click **Apply VLAN to checked**.
   - To set one role on several ports: tick them, pick the role in the bulk bar and click **Set role on checked**. The ports stay ticked, so you can apply a VLAN to the same selection next.
   - To describe every port at once, open **Port CSV** under the bulk bar. **Copy table to CSV** writes the table (INTERFACE, ROLE, VLAN, DESCRIPTION, plus IP and MASK when a port is Routed); edit it here or in a spreadsheet and click **Apply to ports**. Short names such as `Gi1/3` work, an empty cell keeps the current value, and nothing changes unless every row is valid. A description only reaches the card when the port's role template has a `description {{DESCRIPTION}}` line; the default Unused role does not, and the preview notes any description that would be dropped.
   - IP/Mask columns appear only for Routed ports; each routed port has its own address.
8. Review the preview and click **Export SD-card ZIP**. The export dialog shows every bound value and the SHA-256 of `editcontent.txt`; tick **I reviewed this configuration and the baseline selection.** and click **Download ZIP**. The tick lives in the dialog, so every export is reviewed on its own.
9. Prepare the card: **wipe or use a fresh card** → extract the ZIP **contents** to the card **root** → confirm `editcontent.txt` sits beside the baseline files. Do not leave the ZIP on the card and do not extract into a nested folder.

## Next switch with the same recipe

Click **New switch** on *Build a card*. Only **MGMT_MASK, MGMT_VLAN, MGMT_LOOPBACK, GATEWAY and SITE** are kept, together with port roles, VLANs and descriptions. **Every other value is cleared**, including HOSTNAME, MGMT_IP, custom values such as LOOPBACK_IP, NTP_SERVER or DOMAIN, and routed-port IP/mask. The status line lists what was cleared and kept. Review kept values before each export. For several switches of the same recipe, use [Switches and Cards](#many-switches-switches-and-cards) instead.

## Management interface: SVI or Loopback

Every recipe has a **Management interface** setting in the recipe editor (Manage recipes & baseline). It decides what the placeholder `{{MGMT_INTERFACE}}` produces:

| Setting | `{{MGMT_INTERFACE}}` becomes | Build field | Typical design |
|---------|------------------------------|-------------|----------------|
| **SVI** (default) | `Vlan<MGMT_VLAN>` | Management VLAN | Layer-2 access switch: one management VLAN, `ip default-gateway` |
| **Loopback** | `Loopback<MGMT_LOOPBACK>` | Management loopback number | Switch that routes: a Routed uplink (or SVI) carries the transit subnet, the loopback holds the stable management address |

Write `interface {{MGMT_INTERFACE}}` once in the template with `ip address {{MGMT_IP}} {{MGMT_MASK}}`, and use the same placeholder wherever a source interface is needed. Recipes from older SwitchCard versions have no setting and behave as SVI recipes; a template that still says `interface Vlan{{MGMT_VLAN}}` keeps working unchanged.

`{{MGMT_SOURCES}}` expands to the recipe's **management source commands**, edited under *Edit management source commands* in the recipe editor. The default block is:

```text
ntp source {{MGMT_INTERFACE}}
ip radius source-interface {{MGMT_INTERFACE}}
logging source-interface {{MGMT_INTERFACE}}
ip ssh source-interface {{MGMT_INTERFACE}}
```

Change the management VLAN on Build, or switch the recipe to Loopback, and every one of these lines moves with it. Add `ip tacacs source-interface {{MGMT_INTERFACE}}`, `snmp-server trap-source {{MGMT_INTERFACE}}` or similar lines if your standard uses them, and remove lines you do not want. Any other `{{UPPER_SNAKE}}` placeholder in the block becomes a Build field, exactly like one in the template.

In **Loopback** mode the checks change: a /32 mask is expected (any other mask gets a note) and the gateway is expected outside the loopback subnet. Review notes appear when the generated text has no `ip routing`, still uses `ip default-gateway` (ignored once routing is on; use `ip route 0.0.0.0 0.0.0.0 {{GATEWAY}}`), or when the gateway sits in no Routed port subnet. The fourth built-in example, *IE3x00 - Example loopback management (routed uplink)*, shows a complete pattern with documentation addresses.

## Team policy rules

Team security hints are advisory. **Team policy rules** (Manage recipes & baseline → Team security hints → *Team policy rules*) are the enforced version: one rule per line, `require <pattern>` or `forbid <pattern>`, optionally followed by two spaces, `#` and a note. Patterns are case-insensitive regular expressions, matched line by line against the generated text with `!` comments and `no …` lines removed.

- A `require` rule that finds no match, a `forbid` rule that finds one, or a rule that cannot be parsed **blocks** Export SD-card ZIP, Save text only and every export in Cards. Copy preview still works so the text can be inspected.
- Rules apply to every recipe in the project and to every switch in the Switches list; a switch that fails a rule counts as a switch with errors. They are saved with the project, the team package and the browser autosave.
- Examples: `require transport input ssh  # VTY`, `forbid snmp-server community`, `require ^ip ssh version 2`.
- Each line is trimmed, so a pattern cannot start or end with a literal space; write `\s` or `\b` instead.
- Rules apply as you type, like team hints: deleting a line lifts that rule at once. **Tidy rules** rewrites the box without blank lines and extra spaces and says which rules cannot be evaluated.

## Many switches: Switches and Cards

Build many cards from one recipe. The rail on the left holds **Build a card**, **Switches**, **Cards** and **Manage recipes & baseline**; each shows a small status, for example the number of switches and how many have errors, or how many cards are up to date. The recipe chosen in one view is the one the others show. While the recipe editor has an unapplied draft, the other views stay locked until you Apply or Discard it; the Manage chip then reads *draft not applied*, and **Save project** is offered beside Apply and Discard (it saves the applied recipes, without the draft).

### Switches

**Switches** keeps a list of switches inside the recipe, saved with the project and the browser autosave (up to 500 per recipe). Every switch starts from the Device details and port table on *Build a card*: an empty cell inherits that value, shown as a grey placeholder, and the grey **Defaults** row at the top shows the current values. Type in a cell to give that switch its own value; arrow keys and Enter move between rows. The columns follow the recipe's template: a placeholder added to the template adds a column, a removed one hides its column, and stored values are kept.

- **Add switches.** Enter a number and click **Add, numbered from last**. On an empty list the first row is the switch on *Build a card*; every further row counts the number at the end of the hostname and the management IP up by one from the last row: `EDGE-01`, `EDGE-02`, ... and `192.0.2.10`, `192.0.2.11`, .... Leading zeros keep their width and `-09` becomes `-10`. Only those two values are written, so everything else keeps following Device details (fix a gateway there and every switch follows). It refuses, with the reason, when the hostname does not end in a number or when the addresses would run past the last usable address of the management subnet; in Loopback mode each switch has its own /32, so that limit does not apply.
- **CSV → Import** opens a dialog: paste CSV text, **Load file**, or **Start from template** to fill the box with the recipe's CSV template. A live summary shows the rows found, the columns used, ignored columns and port columns, and warns when cells could not be read as UTF-8 (typically a file saved as ANSI from a spreadsheet; save it as UTF-8 CSV). The summary also says which rows take a value from Device details (an empty cell in a used column). **Add to the list** appends the rows, **Replace the list** replaces the list. The header row holds placeholder names; comma, semicolon or tab delimiters, quoted cells and a byte-order mark are accepted. A column you leave out, or an empty cell, takes the value from Device details, so site-wide values such as `MGMT_MASK` and `GATEWAY` need no column.
- **CSV → Export** downloads the list as stored (empty cells stay empty), with port columns only for settings some switch has. Importing that file reproduces the list. A cell that starts with =, +, - or @ is kept as it is, and the status line names it, because a spreadsheet such as Excel may run it as a formula.
- **CSV → Download template** downloads the exact header the recipe needs, with row 1 filled with the switch on *Build a card*; the picker beside it chooses the port columns (*Template: fields + port descriptions*, *Template: fields + all port settings*, or *Template: switch fields only*). Export and **Remove all** are enabled once the list has switches.
- **Remove all** empties the list after a dialog.
- Pasting several lines or spreadsheet cells into one cell is refused with a note; use **CSV → Import** to fill many switches.

**Per-switch ports.** Port roles, VLANs and descriptions come from the port table on *Build a card* and are shared by every switch. The **Ports** column says **Port table** when a switch follows the shared table, or counts the ports it overrides (*1 override*), and opens its **Ports** dialog: one line per port with Interface, Role, VLAN, Description, IP and Mask. Grey values come from the port table; typing sets the value for this switch only, and **Use table** clears that switch's settings for the port. In a CSV, a column named after an interface and one of `description`, `role`, `vlan`, `ip` or `mask`, for example `Gi1/3 description` or `GigabitEthernet1/1 ip`, does the same. A column naming an interface the recipe does not have, or an unknown role, is an error. When *Apply recipe changes* removes interfaces from the recipe, a dialog lists the per-switch settings on those ports, and only those are dropped.

**Checks.** Every switch is checked exactly like a single card (every input check and the team policies), plus duplicate hostnames and management addresses across the list: both switches of a duplicate are errors, each naming the other row. The **Status** column shows `OK`, `OK · 2 notes` or `3 errors`. **Copy below** adds an exact copy under a row (flagged as a duplicate until you change it) and **Remove** removes a row after a dialog that names it; both sit in the side panel for the selected switch, and in the row's own **⋯** menu at its end (shown on the selected or hovered row; from any cell, Shift+F10 or the Menu key opens it), so the keyboard reaches a row's actions from the row itself. Selecting a row fills the side panel with its checks, its `editcontent.txt` and, when it was exported before, *Changes since the last export*.

### Cards

**Cards** lists the switches of the recipe with hostname, management IP, status and **Last export**:

- **not exported**: no export is remembered for this hostname;
- **up to date** with the date: the text matches the last export;
- **changed** with the date beside it: click the pill for a dialog with the line diff (or, when the old text is no longer stored, the two SHA-256 values);
- **not tracked**: the recipe does not use `HOSTNAME`, so exports are not remembered.

Click a status to open that switch in Switches. The gate line above the table names what blocks export, with the same gates as a single card (unapplied draft, example recipe, matching baseline) plus the rows with errors or team-policy failures, each with what is wrong, for example *Rows with errors: 2, 3 (duplicate MGMT_IP 10.20.30.13) · 5 (template still contains the example header)*. The first three problems are named, then *and N more rows*; within one problem, more than six rows are listed as the first five and *+N more* (for example *10, 11, 13, 14, 16 +2 more*). When a bulk export is refused for these rows, the status line adds where the fix is: in Switches for a row's own values, or in Manage recipes & baseline when the template still contains the example header.

- **Card ZIP** exports one switch.
- **All card ZIPs** writes one SD-card ZIP per switch, then a manifest with every file name and hash. Browsers ask once whether to allow multiple downloads; if some were blocked, allow them and export again. While it runs, the Cards view shows *Card 8 of 24: file name* and **Cancel after this card**; the cards already written stay recorded as exported, the manifest lists just those, and **Changed and not exported** writes the rest. The other views stay closed until the run ends (a click on the rail says so), so the progress and Cancel stay in sight and the cards keep their pace between downloads.
- **Changed and not exported (n)** exports only the switches that were never exported or changed since; it is disabled when every card is up to date.
- **Text-only ZIP** writes one ZIP with `HOSTNAME/editcontent.txt` per switch plus the manifest, for workflows that add the baseline separately. It writes no baseline files, so it needs no baseline (like Save text only on Build); the other gates (unapplied draft, example recipe, rows with errors, team policy) still apply, and its review dialog shows the *Baseline fingerprint* line (`(none)` when no folder is loaded). The card ZIPs still need the baseline; while that alone blocks them, the gate line says the text-only ZIP is still available.

Bulk exports are all-or-nothing: a switch with errors stops them before any dialog opens, and the status line names it. Every export opens the export dialog with the review tick (see [Build your first card](#build-your-first-card)), and every exported text is remembered per hostname for the comparison below.

## Changes since the last export

Each export (single card or Cards) remembers the generated text per hostname inside the recipe, bounded to 50 hostnames or 512 KB per recipe and saved with the project. The Cards states need only a hash of each export, which is kept for up to 500 hostnames per recipe, so "up to date" is right for every switch even after exporting more than 50; for a switch whose old text is no longer stored, the comparison shows the two SHA-256 values instead of the lines. When you rebuild a switch with the same hostname, a **Changes since the last export** panel under the preview (and in the Switches side panel) shows the added and removed lines with a little context, or states that the text is identical. Duplicating a recipe starts with an empty history. Entries are hash-checked on open; an altered entry is dropped with a migration note.

## Baseline fingerprints

Loading a sync-export folder hashes every file (SHA-256; only hashes are kept, never file contents). **Save project** and **Save team package** record the fingerprint. When a project that carries a record is open and a folder is loaded, the folder is compared with the record: a match is confirmed, a difference is flagged with the changed, added and missing paths, and every export repeats the verdict: Build's export gate and the Cards gate line show *Review: baseline fingerprint DIFFERS…* in amber beside *Ready to export*, and every write dialog (Export SD-card ZIP, Save text only, Card ZIP, All card ZIPs, Changed and not exported, Text-only ZIP) shows the *Baseline fingerprint* line with *DIFFERS* highlighted and a review note above the summary. It is a warning, not a block. When you open a project, the baseline loader's Model family and label are filled in from its record, so picking the recorded folder once re-attaches it; if you load it under another model or label, the status line says so (the fingerprint covers the files only). A team package whose files no longer match the fingerprint in its manifest is refused. To adopt a new baseline on purpose, load it and Save project again.

## Interface list from the switch

In the recipe editor, **Fill from show ip interface brief** takes pasted `show ip interface brief` or `show interfaces status` output and fills *Available interface names* with the physical Ethernet ports in device order. `Vlan`, `Loopback`, `Port-channel`, `Tunnel`, `AppGigabitEthernet`, subinterfaces and the out-of-band `GigabitEthernet0/0` port are skipped and listed in the status line. Click **Apply recipe changes** to keep the list. Prefer this over a SKU preset whenever you can reach the switch.

## Clickable checks

Every error and review note in the red and yellow boxes is a button. Click it to jump to what it is about: a Device details field, a cell in the port table, the template, the interface list or the management source block in the recipe editor, the line in the preview for an ASCII error, or the team policy rules in Manage. The target scrolls into view and is outlined briefly. In the Switches side panel a check goes to that switch's cell, or to its Ports dialog when the switch sets that port value itself. If the target no longer exists after a template change, the click opens the template.

## Dialogs

Every question SwitchCard asks is a dialog in the page, never a browser pop-up: restoring an autosave from another version (**Restore it** / **Start with the examples**, which keeps the autosave as a backup), dropping unmatched port assignments (**Drop and continue**, or **Drop and apply** in the recipe editor), opening a file over unsaved work (**Open and replace**), **Save without the draft**, replacing the port CSV text, and the delete and clear actions, which use red buttons. Esc or **Cancel** always means no change. A switch's **Ports** dialog applies each edit as you type (the grid and the preview follow); **Done** keeps them (and writes the browser autosave at once), Esc or **Cancel** puts that switch's port settings back as they were when the dialog opened, and **Use table** undoes one port's settings. Browser autosave pauses while the dialog is open, so a reload or a crash with the dialog still open counts as Cancel. An ordinary edit made just before you reload or close the page is autosaved on the way out. While a dialog is open the rest of the page is veiled and hidden from screen readers: Tab stays inside the dialog, a click or key on anything behind it does nothing, and in the Switches view the links *Skip the switch list* and *Back to the switch toolbar* (shown when they receive focus) let the keyboard pass the grid without visiting every cell. The browser's own "leave this page?" prompt on unsaved work still appears, because a page cannot replace it.

## Theme

The header offers **Auto**, **Dark** and **Light**. Auto follows the operating system. The choice is stored in this browser only and is removed by Clear browser autosave.

## Plain ASCII only

The whole `editcontent.txt`, comments included, must be plain printable ASCII. A project with an em dash in a `!` comment, or a SITE such as `München`, opens fine but **export is blocked** until it is edited: ü→ue, ö→oe, ä→ae, ß→ss, — or – → `-`. The error names the line and column.

When such a character blocks export, a **Transliterate to ASCII** button appears under the Export button. It converts values and port descriptions immediately (umlauts to ue/oe/ae/ss, accents removed, dashes and curly quotes replaced, invisible characters removed) and, when the template, a role template or the source block needs it, loads the converted text into the recipe editor as an unapplied draft for you to review and Apply. Characters it cannot translate stay and remain reported.

## Saving work

- **Save project**: recipes and values (no firmware): schema v5 with recipes, values, each recipe's switch list, team hints and policy rules, the baseline fingerprint and each recipe's export history. v0.7.3 opens these files and keeps the switch list. Use this to move work between machines, folders or SwitchCard versions.
- **Save team package**: recipes plus one baseline, for private sharing next to `SwitchCard.html`.
- **Browser autosave**: convenience only. One autosave per browser profile is shared by every SwitchCard tab (key `switchcard-autosave-v21`); use one tab and **Save project** to keep separate workspaces. Firmware is never autosaved. An autosave from a different SwitchCard version is validated and offered in a dialog; autosave stays paused until you answer.

### Autosave backups

**Save your work → Browser autosave** offers **Restore autosave backup** and **Download autosave backup** with a selector for up to three backups (newest first; a new backup replaces the oldest).

- **Restore** swaps the selected backup with the current workspace and any unapplied draft; the other backups are kept. If that swap cannot be written, nothing changes.
- If the stored autosave differed from what was on screen, the newest backup download also contains those earlier bytes as `preservedAutosaveRaw` (copy that JSON string into its own file to open it).
- **Open project** accepts downloaded autosave and backup files and puts any unapplied draft back into the recipe editor. Apply or Discard it before export.
- If a saved draft no longer matches any recipe, the recipes still open and the draft is kept untouched as `parkedDraft` in the autosave; the status line says so. Re-type it if needed.

## Maintain helpers

- **Delete recipe**: next to Duplicate; asks first and names how many switches go with the recipe. The last recipe cannot be deleted.
- **Discard unapplied draft**: reloads the editor from the last applied recipe and clears the draft from autosave.
- **Copy preview**: copies the generated text when checks pass. Some `file://` setups block the clipboard; use **Save text only** instead. Save text only is blocked for an *Example recipe* (its text is fictional), like the SD-card export; Copy preview still works.
- **Save text only**: writes `editcontent.txt` alone (no baseline files, so no baseline is needed). It opens the same review dialog as Export SD-card ZIP, titled *Save text only?*: the bound values, the SHA-256, the *Baseline fingerprint* line (with *DIFFERS* when the loaded folder differs from the project's record) and the review tick before *Download text*. Cancel or Esc writes nothing.
- **Clear browser autosave**: removes all SwitchCard data in this browser storage area after a dialog (see [SECURITY.md](../SECURITY.md)). In-memory work stays until reload.
- **Advanced output options** (per recipe, off by default): optional `!` header/footer comments with a SHA-256, and `default interface` before each port. Not device-tested; see [EEM-CONTRACT.md](EEM-CONTRACT.md) before enabling.

## If something looks wrong

Do not install an untested card in a production switch. SwitchCard checks basic fields only, not Cisco behavior; see [ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md) for the full procedure.
