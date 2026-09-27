#!/usr/bin/env python3
"""Assemble the single-file SwitchCard.html from the src/ tree. No dependencies (Python 3.8+).

    python build.py           write SwitchCard.html and print its SHA-256
    python build.py --check   exit 1 when the committed SwitchCard.html differs from the build

Layout:
    src/index.html   HTML shell; the lines "@@STYLES@@" and "@@SCRIPT@@" are replaced
    src/styles.css   the one <style> block, unindented
    src/js/NN-*.js   the one <script> block, unindented, concatenated in file-name order

Every non-empty CSS/JS line is re-indented by six spaces so the output stays readable when
someone opens SwitchCard.html directly. The shipped file is the build output and is committed;
CI runs --check so the two can never drift apart.
"""
import hashlib
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "SwitchCard.html"
INDENT = "      "


def read(path):
    return path.read_bytes().decode("utf-8")


def indented(text):
    return "".join((INDENT + ln) if ln.strip() else ln for ln in text.splitlines(keepends=True))


def build():
    template = read(SRC / "index.html")
    css = indented(read(SRC / "styles.css"))
    parts = sorted((SRC / "js").glob("*.js"))
    if not parts:
        raise SystemExit("build: no src/js/*.js files found")
    js = indented("".join(read(p) for p in parts))
    for marker in ("@@STYLES@@\n", "@@SCRIPT@@\n"):
        if template.count(marker) != 1:
            raise SystemExit("build: marker %r must appear exactly once in src/index.html" % marker)
    out = template.replace("@@STYLES@@\n", css, 1).replace("@@SCRIPT@@\n", js, 1)
    if "@@" in out:
        raise SystemExit("build: unreplaced marker in output")
    return out.encode("utf-8")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def main(argv):
    data = build()
    if "--check" in argv:
        current = OUT.read_bytes() if OUT.exists() else b""
        if current == data:
            print("build: SwitchCard.html is up to date (sha256 %s)" % sha256(data))
            return 0
        print("build: SwitchCard.html differs from the src/ build (committed %s, build %s). Run: python build.py"
              % (sha256(current)[:16], sha256(data)[:16]))
        return 1
    OUT.write_bytes(data)
    print("build: wrote %s (%d bytes, sha256 %s)" % (OUT.name, len(data), sha256(data)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
