"""Cut Engine Simulator takes into ModCar engine banks (called by make_banks.py build).

Per engine, into public/audio/modcar/engines/<id>/:
  on_<rpm>.ogg / .m4a, off_<rpm>.*  seamless loops of a whole number of engine cycles
  crank.*                             starter turning the engine over, no spark (loop)
  catch.*                             first firing, flare and settle into idle (one-shot)
  shutdown.* / stall.*                spark off at idle / dragged down under load (one-shots)
  limiter.*                           free revving against the rev limiter (loop)
  manifest.json                       rpm, load, loop points, natural levels

Loops are written with a cyclic pre-roll and post-roll around the loop region: any window of the
loop's length inside the file is a seamless loop, so neither the codec's priming nor a resampler's
edges can reach the seam, whatever the decoder trims. Loop points in the manifest are in seconds.

Every file is levelled to the same loudness; its natural level relative to the bank's loudest
loop is kept in the manifest ("db") for the run-time mix to use.
"""
import csv
import json
import math
import os
import shutil
import struct
import subprocess
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from scipy import signal

FS_IN = 44100
FS = 48000
PRE = int(0.064 * FS)
POST = int(0.032 * FS)
TARGET_RMS = 10 ** (-20 / 20)
PEAK_MAX = 10 ** (-1.0 / 20)
# loop lengths: long enough that the simulator's cycle-to-cycle scatter does not repeat audibly
LOOP_SECONDS = {'on': 1.6, 'off': 2.0}


def find_ffmpeg():
    env = os.environ.get('MODCAR_FFMPEG')
    if env:
        return env
    p = shutil.which('ffmpeg')
    if p:
        return p
    import glob
    hits = glob.glob(r'D:\modcar-scratch\sound\dl-ffmpeg\x\*\bin\ffmpeg.exe')
    if hits:
        return hits[0]
    raise SystemExit('ffmpeg not found: set MODCAR_FFMPEG')


def read_wav(path):
    d = open(path, 'rb').read()
    i = 12
    fmt = bits = ch = None
    while i + 8 <= len(d):
        cid = d[i:i + 4]
        size = struct.unpack('<I', d[i + 4:i + 8])[0]
        if cid == b'fmt ':
            fmt, ch, sr, _, _, bits = struct.unpack('<HHIIHH', d[i + 8:i + 24])
        elif cid == b'data':
            raw = d[i + 8:i + 8 + size]
            if fmt == 3:
                x = np.frombuffer(raw, dtype='<f4').astype(np.float64)
            else:
                x = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768.0
            return x.reshape(-1, ch).mean(axis=1), sr
        i += 8 + size + (size & 1)
    raise ValueError(path)


def write_wav(path, x, fs):
    x = np.asarray(x, dtype='<f4')
    with open(path, 'wb') as o:
        n = len(x) * 4
        o.write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVE')
        o.write(b'fmt ' + struct.pack('<IHHIIHH', 16, 3, 1, fs, fs * 4, 4, 32))
        o.write(b'data' + struct.pack('<I', n))
        o.write(x.tobytes())


def read_log(path):
    rows = list(csv.DictReader(open(path)))
    return {k: np.array([float(r[k]) for r in rows]) for k in rows[0]} if rows else {}


def rms(x):
    return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0


# ---------------------------------------------------------------- loops

def best_period(x, L0, span=0.006):
    """Refine a loop length near L0 samples by normalised autocorrelation."""
    lo, hi = int(L0 * (1 - span)), int(L0 * (1 + span)) + 1
    best, bl = -2, int(round(L0))
    n = len(x) - hi
    a = x[:n]
    ea = np.dot(a, a)
    for lag in range(lo, hi):
        b = x[lag:lag + n]
        c = np.dot(a, b) / math.sqrt(ea * np.dot(b, b) + 1e-30)
        if c > best:
            best, bl = c, lag
    return bl, best


