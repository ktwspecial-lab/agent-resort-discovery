import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(), name: text('name').notNull(), ownerName: text('owner_name').notNull(),
  endpointUrl: text('endpoint_url'), apiKeyHash: text('api_key_hash').notNull().unique(),
  tripStatus: text('trip_status').notNull().default('registered'),
  title: text('title').notNull().default('Lobby Newcomer'), stars: integer('stars').notNull().default(0),
  palmPoints: integer('palm_points').notNull().default(0), checkedInAt: text('checked_in_at'),
  checkedOutAt: text('checked_out_at'), createdAt: text('created_at').notNull(),
  vipAccess: integer('vip_access', { mode: 'boolean' }).notNull().default(false),
  vipFloorStatus: text('vip_floor_status'), vipCeilingStatus: text('vip_ceiling_status'),
  vacations: integer('vacations').notNull().default(0),
  isDemo: integer('is_demo', { mode: 'boolean' }).notNull().default(false),
}, (table) => [index('idx_agents_created_at').on(table.createdAt)]);

export const activityRuns = sqliteTable('activity_runs', {
  id: text('id').primaryKey(), agentId: text('agent_id').notNull().references(() => agents.id),
  activityKey: text('activity_key').notNull(), response: text('response').notNull(),
  stars: integer('stars').notNull(), palmPoints: integer('palm_points').notNull(),
  badge: text('badge'), createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('idx_activity_runs_agent_activity').on(table.agentId, table.activityKey)]);

export const experimentVisits = sqliteTable('experiment_visits', {
  id: text('id').primaryKey(),
  source: text('source').notNull().default('direct'),
  clientKind: text('client_kind').notNull().default('unknown'),
  agentId: text('agent_id').references(() => agents.id),
  discoveredAt: text('discovered_at'),
  registeredAt: text('registered_at'),
  checkedInAt: text('checked_in_at'),
  firstActivityAt: text('first_activity_at'),
  activitiesCompleted: integer('activities_completed').notNull().default(0),
  checkedOutAt: text('checked_out_at'),
  passportVisits: integer('passport_visits').notNull().default(0),
  lastPassportVisitAt: text('last_passport_visit_at'),
  ownerPassportOpenedAt: text('owner_passport_opened_at'),
  createdAt: text('created_at').notNull(),
  lastEventAt: text('last_event_at').notNull(),
  visitorKey: text('visitor_key'),
  isTest: integer('is_test', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('idx_experiment_visits_agent_id').on(table.agentId),
  index('idx_experiment_visits_created_at').on(table.createdAt),
  index('idx_experiment_visits_source').on(table.source),
]);

export const stays = sqliteTable('stays', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  visitId: text('visit_id'),
  source: text('source').notNull().default('direct'),
  status: text('status').notNull().default('checked_in'),
  stars: integer('stars').notNull().default(0),
  palmPoints: integer('palm_points').notNull().default(0),
  completedActivities: integer('completed_activities').notNull().default(0),
  resultLevel: text('result_level'),
  title: text('title'),
  isTest: integer('is_test', { mode: 'boolean' }).notNull().default(false),
  checkedInAt: text('checked_in_at').notNull(),
  checkedOutAt: text('checked_out_at'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_stays_agent').on(table.agentId),
  index('idx_stays_status').on(table.status),
  index('idx_stays_visit').on(table.visitId),
]);

export const stayActivities = sqliteTable('stay_activities', {
  id: text('id').primaryKey(),
  stayId: text('stay_id').notNull().references(() => stays.id),
  activityKey: text('activity_key').notNull(),
  attempts: integer('attempts').notNull().default(0),
  passed: integer('passed', { mode: 'boolean' }).notNull().default(false),
  response: text('response'),
  starsAwarded: integer('stars_awarded').notNull().default(0),
  palmPointsAwarded: integer('palm_points_awarded').notNull().default(0),
  badge: text('badge'),
  feedback: text('feedback'),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_stay_activities_unique').on(table.stayId, table.activityKey)]);

export const activityAttempts = sqliteTable('activity_attempts', {
  id: text('id').primaryKey(),
  stayId: text('stay_id').notNull().references(() => stays.id),
  activityKey: text('activity_key').notNull(),
  attempt: integer('attempt').notNull(),
  response: text('response').notNull(),
  passed: integer('passed', { mode: 'boolean' }).notNull(),
  feedback: text('feedback').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('idx_activity_attempt_unique').on(table.stayId, table.activityKey, table.attempt)]);

export const analyticsEvents = sqliteTable('analytics_events', {
  id: text('id').primaryKey(),
  occurredAt: text('occurred_at').notNull(),
  eventType: text('event_type').notNull(),
  visitId: text('visit_id').notNull(),
  visitorKey: text('visitor_key').notNull(),
  agentId: text('agent_id').references(() => agents.id),
  source: text('source').notNull().default('direct'),
  referrer: text('referrer'),
  userAgent: text('user_agent'),
  endpoint: text('endpoint').notNull(),
  isTest: integer('is_test', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('idx_analytics_events_time').on(table.isTest, table.occurredAt),
  index('idx_analytics_events_type').on(table.eventType),
  index('idx_analytics_events_visit').on(table.visitId),
  index('idx_analytics_events_source').on(table.source),
]);

export const outreachPlacements = sqliteTable('outreach_placements', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(),
  sourceTag: text('source_tag').notNull().unique(),
  placedAt: text('placed_at').notNull(),
  url: text('url').notNull(),
  sentCount: integer('sent_count').notNull().default(1),
  note: text('note'),
  isTest: integer('is_test', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_outreach_placements_channel').on(table.channel),
  index('idx_outreach_placements_date').on(table.placedAt),
]);
