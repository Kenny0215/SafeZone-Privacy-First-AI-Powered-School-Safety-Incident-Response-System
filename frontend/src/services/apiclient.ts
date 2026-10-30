/**
 * Thin client for the real SafeZone FastAPI backend (YOLO+ByteTrack
 * baseline vs YOLO+MoViNet refined pipeline comparison + Supabase).
 *
 * Base URL comes from VITE_API_BASE_URL (set it in a .env / .env.local
 * file at the frontend project root — Vite only exposes vars prefixed
 * with VITE_ to client code). Falls back to localhost:8000 for local dev.
 */
import { Incident, SchoolZone, AlertNotification } from '../types/index.ts';

const API_BASE_URL: string =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';

export interface PipelineResult {
  pipeline: string;
  flagged: boolean;
  confidence: number; // 0-1
  video_url: string; // relative path, e.g. /static/outputs/baseline_xxx.mp4
  fps: number;
  notes: string;
}

/** One precomputed demo gallery clip — see generate_demo_gallery.py on the
 * backend. Pure static read, no live model inference. */
export interface DemoGalleryItem {
  id: string;
  category: 'public' | 'semi_private';
  category_label: string;
  zone_name: string;
  label: string;
  source_filename: string;
  ground_truth: 'Fight' | 'NonFight';
  baseline: PipelineResult;
  refined: PipelineResult;
  overall_flagged: boolean;
  severity: 'low' | 'medium' | 'high';
}

export interface AnalyzeResponse {
  incident_id: string;
  camera_location?: string;
  is_private_zone: boolean;
  baseline: PipelineResult;
  refined: PipelineResult;
  overall_flagged: boolean;
  severity: 'low' | 'medium' | 'high';
}

/** Turns a backend-relative media path (e.g. "/static/outputs/x.mp4") into
 * a fully-qualified URL the <video> tag can actually load. */
export function toAbsoluteMediaUrl(relativeOrAbsolute: string): string {
  if (!relativeOrAbsolute) return relativeOrAbsolute;
  if (/^https?:\/\//i.test(relativeOrAbsolute)) return relativeOrAbsolute;
  return `${API_BASE_URL}${relativeOrAbsolute}`;
}

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Uploads a video file and runs BOTH pipelines (baseline YOLO+ByteTrack,
 * refined YOLO+MoViNet) on the backend. This call is intentionally
 * synchronous/blocking — the backend processes the whole clip before
 * responding, which can take anywhere from several seconds to a couple
 * of minutes on CPU depending on clip length. Show a loading state while
 * awaiting this.
 */
export async function analyzeVideo(
  file: File,
  cameraLocation: string,
  isPrivateZone: boolean
): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('camera_location', cameraLocation);
  formData.append('is_private_zone', String(isPrivateZone));

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/analyze`, {
      method: 'POST',
      body: formData,
    });
  } catch (err) {
    throw new ApiError(
      `Could not reach the SafeZone backend at ${API_BASE_URL}. Is it running? (${(err as Error).message})`
    );
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body?.detail || detail;
    } catch {
      // ignore — body wasn't JSON
    }
    throw new ApiError(`Analysis failed: ${detail}`, response.status);
  }

  return (await response.json()) as AnalyzeResponse;
}

/**
 * Fetches the precomputed demo gallery (instant — no model inference).
 * Returns 404-backed error if generate_demo_gallery.py hasn't been run
 * yet on the backend.
 */
export async function getDemoClips(category?: 'public' | 'semi_private'): Promise<DemoGalleryItem[]> {
  const search = category ? `?category=${category}` : '';
  const response = await fetch(`${API_BASE_URL}/api/demo-clips${search}`);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body?.detail || detail;
    } catch {
      // ignore
    }
    throw new ApiError(detail, response.status);
  }
  return (await response.json()) as DemoGalleryItem[];
}

/** What the backend returns after a gallery feed is turned into a real incident. */
export interface DemoIncidentResult {
  incident_id: string;
  snapshot_url: string | null; // evidence image cut from the video, e.g. /static/outputs/evidence_SZ-2026-0001.jpg
  severity: 'low' | 'medium' | 'high';
}

/**
 * "Create incident" on a flagged gallery feed: the backend saves a real incident (with the evidence image
 * cut from the video), an alert, an audit-log entry and the Telegram message. Only works for feeds the AI flagged.
 */
export async function createIncidentFromDemoClip(clipId: string): Promise<DemoIncidentResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/demo-clips/${encodeURIComponent(clipId)}/incident`, {
      method: 'POST',
    });
  } catch (err) {
    throw new ApiError(
      `Could not reach the SafeZone backend at ${API_BASE_URL}. Is it running? (${(err as Error).message})`
    );
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body?.detail || detail;
    } catch {
      // ignore
    }
    throw new ApiError(detail, response.status);
  }
  return (await response.json()) as DemoIncidentResult;
}

