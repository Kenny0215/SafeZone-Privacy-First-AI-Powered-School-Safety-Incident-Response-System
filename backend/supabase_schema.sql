create extension if not exists "pgcrypto";

drop table if exists public.sos_alerts cascade;
drop table if exists public.incidents cascade;
drop table if exists public.alerts cascade;
drop table if exists public.audit_log cascade;
drop table if exists public.zones cascade;

-- ------------------------------------------------------------
-- 1. zones
-- Static campus configuration (camera/sensor install points).
-- This is infrastructure config, not incident/event data — it's
-- seeded ONCE via seed_zones.py and basically never changes, same
-- as it would be in a real school's device inventory.
-- ------------------------------------------------------------
create table public.zones (
    id                    text primary key,       -- e.g. "zone-courtyard"
    name                  text not null,
    category              text not null,           -- Corridor | Cafeteria | Outdoor | Sports | Hygiene/Restroom | Academic
    privacy_level         text not null,           -- Permitted Surveillance | Strictly Private (No Video) | Restricted Area
    device_type           text not null,
    device_status         text not null,
    coverage_description  text not null,
    cctv_permitted        boolean not null,
    coordinates           jsonb not null,           -- { x, y, width, height } floor-plan percentages
    marker                jsonb not null            -- { x, y, type }
);

-- ------------------------------------------------------------
-- 2. incidents
-- One row per real safety case — created either by /api/analyze
-- (CCTV AI detection on an uploaded clip) or /api/student-reports
-- (a student/staff submission). `doc` holds the FULL case record as
-- JSON, matching the frontend's Incident type field-for-field
-- (camelCase keys), so the API can return it with zero translation.
-- A few columns are pulled out of `doc` purely for ordering/joins.
-- ------------------------------------------------------------
create table public.incidents (
    id            text primary key,          -- e.g. "SZ-2026-4821"
    zone_id       text references public.zones(id),
    severity      text not null,              -- Low | Medium | High
    status        text not null,              -- New | Under Review | Assigned | Responding | Under Investigation | Resolved | Dismissed
    reported_at   timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    doc           jsonb not null
);

create index idx_incidents_reported_at on public.incidents (reported_at desc);
create index idx_incidents_zone_id on public.incidents (zone_id);
create index idx_incidents_status on public.incidents (status);
create index idx_incidents_severity on public.incidents (severity);

-- ------------------------------------------------------------
-- 3. alerts
-- One row per incident-creating event. Separate from the incident
-- itself because acknowledge/read state belongs to the alert/
-- dispatch workflow, not the case record.
-- ------------------------------------------------------------
create table public.alerts (
    id                text primary key,       -- e.g. "ALT-9042"
    incident_id       text not null references public.incidents(id) on delete cascade,
    title             text not null,
    message           text not null,
    severity          text not null,
    location          text not null,
    created_at        timestamptz not null default now(),
    acknowledged      boolean not null default false,
    acknowledged_by   text,
    acknowledged_at   timestamptz,
    read              boolean not null default false
);

create index idx_alerts_created_at on public.alerts (created_at desc);
create index idx_alerts_incident_id on public.alerts (incident_id);

-- ------------------------------------------------------------
-- 4. audit_log
-- Append-only trail of every mutating action (status changes, staff
-- assignment, notes, report ingestion, alert acknowledgement).
-- ------------------------------------------------------------
create table public.audit_log (
    id                    text primary key,
    "timestamp"           timestamptz not null default now(),
    "user"                text not null,
    role                  text not null,
    action                text not null,
    related_incident_id   text references public.incidents(id) on delete set null,
    outcome               text not null,       -- Success | Flagged | Denied | Warning
    details               text not null
);

create index idx_audit_log_timestamp on public.audit_log ("timestamp" desc);

-- ------------------------------------------------------------
-- 5. sos_alerts
-- One row per SOS button press (manual trigger, e.g. in a private
-- zone where there's no CCTV). Kept from the original schema;
-- linked_incident_id now points at the new text-keyed incidents.id.
-- ------------------------------------------------------------
create table public.sos_alerts (
    id                  uuid primary key default gen_random_uuid(),
    created_at          timestamptz not null default now(),

    triggered_by        text,
    camera_location     text not null,
    message             text,

    linked_incident_id  text references public.incidents (id) on delete set null,

    status               text not null default 'open'
                           check (status in ('open', 'acknowledged', 'resolved')),
    acknowledged_by      text,
    acknowledged_at      timestamptz,
    resolved_at          timestamptz
);

create index idx_sos_created_at on public.sos_alerts (created_at desc);
create index idx_sos_status on public.sos_alerts (status);

-- ------------------------------------------------------------
-- 6. Row Level Security
-- Demo-friendly posture: the backend talks to Supabase using the
-- SERVICE ROLE key (bypasses RLS entirely), so these policies only
-- matter if the frontend ever talks to Supabase directly with the
-- anon key. Locked down by default.
-- ------------------------------------------------------------
alter table public.zones enable row level security;
alter table public.incidents enable row level security;
alter table public.alerts enable row level security;
alter table public.audit_log enable row level security;
alter table public.sos_alerts enable row level security;

-- ------------------------------------------------------------
-- 7. Grants for service_role (same gap that bit you last time —
-- RLS being enabled is not enough, Postgres also needs an explicit
-- GRANT for service_role to touch these tables).
-- ------------------------------------------------------------
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;

-- ------------------------------------------------------------
-- 8. Realtime (optional) — lets the dashboard subscribe and get new
-- rows pushed live instead of polling.
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.incidents;
alter publication supabase_realtime add table public.alerts;
alter publication supabase_realtime add table public.sos_alerts;