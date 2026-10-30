import React, { useEffect, useRef } from 'react';
import { X, AlertTriangle } from 'lucide-react';

export interface IncidentVideoModalProps {
  /** Heading, e.g. the zone name. */
  title: string;
  /** Small line under the heading, e.g. "Possible altercation • 13:22 • High". */
  subtitle?: string;
  /** Full URL of the incident video. Pass null when the zone has no incident video. */
  videoUrl: string | null;
  /** Optional evidence still (the cut frame) shown beside the video. */
  evidenceUrl?: string | null;
  onClose: () => void;
}

/**
 * Pop-up that plays an incident video. Closes on Esc, on the X button, or by clicking the dark backdrop.
 * Used by the Safety Map: double-click a zone, then render this with that zone's latest incident.
 */
export const IncidentVideoModal: React.FC<IncidentVideoModalProps> = ({
  title,
  subtitle,
  videoUrl,
  evidenceUrl,
  onClose,
}) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // stop the page scrolling behind the pop-up
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Incident video: ${title}`}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 truncate">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {videoUrl ? (
            <div className={evidenceUrl ? 'grid grid-cols-1 md:grid-cols-3 gap-4' : ''}>
              <video
                src={videoUrl}
                controls
                autoPlay
                muted
                playsInline
                className={`w-full aspect-video bg-black rounded-lg ${evidenceUrl ? 'md:col-span-2' : ''}`}
              />
              {evidenceUrl && (
                <figure className="space-y-1.5">
                  <img
                    src={evidenceUrl}
                    alt="Evidence frame cut from the incident video"
                    className="w-full rounded-lg border border-slate-200 bg-black object-contain"
                  />
                  <figcaption className="text-[11px] text-slate-500">Evidence frame (highest-confidence moment)</figcaption>
                </figure>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-12 text-slate-500">
              <AlertTriangle size={28} className="mb-2 text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">No incident video for this area</p>
              <p className="text-xs mt-1 max-w-sm leading-relaxed">
                Either nothing has been flagged here, or this is a private area where no video is recorded.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};