import { handleMachineActivity } from '@/lib/machine-resort';
export async function POST(request: Request) { return handleMachineActivity(request, 'prompt_surfing'); }