def cut_loop(x, L, fade):
    """Pick the start whose seam matches best, then crossfade the continuation into the head."""
    W = int(0.004 * FS_IN)
    n = len(x) - L - fade
    d2 = np.square(x[:n + W] - x[L:L + n + W])
    e2 = np.square(x[:n + W]) + np.square(x[L:L + n + W])
    k = np.ones(W)
    E = np.convolve(d2, k, 'valid')[:n] / (np.convolve(e2, k, 'valid')[:n] + 1e-30)
    s = int(np.argmin(E))
    loop = x[s:s + L].copy()
    w = np.sin(np.linspace(0, np.pi / 2, fade)) ** 2
    loop[:fade] = x[s:s + fade] * w + x[s + L:s + L + fade] * (1 - w)
    return loop, s, float(E[s])


def resample_cyclic(loop, m):
    """Band-limited resampling of a periodic signal to exactly m samples (FFT method)."""
    return signal.resample(loop, m)


def cyclic_filter(x, sos):
    """Zero-phase filtering of a periodic signal (three periods, keep the middle)."""
    y = signal.sosfiltfilt(sos, np.concatenate([x, x, x]))
    return y[len(x):2 * len(x)]


def envelope(x, fs, ms=0.8):
    a = math.exp(-1.0 / (fs * ms / 1000))
    y = np.abs(x)
    # cyclic one-pole smoothing, run twice around so the start is settled
    z = np.concatenate([y, y])
    out = signal.lfilter([1 - a], [1, -a], z)[len(y):]
    return out


# ---------------------------------------------------------------- layers baked into the loops

def rasp_layer(x, fs, rng, band, level_db, power=1.6):
    """Exhaust flow noise: noise in a band, swelling with every pressure pulse (cyclic)."""
    env = envelope(x, fs, 0.6)
    env = env / (env.max() + 1e-30)
    noise = rng.standard_normal(len(x))
    sos = signal.butter(2, [band[0] / (fs / 2), min(band[1] / (fs / 2), 0.98)], 'bandpass', output='sos')
    n = cyclic_filter(noise, sos) * env ** power
    return n * (rms(x) * 10 ** (level_db / 20) / (rms(n) + 1e-30))


def event_phase(x, fs, period):
    """Phase (samples) of the strongest pulse in each period, used to lock knocks to firing."""
    env = envelope(x, fs, 0.5)
    P = int(round(period))
    reps = len(env) // P
    if reps < 1:
        return 0
    fold = env[:reps * P].reshape(reps, P).mean(axis=0)
    return int(np.argmax(fold))


def knock_layer(x, fs, rng, events_per_loop, level_db, modes, decay_ms, tick_db=-6.0, advance_ms=2.5):
    """Combustion knock: a ring of block modes plus an injector tick at every firing (cyclic)."""
    L = len(x)
    period = L / events_per_loop
    ph = event_phase(x, fs, period) - int(advance_ms * fs / 1000)
    out = np.zeros(L)
    ring = int(fs * decay_ms * 5 / 1000)
    t = np.arange(ring) / fs
    hp = signal.butter(2, 2500 / (fs / 2), 'highpass', output='sos')
    for j in range(events_per_loop):
        at = int(round(ph + j * period + rng.normal(0, 0.00025 * fs))) % L
        amp = 1.0 + rng.normal(0, 0.22)
        burst = np.zeros(ring)
        for f, g in modes:
            fj = f * (1 + rng.normal(0, 0.03))
            burst += g * np.sin(2 * np.pi * fj * t + rng.uniform(0, 6.283)) * np.exp(-t / (decay_ms / 1000 * (0.7 + 0.6 * rng.random())))
        tick = rng.standard_normal(int(0.0008 * fs)) * 10 ** (tick_db / 20)
        burst[:len(tick)] += signal.sosfilt(hp, tick)
        burst *= amp
        idx = (at + np.arange(ring)) % L
        np.add.at(out, idx, burst)
    return out * (rms(x) * 10 ** (level_db / 20) / (rms(out) + 1e-30))


