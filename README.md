# SwitchCard

`v0.7.1` · offline · single HTML file · CSP `connect-src 'none'` · MIT · [online demo](https://namneto.github.io/SwitchCard/)

**SwitchCard** builds SD-card media for Cisco Industrial Ethernet switches (IE3100, IE3x00, IE9300) in environments that use an **on-switch EEM script** to apply a root `editcontent.txt`. Load a firmware baseline folder once, keep configuration **recipes** (templates + port roles), fill in one switch's details and export a ZIP. Extract its contents to the card root and the card is ready.

**Not affiliated with, endorsed by or supported by Cisco.** Not a Cisco product. It does not replace Cisco Swap Drive (`sync sdflash:`) or any platform feature. See [Trademarks and legal](#trademarks-and-legal).

## Contents

| File | Purpose |
|------|---------|
| `SwitchCard.html` | The whole app. Open it in Edge or Chrome; nothing to install. |
| [docs/USER-GUIDE.md](docs/USER-GUIDE.md) | Step-by-step usage: management interface, team policy rules, fleet export, diffs, fingerprints |
| [docs/ROLLOUT-CHECKLIST.md](docs/ROLLOUT-CHECKLIST.md) | Spare-switch test, card verification, reachability, rollback |
| [docs/EEM-CONTRACT.md](docs/EEM-CONTRACT.md) | What SwitchCard assumes about the EEM flow + **spare-switch checklist C1–C9** |
| [docs/SAFETY-EXPORT.md](docs/SAFETY-EXPORT.md) | Every export gate, input check and limit |
| [docs/models-and-interfaces.md](docs/models-and-interfaces.md) | IE3100 / IE3x00 / IE9300 models, interface naming and how the SKU presets were verified |
| [docs/SECURITY-HINTS.md](docs/SECURITY-HINTS.md) | Optional hardening hints (advisory) |
| [docs/TESTED.md](docs/TESTED.md) | Device test matrix (no results recorded yet) |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Source tree, build, tests, release procedure |
| [examples/eem-applet-example.md](examples/eem-applet-example.md) | The workflow's EEM applet (SyncConfig), step by step, and how the baseline card is made with `sync sdflash:` |
| [SECURITY.md](SECURITY.md) | Security model, data handling and private security reports |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to request features and report bugs |
| [examples/](examples/) | One fictional example project (SVI and Loopback recipes) |
| [tests/](tests/) | Browser tests and golden outputs (run by CI) |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| `LICENSE` | MIT |

## Quick start

To use SwitchCard you need only `SwitchCard.html` from the [latest release](https://github.com/NamNeto/SwitchCard/releases/latest). It runs in the browser and writes nothing to disk except the files you download; everything else in this repository is documentation and maintainer tooling.

1. Open `SwitchCard.html` locally in Edge or Chrome.
2. Explore an **EXAMPLE ONLY** recipe (card export is blocked for examples). Four are built in, including one switch managed through a loopback.
3. **Manage recipes & baseline** → select the sync-export folder → duplicate a recipe → paste a tested config as the template, with `{{HOSTNAME}}`, `{{MGMT_IP}}`, `{{MGMT_MASK}}`, `{{GATEWAY}}`, `{{MGMT_INTERFACE}}`, `{{MGMT_SOURCES}}`, `{{VLANS}}`, `{{PORTS}}` and so on where values change → choose **SVI** or **Loopback** as the management interface → **Apply recipe changes**.
4. **Build**: fill device details and port roles → review the preview → tick the review box → **Export SD-card ZIP**.
5. Use a wiped or fresh card and extract the ZIP **contents** to the card **root** (not the ZIP file, not a nested folder).

Before production use, run the spare-switch checklist (C1–C9) in [docs/EEM-CONTRACT.md](docs/EEM-CONTRACT.md) on your own image.

## Management interface: SVI or Loopback

Each recipe decides what `{{MGMT_INTERFACE}}` means:

| Recipe setting | `{{MGMT_INTERFACE}}` becomes | Build asks for |
|----------------|------------------------------|----------------|
| SVI (default) | `Vlan<MGMT_VLAN>` | Management VLAN |
| Loopback | `Loopback<MGMT_LOOPBACK>` | Management loopback number |

`{{MGMT_SOURCES}}` expands to the recipe's editable list of management-plane source commands. By default that is `ntp source`, `ip radius source-interface`, `logging source-interface` and `ip ssh source-interface`, all pointing at `{{MGMT_INTERFACE}}`. Change the management VLAN on Build, or switch the recipe to a loopback, and every source line follows. A loopback design also needs `ip routing`, a Routed uplink or SVI towards the gateway and `ip route 0.0.0.0 0.0.0.0 {{GATEWAY}}`; SwitchCard adds review notes when those are missing. Details in [docs/USER-GUIDE.md](docs/USER-GUIDE.md).

## Fleets, policies and history

- **Team policy rules** turn a hint into a gate: `require transport input ssh` or `forbid snmp-server community` lines block export until the generated text complies.
- **Fleet export** builds one card per CSV row with the same checks as a single card, one ZIP per switch or one text-only ZIP, plus a manifest of every SHA-256. **Duplicate switch** writes the rows for you: copies of the page with the hostname number and the management IP counted up.
- **Changes since the last export** shows a line diff when a switch is rebuilt, from the text remembered per hostname.
- **Baseline fingerprints** record what was loaded, warn when a different folder is loaded under the same label, and refuse an altered team package.
- **Fill from show ip interface brief** turns the switch's own port list into the recipe's interface list; **Transliterate to ASCII** fixes umlauts and typographic characters that block export; a **light theme** is one click away.

Details for each are in [docs/USER-GUIDE.md](docs/USER-GUIDE.md); the exact gates in [docs/SAFETY-EXPORT.md](docs/SAFETY-EXPORT.md).

## Built-in safeguards

- The preview text **is** the `editcontent.txt` in the ZIP (same bytes, CRLF). The export confirm shows its SHA-256 so the extracted file can be checked.
- The whole generated file must be plain printable ASCII; anything else (hidden characters, em dashes, umlauts) blocks export and names the line and column.
- Export is blocked while there are input errors, while a team policy rule fails, while the recipe is an example, without a matching baseline, or while the recipe editor has unapplied changes.
- Basic sanity checks: IPv4 shape, subnet/gateway fit, overlapping subnets, VLAN ranges, reserved VLANs, duplicate addresses, role lines with a missing port value, loopback number range, and loopback-mode review notes for routing and gateway reachability.
- It does **not** check Cisco command syntax, topology, licensing or EEM behavior.

## Saving work

- **Save project**: recipes, values, team hints and policy rules, the baseline fingerprint and export history (no firmware) as a JSON file (schema v5). Files from v0.5.x and v0.6.0 (schema v3 and v4) open unchanged; older releases cannot open v5 files.
- **Save team package**: recipes plus one baseline, for private sharing within a team.
- **Browser autosave**: a convenience copy in this browser only, with up to three backups. Firmware is never autosaved.

## Try it, verify it

- **Demo:** [namneto.github.io/SwitchCard](https://namneto.github.io/SwitchCard/) serves the same single file from GitHub Pages. Explore the examples there; for real work download the file and open it locally.
- **Verify a download:** every [release](https://github.com/NamNeto/SwitchCard/releases) lists the SHA-256 of `SwitchCard.html`. On Windows run `certutil -hashfile SwitchCard.html SHA256`, on Linux or macOS `sha256sum SwitchCard.html`, and compare.
- **Build from source:** `python build.py` assembles the file from `src/`; CI fails if the committed file drifts. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Related tools

- **Cisco Swap Drive** (`sync sdflash:`): Cisco's built-in flash-to-SD copy on IE3100 / IE3x00. In this workflow it produces the **baseline** (the image plus a startup-config that carries the applet) from an empty switch; the applet, not Swap Drive, applies `editcontent.txt`. See [examples/eem-applet-example.md](examples/eem-applet-example.md).
- **[CiscoDevNet industrial-netdevops](https://github.com/ciscodevnet/industrial-netdevops)**: online NETCONF / RESTCONF / Ansible automation, not offline SD media.

## Private data

Real configurations, credentials, SNMP communities, site names and team packages with firmware do not belong in a public repository. The included `.gitignore` excludes the usual exports (`*.zip`, project/backup JSON, `editcontent.txt`) and a `private/` folder as a safety net. See [SECURITY.md](SECURITY.md).

## Trademarks and legal

- Cisco, Cisco IOS, IOS XE, Catalyst and Cisco Industrial Ethernet are trademarks or registered trademarks of Cisco Systems, Inc. and/or its affiliates in the United States and other countries. They appear here only to identify the equipment this tool targets. SwitchCard is an independent project with no affiliation, endorsement, sponsorship or support from Cisco.
- Product IDs, port counts and interface names in the SKU presets and in [docs/models-and-interfaces.md](docs/models-and-interfaces.md) are factual data read from Cisco's public data sheets and configuration guides. They are hints, not a substitute for those documents or for `show ip interface brief` on your own switch.
- SwitchCard contains no Cisco software, firmware, images or documentation text. Firmware and configurations you load stay on your computer; do not publish them. You are responsible for holding the licences and rights to any image you place on a card.
- The code is original and dependency-free. Its ZIP writer and SHA-256 follow the public PKWARE APPNOTE and FIPS 180-4 specifications. It is released under the MIT licence **without warranty of any kind**; a wrong card can take a switch offline, so test on a spare switch first.

## Contributing

Feature requests and bug reports are welcome as [issues](https://github.com/NamNeto/SwitchCard/issues/new/choose); use placeholder values, never real configurations. Pull requests are read as proposals, and changes are made by the maintainer. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE). Use only with configurations and baselines you own and have tested.
