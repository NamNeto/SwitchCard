# Device test matrix

SwitchCard's checks are static. The assumptions it makes about the switch (A1–A11) and the spare-switch checklist (C1–C9) are in [EEM-CONTRACT.md](EEM-CONTRACT.md). This page records what has actually been run against a switch or a lab image, so a reader can tell evidence from assumption.

**Status: no device or lab results recorded yet.** Automated browser tests cover the generator, the checks and the ZIP writer (see [../tests](../tests)); they prove what the file contains, not how an image applies it. Lab runs in Cisco Modeling Labs are planned; hardware runs on a spare switch remain the reference for production use. The SyncConfig applet in [../examples/eem-applet-example.md](../examples/eem-applet-example.md) is the maintainer's own flow; record the image and model it was exercised with here once a run is written up.

## How to record a run

Copy the row template, fill in one row per model and image, and mark each checklist item `pass`, `fail` (with a link to an issue) or `n/a`. Keep placeholder addresses in anything you paste.

| Date | Platform | PID | IOS XE | Lab or hardware | SwitchCard | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | Notes |
|------|----------|-----|--------|-----------------|------------|----|----|----|----|----|----|----|----|----|-------|
| (none yet) | | | | | | | | | | | | | | | |

Row template:

```text
| YYYY-MM-DD | IE3400 | IE-3400-8T2S | 17.x.y | CML / spare switch | 0.7.2 | pass | pass | n/a | n/a | pass | pass | pass | pass | pass | applet from examples/eem-applet-example.md |
```

## What each item proves

| Item | Assumption | Proves |
|------|------------|--------|
| C1 | A3 | a bare CR is refused in the UI (and, optionally, how the image treats one) |
| C2 | A6 | an empty description omits the line and the stanza applies cleanly |
| C3 | A4, A8 | `!` provenance comments are ignored by the flow |
| C4 | A7 | `default interface` resets ports and the uplink comes back |
| C5 | A2 | the last CRLF-terminated command is applied |
| C6 | A9, A10 | reserved and large VLAN lists behave as documented |
| C7 | — | the management path (SVI or Loopback) comes up and answers |
| C8 | — | the extracted `editcontent.txt` hash equals the export confirm |
| C9 | A11 | the applet applies a card at most once |

For a loopback-managed recipe, C7 also covers `ip routing`, the Routed uplink and the default route.
