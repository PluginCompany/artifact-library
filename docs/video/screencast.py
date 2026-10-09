"""Record a Playwright page via the DevTools screencast into a constant-frame-rate H.264 file.

Frames are captured losslessly as PNG (RGB) and converted once, explicitly, to BT.709
limited-range YUV with matching colour metadata, so colours and contrast match the browser.
"""
import asyncio, base64, os, subprocess, shutil, time

# Tag every encode as BT.709 limited range so players don't guess (the cause of washed-out video).
COLOR = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']


class Recorder:
    def __init__(self, page, out, fps=30, size=(1920, 1080), fmt='png'):
        self.page, self.out, self.fps, self.size, self.fmt = page, out, fps, size, fmt
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
        n = max(1, round(total * self.fps))
        enc = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(self.fps), '-c:v', 'png' if self.fmt == 'png' else 'mjpeg', '-i', '-',
                                '-vf', f'scale={self.size[0]}:{self.size[1]}:flags=lanczos+accurate_rnd+full_chroma_int:{self.src_matrix}out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
                                *COLOR, '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-r', str(self.fps), '-movflags', '+faststart', self.out], stdin=subprocess.PIPE)
        i, cache = 0, {}
        for k in range(n):
            t = self.started + k / self.fps
            # nearest capture to this tick: evenly spaced motion even though captures arrive at ~45 fps
            while i + 1 < len(fr) and abs(fr[i + 1][0] - t) <= abs(fr[i][0] - t): i += 1
            name = fr[i][1]
            if name not in cache: cache.clear(); cache[name] = open(name, 'rb').read()
            enc.stdin.write(cache[name])
        enc.stdin.close()
        if enc.wait() != 0: raise RuntimeError('ffmpeg failed')
        return len(fr)
