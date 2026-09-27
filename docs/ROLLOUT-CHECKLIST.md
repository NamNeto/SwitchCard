# Rollout checklist

A procedure for taking a SwitchCard recipe from first test to production. A mistake in `editcontent.txt` can remove remote access to a switch once it is applied, so every new recipe is proven on a spare switch before it is used on production equipment.

SwitchCard does not validate switch behavior. The assumptions it makes about the EEM workflow, and the spare-switch checklist C1–C9, are in [EEM-CONTRACT.md](EEM-CONTRACT.md).

## 1. Preparation

- Use one released copy of `SwitchCard.html`, and confirm the version in the page header. Different copies opened from the same browser profile can share one autosave, so keep a single tab open.
- Have a spare switch of the target model, a console cable and an out-of-band management path available.
- Use placeholder values (`EXAMPLE-*`, `192.0.2.0/24`) in samples and shared material. Real hostnames, addresses and credentials belong only in private project files (see [SECURITY.md](../SECURITY.md)).

## 2. Create a recipe

1. **Duplicate** an example recipe. The copy keeps the *Example recipe* flag, which blocks card export.
2. Give it a descriptive name that contains no secrets.
3. In **Manage recipes & baseline**:
   - Paste the tested configuration into the template and replace per-device values with placeholders (`{{HOSTNAME}}`, `{{MGMT_IP}}`, …).
   - Place management and remote-access commands first (see §7).
   - Set the interface list from a SKU preset or from `show ip interface brief` on the target model. On IE3400 with an expansion module, the module ports are `GigabitEthernet2/x`.
4. Click **Apply recipe changes**. Export stays blocked while the editor has unapplied changes.
5. For the spare test only, clear the *Example recipe* flag and apply again. This allows a test card; it is not a production approval.
6. **Save project** to private storage.

When the interface list changes, SwitchCard keeps port roles by interface name and asks before dropping assignments whose interface no longer exists. Review the port table afterwards.

When a project is opened, any automatic cleanup is listed as migration notes. Review them; an unexpected template change should be compared against the last known-good project file.

The **Advanced output options** (provenance comments and `default interface`) are off by default. Enable them only after checklist items C3 and C4 in [EEM-CONTRACT.md](EEM-CONTRACT.md) pass. `default interface` resets every port, including the uplink used for management.

## 3. Recipe size and baseline

- Keep one recipe per switch role or model rather than one very large project.
- Keep role templates short and put per-device values in placeholders.
- App limits: template 500,000 characters, each role 100,000, 128 interfaces/ports. Oversized input is refused, never truncated. Output above about 100,000 characters shows a warning.
- The baseline folder holds the firmware and other files the EEM workflow expects on the card. SwitchCard adds the generated `editcontent.txt` at the root when it exports.
- After export, open the ZIP and check the folder layout, the firmware files and a single root `editcontent.txt`.

## 4. Spare-switch test (required)

1. Fill the device fields with test values (for example `EXAMPLE-SPARE1`, `192.0.2.0/24`).
2. Select the baseline that matches the spare's model and image.
3. Resolve every error shown with the preview; read every warning.
4. Tick the review box and export. In the confirmation, check the bound values, the line and byte counts and whether the advanced options are on. Note the SHA-256 of `editcontent.txt`.
5. Prepare the card as your EEM workflow requires and apply it to the **spare** with the console connected.
6. Complete §5, §6 and the relevant items of checklist C1–C9 before any production use.

## 5. Check that the card matches the preview

1. Extract `editcontent.txt` from the ZIP.
2. Compute its hash, for example `certutil -hashfile editcontent.txt SHA256` or `Get-FileHash editcontent.txt -Algorithm SHA256` in PowerShell. It must match the SHA-256 in the export confirmation, and the byte count must match the preview.
3. If the provenance footer is enabled, its `sha256=` value covers every byte before the `! SWITCHCARD-END` line.
4. Spot-check `hostname`, the management SVI address, the default gateway or route, the uplink interface names and the AAA / VTY / SSH lines.
5. If anything differs, discard the card and fix the recipe; do not correct it on the switch.

## 6. Check management reachability

On the spare, after the configuration is applied:

1. `show ip interface brief`: the SVI and uplinks are up and the interface names match the recipe.
2. `show vlan brief` and `show running-config | include default-gateway|ip route 0.0.0.0`: the VLANs and the default gateway or route are as intended.
3. From a test host on the management network: ping the SVI, then connect with SSH or HTTPS as designed.
4. Move to production only when management works end to end. In production, use the same recipe with values from your authoritative source, and repeat §5 for every card.

