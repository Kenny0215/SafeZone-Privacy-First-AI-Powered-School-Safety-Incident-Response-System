import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  Activity,
  LifeBuoy,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Info,
  X,
  ExternalLink,
  Lock,
  Layers,
  EyeOff,
  Video,
} from 'lucide-react';
import { incidentService } from '../services/incidentService.ts';
import { SchoolZone, Incident } from '../types/index.ts';
import { SeverityBadge } from '../components/common/SeverityBadge.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import { IncidentVideoModal } from '../components/common/IncidentVideoModal.tsx';
import { getDemoClips, toAbsoluteMediaUrl, DemoGalleryItem } from '../services/apiclient.ts';

// ---------------------------------------------------------------------------
// Zone -> incident video lookup (used by the double-click pop-up)
// ---------------------------------------------------------------------------
const incidentsForZone = (zone: SchoolZone, all: Incident[]): Incident[] =>
  all.filter((i) => i.zoneId === zone.id || i.location.toLowerCase().includes(zone.name.toLowerCase()));

const sameZoneName = (a: string, b: string): boolean => {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
};

interface ZoneVideo {
  videoUrl: string | null;
  evidenceUrl: string | null;
  subtitle: string;
}

/**
 * 1) A real incident in this zone that has a saved video (and is not restricted) wins.
 * 2) Otherwise the zone's flagged clip from the precomputed demo gallery is used, labelled as sample footage.
 * 3) Private zones NEVER get a video, whatever the data says.
 */
const resolveZoneVideo = (zone: SchoolZone, zoneIncs: Incident[], clips: DemoGalleryItem[]): ZoneVideo => {
  if (zone.privacyLevel === 'Strictly Private (No Video)' || !zone.cctvPermitted) {
    return { videoUrl: null, evidenceUrl: null, subtitle: 'Private area: no video is recorded here' };
  }

  const withVideo = zoneIncs
    .filter(
      (i) =>
        i.evidenceSummary?.hasMedia &&
        i.evidenceSummary.mediaType === 'video' &&
        !i.evidenceSummary.isRestricted &&
        i.evidenceSummary.mediaUrl
    )
    .sort((a, b) => (Date.parse(b.reportedAt) || 0) - (Date.parse(a.reportedAt) || 0));
  if (withVideo.length > 0) {
    const inc = withVideo[0];
    return {
      videoUrl: toAbsoluteMediaUrl(inc.evidenceSummary!.mediaUrl!),
      evidenceUrl: inc.evidenceSummary!.snapshotUrl ? toAbsoluteMediaUrl(inc.evidenceSummary!.snapshotUrl) : null,
      subtitle: `${inc.id} • ${inc.title} • ${inc.severity}`,
    };
  }

  const clip = clips.find((c) => c.overall_flagged && sameZoneName(c.zone_name, zone.name));
  if (clip) {
    return {
      videoUrl: toAbsoluteMediaUrl(clip.refined.video_url),
      evidenceUrl: null,
      subtitle: `Sample footage (YOLO + MoViNet) • ${clip.source_filename}`,
    };
  }
  return { videoUrl: null, evidenceUrl: null, subtitle: 'No flagged footage for this area' };
};

