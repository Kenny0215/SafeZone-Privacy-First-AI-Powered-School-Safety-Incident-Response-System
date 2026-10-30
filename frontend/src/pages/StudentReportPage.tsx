import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HeartHandshake,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  PhoneCall,
  Clock,
  MapPin,
  Send,
  HelpCircle,
  ArrowLeft,
  LifeBuoy,
  X,
} from 'lucide-react';
import { incidentService } from '../services/incidentService.ts';
import { IncidentCategory, StudentReportSubmission } from '../types/index.ts';
import { validateStudentReport } from '../utils/incidentLogic.ts';

export const StudentReportPage: React.FC = () => {
  const navigate = useNavigate();

  // Form state
  const [category, setCategory] = useState<IncidentCategory>('Bullying');
  const [location, setLocation] = useState('Toilet Entrance West');
  const [approximateTime, setApproximateTime] = useState('Just now (During lunch passing)');
  const [description, setDescription] = useState('');
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Help modal & Submission confirmation state
  const [showHelpModal, setShowHelpModal] = useState(false);
  // Confirmed separately from the main form's `location` field — the SOS
  // button sits above the form, so a student can tap it before ever
  // touching that dropdown. Seeded from `location` when the modal opens,
  // but shown explicitly so the student actively confirms (or corrects)
  // it before an emergency alert goes out with the wrong zone.
  const [emergencyLocation, setEmergencyLocation] = useState(location);
  const [submissionResult, setSubmissionResult] = useState<{
    referenceCode: string;
    incidentId: string;
    isEmergency: boolean;
  } | null>(null);

  // Deliberately limited to the school's "Strictly Private (No Video)"
  // zones only (see seed_zones.py) — Courtyard, Cafeteria, Main Corridor,
  // Staircase East, Sports Hall & Gym, and Classroom Corridor B are all
  // "Permitted Surveillance" zones already covered by the AI video
  // pipeline (Video Analysis page), so a student-report location there
  // would be redundant with automatic CCTV detection. Restrooms/changing
  // rooms get zero camera coverage by design — voluntary student
  // reporting (plus the non-visual acoustic sensor) is the ONLY way an
  // incident there is ever known, which is exactly what this page is for.
  // (Dropped "Library & Study Hall" / "School Bus Loop" too — those
  // never existed as real zones in seed_zones.py/Supabase to begin with.)
  const schoolLocations = [
    'Toilet Entrance West',
    'Changing-Room Entrance',
  ];

  const handleSelectQuickCategory = (cat: IncidentCategory) => {
    setCategory(cat);
    // Smooth scroll to form
    const el = document.getElementById('report-form-container');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const submission: StudentReportSubmission = {
      category,
      location,
      approximateTime,
      description,
      reportingMode: 'anonymous',
      additionalDetails,
      hasImmediateDanger: false,
    };

    const validation = validateStudentReport(submission);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    setSubmitError('');
    setIsSubmitting(true);
    try {
      const res = await incidentService.submitStudentReport(submission);
      setSubmissionResult({
        referenceCode: res.referenceCode,
        incidentId: res.incidentId,
        isEmergency: false,
      });
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Could not reach the SafeZone backend. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmergencyHelpRequest = async (confirmedLocation: string) => {
    const submission: StudentReportSubmission = {
      category: 'Student Distress',
      location: confirmedLocation || 'Campus Main Grounds',
      approximateTime: 'Immediate Urgent Request',
      description: 'Emergency Student Help Request triggered from student mobile portal.',
      reportingMode: 'anonymous',
      hasImmediateDanger: true,
    };

    setSubmitError('');
    try {
      const res = await incidentService.submitStudentReport(submission);
      setShowHelpModal(false);
      setSubmissionResult({
        referenceCode: res.referenceCode,
        incidentId: res.incidentId,
        isEmergency: true,
      });
    } catch (err) {
      setShowHelpModal(false);
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Could not reach the SafeZone backend. Please try again, or seek an adult immediately.'
      );
    }
  };

  const handleStartNewReport = () => {
    setSubmissionResult(null);
    setDescription('');
    setAdditionalDetails('');
    setErrors({});
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-cyan-50/20 to-slate-100 p-4 md:p-8 text-slate-900">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Navigation back to staff dashboard */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white/80 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-slate-200 transition-colors shadow-xs"
          >
            <ArrowLeft size={13} />
            <span>Switch to Staff Operations Dashboard</span>
          </button>

          <span className="text-[11px] font-semibold text-cyan-800 bg-cyan-100/70 px-2.5 py-0.5 rounded-full">
            SafeZone Student Support
          </span>
        </div>

        {/* Portal Header */}
        <div className="text-center space-y-2 pt-2 pb-1">
          <div className="inline-flex p-3 rounded-2xl bg-cyan-600 text-white shadow-md shadow-cyan-600/20 mb-1">
            <HeartHandshake size={28} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Speak Up for Safety. We're Here to Listen.
          </h1>
          <p className="text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
            SafeZone empowers students to report bullying, harassment, unsafe spots, or distress with total privacy. You are never tracked.
          </p>
        </div>

        {/* Urgent Emergency Help Card */}
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 sm:p-5 text-rose-950 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3 text-left">
            <div className="p-2 rounded-xl bg-rose-200 text-rose-800 shrink-0 mt-0.5">
              <LifeBuoy size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-rose-950">In immediate danger or feeling overwhelmed?</h2>
              <p className="text-xs text-rose-800 mt-0.5 leading-relaxed">
                If someone is hurt or you need immediate adult help right now, tap the urgent request button.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              // Re-seed from the main form's location every time the modal
              // opens, in case the student changed that dropdown since the
              // last time — but the modal still shows it explicitly so they
              // confirm (or correct) it before an emergency alert goes out.
              setEmergencyLocation(location);
              setShowHelpModal(true);
            }}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 shadow-sm transition-colors text-center"
          >
            Request Immediate Help
          </button>
        </div>

        {/* Submission Confirmation Screen */}
        {submissionResult ? (
          <div
            className={`bg-white rounded-2xl border-2 p-6 md:p-8 shadow-md text-center space-y-5 animate-in fade-in duration-200 ${
              submissionResult.isEmergency ? 'border-rose-300' : 'border-slate-200'
            }`}
          >
            <div
              className={`h-16 w-16 rounded-full flex items-center justify-center mx-auto border-2 ${
                submissionResult.isEmergency
                  ? 'bg-rose-100 text-rose-700 border-rose-300'
                  : 'bg-emerald-100 text-emerald-700 border-emerald-300'
              }`}
            >
              {submissionResult.isEmergency ? <LifeBuoy size={36} /> : <CheckCircle2 size={36} />}
            </div>

            <div className="space-y-1">
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  submissionResult.isEmergency ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {submissionResult.isEmergency ? 'Staff Alerted — Top Priority' : 'Report Safely Received'}
              </span>
              <h2 className="text-xl font-black text-slate-900">
                {submissionResult.isEmergency ? 'Help Is On the Way' : 'Thank You for Speaking Up'}
              </h2>
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                {submissionResult.isEmergency
                  ? 'An urgent, top-priority alert was just sent to on-duty safety staff with your location. Stay somewhere safe if you can.'
                  : 'Your report has been securely registered in the SafeZone system.'}
              </p>
            </div>

            {/* Important Real-World Safety Guidance — shown FIRST and more
                prominently for a real emergency, since that's the single
                most important thing on this screen in that case. */}
            {submissionResult.isEmergency && (
              <div className="p-4 rounded-xl bg-rose-50 border-2 border-rose-200 text-rose-950 text-left text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle size={15} />
                  <span>If you are in active danger right now:</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 font-semibold">
                  <li>Tell the nearest on-duty teacher, principal, or school nurse immediately — don't wait for staff to find you.</li>
                  <li>Call <strong>911</strong> in any life-threatening emergency.</li>
                  <li>Call or text <strong>988</strong> for free, confidential, 24/7 crisis counseling.</li>
                </ul>
                <p className="leading-relaxed pt-1 border-t border-rose-200/70">
                  This dashboard alert is a demonstration prototype and a supplement to — never a replacement for — getting an adult's help directly.
                </p>
              </div>
            )}

            {/* Reference Box */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 max-w-sm mx-auto space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Your Demo Reference Code
              </span>
              <span className="font-mono text-xl font-black text-cyan-700 tracking-wider">
                {submissionResult.referenceCode}
              </span>
              <p className="text-[11px] text-slate-500">
                Mode: Anonymous (Zero Identifiers)
              </p>
            </div>

            {/* Important Real-World Safety Guidance (non-emergency reports) */}
            {!submissionResult.isEmergency && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-left text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <AlertTriangle size={15} />
                  <span>Important Safety Reminder:</span>
                </div>
                <p className="leading-relaxed">
                  This is a hackathon demonstration prototype. While reports appear on the staff dashboard, if you or another student face active physical harm or acute crisis:
                </p>
                <ul className="list-disc pl-5 space-y-1 font-medium">
                  <li>Tell an on-duty teacher, school principal, or school nurse immediately.</li>
                  <li>Call <strong>911</strong> in any life-threatening emergency.</li>
                  <li>Call or text <strong>988</strong> for free, confidential, 24/7 mental health and crisis counseling.</li>
                </ul>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleStartNewReport}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors"
              >
                Submit Another Report
              </button>
              <button
                type="button"
                onClick={() => navigate('/incidents')}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-cyan-600 text-white font-semibold text-xs hover:bg-cyan-700 transition-colors shadow-xs"
              >
                View in Staff Incident Register →
              </button>
            </div>
          </div>
        ) : (
          /* Normal Reporting Form */
          <div id="report-form-container" className="space-y-6">
            {/* 4 Quick Category Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { cat: 'Bullying' as IncidentCategory, label: 'Bullying / Intimidation', color: 'border-blue-200 hover:border-blue-400' },
                { cat: 'Physical Fighting' as IncidentCategory, label: 'Physical Fighting', color: 'border-rose-200 hover:border-rose-400' },
                { cat: 'Unsafe Location' as IncidentCategory, label: 'Unsafe Location / Hazard', color: 'border-amber-200 hover:border-amber-400' },
                { cat: 'Other Safety Concern' as IncidentCategory, label: 'Other Concern', color: 'border-purple-200 hover:border-purple-400' },
              ].map((item) => (
                <button
                  key={item.cat}
                  type="button"
                  onClick={() => handleSelectQuickCategory(item.cat)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    category === item.cat
                      ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                      : `bg-white ${item.color} text-slate-800 hover:shadow-xs`
                  }`}
                >
                  <p className="text-xs font-bold">{item.label}</p>
                </button>
              ))}
            </div>

            {/* Main Form Card */}
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-5">
              {/* Anonymous-only notice — this form no longer offers a
                  "Confidential" identified mode; every report is 100%
                  anonymous, so there's no name/grade/contact-method to
                  collect and nothing to choose between. */}
              <div className="p-3.5 rounded-xl border border-cyan-200 bg-cyan-50/70 flex items-center gap-2.5">
                <EyeOff size={16} className="text-cyan-700 shrink-0" />
                <p className="text-[11px] text-cyan-900 leading-snug">
                  <span className="font-bold">100% Anonymous.</span> No names, emails, IP addresses, or device IDs are ever requested or stored.
                </p>
              </div>

              {/* General School Location */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  General School Location <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  >
                    {schoolLocations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                  <MapPin size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
                </div>
                {errors.location && (
                  <p className="text-[11px] text-rose-600 mt-0.5">{errors.location}</p>
                )}
              </div>

              {/* Approximate Time */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Approximate Time
                </label>
                <input
                  type="text"
                  value={approximateTime}
                  onChange={(e) => setApproximateTime(e.target.value)}
                  placeholder="e.g. 10:15 AM / During 3rd period passing / Yesterday after school"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              {/* Incident Description */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  What happened? <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Please describe what you saw or experienced. Include details such as where, what was said or done, and if anyone is currently in distress..."
                  className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder-slate-400"
                />
                {errors.description && (
                  <p className="text-[11px] text-rose-600 mt-0.5 font-medium">{errors.description}</p>
                )}
              </div>

              {/* Optional Additional Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Optional Additional Information (Bystanders, repetitive pattern, etc.)
                </label>
                <input
                  type="text"
                  value={additionalDetails}
                  onChange={(e) => setAdditionalDetails(e.target.value)}
                  placeholder="e.g. Has happened multiple times at this same locker bay"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                {submitError && (
                  <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-sm shadow-md transition-colors disabled:opacity-60"
                >
                  <Send size={16} />
                  <span>{isSubmitting ? 'Submitting...' : 'Submit Safety Report'}</span>
                </button>
                <p className="text-[11px] text-center text-slate-400 mt-2">
                  Protected by SafeZone Client-Side Encryption Protocol.
                </p>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Emergency Help Confirmation Dialog — a dedicated modal rather than
          the shared ConfirmationModal, specifically so it can require the
          student to actively confirm WHERE they are before an emergency
          alert goes out (the generic modal only supports free-text input,
          and this field is too safety-critical to leave at a silent
          default). */}
      {showHelpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border-2 border-rose-300 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-rose-100 bg-rose-50">
              <div className="flex items-center gap-2.5">
                <LifeBuoy size={20} className="text-rose-600" />
                <h3 className="text-base font-bold text-rose-950">Confirm Emergency Request</h3>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                aria-label="Close dialog"
                className="p-1 rounded-md text-rose-400 hover:text-rose-700 hover:bg-rose-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                This sends a top-priority alert straight to on-duty safety staff with your location. No disciplinary action is taken — staff will come check on your welfare.
              </p>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-900">
                  Where are you right now? <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={emergencyLocation}
                    onChange={(e) => setEmergencyLocation(e.target.value)}
                    autoFocus
                    className="w-full text-sm px-3 py-2.5 rounded-lg border-2 border-rose-300 bg-rose-50/40 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    {schoolLocations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                  <MapPin size={14} className="absolute right-3 top-3.5 text-rose-400 pointer-events-none" />
                </div>
                <p className="text-[11px] text-slate-500">
                  Double-check this — staff are dispatched to the zone shown here.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-800 bg-white border border-slate-300 rounded-lg shadow-xs hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleEmergencyHelpRequest(emergencyLocation)}
                className="px-4 py-2 text-sm font-bold rounded-lg shadow-xs bg-rose-600 hover:bg-rose-700 text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500"
              >
                Send Urgent Help Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};