/**
 * Generic JSON request helper shared by all the "real app data" calls
 * below (zones, incidents, alerts, student reports). Throws ApiError on
 * any network failure or non-2xx response, same contract as analyzeVideo.
 */
async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });
  } catch (err) {
    throw new ApiError(
      `Could not reach the SafeZone backend at ${API_BASE_URL}. Is it running? (${(err as Error).message})`
    );
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body?.detail || detail;
    } catch {
      // ignore — body wasn't JSON
    }
    throw new ApiError(detail, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---------------------------------------------------------------
// Zones — real campus config (seeded once via seed_zones.py),
// incidentCount computed live from the real incidents table.
// ---------------------------------------------------------------
export function getZones(): Promise<SchoolZone[]> {
  return apiRequest<SchoolZone[]>('/api/zones');
}

// ---------------------------------------------------------------
// Incidents — the real case register. Every mutating call returns the
// updated Incident so callers can refresh their local view.
// ---------------------------------------------------------------
export function getIncidents(): Promise<Incident[]> {
  return apiRequest<Incident[]>('/api/incidents');
}

export function getIncidentById(id: string): Promise<Incident> {
  return apiRequest<Incident>(`/api/incidents/${encodeURIComponent(id)}`);
}

export function updateIncidentStatus(
  id: string,
  body: {
    status: string;
    actorName: string;
    actorRole: string;
    details?: string;
    resolutionSummary?: string;
    dismissalReason?: string;
  }
): Promise<Incident> {
  return apiRequest<Incident>(`/api/incidents/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function assignStaff(
  id: string,
  body: { staffName: string; staffRole: string; staffEmail: string; actorName: string; actorRole: string }
): Promise<Incident> {
  return apiRequest<Incident>(`/api/incidents/${encodeURIComponent(id)}/assign`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function changePriority(
  id: string,
  body: { severity: string; actorName: string; actorRole: string; reason?: string }
): Promise<Incident> {
  return apiRequest<Incident>(`/api/incidents/${encodeURIComponent(id)}/priority`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function addIncidentNote(
  id: string,
  body: { content: string; author: string; role: string }
): Promise<Incident> {
  return apiRequest<Incident>(`/api/incidents/${encodeURIComponent(id)}/notes`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------
// Student reports — creates a real incident + alert, same shape the
// old mock incidentService.submitStudentReport() used to fake locally.
// ---------------------------------------------------------------
export interface StudentReportBody {
  category: string;
  location: string;
  approximateTime?: string;
  description: string;
  reportingMode: 'anonymous' | 'confidential';
  studentName?: string;
  gradeLevel?: string;
  contactPreference?: string;
  additionalDetails?: string;
  hasImmediateDanger: boolean;
}

export function submitStudentReport(
  body: StudentReportBody
): Promise<{ incidentId: string; referenceCode: string; incident: Incident }> {
  return apiRequest('/api/student-reports', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------
// Alerts — dispatch/notification queue, separate acknowledge/read
// state from the incident's own status workflow.
// ---------------------------------------------------------------
export function getAlerts(): Promise<AlertNotification[]> {
  return apiRequest<AlertNotification[]>('/api/alerts');
}

export function acknowledgeAlert(id: string, actorName: string, actorRole: string): Promise<AlertNotification> {
  return apiRequest<AlertNotification>(`/api/alerts/${encodeURIComponent(id)}/acknowledge`, {
    method: 'PATCH',
    body: JSON.stringify({ actorName, actorRole }),
  });
}

export function markAllAlertsRead(): Promise<void> {
  return apiRequest<void>('/api/alerts/mark-all-read', { method: 'PATCH' });
}

export async function triggerSos(payload: {
  camera_location: string;
  triggered_by?: string;
  message?: string;
  linked_incident_id?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/sos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new ApiError(`Failed to trigger SOS: ${response.statusText}`, response.status);
  return response.json();
}