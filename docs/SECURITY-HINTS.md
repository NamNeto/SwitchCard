# Config security hints (advisory)

> The live hint list is edited in SwitchCard → Manage recipes & baseline → Team security hints, and is saved with the project. This page is background reference only.

SwitchCard **does not** enforce or inject any of these. The Build panel shows soft hints from the generated text so you can raise the bar in **your** tested recipe.

## Before choosing an image

- Use the Cisco Software Checker and the release notes for your exact SKU to pick the recommended IOS XE release.
- Check the field notices for your platform: some IE3100 hardware revisions require a minimum software release and will not boot older images.
- Recent IOS XE releases warn about legacy insecure features (Telnet, HTTP, SNMPv1/v2c, weak password types, FTP/TFTP, SSHv1, old TLS).
- Prefer **install mode** from **flash**. From IOS XE 17.10 the startup-config is read from flash; Swap Drive / `sync sdflash:` is separate from packing `editcontent.txt` for a custom EEM workflow.

## High-value hardening themes

1. **Management plane**: SSH only on VTY; HTTPS instead of HTTP; a management ACL or VRF where the design allows; `login block-for`.
2. **Credentials**: Type 8/9 enable and user secrets; Type 6 where reversible encryption is needed; retire Type 0/5/7.
3. **AAA**: `aaa new-model` with your approved TACACS+ (TACACS+ over TLS where supported) or RadSec, plus a local fallback.
4. **Telemetry**: SNMPv3 authPriv or NETCONF/RESTCONF; avoid `snmp-server community`.
5. **Edge ports**: Access ports with portfast + bpduguard (the SwitchCard Access default); unused ports shut down; careful CDP on untrusted edge ports; storm control where appropriate.
6. **VLAN design**: a dedicated management SVI (often VLAN 100), or a loopback behind a routed uplink; avoid VLAN 1 for user access; Layer-2 `vlan` statements via `{{VLANS}}`.
7. **Operations**: logging to a trusted collector; NTP from trusted sources; no TFTP/FTP for routine transfers.

## Sources to re-check before production

- Cisco IOS XE Software Hardening Guide
- Release notes for your IE3x00 / IE3100 / IE9300 release train
- [Cisco Catalyst IE3100 field notices](https://www.cisco.com/c/en/us/support/switches/catalyst-ie3100-rugged-series/products-field-notices-list.html)
- Cisco Software Checker for advisories on the image you deploy

Not affiliated with Cisco. These hints can lag Cisco's current guidance; treat cisco.com as the source of truth.
