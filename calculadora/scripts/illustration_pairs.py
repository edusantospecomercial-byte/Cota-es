"""Read matching insurer PDF pairs from loose folders and original ZIP archives."""

import argparse
import csv
import hashlib
from itertools import chain
from pathlib import Path
import subprocess
import sys
import zipfile


def pairs(paths, folder):
    folders = {name.lower() for name in ((folder,) if isinstance(folder, str) else folder)}
    for path in paths:
        if path.suffix.lower() == ".zip":
            with zipfile.ZipFile(path) as archive:
                names = {n.replace("\\", "/"): n for n in archive.namelist()}
                for standard_name, original in names.items():
                    components = standard_name.lower().split("/")
                    if len(components) < 2 or components[-2] not in folders or components[-1] != "illustration.pdf":
                        continue
                    report = standard_name.rsplit("/", 1)[0] + "/Comparison Report - without commission.pdf"
                    if report in names:
                        yield archive.read(original), archive.read(names[report])
        elif path.parent.name.lower() in folders:
            report = path.with_name("Comparison Report - without commission.pdf")
            if report.exists():
                yield path.read_bytes(), report.read_bytes()


def illustration_files(roots):
    found = subprocess.run(["rg","--files","--hidden","--no-ignore","-0","-g","!**/.git/**",
                            "-g","!**/node_modules/**","--iglob","*supporting*document*.zip",
                            "--iglob","Illustration.pdf",*roots],capture_output=True)
    if found.returncode not in (0,1):
        raise SystemExit(found.stderr.decode())
    return sorted(Path(p) for p in found.stdout.decode().split("\0") if p)


def extract_pairs(folder, fields, read_pair, description, roots=None):
    explicit_pairs = []
    if roots is None:
        parser = argparse.ArgumentParser(description=description)
        parser.add_argument("roots", nargs="*", type=Path)
        parser.add_argument("--pair", nargs=2, action="append", type=Path, default=[],
                            metavar=("ILLUSTRATION", "COMPARISON"), help="Read an explicitly matched pair of PDFs")
        args = parser.parse_args()
        if not args.roots and not args.pair:
            parser.error("provide a search folder or --pair ILLUSTRATION COMPARISON")
        roots, explicit_pairs = args.roots, args.pair
    files = illustration_files(roots) if roots else []
    supplied = ((illustration.read_bytes(), comparison.read_bytes()) for illustration, comparison in explicit_pairs)
    seen, rows = set(), {}
    for illustration, comparison in chain(pairs(files, folder), supplied):
        digest = (hashlib.sha256(illustration).digest(),hashlib.sha256(comparison).digest())
        if digest in seen:
            continue
        seen.add(digest)
        row = read_pair(illustration, comparison)
        if row:
            key = row[8]
            if key in rows and row[:-2] != rows[key][:-2]:
                raise ValueError(f"Conflicting documents for reference {key}")
            if key not in rows or row[-2:] < rows[key][-2:]:
                rows[key] = row
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(fields)
    writer.writerows(sorted(rows.values()))
    print(f"{len(seen)} unique {folder} document pairs inspected, {len(rows)} reconciled.",file=sys.stderr)
