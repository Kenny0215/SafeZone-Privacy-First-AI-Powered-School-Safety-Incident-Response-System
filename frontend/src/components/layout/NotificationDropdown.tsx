import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, ArrowRight, ShieldAlert } from 'lucide-react';
import { AlertNotification } from '../../types/index.ts';
import { formatSafeDate } from '../../utils/incidentLogic.ts';

interface NotificationDropdownProps {
  alerts: AlertNotification[];
  onAcknowledge: (id: string) => void;
  onClose: () => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  alerts,
  onAcknowledge,
  onClose,
}) => {
  const navigate = useNavigate();
  const recentAlerts = alerts.slice(0, 5);
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div
      className="absolute right-0 top-full mt-2 w-84 md:w-96 rounded-xl bg-white shadow-2xl border border-slate-200 z-50 overflow-hidden"
      role="menu"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-cyan-700" />
          <span className="text-sm font-semibold text-slate-900">Incident Alerts</span>
        </div>
        <span className="text-xs font-medium text-slate-500">
          {unacknowledgedCount} unacknowledged
        </span>
      </div>

      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
        {recentAlerts.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            No recent alerts
          </div>
        ) : (
          recentAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3.5 hover:bg-slate-50/80 transition-colors ${
                !alert.acknowledged ? 'bg-amber-50/30' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span
                  className={`text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded-sm ${
                    alert.severity === 'High'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {alert.severity}
                </span>
                <span className="text-[11px] text-slate-400">
                  {formatSafeDate(alert.createdAt)}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-800 mb-0.5 line-clamp-1">
                {alert.title}
              </p>
              <p className="text-xs text-slate-500 line-clamp-2 mb-2 leading-relaxed">
                {alert.message}
              </p>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(`/incidents/${alert.incidentId}`);
                  }}
                  className="inline-flex items-center gap-1 text-cyan-600 hover:text-cyan-800 font-medium"
                >
                  <span>Open Case</span>
                  <ArrowRight size={12} />
                </button>
                {!alert.acknowledged ? (
                  <button
                    type="button"
                    onClick={() => onAcknowledge(alert.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 font-medium"
                  >
                    <Check size={12} />
                    <span>Acknowledge</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                    <Check size={12} />
                    <span>Acknowledged</span>
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate('/alerts');
          }}
          className="text-xs font-semibold text-cyan-700 hover:text-cyan-900"
        >
          View All Alerts in Alert Centre →
        </button>
      </div>
    </div>
  );
};
