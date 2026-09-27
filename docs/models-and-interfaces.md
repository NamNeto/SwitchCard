# Models and interface naming

Practical notes for recipes. Always verify on the device with:

```text
show ip interface brief
```

SKU presets in SwitchCard fill **Available interface names** as a starting point only. You still must click **Apply recipe changes**. AppGigabitEthernet (the app-hosting port) is left out of every preset. Combo / dual-media and SFP ports share GigabitEthernet names with copper ports.

## How the presets were checked

The product IDs and port counts below were compared with the public Cisco data sheets of each family in September 2026, and the interface numbering with Cisco configuration guides. They are still hints: SwitchCard has not been run against every model, Cisco adds and retires models, and only `show ip interface brief` on your own unit is authoritative.

| Source | Used for |
|--------|----------|
| Cisco Catalyst IE3100 Rugged Series data sheet | IE3100 / IE3105 PIDs and port counts |
| Cisco Catalyst IE3200, IE3300 and IE3400 Rugged Series data sheets | base units and IEM expansion modules |
| Cisco Catalyst IE9300 Rugged Series data sheet | IE9310 / IE9320 PIDs and port counts |
| IE3x00 configuration guides (Layer 2 NAT, Device Level Ring) | uplinks `Gi1/1`-`Gi1/2`, expansion ports `Gi2/x` |
| IE9300 Resilient Ethernet Protocol guide | uplinks numbered `1/0/25`-`1/0/28` |

Cisco orders every switch with a licence suffix (`-E` Network Essentials, `-A` Network Advantage). The presets use the base PID without the suffix.

## Model families in SwitchCard

- **IE3100**: DIN-rail IE-3100 and IE-3105 (fixed configuration).
- **IE3x00**: IE3200 (fixed), IE3300 and IE3400 (modular, one expansion module). Older project files that said `IE3400` migrate to **IE3x00** on import.
- **IE9300**: rack-mount IE-9310 and IE-9320, always 28 ports (24 downlinks + 4 uplinks).

## IE3100 (Gi1/1 ... Gi1/N)

Fixed switches named `GigabitEthernet1/1` ... `GigabitEthernet1/N`, where N is copper plus SFP or dual-media ports. The IE3100 hardware guide lists `GigabitEthernet1/1` to `1/20` plus `AppGigabitEthernet1/1`. The data sheet does not say which numbers are the uplinks; check the front-panel labels or `show interfaces status`.

| PID | Ports | Preset interfaces |
|-----|-------|-------------------|
| IE-3100-4T2S | 4 Cu + 2 SFP | Gi1/1-6 |
| IE-3100-8T2C | 8 Cu + 2 dual-media | Gi1/1-10 |
| IE-3100-8T4S | 8 Cu + 4 SFP | Gi1/1-12 |
| IE-3100-18T2C | 18 Cu + 2 dual-media | Gi1/1-20 |
| IE-3100-18T2C-CC | same, conformal coating | Gi1/1-20 |
| IE-3100-4P2S | 4 PoE/PoE+ + 2 SFP (120 W budget) | Gi1/1-6 |
| IE-3100-8P2C | 8 PoE/PoE+ + 2 dual-media (240 W) | Gi1/1-10 |
| IE-3100-3P1U2S | 3 PoE/PoE+ + 1 4PPoE + 2 SFP (120 W) | Gi1/1-6 |
| IE-3100-6P2U2C | 6 PoE/PoE+ + 2 4PPoE + 2 dual-media (240 W) | Gi1/1-10 |
| IE-3105-8T2C | 8 Cu + 2 dual-media | Gi1/1-10 |
| IE-3105-18T2C | 18 Cu + 2 dual-media | Gi1/1-20 |

## IE3200 (fixed)

| PID | Ports | Preset |
|-----|-------|--------|
| IE-3200-8T2S | 2 SFP uplinks (Gi1/1-2) + 8 Cu | Gi1/1-10 |
| IE-3200-8P2S | 2 SFP uplinks (Gi1/1-2) + 8 PoE/PoE+ (240 W) | Gi1/1-10 |

The IE3200 takes no expansion module.

## IE3300 (modular)

On the 1G models the SFP uplinks are `Gi1/1`-`Gi1/2` and the copper downlinks `Gi1/3`-`Gi1/10`. On the 10G models the uplinks are `TenGigabitEthernet1/1`-`1/2` and the downlinks stay `Gi1/3`-`Gi1/10`.

| PID | Ports | Preset |
|-----|-------|--------|
| IE-3300-8T2S | 2 SFP + 8 Cu | Gi1/1-10 |
| IE-3300-8P2S | 2 SFP + 8 PoE+ | Gi1/1-10 |
| IE-3300-8T2X | 2 x 10G SFP+ + 8 Cu | Te1/1-2 + Gi1/3-10 |
| IE-3300-8U2X | 2 x 10G SFP+ + 8 4PPoE (480 W) | Te1/1-2 + Gi1/3-10 |

Expansion modules (IEM-3300) are **module 2**: `GigabitEthernet2/1` ... `2/N`.

