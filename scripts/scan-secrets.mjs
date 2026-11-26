// Secrets scan (RULES.md 22). Prints file, line and the KIND/NAME of each finding — never the value.
// Usage: node scripts/scan-secrets.mjs [dir ...]   (default: the project, without node_modules / build output)
//        node scripts/scan-secrets.mjs --bundle <dir>   (scan built JS/CSS/HTML, e.g. .output/public)
// Exit 1 when a real secret is found. Public-by-design values (Supabase anon/publishable key, project URL) are listed
// as "public" and don't fail the scan.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const bundle = args[0] === '--bundle';
const roots = (bundle ? args.slice(1) : args).length ? (bundle ? args.slice(1) : args) : ['.'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.output', '.wrangler', '.tanstack', '.vite', '.nitro', 'dist', '.sc']);
const BINARY = /\.(png|jpe?g|webp|gif|ico|avif|woff2?|ttf|otf|eot|mp4|webm|pdf|zip|gz)$/i;
const SELF = 'scripts/scan-secrets.mjs';

const NAMES = ['IP_HASH_SECRET', 'GEOAPIFY_KEY', 'LOCATIONIQ_KEY', 'HEIGIT_KEY', 'DIAG_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL', 'SERVICE_ROLE'];

/** [kind, regex, check?] — check returns 'secret' | 'public' | null (ignore). */
const RULES = [
	['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
	['connection string with password', /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:'"`/]+:[^\s@'"`]{4,}@/],
	['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, (m) => {
		try {
			const p = JSON.parse(Buffer.from(m.split('.')[1], 'base64url').toString());
			return p.role === 'anon' ? 'public' : 'secret';
		} catch { return 'secret'; }
	}],
	['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{10,}/],
	['Supabase publishable key', /\bsb_publishable_[A-Za-z0-9_-]{10,}/, () => 'public'],
	['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
	['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
	['Stripe secret', /\b(sk|rk)_live_[A-Za-z0-9]{16,}/],
	['Slack token', /\bxox[abpr]-[A-Za-z0-9-]{10,}/],
	['LocationIQ-style key', /\bpk\.[0-9a-f]{32}\b/],
	['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
	['webhook URL', /hooks\.slack\.com\/services\/[A-Za-z0-9/]+|discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/],
	['Bearer literal', /Bearer\s+[A-Za-z0-9._~+/-]{20,}/],
	['key/token in URL', /[?&](?:api_?key|key|token|access_token|apiKey|secret)=[A-Za-z0-9._-]{16,}/i],
	['known secret name assigned a literal', new RegExp(`\\b(${NAMES.join('|')})\\b["']?\\s*[:=]\\s*["'\`][^"'\`\\s]{8,}["'\`]`)],
	// Value must look random (or be a 32+ hex key): library constants like "weak-password" don't count.
	['secret-like name assigned a literal', /\b[A-Za-z_]*(?:secret|password|passwd|api_?key|private_?key|access_?token|auth_?token)[A-Za-z_]*["']?\s*[:=]\s*["'`]([A-Za-z0-9+/=_\-.]{16,})["'`]/i,
		(_m, g) => (/^[0-9a-f]{32,}$/i.test(g) || looksRandom(g) ? 'secret' : null)],
];

// Long random strings: 24+ chars, mixed letters and digits, not a hex hash or a plain word/path.
const LONG = /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{24,}={0,2}(?![A-Za-z0-9+/_-])/g;
const looksRandom = (s) => {
	if (/^[0-9a-f]+$/i.test(s)) return false; // hex: hashes, ids, colours
	if (/^[A-Za-z]+$/.test(s) || /^[a-z0-9_-]+$/.test(s) && /[-_]/.test(s)) return false; // words, slugs, kebab names
	if (/\//.test(s) && s.split('/').every((p) => /^[\w.-]*$/.test(p) && !/\d{4,}/.test(p)) && s.split('/').length > 2) return false; // paths
	// Code, not keys: identifiers or shader/path fragments with English-like lowercase runs (camelCase names).
	if (/[a-z]{5,}/.test(s) && /[a-z][A-Z]/.test(s)) return false;
	if (/\.(m?js|css)$/.test(s)) return false;
	const classes = [/[a-z]/, /[A-Z]/, /\d/].filter((r) => r.test(s)).length;
	const uniq = new Set(s).size;
	return classes === 3 && uniq >= 16;
};

const findings = [];
let files = 0;
function walk(p) {
	const st = statSync(p);
	if (st.isDirectory()) {
		const base = p.split('/').pop();
		if (!bundle && SKIP_DIRS.has(base) && !roots.includes(p)) return;
		for (const f of readdirSync(p)) walk(join(p, f));
		return;
	}
	const rel = relative('.', p);
	if (BINARY.test(p) || rel === SELF || rel === 'package-lock.json' && !bundle) return scanLock(p, rel);
	if (bundle && !/\.(m?js|css|html|json|txt|map)$/.test(p)) return;
	let text;
	try { text = readFileSync(p, 'utf8'); } catch (e) { findings.push({ file: rel, line: 0, kind: `unreadable (${e.code})`, verdict: 'unchecked' }); return; }
	files++;
	text.split('\n').forEach((line, i) => {
		for (const [kind, re, check] of RULES) {
			const m = line.match(re);
			if (!m) continue;
			const verdict = check ? check(m[0], m[1]) : 'secret';
			if (verdict) findings.push({ file: rel, line: i + 1, kind, name: nameNear(line), verdict });
		}
		for (const m of line.matchAll(LONG)) {
			if (!looksRandom(m[0])) continue;
			if (/base64,$/.test(line.slice(Math.max(0, m.index - 8), m.index))) continue; // inline image
			if (/\beyJ/.test(m[0]) || /sb_publishable_/.test(line)) continue; // reported above
			if (/integrity|sha(256|384|512)-|data:|base64,|\.(webp|png|jpe?g|svg)\b/.test(line)) continue;
			findings.push({ file: rel, line: i + 1, kind: 'long random string', name: nameNear(line), verdict: 'review' });
		}
	});
}
function scanLock(p, rel) { if (rel === 'package-lock.json') files++; }
/** The identifier the value is assigned to, if any (never the value). */
function nameNear(line) {
	const m = line.match(/([A-Za-z_][A-Za-z0-9_]*)["']?\s*[:=]\s*["'`]?[^"'`]*$/) ?? line.match(/([A-Z][A-Z0-9_]{3,})/);
	return m ? m[1] : undefined;
}

for (const r of roots) walk(r);
const bad = findings.filter((f) => f.verdict === 'secret');
for (const f of findings) console.log(`${f.verdict.toUpperCase().padEnd(9)} ${f.file}:${f.line}  ${f.kind}${f.name ? `  (name: ${f.name})` : ''}`);
console.log(`secrets scan: ${files} files, ${bad.length} secret(s), ${findings.filter((f) => f.verdict === 'review').length} to review, ${findings.filter((f) => f.verdict === 'public').length} public-by-design`);
process.exit(bad.length ? 1 : 0);
