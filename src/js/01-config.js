"use strict";
/* ==========================================================================================
   CODE MAP (top to bottom)
     1. Interface-name builders + CONFIG      tunables, storage keys, limits, role templates,
                                              built-in SKU presets
     2. Example recipes + app state           fictional recipes; in-memory workspace
     3. Utilities + autosave                  message/touch, autosave payload, backup ring,
                                              restore journal, restore/open unwrapping
     4. Render                                Build panel fields, ports table, baseline view
     5. Validation helpers                    VLAN parsing, invisible/non-ASCII detection,
                                              IPv4 helpers, SHA-256
     6. generate() + blockers()               recipe -> editcontent.txt text + errors/warnings;
                                              {{MGMT_INTERFACE}} (SVI or Loopback) + {{MGMT_SOURCES}}
     7. Preview / Maintain editor / Apply     renderPreview, loadEditor, applyRecipe, New switch
     8. Persistence                           migrateRecipe, validateProject, open/save project
     9. Baseline + ZIP I/O                    folder import, store-only ZIP writer/reader
    10. Event wiring + boot                   button handlers, export, autosave restore at load

   SAFETY INVARIANTS (keep these true when changing anything)
     - The preview text IS the ZIP's editcontent.txt (same string, same bytes, CRLF).
     - The whole generated file is printable ASCII; anything else blocks export.
     - Export is blocked while: generate() has errors, the recipe is an example, no matching
       baseline is loaded, or the Maintain editor has an unapplied draft.
     - Stored data is never overwritten silently: a replaced autosave goes to the backup
       ring first, and autosave pauses when that backup cannot be written.
     - No network access of any kind (enforced by the CSP meta tag in <head>).
   ========================================================================================== */

/* --- Interface-name builders for the SKU presets below ---
   IE3100 / IE3x00: GigabitEthernet1/x; IE3300/IE3400 expansion modules add Gi2/x (module 2).
   IE3300 10G models: TenGigabitEthernet1/1-1/2 uplinks, then Gi1/3-1/10.
   IE9300: GigabitEthernet1/0/1-24 downlinks; the four uplinks continue as 1/0/25-28
   (GigabitEthernet on 1G-uplink models, TenGigabitEthernet on 10G-uplink models). */
const gi = (n) =>
  Array.from({ length: n }, (_, i) => "GigabitEthernet1/" + (i + 1));
const gi0 = (n) =>
  Array.from({ length: n }, (_, i) => "GigabitEthernet1/0/" + (i + 1));
const gi0Uplinks = () => [25, 26, 27, 28].map((n) => "GigabitEthernet1/0/" + n);
const te0Uplinks = () => [25, 26, 27, 28].map((n) => "TenGigabitEthernet1/0/" + n);
// teN 10G uplinks first (Te1/1..), then giN copper downlinks continuing the numbering (Gi1/3..).
const teThenGi = (teN, giN) =>
  Array.from({ length: teN }, (_, i) => "TenGigabitEthernet1/" + (i + 1)).concat(
    Array.from({ length: giN }, (_, i) => "GigabitEthernet1/" + (teN + i + 1)),
  );
const gi2 = (n) =>
  Array.from({ length: n }, (_, i) => "GigabitEthernet2/" + (i + 1));
const basePlusExp = (baseN, expN) => gi(baseN).concat(gi2(expN));
const freezeIfaces = (arr) => Object.freeze(arr.slice());

/* ========================================================================
   CONFIG — tunables (version, storage keys, limits, defaults)
   The UI accent colour lives in CSS (--accent), not here.
   ======================================================================== */