| Module | Ports | Adds |
|--------|-------|------|
| IEM-3300-8T | 8 Cu | Gi2/1-8 |
| IEM-3300-8P | 8 PoE+ | Gi2/1-8 |
| IEM-3300-8S | 8 SFP | Gi2/1-8 |
| IEM-3300-6T2S | 6 Cu + 2 SFP | Gi2/1-8 |
| IEM-3300-16T | 16 Cu | Gi2/1-16 |
| IEM-3300-16P | 16 PoE+ | Gi2/1-16 |
| IEM-3300-14T2S | 14 Cu + 2 SFP | Gi2/1-16 |
| IEM-3300-4MU | 4 x 2.5G 4PPoE | no preset: the mGig port names were not verified |

Built-in combinations: `IE-3300-8T2S+IEM-3300-8T`, `+IEM-3300-16T`, `+IEM-3300-14T2S`, `IE-3300-8P2S+IEM-3300-8P` and `IE-3300-8T2X+IEM-3300-8T`. For any other pairing, pick the base preset and append `GigabitEthernet2/1` ... by hand, then save it as your own SKU preset.

## IE3400 (modular)

Base `IE-3400-8T2S` / `IE-3400-8P2S`: `Gi1/1`-`1/10`, uplinks `Gi1/1`-`1/2`. Expansion modules are module 2, `Gi2/1`-`2/N`; the IE3x00 Device Level Ring guide uses `Gi2/1` through `Gi2/8` for an IEM-3400. They do **not** continue the Gi1/x sequence.

| Combination | Preset |
|-------------|--------|
| IE-3400-8T2S / 8P2S base only | Gi1/1-10 |
| + IEM-3400-8T / 8S / 8P | Gi1/1-10 + Gi2/1-8 |
| + IEM-3300-6T2S | Gi1/1-10 + Gi2/1-8 |
| + IEM-3300-16T / 16P / 14T2S | Gi1/1-10 + Gi2/1-16 |

Cisco supports IEM-3300 modules on an IE3400 base, but that pairing disables some IE3400-only security features (see the IE3400 data sheet).

## IE9300 (rack, 28 ports)

Every model has 24 downlinks `GigabitEthernet1/0/1`-`1/0/24` and four uplinks that **continue the same numbering as ports 25-28**: `GigabitEthernet1/0/25-28` on the 1G-uplink models and `TenGigabitEthernet1/0/25-28` on the 10G-uplink models. The IE9300 REP guide names the uplink pairs Gi1/0/25-26 and Gi1/0/27-28 and says the Te ports pair the same way.

SwitchCard releases before 0.6.0 guessed Catalyst-9300-style `1/1/x` uplink names for this family. That was wrong for the IE9300; re-check any recipe built from those presets.

| PID | Downlinks | Uplinks | Preset |
|-----|-----------|---------|--------|
| IE-9310-26S2C | 22 SFP + 2 dual-media | 4 x 1G | Gi1/0/1-24 + Gi1/0/25-28 |
| IE-9320-26S2C | 22 SFP + 2 dual-media | 4 x 1G | Gi1/0/1-24 + Gi1/0/25-28 |
| IE-9320-24P4S | 24 Cu PoE+ | 4 x 1G | Gi1/0/1-24 + Gi1/0/25-28 |
| IE-9320-24T4X | 24 Cu | 4 x 1/10G | Gi1/0/1-24 + Te1/0/25-28 |
| IE-9320-24P4X | 24 Cu PoE+ | 4 x 1/10G | Gi1/0/1-24 + Te1/0/25-28 |
| IE-9320-22S2C4X | 22 SFP + 2 dual-media | 4 x 1/10G | Gi1/0/1-24 + Te1/0/25-28 |
| IE-9310-16P8S4X | 16 Cu PoE+ + 8 SFP | 4 x 1/10G | Gi1/0/1-24 + Te1/0/25-28 |
| IE-9320-16P8U4X | 16 Cu PoE+ + 8 x 2.5G 4PPoE | 4 x 1/10G | no preset: the mGig port names were not verified |

## Custom SKU presets

Save the current interface list as a named preset (**Save as SKU preset**). Custom presets appear under **My presets**, persist in browser `localStorage` and in project / team package JSON as `customSkuPresets` (a missing field migrates to `{}`).

## Expansion modules and AppGigabitEthernet

- On **IE3300 / IE3400 + IEM**, expansion ports are **Gi2/x** (module 2). Do not invent a continuous Gi1/11... list.
- Some SKUs expose AppGigabitEthernet or other special interfaces. Do **not** invent them in presets; add them only when the device shows them.
- After any hardware change, re-check `show ip interface brief` and update the recipe interface list.

## IOS XE 17.10+ Swap Drive sync direction

- From **17.10.1+**: flash is always primary; `sync sdflash:` is **one-way flash to sdflash**.
- Restoring a blank switch from SD is a Cisco platform path (when flash has no startup-config).
- That official path is separate from packing a custom `editcontent.txt` for your EEM flow.
- SwitchCard only packs media for **your** workflow; it does not implement or replace `sync`.

## Recipe tip

Use SKU presets to fill names quickly, then **Apply**. If the live switch differs, edit the interface list by hand before building cards.
