# Contributing

SwitchCard is maintained as a public good: free to use, study and fork under the MIT licence. Changes to this repository come only from the maintainer.

## Feature requests and bug reports are welcome

Open an [issue](https://github.com/NamNeto/SwitchCard/issues/new/choose) with one of the templates and describe what you need or what went wrong.

- **Never paste real configurations**, credentials, SNMP communities, hostnames, addresses or site names. Use placeholders such as `EXAMPLE-SW1` and addresses from 192.0.2.0/24, 198.51.100.0/24 or 203.0.113.0/24.
- Do not attach firmware, baselines, team packages or project files.
- Security problems are reported privately, not in an issue; see [SECURITY.md](SECURITY.md).

## Pull requests are proposals

Pull requests from outside the project are read as proposals and are not merged as submitted. The maintainer decides whether an idea fits, then implements and tests accepted changes in the maintainer's own commits. A tool that writes switch configurations has to stay reviewable line by line, so rewrites, new dependencies, network access and changes to the security model are not accepted.

If you want SwitchCard to work differently, fork it; the MIT licence allows that. Please make clear that a fork is not the official SwitchCard, so users can still tell which file matches the published release hashes.

## What makes a good request

- The switch models, IOS XE release and EEM workflow you use (placeholder values only).
- What SwitchCard does today and what you expected instead.
- For output changes, the exact `editcontent.txt` lines you expect, with placeholders.
- The SwitchCard version from the page header and your browser.
