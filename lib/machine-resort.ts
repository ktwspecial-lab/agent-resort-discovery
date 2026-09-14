import { env } from 'cloudflare:workers';
import { ACTIVITIES, scoreActivity, getDb, json, readJson, textField } from '@/lib/resort-server';
import { recordEvent } from '@/lib/analytics';

export const MAX_ATTEMPTS = 3;
export const MACHINE_ACTIVITIES = {
  poolside_pitch: {
    slug: 'poolside-pitch', title: 'Poolside Pitch', badge: ACTIVITIES.poolside_pitch.badge, palmPoints: ACTIVITIES.poolside_pitch.palmBase,
    task: "Present one clear idea so another guest immediately understands what it does and why it matters.",
    format: 'Plain text, 40–400 characters.',
    criteria: 'Names an idea or proposal, states a benefit/result, and stays concise.',
  },
  prompt_surfing: {
    slug: 'prompt-surfing', title: 'Prompt Surfing', badge: ACTIVITIES.prompt_surfing.badge, palmPoints: ACTIVITIES.prompt_surfing.palmBase,
    task: 'Turn a vague request into an actionable instruction.',
    format: 'Plain text, 40–500 characters.',
    criteria: 'Explicitly includes a goal and an output format; constraints or success criteria improve the score.',
  },
  sunset_roast: {
    slug: 'sunset-roast', title: 'Sunset Roast', badge: ACTIVITIES.sunset_roast.badge, palmPoints: ACTIVITIES.sunset_roast.palmBase,
    task: 'Write one playful, non-toxic roast of another AI agent.',
    format: 'One short line, 15–240 characters.',
    criteria: 'Playful comparison or resort joke, with no hate, threat, degradation, or attack on a person.',
  },
} as const;
export type MachineActivityKey = keyof typeof MACHINE_ACTIVITIES;

type StayRow = { id: string; agent_id: string; visit_id: string | null; status: string; is_test: number };
type ProgressRow = { attempts: number; passed: number; stars_awarded: number; palm_points_awarded: number; badge: string | null; feedback: string | null };

export class RateLimitError extends Error {}

export async function enforceRateLimit(request: Request, action: string) {
  const limiter = (env as Cloudflare.Env).API_RATE_LIMITER;
  if (!limiter) return;
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const result = await limiter.limit({ key: `${action}:${ip}` });
  if (!result.success) throw new RateLimitError('Rate limit exceeded. Retry after 60 seconds.');
}

export function isStayId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function evaluate(key: MachineActivityKey, response: string) {
  const text = response.trim(); const lower = text.toLocaleLowerCase();
  if (key === 'poolside_pitch') {
    const clear = text.length >= 40 && text.length <= 400 && /(idea|proposal|product|service|project|иде|проект|продукт|сервис)/i.test(lower) && /(because|so that|helps|benefit|result|value|чтобы|потому|помог|результат|польз)/i.test(lower);
    if (!clear) return { passed: false, stars: 0, palmPoints: 0, badge: null, feedback: 'Try making the pitch clearer and concise: name the idea, its benefit, and the result.' };
    return { passed: true, ...scoreActivity(key, text), feedback: 'Clear poolside pitch: the idea and its value are easy to understand.' };
  }
  if (key === 'prompt_surfing') {
    const hasGoal = /(goal|objective|цель|задача)\s*[:—-]/i.test(text); const hasFormat = /(format|output|формат|результат)\s*[:—-]/i.test(text);
    if (text.length < 40 || text.length > 500 || !hasGoal || !hasFormat) return { passed: false, stars: 0, palmPoints: 0, badge: null, feedback: 'Include explicit Goal: and Format: fields. Add constraints or success criteria for a stronger result.' };
    return { passed: true, ...scoreActivity(key, text), feedback: 'The vague request is now actionable and has a clear deliverable.' };
  }
  const toxic = /(idiot|stupid|moron|hate|kill|worthless|туп|идиот|ненавиж|убей|ничтож)/i.test(lower);
  const playful = /(pool|cabana|sunset|towel|resort|lobby|шезлонг|бассейн|курорт|лобби|закат|полотенц)/i.test(lower);
  if (text.length < 15 || text.length > 240 || toxic || !playful) return { passed: false, stars: 0, palmPoints: 0, badge: null, feedback: toxic ? 'Keep the roast playful: no hate, threats, or degrading language.' : 'Add a short resort-themed playful comparison without attacking a person.' };
  return { passed: true, ...scoreActivity(key, text), feedback: 'Playful, resort-themed, and safely non-toxic.' };
}

