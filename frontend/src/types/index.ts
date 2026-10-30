export type IncidentCategory =
  | 'Bullying'
  | 'Physical Fighting'
  | 'Harassment'
  | 'Student Distress'
  | 'Unsafe Location'
  | 'Other Safety Concern';

export type IncidentSeverity = 'Low' | 'Medium' | 'High';

export type IncidentStatus =
  | 'New'
  | 'Under Review'
  | 'Assigned'
  | 'Responding'
  | 'Under Investigation'
  | 'Resolved'
  | 'Dismissed';

export type IncidentSource =
  | 'Student Report (Anon)'
  | 'Student Report (Confidential)'
  | 'CCTV AI Detection (Permitted Zone)'
  | 'Staff Report'
  | 'Help Point Button'
  | 'Non-Visual Sensor';

export type ZonePrivacyLevel = 'Permitted Surveillance' | 'Strictly Private (No Video)' | 'Restricted Area';

export interface IncidentTimelineEvent {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  details?: string;
}

export interface IncidentNote {
  id: string;
  author: string;
  role: string;
  timestamp: string;
  content: string;
  isPrivate?: boolean;
}

export interface Incident {
  id: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  location: string;
  zoneId: string;
  privacyLevel: ZonePrivacyLevel;
  source: IncidentSource;
  title: string;
  description: string;
  reportedAt: string;
  updatedAt: string;
  assignedStaff?: {
    name: string;
    role: string;
    email: string;
  };
  reporterInfo?: {
    isAnonymous: boolean;
    name?: string;
    grade?: string;
    contactMethod?: string;
  };
  aiAssessment?: {
    isSimulated: boolean;
    confidenceScore: number; // 0-100
    detectedSignals: string[];
    suggestedSeverity: IncidentSeverity;
    rationale: string;
    triageTimestamp: string;
  };
  evidenceSummary?: {
    hasMedia: boolean;
    mediaType?: 'video' | 'audio_sensor' | 'student_attachment' | 'none';
    isRestricted: boolean;
    restrictionReason?: string;
    mediaUrl?: string;
    snapshotUrl?: string;
  };
  notes: IncidentNote[];
  timeline: IncidentTimelineEvent[];
  resolutionSummary?: string;
  dismissalReason?: string;
}

export interface SchoolZone {
  id: string;
  name: string;
  category: 'Corridor' | 'Cafeteria' | 'Outdoor' | 'Sports' | 'Hygiene/Restroom' | 'Academic';
  privacyLevel: ZonePrivacyLevel;
  deviceType: 'CCTV Camera (Optical)' | 'Acoustic / Vape Sensor (Non-Visual)' | 'Student Emergency Help Point' | 'None (Physical Patrol Only)';
  deviceStatus: 'Active & Healthy' | 'Standby' | 'Degraded' | 'Offline';
  coverageDescription: string;
  cctvPermitted: boolean;
  incidentCount: number;
  coordinates: {
    x: number; // percentage in floor plan
    y: number;
    width: number;
    height: number;
  };
  marker: {
    x: number;
    y: number;
    type: 'camera' | 'sensor' | 'help_point';
  };
}

export interface AlertNotification {
  id: string;
  incidentId: string;
  title: string;
  message: string;
  severity: IncidentSeverity;
  location: string;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  read: boolean;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  relatedIncidentId?: string;
  outcome: 'Success' | 'Flagged' | 'Denied' | 'Warning';
  details: string;
}

export interface StudentReportSubmission {
  category: IncidentCategory;
  location: string;
  approximateTime: string;
  description: string;
  reportingMode: 'anonymous' | 'confidential';
  studentName?: string;
  gradeLevel?: string;
  contactPreference?: string;
  additionalDetails?: string;
  hasImmediateDanger: boolean;
}

export interface VideoAnalysisResult {
  id: string;
  fileName: string;
  fileSizeMb: number;
  zoneId: string;
  zoneName: string;
  isSimulated: boolean;
  timestamp: string;
  status: 'completed' | 'failed';
  detectedEvents: {
    timecode: string;
    event: string;
    confidence: number;
    description: string;
    severityRecommendation: IncidentSeverity;
  }[];
  overallConfidence: number;
  recommendedCategory: IncidentCategory;
  recommendedSeverity: IncidentSeverity;
  summaryExplanation: string;
  privacyGuarantee: string;
}

export interface UserProfile {
  id: string;
  name: string;
  role: 'Administrator' | 'School Safety Staff' | 'Counsellor' | 'Read-only Reviewer';
  email: string;
  avatarInitials: string;
}
