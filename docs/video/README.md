# Intro video

`record.py` records the intro video (`docs/media/intro.mp4`, 3840×2160, 60 fps, about 2½ minutes) from a real server. Every page is the real UI inside a framed stage, and every terminal shows the real output of the command it types: the script runs each command against the server first and replays its output.

```bash
# 1. a fresh server seeded with the reference collection
npm run build:binary && npm run build:seed
DATA_DIR=$(mktemp -d) PORT=3000 SEED_DIR=$PWD/seed PUBLIC_BASE_URL=http://127.0.0.1:3000 npx tsx src/server.ts &

# 2. record (needs: artifact CLI on PATH, Python Playwright with Chromium, ffmpeg, Pillow, OBS Studio)
python3 docs/video/record.py
python3 docs/video/record.py --only hook,review   # some segments, for iterating
FILM_SCREEN=0,0 python3 docs/video/record.py      # where the 3840×2160 monitor sits in the desktop layout
CAPTURE=devtools python3 docs/video/record.py     # no monitor: headless, DevTools screencast in slow motion

# 3. README stills and the answer clip
python3 docs/video/screenshots.py
cd docs/media
ffmpeg -ss 11.9 -t 14.7 -i intro.mp4 -vf "scale=in_color_matrix=bt709:in_range=tv:out_range=pc,fps=20,scale=1280:-1:flags=lanczos" \
  -c:v libwebp -quality 80 -compression_level 6 -loop 0 -an answer.webp
```

### How it is captured

The film is recorded like a screencast by a person, only scripted: Chromium runs fullscreen (kiosk) on a real landscape 3840×2160 monitor, rendered on the GPU and composited by the desktop with vsync, and **OBS** records that monitor in real time at 60 fps (hardware HEVC, near-lossless, into `~/.cache/artifact-intro/obs/`). A magenta frame before and after the film marks where `record.py` cuts the take; the final encode is H.264 at `CRF` 19 (veryslow, aq-mode 3 against blocking in dark gradients), BT.709 limited range, no audio. The monitor is busy for about three minutes; don't move the pointer onto it.

One-time OBS setup: `record.py` uses its own OBS profile and scene collection, both called `ArtifactIntro` (3840×2160, 60 fps, BT.709, `hevc_ffmpeg_vaapi_tex` at QP 16, mkv; one "Screen Capture (PipeWire)" source with the cursor hidden). Run `obs --profile ArtifactIntro --collection ArtifactIntro --scene Intro --multi` once, choose the film monitor in the screen-share dialog with "allow restoring", and close OBS. `record.py` starts and stops OBS itself and puts your default OBS profile back afterwards.

The stage is laid out at 1920×1080 CSS pixels and zoomed by `SCALE` (default 2), so every pixel of the 4K frame is real. It is served from the server's own origin (`/__stage/`, intercepted by Playwright), which keeps the iframe in-process: camera moves scale finished rasters instead of re-laying out text every frame, so text doesn't wobble while zooming.

Why not something simpler: the DevTools screencast (`CAPTURE=devtools`) gives whole frames but only ~11 per second at 4K, so that mode runs the stage `SLOW`× slower (page clocks, CSS and Web Animations) and compresses time back; it needs ~10 GB of PNGs and 20+ minutes. Grabbing a virtual X screen (Xvfb) is fast but tears, and grabbing XWayland returns black.

| File | Role |
|---|---|
| `record.py` | Demo content, the segments, camera moves and the final encode plus poster |
| `stage.html` | The stage: browser window (an iframe of the real server), agent terminal, captions, chapter rail, cards, zoom and an eased cursor |
| `screencast.py` | The OBS recorder and marker detection; the DevTools screencast recorder for `CAPTURE=devtools` |
| `screenshots.py` | README screenshots (`docs/media/*.webp`) |
| `terminal.html` | The terminal used for the `feedback` screenshot |

Segments: **hook** (the first 30 seconds: Claude Code publishes a plan, you click an answer, Codex reads it, one library for every agent) · **plan** · **build** (live run log, a blocker answered on the page) · **review** (findings, a comment thread, a verdict per chapter) · **report** · **share** (versions, the hub, skill and MCP setup) · **end**.

### Publishing the film

The film is not stored in git (it is about 110 MB at 4K60). It is attached to the release and the README links to it:

```bash
# cut the OBS master between the markers, with the fade, into a lossless intermediate
ffmpeg -ss <start> -to <end> -i ~/.cache/artifact-intro/obs/<take>.mkv -an \
  -vf "fade=t=in:st=0:d=0.6,format=yuv420p" -r 60 -c:v libx264 -preset ultrafast -qp 0 master.mkv
# encode for publishing (HandBrake's "Creator 2160p60 4K"; keep the dark stage edges)
flatpak run --command=HandBrakeCLI fr.handbrake.ghb -i master.mkv -o artifact-library-intro-4k60.mp4 \
  --preset "Creator 2160p60 4K" --crop-mode none --optimize
gh release upload v0.4.0 artifact-library-intro-4k60.mp4 --clobber
```

`find_markers()` in `screencast.py` prints `<start>` and `<end>` for a take. The README embeds a 1080p version that fits GitHub's 10 MB attachment limit (Free plan) and links to the 4K release asset. GitHub only plays a README video when the file is uploaded through the web editor, which returns a `https://github.com/user-attachments/assets/…` link; there is no API for that upload, so it is a manual step:

```bash
ffmpeg -i master.mkv -an -vf "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p" -c:v libx264 -preset veryslow -b:v 500k -pass 1 -f null /dev/null
ffmpeg -i master.mkv -an -vf "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p" -c:v libx264 -preset veryslow -b:v 500k -pass 2 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -movflags +faststart readme-embed.mp4
```

Drag `readme-embed.mp4` into README.md in GitHub's editor and replace the old `user-attachments` link with the new one.