export const SafetyMapPage: React.FC = () => {
  const navigate = useNavigate();
  const [zones, setZones] = useState<SchoolZone[]>(() => incidentService.getZones());
  const [incidents, setIncidents] = useState<Incident[]>(() => incidentService.getIncidents());
  const [selectedZoneId, setSelectedZoneId] = useState<string>('zone-main-corridor');
  const [filterLayer, setFilterLayer] = useState<'all' | 'cctv' | 'non-visual' | 'incidents'>('all');

  useEffect(() => {
    const unsub = incidentService.subscribe(() => {
      setZones(incidentService.getZones());
      setIncidents(incidentService.getIncidents());
    });
    return unsub;
  }, []);

  // Incident-video pop-up (opened by double-clicking a zone)
  const [videoZoneId, setVideoZoneId] = useState<string | null>(null);
  const [galleryClips, setGalleryClips] = useState<DemoGalleryItem[]>([]);
  const galleryRequested = useRef(false);

  const openZoneVideo = (zone: SchoolZone) => {
    setSelectedZoneId(zone.id);
    setVideoZoneId(zone.id);
    // Load the demo gallery once, the first time a non-private zone is opened.
    if (!galleryRequested.current && zone.privacyLevel !== 'Strictly Private (No Video)') {
      galleryRequested.current = true;
      getDemoClips()
        .then(setGalleryClips)
        .catch(() => {
          galleryRequested.current = false; // allow a retry on the next double-click
        });
    }
  };

  const selectedZone = zones.find((z) => z.id === selectedZoneId) || zones[0];
  const zoneIncidents = incidentsForZone(selectedZone, incidents);

  const videoZone = videoZoneId ? zones.find((z) => z.id === videoZoneId) ?? null : null;
  const videoInfo = videoZone ? resolveZoneVideo(videoZone, incidentsForZone(videoZone, incidents), galleryClips) : null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Layers size={18} className="text-cyan-600" />
            <span>Interactive Campus Safety & Sensor Floor Plan</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Oakwood Senior High • Building A & Quad • Illustrative Spatial Topology
          </p>
        </div>

        {/* Filter Layers */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-medium text-slate-600">
          <button
            onClick={() => setFilterLayer('all')}
            className={`px-3 py-1 rounded-md transition-colors ${
              filterLayer === 'all' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'hover:text-slate-900'
            }`}
          >
            All Zones
          </button>
          <button
            onClick={() => setFilterLayer('cctv')}
            className={`px-3 py-1 rounded-md transition-colors ${
              filterLayer === 'cctv' ? 'bg-white text-cyan-800 shadow-xs font-semibold' : 'hover:text-slate-900'
            }`}
          >
            CCTV Monitored
          </button>
          <button
            onClick={() => setFilterLayer('non-visual')}
            className={`px-3 py-1 rounded-md transition-colors ${
              filterLayer === 'non-visual' ? 'bg-white text-purple-800 shadow-xs font-semibold' : 'hover:text-slate-900'
            }`}
          >
            Private Zones (Non-Visual)
          </button>
          <button
            onClick={() => setFilterLayer('incidents')}
            className={`px-3 py-1 rounded-md transition-colors ${
              filterLayer === 'incidents' ? 'bg-white text-rose-800 shadow-xs font-semibold' : 'hover:text-slate-900'
            }`}
          >
            Active Incidents
          </button>
        </div>
      </div>

      {/* Main Grid: Interactive Floor Plan + Side Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Floor Plan Canvas */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Level 1 Floor Plan Architecture
            </span>
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              All 8 edge sensors operational
            </span>
          </div>

          {/* Interactive SVG Floor Map */}
          <div className="relative w-full aspect-[16/10] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 select-none shadow-inner">
            {/* Grid Pattern Background */}
            <div
              className="absolute inset-0 opacity-15"
              style={{
                backgroundImage: `radial-gradient(#38bdf8 1px, transparent 1px)`,
                backgroundSize: '24px 24px',
              }}
            />

            {/* School Campus Outer Perimeter Walls */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              <rect x="2" y="2" width="96" height="96" fill="none" stroke="#334155" strokeWidth="0.8" strokeDasharray="2 2" />
              {/* Hallway divider lines */}
              <line x1="50" y1="5" x2="50" y2="95" stroke="#1e293b" strokeWidth="0.5" />
              <line x1="5" y1="50" x2="95" y2="50" stroke="#1e293b" strokeWidth="0.5" />
            </svg>

            {/* Render School Zones as interactive blocks */}
            {zones.map((zone) => {
              const isSelected = selectedZoneId === zone.id;
              const isPrivate = zone.privacyLevel === 'Strictly Private (No Video)';
              const hasIncidents = zone.incidentCount > 0;

              // Opacity based on filter layer
              let isDimmed = false;
              if (filterLayer === 'cctv' && !zone.cctvPermitted) isDimmed = true;
              if (filterLayer === 'non-visual' && !isPrivate) isDimmed = true;
              if (filterLayer === 'incidents' && !hasIncidents) isDimmed = true;

              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => setSelectedZoneId(zone.id)}
                  onDoubleClick={() => openZoneVideo(zone)}
                  style={{
                    left: `${zone.coordinates.x}%`,
                    top: `${zone.coordinates.y}%`,
                    width: `${zone.coordinates.width}%`,
                    height: `${zone.coordinates.height}%`,
                  }}
                  className={`absolute rounded-lg p-2 flex flex-col justify-between transition-all duration-150 text-left cursor-pointer border ${
                    isSelected
                      ? 'ring-2 ring-cyan-400 z-20 shadow-lg scale-[1.02]'
                      : 'hover:border-slate-400 hover:z-10'
                  } ${
                    isPrivate
                      ? isSelected
                        ? 'bg-purple-950/80 border-purple-400 text-purple-100'
                        : 'bg-purple-950/40 border-purple-800/80 text-purple-200'
                      : isSelected
                      ? 'bg-slate-800/90 border-cyan-400 text-cyan-200'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300'
                  } ${isDimmed ? 'opacity-25' : 'opacity-100'}`}
                >
                  {/* Top Bar inside zone */}
                  <div className="flex items-start justify-between w-full">
                    <span className="text-[11px] font-bold tracking-tight truncate pr-1">
                      {zone.name}
                    </span>

                    {/* Zone device badge */}
                    <div className="shrink-0 flex items-center gap-1">
                      {isPrivate ? (
                        <div
                          title="Private Space: Acoustic threshold sensor only (No CCTV)"
                          className="h-5 w-5 rounded bg-purple-900/80 text-purple-300 flex items-center justify-center border border-purple-700"
                        >
                          <EyeOff size={11} />
                        </div>
                      ) : zone.marker.type === 'camera' ? (
                        <div
                          title="Permitted Optical CCTV Camera"
                          className="h-5 w-5 rounded bg-cyan-950 text-cyan-400 flex items-center justify-center border border-cyan-800"
                        >
                          <Camera size={11} />
                        </div>
                      ) : (
                        <div
                          title="Interactive Student Help Station"
                          className="h-5 w-5 rounded bg-amber-950 text-amber-400 flex items-center justify-center border border-amber-800"
                        >
                          <LifeBuoy size={11} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom Bar: Privacy pill + incident count */}
                  <div className="flex items-center justify-between w-full mt-auto pt-1">
                    <span
                      className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                        isPrivate
                          ? 'bg-purple-900/80 text-purple-300'
                          : 'bg-slate-900/80 text-cyan-400'
                      }`}
                    >
                      {isPrivate ? 'PRIVATE (NO CCTV)' : 'OPTICAL OK'}
                    </span>

                    {hasIncidents && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-600/90 text-white text-[9px] font-bold animate-pulse">
                        <AlertTriangle size={9} />
                        <span>{zone.incidentCount}</span>
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-[11px] text-slate-400">
            Tip: double-click a zone on the map to watch its incident video.
          </p>

          {/* Map Legend */}
          <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-slate-800 text-cyan-400 flex items-center justify-center border border-slate-700 shrink-0">
                <Camera size={13} />
              </div>
              <span className="text-slate-600">CCTV Camera (Permitted Public Area)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-purple-950 text-purple-300 flex items-center justify-center border border-purple-800 shrink-0">
                <EyeOff size={13} />
              </div>
              <span className="text-slate-600">Non-Visual Sensor (Zero Video)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-amber-950 text-amber-400 flex items-center justify-center border border-amber-800 shrink-0">
                <LifeBuoy size={13} />
              </div>
              <span className="text-slate-600">Student Help Station</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-rose-600 text-white flex items-center justify-center shrink-0">
                <AlertTriangle size={13} />
              </div>
              <span className="text-slate-600">Active Incident Event</span>
            </div>
          </div>
        </div>

        {/* Selected Zone Side Panel */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex items-start justify-between pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    selectedZone.privacyLevel === 'Strictly Private (No Video)'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-cyan-100 text-cyan-800'
                  }`}
                >
                  {selectedZone.category}
                </span>
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                  <ShieldCheck size={13} />
                  <span>{selectedZone.deviceStatus}</span>
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">{selectedZone.name}</h3>
            </div>
          </div>

          {/* Privacy Constitution Guarantee Callout */}
          {selectedZone.privacyLevel === 'Strictly Private (No Video)' ? (
            <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-xs text-purple-800">
                <Lock size={14} className="text-purple-700" />
                <span>Strict Private-Area Protocol</span>
              </div>
              <p className="text-xs leading-relaxed text-purple-800">
                Cameras are legally and constitutionally barred from this zone. Safety monitoring operates strictly via non-visual telemetry (acoustic threshold dB alarms and anonymous student portal reports).
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-900 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-xs text-cyan-800">
                <Camera size={14} className="text-cyan-700" />
                <span>Permitted Public Surveillance Zone</span>
              </div>
              <p className="text-xs leading-relaxed text-cyan-800">
                Approved high-throughput public corridor. Optical vision streams run AI crowd and kinetic triage with strict 14-day rolling auto-purge.
              </p>
            </div>
          )}

          {/* Device & Hardware Specifications */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Device Type</span>
              <span className="font-semibold text-slate-800">{selectedZone.deviceType}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">CCTV Permitted?</span>
              <span
                className={`font-bold ${
                  selectedZone.cctvPermitted ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {selectedZone.cctvPermitted ? 'Yes (Public Zone)' : 'Strictly Prohibited'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Active Incidents</span>
              <span className="font-bold text-slate-900">{zoneIncidents.length}</span>
            </div>
            <div className="pt-2">
              <span className="text-slate-500 block mb-1">Coverage Topology</span>
              <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                {selectedZone.coverageDescription}
              </p>
            </div>
          </div>

          {/* Same as double-clicking the zone, for keyboards and touch screens */}
          {selectedZone.privacyLevel !== 'Strictly Private (No Video)' && (
            <button
              type="button"
              onClick={() => openZoneVideo(selectedZone)}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold transition-colors"
            >
              <Video size={14} />
              <span>Watch incident video</span>
            </button>
          )}

          {/* Associated Incidents List */}
          <div className="pt-3 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5">
              Associated Incident Reports ({zoneIncidents.length})
            </h4>

            {zoneIncidents.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-50 text-center text-xs text-slate-400">
                No active or historical incidents recorded in this zone.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {zoneIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    onClick={() => navigate(`/incidents/${inc.id}`)}
                    className="p-3 rounded-lg border border-slate-200 hover:border-cyan-400 hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-xs font-bold text-slate-900">{inc.id}</span>
                      <SeverityBadge severity={inc.severity} size="sm" />
                    </div>
                    <p className="text-xs font-medium text-slate-800 line-clamp-1">{inc.title}</p>
                    <div className="flex items-center justify-between mt-2 pt-1 text-[11px] text-slate-500">
                      <StatusBadge status={inc.status} size="sm" />
                      <span className="text-cyan-700 font-semibold inline-flex items-center gap-1">
                        <span>Details</span>
                        <ExternalLink size={11} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {videoZone && videoInfo && (
        <IncidentVideoModal
          title={videoZone.name}
          subtitle={videoInfo.subtitle}
          videoUrl={videoInfo.videoUrl}
          evidenceUrl={videoInfo.evidenceUrl}
          onClose={() => setVideoZoneId(null)}
        />
      )}
    </div>
  );
};