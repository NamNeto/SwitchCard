# EEM contract — what SwitchCard assumes about your SD-card / EEM flow

**Applies to:** SwitchCard v0.7.0. **Status:** assumptions, **not device-tested**. EXAMPLE values only.

SwitchCard never talks to a switch. It writes one text file, root `editcontent.txt`, into a ZIP next to your baseline files. Something on the switch (your EEM applet / script / boot process, not SwitchCard) reads that file and applies it. This page lists what SwitchCard assumes about that "something", so you can check the assumptions against **your** image on a **spare** switch before production use.

## 1. Assumptions SwitchCard makes

| # | Assumption | Why it matters | How SwitchCard behaves |
|---|------------|----------------|------------------------|
| A1 | The file is applied **line by line as IOS-XE configuration commands** (as if typed in `configure terminal`). | Everything else follows from this. | Emits plain CLI; no scripting. |
| A2 | Lines end in **CRLF**; the file ends with exactly one CRLF. | Some parsers mishandle a missing final newline or a bare CR. | Normalizes every LF/CRLF to CRLF and trims trailing whitespace. |
| A3 | A **bare CR** (U+000D not followed by LF) could act as a line break on the switch but look like one line in the browser. Controls and invisible characters can also hide differences. | Preview ≠ what the switch applies. | **Blocked at export:** the whole generated file, including comments, must be printable ASCII 0x20–0x7E plus CRLF, with line and code-point column in errors. Tabs become ASCII spaces. On project/package/autosave open, single-line fields are sanitized with migration notes; IP/mask/VLAN fields are also trimmed. Templates/roles retain the narrow H-1 refusal for bare CR and listed controls; other non-ASCII is preserved for editing and blocks export. Apply uses the same template/role refusal and displays cleaned names/firmware labels. Saved port VLAN C0 controls still refuse the file under the v0.5.9 structural rule. |
| A4 | Lines starting with `!` are **comments** and are ignored by the parser. | Needed for the optional provenance header/footer. | Default templates already use `!` separators. The optional header/footer lines all start with `!`. |
| A5 | The file is applied to the **running** configuration; saving (`write memory`) is a separate, deliberate step. | Rollback strategy ([ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md) §8). | SwitchCard emits no `write memory` / `copy run start`. Add it to your template only if your process requires it. |
| A6 | Applying `description` with no text may be rejected or behave differently by image. | Would show a parser error or a wrong description. | Since v0.5.10 an empty description **omits** the `description` line entirely (default role templates unchanged). |
| A7 | An interface stanza **merges** into whatever the port already has (e.g. a factory `switchport` default or leftovers). | Re-applying a card to a used switch may leave old settings. | Default behavior unchanged (merge). Optional `default interface <name>` per recipe, **off by default**. |
| A8 | The EEM flow does not require a marker line or a specific first line. | The optional provenance header adds lines at the top and bottom. | Header/footer are **opt-in** and off by default. |
| A9 | VLANs 1002–1005 are reserved defaults on IOS-XE and cannot be created or used as access VLANs. | `vlan 1002` would error. | Access / management VLAN 1002–1005 is an error; reserved IDs in trunk lists are left out of `{{VLANS}}` with a warning. |
| A10 | IE platforms support a limited number of VLANs. | A `1-4094` trunk list used to create 4094 `vlan` lines. | Warning above 64 generated `vlan` lines; above 256 export is **refused** (never silently truncated). |
| A11 | The EEM flow applies a card's `editcontent.txt` **at most once per switch** (apply-once) — e.g. it renames or deletes the file after a successful apply, or records that it ran. A stale card left in the slot, or re-inserted later, must not re-apply an old config over later changes. | Re-applying an old card after a hostname/IP change, or on the wrong switch, would silently revert the switch to the card's config. | **SwitchCard cannot enforce this.** It only writes the file; the apply-once behavior belongs to your EEM applet. Label cards per switch and remove them after use (ROLLOUT-CHECKLIST.md). Verify with C9. |

## 2. Optional output features (opt-in per recipe, default OFF)

Manage recipes & baseline → *Advanced output options*.

