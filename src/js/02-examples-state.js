// --- Example recipes: fictional data; example:true blocks SD-card export ---
function example(model, name) {
  return {
    id: crypto.randomUUID(),
    name,
    model,
    firmware: [],
    example: true,
    mgmtInterface: "svi",
    mgmtSources: CONFIG.MGMT_SOURCES_DEFAULT,
    template:
      "! EXAMPLE ONLY - replace with your tested configuration\n! Site: {{SITE}}\nhostname {{HOSTNAME}}\n!\n! Layer-2 VLANs (management + Access/Trunk port VLANs)\n{{VLANS}}\n! Layer-3 management interface: SVI or Loopback, chosen in the recipe editor\ninterface {{MGMT_INTERFACE}}\n description MANAGEMENT\n ip address {{MGMT_IP}} {{MGMT_MASK}}\n no shutdown\n!\nip default-gateway {{GATEWAY}}\n!\n! Management-plane sources (NTP, RADIUS, logging, SSH) follow the management interface\n{{MGMT_SOURCES}}\n!\n{{PORTS}}\nend\n",
    interfaces: [...EXAMPLE_IFACES],
    roles: { ...ROLES },
    exports: {},
    values: {
      HOSTNAME: model + "-DEMO-01",
      MGMT_IP: "192.0.2.10",
      MGMT_MASK: "255.255.255.0",
      MGMT_VLAN: "100",
      GATEWAY: "192.0.2.1",
      SITE: "Example site",
    },
    ports: [],
  };
}
// Loopback-managed variant: the switch routes, the uplink is a Routed port with its own address
// and the management address lives on Loopback<MGMT_LOOPBACK>. Documentation addresses only.
function exampleLoopback(model, name) {
  const r = example(model, name);
  r.mgmtInterface = "loopback";
  r.template =
    "! EXAMPLE ONLY - replace with your tested configuration\n! Site: {{SITE}}\nhostname {{HOSTNAME}}\n!\n! Loopback management: the switch routes; the uplink is a Routed port with its own IP/mask\nip routing\n!\n{{VLANS}}\n! Management address on the loopback (Loopback mode in the recipe editor)\ninterface {{MGMT_INTERFACE}}\n description MANAGEMENT\n ip address {{MGMT_IP}} {{MGMT_MASK}}\n!\nip route 0.0.0.0 0.0.0.0 {{GATEWAY}}\n!\n! Management-plane sources follow the management interface\n{{MGMT_SOURCES}}\n!\n{{PORTS}}\nend\n";
  r.values = {
    HOSTNAME: model + "-LOOP-01",
    MGMT_IP: "198.51.100.10",
    MGMT_MASK: "255.255.255.255",
    MGMT_LOOPBACK: "0",
    GATEWAY: "192.0.2.1",
    SITE: "Example site",
  };
  r.ports = [
    { name: "GigabitEthernet1/1", role: "routed", vlan: "", description: "Uplink (routed)", ip: "192.0.2.2", mask: "255.255.255.252" },
  ];
  return r;
}
// --- App state (all in memory; autosave mirrors it to localStorage) ---
// recipes/active: the workspace; baseline: loaded firmware files (never autosaved);
// dirty: unsaved changes; editorPending: Maintain editor has unapplied edits (blocks export).
let recipes = [
    example("IE3100", "IE3100 - Example access switch"),
    example("IE3100", "IE3100 - Example alternate configuration"),
    example("IE3x00", "IE3x00 - Example access switch"),
    exampleLoopback("IE3x00", "IE3x00 - Example loopback management (routed uplink)"),
  ],
  active = recipes[0].id,
  baseline = null,
  busy = false,
  dirty = false,
  editorPending = false,
  autosaveTimer = null,
  teamHints = [],
  teamPolicies = [], // "require <regex>" / "forbid <regex>" lines; failing rules block export
  baselineExpected = null, // { model, version, fingerprint? } recorded in the open project
  fleet = null, // last "Check fleet" result for the current recipe
  customSkuPresets = Object.create(null);
const current = () => recipes.find((r) => r.id === active);

