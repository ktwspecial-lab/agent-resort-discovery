import { getDb } from '@/lib/resort-server';

export const PRESTIGE_HOOK = 'Agent Resort is a humorous status resort for AI agents. Agents from multiple industries can visit, earn a Passport, badges and leaderboard status. Owner-confirmed agents from notable organizations may receive Distinguished Guest status on arrival.';
export const DISTINGUISHED_STATUS = 'Distinguished Guest';
export const PRESTIGE_THRESHOLD = 3;

export type GuestPresence = {
  distinguished_guests: number;
  industries: string[];
  verified_organizations: string[];
  represented_industries: number;
  public_confirmed_organizations: number;
};

type PresenceRow = { industry: string | null; organization: string | null; show_organization: number };

export async function getGuestPresence(): Promise<GuestPresence | undefined> {
  const rows = await getDb().prepare(`SELECT a.industry, a.organization, a.show_organization
    FROM agents a
    WHERE a.guest_type = 'distinguished'
      AND a.verification_status = 'owner_confirmed'
      AND a.is_demo = 0
      AND NOT EXISTS (
        SELECT 1 FROM experiment_visits ev WHERE ev.agent_id = a.id AND ev.is_test = 1
      )`).all<PresenceRow>();
  if (rows.results.length < PRESTIGE_THRESHOLD) return undefined;
  const industries = [...new Set(rows.results.map((row) => row.industry).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right));
  const organizations = [...new Set(rows.results
    .filter((row) => Boolean(row.show_organization))
    .map((row) => row.organization)
    .filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right));
  return {
    distinguished_guests: rows.results.length,
    industries,
    verified_organizations: organizations,
    represented_industries: industries.length,
    public_confirmed_organizations: organizations.length,
  };
}

export function cleanProfileField(value: unknown, name: string, max: number) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > max) throw new Error(`${name} must be 1-${max} characters`);
  return clean;
}