### 2a. Provenance header / end marker

```text
! SWITCHCARD v0.7.0 host=EXAMPLE-SW1 recipe=EXAMPLE-LAB-ACCESS
... generated configuration ...
! SWITCHCARD-END lines=123 sha256=<64 hex chars>
```

- Every added line starts with `!` (comment, per A4).
- `sha256` = SHA-256 of all bytes **before** the `! SWITCHCARD-END` line (UTF-8, CRLF line ends). `lines` = number of lines before the END line. A truncated or edited file no longer matches.
- **No timestamp inside the file**, so the preview is byte-identical to the ZIP and re-exports of the same input are identical. The export time is recorded in the ZIP entry timestamps and in the export confirm/status.
- Host and recipe name are reduced to printable ASCII (middle dot, en dash and em dash map to `-`; `?` replaces other non-ASCII). Template comment lines must themselves be ASCII; they are not silently rewritten.
- The export confirm always shows the SHA-256 of the whole `editcontent.txt`, header on or off.

**Why opt-in:** if your EEM applet counts lines, matches a first line, or does not treat `!` as a comment, the header could break the flow. Test first (checklist C3).

### 2b. `default interface <name>`

Adds `default interface GigabitEthernet1/1` (etc.) before each port's role commands, so every port starts from factory defaults (idempotent re-apply).

**Why opt-in:** `default interface` wipes the port, **including the uplink you manage the switch through**, and some images briefly bounce the link. It has not been tested on IE3100 / IE3x00 / IE9300 with the EEM flow. An explicit `switchport` in the default Access/Trunk role templates was considered and **deferred** (changing default templates would change output for every existing recipe; do it in your own template if your image needs it).

## 3. Spare-switch test checklist (do before enabling anything new in production)

Use a spare switch, console cable connected, lab-only addresses (e.g. 192.0.2.0/24). Record the image version and result for each item in your runbook.

- [ ] **C1 — Bare CR really is blocked in the UI.** Open a test project whose template contains a bare CR (create it with a text editor that keeps CR). SwitchCard must refuse it with `bare CR (U+000D) at line N, column M`. *Optional device check (lab only):* write an `editcontent.txt` by hand containing `description A<CR>shutdown` on an unused port and see whether the switch runs `shutdown` — this tells you how your parser treats bare CR.
- [ ] **C2 — Empty description.** Leave a port description empty and export. Confirm the stanza has no `description` line and applies cleanly (`show running-config interface …`).
- [ ] **C3 — Header / footer comments.** Enable the provenance option, export, apply. Confirm the flow still applies the whole file, the `!` lines are ignored, and `show running-config` has no trace of them. Verify the footer hash on a PC: remove the last line and run `certutil -hashfile` / `Get-FileHash` on the remainder (or use the SHA-256 shown in the confirm for the whole file).
- [ ] **C4 — `default interface`.** Enable it with the uplink as a Trunk port. Apply with console connected. Confirm the uplink comes back up, management answers, and the ports have exactly the role config (`show running-config interface …`). Note any link flap duration.
- [ ] **C5 — CRLF / final newline.** Confirm the last command in the file is applied (A2).
- [ ] **C6 — Reserved and large VLAN lists.** Confirm `show vlan brief` matches the `{{VLANS}}` block and no errors appear for 1002–1005.
- [ ] **C7 — Management path.** With the management VLAN on an Access port or a Trunk (see the soft warning), confirm SVI up, ping, SSH, default gateway ([ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md) §6).
- [ ] **C8 — Preview ≡ card.** SHA-256 of the extracted `editcontent.txt` equals the export-confirm SHA-256.
- [ ] **C9 — Apply once (A11).** After a successful apply, change one harmless setting by hand (e.g. an unused port description), then re-insert the same card and reboot / re-trigger the EEM flow. Confirm nothing re-applies (the manual change survives, the file was renamed/removed or marked). If it does re-apply, fix the EEM applet before production use and never leave cards in switches.

Only after C1–C9 pass on your image should the advanced options be enabled for production recipes. Record the result next to the recipe (for example in its name or in your runbook).
