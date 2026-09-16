import { checkIn } from '@/lib/check-in';
export async function POST(request: Request) { return checkIn(request); }
