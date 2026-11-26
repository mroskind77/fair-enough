// Edge functions deploy as a single index.ts each, so shared code can't be imported at runtime.
// Files in supabase/functions/_shared/ are the one place to edit; this copies each, verbatim, between markers into
// every function that uses it. Run after editing: node scripts/sync-shared.mjs  (add --check to only verify).
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../supabase/functions/', import.meta.url);
const MODULES = [
	{ name: 'transitous', targets: ['search', 'diag', 'geo', 'probe'] },
	// Pure rules (RULES.md) also used by the tests in /tests.
	{ name: 'rules', targets: ['search'], stripExport: true },
	// Suggestion duplicate grouping and wrong-city checks (RULES.md), also used by /tests.
	{ name: 'suggest', targets: ['geo'], stripExport: true },
];
const check = process.argv.includes('--check');
let stale = 0;

for (const mod of MODULES) {
	const raw = readFileSync(new URL(`_shared/${mod.name}.ts`, ROOT), 'utf8').trimEnd();
	// `stripExport`: inside index.ts these are plain module-level declarations.
	const SRC = mod.stripExport ? raw.replace(/^export /gm, '') : raw;
	const START = `// ───── shared:${mod.name} — generated from _shared/${mod.name}.ts, edit there and run scripts/sync-shared.mjs ─────`;
	const END = `// ───── end shared:${mod.name} ─────`;
	for (const fn of mod.targets) {
		const url = new URL(`${fn}/index.ts`, ROOT);
		const text = readFileSync(url, 'utf8');
		const block = `${START}\n${SRC}\n${END}`;
		let next;
		const a = text.indexOf(START);
		const b = text.indexOf(END);
		if (a >= 0 && b > a) next = text.slice(0, a) + block + text.slice(b + END.length);
		else {
			// First run: replace the import of the shared file with the block.
			const re = new RegExp(`^import (?:type )?\\{[^}]*\\} from '\\.\\./_shared/${mod.name}\\.ts';\\n`, 'm');
			if (!re.test(text)) throw new Error(`${fn}: no marker and no shared import for ${mod.name}`);
			next = text.replace(re, block + '\n');
		}
		if (next !== text) {
			stale++;
			if (!check) writeFileSync(url, next);
		}
		console.log(`${fn} ← ${mod.name}: ${next === text ? 'up to date' : check ? 'STALE' : 'updated'}`);
	}
}
if (check && stale) process.exit(1);
