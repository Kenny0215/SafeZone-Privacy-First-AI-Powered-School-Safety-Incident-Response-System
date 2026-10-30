import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  FilePlus2,
  ArrowRight,
} from 'lucide-react';
import { SeverityBadge } from '../components/common/SeverityBadge.tsx';
import { IncidentSeverity } from '../types/index.ts';
import {
  getDemoClips,
  createIncidentFromDemoClip,
  DemoIncidentResult,
  toAbsoluteMediaUrl,
  ApiError,
  AnalyzeResponse,
  DemoGalleryItem,
} from '../services/apiclient.ts';

type AnalysisState = 'no_clip' | 'completed';

// ---------------------------------------------------------------------------
// Model performance metrics (computed from the labeled demo clips)
// ---------------------------------------------------------------------------
type PipelineKey = 'baseline' | 'refined';

interface PipelineStats {
  tp: number; // fight clips flagged
  fn: number; // fight clips missed
  fp: number; // normal clips flagged (false alarms)
  tn: number; // normal clips left clear
  avgFps: number;
  meanConfFight: number | null;
  meanConfNormal: number | null;
  flickerPerClip: number | null; // null when the backend sends no per-frame scores
}

// Score above which one frame/window counts as "alert on" when counting flicker.
const FLICKER_THRESHOLD = 0.5;

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;

// Optional per-frame (or per-window) confidence list, e.g. [0.1, 0.2, 0.8, 0.7, ...].
// Add `timeline` to each pipeline result in generate_demo_gallery.py to enable the flicker metric.
const getTimeline = (pipeline: unknown): number[] | null => {
  const t = (pipeline as { timeline?: unknown } | null)?.timeline;
  return Array.isArray(t) && t.length > 1 && t.every((v) => typeof v === 'number') ? (t as number[]) : null;
};

// Number of times the alert switches on/off within one clip. 0 = perfectly stable.
const countSwitches = (timeline: number[], threshold: number): number => {
  let switches = 0;
  for (let i = 1; i < timeline.length; i += 1) {
    if ((timeline[i] >= threshold) !== (timeline[i - 1] >= threshold)) switches += 1;
  }
  return switches;
};

// The minimum a clip needs for the metrics. DemoGalleryItem and the clips in model_eval.json both fit.
interface ScoredResult {
  flagged: boolean;
  confidence: number;
  fps: number;
}
interface LabeledClip {
  source_filename: string;
  ground_truth: string; // 'Fight' | 'NonFight'
  baseline: ScoredResult;
  refined: ScoredResult;
}
interface ModelEvalFile {
  generated_at: string;
  dataset: string;
  split: string;
  seed: number;
  clips: LabeledClip[];
  failed?: unknown[];
}

// Written by backend/evaluate_pipelines.py into app/static/. Change this path if the backend
// serves app/static under a different URL (compare with a baseline.video_url value).
const MODEL_EVAL_PATH = '/static/model_eval.json';

// Supervisor request: the Video Analysis page shows only the final YOLO + MoViNet pipeline.
// Set to true to bring back the YOLO + ByteTrack baseline video and the comparison table
// (keep the comparison for your report; it needs the baseline results).
const SHOW_BASELINE = false;

const computeStats = (clips: LabeledClip[], key: PipelineKey): PipelineStats => {
  let tp = 0;
  let fn = 0;
  let fp = 0;
  let tn = 0;
  const fps: number[] = [];
  const confFight: number[] = [];
  const confNormal: number[] = [];
  const switches: number[] = [];
  clips.forEach((clip) => {
    const result = clip[key];
    const isFight = clip.ground_truth === 'Fight';
    if (isFight && result.flagged) tp += 1;
    else if (isFight) fn += 1;
    else if (result.flagged) fp += 1;
    else tn += 1;
    fps.push(result.fps);
    (isFight ? confFight : confNormal).push(result.confidence);
    const timeline = getTimeline(result);
    if (timeline) switches.push(countSwitches(timeline, FLICKER_THRESHOLD));
  });
  return {
    tp,
    fn,
    fp,
    tn,
    avgFps: mean(fps) ?? 0,
    meanConfFight: mean(confFight),
    meanConfNormal: mean(confNormal),
    // Only report flicker when EVERY clip has a timeline, so both pipelines are compared on the same clips.
    flickerPerClip: switches.length === clips.length ? mean(switches) : null,
  };
};

