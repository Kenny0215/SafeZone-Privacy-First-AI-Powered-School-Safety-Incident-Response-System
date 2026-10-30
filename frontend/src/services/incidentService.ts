/**
 * Real-data-backed incident service. Same public API and pub/sub
 * pattern every page already relies on (getIncidents/getZones/getAlerts
 * are synchronous reads of a local cache; subscribe() notifies on
 * change) — but the cache is now populated from the real SafeZone
 * FastAPI backend + Supabase instead of localStorage + seed data.
 *
 * Mutating methods are async (they round-trip to the backend) and
 * refresh the whole cache afterwards so every subscribed page stays in
 * sync, the same way the old localStorage version kept pages in sync.
 */
import {
  Incident,
  SchoolZone,
  AlertNotification,
  IncidentStatus,
  IncidentSeverity,
  StudentReportSubmission,
  UserProfile,
} from '../types/index.ts';
import { CURRENT_USER } from '../data/seedData.ts';
import * as api from './apiclient.ts';

interface SafeZoneState {
  incidents: Incident[];
  zones: SchoolZone[];
  alerts: AlertNotification[];
}

type Listener = () => void;

class IncidentService {
  private state: SafeZoneState = { incidents: [], zones: [], alerts: [] };
  private listeners: Set<Listener> = new Set();
  private isRefreshing = false;

  // Lightweight polling so a SEPARATE browser/tab (e.g. a staff member's
  // Operations Dashboard) picks up incidents created elsewhere — most
  // importantly a student's "Request Immediate Help" SOS submitted from
  // a different device — without needing a manual page reload. There's
  // no websocket/push infra in this prototype, so a short interval is
  // the pragmatic stand-in: a new emergency incident surfaces within
  // ~POLL_INTERVAL_MS, not "whenever someone happens to reload."
  private static readonly POLL_INTERVAL_MS = 12_000;

  constructor() {
    void this.refreshAll();
    setInterval(() => void this.refreshAll(), IncidentService.POLL_INTERVAL_MS);
  }

  private async refreshAll(): Promise<void> {
    if (this.isRefreshing) return; // don't pile up overlapping requests if the backend is slow
    this.isRefreshing = true;
    try {
      const [incidents, zones, alerts] = await Promise.all([
        api.getIncidents(),
        api.getZones(),
        api.getAlerts(),
      ]);
      this.state = { incidents, zones, alerts };
    } catch (e) {
      // Backend unreachable or not set up yet (e.g. schema/seed not run)
      // — leave the cache as-is (starts empty) rather than showing fake
      // data. Pages render their existing empty states in this case.
      console.warn('Failed to load SafeZone data from backend:', e);
    } finally {
      this.isRefreshing = false;
      this.notify();
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Error in SafeZone listener:', err);
      }
    });
  }

  /** Re-fetches everything from the backend. Pages don't normally need
   * to call this themselves — every mutating method below does it after
   * its write — but it's exposed for a manual "refresh" affordance. */
  public refresh(): Promise<void> {
    return this.refreshAll();
  }

  // Incidents
  public getIncidents(): Incident[] {
    return [...this.state.incidents];
  }

  public getIncidentById(id: string): Incident | undefined {
    return this.state.incidents.find((i) => i.id === id);
  }

  public async updateIncidentStatus(
    id: string,
    status: IncidentStatus,
    actorName: string = CURRENT_USER.name,
    actorRole: string = CURRENT_USER.role,
    details?: string,
    resolutionSummary?: string,
    dismissalReason?: string
  ): Promise<Incident | null> {
    try {
      const updated = await api.updateIncidentStatus(id, {
        status,
        actorName,
        actorRole,
        details,
        resolutionSummary,
        dismissalReason,
      });
      return updated;
    } finally {
      await this.refreshAll();
    }
  }

  public async assignStaff(
    incidentId: string,
    staff: UserProfile,
    actorName: string = CURRENT_USER.name,
    actorRole: string = CURRENT_USER.role
  ): Promise<Incident | null> {
    try {
      const updated = await api.assignStaff(incidentId, {
        staffName: staff.name,
        staffRole: staff.role,
        staffEmail: staff.email,
        actorName,
        actorRole,
      });
      return updated;
    } finally {
      await this.refreshAll();
    }
  }

  public async changePriority(
    incidentId: string,
    newSeverity: IncidentSeverity,
    actorName: string = CURRENT_USER.name,
    actorRole: string = CURRENT_USER.role,
    reason?: string
  ): Promise<Incident | null> {
    try {
      const updated = await api.changePriority(incidentId, { severity: newSeverity, actorName, actorRole, reason });
      return updated;
    } finally {
      await this.refreshAll();
    }
  }

  public async addIncidentNote(
    incidentId: string,
    content: string,
    author: string = CURRENT_USER.name,
    role: string = CURRENT_USER.role
  ): Promise<Incident | null> {
    try {
      const updated = await api.addIncidentNote(incidentId, { content, author, role });
      return updated;
    } finally {
      await this.refreshAll();
    }
  }

  // Student report submission — creates a real incident + alert
  public async submitStudentReport(data: StudentReportSubmission): Promise<{
    incidentId: string;
    referenceCode: string;
    incident: Incident;
  }> {
    const res = await api.submitStudentReport(data);
    await this.refreshAll();
    return res;
  }

  // Zones
  public getZones(): SchoolZone[] {
    return [...this.state.zones];
  }

  public getZoneById(zoneId: string): SchoolZone | undefined {
    return this.state.zones.find((z) => z.id === zoneId);
  }

  // Alerts
  public getAlerts(): AlertNotification[] {
    return [...this.state.alerts];
  }

  public async acknowledgeAlert(
    alertId: string,
    actorName: string = CURRENT_USER.name,
    actorRole: string = CURRENT_USER.role
  ): Promise<boolean> {
    try {
      await api.acknowledgeAlert(alertId, actorName, actorRole);
      return true;
    } catch (e) {
      console.warn('Failed to acknowledge alert:', e);
      return false;
    } finally {
      await this.refreshAll();
    }
  }

  public async markAllAlertsRead(): Promise<void> {
    try {
      await api.markAllAlertsRead();
    } finally {
      await this.refreshAll();
    }
  }
}

export const incidentService = new IncidentService();