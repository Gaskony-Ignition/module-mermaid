// Writes THIRD-PARTY-LICENSES.txt beside the bundle: MIT and similar licences require the notice
// to travel with every copy, and webpack's *.LICENSE.txt keeps only @license comments.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', 'build', 'generated-resources', 'mounted', 'THIRD-PARTY-LICENSES.txt');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const dirs = execFileSync(npm, ['ls', '--omit=dev', '--all', '--parseable'], { encoding: 'utf8', shell: process.platform === 'win32' })
  .split(/\r?\n/).filter((d) => d.includes('node_modules'));

const sections = [...new Set(dirs)].sort().map((dir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const file = fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  const text = file ? fs.readFileSync(path.join(dir, file), 'utf8').trim() : `License: ${pkg.license ?? 'not stated'}`;
  return `${pkg.name} ${pkg.version}\n${'-'.repeat(79)}\n${text}\n`;
});

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, sections.join('\n\n'));
console.log(`third-party-licences: ${sections.length} packages -> ${path.relative(process.cwd(), out)}`);
