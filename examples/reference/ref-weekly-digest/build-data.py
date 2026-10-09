#!/usr/bin/env python3
"""Regenerate data.js for the weekly digest.

    python3 examples/reference/ref-weekly-digest/build-data.py [--week 2026-10-05] [--server https://artifacts.example]
    python3 examples/reference/ref-weekly-digest/build-data.py --anonymise --server-label "your server"   # shareable example

Collects, for the ISO week starting on --week (default: this week's Monday):
  - commits from `git log` in that week, with files and lines changed;
  - uncommitted work in the working tree (shown as "in progress");
  - artifacts and versions published on the artifact server that week (read-only API calls).
The narrative (headline, shipped / in progress / blocked / next) is hand-written in notes.js,
which this script never touches. Update notes.js after regenerating.

--anonymise drops commit hashes, author names and the HEAD hash (subjects, dates and line counts
stay), and --server-label replaces the server address shown on the page, for a digest you share
outside the team.
"""
import argparse, collections, datetime, json, os, subprocess, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], cwd=HERE, text=True).strip()

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True)

def area(path):
    parts = path.split("/")
    if parts[:2] == ["examples", "reference"] and len(parts) > 3:
        return "reference artifacts"
    return parts[0] if len(parts) > 1 else "(root)"

def get(url):
    with urllib.request.urlopen(url, timeout=20) as res:
        return json.load(res)

ap = argparse.ArgumentParser()
today = datetime.date.today()
ap.add_argument("--week", default=str(today - datetime.timedelta(days=today.weekday())), help="Monday of the week, YYYY-MM-DD")
ap.add_argument("--server", default=os.environ.get("ARTIFACT_SERVER_URL", "http://127.0.0.1:3000"))
ap.add_argument("--server-label", help="how the server is named on the page (default: its address)")
ap.add_argument("--anonymise", action="store_true", help="omit commit hashes, authors and the HEAD hash")
args = ap.parse_args()
start = datetime.date.fromisoformat(args.week)
end = start + datetime.timedelta(days=7)
iso_week = start.isocalendar()[1]

# Commits in the week
commits = []
cur = None
for line in git("log", "--numstat", "--date=iso-strict", f"--since={start}T00:00:00", f"--until={end}T00:00:00", "--format=@@%H|%ad|%an|%s").split("\n"):
    if line.startswith("@@"):
        sha, date, author, subject = line[2:].split("|", 3)
        cur = {"sha": sha[:7], "date": date, "author": author, "subject": subject, "files": 0, "added": 0, "removed": 0, "areas": collections.Counter()}
        commits.append(cur)
    elif line.strip() and cur:
        a, r, path = line.split("\t", 2)
        cur["files"] += 1
        n = (int(a) if a.isdigit() else 0) + (int(r) if r.isdigit() else 0)
        cur["added"] += int(a) if a.isdigit() else 0
        cur["removed"] += int(r) if r.isdigit() else 0
        cur["areas"][area(path)] += n
for c in commits:
    c["areas"] = dict(c["areas"])
    if args.anonymise:
        c.pop("sha"); c.pop("author")

# Uncommitted work: modified tracked files + new untracked files
wip = {"files": [], "added": 0, "removed": 0}
for line in git("diff", "--numstat", "HEAD").split("\n"):
    if line.strip():
        a, r, path = line.split("\t", 2)
        a, r = (int(a) if a.isdigit() else 0), (int(r) if r.isdigit() else 0)
        wip["files"].append({"path": path, "added": a, "removed": r, "status": "modified", "area": area(path)})
for path in git("ls-files", "--others", "--exclude-standard").split("\n"):
    if not path:
        continue
    full = os.path.join(ROOT, path)
    try:
        data = open(full, "rb").read()
    except OSError:
        continue
    lines = 0 if b"\0" in data[:8192] else data.count(b"\n")
    wip["files"].append({"path": path, "added": lines, "removed": 0, "status": "new", "area": area(path), "binary": b"\0" in data[:8192]})
wip["added"] = sum(f["added"] for f in wip["files"])
wip["removed"] = sum(f["removed"] for f in wip["files"])
by_area = collections.defaultdict(lambda: {"files": 0, "added": 0, "removed": 0, "new": 0})
for f in wip["files"]:
    b = by_area[f["area"]]; b["files"] += 1; b["added"] += f["added"]; b["removed"] += f["removed"]; b["new"] += f["status"] == "new"
wip["areas"] = dict(by_area)
del wip["files"]  # keep data.js small; areas are enough for the page

# Artifacts on the server
artifacts, versions = [], []
try:
    listing = get(args.server + "/api/v1/artifacts?limit=100")["artifacts"]
    for a in listing:
        hist = get(f"{args.server}/api/v1/artifacts/{a['slug']}/versions")["versions"]
        latest = get(f"{args.server}/api/v1/artifacts/{a['slug']}/versions/{a['latestVersion']}")
        in_week = [v for v in hist if start.isoformat() <= v["createdAt"][:10] < end.isoformat()]
        for v in in_week:
            versions.append({"slug": a["slug"], "version": v["version"], "createdAt": v["createdAt"], "message": v.get("message"), "new": v["version"] == 1})
        artifacts.append({
            "slug": a["slug"], "title": a["title"], "description": a.get("description", ""), "url": "/artifacts/" + a["slug"] + "/",
            "createdAt": a["createdAt"], "updatedAt": a["updatedAt"], "latestVersion": a["latestVersion"],
            "versionsThisWeek": len(in_week), "files": len(latest["files"]), "bytes": sum(f["size"] for f in latest["files"]),
        })
    server_ok = True
except Exception as error:  # the digest still renders from git alone
    print("Server unavailable:", error)
    server_ok = False

data = {
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "week": {"number": iso_week, "start": start.isoformat(), "end": (end - datetime.timedelta(days=1)).isoformat()},
    "repo": {**({} if args.anonymise else {"head": git("rev-parse", "--short", "HEAD").strip()}), "branch": git("rev-parse", "--abbrev-ref", "HEAD").strip()},
    "server": {"origin": args.server_label or args.server, "reachable": server_ok},
    "commits": commits, "wip": wip, "artifacts": artifacts, "versions": sorted(versions, key=lambda v: v["createdAt"]),
}
with open(os.path.join(HERE, "data.js"), "w", encoding="utf8") as out:
    out.write("/* Generated by build-data.py — do not edit by hand; re-run the script instead. */\n")
    out.write("window.DIGEST = " + json.dumps(data, indent=1, ensure_ascii=False) + ";\n")
print(f"Week {iso_week}: {len(commits)} commits, {len(versions)} versions on {len(artifacts)} artifacts, {wip['added']}+/{wip['removed']}- uncommitted")
