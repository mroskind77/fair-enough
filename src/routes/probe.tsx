import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { PageShell } from '@/components/PageShell';
import { supabase } from '@/integrations/supabase/client';

// Temporary M0 probe page. Deleted once the results are recorded.
export const Route = createFileRoute('/probe')({
	head: () => ({ meta: [{ title: 'Probe · Fair Enough' }, { name: 'robots', content: 'noindex' }] }),
	component: Probe,
});

interface ProbeResult {
	runtime?: Record<string, string | null>;
	origin?: string | null;
	originAllowed?: boolean | null;
	ipHeaders?: Record<string, string | null>;
	pngMs?: number;
	png?: string | null;
	pngError?: string | null;
	error?: string;
}

function Probe() {
	const [plain, setPlain] = useState<ProbeResult | null>(null);
	const [forged, setForged] = useState<ProbeResult | null>(null);
	const [busy, setBusy] = useState(false);

	const run = async () => {
		if (!supabase) return;
		setBusy(true);
		const a = await supabase.functions.invoke('probe', { body: {} });
		setPlain(a.error ? { error: a.error.message } : (a.data as ProbeResult));
		const b = await supabase.functions.invoke('probe', { body: {}, headers: { 'x-forwarded-for': '203.0.113.7' } });
		setForged(b.error ? { error: b.error.message } : (b.data as ProbeResult));
		setBusy(false);
	};

	return (
		<PageShell>
			<div dir="ltr" className="flex flex-col gap-4 text-start">
				<h1 className="text-2xl font-semibold">M0 probe</h1>
				<p className="text-sm text-muted-foreground">Run once on mobile data and once on Wi-Fi. The second call sends a forged x-forwarded-for of 203.0.113.7.</p>
				<button type="button" onClick={() => void run()} disabled={busy} className="min-h-12 rounded-sm bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50">
					{busy ? 'Running…' : 'Run probe'}
				</button>
				{plain && <Block title="Normal call" r={plain} />}
				{forged && <Block title="Forged x-forwarded-for" r={forged} />}
			</div>
		</PageShell>
	);
}

function Block({ title, r }: { title: string; r: ProbeResult }) {
	const { png, ...rest } = r;
	return (
		<section className="flex flex-col gap-2 border-t border-border pt-4">
			<h2 className="font-semibold">{title}</h2>
			<pre className="overflow-x-auto bg-muted p-3 font-mono text-xs">{JSON.stringify(rest, null, 2)}</pre>
			{png && <img src={png} alt="Hebrew render test" width={600} height={315} className="h-auto w-full border border-border" />}
		</section>
	);
}
