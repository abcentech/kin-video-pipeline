// Parse the Teacher's Edition HTML into december/series.json.
//   node scripts/december/guide.mjs
import fs from "node:fs";
import { CONFIG, ROOT, writeJson } from "./lib.mjs";

const html = fs.readFileSync(CONFIG.guide, "utf8");
const main = html.slice(html.indexOf("<main>"));

const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const text = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (m) => ENT[m])
    .replace(/\s+/g, " ")
    .trim();
const unq = (s) => s.replace(/^[“"]\s*/, "").replace(/\s*[”"]$/, "");

/** "Father’S" -> "Father’s" (only an apostrophe-S typo of title case). */
const fixTitle = (t) => t.replace(/([A-Za-z])([’'])S\b/g, "$1$2s");
const secs = (s) => {
  const [m, ss] = s.split(":").map(Number);
  return m * 60 + ss;
};
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// ── split into h1 sections
const sections = [];
const hre = /<h1 id="s(\d+)">([\s\S]*?)<\/h1>/g;
const marks = [...main.matchAll(hre)];
marks.forEach((m, k) => {
  const end = k + 1 < marks.length ? marks[k + 1].index : main.length;
  sections.push({ n: Number(m[1]), title: text(m[2]), body: main.slice(m.index + m[0].length, end), pre: main.slice(k ? marks[k - 1].index : 0, m.index) });
});

const head = sections.find((s) => s.n === 0);
const opener = sections.find((s) => /^To Every Child$/i.test(s.title));
const closing = sections.find((s) => !/^Day \d+/.test(s.title) && s !== head && s !== opener);

// ── series
const paras = (body) => [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => text(m[1]));
const hp = paras(head.body);
const series = {
  title: head.title,
  subtitle: hp[0],
  tagline: hp[1],
  summary: hp[2],
  safeguarding: hp[3],
  declaration: text((opener.body.match(/<p><strong>([\s\S]*?)<\/strong><\/p>/) || [])[1] || ""),
  phone: (hp[3].match(/\+\d[\d ]+\d/) || [""])[0],
  site: (text(closing.body).match(/\b\w+\.org\b/) || [""])[0],
  youtube: (text(closing.body).match(/@\w+/) || [""])[0],
};

// ── opener
const quotes = [...opener.body.matchAll(/<blockquote><p>([\s\S]*?)<\/p><\/blockquote>/g)].map((m) => {
  const t = text(m[1]);
  const mm = t.match(/^(.*?)\s+—\s+(.+?)\s*\(KJV[^)]*\)\s*$/);
  return { text: mm ? unq(mm[1]) : t, ref: mm ? mm[2] : "" };
});
const openerParas = [];
for (const m of opener.body.matchAll(/<(p|blockquote)>([\s\S]*?)<\/\1>/g)) {
  if (m[1] === "blockquote") openerParas.push(text(m[2]));
  else if (!/^<strong>/.test(m[2]) && !/^<em>/.test(m[2])) openerParas.push(text(m[2]));
}
const introNote = paras(opener.body)[0];
const openerOut = {
  title: opener.title,
  ref: quotes[0].ref,
  verse: quotes[0].text,
  note: introNote,
  text: openerParas.filter((p) => p !== introNote),
  quotes,
  declaration: series.declaration,
};

// ── days
const days = [];
for (const s of sections) {
  const dm = /^Day (\d+)\s*·\s*(.+)$/.exec(s.title);
  if (!dm) continue;
  const day = Number(dm[1]);
  const b = s.body;
  const part = [...s.pre.matchAll(/<h2>PART ([A-Z]+) · ([^<]+)<\/h2>/g)].pop();
  const partNo = part ? ["ONE", "TWO", "THREE", "FOUR"].indexOf(part[1]) + 1 : null;
  // meta line: "<em>Tuesday, December 1</em> · Main text X · Read aloud Y · Also A; B"
  const meta = text(b.match(/<p><em>[\s\S]*?<\/p>/)[0]);
  const mm = /Main text (.+?) · Read aloud (.+?)(?: · Also (.+))?$/.exec(meta);
  const bq = text(b.match(/<blockquote><p>([\s\S]*?)<\/p><\/blockquote>/)[1]);
  const vm = /^(.*?)\s+—\s+(.+?)\s*\(KJV[^)]*\)\s*$/.exec(bq);
  const sec = (name) => {
    const re = new RegExp(`<h2>${name} · [\\d:–]+<\\/h2>([\\s\\S]*?)(?=<h2>|$)`);
    const m = b.match(re);
    if (!m) throw new Error(`day ${day}: no section "${name}"`);
    return m[1];
  };
  const watch = sec("Watch The Film");
  const fm = /`([^`]+\.mp4)`\s*·\s*([\d:]+)\s*·\s*film\s+([\d:]+)[–-]([\d:]+)/.exec(text(watch));
  if (!fm) throw new Error(`day ${day}: no film range`);
  const watchParas = [...watch.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]).filter((p) => !/^▶/.test(p));
  const wordPara = [...sec("Read And Explain The Word").matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => text(m[1]));
  const truths = [...sec("Three Teaching Truths").matchAll(/<p><strong>(\d)\.\s*([\s\S]*?)<\/strong>\s*([\s\S]*?)<\/p>/g)].map((m) => ({ n: Number(m[1]), title: fixTitle(text(m[2]).replace(/\.$/, "")), body: text(m[3]) }));
  const resp = sec("Response");
  const child = (resp.match(/<strong>For a child:<\/strong>\s*([\s\S]*?)<\/p>/) || [])[1];
  const father = (resp.match(/<strong>For a father:<\/strong>\s*([\s\S]*?)<\/p>/) || [])[1];
  const tnote = (resp.match(/<p><em>\[([\s\S]*?)\]<\/em><\/p>/) || [])[1];
  const pr = sec("Three Prayers");
  const prayers = [...pr.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]));
  const decl = text((pr.match(/<strong>Together we declare:\s*([\s\S]*?)<\/strong>/) || [])[1] || "");
  const dm2 = new Date(Date.UTC(2026, 11, day));
  days.push({
    day,
    title: fixTitle(dm[2].trim()),
    date: `2026-12-${String(day).padStart(2, "0")}`,
    dateLabel: `${DOW[dm2.getUTCDay()]} ${day} DEC`,
    part: part ? part[2].trim() : "",
    partNo,
    ref: mm?.[1] ?? "",
    readAloud: mm?.[2] ?? "",
    also: mm?.[3] ? mm[3].split(/;\s*/) : [],
    verse: vm ? unq(vm[1]) : unq(bq),
    verseRef: vm ? vm[2] : "",
    film: { file: fm[1], from: secs(fm[3]), to: secs(fm[4]), dur: secs(fm[4]) - secs(fm[3]) },
    story: text(watchParas.join(" ")),
    word: wordPara.join(" "),
    truths,
    response: { child: child ? text(child) : "", father: father ? text(father) : "" },
    teacherNote: tnote ? text(tnote) : "",
    prayers,
    declaration: unq(decl),
  });
}

const out = {
  series,
  opener: openerOut,
  days: days.sort((a, b) => a.day - b.day),
  closing: { title: closing.title, declaration: text((closing.body.match(/<strong>([\s\S]*?)<\/strong>/) || [])[1] || ""), quote: text((closing.body.match(/<blockquote><p>([\s\S]*?)<\/p>/) || [])[1] || "") },
};

// ── validate
const bad = [];
if (out.days.length !== 30) bad.push(`days: ${out.days.length} != 30`);
for (const d of out.days) {
  if (d.truths.length !== 3) bad.push(`day ${d.day}: ${d.truths.length} truths`);
  if (d.prayers.length !== 3) bad.push(`day ${d.day}: ${d.prayers.length} prayers`);
  if (!(d.film.to > d.film.from)) bad.push(`day ${d.day}: film range`);
  if (!d.verse || !d.ref || !d.verseRef) bad.push(`day ${d.day}: verse/ref`);
  if (!d.response.child || !d.response.father) bad.push(`day ${d.day}: response`);
  if (!d.declaration || !d.story || !d.word) bad.push(`day ${d.day}: story/word/declaration`);
  if (d.ref !== d.verseRef.replace(/\s+/g, " ")) bad.push(`day ${d.day}: ref "${d.ref}" != verse ref "${d.verseRef}"`);
}
for (const k of ["title", "subtitle", "tagline", "declaration", "phone", "site"]) if (!out.series[k]) bad.push(`series.${k} empty`);
if (!out.opener.text.length) bad.push("opener text empty");

writeJson(`${ROOT}/december/series.json`, out, 1);

console.log("day  date        ref                    film(s)         tr pr  title");
for (const d of out.days)
  console.log(`${String(d.day).padStart(2)}   ${d.dateLabel.padEnd(10)}  ${d.ref.padEnd(21)}  ${`${d.film.from}-${d.film.to} (${d.film.dur})`.padEnd(14)}  ${d.truths.length}  ${d.prayers.length}  ${d.title}`);
console.log(`series: ${JSON.stringify(out.series, null, 0).slice(0, 400)}`);
console.log(`opener: "${out.opener.title}" ${out.opener.ref}, ${out.opener.text.length} paragraphs, ${out.opener.quotes.length} quotes`);
if (bad.length) {
  console.error("VALIDATION FAILED:\n" + bad.join("\n"));
  process.exit(1);
}
console.log("OK -> december/series.json");
