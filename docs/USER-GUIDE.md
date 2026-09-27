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
6. For a spare-switch test, review a lab-only copy, deliberately uncheck **Example recipe**, and click **Apply recipe changes**. This allows a lab card; it does not approve production use. Complete the spare checklist ([EEM-CONTRACT.md](EEM-CONTRACT.md)) first.
7. Click **Back to card builder**. Fill the device details and port roles (Access / Trunk / Unused / Routed).
   - To set one VLAN on several ports: tick them (or **Select all**) and click **Apply VLAN to checked**.
   - IP/Mask columns appear only for Routed ports; each routed port has its own address.
8. Review the preview, tick the review box and click **Export SD-card ZIP**. The confirm shows every bound value and the SHA-256 of `editcontent.txt`.
9. Prepare the card: **wipe or use a fresh card** → extract the ZIP **contents** to the card **root** → confirm `editcontent.txt` sits beside the baseline files. Do not leave the ZIP on the card and do not extract into a nested folder.

## Next switch with the same recipe

Click **New switch** on Build. Only **MGMT_MASK, MGMT_VLAN, MGMT_LOOPBACK, GATEWAY and SITE** are kept, together with port roles, VLANs and descriptions. **Every other value is cleared**, including HOSTNAME, MGMT_IP, custom values such as LOOPBACK_IP, NTP_SERVER or DOMAIN, and routed-port IP/mask. The status line lists what was cleared and kept. Review kept values before each export.

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

- A `require` rule that finds no match, a `forbid` rule that finds one, or a rule that cannot be parsed **blocks** Export SD-card ZIP, Save text only and fleet export. Copy preview still works so the text can be inspected.
- Rules apply to every recipe in the project and to every fleet row. They are saved with the project, the team package and the browser autosave.
- Examples: `require transport input ssh  # VTY`, `forbid snmp-server community`, `require ^ip ssh version 2`.
- Each line is trimmed, so a pattern cannot start or end with a literal space; write `\s` or `\b` instead.

## Fleet export

Build many cards from one recipe. On Build, open **Fleet export** and paste CSV text or load a `.csv` file. The header row holds placeholder names (`HOSTNAME`, `MGMT_IP`, `SITE`, any custom field). Comma, semicolon or tab delimiters and quoted cells are accepted. An empty cell inherits the value from Device details, so site-wide values such as `MGMT_MASK` and `GATEWAY` need no column. Port roles, VLANs and descriptions come from the port table and are shared by every switch.

1. **Check fleet** validates each row exactly like a single card (every input check, the team policies) plus duplicate hostnames and addresses, and shows a table with the result, line count and SHA-256 of every `editcontent.txt`.
2. Tick the review box. The fleet buttons follow the same gates as the single export: example flag, matching baseline, no unapplied draft.
3. **Export fleet cards** writes one SD-card ZIP per switch, then a manifest with every file name and hash. Browsers ask once whether to allow multiple downloads; if some were blocked, allow them and export again. **Export fleet text only** writes one ZIP with `HOSTNAME/editcontent.txt` per switch plus the manifest, for workflows that add the baseline separately.

Every exported text is remembered per hostname for the comparison below. Any change to the recipe, values, rules or CSV after a check disables the buttons until you check again.

## Changes since the last export

Each export (single or fleet) remembers the generated text per hostname inside the recipe, bounded to 50 hostnames or 512 KB per recipe and saved with the project. When you rebuild a switch with the same hostname, a **Changes since the last export** panel under the preview shows the added and removed lines with a little context, or states that the text is identical. Duplicating a recipe starts with an empty history. Entries are hash-checked on open; an altered entry is dropped with a migration note.

## Baseline fingerprints

Loading a sync-export folder hashes every file (SHA-256; only hashes are kept, never file contents). **Save project** and **Save team package** record the fingerprint. When a project that carries a record is open and a folder is loaded, the folder is compared with the record: a match is confirmed, a difference is flagged with the changed, added and missing paths, and the export confirm repeats the verdict. A team package whose files no longer match the fingerprint in its manifest is refused. To adopt a new baseline on purpose, load it and Save project again.

## Interface list from the switch

In the recipe editor, **Fill from show ip interface brief** takes pasted `show ip interface brief` or `show interfaces status` output and fills *Available interface names* with the physical Ethernet ports in device order. `Vlan`, `Loopback`, `Port-channel`, `Tunnel`, `AppGigabitEthernet`, subinterfaces and the out-of-band `GigabitEthernet0/0` port are skipped and listed in the status line. Click **Apply recipe changes** to keep the list. Prefer this over a SKU preset whenever you can reach the switch.

## Theme

The header offers **Auto**, **Dark** and **Light**. Auto follows the operating system. The choice is stored in this browser only and is removed by Clear browser autosave.

## Plain ASCII only

The whole `editcontent.txt`, comments included, must be plain printable ASCII. A project with an em dash in a `!` comment, or a SITE such as `München`, opens fine but **export is blocked** until it is edited: ü→ue, ö→oe, ä→ae, ß→ss, — or – → `-`. The error names the line and column.

When such a character blocks export, a **Transliterate to ASCII** button appears under the Export button. It converts values and port descriptions immediately (umlauts to ue/oe/ae/ss, accents removed, dashes and curly quotes replaced, invisible characters removed) and, when the template, a role template or the source block needs it, loads the converted text into the recipe editor as an unapplied draft for you to review and Apply. Characters it cannot translate stay and remain reported.

## Saving work

- **Save project**: recipes and values (no firmware): schema v5 with recipes, values, team hints and policy rules, the baseline fingerprint and each recipe's export history. Use this to move work between machines, folders or SwitchCard versions.
- **Save team package**: recipes plus one baseline, for private sharing next to `SwitchCard.html`.
- **Browser autosave**: convenience only. One autosave per browser profile is shared by every SwitchCard tab (key `switchcard-autosave-v21`); use one tab and **Save project** to keep separate workspaces. Firmware is never autosaved. An autosave from a different SwitchCard version is validated and offered with a confirmation.

### Autosave backups

**Save your work → Browser autosave** offers **Restore autosave backup** and **Download autosave backup** with a selector for up to three backups (newest first; a new backup replaces the oldest).

- **Restore** swaps the selected backup with the current workspace and any unapplied draft; the other backups are kept. If that swap cannot be written, nothing changes.
- If the stored autosave differed from what was on screen, the newest backup download also contains those earlier bytes as `preservedAutosaveRaw` (copy that JSON string into its own file to open it).
- **Open project** accepts downloaded autosave and backup files and puts any unapplied draft back into the recipe editor. Apply or Discard it before export.
- If a saved draft no longer matches any recipe, the recipes still open and the draft is kept untouched as `parkedDraft` in the autosave; the status line says so. Re-type it if needed.

## Maintain helpers

- **Delete recipe**: next to Duplicate; confirms first. The last recipe cannot be deleted.
- **Discard unapplied draft**: reloads the editor from the last applied recipe and clears the draft from autosave.
- **Copy preview**: copies the generated text when checks pass. Some `file://` setups block the clipboard; use **Save text only** instead.
- **Clear browser autosave**: removes all SwitchCard data in this browser storage area after a confirmation (see [SECURITY.md](../SECURITY.md)). In-memory work stays until reload.
- **Advanced output options** (per recipe, off by default): optional `!` header/footer comments with a SHA-256, and `default interface` before each port. Not device-tested; see [EEM-CONTRACT.md](EEM-CONTRACT.md) before enabling.

## If something looks wrong

Do not install an untested card in a production switch. SwitchCard checks basic fields only, not Cisco behavior; see [ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md) for the full procedure.
