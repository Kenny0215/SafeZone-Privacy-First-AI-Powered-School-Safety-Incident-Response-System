import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterIncidents,
  sortIncidents,
  computeDashboardStats,
  validateStudentReport,
  validatePrivacyRules,
  SEVERITY_ORDER,
} from './incidentLogic.ts';
import type { Incident, SchoolZone } from '../types/index.ts';

const mockIncidents: Incident[] = [
  {
    id: 'INC-2026-001',
    category: 'Bullying',
    severity: 'High',
    status: 'New',
    location: 'Cafeteria',
    zoneId: 'zone-cafeteria',
    privacyLevel: 'Permitted Surveillance',
    source: 'Student Report (Anon)',
    title: 'Verbal harassment near lunch counter',
    description: 'Repeated teasing targeting younger student.',
    reportedAt: '2026-10-14T10:30:00Z',
    updatedAt: '2026-10-14T10:30:00Z',
    notes: [],
    timeline: [],
  },
  {
    id: 'INC-2026-002',
    category: 'Physical Fighting',
    severity: 'High',
    status: 'Assigned',
    location: 'Courtyard',
    zoneId: 'zone-courtyard',
    privacyLevel: 'Permitted Surveillance',
    source: 'CCTV AI Detection (Permitted Zone)',
    title: 'Crowd gathering and physical scuffle',
    description: 'Rapid cluster formation detected by optical camera.',
    reportedAt: '2026-10-15T09:00:00Z',
    updatedAt: '2026-10-15T09:15:00Z',
    notes: [],
    timeline: [],
  },
  {
    id: 'INC-2026-003',
    category: 'Unsafe Location',
    severity: 'Low',
    status: 'Resolved',
    location: 'Staircase',
    zoneId: 'zone-staircase',
    privacyLevel: 'Permitted Surveillance',
    source: 'Staff Report',
    title: 'Water spill on stairs',
    description: 'Slippery puddle on west stairwell.',
    reportedAt: '2026-10-13T08:00:00Z',
    updatedAt: '2026-10-13T09:00:00Z',
    notes: [],
    timeline: [],
  },
];

test('SEVERITY_ORDER defines correct rankings', () => {
  assert.ok(SEVERITY_ORDER.High > SEVERITY_ORDER.Medium);
  assert.ok(SEVERITY_ORDER.Medium > SEVERITY_ORDER.Low);
});

test('filterIncidents by search query matches ID and title', () => {
  const result = filterIncidents(mockIncidents, { search: 'scuffle' });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'INC-2026-002');
});

test('filterIncidents by category', () => {
  const result = filterIncidents(mockIncidents, { category: 'Bullying' });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'INC-2026-001');
});

test('filterIncidents with multiple criteria', () => {
  const result = filterIncidents(mockIncidents, {
    severity: 'High',
    status: 'New',
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'INC-2026-001');
});

test('sortIncidents by date desc', () => {
  const sorted = sortIncidents(mockIncidents, 'date-desc');
  assert.equal(sorted[0].id, 'INC-2026-002');
  assert.equal(sorted[2].id, 'INC-2026-003');
});

test('computeDashboardStats calculates accurate metrics', () => {
  const stats = computeDashboardStats(mockIncidents);
  assert.equal(stats.total, 3);
  assert.equal(stats.highPriority, 2); // INC-001 and INC-002 are High and not resolved
  assert.equal(stats.awaitingReview, 1); // INC-001 is New
  assert.equal(stats.resolved, 1); // INC-003 is Resolved
  assert.equal(stats.categoryCounts.Bullying, 1);
  assert.equal(stats.categoryCounts['Physical Fighting'], 1);
  assert.equal(stats.categoryCounts['Unsafe Location'], 1);
});

test('validateStudentReport validates required fields', () => {
  const invalid = validateStudentReport({});
  assert.equal(invalid.isValid, false);
  assert.ok(invalid.errors.category);
  assert.ok(invalid.errors.location);
  assert.ok(invalid.errors.description);

  const validAnon = validateStudentReport({
    category: 'Bullying',
    location: 'Cafeteria',
    description: 'This is a detailed description of an incident happening.',
    reportingMode: 'anonymous',
  });
  assert.equal(validAnon.isValid, true);

  const missingConfidentialName = validateStudentReport({
    category: 'Bullying',
    location: 'Cafeteria',
    description: 'This is a detailed description of an incident happening.',
    reportingMode: 'confidential',
  });
  assert.equal(missingConfidentialName.isValid, false);
  assert.ok(missingConfidentialName.errors.studentName);
});

test('validatePrivacyRules verifies strict prohibition of CCTV in private zones', () => {
  const compliantZones: SchoolZone[] = [
    {
      id: 'z-restroom',
      name: 'Toilet Entrance',
      category: 'Hygiene/Restroom',
      privacyLevel: 'Strictly Private (No Video)',
      deviceType: 'Acoustic / Vape Sensor (Non-Visual)',
      deviceStatus: 'Active & Healthy',
      coverageDescription: 'Acoustic spike & threshold vape detection only. Zero cameras.',
      cctvPermitted: false,
      incidentCount: 0,
      coordinates: { x: 70, y: 30, width: 20, height: 15 },
      marker: { x: 75, y: 35, type: 'sensor' },
    },
    {
      id: 'z-corridor',
      name: 'Main Corridor',
      category: 'Corridor',
      privacyLevel: 'Permitted Surveillance',
      deviceType: 'CCTV Camera (Optical)',
      deviceStatus: 'Active & Healthy',
      coverageDescription: 'Optical safety monitoring in public corridor.',
      cctvPermitted: true,
      incidentCount: 1,
      coordinates: { x: 20, y: 20, width: 30, height: 15 },
      marker: { x: 25, y: 25, type: 'camera' },
    },
  ];

  const check1 = validatePrivacyRules(compliantZones);
  assert.equal(check1.safe, true);
  assert.equal(check1.violations.length, 0);

  const violatingZones: SchoolZone[] = [
    {
      id: 'z-restroom-bad',
      name: 'Changing-Room Entrance',
      category: 'Hygiene/Restroom',
      privacyLevel: 'Strictly Private (No Video)',
      deviceType: 'CCTV Camera (Optical)',
      deviceStatus: 'Active & Healthy',
      coverageDescription: 'Illegal camera',
      cctvPermitted: true,
      incidentCount: 0,
      coordinates: { x: 70, y: 30, width: 20, height: 15 },
      marker: { x: 75, y: 35, type: 'camera' },
    },
  ];

  const check2 = validatePrivacyRules(violatingZones);
  assert.equal(check2.safe, false);
  assert.equal(check2.violations.length, 2);
});
