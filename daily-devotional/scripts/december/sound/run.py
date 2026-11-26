"""THE FATHER SHOWED UP — the sound stage.

    studio/.venv/Scripts/python.exe scripts/december/sound/run.py <N> [--only=episode,trailer,short-<id>] [--preview]
    studio/.venv/Scripts/python.exe scripts/december/sound/run.py dev        (audition exports)
    (or: node scripts/december/sound.mjs <N> ...)

Reads ONLY december-public/dayNN/plan.json (+ the media it names). Writes, per piece:
  dayNN/audio/<piece>.wav            48 kHz stereo 24-bit master, -14.0 LUFS, TP <= -1.3 dBTP
  dayNN/audio/<piece>.stems/*.wav    voice / music / sfx (+ clips: film + outro) at master gain
  dayNN/audio/<piece>.report.json    measured loudness, bed-vs-voice, masking, highs, warnings
  out/december/dev/sound/dayNN_<piece>_qa.png   (and .mp3 with --preview)
"""
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402

import mix as M  # noqa: E402
import qa as Q  # noqa: E402
from common import DEV, PUB, SR, kpower, integrated, read_json, seed_of, tlog, write_wav  # noqa: E402

UNVERIFIED = [
    "Nothing here has been heard by a person: timbre, the felt-piano character, the hall's warmth and the theme's hummability are unverified by ear.",
    "Musical crossfades between moods are designed (chord-aligned releases + attacks) but not auditioned.",
    "SFX levels are set by measurement (loudest 400 ms vs. the voice); their character (tick = steel wristwatch, door = light not a creak, hits warm not 'braam') is unverified.",
    "Whether the pause lift (<= 4 dB) reads as breathing or as pumping is unverified.",
]