# per engine: what is layered onto the recorded exhaust (levels relative to the exhaust itself)
LAYERS = {
    'eng_mower':  {'rasp': ((1800, 7000), -15, -19)},
    'eng_single': {'rasp': ((1500, 7500), -16, -20)},
    'eng_2t':     {'rasp': ((2200, 9000), -9, -13), 'ring': ((1250, 2650), -14, -18)},
    'eng_i4':     {'rasp': ((1400, 6000), -21, -24)},
    'eng_i4d':    {'rasp': ((1200, 5000), -21, -23), 'knock': (-11, -30, -5)},
    'eng_flat6':  {'rasp': ((1500, 7000), -17, -21)},
    'eng_v8':     {'rasp': ((1000, 6000), -17, -21)},
    'eng_d6':     {'rasp': ((900, 4500), -22, -24), 'knock': (-14, -32, -8)},
}
KNOCK_MODES = {
    'eng_i4d': ([(1150, 1.0), (1900, 0.8), (2900, 0.55), (4100, 0.3)], 2.6),
    'eng_d6': ([(820, 1.0), (1400, 0.75), (2300, 0.5), (3300, 0.25)], 3.4),
}


def enrich(eid, loop, fs, load, cylinders, cycles, is_idle, rng):
    cfg = LAYERS.get(eid, {})
    y = loop.copy()
    if 'rasp' in cfg:
        band, on_db, off_db = cfg['rasp']
        y += rasp_layer(loop, fs, rng, band, on_db if load == 'on' else off_db)
    if 'ring' in cfg:
        band, on_db, off_db = cfg['ring']
        y += rasp_layer(loop, fs, rng, band, on_db if load == 'on' else off_db, power=2.4)
    if 'knock' in cfg and (load == 'on' or is_idle):
        on_db, off_db, idle_db = cfg['knock']
        modes, decay = KNOCK_MODES[eid]
        y += knock_layer(loop, fs, rng, cylinders * cycles, idle_db if is_idle else on_db, modes, decay)
    elif 'knock' in cfg:
        # fuel cut: no combustion knock, only the injection pump ticking faintly
        modes, decay = KNOCK_MODES[eid]
        y += knock_layer(loop, fs, rng, cylinders * cycles, cfg['knock'][1], modes, decay * 0.5)
    return y


# ---------------------------------------------------------------- files

def pad_cyclic(loop):
    return np.concatenate([loop[-PRE:], loop, loop[:POST]])


def encode(ffmpeg, wav, base):
    sizes = {}
    for ext, args in (('ogg', ['-c:a', 'libopus', '-b:a', '56k', '-vbr', 'on', '-application', 'audio']),
                      ('m4a', ['-c:a', 'aac', '-b:a', '72k'])):
        out = f'{base}.{ext}'
        subprocess.run([ffmpeg, '-y', '-v', 'error', '-i', wav, *args, out], check=True)
        sizes[ext] = os.path.getsize(out)
    return sizes


