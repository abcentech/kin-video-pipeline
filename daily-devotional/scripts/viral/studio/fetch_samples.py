"""Download the KIN sound studio's instrument library (CC0 only).

    studio/.venv/Scripts/python.exe -I scripts/viral/studio/fetch_samples.py

Two public-domain (CC0) orchestral libraries by Versilian Studios, fetched
file-by-file from GitHub so only the instruments the score uses come down
(~1.1 GB, not the full 6 GB):
  VSCO 2 Community Edition  https://github.com/sgossner/VSCO-2-CE
  VCSL                      https://github.com/sgossner/VCSL
Files land in studio/samples/<lib>/<original path>. Re-running skips what is there.
"""
import concurrent.futures as cf
import json
import sys
import urllib.parse
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[3] / "studio" / "samples"
LIBS = {
    "vsco2": ("sgossner/VSCO-2-CE", "master", [
        "Strings/Violin Section/susVib/",
        "Strings/Violin Section/Trem/",
        "Strings/Viola Section/susvib/",
        "Strings/Cello Section/susvib/",
        "Strings/Cello Section/trem/",
        "Strings/Cello Section/spic/",
        "Strings/Solo Contrabass/SusVib/",
        "Brass/F Horn/sus/",
        "Brass/Tenor Trombone/sus/",
        "Brass/Tuba/sus/",
        "Percussion/Timpani/",
        "Strings/Harp/",
        "Percussion/BDrumNewhit",
        "Percussion/susCymb1-cresc",
        "Percussion/gongHit",
        "Percussion/cymbal-crash1",
        "Percussion/BellTree",
        "VSCO 1 Percussion/varMetal/Gong/gong_hit_ff.wav",
        "VSCO 1 Percussion/varMetal/Gong/gong_hit_fff.wav",
        "VSCO 1 Percussion/varMetal/Gong/gong_hit_mf.wav",
        "VSCO 1 Percussion/varMetal/Gong/gong_hit_p.wav",
        "VSCO 1 Percussion/varMetal/Gong/gong_roll_medium_f.wav",
        "VSCO 1 Percussion/varMetal/Cymbals/susp/susp_hit_softmall_roll2_cresc.wav",
        "VSCO 1 Percussion/varMetal/Cymbals/susp/susp_hit_woodmall_roll_cresc.wav",
        "VSCO 1 Percussion/varMetal/Cymbals/susp/susp_FX_scrape_1.wav",
        "VSCO 1 Percussion/drums/bass/bdrum_fff_1.wav",
        "VSCO 1 Percussion/drums/bass/bdrum_ff_1.wav",
        "VSCO 1 Percussion/drums/bass/bdrum_f_1.wav",
        "VSCO 1 Percussion/drums/bass/bdrum_mp_1.wav",
        "VSCO 1 Percussion/drums/bass/bdrum_roll_long1.wav",
        "LICENSE",
    ]),
    "vcsl": ("sgossner/VCSL", "master", [
        "Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_",  # filtered to v1/v2 below
        "Idiophones/Struck Idiophones/Tubular Bells 1/",
        "Idiophones/Struck Idiophones/Mark Trees/",
        "Idiophones/Friction Idiophones/Wine Glasses/Sustains/",
        "Membranophones/Struck Membranophones/Bass Drum 2/",
        "Idiophones/Struck Idiophones/Suspended Cymbal 1/",
        "Idiophones/Struck Idiophones/Gong 1/",
        "Idiophones/Struck Idiophones/Glockenspiel/",
        "Idiophones/Struck Idiophones/Hand Chimes/",
        "LICENSE",
    ]),
}


def want(lib, path, prefixes):
    if not any(path.startswith(p) for p in prefixes):
        return False
    if not path.lower().endswith((".wav", "license")):
        return False
    if lib == "vcsl" and "Grand Piano, Kawai" in path:
        return "_v1_" in path or "_v2_" in path
    return True


def main():
    jobs = []
    for lib, (repo, branch, prefixes) in LIBS.items():
        tree = requests.get(f"https://api.github.com/repos/{repo}/git/trees/{branch}?recursive=1", timeout=120).json()
        for e in tree["tree"]:
            if e["type"] == "blob" and want(lib, e["path"], prefixes):
                jobs.append((lib, repo, branch, e["path"], e["size"]))
    total = sum(j[4] for j in jobs)
    print(f"{len(jobs)} files, {total / 1e6:.0f} MB", flush=True)

    def get(job):
        lib, repo, branch, path, size = job
        dst = ROOT / lib / path
        if dst.exists() and dst.stat().st_size == size:
            return 0
        dst.parent.mkdir(parents=True, exist_ok=True)
        url = f"https://raw.githubusercontent.com/{repo}/{branch}/" + urllib.parse.quote(path)
        for attempt in range(4):
            try:
                r = requests.get(url, timeout=300)
                r.raise_for_status()
                if len(r.content) != size:
                    raise IOError(f"size {len(r.content)} != {size}")
                tmp = dst.with_suffix(dst.suffix + ".part")
                tmp.write_bytes(r.content)
                tmp.replace(dst)
                return size
            except Exception as ex:  # noqa: BLE001
                err = ex
        print("FAILED", path, err, flush=True)
        return 0

    done = 0
    with cf.ThreadPoolExecutor(8) as ex:
        for i, n in enumerate(ex.map(get, jobs)):
            done += n
            if i % 25 == 0:
                print(f"{i + 1}/{len(jobs)}  {done / 1e6:.0f} MB", flush=True)
    (ROOT / "manifest.json").write_text(json.dumps([{"lib": j[0], "path": j[3], "bytes": j[4]} for j in jobs], indent=0), encoding="utf-8")
    print("FETCH_DONE", flush=True)


if __name__ == "__main__":
    sys.exit(main())
