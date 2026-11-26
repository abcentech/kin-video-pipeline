// scripts/december/art.mjs <N> [--only=id,id] [--dry] [--edit=path] — generate the day's illustration plates.
//
// For every plate in edit.art without december-public/dayNN/art/<id>.jpg: ONE image per Codex call, sequentially,
//   codex exec --skip-git-repo-check -s workspace-write -      (instructions on stdin, cwd = a scratch dir, 9 min timeout)
// then the PNG is kept in december/work/dayNN/art/<id>.png and converted to a 1920x1080 JPEG (cover crop, quality 92).
// Only the picture description is ever sent to Codex (no names, no project paths). Resumable; never regenerates.
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { ROOT, pad, loadEdit, exists, ff, log } from "./lib.mjs";
import { args, dayArg } from "./back.mjs";

/** THE style of the series — one place, one wording. */
export const STYLE = "Painterly storybook illustration, rich gouache texture, warm candle-amber light against deep teal night, West African family setting, cinematic composition, soft rim light, emotional and hopeful, no text, no letters, no watermark.";
const SPACE = {
  top: "Leave a large calm empty area at the top of the frame for titles.",
  left: "Leave a large calm empty area on the left of the frame for titles.",
  right: "Leave a large calm empty area on the right of the frame for titles.",
};
const TIMEOUT_MS = 9 * 60 * 1000;

export const describe = (plate) => {
  const p = plate.prompt.trim().replace(/\s+/g, " ");
  return [/[.!?]$/.test(p) ? p : p + ".", STYLE, SPACE[plate.space] ?? ""].filter(Boolean).join(" ");
};
export const instructions = (plate) => `Use your built-in image generation tool to generate ONE 16:9 landscape image and save it in the current directory as ${plate.id}.png. Do not write code or draw it with scripts. The picture: ${describe(plate)}`;

function codex(prompt, cwd) {
  return new Promise((resolve) => {
    const p = spawn(process.platform === "win32" ? "codex.cmd" : "codex", ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-"], { cwd, shell: true, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(p.pid), "/T", "/F"]);
      else p.kill("SIGKILL");
      resolve({ code: -9, out: out + "\n[timed out after 9 minutes]" });
    }, TIMEOUT_MS);
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
    p.on("error", (e) => resolve({ code: -1, out: String(e) }));
    p.stdin.end(prompt);
  });
}

async function main() {
  const n = dayArg();
  const edit = loadEdit(n, args.edit);
  const plates = edit.art ?? [];
  const only = args.only && args.only !== true ? String(args.only).split(",") : null;
  const artDir = `${ROOT}/december-public/day${pad(n)}/art`;
  const tmpArt = `${ROOT}/december/work/day${pad(n)}/art`;
  const todo = plates.filter((p) => (!only || only.includes(p.id)) && !exists(`${artDir}/${p.id}.jpg`));
  log(`day ${n}: ${plates.length} plates in the edit, ${plates.length - todo.length} done/skipped, ${todo.length} to generate`);
  if (only) for (const id of only) if (!plates.some((p) => p.id === id)) console.error(`  ! --only=${id}: no such plate in edit.art`);
  if (args.dry) {
    for (const p of todo) console.log(`\n── ${p.id} → ${artDir}/${p.id}.jpg\n${instructions(p)}`);
    return;
  }
  fs.mkdirSync(artDir, { recursive: true });
  fs.mkdirSync(tmpArt, { recursive: true });
  let failed = 0;
  for (const [k, p] of todo.entries()) {
    const png = `${tmpArt}/${p.id}.png`;
    if (!exists(png)) {
      const work = `${tmpArt}/work-${p.id}`;
      fs.rmSync(work, { recursive: true, force: true });
      fs.mkdirSync(work, { recursive: true });
      log(`[${k + 1}/${todo.length}] generating ${p.id} (≈ 3 min) …`);
      const t0 = Date.now();
      const r = await codex(instructions(p), work);
      const got = fs.readdirSync(work).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort((a, b) => (a === `${p.id}.png` ? -1 : b === `${p.id}.png` ? 1 : 0));
      if (!got.length) {
        failed++;
        fs.writeFileSync(`${tmpArt}/${p.id}.codex.log`, r.out);
        console.error(`  ✗ ${p.id}: codex exit ${r.code}, no image produced (log: ${tmpArt}/${p.id}.codex.log)`);
        continue;
      }
      const ext = path.extname(got[0]).toLowerCase();
      fs.copyFileSync(`${work}/${got[0]}`, ext === ".png" ? png : `${tmpArt}/${p.id}${ext}`);
      if (ext !== ".png") fs.copyFileSync(`${work}/${got[0]}`, `${tmpArt}/${p.id}.src${ext}`);
      fs.rmSync(work, { recursive: true, force: true });
      log(`  ${p.id}: image in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    const src = exists(png) ? png : fs.readdirSync(tmpArt).map((f) => `${tmpArt}/${f}`).find((f) => path.basename(f).startsWith(`${p.id}.`) && /\.(jpe?g|webp)$/i.test(f));
    await ff(["-i", src, "-vf", "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080", "-frames:v", "1", "-q:v", "2", "-pix_fmt", "yuvj420p", `${artDir}/${p.id}.jpg`]);
    log(`  ${p.id}: ${artDir}/${p.id}.jpg (${(fs.statSync(`${artDir}/${p.id}.jpg`).size / 1e6).toFixed(2)} MB)`);
  }
  if (failed) {
    console.error(`${failed} plate(s) failed — re-run to retry only those`);
    process.exit(1);
  }
  log("art done");
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
