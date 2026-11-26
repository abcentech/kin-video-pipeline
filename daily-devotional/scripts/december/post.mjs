// scripts/december/post.mjs <N> [--edit=path] [--no-thumbnail] — the text deliverables of a day:
//   DayNN.srt / DayNN.vtt (FINAL episode timeline: cold-open words + body words shifted by bodyAt, ≤ 2 lines × 42 chars)
//   DayNN_transcript.txt (paragraphs, proof-read text)   DayNN_socials.md (titles, description + chapters, pinned comment,
//   hashtags, one block per short)   DayNN_thumbnail.png (Dec-Thumbnail, when the picture designer has registered it)
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { args, dayArg, loadPlan, entryHas } from "./back.mjs";
import { ROOT, pad, loadEdit, loadSeries, log } from "./lib.mjs";
import { pageCaptions, plain } from "./plan.mjs";

const n = dayArg();
const plan = loadPlan(n);
const edit = loadEdit(n, args.edit);
const series = loadSeries();
const OUT = `${ROOT}/out/december/Day${pad(n)}`;
fs.mkdirSync(OUT, { recursive: true });
const ep = plan.episode;
const D = `Day${pad(n)}`;

// ───────── words on the final timeline
const flat = (pages) => pages.flatMap((p) => p.lines.flat());
const bodyWords = flat(ep.captions);
const coldWords = ep.sections.filter((s) => s.kind === "cold").flatMap((s) => s.words.map((w) => ({ text: w.text, from: s.from + w.from, to: s.from + w.to })));
const finalWords = [...coldWords, ...bodyWords.map((w) => ({ text: w.text, from: ep.bodyAt + w.from, to: ep.bodyAt + w.to }))];
const pages = pageCaptions(finalWords, { chars: 42, lines: 2 });

const stamp = (f, sep) => {
  const ms = Math.round((f * 1000) / 30);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${sep}${String(ms % 1000).padStart(3, "0")}`;
};
const text = (p) => p.lines.map((l) => l.map((w) => w.text).join(" ")).join("\n");
fs.writeFileSync(`${OUT}/${D}.srt`, pages.map((p, i) => `${i + 1}\n${stamp(p.from, ",")} --> ${stamp(p.to, ",")}\n${text(p)}\n`).join("\n"));
fs.writeFileSync(`${OUT}/${D}.vtt`, "WEBVTT\n\n" + pages.map((p) => `${stamp(p.from, ".")} --> ${stamp(p.to, ".")}\n${text(p)}\n`).join("\n"));
log(`${D}.srt / .vtt: ${pages.length} cues`);

// ───────── transcript
const chapterAt = ep.cues.filter((c) => c.kind === "chapter").map((c) => c.from);
const paras = [];
let cur = [];
bodyWords.forEach((w, i) => {
  const prev = bodyWords[i - 1];
  const sentEnd = prev && /[.!?]["”’')]*$/.test(prev.text);
  const newChapter = chapterAt.some((c) => w.from >= c && (!prev || prev.from < c));
  if (cur.length && ((sentEnd && w.from - prev.to >= 36) || (sentEnd && cur.length > 90) || newChapter)) {
    paras.push(cur);
    cur = [];
  }
  cur.push(w);
});
if (cur.length) paras.push(cur);
fs.writeFileSync(`${OUT}/${D}_transcript.txt`, [`${series.series?.title ?? "The Father Showed Up"} — Day ${n}: ${plan.meta.title}`, `${plan.meta.ref}${plan.meta.presenter.name ? ` · ${plan.meta.presenter.name}` : ""}`, "", ...paras.map((p) => p.map((w) => w.text).join(" ")).flatMap((t) => [t, ""])].join("\n"));
log(`${D}_transcript.txt: ${paras.length} paragraphs`);

// ───────── socials
const hms = (f) => {
  const s = Math.floor(f / 30);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
};
const chapters = [[0, "Introduction"]];
const film = ep.sections.find((s) => s.kind === "film");
if (film) chapters.push([film.from, "From the film Eight O'Clock"]);
const cueAbs = (c) => ep.bodyAt + c.from;
const firstChapter = ep.cues.find((c) => c.kind === "chapter");
if (!firstChapter || cueAbs(firstChapter) - ep.bodyAt > 300) chapters.push([ep.bodyAt, film ? "The Word" : "Welcome"]);
for (const c of ep.cues) {
  if (c.kind === "chapter") chapters.push([cueAbs(c), plain(c.title)]);
  else if (c.kind === "response") chapters.push([cueAbs(c), "Your response"]);
  else if (c.kind === "prayer") chapters.push([cueAbs(c), "Let's pray"]);
  else if (c.kind === "recap") chapters.push([cueAbs(c), "Tonight's recap"]);
  else if (c.kind === "declare") chapters.push([cueAbs(c) + 16, "Say it with us"]);
}
const chap = [];
for (const c of chapters.sort((a, b) => a[0] - b[0])) if (!chap.length || c[0] - chap[chap.length - 1][0] >= 300) chap.push(c);
const s = edit.social;
const md = [];
md.push(`# Day ${n} — ${plan.meta.title} — socials`, "", "## YouTube title options", ...s.titles.map((t, i) => `${i + 1}. ${t}`), "", "## Description", "", s.description, "", `${plan.meta.ref} (KJV): “${plan.meta.verse}”`, "", "Chapters", ...chap.map(([f, l]) => `${hms(f)} ${l}`), "");
if (plan.meta.next) md.push(`Tomorrow, Day ${plan.meta.next.day}: ${plan.meta.next.title} (${plan.meta.next.ref})`, "");
const tail = [series.series?.site, series.series?.youtube].filter(Boolean).join(" · ");
if (tail) md.push(tail, "");
md.push(s.hashtags.join(" "), "", "## Pinned comment", "", s.pinned, "", "## Thumbnail", "", `Line: ${plain(s.thumbnail.line)}`, "", "## Shorts", "");
plan.shorts.forEach((sh, i) => md.push(`### Short ${i + 1} — ${plain(sh.title)}  (${(sh.durationInFrames / 30).toFixed(0)} s)`, "", sh.post ?? "", "", `File: ${D}_Short${i + 1}_9x16.mp4`, ""));
fs.writeFileSync(`${OUT}/${D}_socials.md`, md.join("\n"));
log(`${D}_socials.md: ${chap.length} chapters, ${plan.shorts.length} short blocks`);
if (chap.length < 3) console.warn("  ! fewer than 3 chapters — YouTube will ignore the chapter list");

// ───────── thumbnail
if (args["no-thumbnail"]) log("thumbnail skipped (--no-thumbnail)");
else if (!entryHas("Dec-Thumbnail")) log(`thumbnail skipped: composition Dec-Thumbnail is not registered in src/december-entry.tsx`);
else {
  log("thumbnail: rendering Dec-Thumbnail …");
  const r = spawnSync(process.execPath, [`${ROOT}/scripts/december/stills.mjs`, String(n), "--thumbnail"], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error("thumbnail render failed");
    process.exit(1);
  }
}