const CONFIG = Object.freeze({
  RELEASE: "0.6.0",
  AUTOSAVE_KEY: "switchcard-autosave-v21",
  // Autosave key used before v0.5.10. Read once for import; never written or deleted.
  LEGACY_AUTOSAVE_KEYS: Object.freeze(["switchcard-autosave-v20"]),
  LEGACY_AUTOSAVE_READ_KEY: "switchcard-autosave-v20-read",
  AUTOSAVE_BACKUP_KEY: "switchcard-autosave-backups",
  // v0.5.11 kept three separate backup keys. They are migrated into AUTOSAVE_BACKUP_KEY once
  // and deleted only after that single array has been written successfully.
  AUTOSAVE_BACKUP_KEYS: ["switchcard-autosave-backup", "switchcard-autosave-backup-2", "switchcard-autosave-backup-3"],
  MAX_AUTOSAVE_BACKUPS: 3,
  // "Clear browser autosave" removes every localStorage key that starts with this prefix.
  STORAGE_PREFIX: "switchcard-",
  SHOW_MAINTAIN_TAB_KEY: "switchcard-show-maintain-tab",
  ONBOARD_KEY: "switchcard-onboarding-dismissed",
  PROJECT_VERSION: 4, // v4 (0.6.0): adds mgmtInterface / mgmtSources; v3 files open unchanged
  PROJECT_FORMAT: "switchcard-project",
  AUTOSAVE_FORMAT: "switchcard-autosave",
  MODELS: Object.freeze(["IE3100", "IE3x00", "IE9300"]),
  ROLE_NAMES: Object.freeze(["access", "trunk", "unused", "routed"]),
  // Management interface per recipe: {{MGMT_INTERFACE}} resolves to "Vlan<MGMT_VLAN>" (svi) or
  // "Loopback<MGMT_LOOPBACK>" (loopback). Recipes from older files have no field -> "svi".
  MGMT_INTERFACE_MODES: Object.freeze(["svi", "loopback"]),
  // Default {{MGMT_SOURCES}} block (editable per recipe). Every line follows {{MGMT_INTERFACE}}, so a
  // management VLAN or loopback change moves the NTP, RADIUS, logging and SSH sources together.
  MGMT_SOURCES_DEFAULT:
    "ntp source {{MGMT_INTERFACE}}\nip radius source-interface {{MGMT_INTERFACE}}\nlogging source-interface {{MGMT_INTERFACE}}\nip ssh source-interface {{MGMT_INTERFACE}}",
  // Placeholders SwitchCard computes itself: never Build fields, never taken from typed values.
  DERIVED_KEYS: Object.freeze(["MGMT_INTERFACE", "MGMT_SOURCES"]),
  MAX_LOOPBACK_NUMBER: 2147483647, // IOS-XE: interface Loopback <0-2147483647>
  // Default port-role command templates. {{INTERFACE}}, {{VLAN}}, {{DESCRIPTION}}, {{PORT_IP}}
  // and {{PORT_MASK}} are filled per port. Trunk is deliberately "mode trunk" only: its VLAN
  // field just creates VLANs via {{VLANS}}; add an allowed-VLAN line in your own template if needed.
  ROLES: Object.freeze({
    access:
      "interface {{INTERFACE}}\n description {{DESCRIPTION}}\n switchport mode access\n switchport access vlan {{VLAN}}\n spanning-tree portfast\n spanning-tree bpduguard enable\n no shutdown\n!",
    trunk:
      "interface {{INTERFACE}}\n description {{DESCRIPTION}}\n switchport mode trunk\n no shutdown\n!",
    unused: "interface {{INTERFACE}}\n shutdown\n!",
    routed:
      "interface {{INTERFACE}}\n description {{DESCRIPTION}}\n no switchport\n ip address {{PORT_IP}} {{PORT_MASK}}\n no shutdown\n!",
  }),
  // Built-in interface lists per SKU: PIDs and port counts checked against the Cisco data sheets
  // (Sept 2026), uplink numbering against Cisco configuration guides. Hints only: confirm with
  // "show ip interface brief" on a real unit. AppGigabitEthernet (app-hosting port) and mGig
  // models with unverified port names (IEM-3300-4MU, IE-9320-16P8U4X) are intentionally left out.
  SKU_PRESET_GROUPS: Object.freeze([
    Object.freeze({
      label: "IE3100 (fixed)",
      keys: Object.freeze([
        "IE-3100-4T2S",
        "IE-3100-8T2C",
        "IE-3100-8T4S",
        "IE-3100-18T2C",
        "IE-3100-18T2C-CC",
        "IE-3100-4P2S",
        "IE-3100-8P2C",
        "IE-3100-3P1U2S",
        "IE-3100-6P2U2C",
        "IE-3105-8T2C",
        "IE-3105-18T2C",
      ]),
    }),
    Object.freeze({
      label: "IE3200 (fixed)",
      keys: Object.freeze(["IE-3200-8T2S", "IE-3200-8P2S"]),
    }),
    Object.freeze({
      label: "IE3300 modular",
      keys: Object.freeze([
        "IE-3300-8T2S",
        "IE-3300-8P2S",
        "IE-3300-8T2X",
        "IE-3300-8U2X",
        "IE-3300-8T2S+IEM-3300-8T",
        "IE-3300-8T2S+IEM-3300-16T",
        "IE-3300-8T2S+IEM-3300-14T2S",
        "IE-3300-8P2S+IEM-3300-8P",
        "IE-3300-8T2X+IEM-3300-8T",
      ]),
    }),
    Object.freeze({
      label: "IE3400 modular",
      keys: Object.freeze([
        "IE-3400-8T2S",
        "IE-3400-8T2S+IEM-3400-8T",
        "IE-3400-8T2S+IEM-3400-8S",
        "IE-3400-8T2S+IEM-3300-16T",
        "IE-3400-8T2S+IEM-3300-6T2S",
        "IE-3400-8T2S+IEM-3300-14T2S",
        "IE-3400-8P2S",
        "IE-3400-8P2S+IEM-3400-8P",
        "IE-3400-8P2S+IEM-3300-16P",
      ]),
    }),
    Object.freeze({
      label: "IE9300 (rack, 28 ports)",
      keys: Object.freeze([
        "IE-9310-26S2C",
        "IE-9320-26S2C",
        "IE-9320-24P4S",
        "IE-9320-24T4X",
        "IE-9320-24P4X",
        "IE-9320-22S2C4X",
        "IE-9310-16P8S4X",
      ]),
    }),
  ]),
  SKU_PRESET_LABELS: Object.freeze({
    "IE-3100-4T2S": "IE-3100-4T2S — Gi1/1–6 (4 Cu + 2 SFP)",
    "IE-3100-8T2C": "IE-3100-8T2C — Gi1/1–10 (8 Cu + 2 dual-media)",
    "IE-3100-8T4S": "IE-3100-8T4S — Gi1/1–12 (8 Cu + 4 SFP)",
    "IE-3100-18T2C": "IE-3100-18T2C — Gi1/1–20 (18 Cu + 2 dual-media)",
    "IE-3100-18T2C-CC": "IE-3100-18T2C-CC — Gi1/1–20 (conformal coat)",
    "IE-3100-4P2S": "IE-3100-4P2S — Gi1/1–6 (4 PoE + 2 SFP)",
    "IE-3100-8P2C": "IE-3100-8P2C — Gi1/1–10 (8 PoE + 2 dual-media)",
    "IE-3100-3P1U2S": "IE-3100-3P1U2S — Gi1/1–6 (3 PoE + 1 4PPoE + 2 SFP)",
    "IE-3100-6P2U2C": "IE-3100-6P2U2C — Gi1/1–10 (6 PoE + 2 4PPoE + 2 dual-media)",
    "IE-3105-8T2C": "IE-3105-8T2C — Gi1/1–10 (8 Cu + 2 dual-media)",
    "IE-3105-18T2C": "IE-3105-18T2C — Gi1/1–20 (18 Cu + 2 dual-media)",
    "IE-3200-8T2S": "IE-3200-8T2S — Gi1/1–10 (Gi1/1–2 SFP uplinks + 8 Cu)",
    "IE-3200-8P2S": "IE-3200-8P2S — Gi1/1–10 (Gi1/1–2 SFP uplinks + 8 PoE)",
    "IE-3300-8T2S": "IE-3300-8T2S (base only) — Gi1/1–10 (Gi1/1–2 SFP uplinks + 8 Cu)",
    "IE-3300-8P2S": "IE-3300-8P2S (base only) — Gi1/1–10 (Gi1/1–2 SFP uplinks + 8 PoE)",
    "IE-3300-8T2X": "IE-3300-8T2X (base only) — Te1/1–2 (10G uplinks) + Gi1/3–10",
    "IE-3300-8U2X": "IE-3300-8U2X (base only) — Te1/1–2 (10G uplinks) + Gi1/3–10 (4PPoE)",
    "IE-3300-8T2S+IEM-3300-8T": "IE-3300-8T2S + IEM-3300-8T — Gi1/1–10 + Gi2/1–8",
    "IE-3300-8T2S+IEM-3300-16T": "IE-3300-8T2S + IEM-3300-16T — Gi1/1–10 + Gi2/1–16",
    "IE-3300-8T2S+IEM-3300-14T2S": "IE-3300-8T2S + IEM-3300-14T2S — Gi1/1–10 + Gi2/1–16",
    "IE-3300-8P2S+IEM-3300-8P": "IE-3300-8P2S + IEM-3300-8P — Gi1/1–10 + Gi2/1–8",
    "IE-3300-8T2X+IEM-3300-8T": "IE-3300-8T2X + IEM-3300-8T — Te1/1–2 + Gi1/3–10 + Gi2/1–8",
    "IE-3400-8T2S": "IE-3400-8T2S (base only) — Gi1/1–10 (Gi1/1–2 SFP uplinks + 8 Cu)",
    "IE-3400-8T2S+IEM-3400-8T": "IE-3400-8T2S + IEM-3400-8T — Gi1/1–10 + Gi2/1–8",
    "IE-3400-8T2S+IEM-3400-8S": "IE-3400-8T2S + IEM-3400-8S — Gi1/1–10 + Gi2/1–8",
    "IE-3400-8T2S+IEM-3300-16T": "IE-3400-8T2S + IEM-3300-16T — Gi1/1–10 + Gi2/1–16",
    "IE-3400-8T2S+IEM-3300-6T2S": "IE-3400-8T2S + IEM-3300-6T2S — Gi1/1–10 + Gi2/1–8",
    "IE-3400-8T2S+IEM-3300-14T2S": "IE-3400-8T2S + IEM-3300-14T2S — Gi1/1–10 + Gi2/1–16",
    "IE-3400-8P2S": "IE-3400-8P2S (base only) — Gi1/1–10 (Gi1/1–2 SFP uplinks + 8 PoE)",
    "IE-3400-8P2S+IEM-3400-8P": "IE-3400-8P2S + IEM-3400-8P — Gi1/1–10 + Gi2/1–8",
    "IE-3400-8P2S+IEM-3300-16P": "IE-3400-8P2S + IEM-3300-16P — Gi1/1–10 + Gi2/1–16",
    "IE-9310-26S2C": "IE-9310-26S2C — Gi1/0/1–24 (22 SFP + 2 dual-media) + Gi1/0/25–28 (1G uplinks)",
    "IE-9320-26S2C": "IE-9320-26S2C — Gi1/0/1–24 (22 SFP + 2 dual-media) + Gi1/0/25–28 (1G uplinks)",
    "IE-9320-24P4S": "IE-9320-24P4S — Gi1/0/1–24 (PoE+) + Gi1/0/25–28 (1G uplinks)",
    "IE-9320-24T4X": "IE-9320-24T4X — Gi1/0/1–24 + Te1/0/25–28 (10G uplinks)",
    "IE-9320-24P4X": "IE-9320-24P4X — Gi1/0/1–24 (PoE+) + Te1/0/25–28 (10G uplinks)",
    "IE-9320-22S2C4X": "IE-9320-22S2C4X — Gi1/0/1–24 (22 SFP + 2 dual-media) + Te1/0/25–28 (10G uplinks)",
    "IE-9310-16P8S4X": "IE-9310-16P8S4X — Gi1/0/1–24 (16 PoE+ + 8 SFP) + Te1/0/25–28 (10G uplinks)",
  }),
  SKU_PRESETS: Object.freeze({
    "IE-3100-4T2S": freezeIfaces(gi(6)),
    "IE-3100-8T2C": freezeIfaces(gi(10)),
    "IE-3100-8T4S": freezeIfaces(gi(12)),
    "IE-3100-18T2C": freezeIfaces(gi(20)),
    "IE-3100-18T2C-CC": freezeIfaces(gi(20)),
    "IE-3100-4P2S": freezeIfaces(gi(6)),
    "IE-3100-8P2C": freezeIfaces(gi(10)),
    "IE-3100-3P1U2S": freezeIfaces(gi(6)),
    "IE-3100-6P2U2C": freezeIfaces(gi(10)),
    "IE-3105-8T2C": freezeIfaces(gi(10)),
    "IE-3105-18T2C": freezeIfaces(gi(20)),
    "IE-3200-8T2S": freezeIfaces(gi(10)),
    "IE-3200-8P2S": freezeIfaces(gi(10)),
    "IE-3300-8T2S": freezeIfaces(gi(10)),
    "IE-3300-8P2S": freezeIfaces(gi(10)),
    "IE-3300-8T2X": freezeIfaces(teThenGi(2, 8)),
    "IE-3300-8U2X": freezeIfaces(teThenGi(2, 8)),
    "IE-3300-8T2S+IEM-3300-8T": freezeIfaces(basePlusExp(10, 8)),
    "IE-3300-8T2S+IEM-3300-16T": freezeIfaces(basePlusExp(10, 16)),
    "IE-3300-8T2S+IEM-3300-14T2S": freezeIfaces(basePlusExp(10, 16)),
    "IE-3300-8P2S+IEM-3300-8P": freezeIfaces(basePlusExp(10, 8)),
    "IE-3300-8T2X+IEM-3300-8T": freezeIfaces(teThenGi(2, 8).concat(gi2(8))),
    "IE-3400-8T2S": freezeIfaces(gi(10)),
    "IE-3400-8T2S+IEM-3400-8T": freezeIfaces(basePlusExp(10, 8)),
    "IE-3400-8T2S+IEM-3400-8S": freezeIfaces(basePlusExp(10, 8)),
    "IE-3400-8T2S+IEM-3300-16T": freezeIfaces(basePlusExp(10, 16)),
    "IE-3400-8T2S+IEM-3300-6T2S": freezeIfaces(basePlusExp(10, 8)),
    "IE-3400-8T2S+IEM-3300-14T2S": freezeIfaces(basePlusExp(10, 16)),
    "IE-3400-8P2S": freezeIfaces(gi(10)),
    "IE-3400-8P2S+IEM-3400-8P": freezeIfaces(basePlusExp(10, 8)),
    "IE-3400-8P2S+IEM-3300-16P": freezeIfaces(basePlusExp(10, 16)),
    "IE-9310-26S2C": freezeIfaces(gi0(24).concat(gi0Uplinks())),
    "IE-9320-26S2C": freezeIfaces(gi0(24).concat(gi0Uplinks())),
    "IE-9320-24P4S": freezeIfaces(gi0(24).concat(gi0Uplinks())),
    "IE-9320-24T4X": freezeIfaces(gi0(24).concat(te0Uplinks())),
    "IE-9320-24P4X": freezeIfaces(gi0(24).concat(te0Uplinks())),
    "IE-9320-22S2C4X": freezeIfaces(gi0(24).concat(te0Uplinks())),
    "IE-9310-16P8S4X": freezeIfaces(gi0(24).concat(te0Uplinks())),
  }),
  CUSTOM_SKU_PRESETS_KEY: "switchcard-custom-sku-presets",
  EXAMPLE_IFACE_COUNT: 10,
  MAX_ARCHIVE_BYTES: 1024 * 1024 * 1024, // 1 GiB: upper bound for a baseline or team package
  MAX_BASELINE_FILES: 60000,
  MAX_PROJECT_BYTES: 10 * 1024 * 1024,
  MAX_RECIPES: 200,
  MAX_TEMPLATE_CHARS: 500000,
  MAX_ROLE_CHARS: 100000,
  MAX_INTERFACES: 128,
  MAX_PORTS: 128,
  WARN_GENERATED_CHARS: 100000,
  MAX_GENERATED_CHARS: 2 * 1024 * 1024, // refuse runaway output (e.g. a huge template)
  AUTOSAVE_DEBOUNCE_MS: 400,
  OBJECT_URL_REVOKE_MS: 60000,
  MAX_TEAM_HINTS: 50,
  MAX_TEAM_HINT_CHARS: 300,
  MAX_RECIPE_NAME_CHARS: 120,
  MAX_PRESET_NAME_CHARS: 60,
  MAX_DESCRIPTION_CHARS: 200, // IOS-XE interface description limit
  WARN_VLAN_STATEMENTS: 64, // soft warning for {{VLANS}} size
  MAX_VLAN_STATEMENTS: 256, // hard cap: refuse (never silently truncate)
  RESERVED_VLANS: Object.freeze([1002, 1003, 1004, 1005]),
  // Port-level placeholders are filled per port and can never be overridden by a recipe value.
  RESERVED_VALUE_KEYS: Object.freeze(["INTERFACE", "VLAN", "DESCRIPTION", "PORT_IP", "PORT_MASK"]),
});

// Short aliases for frequently used CONFIG entries.
const {
  RELEASE,
  AUTOSAVE_KEY,
  SHOW_MAINTAIN_TAB_KEY,
  ONBOARD_KEY,
  PROJECT_VERSION,
  ROLE_NAMES,
  ROLES,
  SKU_PRESETS,
  SKU_PRESET_GROUPS,
  SKU_PRESET_LABELS,
  CUSTOM_SKU_PRESETS_KEY,
  MAX_ARCHIVE_BYTES: MAX,
  MAX_BASELINE_FILES,
  MAX_PROJECT_BYTES,
  MAX_RECIPES,
  MAX_TEMPLATE_CHARS,
  MAX_ROLE_CHARS,
  MAX_INTERFACES,
  MAX_PORTS,
  WARN_GENERATED_CHARS,
  MAX_GENERATED_CHARS,
  AUTOSAVE_DEBOUNCE_MS,
  OBJECT_URL_REVOKE_MS,
} = CONFIG;

const $ = (id) => document.getElementById(id);
const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });
const EXAMPLE_IFACES = Array.from(
  { length: CONFIG.EXAMPLE_IFACE_COUNT },
  (_, i) => "GigabitEthernet1/" + (i + 1)
);
