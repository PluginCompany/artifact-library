#!/usr/bin/env python3
"""Measure tests and performance of the artifact service and write data.js.

    python3 examples/reference/ref-test-report/measure.py

Runs from the repository root, starts its own throwaway server on PORT (never the
live one), and uses the installed `artifact` CLI for publish timings.
Budgets live in BUDGETS below; the page shows pass/fail against them."""
import json, os, re, shutil, signal, statistics, subprocess, sys, tempfile, time, datetime, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = pathlib.Path(__file__).with_name("data.js")
PORT = int(os.environ.get("PORT", "3199"))
BASE = f"http://127.0.0.1:{PORT}"
RUNS = 5

BUDGETS = {  # id: (label, limit, unit, lower_is_better)
    "suite":        ("Full test suite", 30, "s", True),
    "check":        ("Type check", 20, "s", True),
    "coldStart":    ("Server cold start (tsx)", 5, "s", True),
    "publishBig":   ("Publish one 5 MB file", 3, "s", True),
    "publishMany":  ("Publish 50 small files", 2, "s", True),
    "dataPutP95":   ("Data PUT p95", 50, "ms", True),
    "dataGetP95":   ("Data GET p95", 25, "ms", True),
    "binary":       ("CLI binary size", 100, "MB", True),
    "image":        ("Server image size (full)", 1500, "MB", True),
    "imageSlim":    ("Server image size (slim)", 400, "MB", True),
}


def sh(cmd, **kw):
    t = time.perf_counter()
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, **kw)
    return p, time.perf_counter() - t


def parse_tap(text):
    tests, current = [], None
    for line in text.splitlines():
        m = re.match(r"^(not ok|ok) \d+ - (.*)$", line)
        if m:
            current = {"name": m.group(2).strip(), "status": "pass" if m.group(1) == "ok" else "fail", "ms": None}
            tests.append(current)
            continue
        m = re.match(r"^\s+duration_ms: ([\d.]+)", line)
        if m and current and current["ms"] is None:
            current["ms"] = round(float(m.group(1)))
    return tests


def run_tests():
    sh(["node", "scripts/embed-skill.mjs"]); sh(["node", "scripts/embed-media.mjs"])
    files = sorted(p.name for p in (ROOT / "tests").glob("*.test.ts"))
    result, total = [], 0.0
    for name in files:
        p, secs = sh(["npx", "tsx", "--test", "--test-reporter=tap", f"tests/{name}"])
        total += secs
        src = (ROOT / "tests" / name).read_text()
        result.append({"file": f"tests/{name}", "seconds": round(secs, 2), "assertions": len(re.findall(r"\bassert\.\w+\(", src)),
                       "tests": parse_tap(p.stdout), "exit": p.returncode})
    return result, round(total, 2)


def wait_ok(url, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=1) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.05)
    return False


