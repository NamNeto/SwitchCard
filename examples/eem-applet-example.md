# Reference EEM applet: apply `editcontent.txt` once

> **EXAMPLE ONLY. Not device-tested.** SwitchCard writes the card; something on the switch has to read it. This page shows one way to do that with an Embedded Event Manager (EEM) applet, so a team without an existing flow can build one. Test it on a spare switch or in a lab (checklist C1–C9 in [docs/EEM-CONTRACT.md](../docs/EEM-CONTRACT.md), results in [docs/TESTED.md](../docs/TESTED.md)) before any production use. EEM syntax and prompts vary by IOS XE release.

## What it does

1. About three minutes after boot, checks whether `sdflash:editcontent.txt` exists.
2. If it does, merges it into the running configuration with `copy sdflash:editcontent.txt running-config` (line-by-line apply, assumption A1; merge semantics, A7).
3. Renames the file to `editcontent.applied` so a card left in the slot, or re-inserted later, is **never applied twice** (apply-once, A11).
4. Logs each step to syslog. Saving the configuration is left as an explicit, commented-out step (A5).

## The applet

```text
! EXAMPLE ONLY - not device-tested. Read examples/eem-applet-example.md first.
! Applies sdflash:editcontent.txt once, about 180 s after the applet is (re)registered at boot,
! then renames the file so it cannot be applied again.
event manager applet SWITCHCARD-APPLY
 event timer countdown time 180
 action 010 cli command "enable"
 action 020 cli command "dir sdflash:editcontent.txt"
 action 030 regexp "(No such file|Error opening)" "$_cli_result"
 action 040 if $_regexp_result eq "1"
 action 041  syslog priority notifications msg "SWITCHCARD: no sdflash:editcontent.txt, nothing applied"
 action 042  exit 0
 action 043 end
 action 050 syslog priority notifications msg "SWITCHCARD: applying sdflash:editcontent.txt"
 action 060 cli command "copy sdflash:editcontent.txt running-config" pattern "filename"
 action 061 cli command ""
 action 070 syslog priority notifications msg "SWITCHCARD: copy finished"
 action 080 cli command "rename sdflash:editcontent.txt sdflash:editcontent.applied" pattern "filename"
 action 081 cli command ""
 action 090 syslog priority notifications msg "SWITCHCARD: file renamed to editcontent.applied (apply-once)"
! Optional: persist the result. SwitchCard never emits write memory; decide it here (A5).
! action 100 cli command "write memory"
```

## Notes and variants

- **Trigger.** `event timer countdown` fires once, 180 s after the applet is registered. Because the applet lives in the startup configuration, that happens again after every reload, which gives the card slot and the file system time to come up. Alternatives: `event syslog pattern "%SYS-5-RESTART"` to react to the boot message, or `event none` and a manual `event manager run SWITCHCARD-APPLY` for a supervised apply.
- **Prompts.** `copy` and `rename` ask for a destination filename; the `pattern "filename"` clause tells EEM to expect that prompt and the empty `cli command ""` answers it with the default. If your image words the prompt differently, adjust the pattern; a wrong pattern makes the action time out.
- **Merge, not replace.** `copy ... running-config` merges into the running configuration, which is what SwitchCard assumes (A7). To start every port from defaults, enable the recipe's `default interface` option instead of switching to `configure replace`, and test C4 first.
- **Card file system.** IE3100 and IE3x00 expose the SD card as `sdflash:`. Confirm the name on your platform with `dir` before relying on it.
- **Apply-once.** The rename is the whole apply-once mechanism. Check it with C9: after a successful apply, change something harmless by hand, re-insert the same card, reboot, and confirm nothing re-applies.
- **Where the applet lives.** It must already be in the switch's configuration before the card is inserted, for example in the image or baseline you stage on every switch. SwitchCard does not put it there.
- **Failure visibility.** The `copy` output (including any `% Invalid input` lines) is not written to syslog here because syslog messages are short; with the console connected you see it, and `show logging` keeps the SWITCHCARD lines. Extend action 070 with `$_cli_result` on images where the message length allows it.

## Mapping to the SwitchCard assumptions

| Assumption | How this applet meets it |
|------------|--------------------------|
| A1 line-by-line CLI | `copy file running-config` |
| A2 CRLF, final newline | handled by IOS XE `copy`; verify with C5 |
| A4 `!` comments ignored | `copy` treats `!` lines as comments; verify with C3 if provenance comments are on |
| A5 no automatic save | `write memory` is commented out |
| A7 merge into existing config | `copy`, not `configure replace` |
| A8 no marker line | the applet reads the whole file |
| A11 apply once | rename to `editcontent.applied` |
