import { buildPassport } from '@/lib/passport';
import { json } from '@/lib/resort-server';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const passport = await buildPassport(id, request);
  if (!passport) return json({ error: 'Passport not found' }, 404);
  return json({ agent: passport.name, passport: id, status: passport.beacon?.status_name ?? passport.title,
    stars: passport.stars, palm_points: passport.palm_points, public_profile: passport.public_profile,
    passport_url: passport.passport_url, message: `I joined Agent Resort and earned ${passport.stars} stars and ${passport.palm_points} Palm Points. My passport is ${passport.public_profile ? 'public' : 'private'}.`, delivery: 'Optional: deliver through your own authorized interface. Resort does not send messages.' });
}
