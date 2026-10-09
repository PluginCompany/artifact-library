# Intro video

`record.py` records the intro video (`docs/media/intro.mp4`, 3840×2160, 30 fps, about 2½ minutes) from a real server. Every page is the real UI inside a framed stage, and every terminal shows the real output of the command it types: the script runs each command against the server first and replays its output.

```bash
# 1. a fresh server seeded with the reference collection
npm run build:binary && npm run build:seed
DATA_DIR=$(mktemp -d) PORT=3000 SEED_DIR=$PWD/seed PUBLIC_BASE_URL=http://127.0.0.1:3000 npx tsx src/server.ts &

# 2. record (needs: artifact CLI on PATH, Python Playwright with Chromium, ffmpeg, Pillow)
python3 docs/video/record.py
python3 docs/video/record.py --only hook,review   # some segments, for iterating
SCALE=1 python3 docs/video/record.py              # 1920×1080 instead of 4K (faster)

# 3. README stills and the animated previews
python3 docs/video/screenshots.py
cd docs/media
ffmpeg -ss 0 -t 28 -i intro.mp4 -vf "scale=in_color_matrix=bt709:in_range=tv:out_range=pc,fps=12,scale=860:-1:flags=lanczos" \
  -c:v libwebp -quality 62 -compression_level 6 -loop 0 -an intro-teaser.webp
ffmpeg -ss 13.0 -t 13.2 -i intro.mp4 -vf "scale=in_color_matrix=bt709:in_range=tv:out_range=pc,fps=14,scale=900:-1:flags=lanczos" \
  -c:v libwebp -quality 64 -compression_level 6 -loop 0 -an answer.webp
```

The stage is laid out at 1920×1080 CSS pixels and rendered at `SCALE`× (default 2, so 4K). Takes are written to `~/.cache/artifact-intro/` (or `INTRO_WORK`): a 4K take holds about 10 GB of PNG frames while recording, so it stays off tmpfs, and the frames are deleted once the film is encoded.

| File | Role |
|---|---|
| `record.py` | Demo content, the segments, camera moves and the final encode plus poster |
| `stage.html` | The stage: browser window (an iframe of the real server), agent terminal, captions, chapter rail, cards, zoom and an eased cursor |
| `screencast.py` | Captures PNG frames at device resolution through the DevTools screencast, resamples them to a constant 30 fps and encodes BT.709 H.264 |
| `screenshots.py` | README screenshots (`docs/media/*.webp`) |
| `terminal.html` | The terminal used for the `feedback` screenshot |

Segments: **hook** (the first 30 seconds: Claude Code publishes a plan, you click an answer, Codex reads it, one library for every agent) · **plan** · **build** (live run log, a blocker answered on the page) · **review** (findings, a comment thread, a verdict per chapter) · **report** · **share** (versions, the hub, skill and MCP setup) · **end**.

GitHub only plays videos inline in a README when they are uploaded through the web editor, so the README shows the animated `intro-teaser.webp` and links to the mp4.