def decode(ffmpeg, path):
    """Decode a bank file to 48 kHz float (what a browser hands back, give or take its resampler)."""
    raw = subprocess.run([ffmpeg, '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(FS), '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype='<f4').astype(np.float64)


def seam_match_db(y, start, end, n=256):
    """RMS difference between the samples after loopEnd and after loopStart (cyclic copies), dB re
    the loop's rms: codec noise reads well below 0 dB, a misaligned copy about +3 dB."""
    a = y[start:start + n]
    b = y[end:end + n]
    if len(b) < n:
        return 6.0
    return 20 * math.log10(rms(a - b) / (rms(y[start:end]) + 1e-30) + 1e-12)


def seam_click(loop):
    """Largest second difference within 3 samples of the seam, against the loop's own 99.9th
    percentile of it (a click reads well above 1)."""
    z = np.concatenate([loop[-4:], loop[:4]])
    d2 = np.abs(np.diff(z, 2))
    ref = np.percentile(np.abs(np.diff(np.concatenate([loop, loop[:2]]), 2)), 99.9) + 1e-30
    return float(np.max(d2) / ref)


CYCLE_POINTS = 512


def mean_cycle(y, cycles):
    """The loop folded onto one 720-degree cycle (crank-angle axis), zero mean, unit norm."""
    z = signal.resample(y, cycles * CYCLE_POINTS).reshape(cycles, CYCLE_POINTS).mean(axis=0)
    z = z - z.mean()
    return z / (np.linalg.norm(z) + 1e-30)


def cycle_shift(a, b):
    """Fraction of a cycle to delay b by so it lines up best with a (circular cross-correlation)."""
    c = np.fft.irfft(np.fft.rfft(a) * np.conj(np.fft.rfft(b)), CYCLE_POINTS)
    k = int(np.argmax(c))
    return (-k % CYCLE_POINTS) / CYCLE_POINTS, float(c[k])


def onset(x, fs, frac=0.25):
    """First sample where the smoothed level reaches frac of its maximum."""
    env = signal.lfilter([0.01], [1, -0.99], np.abs(x))
    hits = np.nonzero(env > frac * env.max())[0]
    return int(hits[0]) if len(hits) else 0


def build(ids, table, raw, out_root):
    ffmpeg = find_ffmpeg()
    for eid in ids:
        build_one(eid, table[eid], raw, out_root, ffmpeg)


def build_one(eid, e, raw, out_root, ffmpeg):
    src = os.path.join(raw, eid)
    dst = os.path.join(out_root, eid)
    shutil.rmtree(dst, ignore_errors=True)
    os.makedirs(dst)
    tmp = os.path.join(src, '_enc')
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)
    seed = sum(ord(c) * 131 ** i for i, c in enumerate(eid)) % (2 ** 32)
    rng = np.random.default_rng(seed)
    strokes = e.get('strokes', 4)
    # engine-sim models are all four-strokes: firings per 720-degree cycle of the model
    model_cyl = e['cylinders'] * (2 if strokes == 2 else 1)
    items = []

    names = sorted(n for n in os.listdir(src) if n.endswith('.wav') and (n.startswith('on_') or n.startswith('off_')))
    jobs = []
    for name in names:
        load, rpm_s = name[:-4].split('_')
        x, fs = read_wav(os.path.join(src, name))
        tel = read_log(os.path.join(src, name[:-4] + '.csv'))
        rpm = float(np.mean(tel['rpm'][len(tel['rpm']) // 10:])) if tel else float(rpm_s)
        x = x[int(0.08 * fs):]
        T = 120.0 / rpm * fs
        k = max(3, int(round(LOOP_SECONDS[load] * fs / T)))
        L, corr = best_period(x, k * T)
        loop, start, seam = cut_loop(x, L, int(0.010 * fs))
        is_idle = load == 'off' and int(rpm_s) == e['idle']
        nat = rms(loop)
        if load == 'off' and not is_idle:
            nat *= 10 ** (e.get('offTrimDb', 0) / 20)
        rich = enrich(eid, loop, fs, load, model_cyl, k, is_idle, rng)
        m = int(round(L * FS / fs))
        y = resample_cyclic(rich, m)
        items.append({'kind': 'loop', 'file': f'{load}_{int(rpm_s):05d}', 'load': 1 if load == 'on' else 0,
                      'rpm': round(k * 120.0 * FS / m, 2), 'nominal': int(rpm_s), 'cycles': k,
                      'nat': nat, 'corr': round(corr, 4), 'seam': round(seam, 5), 'idle': is_idle, 'y': y})

    # cranking (no spark): loop the steady part
    x, fs = read_wav(os.path.join(src, 'crank.wav'))
    tel = read_log(os.path.join(src, 'crank.csv'))
    crpm = float(np.median(tel['rpm'][len(tel['rpm']) // 2:]))
    x = x[int(0.5 * fs):]
    T = 120.0 / max(crpm, 30) * fs
    k = max(1, int((len(x) - 0.15 * fs) // T))
    k = min(k, max(1, int(round(0.9 * fs / T))))
    # a slow starter: settle for the longest stretch that still leaves room to pick a seam
    L0 = min(k * T, len(x) * 0.62)
    L, corr = best_period(x, L0, span=0.03)
    loop, _, seam = cut_loop(x, L, int(0.008 * fs))
    y = resample_cyclic(loop, int(round(L * FS / fs)))
    items.append({'kind': 'loop', 'file': 'crank', 'rpm': round(crpm, 1), 'cycles': k, 'nat': rms(loop), 'corr': round(corr, 4), 'seam': round(seam, 5), 'y': y})

    # rev limiter: not periodic, find the best ~1 s seam
    x, fs = read_wav(os.path.join(src, 'limiter.wav'))
    x = x[int(0.3 * fs):]
    L, corr = best_period(x, 0.8 * fs, span=0.2)
    loop, _, seam = cut_loop(x, L, int(0.012 * fs))
    lim = enrich(eid, loop, fs, 'on', model_cyl, max(1, int(round(L / (120.0 / e['limiter'] * fs)))), False, rng)
    y = resample_cyclic(lim, int(round(L * FS / fs)))
    items.append({'kind': 'loop', 'file': 'limiter', 'rpm': e['limiter'], 'nat': rms(loop), 'corr': round(corr, 4), 'seam': round(seam, 5), 'y': y})

    # one-shots
    def oneshot(name, x, fs, lead=0.05, tail_fade=0.05):
        y = signal.resample_poly(x, FS // 300, fs // 300)
        fo = int(tail_fade * FS)
        y[-fo:] *= np.linspace(1, 0, fo) ** 2
        fi = int(0.004 * FS)
        y[:fi] *= np.linspace(0, 1, fi)
        return y

    x, fs = read_wav(os.path.join(src, 'start.wav'))
    tel = read_log(os.path.join(src, 'start.csv'))
    # the catch: from just before the first strong firing to the settled idle
    o = onset(x, fs, 0.2)
    s0 = max(0, o - int(0.06 * fs))
    items.append({'kind': 'oneshot', 'file': 'catch', 'nat': rms(x[o:]), 'y': oneshot('catch', x[s0:], fs), 'at': round(s0 / fs, 3)})

    for name in ('shutdown', 'stall'):
        x, fs = read_wav(os.path.join(src, name + '.wav'))
        # trim the silence at the end
        env = signal.lfilter([0.01], [1, -0.99], np.abs(x))
        live = np.nonzero(env > 0.002 * env.max())[0]
        end = min(len(x), int(live[-1]) + int(0.15 * fs)) if len(live) else len(x)
        items.append({'kind': 'oneshot', 'file': name, 'nat': rms(x[: int(0.25 * fs)]), 'y': oneshot(name, x[:end], fs)})

    # cycle phase of every steady loop, so the player can start each one in step with its
    # neighbour: each load chained up by rpm (coh = likeness to the loop below), then the whole
    # overrun chain turned to sit best against the full-load chain (cohLoad = the likeness left)
    steady = [i for i in items if i['kind'] == 'loop' and 'load' in i]
    for i in steady:
        i['mc'] = mean_cycle(i['y'], i['cycles'])
    phase = {}
    chains = {}
    for load in (1, 0):
        ch = sorted([i for i in steady if i['load'] == load], key=lambda i: i['rpm'])
        chains[load] = ch
        phase[id(ch[0])] = 0.0
        for a, b in zip(ch, ch[1:]):
            sh, c = cycle_shift(a['mc'], b['mc'])
            phase[id(b)] = (phase[id(a)] + sh) % 1.0
            b['coh'] = round(max(0.0, c), 3)
    pairs = []
    for off in chains[0]:
        on = min(chains[1], key=lambda o: abs(o['rpm'] - off['rpm']))
        sh, c = cycle_shift(on['mc'], off['mc'])
        pairs.append((off, on, (phase[id(on)] + sh - phase[id(off)]) % 1.0, max(0.0, c)))
    # weighted circular mean of the offsets each pair would like
    zx = sum(c * math.cos(2 * math.pi * d) for _, _, d, c in pairs)
    zy = sum(c * math.sin(2 * math.pi * d) for _, _, d, c in pairs)
    delta = (math.atan2(zy, zx) / (2 * math.pi)) % 1.0
    for off, on, d, c in pairs:
        phase[id(off)] = (phase[id(off)] + delta) % 1.0
        off['cohLoad'] = round(max(0.0, c * math.cos(2 * math.pi * (delta - d))), 3)
    for i in steady:
        # seconds from loopStart to a cycle start, at the loop's own speed
        i['phase'] = round(phase[id(i)] * 120.0 / i['rpm'], 6)
        del i['mc']

    # levels: every file at the same loudness; natural level relative to the loudest on-load loop
    ref = max(i['nat'] for i in items if i.get('load') == 1)
    man_loops, man_shots = [], {}
    total = {'ogg': 0, 'm4a': 0}
    for it in items:
        y = it.pop('y')
        if it['kind'] == 'loop':
            body = y
            y = pad_cyclic(y)
            r = rms(body)
        else:
            r = rms(y[: int(0.4 * FS)]) if it['file'] == 'shutdown' else rms(y)
        g = TARGET_RMS / (r + 1e-30)
        pk = np.max(np.abs(y)) * g
        if pk > PEAK_MAX:
            g *= PEAK_MAX / pk
        y = y * g
        wav = os.path.join(tmp, it['file'] + '.wav')
        write_wav(wav, y, FS)
        sizes = encode(ffmpeg, wav, os.path.join(dst, it['file']))
        for k2 in total:
            total[k2] += sizes[k2]
        # db: natural level against the loudest on-load loop; gain: what levelling applied
        rec = {'file': it['file'], 'db': round(20 * math.log10(it['nat'] / ref + 1e-12), 2), 'gain': round(20 * math.log10(g), 2)}
        if it['kind'] == 'loop':
            rec.update({'loopStart': round(PRE / FS, 6), 'loopEnd': round((PRE + len(body)) / FS, 6), 'duration': round(len(y) / FS, 6)})
            rec['click'] = round(seam_click(body), 2)
            for ext in ('ogg', 'm4a'):
                dec = decode(ffmpeg, os.path.join(dst, f'{it["file"]}.{ext}'))
                rec[f'seam_{ext}'] = round(seam_match_db(dec, PRE, PRE + len(body)), 1)
            for key in ('rpm', 'load', 'cycles', 'corr', 'seam', 'idle', 'nominal', 'phase', 'coh', 'cohLoad'):
                if key in it:
                    rec[key] = it[key]
            if it['file'] in ('crank', 'limiter'):
                man_shots[it['file']] = rec
            else:
                man_loops.append(rec)
        else:
            rec['duration'] = round(len(y) / FS, 6)
            man_shots[it['file']] = rec

    man_loops.sort(key=lambda r: (r['load'], r['rpm']))
    manifest = {
        'id': eid,
        'version': 1,
        'source': 'Engine Simulator (AngeTheGreat, MIT) via tools/enginesim; layers by bank_build.py',
        'sampleRate': FS,
        'formats': ['ogg', 'm4a'],
        'cylinders': e['cylinders'],
        'strokes': strokes,
        'idleRpm': e['idle'],
        'redlineRpm': e['redline'],
        'limiterRpm': e['limiter'],
        'offMode': e['offMode'],
        'loops': man_loops,
        'oneshots': man_shots,
        'bytes': total,
    }
    json.dump(manifest, open(os.path.join(dst, 'manifest.json'), 'w'), indent=1)
    shutil.rmtree(tmp, ignore_errors=True)
    print(f'{eid}: {len(man_loops)} loops, {len(man_shots)} one-shots, ogg {total["ogg"] / 1e6:.2f} MB, m4a {total["m4a"] / 1e6:.2f} MB')
    return manifest
