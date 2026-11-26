"""Measure a finished piece (no ears needed for the objective part) and draw it.

  loudness      integrated / true peak / LRA of the master (ffmpeg ebur128, independent of the mixer)
  bed vs voice  for every word: music level over the word's span and over a 3 s short-term
                window, against the voice's; the rule is music <= voice - 18 dB
  syllables     sfx in the 3 frames before each word start vs. that word (rule: <= voice - 10 dB)
  bed highs     share of the music stem's energy above 6 kHz, worst 1 s window (rule: <= -24 dB)
  clipping      sample peak of the master
"""
import numpy as np

from common import DEV, HOP, SR, ffmpeg_r128, kpower, lk, momentary, true_peak_db
from scipy.ndimage import uniform_filter1d


def bed_vs_voice(pv, pm, words, V=None, sp=None):
    """per-word (voice - music) in dB: on 3 s short-term windows (the rule), on the word span,
    and on the span of audible words only (within 12 dB of his speech level: not breaths/tails)"""
    # 3 s short-term around each word, gated to the blocks where he speaks (the bed in a pause
    # or under a sting is not "under a word"); ungated if no speech map is given
    m = np.ones(len(pv)) if sp is None else sp[: len(pv)].astype(np.float64)
    cnt = uniform_filter1d(m, 301, mode="constant") + 1e-9
    sv3 = uniform_filter1d(pv * m, 301, mode="constant") / cnt
    sm3 = uniform_filter1d(pm * m, 301, mode="constant") / cnt
    span, st3, aud = [], [], []
    for a, b in words:
        ia, ib = int(a * 100), max(int(a * 100) + 3, int(b * 100))
        if ib > len(pv):
            continue
        v = pv[ia:ib].mean()
        if lk(v) < -60:
            continue
        span.append(lk(v) - lk(pm[ia:ib].mean()))
        if V is not None and lk(v) >= V - 12:
            aud.append(span[-1])
        c = (ia + ib) // 2
        st3.append(lk(sv3[c]) - lk(sm3[c]))

    def stats(d):
        if not d:
            return {"words": 0}
        d = np.array(d)
        return {"words": int(len(d)), "min_db": round(float(d.min()), 1), "p5_db": round(float(np.percentile(d, 5)), 1),
                "median_db": round(float(np.median(d)), 1), "under_18": int((d < 18).sum())}

    return {"short_term_3s": stats(st3), "word_span": stats(span), "word_span_audible_words": stats(aud)}


def masking(pv, ps, onsets):
    worst = None
    bad = []
    for ws in onsets:
        b = int(ws * 100)
        if b - 10 < 0 or b + 30 > len(pv):
            continue
        v = lk(uniform_filter1d(pv[b : b + 30], 10).max())
        if v < -60:
            continue
        d = lk(ps[b - 10 : b].mean()) - v
        worst = d if worst is None else max(worst, d)
        if d > -10:
            bad.append(round(ws, 2))
    return {"onsets": len(onsets), "worst_sfx_minus_voice_db": None if worst is None else round(float(worst), 1), "violations": bad}


def bed_highs(music):
    m = music.mean(axis=1)
    n = SR
    worst = -120.0
    worst_t = 0.0
    total_hi, total = 0.0, 0.0
    f = np.fft.rfftfreq(n, 1 / SR)
    hi = f >= 6000
    w = np.hanning(n)
    for a in range(0, len(m) - n, n // 2):
        seg = m[a : a + n]
        e = np.abs(np.fft.rfft(seg * w)) ** 2
        tot = e.sum()
        if tot < 1e-9 * n:
            continue
        r = e[hi].sum() / tot
        total_hi += e[hi].sum()
        total += tot
        if 10 * np.log10(r + 1e-15) > worst:
            worst, worst_t = 10 * np.log10(r + 1e-15), a / SR
    return {"worst_1s_db_above_6k": round(float(worst), 1), "at_s": round(worst_t, 1),
            "overall_db_above_6k": round(float(10 * np.log10(total_hi / total + 1e-15)), 1) if total else None, "pass": bool(worst <= -24)}


def picture(path_png, mix, stems, sections, sound, title):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    m = stems["music"].mean(axis=1)
    dur = len(m) / SR
    fig, ax = plt.subplots(2, 1, figsize=(18, 8), sharex=True, gridspec_kw={"height_ratios": [2.2, 2]})
    # music stem spectrogram (decimated for speed: 24 kHz is plenty to see > 6 kHz)
    x = m[::2]
    nfft, hop = 2048, 1024
    nwin = (len(x) - nfft) // hop
    if nwin > 0:
        idx = np.arange(nfft)[None, :] + hop * np.arange(nwin)[:, None]
        S = 20 * np.log10(np.abs(np.fft.rfft(x[idx] * np.hanning(nfft), axis=1)) + 1e-7).T
        S -= S.max()
        ax[0].imshow(S, aspect="auto", origin="lower", extent=[0, nwin * hop / (SR / 2), 0, SR / 4], vmin=-90, vmax=0, cmap="magma")
        ax[0].set_yscale("symlog", linthresh=500)
        ax[0].set_ylim(30, 12000)
        ax[0].axhline(6000, color="cyan", lw=0.8, ls=":")
    ax[0].set_title(f"{title}: music stem")
    for k, col in (("voice", "black"), ("clips", "gray"), ("music", "orange"), ("sfx", "tab:blue")):
        if k in stems:
            L = momentary(kpower(stems[k]), 40)
            ax[1].plot(np.arange(len(L)) / 100, L, color=col, lw=0.8, label=k)
    ax[1].set_ylim(-70, -5)
    ax[1].set_ylabel("LUFS (400 ms)")
    ax[1].legend(loc="lower left", ncol=4)
    for s in sections:
        for a_ in ax:
            a_.axvline(s["from"] / 30, color="lime", lw=0.8, ls="--")
        ax[1].text(s["from"] / 30 + 0.1, -9, s["mood"], color="green", fontsize=8)
    for c in sound:
        ax[1].axvline(c["f"] / 30, color="red", lw=0.5, alpha=0.4)
    ax[1].set_xlim(0, dur)
    fig.tight_layout()
    path_png.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path_png, dpi=60)
    plt.close(fig)


def measure(wav_path, mix):
    r = ffmpeg_r128(wav_path)
    return {"integrated_lufs": r["I"], "true_peak_dbtp": r["TP"], "lra_lu": r["LRA"], "true_peak_dbtp_4x": round(true_peak_db(mix), 2),
            "sample_peak_dbfs": round(float(20 * np.log10(np.abs(mix).max() + 1e-12)), 2),
            "pass_loudness": r["I"] is not None and abs(r["I"] + 14.0) <= 0.5, "pass_true_peak": r["TP"] is not None and r["TP"] <= -1.3}
