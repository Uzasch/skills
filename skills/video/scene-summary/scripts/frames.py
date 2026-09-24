#!/usr/bin/env python3
"""Turn one video into timestamped contact sheets Claude can look at.

    python3 frames.py <video> [--out DIR] [--every SECONDS]

Writes DIR/sheet_001.jpg, sheet_002.jpg, ... — each a 4x4 grid of frames, read left to right,
top to bottom, every frame stamped with its time in the episode. Needs only ffmpeg + ffprobe.
"""
import argparse, glob, json, os, subprocess, sys

GRID = 4                 # 4x4 = 16 frames per sheet
MAX_SHEETS = 24          # ponytail: fixed cap keeps a long episode affordable; raise --every instead


def duration(video):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "json", video], capture_output=True, text=True, check=True)
    return float(json.loads(out.stdout)["format"]["duration"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--out", help="output folder (default: <video name>_frames next to it)")
    ap.add_argument("--every", type=float, help="seconds between frames (default: auto, min 2)")
    a = ap.parse_args()

    if not os.path.isfile(a.video):
        sys.exit(f"no such file: {a.video}")
    secs = duration(a.video)
    every = a.every or max(2.0, secs / (GRID * GRID * MAX_SHEETS))
    out = a.out or os.path.splitext(a.video)[0] + "_frames"
    os.makedirs(out, exist_ok=True)
    for old in glob.glob(os.path.join(out, "sheet_*.jpg")):
        os.remove(old)

    stamp = ("drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=22:fontcolor=white"
             ":box=1:boxcolor=black@0.6:boxborderw=4")
    vf = f"fps=1/{every},scale=384:-2,{stamp},tile={GRID}x{GRID}:padding=4:color=white"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.video, "-vf", vf, "-q:v", "4",
                    os.path.join(out, "sheet_%03d.jpg")], check=True)

    sheets = sorted(glob.glob(os.path.join(out, "sheet_*.jpg")))
    print(f"VIDEO={a.video}")
    print(f"DURATION={secs / 60:.1f} min  FRAME_EVERY={every:.1f}s  SHEETS={len(sheets)}")
    for s in sheets:
        print(s)


if __name__ == "__main__":
    main()
