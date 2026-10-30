import type {
  Incident,
  IncidentSeverity,
  IncidentStatus,
  IncidentCategory,
  StudentReportSubmission,
  SchoolZone,
} from '../types/index.ts';

export const SEVERITY_ORDER: Record<IncidentSeverity, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

export function filterIncidents(
  incidents: Incident[],
  filters: {
    search?: string;
    category?: string;
    severity?: string;
    status?: string;
    source?: string;
    zoneId?: string;
  }
): Incident[] {
  return incidents.filter((incident) => {
    if (filters.search && filters.search.trim() !== '') {
      const q = filters.search.toLowerCase().trim();
      const matchId = incident.id.toLowerCase().includes(q);
      const matchTitle = incident.title.toLowerCase().includes(q);
      const matchDesc = incident.description.toLowerCase().includes(q);
      const matchLoc = incident.location.toLowerCase().includes(q);
      if (!matchId && !matchTitle && !matchDesc && !matchLoc) {
        return false;
      }
    }

    if (filters.category && filters.category !== 'all' && incident.category !== filters.category) {
      return false;
    }

    if (filters.severity && filters.severity !== 'all' && incident.severity !== filters.severity) {
      return false;
    }

    if (filters.status && filters.status !== 'all' && incident.status !== filters.status) {
      return false;
    }

    if (filters.source && filters.source !== 'all' && incident.source !== filters.source) {
      return false;
    }

    if (filters.zoneId && filters.zoneId !== 'all' && incident.zoneId !== filters.zoneId) {
      return false;
    }

    return true;
  });
}

export function sortIncidents(
  incidents: Incident[],
  sortBy: 'date-desc' | 'date-asc' | 'priority-desc' | 'priority-asc'
): Incident[] {
  return [...incidents].sort((a, b) => {
    if (sortBy === 'date-desc') {
      return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
    }
    if (sortBy === 'date-asc') {
      return new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getTime();
    }
    if (sortBy === 'priority-desc') {
      const diff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
      if (diff !== 0) return diff;
      return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
    }
    if (sortBy === 'priority-asc') {
      const diff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (diff !== 0) return diff;
      return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
    }
    return 0;
  });
}

export function computeDashboardStats(incidents: Incident[]) {
  const total = incidents.length;
  const highPriority = incidents.filter((i) => i.severity === 'High' && i.status !== 'Resolved' && i.status !== 'Dismissed').length;
  const awaitingReview = incidents.filter((i) => i.status === 'New' || i.status === 'Under Review').length;
  const resolved = incidents.filter((i) => i.status === 'Resolved').length;

  // Category counts
  const categoryCounts: Record<IncidentCategory, number> = {
    Bullying: 0,
    'Physical Fighting': 0,
    Harassment: 0,
    'Student Distress': 0,
    'Unsafe Location': 0,
    'Other Safety Concern': 0,
  };

  incidents.forEach((i) => {
    if (categoryCounts[i.category] !== undefined) {
      categoryCounts[i.category]++;
    }
  });

  // Zone distribution
  const zoneCounts: Record<string, number> = {};
  incidents.forEach((i) => {
    zoneCounts[i.location] = (zoneCounts[i.location] || 0) + 1;
  });

  // Status breakdown
  const statusCounts: Record<IncidentStatus, number> = {
    New: 0,
    'Under Review': 0,
    Assigned: 0,
    Responding: 0,
    'Under Investigation': 0,
    Resolved: 0,
    Dismissed: 0,
  };

  incidents.forEach((i) => {
    if (statusCounts[i.status] !== undefined) {
      statusCounts[i.status]++;
    }
  });

  return {
    total,
    highPriority,
    awaitingReview,
    resolved,
    categoryCounts,
    zoneCounts,
    statusCounts,
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateStudentReport(data: Partial<StudentReportSubmission>): ValidationResult {
  const errors: Record<string, string> = {};

  if (!data.category) {
    errors.category = 'Please choose a safety category.';
  }

  if (!data.location || data.location.trim() === '') {
    errors.location = 'Please specify the general school location.';
  }

  if (!data.description || data.description.trim().length < 10) {
    errors.description = 'Please provide a clear description (at least 10 characters).';
  }

  if (data.reportingMode === 'confidential') {
    if (!data.studentName || data.studentName.trim() === '') {
      errors.studentName = 'Name is required for confidential reporting so counselors can assist you.';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validatePrivacyRules(zones: SchoolZone[]): { safe: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const zone of zones) {
    if (zone.privacyLevel === 'Strictly Private (No Video)') {
      if (zone.cctvPermitted) {
        violations.push(`Violation: CCTV permitted flag set on private zone "${zone.name}".`);
      }
      if (zone.deviceType.includes('CCTV') || zone.marker.type === 'camera') {
        violations.push(`Violation: Optical camera device configured in private zone "${zone.name}".`);
      }
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}

export function formatSafeDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}
