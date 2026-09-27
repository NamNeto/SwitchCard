# The SyncConfig EEM applet and how a baseline card is made

SwitchCard writes one file, root `editcontent.txt`, next to a baseline. This page shows the applet that reads that file on the switch, what each step does, and the trick that gets the applet onto every new switch without touching it by hand. The applet is the one used in the workflow SwitchCard was built for; it is reproduced here as plain text in [eem-applet-SyncConfig.txt](eem-applet-SyncConfig.txt).

Record the image and model you exercise it with in [docs/TESTED.md](../docs/TESTED.md). The behaviour of `copy`, `sync sdflash:` and EEM prompts can differ between IOS XE releases, so the spare-switch checklist C1–C9 in [docs/EEM-CONTRACT.md](../docs/EEM-CONTRACT.md) still applies before production use.

## The applet

```text
event manager applet SyncConfig
 event timer countdown time 10 maxrun 150
 action 1.0  syslog msg "Config started"
 action 1.1  cli command "enable"
 action 1.2  cli command "copy sdflash:editcontent.txt startup-config" pattern "Destination filename \[startup-config\]"
 action 1.21 cli command ""
 action 1.3  wait 10
 action 1.4  cli command "copy startup-config running-config" pattern "Destination filename \[running-config\]"
 action 1.41 cli command ""
 action 1.42 wait 10
 action 1.43 cli command "configure terminal"
 action 1.44 cli command "event manager applet SyncConfig"
 action 1.45 cli command "no event timer countdown time 10 maxrun 150"
 action 1.46 cli command "end"
 action 1.47 cli command "write memory"
 action 1.48 cli command "configure terminal"
 action 1.49 cli command "no event manager applet SyncConfig"
```

## What each step does

| Action | Effect |
|--------|--------|
| `event timer countdown time 10 maxrun 150` | Fires once, 10 s after the applet is registered, which happens at every boot while the applet is in the startup-config. The whole run may take at most 150 s. |
| 1.0 – 1.1 | Logs the start and enters privileged mode. |
| 1.2 – 1.21 | `copy sdflash:editcontent.txt startup-config` **replaces** the startup-config with the card file; the empty `cli command ""` accepts the default destination at the `Destination filename [startup-config]?` prompt. |
| 1.3 | Waits 10 s for the copy to settle. |
| 1.4 – 1.41 | `copy startup-config running-config` **merges** the file into the running configuration, line by line, exactly as if typed in `configure terminal`. This is the apply step SwitchCard's assumptions describe (A1, A7). |
| 1.42 | Waits 10 s for the merge to finish. |
| 1.43 – 1.46 | Removes the applet's own trigger. With no `event` line the applet can never fire again, which is the **apply-once** guarantee (A11): a card left in the slot, or re-inserted later, does nothing. |
| 1.47 | `write memory` saves the merged running configuration, including the disarmed applet, over the startup-config. From here on the switch boots with the intended configuration. |
| 1.48 – 1.49 | Removes the applet from the running configuration. This last change is not saved, so the disarmed applet stays in the startup-config until the next `write memory`; it is harmless there. |

Two consequences worth knowing:

- **If `editcontent.txt` is missing**, the copy in 1.2 fails, the expected prompt never appears, and the applet is stopped by `maxrun` after 150 s without changing anything. It stays armed and tries again at the next boot.
- **If the run is interrupted** between 1.2 and 1.47 (power loss), the startup-config is the card file alone, without the applet. A SwitchCard card is a complete configuration, so the switch still boots usable; the applet is simply gone.

## How the applet reaches every switch: the baseline trick

The applet has to be in the startup-config that a new switch boots with. It gets there through the baseline, not through SwitchCard:

1. Take a **genuinely empty** switch of the target model (no startup-config).
2. Paste the applet and nothing else, then `write memory`.
3. Insert an empty SD card and run `sync sdflash:` (Cisco Swap Drive). The image, its packages and the startup-config that now carries the applet are copied to the card.
4. Copy the card's contents to a folder on the PC. That folder is the **baseline** ("sync-export folder") you load once in *Manage recipes & baseline*.
5. For every switch: fill in the device details, export the card ZIP, extract its contents to a wiped card, and put the card into a blank switch of the same model. The switch boots the baseline from the card; 10 s after the applet registers, it applies `editcontent.txt` as described above.

Because SwitchCard replaces only the root `editcontent.txt`, one baseline serves as many switches as you like; only the generated file differs between cards.

## Mapping to the SwitchCard assumptions

| Assumption | How SyncConfig meets it |
|------------|-------------------------|
| A1 line-by-line CLI | `copy startup-config running-config` |
| A2 CRLF and a final newline | handled by IOS XE `copy`; verify with C5 |
| A4 `!` comments ignored | the parser skips comment lines; verify with C3 if provenance comments are on |
| A5 saving is the applet's job | action 1.47 `write memory` |
| A7 merge into the existing configuration | the running-config copy merges; the startup-config copy replaces, then is overwritten by the save |
| A8 no marker line | the applet reads the whole file |
| A11 apply once | the applet removes its own trigger before saving |

## An alternative design

A flow can also merge the file directly into the running configuration (`copy sdflash:editcontent.txt running-config`) and rename it afterwards (`rename sdflash:editcontent.txt sdflash:editcontent.applied`) as its apply-once mechanism, leaving saving to a separate step. SwitchCard's checks are the same for both designs; only the assumptions table above tells you what to verify on a spare switch.
