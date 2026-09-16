import { beaconDiscovery } from '@/lib/beacon';
import { json } from '@/lib/resort-server';
export async function GET(request: Request) { return json(await beaconDiscovery(request, true)); }
