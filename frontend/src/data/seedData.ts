/**
 * SafeZone demo-operator identity config.
 *
 * This file used to also hold INITIAL_ZONES / INITIAL_INCIDENTS /
 * INITIAL_ALERTS / INITIAL_AUDIT_LOGS mock data that seeded the app's
 * localStorage cache. That mock data has been removed — zones, incidents,
 * alerts and audit log entries are now all real rows served from the
 * SafeZone FastAPI backend + Supabase (see services/apiClient.ts,
 * services/incidentService.ts, and the backend's seed_zones.py for the
 * one real seed step, which seeds campus zones only).
 *
 * What's left here — the currently "logged in" staff member and the
 * staff directory used by the case-assignment dropdown — is legitimate
 * app config, not dummy data: there is no real authentication system in
 * this project yet, so "who is using the dashboard right now" has to be
 * hardcoded somewhere. Swap this out once real auth/staff accounts exist.
 */
import { UserProfile } from '../types/index.ts';

export const CURRENT_USER: UserProfile = {
  id: 'usr-admin-01',
  name: 'Marcus Vance',
  role: 'School Safety Staff',
  email: 'm.vance@oakwood-schools.edu',
  avatarInitials: 'MV',
};

export const AVAILABLE_STAFF: UserProfile[] = [
  CURRENT_USER,
  {
    id: 'usr-admin-02',
    name: 'Dr. Evelyn Reed',
    role: 'Administrator',
    email: 'e.reed@oakwood-schools.edu',
    avatarInitials: 'ER',
  },
  {
    id: 'usr-counselor-01',
    name: 'Sarah Chen, LCSW',
    role: 'Counsellor',
    email: 's.chen@oakwood-schools.edu',
    avatarInitials: 'SC',
  },
  {
    id: 'usr-officer-01',
    name: 'Officer David Briggs',
    role: 'School Safety Staff',
    email: 'd.briggs@oakwood-schools.edu',
    avatarInitials: 'DB',
  },
];