const fraction = (num: number, den: number): string =>
  den === 0 ? 'n/a' : `${num}/${den} (${Math.round((num / den) * 100)}%)`;

const confPair = (s: PipelineStats): string =>
  s.meanConfFight === null || s.meanConfNormal === null
    ? 'n/a'
    : `${s.meanConfFight.toFixed(2)} vs ${s.meanConfNormal.toFixed(2)}`;

// Maps the backend's lowercase severity to the frontend's display casing.
const mapSeverity = (s: 'low' | 'medium' | 'high'): IncidentSeverity =>
  s === 'high' ? 'High' : s === 'medium' ? 'Medium' : 'Low';

export const VideoAnalysisPage: React.FC = () => {
  const [state, setState] = useState<AnalysisState>('no_clip');
  const [activeResult, setActiveResult] = useState<AnalyzeResponse | null>(null);
  const [activeClipLabel, setActiveClipLabel] = useState<string>('');

  // --- Precomputed demo gallery — this IS the CCTV experience: pick a
  // camera/zone, see the real baseline vs refined result instantly, no
  // upload step. Real baseline (YOLO+ByteTrack) vs refined (YOLO+MoViNet)
  // results, computed ahead of time by generate_demo_gallery.py. ---
  const [demoClips, setDemoClips] = useState<DemoGalleryItem[]>([]);
  const [demoLoading, setDemoLoading] = useState<boolean>(true);
  const [demoLoadError, setDemoLoadError] = useState<string>('');
  const [activeDemoCategory, setActiveDemoCategory] = useState<'public' | 'semi_private'>('public');
  const [activeClipId, setActiveClipId] = useState<string | null>(null);

  // "Create incident" on a flagged feed: saves a real incident with the evidence image cut from the video.
  const navigate = useNavigate();
  const [creatingIncident, setCreatingIncident] = useState(false);
  const [createdIncident, setCreatedIncident] = useState<DemoIncidentResult | null>(null);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const clips = await getDemoClips();
        if (!cancelled) setDemoClips(clips);
      } catch (err) {
        if (!cancelled) {
          setDemoLoadError(
            err instanceof ApiError
              ? err.message
              : 'Could not reach the backend to load the camera feeds.'
          );
        }
      } finally {
        if (!cancelled) setDemoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fair evaluation set (random clips, see evaluate_pipelines.py). Missing file = fall back to the gallery.
  const [modelEval, setModelEval] = useState<ModelEvalFile | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(toAbsoluteMediaUrl(MODEL_EVAL_PATH));
        if (!res.ok) return;
        const data = (await res.json()) as ModelEvalFile;
        if (!cancelled && Array.isArray(data?.clips) && data.clips.length > 0) setModelEval(data);
      } catch {
        // No evaluation file yet: the panel uses the demo gallery and says so.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Model performance comparison. Both pipelines are always scored on exactly the same clips.
  const performanceSummary = useMemo(() => {
    const fair = modelEval !== null;
    const clips: LabeledClip[] = fair ? modelEval.clips : demoClips;
    if (clips.length === 0) return null;
    const fights = clips.filter((c) => c.ground_truth === 'Fight').length;
    return {
      baseline: computeStats(clips, 'baseline'),
      refined: computeStats(clips, 'refined'),
      n: clips.length,
      fights,
      normals: clips.length - fights,
      fair,
      sourceText: fair
        ? `${clips.length} random ${modelEval.dataset} ${modelEval.split} clips (seed ${modelEval.seed})`
        : `${clips.length} hand-picked demo clips`,
      failed: fair ? modelEval.failed?.length ?? 0 : 0,
    };
  }, [demoClips, modelEval]);

  const performanceRows = useMemo(() => {
    if (!performanceSummary) return [];
    const { baseline: b, refined: r, n } = performanceSummary;
    const flicker = (s: PipelineStats) =>
      s.flickerPerClip === null ? 'needs per-frame scores' : `${s.flickerPerClip.toFixed(1)} per clip`;
    return [
      {
        label: 'Clips classified correctly',
        hint: 'Accuracy. Higher is better.',
        baseline: fraction(b.tp + b.tn, n),
        refined: fraction(r.tp + r.tn, n),
      },
      {
        label: 'Fights caught',
        hint: 'Recall: fight clips that were flagged. Higher is better.',
        baseline: fraction(b.tp, b.tp + b.fn),
        refined: fraction(r.tp, r.tp + r.fn),
      },
      {
        label: 'False alarms',
        hint: 'Normal clips that were flagged. Lower is better.',
        baseline: fraction(b.fp, b.fp + b.tn),
        refined: fraction(r.fp, r.fp + r.tn),
      },
      {
        label: 'Average confidence: fights vs normal',
        hint: 'A bigger gap means the model separates the two more clearly.',
        baseline: confPair(b),
        refined: confPair(r),
      },
      {
        label: 'Alert flicker',
        hint: `Times the alert switches on/off within a clip (threshold ${FLICKER_THRESHOLD}). Lower is better.`,
        baseline: flicker(b),
        refined: flicker(r),
      },
      {
        label: 'Processing speed',
        hint: 'Frames per second, averaged over the clips. Higher is better.',
        baseline: `${b.avgFps.toFixed(1)} fps`,
        refined: `${r.avgFps.toFixed(1)} fps`,
      },
    ];
  }, [performanceSummary]);

  const handleCreateIncident = async () => {
    if (!activeClipId || creatingIncident || createdIncident) return;
    setCreatingIncident(true);
    setCreateError('');
    try {
      setCreatedIncident(await createIncidentFromDemoClip(activeClipId));
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Could not create the incident.');
    } finally {
      setCreatingIncident(false);
    }
  };

  const handleSelectDemoClip = (item: DemoGalleryItem) => {
    setCreatedIncident(null);
    setCreateError('');
    setActiveClipId(item.id);
    setActiveClipLabel(`${item.zone_name} — ${item.source_filename}`);
    setActiveResult({
      incident_id: `demo-${item.id}`,
      camera_location: item.zone_name,
      is_private_zone: false,
      baseline: item.baseline,
      refined: item.refined,
      overall_flagged: item.overall_flagged,
      severity: item.severity,
    });
    setState('completed');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-cyan-100 text-cyan-800">
                Permitted Vision Triage
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-2">
              <Video size={18} className="text-cyan-600" />
              <span>CCTV Video Intelligence & Rapid Incident Extraction</span>
            </h2>
          </div>
        </div>
      </div>

      {/* Main Grid: Camera Feed Selector vs Analysis Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Camera / Zone Feed Selector (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Sparkles size={14} className="text-cyan-600" />
                <span>Campus Camera Feeds</span>
              </h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <Clock size={11} />
                Instant
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
              {SHOW_BASELINE
                ? "Select a permitted CCTV zone to pull its latest footage through both detection pipelines — real baseline (YOLO+ByteTrack) vs refined (YOLO+MoViNet) results, precomputed so there's no model wait while you review."
                : "Select a permitted CCTV zone to pull its latest footage through the YOLO + MoViNet detection pipeline, precomputed so there's no model wait while you review."}
            </p>

            {/* Category tabs */}
            <div className="flex gap-1.5 mb-3 bg-slate-100 rounded-lg p-1">
              {([
                { key: 'public', label: 'Public Area' },
                { key: 'semi_private', label: 'Semi-Private Area' },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveDemoCategory(tab.key)}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors ${
                    activeDemoCategory === tab.key
                      ? 'bg-white text-cyan-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {demoLoading && (
              <div className="text-xs text-slate-500 py-4 text-center">Connecting to camera feeds…</div>
            )}

            {!demoLoading && demoLoadError && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
                {demoLoadError}
                {demoLoadError.toLowerCase().includes('not generated') && (
                  <>
                    {' '}Run <code className="font-mono bg-amber-100 px-1 rounded">python generate_demo_gallery.py</code> from the backend folder once, then refresh.
                  </>
                )}
              </div>
            )}

            {!demoLoading && !demoLoadError && (
              <div className="space-y-2">
                {demoClips
                  .filter((c) => c.category === activeDemoCategory)
                  .map((item) => {
                    const isSelected = activeClipId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectDemoClip(item)}
                        className={`w-full p-3 rounded-lg border text-left flex items-center gap-3 transition-all ${
                          isSelected
                            ? 'border-cyan-500 bg-cyan-50/60 ring-1 ring-cyan-400'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
                            item.overall_flagged ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                          }`}
                        >
                          {item.overall_flagged ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                        </div>
                        <div className="min-w-0 flex-1 text-xs">
                          <p className="font-semibold text-slate-800 truncate">{item.label}</p>
                          <p className="text-slate-400 truncate">{item.zone_name} • {item.source_filename}</p>
                        </div>
                        <SeverityBadge severity={mapSeverity(item.severity)} />
                      </button>
                    );
                  })}
                {demoClips.filter((c) => c.category === activeDemoCategory).length === 0 && (
                  <div className="text-xs text-slate-400 py-3 text-center">No camera feeds in this category yet.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Analysis Results (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Empty State */}
          {state === 'no_clip' && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs flex flex-col items-center justify-center min-h-[420px]">
              <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
                <Video size={32} />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-1">No Camera Feed Selected</h3>
              <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                {SHOW_BASELINE
                  ? 'Pick a permitted CCTV zone on the left to pull its footage through both detection pipelines.'
                  : 'Pick a permitted CCTV zone on the left to pull its footage through the detection pipeline.'}
              </p>
            </div>
          )}

          {/* Completed State — REAL baseline vs refined comparison for
              the selected camera feed */}
          {state === 'completed' && activeResult && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-0">
              <div className="bg-emerald-600 text-white px-5 py-3 flex items-center justify-between border-b border-emerald-700/30">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span className="text-xs font-black tracking-wider uppercase">
                    {SHOW_BASELINE ? 'Real AI Result • Baseline vs Refined Comparison' : 'Real AI Result • YOLO + MoViNet'}
                  </span>
                </div>
                <span className="text-[11px] font-medium opacity-90 hidden sm:inline">
                  {createdIncident ? 'Incident saved to the case register' : 'Precomputed camera feed — not saved until you create an incident'}
                </span>
              </div>

              <div className="p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`text-xs font-bold uppercase px-2.5 py-0.5 rounded-full ${
                          activeResult.overall_flagged ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {activeResult.overall_flagged ? 'Flagged' : 'No Violence Detected'}
                      </span>
                      <SeverityBadge severity={mapSeverity(activeResult.severity)} size="sm" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {activeResult.overall_flagged
                        ? 'Possible Physical Altercation Detected'
                        : 'Feed Reviewed — Normal Activity'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Camera: {activeClipLabel}</p>
                  </div>
                </div>

                {/* Pipeline result(s): the baseline is hidden unless SHOW_BASELINE is true */}
                <div className={`grid grid-cols-1 gap-4 ${SHOW_BASELINE ? 'md:grid-cols-2' : ''}`}>
                  {[
                    ...(SHOW_BASELINE
                      ? [{ label: 'Baseline: YOLO + ByteTrack', result: activeResult.baseline }]
                      : []),
                    { label: 'YOLO + MoViNet', result: activeResult.refined },
                  ].map(({ label, result }) => (
                    <div key={label} className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{label}</span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            result.flagged ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {result.flagged ? 'Flagged' : 'Clear'}
                        </span>
                      </div>
                      <video
                        src={toAbsoluteMediaUrl(result.video_url)}
                        controls
                        className="w-full aspect-video bg-black"
                      />
                      <div className="p-3 text-xs text-slate-600 space-y-1">
                        <p>
                          <span className="font-semibold text-slate-800">Confidence:</span>{' '}
                          {(result.confidence * 100).toFixed(0)}%
                          <span className="text-slate-400"> • {result.fps} fps</span>
                        </p>
                        <p className="text-slate-500 leading-relaxed">{result.notes}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Create incident: only for a feed the AI flagged. A person decides to open the case. */}
                {activeResult.overall_flagged && activeClipId && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                    {createdIncident ? (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        {createdIncident.snapshot_url && (
                          <img
                            src={toAbsoluteMediaUrl(createdIncident.snapshot_url)}
                            alt="Evidence image cut from the video"
                            className="w-full sm:w-56 rounded-lg border border-slate-200 bg-slate-900 object-contain"
                          />
                        )}
                        <div className="space-y-2">
                          <p className="text-sm font-bold text-emerald-800 flex items-center gap-1.5">
                            <CheckCircle2 size={15} />
                            <span>Incident {createdIncident.incident_id} created</span>
                          </p>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {createdIncident.snapshot_url
                              ? 'The evidence image above was cut from the video at the moment violence was detected, and is saved on the incident.'
                              : 'The incident was saved, but no evidence image could be made. Check the backend terminal.'}{' '}
                            Staff have been alerted.
                          </p>
                          <button
                            type="button"
                            onClick={() => navigate('/incidents')}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-xs"
                          >
                            <span>Open Incident Management</span>
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-xs text-slate-600 leading-relaxed max-w-md">
                          The AI flagged this feed. Creating an incident saves the case with an evidence image cut
                          from the video, and alerts staff. A person then reviews it.
                        </p>
                        <button
                          type="button"
                          onClick={handleCreateIncident}
                          disabled={creatingIncident}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-xs disabled:opacity-60 shrink-0"
                        >
                          <FilePlus2 size={14} />
                          <span>{creatingIncident ? 'Creating…' : 'Create incident from this feed'}</span>
                        </button>
                      </div>
                    )}
                    {createError && <p className="text-xs text-rose-700">{createError}</p>}
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveResult(null);
                      setActiveClipId(null);
                      setCreatedIncident(null);
                      setCreateError('');
                      setState('no_clip');
                    }}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium"
                  >
                    Clear Feed
                  </button>
                  <span className="text-[11px] text-slate-400 italic max-w-xs text-right">
                    {createdIncident
                      ? 'Saved as a real incident.'
                      : "Precomputed feeds aren't saved until you create an incident."}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Model Performance Comparison: from model_eval.json (random clips) when it exists,
          otherwise from the hand-picked demo gallery, with a warning. Same clips for both pipelines. */}
      {SHOW_BASELINE && performanceSummary && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={14} className="text-cyan-600" />
              <span>Model Performance Comparison</span>
            </h3>
            <span className="text-[10px] text-slate-400">
              {performanceSummary.sourceText} ({performanceSummary.fights} fight, {performanceSummary.normals} normal)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mb-4">
            Baseline (YOLO + ByteTrack) vs Refined (YOLO + MoViNet), both run on the same clips and checked
            against their known Fight / NonFight labels.
          </p>
          {!performanceSummary.fair && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 leading-relaxed">
              These are the demo gallery clips, hand-picked because they give a clean result, so this is not a fair
              comparison. Run <code className="font-mono bg-amber-100 px-1 rounded">python evaluate_pipelines.py</code>{' '}
              in the backend folder to measure both pipelines on random clips.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                  <th className="py-2 pr-3 font-semibold">Metric</th>
                  <th className="py-2 px-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Baseline
                    </span>
                  </th>
                  <th className="py-2 pl-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-600" />
                      Refined
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {performanceRows.map((row) => (
                  <tr key={row.label} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-slate-800">{row.label}</p>
                      <p className="text-[10px] text-slate-400 leading-snug">{row.hint}</p>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-700 whitespace-nowrap">{row.baseline}</td>
                    <td className="py-2.5 pl-3 font-semibold text-slate-700 whitespace-nowrap">{row.refined}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-slate-400 mt-4 pt-3 border-t border-slate-100 leading-relaxed">
            With {performanceSummary.n} clips, one clip changes accuracy by about{' '}
            {Math.round(100 / performanceSummary.n)} percentage points, so treat small differences as a tie.
            {performanceSummary.failed > 0 &&
              ` ${performanceSummary.failed} clip(s) could not be processed and are not counted.`}
          </p>
        </div>
      )}
    </div>
  );
};