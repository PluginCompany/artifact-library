"""Record a Playwright page via the DevTools screencast into a constant-frame-rate H.264 file.

Frames are captured losslessly as PNG (RGB) and converted once, explicitly, to BT.709
limited-range YUV with matching colour metadata, so colours and contrast match the browser.

Screencast frames are whole compositor frames (no tearing, unlike grabbing a virtual X screen),
but at 3840×2160 Chromium delivers only ~11 of them per second. So the page runs `slow` times
slower than real time (record.py slows its clocks and animations) and the recorder compresses
time back: at slow=8 that is ~90 captured frames per second of film.
"""
import asyncio, base64, os, signal, subprocess, shutil, time

# Tag every encode as BT.709 limited range so players don't guess (the cause of washed-out video).
COLOR = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']


class Recorder:
    def __init__(self, page, out, fps=30, size=(1920, 1080), fmt='png', slow=1.0):
        self.page, self.out, self.fps, self.size, self.fmt, self.slow = page, out, fps, size, fmt, slow
        self.dir = out + '.frames'; self.frames = []; self.cdp = None; self.pending = []
    async def start(self):
        shutil.rmtree(self.dir, ignore_errors=True); os.makedirs(self.dir)
        self.cdp = await self.page.context.new_cdp_session(self.page)
        self.cdp.on('Page.screencastFrame', lambda f: asyncio.ensure_future(self._frame(f)))
        self.started = time.time()
        opts = {'format': self.fmt, 'maxWidth': self.size[0], 'maxHeight': self.size[1], 'everyNthFrame': 1}
        if self.fmt == 'jpeg': opts['quality'] = 95
        await self.cdp.send('Page.startScreencast', opts)
    async def _frame(self, f):
        # Acknowledge first so Chromium sends the next frame right away; write to disk off the event loop.
        try: await self.cdp.send('Page.screencastFrameAck', {'sessionId': f['sessionId']})
        except Exception: pass
        name = os.path.join(self.dir, f'{len(self.frames):06d}.{self.fmt}')
        self.frames.append((f['metadata']['timestamp'], name))
        data = base64.b64decode(f['data'])
        self.pending.append(asyncio.get_running_loop().run_in_executor(None, self._write, name, data))
    @staticmethod
    def _write(name, data):
        with open(name, 'wb') as fh: fh.write(data)
    async def stop(self, tail=0.5):
        stopped = time.time()  # frame timestamps are epoch seconds; a still page sends no new frames
        await self.cdp.send('Page.stopScreencast')
        await asyncio.sleep(0.2)
        await asyncio.gather(*self.pending)
        fr = sorted(self.frames)
        if not fr: raise RuntimeError('no frames captured')
        # Resample to a constant frame rate: output frame k shows the newest capture at or before started + k/fps.
        total = max(stopped - self.started, fr[-1][0] - self.started + tail)
        # JPEG frames are full-range BT.601 (JFIF); PNG frames are RGB.
        self.src_matrix = 'in_color_matrix=bt601:in_range=pc:' if self.fmt == 'jpeg' else ''
        n = max(1, round(total / self.slow * self.fps))
        enc = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(self.fps), '-c:v', 'png' if self.fmt == 'png' else 'mjpeg', '-i', '-',
                                '-vf', f'scale={self.size[0]}:{self.size[1]}:flags=lanczos+accurate_rnd+full_chroma_int:{self.src_matrix}out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
                                *COLOR, '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', '-r', str(self.fps), '-movflags', '+faststart', self.out], stdin=subprocess.PIPE)
        i, cache = 0, {}
        for k in range(n):
            t = self.started + k * self.slow / self.fps
            # nearest capture to this tick: evenly spaced motion even though captures arrive unevenly
            while i + 1 < len(fr) and abs(fr[i + 1][0] - t) <= abs(fr[i][0] - t): i += 1
            name = fr[i][1]
            if name not in cache: cache.clear(); cache[name] = open(name, 'rb').read()
            enc.stdin.write(cache[name])
        enc.stdin.close()
        if enc.wait() != 0: raise RuntimeError('ffmpeg failed')
        return len(fr)


# ---------------------------------------------------------------- OBS: a real screen in real time
OBS_CONF = os.path.expanduser('~/.config/obs-studio')
MAGENTA = (255, 0, 255)


class ObsRecorder:
    """OBS records the film screen: a fullscreen, GPU-composited browser on a real 3840×2160 monitor,
    captured through PipeWire and encoded in hardware. Uses the OBS profile and scene collection
    "ArtifactIntro" (set up once, see docs/video/README.md) and leaves the user's defaults alone."""
    ARGS = ['--profile', 'ArtifactIntro', '--collection', 'ArtifactIntro', '--scene', 'Intro',
            '--startrecording', '--minimize-to-tray', '--multi', '--disable-shutdown-check']

    def __init__(self, outdir):
        self.dir = outdir; os.makedirs(outdir, exist_ok=True)
    async def start(self):
        self.user_ini = os.path.join(OBS_CONF, 'user.ini')
        self.saved = open(self.user_ini).read() if os.path.exists(self.user_ini) else None
        self.before = set(os.listdir(self.dir))
        self.proc = subprocess.Popen(['obs', *self.ARGS], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(120):                       # recording file appears and grows: capture is live
            new = [f for f in os.listdir(self.dir) if f not in self.before and f.endswith('.mkv')]
            if new:
                self.file = os.path.join(self.dir, new[0]); size = os.path.getsize(self.file)
                await asyncio.sleep(1.0)
                if os.path.getsize(self.file) > size + 100_000: break
            else:
                await asyncio.sleep(0.5)
        else:
            self.proc.kill(); raise RuntimeError('OBS did not start recording (screen choice saved? see docs/video/README.md)')
        await asyncio.sleep(1.0)
    async def stop(self):
        for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGKILL):
            self.proc.send_signal(sig)
            try: self.proc.wait(timeout=20); break
            except subprocess.TimeoutExpired: pass
        if self.saved is not None: open(self.user_ini, 'w').write(self.saved)   # OBS makes its profile the default
        return self.file


def find_markers(path, fps=60):
    """Times (s) of the film inside a take framed by magenta marker frames: (first frame after the
    opening marker, first frame of the closing marker)."""
    w, h = 16, 9
    proc = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-i', path, '-vf', f'scale={w}:{h},format=rgb24', '-f', 'rawvideo', '-'],
                            stdout=subprocess.PIPE)
    flags, size = [], w * h * 3
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size: break
        r, g, b = (sum(buf[i::3]) / (w * h) for i in range(3))
        flags.append(r > 200 and g < 60 and b > 200)
    proc.wait()
    first = flags.index(True)
    start = next(i for i in range(first, len(flags)) if not flags[i])
    end = max(i for i, m in enumerate(flags) if m and i > start and not flags[i - 1])
    return start / fps, end / fps
