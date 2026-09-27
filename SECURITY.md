# Security

## Security model

SwitchCard is an **offline, local tool**: one HTML file opened in Edge or Chrome.

- **No network access.** A Content Security Policy (`connect-src 'none'`, `default-src 'none'`) blocks every request from the page, and the app contains no `fetch` / XHR calls.
- **No external code.** No libraries, CDNs or remote fonts; all CSS and JavaScript are inline.
- **Local files only.** Exports are written where the browser saves downloads. The baseline folder you select is read, never modified.
- **Browser autosave** stays in that browser's `localStorage` for the page's `file://` origin. It never stores firmware bytes.
- **Clipboard copy** (when the browser allows it) stays on the machine.

## What it does not protect

Offline packaging does not make the **content** safe to share. Configurations can contain passwords, SNMP communities, site names and addresses; team packages can contain firmware.

- Keep real configurations, project files and team packages on **approved private storage**, never in a public repository. The included `.gitignore` excludes the usual export files.
- Follow your organization's policies for HTML files, removable media and SD cards.
- SwitchCard is **not** a Cisco configuration validator. It checks basic fields (IPv4 shape, VLAN ranges, address collisions); it does not prove command syntax, topology, licensing or EEM behavior. Test every recipe on a spare switch first ([docs/EEM-CONTRACT.md](docs/EEM-CONTRACT.md)).

## What the v0.7.0 features store

- **Export history** keeps the last generated `editcontent.txt` per hostname inside each recipe (project file, team package, browser autosave). It has the same sensitivity as the template it came from, so the same storage rules apply.
- **Baseline fingerprints** store file paths, sizes and SHA-256 hashes, never file contents.
- **Team policy rules** are regular expressions evaluated locally; a pathological pattern can only slow down your own browser.
- **Fleet CSV** text stays in the page and is not saved with the project. The manifest downloads list hostnames, addresses and hashes.
- The **theme** choice is one browser-local key (`switchcard-theme`); Clear browser autosave removes it.
- The **GitHub Pages demo** serves the same file from GitHub's servers. Once loaded the page still makes no requests, but for real work download `SwitchCard.html` from a release, check its SHA-256 and open it locally.

## Recommended practice

1. **Save project** (and team packages when needed) to approved private storage.
2. Share team packages only privately, next to `SwitchCard.html`.
3. Use a **wiped or fresh** SD card and extract the ZIP **contents** to the card root.
4. Test on a spare switch before production use.
5. On a shared PC, use **Clear browser autosave** when finished (Save project first if the work is needed). Clear removes every SwitchCard item from this browser storage area (current and older autosaves, backups and recovery journals, custom SKU presets, tip/pin settings) and writes only the non-configuration marker `switchcard-autosave-v20-read=1`, which prevents a later legacy import. In-memory work remains until reload; a later edit or another open tab can save again.

Autosave backups use one atomic list with up to three entries. Restore backs up the current workspace and any unapplied draft before replacing it; if that backup cannot be written, nothing changes. Browser storage is a convenience: keep durable files on approved storage and use a single tab during recovery.

## Reporting a problem

Report security problems privately through GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability** ([direct link](https://github.com/NamNeto/SwitchCard/security/advisories/new)). Do not open a public issue for them. Feature requests and ordinary bugs go in [issues](https://github.com/NamNeto/SwitchCard/issues/new/choose); see [CONTRIBUTING.md](CONTRIBUTING.md).

If the preview and the file applied on a switch ever differ, or the app makes a network request, stop using it for production cards and report the case with the recipe (with placeholder values), the preview SHA-256 and the browser version.

MIT licensed. Not affiliated with Cisco.
