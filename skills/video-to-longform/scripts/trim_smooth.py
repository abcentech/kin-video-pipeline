#!/usr/bin/env python3
# RAW -> graded body with HUMAN cuts: verbatim-repeat/dead-air drops are snapped to
# real silence, then joined with a soft CROSS-DISSOLVE (xfade=fade) instead of a hard
# jump-cut, while PRESERVING the timeline (each post-cut segment starts D earlier and
# xfades over D, so source frame e_i lands where the hard cut would put it -> the caption
# remap in srt_to_words.mjs stays valid against the SAME drops file). Also bakes a bright,
# well-lit grade + a strong voice-isolation chain (FFT + NLM + RNNoise + dialogue enhance).
#
#   trim_smooth.py <src> <out.mp4> <drops.json> [rnnoise_model.rnnn]
#
# drops.json: {"drops":[[startSec,endSec],...]}. The script writes <drops>.snapped.json with
# the silence-snapped ranges actually used — feed THAT to srt_to_words.mjs / your scene retime
# so captions and cutaways line up with the re-cut.
import json, os, subprocess, sys

if len(sys.argv) < 4:
    print("usage: trim_smooth.py <src> <out.mp4> <drops.json> [rnnoise_model.rnnn]"); sys.exit(1)
SRC, OUT, DROPS_F = sys.argv[1], sys.argv[2], sys.argv[3]
RNN = sys.argv[4] if len(sys.argv) > 4 and os.path.exists(sys.argv[4]) else None
FF = os.environ.get("FFMPEG", "ffmpeg")
FP = os.environ.get("FFPROBE", "ffprobe")
D = 0.28
TRANS = "fade"

END = float(subprocess.check_output([FP,"-v","error","-show_entries","format=duration","-of","csv=p=0",SRC]).strip())
drops = json.load(open(DROPS_F))["drops"]

# detect silences (gate a touch high so noisy rooms still yield cut points)
sd = subprocess.run([FF,"-hide_banner","-nostats","-i",SRC,"-af","silencedetect=noise=-24dB:d=0.22","-f","null","-"],
                    stderr=subprocess.PIPE, text=True).stderr
sil, cur = [], None
for ln in sd.splitlines():
    if "silence_start:" in ln: cur = float(ln.split("silence_start:")[1].split("|")[0])
    elif "silence_end:" in ln and cur is not None:
        sil.append((cur, float(ln.split("silence_end:")[1].split("|")[0]))); cur = None
mids = [(a+b)/2 for a,b in sil]

def snap(t, win=0.8):
    best, bd = t, win
    for m in mids:
        if abs(m-t) < bd: bd = abs(m-t); best = m
    return round(best, 3)

drops = sorted([[snap(a), snap(b)] for a,b in drops])
clean = []
for a,b in drops:
    if b-a < 0.15: continue
    if clean and a <= clean[-1][1]: clean[-1][1] = max(clean[-1][1], b); continue
    clean.append([a,b])
drops = clean
json.dump({"drops": drops}, open(DROPS_F.replace(".json",".snapped.json"), "w"), indent=1)
print("snapped drops:", drops)

segs, prev = [], 0.0
for a,b in drops: segs.append((prev,a)); prev = b
segs.append((prev, END))

GRADE = ("eq=contrast=0.98:saturation=1.06:brightness=0.045:gamma=1.12,"
         "curves=r='0/0.06 0.5/0.55 1/0.98':g='0/0.05 0.5/0.52 1/0.99':b='0/0.08 0.5/0.50 1/0.92'")
BLOOM = ("split[bse][glw];[glw]gblur=sigma=10,curves=all='0/0 0.6/0 1/0.7'[gl];"
         "[bse][gl]blend=all_mode=screen:all_opacity=0.12")
# Voice isolation: RNNoise does the denoise. Do NOT stack afftdn(nf=-30)+anlmdn on top —
# that gates quiet speech AS noise and destroys the voice (RMS -13 -> -40). RNNoise-only
# isolates the voice while keeping it intact, and loudnorm then hits -14 consistently.
rnn = f"arnndn=m='{RNN}'," if RNN else "afftdn=nf=-25:nr=12,"
AF = (f"highpass=f=85,{rnn}equalizer=f=200:t=q:w=1.1:g=-1,"
      "equalizer=f=3000:t=q:w=1.4:g=2,deesser=i=0.3,"
      "acompressor=threshold=-16dB:ratio=2.5:attack=8:release=160:makeup=2,"
      "loudnorm=I=-14:TP=-1.5:LRA=11")

P = []
for j,(s,e) in enumerate(segs):
    ss = s if j==0 else max(0.0, s-D)
    P.append(f"[0:v]trim=start={ss:.3f}:end={e:.3f},setpts=PTS-STARTPTS,fps=30,"
             f"scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v{j}];")
    P.append(f"[0:a]atrim=start={ss:.3f}:end={e:.3f},asetpts=PTS-STARTPTS[a{j}];")
orig = [e-s for s,e in segs]; acc = orig[0]; vl, al = "v0", "a0"
for j in range(1, len(segs)):
    off = acc - D; nv, na = f"vx{j}", f"ax{j}"
    P.append(f"[{vl}][v{j}]xfade=transition={TRANS}:duration={D}:offset={off:.3f}[{nv}];")
    P.append(f"[{al}][a{j}]acrossfade=d={D}[{na}];")
    vl, al = nv, na; acc += orig[j]
P.append(f"[{vl}]{GRADE},{BLOOM},noise=alls=3:allf=t,vignette=PI/7.5[vout];")
P.append(f"[{al}]{AF}[aout]")

cmd = [FF,"-y","-i",SRC,"-filter_complex","".join(P),"-map","[vout]","-map","[aout]",
       "-c:v","libx264","-preset","medium","-crf","19","-r","30",
       "-g","30","-keyint_min","30","-sc_threshold","0","-pix_fmt","yuv420p",
       "-profile:v","high","-level","4.2","-movflags","+faststart","-c:a","aac","-b:a","192k",OUT]
print("segments:", len(segs), " predicted duration:", round(acc,3), "s")
if "--dry" in sys.argv: sys.exit(0)
subprocess.run(cmd, check=True)
print("wrote", OUT)
