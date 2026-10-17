// Explicit maintenance command. App startup/builds never download language data.
const fs = require('node:fs/promises');
const path = require('node:path');
const YAML = require('yaml');
const revision = '681a3171a3f8d1ccab93e646e7753cba42186915';
const ids = { 'C++': 'cpp', 'C#': 'csharp', 'F#': 'fsharp', 'JavaScript': 'javascript', 'TypeScript': 'typescript', 'Shell': 'shell', 'Batchfile': 'bat', 'Text': 'plaintext', 'Assembly': 'asm', 'Objective-C': 'objective-c', 'Objective-C++': 'objective-cpp', 'Vue': 'vue', 'Fortran': 'fortran', 'Fortran Free Form': 'fortran-free-form' };
async function download(file) {
  const response = await fetch(`https://raw.githubusercontent.com/github-linguist/linguist/${revision}/${file}`);
  if (!response.ok) throw new Error(`Catalog download failed: ${response.status}`);
  return response.text();
}
(async () => {
  const languages = YAML.parse(await download('lib/linguist/languages.yml'));
  const entries = Object.entries(languages).map(([name, value]) => ({ id: ids[name] ?? name.toLowerCase().replace(/\+\+/g, 'pp').replace(/#/g, 'sharp').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, type: value.type, extensions: value.extensions ?? [], filenames: value.filenames ?? [], aliases: value.aliases ?? [], interpreters: value.interpreters ?? [], scope: value.tm_scope }));
  const unique = new Set();
  for (const entry of entries) { if (unique.has(entry.id)) throw new Error(`Duplicate language id ${entry.id}`); unique.add(entry.id); }
  await fs.mkdir(path.resolve('src/data'), { recursive: true });
  await fs.writeFile(path.resolve('src/data/languages.json'), JSON.stringify({ source: `github-linguist/linguist@${revision}`, languages: entries }, null, 2) + '\n');
  await fs.writeFile(path.resolve('docs/LINGUIST-LICENSE.txt'), await download('LICENSE'));
  console.log(`Vendored ${entries.length} language definitions from pinned Linguist data.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