## 7. Template ordering (example)

Order the template so that management access is configured before port changes. Illustrative skeleton with placeholder values:

```text
hostname {{HOSTNAME}}
!
! --- identity, AAA and remote access first (use your organization's standard) ---
! aaa new-model / TACACS+ or local authentication
! username ... (local fallback)
! enable secret ...
! ip domain-name EXAMPLE.invalid
! crypto key generate rsa ... (if required by your image)
!
line vty 0 4
 transport input ssh
 login local
!
! --- Layer-2 VLANs and the management interface (SVI or Loopback, per recipe) ---
{{VLANS}}
interface {{MGMT_INTERFACE}}
 description MANAGEMENT
 ip address {{MGMT_IP}} {{MGMT_MASK}}
 no shutdown
!
ip default-gateway {{GATEWAY}}
!
! --- management-plane sources follow the management interface ---
{{MGMT_SOURCES}}
!
! --- uplinks and access ports last ---
{{PORTS}}
```

Defaults to be aware of:

- `{{MGMT_INTERFACE}}` is `Vlan<MGMT_VLAN>` unless the recipe is set to **Loopback** in the recipe editor, when it becomes `Loopback<MGMT_LOOPBACK>`. A loopback design also needs `ip routing`, a Routed uplink or SVI towards the gateway, and `ip route 0.0.0.0 0.0.0.0 {{GATEWAY}}` instead of `ip default-gateway`; SwitchCard adds review notes when those are missing.
- `{{MGMT_SOURCES}}` emits the recipe's management source commands (by default NTP, RADIUS, logging and SSH sources on `{{MGMT_INTERFACE}}`), so a management VLAN or loopback change moves them together.
- `{{VLANS}}` creates `vlan N` statements for the management VLAN (when the template binds it), Access VLANs and any Trunk VLAN lists.
- The Access role adds `spanning-tree portfast` and `spanning-tree bpduguard enable`.
- The Trunk role is `switchport mode trunk` only, so trunks carry all VLANs unless you add `switchport trunk allowed vlan {{VLAN}}` to the role template (SwitchCard then requires a VLAN list on every trunk port).

## 8. Rollback plan

Prepare and test this on the spare before the first production change. The commands are standard IOS XE features, but availability and syntax vary by image; record the working variant in your runbook.

1. **Keep the previous state:** the previous SD card and a copy of the known-good configuration (for example `copy startup-config flash:known-good.cfg`, or your configuration archive).
2. **Keep the console connected** through the first reload and until §6 passes.
3. **Use a timed safety net for manual changes:**
   - with `archive` configured, `configure terminal revert timer 10`, then `configure confirm` once management is verified; or
   - `reload in 10` before the change and `reload cancel` after SSH and ping are verified.
   - Save the configuration (`write memory`) only after management reachability is verified.
4. **If the configuration fails to apply or management is lost:** recover from the console with `configure replace flash:known-good.cfg` (where supported), or restore the known-good startup-config and reload, or reinstall the previous card, or follow the image's recovery procedure.
5. Keep the failed ZIP and note its SHA-256, byte count and recipe name for troubleshooting.
6. Export a new card only after fixing the recipe and repeating §4–§6 on the spare.

## 9. Verification commands after each installation

```text
show version
show inventory
show ip interface brief
show vlan brief
show running-config | include hostname|default-gateway|ip route 0.0.0.0
show running-config interface Vlan100
show running-config | include source-interface|ntp source
show interfaces status
show etherchannel summary
show users
```

Adjust the VLAN and EtherChannel checks to the recipe; for a loopback-managed switch check `interface Loopback0` (or your number) and `show ip route` instead of the SVI.

## 10. Routine use

1. After a successful spare test, keep that project file as the known-good version.
2. For each switch, change only the per-device values (hostname, addresses, port roles). Keep template changes separate from a rollout.
3. For every card: apply any recipe edits → review the preview → read the confirmation → export → check the hash (§5) → install → run §9.
4. When finished, save the project to private storage, clear the browser autosave on shared PCs, and secure unused cards.

## 11. When to stop

Stop using SwitchCard-generated cards and return to your previous process if any of these occur:

- Opening a project changes template text without a migration note.
- Port roles disappear after an interface-list change without a confirmation.
- The values in the export confirmation differ from the preview.
- The extracted `editcontent.txt` differs from the preview (hash or byte count).
- The switch applies something other than the preview shows.
- The spare loses its management path after the card is applied.
