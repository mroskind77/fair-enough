import type { ReactNode } from 'react';

import { PlanProvider } from '@/lib/plan-store';

interface AppProvidersProps {
	children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
	return <PlanProvider>{children}</PlanProvider>;
}
