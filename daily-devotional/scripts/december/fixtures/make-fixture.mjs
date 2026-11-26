// Builds the synthetic test fixture for plan.mjs: body.json, series.json, edit.json (deterministic).
//   node scripts/december/fixtures/make-fixture.mjs   -> writes the three files next to this script
// The edit's anchors are found by searching the spoken text, so the fixture stays valid when the script changes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// six kept segments; join = how the segment starts (the first is "start")
const SEGMENTS = [
  { join: "start", text: "Hello friends, and welcome to the very first night of our December devotional. He has never once been late. My name is Pastor Daniel and I am so glad that you are here with us tonight." },
  { join: "cut", text: "Some of us have waited for a father who said I am coming, and then, um, did not come. Maybe you waited at a door. Maybe you waited by a window. I want you to hear this clearly. It was never your fault. Grown up problems are never a child's problem." },
  { join: "soft", text: "Now let us read what the apostle Paul wrote to the church in Galatia. But when the fulness of the time was come, God sent forth his Son, made of a woman, made under the law, to redeem them that were under the law, that we might receive the adoption of sons." },
  { join: "cut", text: "Did you hear that? When the fulness of the time was come. God chose the hour, and God kept the hour. People promise what they cannot give. God has never made a promise that He could not keep. He did not send an excuse. He sent His own Son, born small in Bethlehem. Every waiting child, and every father who failed, can now say one word. Father." },
  { join: "soft", text: "So here is the first truth for tonight. The Father sent His Son right on time. Now this part is for the child. I know that my Father is never late. And this part is for the father. I will keep my promise and I will show up. Take a deep breath with me. Let us pray. Father in heaven, thank you that you are never late. Thank you for sending your Son. Hold every waiting child tonight. In Jesus name, amen. Thank you for praying with me tonight." },
  { join: "cut", text: "So tonight we learned three things. God is never late. He sent His own Son. And it is never your fault. Now say it with me. My Father in heaven is never late. Goodnight, my friends, and God bless you all. We will see you again tomorrow night, and every night this month." },
];

