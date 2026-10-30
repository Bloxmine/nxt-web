#!/usr/bin/env node
// Downloads the NXT 2.0 example programs (.rbt) from nxtprograms.com into
// fixtures/external/nxtprograms/ for local compatibility testing.
//
// These files are © nxtprograms.com and may be downloaded for personal use but
// not redistributed (https://www.nxtprograms.com/copyright.html), so the folder
// is git-ignored. Do not commit them.
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SITE = 'https://www.nxtprograms.com/';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/external/nxtprograms');
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) nxt-web-studio compatibility tests',
  Accept: 'text/html,application/octet-stream,*/*',
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  await wait(300); // be polite
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

/** .rbt files inside a zip archive (stored or deflated entries). */
function rbtFromZip(buf) {
  const out = [];
  // End of central directory record.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < count && buf.readUInt32LE(p) === 0x02014b50; k++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('latin1');
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.rbt$/i.test(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    out.push({ name: name.split('/').pop(), bytes: method === 8 ? inflateRawSync(data) : data });
  }
  return out;
}

const links = (html, pattern) =>
  [...html.matchAll(/href\s*=\s*"([^"]+)"/gi)].map((m) => m[1]).filter((h) => pattern.test(h));

mkdirSync(OUT, { recursive: true });
const index = await (await get(`${SITE}index2.html`)).text();
const projects = [...new Set(links(index, /^NXT2\/[^/]+\/index\.html$/i))];
console.log(`${projects.length} NXT 2.0 projects`);

const programs = new Map();
for (const project of projects) {
  const base = new URL(project, SITE);
  for (const page of ['index.html', 'steps.html', 'program.html']) {
    try {
      const html = await (await get(new URL(page, base).href)).text();
      for (const href of links(html, /programs\d*\/[^/]+\.(rbt|zip)$/i))
        programs.set(new URL(href, new URL(page, base)).href, project);
    } catch {
      // Not every project has every page.
    }
  }
}

let fetched = 0;
for (const url of programs.keys()) {
  const name = decodeURIComponent(url.split('/').pop());
  if (/\.zip$/i.test(name)) {
    try {
      const buf = Buffer.from(await (await get(url)).arrayBuffer());
      for (const entry of rbtFromZip(buf)) {
        const file = join(OUT, entry.name);
        if (existsSync(file)) continue;
        writeFileSync(file, entry.bytes);
        fetched++;
        console.log(`  ${entry.name} (from ${name})`);
      }
    } catch (error) {
      console.warn(`  skipped ${name}: ${error.message}`);
    }
    continue;
  }
  const file = join(OUT, name);
  if (existsSync(file)) continue;
  try {
    writeFileSync(file, new Uint8Array(await (await get(url)).arrayBuffer()));
    fetched++;
    console.log(`  ${name}`);
  } catch (error) {
    console.warn(`  skipped ${name}: ${error.message}`);
  }
}
console.log(`${programs.size} programs found, ${fetched} downloaded to ${OUT}`);

// Pack and Go (.rbtx) samples from SuGO (sugobot.com), for the .rbtx importer tests.
const RBTX = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/external/rbtx');
mkdirSync(RBTX, { recursive: true });
for (const name of ['SuGO_PV1', 'Mechanic_PV1', 'SuGO_C2', 'Mechanic_C2']) {
  const file = join(RBTX, `${name}.rbtx`);
  if (existsSync(file)) continue;
  try {
    const res = await get(`http://www.sugobot.com/downloads/NXT-G/${name}.rbtx`);
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
    console.log(`  ${name}.rbtx`);
  } catch (error) {
    console.warn(`  skipped ${name}.rbtx: ${error.message}`);
  }
}
