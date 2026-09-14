import { isAdmin } from '@/lib/admin-auth';
import { getAnalyticsReport } from '@/lib/analytics-report';
import { json } from '@/lib/resort-server';

export async function GET(request: Request) {
  if (!await isAdmin(request)) return json({ error: 'Unauthorized' }, 401);
  try { return json(await getAnalyticsReport()); }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'Stats unavailable' }, 500); }
}
