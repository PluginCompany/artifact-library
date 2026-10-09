# Intro video

`record.py` records the intro video (`docs/media/intro.mp4`, 1920×1080, 30 fps) from a real server. Every page is the real UI and every terminal shows the real output of the command it types: the script runs each command against the server first and replays its output.

```bash
# 1. a fresh server seeded with the reference collection
npm run build:binary && npm run build:seed
DATA_DIR=$(mktemp -d) PORT=3000 SEED_DIR=$PWD/seed PUBLIC_BASE_URL=http://127.0.0.1:3000 npx tsx src/server.ts &

# 2. record (needs: artifact CLI on PATH, Python Playwright with Chromium, ffmpeg)
python3 docs/video/record.py
python3 docs/video/record.py --scenes library,review   # re-record some scenes
```

| File | Role |
|---|---|
| `record.py` | Scenes, demo content and the final cut with crossfades |
| `screencast.py` | Captures frames through the DevTools screencast and encodes constant-rate H.264 |
| `overlay.js` | Cursor, click ripples, captions and eased scrolling injected into every page |
| `terminal.html` | The terminal scenes |
| `card.html` | Title and end cards |

Scenes: title · publish · library · review · questions · feedback · reply · live run log · versions · reference collection · agents · end.
