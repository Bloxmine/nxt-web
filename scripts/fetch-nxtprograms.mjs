#!/usr/bin/env node
// Downloads the NXT 2.0 example programs (.rbt) from nxtprograms.com into
// fixtures/external/nxtprograms/ for local compatibility testing.
//
// These files are © nxtprograms.com and may be downloaded for personal use but
// not redistributed (https://www.nxtprograms.com/copyright.html), so the folder
// is git-ignored. Do not commit them.
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
      for (const href of links(html, /\.rbt$/i))
        programs.set(new URL(href, new URL(page, base)).href, project);
    } catch {
      // Not every project has every page.
    }
  }
}

let fetched = 0;
for (const url of programs.keys()) {
  const name = decodeURIComponent(url.split('/').pop());
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
