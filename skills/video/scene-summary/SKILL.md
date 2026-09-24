---
name: scene-summary
description: Watch an episode (a local video file, or every video in a folder) frame by frame and write a timestamped, scene-by-scene summary of what happens on screen. Use when asked for a scene summary, scene breakdown, "what happens in this episode", or a frame-by-frame description of a video.
argument-hint: "<video file or folder>"
allowed-tools: Bash, Read, Write
---

# Scene summary

## What you need

- **ffmpeg** (includes `ffprobe`). Check with `ffmpeg -version`. Install: `brew install ffmpeg`
  (Mac), `sudo apt install ffmpeg` (Ubuntu), `winget install ffmpeg` (Windows).
- **Python 3.** Standard library only — nothing to `pip install`.
- **No API key.** Claude looks at the frames itself; nothing is sent anywhere else.

It reads pictures only, not sound: dialogue and lyrics are not transcribed.

## Steps

1. For each video (every `.mp4/.mov/.mkv/.webm` in the folder, if given a folder), run:

   ```bash
   python3 "${CLAUDE_SKILL_DIR}/scripts/frames.py" "<video>"
   ```

   It prints the duration and a list of contact sheets. Each sheet is a 4x4 grid read left to
   right, top to bottom, and every frame carries its timestamp in the top-left corner.
   (`python` instead of `python3` on Windows. `--every 1` for denser frames on a short clip.)

2. Read every sheet in order. Group consecutive frames into scenes: a new scene starts when the
   location, the characters on screen, or the action clearly changes.

3. Write `<video name>_scenes.md` next to the video:

   ```markdown
   # <video name>
   Length: <m:ss> · <n> scenes

   1. **0:00–0:06** — <what happens: who is on screen, where, doing what>
   2. **0:06–0:14** — ...

   **Summary:** <two or three sentences on the whole episode>
   ```

   Describe only what is visible. Name a character only if a name appears on screen or the
   user supplied it; otherwise describe them ("a girl in a pink dress"). Any text on screen
   (titles, signs) goes in quotes.

4. Delete the `<video name>_frames` folder when done, and tell the user where the `.md` file is.
