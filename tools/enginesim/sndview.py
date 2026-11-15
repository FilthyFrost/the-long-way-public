"""Look at sounds without listening to them: levels, spectral centroid, the strongest harmonics and a
spectrogram sheet (PNG), for WAV files (PCM 16/24/32 or float32, any channel count; mono mixdown).

    python -I tools/enginesim/sndview.py out.png a.wav [b.wav ...] [--fmax 6000] [--seconds 3]

Prints one line per file: duration, RMS / peak dBFS, centroid, the rpm-related fundamental estimate.
"""
import sys
import struct
import numpy as np
from PIL import Image, ImageDraw


def read_wav(path):
    d = open(path, 'rb').read()
    assert d[:4] == b'RIFF' and d[8:12] == b'WAVE', path
    i = 12
    fmt = ch = sr = bits = None
    while i + 8 <= len(d):
        cid = d[i:i + 4]
        size = struct.unpack('<I', d[i + 4:i + 8])[0]
        if cid == b'fmt ':
            fmt, ch, sr, _, _, bits = struct.unpack('<HHIIHH', d[i + 8:i + 24])
            if fmt == 0xFFFE:
                fmt = struct.unpack('<H', d[i + 32:i + 34])[0]
        elif cid == b'data':
            raw = d[i + 8:i + 8 + size]
            if fmt == 3:
                x = np.frombuffer(raw, dtype='<f4' if bits == 32 else '<f8').astype(np.float64)
            elif bits == 16:
                x = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768.0
            elif bits == 24:
                b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
                v = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
                v[v >= 1 << 23] -= 1 << 24
                x = v.astype(np.float64) / (1 << 23)
            elif bits == 32:
                x = np.frombuffer(raw, dtype='<i4').astype(np.float64) / 2147483648.0
            else:
                raise ValueError(f'{path}: {bits}-bit')
            x = x[: len(x) // ch * ch].reshape(-1, ch).mean(axis=1)
            return x, sr
        i += 8 + size + (size & 1)
    raise ValueError(f'{path}: no data chunk')


def db(v):
    return 20 * np.log10(max(v, 1e-12))


def stats(x, sr):
    rms = float(np.sqrt(np.mean(x * x))) if len(x) else 0.0
    peak = float(np.max(np.abs(x))) if len(x) else 0.0
    n = min(len(x), 1 << 16)
    seg = x[len(x) // 2 - n // 2: len(x) // 2 + n // 2] if len(x) >= n else x
    w = np.hanning(len(seg))
    sp = np.abs(np.fft.rfft(seg * w))
    f = np.fft.rfftfreq(len(seg), 1 / sr)
    p = sp * sp
    centroid = float((f * p).sum() / max(p.sum(), 1e-20))
    # strongest low peaks (below 1 kHz)
    lo = (f > 15) & (f < 1000)
    idx = np.argsort(sp[lo])[::-1]
    peaks = []
    for k in idx:
        fk = f[lo][k]
        if all(abs(fk - q) > 4 for q in peaks):
            peaks.append(float(fk))
        if len(peaks) >= 5:
            break
    return rms, peak, centroid, peaks


def spectrogram(x, sr, fmax, width, height):
    nfft = 4096
    hop = max(1, (len(x) - nfft) // width) if len(x) > nfft else 1
    cols = []
    w = np.hanning(nfft)
    for c in range(width):
        s = c * hop
        seg = x[s:s + nfft]
        if len(seg) < nfft:
            seg = np.pad(seg, (0, nfft - len(seg)))
        cols.append(np.abs(np.fft.rfft(seg * w)))
    S = np.array(cols).T  # bins x time
    f = np.fft.rfftfreq(nfft, 1 / sr)
    # log-frequency axis from 20 Hz to fmax
    fl = np.geomspace(20, fmax, height)
    rows = np.interp(fl, f, np.arange(len(f)))
    img = np.array([S[int(r)] for r in rows])[::-1]
    L = 20 * np.log10(img + 1e-12)
    top = L.max()
    L = np.clip((L - (top - 75)) / 75, 0, 1)
    return L


def main():
    args = [a for a in sys.argv[1:]]
    fmax = 8000
    seconds = None
    if '--fmax' in args:
        i = args.index('--fmax'); fmax = float(args[i + 1]); del args[i:i + 2]
    if '--seconds' in args:
        i = args.index('--seconds'); seconds = float(args[i + 1]); del args[i:i + 2]
    out, files = args[0], args[1:]
    W, H, WH = 900, 220, 60
    sheet = Image.new('RGB', (W, (H + WH + 22) * len(files)), (12, 12, 16))
    dr = ImageDraw.Draw(sheet)
    for n, path in enumerate(files):
        x, sr = read_wav(path)
        if seconds:
            x = x[: int(seconds * sr)]
        rms, peak, cen, peaks = stats(x, sr)
        print(f'{path}: {len(x) / sr:6.2f} s  rms {db(rms):6.1f} dBFS  peak {db(peak):6.1f}  centroid {cen:7.0f} Hz  peaks {[round(p, 1) for p in peaks]}')
        L = spectrogram(x, sr, fmax, W, H)
        # a magma-like ramp: black -> purple -> orange -> pale yellow
        rgb = np.stack([np.clip(L * 1.6 - 0.1, 0, 1), np.clip(L * 1.5 - 0.55, 0, 1), np.clip(np.sin(L * 3.1) * 0.6 + np.clip(L * 2 - 1.4, 0, 1), 0, 1)], axis=-1)
        y0 = n * (H + WH + 22)
        sheet.paste(Image.fromarray((rgb * 255).astype(np.uint8)), (0, y0 + 20))
        # waveform envelope
        env = np.zeros(W)
        step = max(1, len(x) // W)
        for c in range(W):
            seg = x[c * step:(c + 1) * step]
            env[c] = np.max(np.abs(seg)) if len(seg) else 0
        pk = max(env.max(), 1e-9)
        for c in range(W):
            h = int(env[c] / pk * (WH - 4) / 2)
            dr.line([(c, y0 + 20 + H + WH // 2 - h), (c, y0 + 20 + H + WH // 2 + h)], fill=(110, 170, 120))
        dr.text((4, y0 + 3), f'{path.replace(chr(92), "/").split("/")[-1]}  rms {db(rms):.1f} dB  centroid {cen:.0f} Hz  (log f 20..{fmax:.0f} Hz)', fill=(230, 230, 230))
    sheet.save(out)


if __name__ == '__main__':
    main()
