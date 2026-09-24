---
name: scene-summary
description: Send an episode's frames (a local video file, or every video in a folder) to Gemini and write its Description and numbered Scene Summary, in the same shape as the Pool's Description and Scene Summary columns. Use when asked for a scene summary, scene breakdown, episode description, or "what happens in this episode".
argument-hint: "<video file or folder> [cast list]"
allowed-tools: Bash, Read
---

# Scene summary

## What you need

- **ffmpeg** (includes `ffprobe`). Check with `ffmpeg -version`. Install: `brew install ffmpeg`
  (Mac), `sudo apt install ffmpeg` (Ubuntu), `winget install ffmpeg` (Windows).
- **Python 3.** Standard library only — nothing to `pip install`.
- **A Gemini API key** in `GEMINI_API_KEY`. Free from https://aistudio.google.com/apikey. If it is
  not set, ask the user for it and pass it on the command line as `GEMINI_API_KEY=... python3 ...`
  — never write it into a file.

It reads pictures only, not sound: sung words and dialogue are not transcribed.

## Steps

1. Collect the videos: the file given, or every `.mp4/.mov/.mkv/.webm` in the folder given.

2. Run, passing all of them at once:

   ```bash
   python3 "${CLAUDE_SKILL_DIR}/scripts/summarize.py" "<video>" ["<video>" ...] \
       --cast "Kent: the purple elephant kid; Tim: a pink monkey"
   ```

   `--cast` is optional but worth it: without it Gemini can only describe characters ("a pink
   monkey"), with it Gemini names them. Use the cast the user gives; never make one up.
   (`python` instead of `python3` on Windows.)

   Each video takes 20-60 seconds. It prints `OK <file>` or `FAIL <video>: <reason>` per video
   and writes `<video name>_scenes.md` next to the video: a Description (2-3 sentences) and a
   Scene Summary (numbered scenes, no timestamps).

3. For a `FAIL` that says Gemini blocked it or cut it off, re-run that one video with
   `--max-frames 40`.

4. Tell the user where the `.md` files are and which videos failed, if any.
