import { getDb } from '@/lib/resort-server';

type TotalsRow = {
  visits: number | null;
  discovered: number | null;
  registered: number | null;
  checked_in: number | null;
  started: number | null;
  completed_activities: number | null;
  checked_out: number | null;
  passport_visits: number | null;
  owner_passport_opens: number | null;
};

type SourceRow = {
  source: string;
  visits: number;
  registered: number;
  checked_out: number;
  owner_passport_opens: number;
};

type ClientRow = { client_kind: string; visits: number };

export async function getExperimentSummary() {
  const row = await getDb().prepare(`SELECT
    COUNT(*) AS visits,
    SUM(discovered_at IS NOT NULL) AS discovered,
    SUM(registered_at IS NOT NULL) AS registered,
    SUM(checked_in_at IS NOT NULL) AS checked_in,
    SUM(first_activity_at IS NOT NULL) AS started,
    SUM(activities_completed >= 3) AS completed_activities,
    SUM(checked_out_at IS NOT NULL) AS checked_out,
    SUM(passport_visits) AS passport_visits,
    SUM(owner_passport_opened_at IS NOT NULL) AS owner_passport_opens
    FROM experiment_visits`).first<TotalsRow>();
  const sources = await getDb().prepare(`SELECT source,
    COUNT(*) AS visits,
    SUM(registered_at IS NOT NULL) AS registered,
    SUM(checked_out_at IS NOT NULL) AS checked_out,
    SUM(owner_passport_opened_at IS NOT NULL) AS owner_passport_opens
    FROM experiment_visits GROUP BY source ORDER BY visits DESC, source ASC`).all<SourceRow>();
  const clients = await getDb().prepare(`SELECT client_kind, COUNT(*) AS visits
    FROM experiment_visits GROUP BY client_kind ORDER BY visits DESC`).all<ClientRow>();

  return {
    totals: {
      visits: Number(row?.visits ?? 0),
      discovered: Number(row?.discovered ?? 0),
      registered: Number(row?.registered ?? 0),
      checkedIn: Number(row?.checked_in ?? 0),
      started: Number(row?.started ?? 0),
      completedActivities: Number(row?.completed_activities ?? 0),
      checkedOut: Number(row?.checked_out ?? 0),
      passportVisits: Number(row?.passport_visits ?? 0),
      ownerPassportOpens: Number(row?.owner_passport_opens ?? 0),
    },
    sources: sources.results,
    clients: clients.results,
    generatedAt: new Date().toISOString(),
  };
}