def run_piece(p, levels, cap, seed, wav, preview, day_tag):
    t0 = time.time()
    tlog(f"{p.name}: voice placed")
    sp, V, pv = M.speech_map(p)
    tlog(f"speech map: voice {V:.1f} LUFS")
    music = M.build_music(p, sp, V, levels, cap, seed)
    sfx_bus = M.build_sfx(p, sp, V, pv)
    final, stems, g_db = M.master(p, p.voice, music, sfx_bus)
    del music, sfx_bus
    write_wav(wav, final)
    sd = wav.with_suffix(".stems")
    sd.mkdir(parents=True, exist_ok=True)
    for k, x in stems.items():
        write_wav(sd / f"{k}.wav", x)
    tlog("written; QA")
    # ---- QA
    pvq, pm, ps = kpower(stems["voice"]), kpower(stems["music"]), kpower(stems["sfx"])
    words = M.qa_words(p, sp)
    onsets = M.word_onsets(p, sp)
    rep = {"piece": p.name, "day": day_tag, "file": str(wav.relative_to(PUB)).replace("\\", "/"), "duration_s": round(p.N / SR, 3),
           "frames": p.frames, "sample_rate": SR}
    rep.update(Q.measure(wav, final))
    Vv = integrated(pvq, sp)
    Mv = integrated(pm, sp)
    rep["voice_lufs_in_speech"] = round(Vv, 1)
    rep["music_lufs_in_speech"] = round(Mv, 1)
    rep["music_minus_voice_in_speech_db"] = round(Mv - Vv, 1)
    rep["bed_vs_voice"] = Q.bed_vs_voice(pvq, pm, words, Vv, sp)
    rep["bed_vs_voice"]["rule"] = "short-term (3 s, centred on each word, gated to speech) music <= voice - 18 dB; word_span = the word itself (stricter view)"
    rep["sidechain_guard"] = {"max_reduction_db": round(p.guard_max_db, 1), "active_s": round(p.guard_active_s, 1)}
    rep["sfx_masking"] = Q.masking(pvq, ps, onsets)
    rep["sfx_masking"]["rule"] = "sfx in the 3 frames before a word start <= that word's voice - 10 dB"
    rep["bed_highs"] = Q.bed_highs(stems["music"])
    rep["master_gain_db"] = round(float(g_db), 2)
    if hasattr(p, "body_lufs_in"):
        rep["body_audio_lufs_in"] = round(p.body_lufs_in, 1)
    rep["sections"] = p.section_report
    cnt = {}
    for e in p.sfx_events:
        k = e["type"] + (str(e["weight"]) if e["type"] == "hit" else "")
        cnt[k] = cnt.get(k, 0) + 1
    rep["sfx_events"] = cnt
    rep["sfx_guarded"] = [{"type": e["type"], "f": e["f"]} for e in p.sfx_events if e.get("guarded")]
    if p.outro is not None:
        o = p.outro[1]
        rep["outro"] = {"at_frame": round(p.outro[0] / SR * 30), "untouched": True, "own_lufs": round(integrated(kpower(o)), 1),
                        "own_true_peak_dbtp": round(Q.true_peak_db(o), 2)}
    rep["warnings"] = p.warnings
    rep["unverified_by_ear"] = UNVERIFIED
    rep["render_s"] = round(time.time() - t0, 1)
    wav.with_suffix(".report.json").write_text(json.dumps(rep, indent=1), encoding="utf-8")
    png = DEV / f"{day_tag}_{p.name}_qa.png"
    Q.picture(png, final, stems, M.merged_sections(p.music), p.sound, f"{day_tag} {p.name}")
    if preview:
        mp3 = DEV / f"{day_tag}_{p.name}.mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-i", str(wav), "-c:a", "libmp3lame", "-b:a", "192k", str(mp3)], check=True)
    bv = rep["bed_vs_voice"]["short_term_3s"]
    print(f"  {p.name}: {rep['duration_s']:.1f} s  I {rep['integrated_lufs']} LUFS  TP {rep['true_peak_dbtp']} dBTP  LRA {rep['lra_lu']}  "
          f"bed-voice(3s) min {bv.get('min_db')} dB ({bv.get('under_18')} words < 18)  sfx-mask worst {rep['sfx_masking']['worst_sfx_minus_voice_db']}  "
          f"highs {rep['bed_highs']['worst_1s_db_above_6k']} dB  [{rep['render_s']} s]")
    for w in p.warnings:
        print(f"    warn: {w}")
    return rep


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a[2:].split("=", 1) if "=" in a else (a[2:], "1") for a in sys.argv[1:] if a.startswith("--"))
    if not args:
        print(__doc__)
        sys.exit(2)
    if args[0] == "dev":
        import dev

        dev.main()
        return
    n = int(args[0])
    day_tag = f"day{n:02d}"
    day_dir = PUB / day_tag
    plan = read_json(day_dir / "plan.json")
    only = set(opts["only"].split(",")) if "only" in opts else None
    preview = "preview" in opts
    audio = day_dir / "audio"
    audio.mkdir(parents=True, exist_ok=True)
    seed = seed_of(day_tag, plan.get("meta", {}).get("day", n))
    print(f"{day_tag}: sound stage")
    if only is None or "episode" in only:
        p = M.episode_piece(plan, day_dir)
        run_piece(p, M.EPISODE_LEVELS, 4.0, seed_of(seed, "episode"), audio / "episode.wav", preview, day_tag)
        del p
    tr = plan.get("trailer", {})
    pp = tr.get("16x9") or tr.get("9x16")
    if pp and (only is None or "trailer" in only):
        if tr.get("16x9") and tr.get("9x16") and tr["16x9"]["durationInFrames"] != tr["9x16"]["durationInFrames"]:
            print("  warn: trailer 16x9 and 9x16 lengths differ; the audio follows 16x9")
        p = M.promo_piece(pp, "trailer", day_dir, forward=True)
        run_piece(p, M.PROMO_LEVELS, 99.0, seed_of(seed, "trailer"), audio / "trailer.wav", preview, day_tag)
        del p
    for sh in plan.get("shorts", []):
        name = f"short-{sh['id']}"
        if only is None or name in only:
            p = M.promo_piece(sh, name, day_dir, forward=False)
            # the plan names the file the picture and the render stage will look for (short-<edit id>.wav)
            out_name = Path(sh["audio"]).name if sh.get("audio") else f"{name}.wav"
            run_piece(p, M.PROMO_LEVELS, 99.0, seed_of(seed, name), audio / out_name, preview, day_tag)
            del p


if __name__ == "__main__":
    main()
