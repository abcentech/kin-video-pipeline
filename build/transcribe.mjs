import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('no key'); process.exit(1); }
const MODEL = 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com';

async function uploadFile(filePath) {
  const bytes = fs.readFileSync(filePath);
  const mime = 'audio/mpeg';
  // start resumable upload
  const startRes = await fetch(`${BASE}/upload/v1beta/files?key=${KEY}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: path.basename(filePath) } }),
  });
  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('no upload url: ' + startRes.status + ' ' + (await startRes.text()));
  const upRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(bytes.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: bytes,
  });
  const info = await upRes.json();
  return info.file;
}

async function waitActive(file) {
  let f = file;
  while (f.state === 'PROCESSING') {
    await new Promise(r => setTimeout(r, 2000));
    const r = await fetch(`${BASE}/v1beta/${f.name}?key=${KEY}`);
    f = await r.json();
  }
  return f;
}

const PROMPT = `Transcribe this audio in full. Return ONLY valid JSON, no markdown fences.
Format: {"language":"...", "segments":[{"start":<seconds number>,"end":<seconds number>,"text":"..."}]}
Break into natural sentence-level segments with accurate start/end timestamps in seconds. Include everything spoken.`;

async function transcribe(filePath) {
  console.error('uploading', filePath);
  let file = await uploadFile(filePath);
  file = await waitActive(file);
  if (file.state !== 'ACTIVE') throw new Error('file not active: ' + JSON.stringify(file));
  console.error('transcribing', file.name);
  const res = await fetch(`${BASE}/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: PROMPT },
        { file_data: { mime_type: 'audio/mpeg', file_uri: file.uri } },
      ] }],
      generationConfig: { temperature: 0, maxOutputTokens: 65536, responseMimeType: 'application/json' },
    }),
  });
  let data = await res.json();
  let tries = 0;
  while (data.error && data.error.code === 429 && tries < 8) {
    const m = JSON.stringify(data.error).match(/retry in ([0-9.]+)s/i);
    const wait = m ? Math.ceil(parseFloat(m[1])) + 2 : 30;
    console.error(`  429, waiting ${wait}s (try ${tries + 1})`);
    await new Promise(r => setTimeout(r, wait * 1000));
    const r2 = await fetch(`${BASE}/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [ { text: PROMPT }, { file_data: { mime_type: 'audio/mpeg', file_uri: file.uri } } ] }],
        generationConfig: { temperature: 0, maxOutputTokens: 65536, responseMimeType: 'application/json' },
      }),
    });
    data = await r2.json();
    tries++;
  }
  if (data.error) throw new Error(JSON.stringify(data.error));
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  return text;
}

const target = process.argv[2];
const out = await transcribe(target);
const base = path.basename(target).replace(/\.mp3$/, '');
fs.writeFileSync(`build/transcripts/${base}.json`, out);
console.error('wrote build/transcripts/' + base + '.json (' + out.length + ' chars)');
