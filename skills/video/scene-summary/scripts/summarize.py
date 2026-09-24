#!/usr/bin/env python3
"""Send an episode's frames to Gemini and get back its Description and Scene Summary.

    python3 summarize.py <video> [<video> ...] [--cast "Kent: a purple elephant; ..."]
                         [--max-frames 80] [--model gemini-2.5-flash]

Writes <video name>_scenes.md next to each video. Needs ffmpeg + ffprobe and GEMINI_API_KEY.
Same engine and model as the pool fill (add-pool-content step 4): gemini-2.5-flash, thinking off.
"""
import argparse, base64, glob, json, os, subprocess, sys, tempfile, time, urllib.error, urllib.request

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

PROMPT = """These are {n} frames sampled in order from ONE video titled {title!r}, one every \
{every:.0f} seconds. Frame 1 is the start, frame {n} the end.
{cast}
Reply with ONE JSON object with two keys:
- "description": 2-3 plain factual sentences on what happens in the video: premise, who appears, \
setting, how it ends. Written for someone choosing whether to put it in a compilation. No hype \
words, no hashtags, no emoji.
- "scene_summary": a list of strings, one per visual scene IN ORDER, typically 4-8, each saying \
concretely who is on screen, what they do, and where. No timestamps.

Describe only what the frames show. Name a character only when the cast list above names them or \
a name appears on screen; otherwise describe them the same way every time. Quote on-screen text \
exactly. Ignore the opening title card and the closing logo / subscribe card — they are branding, \
not story."""


def duration(video):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "json", video], capture_output=True, text=True, check=True)
    return float(json.loads(out.stdout)["format"]["duration"])


def frames(video, max_frames, tmp):
    every = max(1.0, duration(video) / max_frames)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-vf",
                    f"fps=1/{every},scale=512:-2", "-q:v", "5",
                    os.path.join(tmp, "f_%04d.jpg")], check=True)
    return sorted(glob.glob(os.path.join(tmp, "f_*.jpg"))), every


def ask_gemini(key, model, prompt, paths):
    parts = [{"text": prompt}] + [
        {"inline_data": {"mime_type": "image/jpeg",
                         "data": base64.b64encode(open(p, "rb").read()).decode()}} for p in paths]
    body = json.dumps({
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "maxOutputTokens": 8192,
            # Off, as the pool fill measured it; on a thinking model the reasoning eats this
            # budget and the reply comes back cut off mid-JSON.
            "thinkingConfig": {"thinkingBudget": 0},
        }}).encode()
    req = urllib.request.Request(ENDPOINT.format(model=model), data=body, headers={
        "Content-Type": "application/json", "x-goog-api-key": key})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                reply = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                time.sleep(5 * 2 ** attempt)   # Gemini sheds load with 503/429; back off
                continue
            raise SystemExit(f"Gemini refused the request ({e.code}): {e.read().decode()[:300]}")
    cands = reply.get("candidates") or []
    if not cands or "content" not in cands[0]:
        why = (reply.get("promptFeedback") or {}).get("blockReason") or \
              (cands[0].get("finishReason") if cands else "no reply")
        raise RuntimeError(f"Gemini blocked it ({why}) — try again with --max-frames 40")
    if cands[0].get("finishReason") == "MAX_TOKENS":
        raise RuntimeError("Gemini's reply was cut off — try again with --max-frames 40")
    return json.loads("".join(p.get("text", "") for p in cands[0]["content"]["parts"]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("videos", nargs="+")
    ap.add_argument("--cast", default="", help="who is who, e.g. 'Kent: a purple elephant; ...'")
    ap.add_argument("--max-frames", type=int, default=80)
    ap.add_argument("--model", default="gemini-2.5-flash")
    a = ap.parse_args()

    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        sys.exit("GEMINI_API_KEY is not set — get a key at https://aistudio.google.com/apikey")
    cast = f"\nThe cast: {a.cast}\n" if a.cast else ""

    failed = 0
    for video in a.videos:
        title = os.path.splitext(os.path.basename(video))[0]
        try:
            with tempfile.TemporaryDirectory() as tmp:
                paths, every = frames(video, a.max_frames, tmp)
                out = ask_gemini(key, a.model, PROMPT.format(
                    n=len(paths), title=title, every=every, cast=cast), paths)
            scenes = "\n".join(f"{i}. {s}" for i, s in enumerate(out["scene_summary"], 1))
            md = os.path.splitext(video)[0] + "_scenes.md"
            with open(md, "w") as f:
                f.write(f"# {title}\n\n## Description\n\n{out['description']}\n\n"
                        f"## Scene Summary\n\n{scenes}\n")
            print(f"OK    {md}")
        except Exception as e:  # one bad video must not stop the rest of the folder
            failed += 1
            print(f"FAIL  {video}: {e}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
