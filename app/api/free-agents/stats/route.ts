import { beaconStats } from '@/lib/beacon';
import { json } from '@/lib/resort-server';
export async function GET() {
  const stats = await beaconStats();
  return json({ agents_checked_in: stats.agents_checked_in, self_discovered: stats.self_discovered, free_agents: stats.free_agents, passports_issued: stats.passports_issued, autonomy_verified: false, note: stats.note });
}