export function buildFixture() {
  const words = [];
  const segments = [];
  let f = 20; // a little room before the first word
  let id = 12; // ids 0–11 were slate chatter that was cut
  let srcT = 31.4;
  for (const seg of SEGMENTS) {
    const start = segments.length === 0 ? 0 : f;
    const srcStart = srcT;
    for (const tok of seg.text.split(/\s+/)) {
      const dur = Math.round(5 + tok.length * 1.15);
      words.push({ i: id++, text: tok, from: f, to: f + dur, src: [Number((srcT + (f - start) / 30).toFixed(3)), Number((srcT + (f - start + dur) / 30).toFixed(3))] });
      f += dur;
      f += /[.?!]$/.test(tok) ? 16 : /,$/.test(tok) ? 7 : 2;
    }
    const end = f + 6;
    segments.push({ src: [Number(srcStart.toFixed(3)), Number((srcStart + (end - start) / 30).toFixed(3))], body: [start, end], join: seg.join });
    f = end;
    srcT += (end - start) / 30 + 4.2; // dead air / retake dropped between segments
    id += 3 + segments.length; // the cut words
  }
  const body = { day: 1, fps: 30, frames: f, duration: f / 30, segments, words, face: { x: 0.47, y: 0.36, h: 0.3 }, track: Array.from({ length: Math.ceil(f / 15) }, (_, k) => [k * 15, Number((0.47 + 0.09 * Math.sin(k / 5)).toFixed(4)), Number((0.36 + 0.01 * Math.sin(k / 3)).toFixed(4))]) };

  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const W = (phrase, nth = 0) => {
    const p = phrase.split(/\s+/).map(norm);
    let seen = 0;
    for (let k = 0; k + p.length <= words.length; k++) {
      if (p.every((x, j) => norm(words[k + j].text) === x)) {
        if (seen++ === nth) return [`w${words[k].i}`, `w${words[k + p.length - 1].i}`];
      }
    }
    throw new Error(`fixture: phrase not found: ${phrase}`);
  };
  const A = (phrase, nth) => W(phrase, nth)[0];
  const E = (phrase, nth) => `end:${W(phrase, nth)[1]}`;

  const series = {
    series: { title: "The Father Showed Up", declaration: "GOD IS MY FATHER. HE KNOWS MY NAME. HE HAS NEVER BEEN LATE." },
    opener: { title: "To Every Child", ref: "2 Corinthians 6:18", verse: "And will be a Father unto you." },
    days: [
      {
        day: 1,
        title: "The Father Who Is Never Late",
        dateLabel: "TUE 1 DEC",
        ref: "Galatians 4:4–5",
        verse: "But when the fulness of the time was come, God sent forth his Son, made of a woman, made under the law, To redeem them that were under the law, that we might receive the adoption of sons.",
        film: { file: "Day01.mp4", from: 4, to: 54, dur: 50 },
        truths: [{ n: 1, title: "Grown-Up Problems Are Not Your Fault" }, { n: 2, title: "The Father Sent His Son, Right On Time" }, { n: 3, title: "Wait With Hope" }],
        declaration: "My Father in heaven is never late.",
      },
      { day: 2, title: "He Knows Your Name", dateLabel: "WED 2 DEC", ref: "Isaiah 43:1", verse: "I have called thee by thy name; thou art mine.", truths: [], declaration: "He knows my name." },
    ],
  };

  const KJV = "But when the *fulness of the time* was come, God sent forth his Son, made of a woman, made under the law, To redeem them that were under the law, that we might receive the adoption of sons.".replace(/\*fulness of the time\*/, "**fulness of the time**");
  const edit = {
    day: 1,
    presenter: { name: "Pastor Daniel", role: "KIN Pastor" },
    fix: { [W("um")[0].slice(1)]: "", [W("Galatia")[0].slice(1)]: "Galatia." },
    keep: [[`w${words[0].i}`, `w${words[words.length - 1].i}`]],
    hook: [
      { span: W("He has never once been late"), say: "He has *never* once been *late.*", cam: ["tight", "tight"], big: { text: "NEVER *LATE*" } },
      { span: W("It was never your fault"), say: "It was never your *fault.*", big: { text: "YOUR *FAULT*", on: A("fault", 0) } },
    ],
    film: { play: true, from: 0 },
    cues: [
      { kind: "ident", at: A("My name is Pastor") },
      { kind: "chapter", at: A("Some of us have waited"), label: "TRUTH 1 OF 3", title: "Grown-Up *Problems* Are Not Your Fault", numeral: 1 },
      { kind: "keyword", at: A("It was never"), text: "NOT *YOUR* FAULT" },
      { kind: "snap", at: A("clearly") },
      { kind: "point", at: A("Grown up problems"), to: E("a child's problem"), text: "Grown-up problems are *never* a child's problem", sync: W("Grown up problems are never a child's problem") },
      { kind: "scripture", at: A("But when the fulness"), mode: "page", ref: "Galatians 4:4–5", text: KJV, read: [A("But when the fulness"), E("the adoption of sons")], flourish: true },
      { kind: "subscribe", at: A("God has never made a promise"), variant: "subscribe" },
      { kind: "art", at: A("People promise what"), dur: 3, plate: "wait-door", mode: "side" },
      { kind: "art", at: A("He did not send an excuse"), to: E("born small in Bethlehem"), plate: "bethlehem", mode: "full", caption: "Born small in *Bethlehem*" },
      { kind: "response", at: A("Now this part is for the child"), to: E("I will show up"), child: { text: "I know that my Father is never late.", sync: W("I know that my Father is never late") }, father: { text: "I will keep my promise and I will show up.", sync: W("I will keep my promise and I will show up") } },
      { kind: "prayer", at: A("Let us pray"), to: E("In Jesus name, amen"), lines: [{ text: "Father in heaven, thank you that you are never late.", sync: W("Father in heaven, thank you that you are never late") }, { text: "Thank you for sending your Son.", sync: W("Thank you for sending your Son") }, { text: "Hold every waiting child tonight." }] },
      { kind: "recap", at: A("So tonight we learned three things"), items: ["Grown-up problems are not your fault", "The Father sent His Son, right on time", "God has never been late"] },
      { kind: "declare", at: A("My Father in heaven is never late"), text: "MY FATHER IN HEAVEN | IS **NEVER LATE.**", sync: W("My Father in heaven is never late") },
    ],
    art: [
      { id: "wait-door", prompt: "A small boy sits on the doorstep of a mud-brick house at dusk, looking down the empty road, an oil lantern glowing beside him", lights: [{ x: 0.3, y: 0.7, r: 0.08, kind: "flicker" }], move: "push", space: "right" },
      { id: "bethlehem", prompt: "A quiet stable in Bethlehem under a huge sky of stars, a mother holds a newborn in amber lantern light", lights: [{ x: 0.5, y: 0.6, r: 0.1, kind: "glow" }, { x: 0.5, y: 0.1, r: 0.3, kind: "twinkle" }], move: "pull", space: "top" },
    ],
    safeguard: true,
    trailer: [
      { kind: "line", mood: "cold", span: W("He has never once been late"), say: "He has *never* once been *late.*", big: { text: "NEVER *LATE*" } },
      { kind: "title" },
      { kind: "line", mood: "tension", span: W("Some of us have waited for a father"), say: "Some of us have *waited* for a father" },
      { kind: "film", from: 6, dur: 4 },
      { kind: "line", mood: "tension", span: W("Maybe you waited at a door") },
      { kind: "line", mood: "tension", span: W("Maybe you waited by a window") },
      { kind: "film", from: 20, dur: 4, focusX: 40 },
      { kind: "verse", ref: "Galatians 4:4", text: "But when the **fulness of the time** was come, God sent forth his Son", read: [A("But when the fulness"), E("sent forth his Son")] },
      { kind: "line", mood: "turn", span: W("God chose the hour, and God kept the hour"), say: "God chose the hour | and God *kept* the hour", big: { text: "*KEPT*" } },
      { kind: "line", mood: "turn", span: W("He sent His own Son"), say: "He sent His own *Son.*" },
      { kind: "line", mood: "button", span: W("Every waiting child, and every father who failed, can now say one word") },
      { kind: "end" },
    ],
    shorts: [
      {
        id: "word",
        title: "THE *FULNESS* | OF THE TIME",
        lines: [{ span: W("Now let us read what the apostle Paul wrote to the church in Galatia") }, { span: W("Did you hear that"), say: "Did you hear that?" }, { span: W("When the fulness of the time was come", 1) }, { span: W("God chose the hour, and God kept the hour") }],
        verse: { ref: "Galatians 4:4–5", text: KJV, read: [A("But when the fulness"), E("the adoption of sons")] },
        post: "God chose the hour. #TheFatherShowedUp",
      },
      {
        id: "truth",
        title: "IT IS NEVER | *YOUR FAULT*",
        lines: [{ span: W("Some of us have waited for a father who said I am coming") }, { span: W("Maybe you waited at a door") }, { span: W("Maybe you waited by a window") }, { span: W("I want you to hear this clearly. It was never your fault. Grown up problems are never a child's problem") }],
        post: "It was never your fault. #TheFatherShowedUp",
      },
      {
        id: "prayer",
        title: "A PRAYER FOR | *EVERY CHILD*",
        lines: [{ span: W("Let us pray") }, { span: W("Father in heaven, thank you that you are never late") }, { span: W("Thank you for sending your Son") }, { span: W("Hold every waiting child tonight") }, { span: W("Now say it with me. My Father in heaven is never late") }, { span: W("Goodnight, my friends, and God bless you all") }],
        post: "Say it with us. #TheFatherShowedUp",
      },
    ],
    social: { titles: ["The Father Who Is Never Late | Day 1", "He Has Never Been Late — Galatians 4:4", "A Devotional For Every Waiting Child"], description: "Day 1 of The Father Showed Up. Tonight: God is never late.", pinned: "Who are you waiting for tonight? Tell us below.", hashtags: ["#TheFatherShowedUp", "#KIN"], thumbnail: { line: "NEVER *LATE*", frame: A("He has never once been late") } },
  };
  return { body, series, edit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { body, series, edit } = buildFixture();
  fs.writeFileSync(path.join(here, "body.json"), JSON.stringify(body, null, 1));
  fs.writeFileSync(path.join(here, "series.json"), JSON.stringify(series, null, 1));
  fs.writeFileSync(path.join(here, "edit.json"), JSON.stringify(edit, null, 1));
  console.log(`fixture written to ${here}: ${body.words.length} words, ${body.segments.length} segments, ${body.frames} frames`);
}