def start_server(data_dir):
    env = {**os.environ, "DATA_DIR": data_dir, "PORT": str(PORT), "SEED": "false", "PREVIEWS": "false", "PUBLIC_BASE_URL": BASE, "LOG_LEVEL": "error"}
    t = time.perf_counter()
    proc = subprocess.Popen(["npx", "tsx", "src/server.ts"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    ok = wait_ok(BASE + "/healthz")
    return proc, time.perf_counter() - t, ok


def stop(proc):
    try: os.killpg(proc.pid, signal.SIGTERM); proc.wait(10)
    except Exception: pass


def request(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"} if data else {})
    t = time.perf_counter()
    with urllib.request.urlopen(req) as r:
        r.read()
    return (time.perf_counter() - t) * 1000


def pct(values, p):
    values = sorted(values)
    return round(values[min(len(values) - 1, int(round(p / 100 * (len(values) - 1))))], 1)


def main():
    out = {"generatedAt": datetime.datetime.now().astimezone().isoformat(timespec="minutes"),
           # The package version, not a commit hash: the report stays meaningful in forks and fresh clones.
           "version": json.loads((ROOT / "package.json").read_text())["version"],
           "dirty": bool(subprocess.run(["git", "status", "--porcelain", "src", "tests"], cwd=ROOT, capture_output=True, text=True).stdout.strip()),
           "node": subprocess.run(["node", "--version"], capture_output=True, text=True).stdout.strip(),
           "runs": RUNS}
    print("tests…", flush=True)
    out["testFiles"], out["suiteSeconds"] = run_tests()
    print("type check…", flush=True)
    p, secs = sh(["npx", "tsc", "--noEmit"])
    out["check"] = {"seconds": round(secs, 2), "ok": p.returncode == 0, "errors": len(re.findall(r"error TS\d+", p.stdout + p.stderr))}

    print("cold starts…", flush=True)
    starts = []
    for _ in range(RUNS):
        d = tempfile.mkdtemp(prefix="artifact-measure-")
        proc, secs, ok = start_server(d)
        stop(proc); shutil.rmtree(d, ignore_errors=True)
        if ok: starts.append(round(secs, 2))
    out["coldStart"] = starts

    data_dir = tempfile.mkdtemp(prefix="artifact-measure-")
    proc, _, ok = start_server(data_dir)
    if not ok: sys.exit("server did not start")
    # Prefer the CLI built from this tree (npm run build:binary); fall back to the one on PATH.
    built = ROOT / "release" / "artifact-linux-x64"
    cli = os.environ.get("ARTIFACT_CLI") or (str(built) if built.exists() else shutil.which("artifact"))
    env = {**os.environ, "ARTIFACT_SERVER_URL": BASE, "ARTIFACT_CONFIG_DIR": tempfile.mkdtemp(), "ARTIFACT_STATE_DIR": tempfile.mkdtemp()}
    cli_version = subprocess.run([cli, "--version"], capture_output=True, text=True).stdout.strip()
    work = pathlib.Path(tempfile.mkdtemp(prefix="artifact-payload-"))
    big, many = work / "big", work / "many"
    big.mkdir(); many.mkdir()
    (big / "index.html").write_text("<!doctype html><title>Big</title>")
    (big / "blob.bin").write_bytes(os.urandom(5 * 1024 * 1024))
    for i in range(50):
        (many / ("index.html" if i == 0 else f"page-{i}.html")).write_text(f"<!doctype html><title>Page {i}</title><p>{'x' * 2000}</p>")
    timings = {"publishBig": [], "publishMany": []}
    print("publishes…", flush=True)
    for i in range(RUNS):
        for key, folder in (("publishBig", big), ("publishMany", many)):
            t = time.perf_counter()
            r = subprocess.run([cli, "publish", str(folder), "--slug", f"{key.lower()}-{i}", "--json"], env=env, capture_output=True, text=True)
            if r.returncode == 0:
                timings[key].append(round(time.perf_counter() - t, 2))
    out.update(timings)
    out["cliVersion"] = cli_version

    print("data API…", flush=True)
    puts, gets = [], []
    for i in range(100):
        puts.append(request("PUT", f"/api/v1/artifacts/publishmany-0/data/answer.q{i % 10}", {"value": {"choice": "b", "note": "x" * 200}}))
        gets.append(request("GET", f"/api/v1/artifacts/publishmany-0/data/answer.q{i % 10}"))
    out["data"] = {"put": [round(v, 2) for v in puts], "get": [round(v, 2) for v in gets],
                   "putP50": pct(puts, 50), "putP95": pct(puts, 95), "getP50": pct(gets, 50), "getP95": pct(gets, 95)}
    stop(proc); shutil.rmtree(data_dir, ignore_errors=True); shutil.rmtree(work, ignore_errors=True)

    binary = ROOT / "release" / "artifact-linux-x64"
    out["binary"] = {"bytes": binary.stat().st_size if binary.exists() else None,
                     "version": subprocess.run([str(binary), "--version"], capture_output=True, text=True).stdout.strip() if binary.exists() else None}
    # IMAGES: comma-separated image references; the first is the full image, a ref containing "slim" the slim one.
    out["images"] = []
    for ref in [r.strip() for r in os.environ.get("IMAGES", "artifact-library:main,artifact-library:main-slim").split(",") if r.strip()]:
        p, _ = sh(["docker", "image", "ls", "--format", "{{.Repository}}:{{.Tag}}\t{{.Size}}", ref])
        line = next((l for l in p.stdout.splitlines() if l.strip()), None)
        if line:
            name, size = line.split("\t")
            out["images"].append({"ref": name, "size": size, "variant": "slim" if "slim" in name else "full"})
    out["budgets"] = {k: {"label": v[0], "limit": v[1], "unit": v[2]} for k, v in BUDGETS.items()}
    OUT.write_text("/* Generated by measure.py — do not edit by hand. Re-run it to refresh. */\nwindow.REPORT = " + json.dumps(out, indent=1) + ";\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