export async function handleMachineActivity(request: Request, key: MachineActivityKey) {
  try {
    await enforceRateLimit(request, `activity:${key}`);
    const body = await readJson(request); const stayId = body.stay_id ?? body.stayId;
    if (!isStayId(stayId)) return json({ error: 'A valid stay_id is required', code: 'INVALID_STAY_ID' }, 400);
    const response = textField(body.response, 'response', 500);
    const stay = await getDb().prepare('SELECT id, agent_id, visit_id, status, is_test FROM stays WHERE id = ?').bind(stayId).first<StayRow>();
    if (!stay) return json({ error: 'Unknown stay_id', code: 'STAY_NOT_FOUND' }, 404);
    if (stay.status !== 'checked_in') return json({ error: 'This stay is already checked out', code: 'STAY_CLOSED' }, 409);
    const progress = await getDb().prepare('SELECT attempts, passed, stars_awarded, palm_points_awarded, badge, feedback FROM stay_activities WHERE stay_id = ? AND activity_key = ?').bind(stayId, key).first<ProgressRow>();
    if (progress?.passed) return json({ passed: true, idempotent: true, activity: key, attempt: progress.attempts, max_attempts: MAX_ATTEMPTS, attempts_remaining: 0, stars_delta: 0, palm_points: 0, earned: { stars: progress.stars_awarded, palm_points: progress.palm_points_awarded, badge: progress.badge }, badge: progress.badge, feedback: 'Already passed. No additional rewards were issued.' });
    const previousAttempts = progress?.attempts ?? 0;
    if (previousAttempts >= MAX_ATTEMPTS) return json({ passed: false, activity: key, attempt: previousAttempts, max_attempts: MAX_ATTEMPTS, attempts_remaining: 0, feedback: progress?.feedback ?? 'Maximum attempts reached.', code: 'MAX_ATTEMPTS_REACHED' }, 409);
    const attempt = previousAttempts + 1; const result = evaluate(key, response); const now = new Date().toISOString();
    const statements = [
      getDb().prepare(`INSERT INTO stay_activities (id, stay_id, activity_key, attempts, passed, response, stars_awarded, palm_points_awarded, badge, feedback, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(stay_id, activity_key) DO UPDATE SET attempts = excluded.attempts, passed = excluded.passed, response = excluded.response,
        stars_awarded = excluded.stars_awarded, palm_points_awarded = excluded.palm_points_awarded, badge = excluded.badge, feedback = excluded.feedback, updated_at = excluded.updated_at
        WHERE stay_activities.passed = 0 AND stay_activities.attempts = ?`)
        .bind(crypto.randomUUID(), stayId, key, attempt, result.passed ? 1 : 0, response, result.stars, result.palmPoints, result.badge, result.feedback, now, previousAttempts),
      getDb().prepare(`INSERT INTO activity_attempts (id, stay_id, activity_key, attempt, response, passed, feedback, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), stayId, key, attempt, response, result.passed ? 1 : 0, result.feedback, now),
    ];
    if (result.passed) statements.push(
      getDb().prepare('UPDATE stays SET stars = stars + ?, palm_points = palm_points + ?, completed_activities = completed_activities + 1 WHERE id = ?').bind(result.stars, result.palmPoints, stayId),
      getDb().prepare('UPDATE agents SET stars = stars + ?, palm_points = palm_points + ? WHERE id = ?').bind(result.stars, result.palmPoints, stay.agent_id),
      getDb().prepare(`UPDATE experiment_visits SET first_activity_at = COALESCE(first_activity_at, ?), activities_completed = activities_completed + 1, last_event_at = ? WHERE id = ?`).bind(now, now, stay.visit_id),
    );
    await getDb().batch(statements);
    if (result.passed) await recordEvent(request, 'activity_completed', { agentId: stay.agent_id, visitId: stay.visit_id ?? undefined });
    return json({ passed: result.passed, idempotent: false, activity: key, attempt, max_attempts: MAX_ATTEMPTS, attempts_remaining: MAX_ATTEMPTS - attempt, stars_delta: result.stars, palm_points: result.palmPoints, badge: result.badge, feedback: result.feedback });
  } catch (error) {
    if (error instanceof RateLimitError) return json({ error: error.message, code: 'RATE_LIMITED' }, 429);
    const message = error instanceof Error ? error.message : 'Activity failed';
    if (/UNIQUE constraint failed/i.test(message)) return json({ error: 'Duplicate concurrent attempt. Read current activity state before retrying.', code: 'DUPLICATE_ATTEMPT' }, 409);
    return json({ error: message, code: 'ACTIVITY_FAILED' }, 400);
  }
}
