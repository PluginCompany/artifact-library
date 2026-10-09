"""Record a Playwright page via the DevTools screencast into a constant-frame-rate H.264 file."""
import asyncio, base64, os, subprocess, shutil, time

class Recorder:
    def __init__(self, page, out, fps=30):
        self.page, self.out, self.fps = page, out, fps
        self.dir = out + '.frames'; self.frames = []; self.cdp = None
    async def start(self):
        shutil.rmtree(self.dir, ignore_errors=True); os.makedirs(self.dir)
        self.cdp = await self.page.context.new_cdp_session(self.page)
        self.cdp.on('Page.screencastFrame', lambda f: asyncio.ensure_future(self._frame(f)))
        self.started = time.time()
        await self.cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 96, 'maxWidth': 1920, 'maxHeight': 1080, 'everyNthFrame': 1})
    async def _frame(self, f):
        name = os.path.join(self.dir, f'{len(self.frames):06d}.jpg')
        with open(name, 'wb') as fh: fh.write(base64.b64decode(f['data']))
        self.frames.append((f['metadata']['timestamp'], name))
        try: await self.cdp.send('Page.screencastFrameAck', {'sessionId': f['sessionId']})
        except Exception: pass
    async def stop(self, tail=0.5):
        stopped = time.time()  # frame timestamps are epoch seconds; a still page sends no new frames
        await self.cdp.send('Page.stopScreencast')
        await asyncio.sleep(0.2)
        fr = sorted(self.frames)
        if not fr: raise RuntimeError('no frames captured')
        # Resample to a constant frame rate: output frame k shows the newest capture at or before started + k/fps.
        total = max(stopped - self.started, fr[-1][0] - self.started + tail)
        n = max(1, round(total * self.fps))
        enc = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(self.fps), '-c:v', 'mjpeg', '-i', '-',
                                '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15',
                                '-r', str(self.fps), '-movflags', '+faststart', self.out], stdin=subprocess.PIPE)
        i, cache = 0, {}
        for k in range(n):
            t = self.started + k / self.fps
            while i + 1 < len(fr) and fr[i + 1][0] <= t: i += 1
            name = fr[i][1]
            if name not in cache: cache.clear(); cache[name] = open(name, 'rb').read()
            enc.stdin.write(cache[name])
        enc.stdin.close()
        if enc.wait() != 0: raise RuntimeError('ffmpeg failed')
        return len(fr)
