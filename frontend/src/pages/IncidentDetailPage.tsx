import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  UserCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  MapPin,
  Sparkles,
  MessageSquare,
  Lock,
  EyeOff,
  History,
  Send,
  User,
  Shield,
  FileCheck,
  ExternalLink,
} from 'lucide-react';
import { incidentService } from '../services/incidentService.ts';
import { Incident, IncidentSeverity, IncidentStatus } from '../types/index.ts';
import { formatSafeDate } from '../utils/incidentLogic.ts';
import { AVAILABLE_STAFF, CURRENT_USER } from '../data/seedData.ts';
import { SeverityBadge } from '../components/common/SeverityBadge.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import { ConfirmationModal } from '../components/common/ConfirmationModal.tsx';
import { useToast } from '../components/common/Toast.tsx';
import { toAbsoluteMediaUrl } from '../services/apiclient.ts';

export const IncidentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [incident, setIncident] = useState<Incident | undefined>(() =>
    id ? incidentService.getIncidentById(id) : undefined
  );

  const [noteContent, setNoteContent] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState(AVAILABLE_STAFF[0].id);

  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [selectedNewPriority, setSelectedNewPriority] = useState<IncidentSeverity>('High');
  const [priorityReason, setPriorityReason] = useState('');

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);

  useEffect(() => {
    if (id) {
      setIncident(incidentService.getIncidentById(id));
    }
    const unsub = incidentService.subscribe(() => {
      if (id) {
        setIncident(incidentService.getIncidentById(id));
      }
    });
    return unsub;
  }, [id]);

  if (!incident) {
    return (
      <div className="max-w-3xl mx-auto p-12 text-center bg-white rounded-xl border border-slate-200">
        <h3 className="text-base font-bold text-slate-800">Incident Not Found</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          The requested case ID does not exist or has been archived.
        </p>
        <button
          onClick={() => navigate('/incidents')}
          className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-xs font-semibold"
        >
          Return to Incident Register
        </button>
      </div>
    );
  }

  // Action handlers
  const handleAcknowledge = () => {
    incidentService.updateIncidentStatus(
      incident.id,
      'Under Review',
      CURRENT_USER.name,
      CURRENT_USER.role,
      'Case acknowledged by safety operator on duty.'
    );
    addToast({
      type: 'success',
      title: 'Incident Acknowledged',
      message: `Status moved to Under Review.`,
    });
  };

  const handleConfirmAssign = () => {
    const staff = AVAILABLE_STAFF.find((s) => s.id === selectedStaffId);
    if (!staff) return;

    incidentService.assignStaff(incident.id, staff, CURRENT_USER.name, CURRENT_USER.role);
    setShowAssignModal(false);
    addToast({
      type: 'success',
      title: 'Staff Assigned',
      message: `Assigned to ${staff.name} (${staff.role}).`,
    });
  };

  const handleConfirmPriorityChange = () => {
    incidentService.changePriority(
      incident.id,
      selectedNewPriority,
      CURRENT_USER.name,
      CURRENT_USER.role,
      priorityReason || undefined
    );
    setShowPriorityModal(false);
    setPriorityReason('');
    addToast({
      type: 'info',
      title: 'Priority Updated',
      message: `Incident severity updated to ${selectedNewPriority}.`,
    });
  };

  const handleConfirmEscalate = () => {
    incidentService.changePriority(
      incident.id,
      'High',
      CURRENT_USER.name,
      CURRENT_USER.role,
      'Immediate emergency escalation triggered.'
    );
    incidentService.updateIncidentStatus(
      incident.id,
      'Responding',
      CURRENT_USER.name,
      CURRENT_USER.role,
      'Escalated to Responding status for urgent intervention.'
    );
    setShowEscalateModal(false);
    addToast({
      type: 'warning',
      title: 'Case Escalated',
      message: `Incident escalated to High Priority • Responding.`,
    });
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;

    incidentService.addIncidentNote(
      incident.id,
      noteContent.trim(),
      CURRENT_USER.name,
      CURRENT_USER.role
    );
    setNoteContent('');
    addToast({
      type: 'success',
      title: 'Note Recorded',
      message: 'Investigation note added to permanent case record.',
    });
  };

  const handleConfirmResolve = (resolutionSummary?: string) => {
    incidentService.updateIncidentStatus(
      incident.id,
      'Resolved',
      CURRENT_USER.name,
      CURRENT_USER.role,
      'Case resolved following human safety investigation.',
      resolutionSummary
    );
    addToast({
      type: 'success',
      title: 'Case Resolved',
      message: `Incident ${incident.id} marked Resolved.`,
    });
  };

  const handleConfirmDismiss = (dismissalReason?: string) => {
    incidentService.updateIncidentStatus(
      incident.id,
      'Dismissed',
      CURRENT_USER.name,
      CURRENT_USER.role,
      'Case dismissed following evaluation.',
      undefined,
      dismissalReason
    );
    addToast({
      type: 'info',
      title: 'Case Dismissed',
      message: `Incident ${incident.id} dismissed with recorded rationale.`,
    });
  };

  const isClosed = incident.status === 'Resolved' || incident.status === 'Dismissed';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Navigation & Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/incidents')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3 py-1.5 rounded-lg border border-slate-200 transition-colors shadow-xs"
        >
          <ArrowLeft size={14} />
          <span>Back to Incidents</span>
        </button>

        <span className="text-xs text-slate-400 font-mono">Case ID: {incident.id}</span>
      </div>

      {/* Case Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-100 text-cyan-800">
                {incident.category}
              </span>
              <SeverityBadge severity={incident.severity} size="md" />
              <StatusBadge status={incident.status} size="md" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">{incident.title}</h2>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-2">
              <span className="flex items-center gap-1.5">
                <MapPin size={14} className="text-slate-400" />
                <span className="font-medium text-slate-700">{incident.location}</span>
                <span className="text-slate-400">({incident.privacyLevel})</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Clock size={14} className="text-slate-400" />
                <span>Reported {formatSafeDate(incident.reportedAt)}</span>
              </span>
              <span>•</span>
              <span>Source: <strong className="text-slate-700">{incident.source}</strong></span>
            </div>
          </div>

          {/* Action Toolbar */}
          {!isClosed && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {incident.status === 'New' && (
                <button
                  type="button"
                  onClick={handleAcknowledge}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs"
                >
                  Acknowledge Incident
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowAssignModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs"
              >
                <UserCheck size={14} />
                <span>{incident.assignedStaff ? 'Reassign' : 'Assign Staff'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPriorityModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs"
              >
                <AlertTriangle size={14} />
                <span>Change Priority</span>
              </button>

              {incident.severity !== 'High' && (
                <button
                  type="button"
                  onClick={() => setShowEscalateModal(true)}
                  className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-xs"
                >
                  Escalate
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowResolveModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs"
              >
                <CheckCircle2 size={14} />
                <span>Resolve</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDismissModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-semibold text-xs shadow-xs"
              >
                <XCircle size={14} />
                <span>Dismiss</span>
              </button>
            </div>
          )}
        </div>

        {/* Closed Case Banner */}
        {incident.status === 'Resolved' && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
            <div className="flex items-center gap-2 font-bold text-emerald-800">
              <CheckCircle2 size={16} />
              <span>Case Successfully Resolved</span>
            </div>
            <p className="text-emerald-800 leading-relaxed font-medium">
              {incident.resolutionSummary || 'Resolution recorded by safety staff.'}
            </p>
          </div>
        )}

        {incident.status === 'Dismissed' && (
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 text-xs space-y-1">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <XCircle size={16} />
              <span>Case Dismissed</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              {incident.dismissalReason || 'Dismissed as false positive or accidental trigger.'}
            </p>
          </div>
        )}

        {/* Narrative Description */}
        <div className="space-y-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Incident Narrative</h3>
          <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line bg-slate-50/60 p-4 rounded-xl border border-slate-200/80">
            {incident.description}
          </p>
        </div>
      </div>

      {/* Two Column Layout: Assessment & Evidence vs Notes & History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Assessment, Evidence, Reporter (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* AI Assessment / Simulated Triage */}
          {incident.aiAssessment && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2 text-cyan-800 font-bold text-xs">
                  <Sparkles size={16} className="text-cyan-600" />
                  <span>AI Assessment (Simulated Triage)</span>
                </div>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                  Advisory Only
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Confidence Score:</span>
                <span className="font-bold text-cyan-700 text-sm">
                  {incident.aiAssessment.confidenceScore}%
                </span>
              </div>

              <div className="text-xs bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-700 leading-relaxed">
                <strong className="text-slate-900 block mb-1">Algorithmic Rationale:</strong>
                <span>{incident.aiAssessment.rationale}</span>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Detected Signals:
                </span>
                <ul className="space-y-1 text-xs text-slate-700">
                  {incident.aiAssessment.detectedSignals.map((sig, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-500"></span>
                      <span>{sig}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                Triage timestamp: {formatSafeDate(incident.aiAssessment.triageTimestamp)}
              </div>
            </div>
          )}

          {/* Evidence Preview / Privacy Guard */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <FileCheck size={14} className="text-cyan-600" />
              <span>Evidence Preview & Privacy Status</span>
            </h3>

            {incident.evidenceSummary?.isRestricted ? (
              <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs text-purple-800">
                  <Lock size={15} />
                  <span>Restricted Private Space Evidence</span>
                </div>
                <p className="text-xs text-purple-800 leading-relaxed">
                  {incident.evidenceSummary.restrictionReason ||
                    'In accordance with SafeZone Privacy Constitution, video and raw audio capture are strictly prohibited in this zone.'}
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-purple-700 font-semibold pt-1">
                  <EyeOff size={13} />
                  <span>Zero visual or biometric recordings exist</span>
                </div>
              </div>
            ) : incident.evidenceSummary?.hasMedia && incident.evidenceSummary.snapshotUrl ? (
              <div className="space-y-2.5">
                <a
                  href={toAbsoluteMediaUrl(incident.evidenceSummary.snapshotUrl)}
                  target="_blank"
                  rel="noreferrer"
                  title="Open the full-size image"
                  className="block relative group"
                >
                  <img
                    src={toAbsoluteMediaUrl(incident.evidenceSummary.snapshotUrl)}
                    alt="Evidence image cut from the video at the moment violence was detected"
                    className="w-full max-h-72 object-contain bg-slate-900 rounded-lg border border-slate-200"
                  />
                  <span className="absolute top-2 left-2 text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-900/70 text-white">
                    Evidence image
                  </span>
                  <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-slate-900/70 text-white">
                    <ExternalLink size={12} />
                  </span>
                </a>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Cut from the video at the moment the AI detected violence
                  {incident.aiAssessment ? ` (${incident.aiAssessment.confidenceScore}% confidence)` : ''}.
                  It is a pointer for the reviewer, not proof: a person must confirm before acting. Taken in
                  a permitted surveillance zone.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-slate-50 text-center text-xs text-slate-400">
                No evidence image for this incident.
              </div>
            )}
          </div>

          {/* Reporter & Assigned Staff Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3 text-xs">
            <h3 className="font-bold text-slate-900 uppercase tracking-wider">
              Reporter & Staff Ownership
            </h3>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-400 font-medium block">Reporter Information</span>
              {incident.reporterInfo?.isAnonymous ? (
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <Lock size={13} className="text-cyan-600" />
                  <span>100% Anonymous Submission (Identity Unrecorded)</span>
                </div>
              ) : incident.reporterInfo?.name ? (
                <div>
                  <span className="font-semibold text-slate-800">{incident.reporterInfo.name}</span>
                  {incident.reporterInfo.grade && (
                    <span className="text-slate-500 block">{incident.reporterInfo.grade}</span>
                  )}
                  {incident.reporterInfo.contactMethod && (
                    <span className="text-cyan-700 block text-[11px]">
                      Contact: {incident.reporterInfo.contactMethod}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-slate-600 font-medium">{incident.source}</span>
              )}
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-400 font-medium block">Assigned Staff Lead</span>
              {incident.assignedStaff ? (
                <div>
                  <div className="font-semibold text-slate-900">{incident.assignedStaff.name}</div>
                  <div className="text-slate-500">{incident.assignedStaff.role}</div>
                  <div className="text-cyan-700 text-[11px]">{incident.assignedStaff.email}</div>
                </div>
              ) : (
                <span className="text-amber-700 italic">No staff assigned yet</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Investigation Notes & Action Timeline (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Internal Notes Section */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <MessageSquare size={14} className="text-cyan-600" />
              <span>Internal Case Notes ({incident.notes.length})</span>
            </h3>

            {/* Note form */}
            {!isClosed && (
              <form onSubmit={handleAddNote} className="space-y-2">
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  rows={2}
                  placeholder="Record an investigation update, witness statement, or counselor note..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-900 placeholder-slate-400"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!noteContent.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 text-white font-semibold text-xs hover:bg-cyan-700 transition-colors shadow-xs disabled:opacity-50"
                  >
                    <Send size={12} />
                    <span>Save Note</span>
                  </button>
                </div>
              </form>
            )}

            {/* Existing notes list */}
            <div className="space-y-2.5 pt-2">
              {incident.notes.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No notes recorded yet.</p>
              ) : (
                incident.notes.map((note) => (
                  <div key={note.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span className="font-semibold text-slate-800">{note.author} ({note.role})</span>
                      <span>{formatSafeDate(note.timestamp)}</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Action History Timeline */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <History size={14} className="text-cyan-600" />
              <span>Audit-Compliant Action Timeline</span>
            </h3>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {incident.timeline.map((event) => (
                <div key={event.id} className="relative">
                  {/* Timeline circle marker */}
                  <div className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full bg-cyan-600 border-2 border-white ring-2 ring-cyan-100" />

                  <div className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{event.action}</span>
                      <span className="text-[11px] text-slate-400">{formatSafeDate(event.timestamp)}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Actor: <span className="font-medium text-slate-700">{event.actor}</span> ({event.role})
                    </p>
                    {event.details && (
                      <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-100 mt-1.5 leading-relaxed">
                        {event.details}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation & Action Dialogs */}
      {/* Assign Staff Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Assign Staff Member</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Designate a lead responder or counselor for case {incident.id}.
            </p>
            <div className="space-y-2">
              {AVAILABLE_STAFF.map((staff) => (
                <label
                  key={staff.id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedStaffId === staff.id
                      ? 'border-cyan-500 bg-cyan-50/60 ring-1 ring-cyan-400'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="staffSelect"
                      checked={selectedStaffId === staff.id}
                      onChange={() => setSelectedStaffId(staff.id)}
                      className="text-cyan-600 focus:ring-cyan-500"
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-900">{staff.name}</p>
                      <p className="text-[11px] text-slate-500">{staff.role}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-cyan-700 font-semibold">{staff.email}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAssign}
                className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold shadow-xs"
              >
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Priority Modal */}
      {showPriorityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Change Incident Priority</h3>
            <p className="text-xs text-slate-600">
              Select the calibrated severity tier based on human investigation findings:
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(['Low', 'Medium', 'High'] as IncidentSeverity[]).map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSelectedNewPriority(sev)}
                  className={`p-2.5 rounded-lg border text-xs font-bold transition-all ${
                    selectedNewPriority === sev
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-800 ring-2 ring-cyan-400'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Triage Rationale
              </label>
              <textarea
                value={priorityReason}
                onChange={(e) => setPriorityReason(e.target.value)}
                rows={2}
                placeholder="Explain the reason for calibration..."
                className="w-full text-xs rounded-lg border border-slate-200 p-2 text-slate-900"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowPriorityModal(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPriorityChange}
                className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold shadow-xs"
              >
                Save New Priority
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escalate Confirmation Modal */}
      <ConfirmationModal
        isOpen={showEscalateModal}
        title="Escalate Incident to High Priority"
        description="This will upgrade the severity to High and immediately move the workflow status to Responding. On-duty safety officers will be notified."
        confirmLabel="Confirm Escalation"
        variant="danger"
        onConfirm={handleConfirmEscalate}
        onClose={() => setShowEscalateModal(false)}
      />

      {/* Resolve Modal with Required Resolution Summary */}
      <ConfirmationModal
        isOpen={showResolveModal}
        title="Resolve Safety Incident"
        description="Please provide a clear written resolution summary explaining what corrective, medical, counseling, or disciplinary actions were taken."
        confirmLabel="Resolve Case"
        variant="success"
        requireInput={true}
        inputLabel="Resolution Summary"
        inputPlaceholder="e.g. Facilities cleaned spill / Counselor completed student safety agreement..."
        inputRequired={true}
        onConfirm={handleConfirmResolve}
        onClose={() => setShowResolveModal(false)}
      />

      {/* Dismiss Modal with Required Dismissal Reason */}
      <ConfirmationModal
        isOpen={showDismissModal}
        title="Dismiss Safety Incident"
        description="Please provide a factual explanation for dismissing this incident (e.g. accidental trigger, unsubstantiated report, duplicate entry)."
        confirmLabel="Dismiss Incident"
        variant="warning"
        requireInput={true}
        inputLabel="Dismissal Reason"
        inputPlaceholder="e.g. Verified false alarm via teacher intercom..."
        inputRequired={true}
        onConfirm={handleConfirmDismiss}
        onClose={() => setShowDismissModal(false)}
      />
    </div>
  );
};