import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('no key'); process.exit(1); }
const MODEL = 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com';

async function uploadFile(filePath) {
  const bytes = fs.readFileSync(filePath);
  const startRes = await fetch(`${BASE}/upload/v1beta/files?key=${KEY}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': 'audio/mpeg',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: path.basename(filePath) } }),
  });
  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('no upload url: ' + startRes.status + ' ' + (await startRes.text()));
  const upRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Length': String(bytes.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: bytes,
  });
  return (await upRes.json()).file;
}
async function waitActive(file) {
  let f = file;
  while (f.state === 'PROCESSING') { await new Promise(r => setTimeout(r, 1500)); f = await (await fetch(`${BASE}/v1beta/${f.name}?key=${KEY}`)).json(); }
  return f;
}

const PROMPT = `Transcribe this short audio clip with WORD-LEVEL timestamps. Return ONLY valid JSON (no markdown).
Format: {"words":[{"w":"word","start":<seconds>,"end":<seconds>}]}
Timestamps in seconds relative to clip start. One entry per spoken word, in order, accurate timing. Keep punctuation attached to the word it belongs to.`;

async function run(filePath) {
  let file = await uploadFile(filePath);
  file = await waitActive(file);
  if (file.state !== 'ACTIVE') throw new Error('not active');
  const body = {
    contents: [{ parts: [{ text: PROMPT }, { file_data: { mime_type: 'audio/mpeg', file_uri: file.uri } }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 16384, responseMimeType: 'application/json' },
  };
  let data = await (await fetch(`${BASE}/v1beta/models/${MODEL}:generateContent?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  let tries = 0;
  while (data.error && data.error.code === 429 && tries < 6) {
    const m = JSON.stringify(data.error).match(/retry in ([0-9.]+)s/i);
    const wait = m ? Math.ceil(parseFloat(m[1])) + 2 : 25;
    console.error(`429, waiting ${wait}s`); await new Promise(r => setTimeout(r, wait * 1000));
    data = await (await fetch(`${BASE}/v1beta/models/${MODEL}:generateContent?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    tries++;
  }
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
}

const target = process.argv[2];
const out = await run(target);
const base = path.basename(target).replace(/\.mp3$/, '');
fs.writeFileSync(`build/transcripts/${base}.words.json`, out);
console.error(`wrote build/transcripts/${base}.words.json (${out.length} chars)`);
