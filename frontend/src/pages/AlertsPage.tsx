import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  MapPin,
  Clock,
  Filter,
} from 'lucide-react';
import { incidentService } from '../services/incidentService.ts';
import { AlertNotification } from '../types/index.ts';
import { formatSafeDate } from '../utils/incidentLogic.ts';
import { SeverityBadge } from '../components/common/SeverityBadge.tsx';
import { useToast } from '../components/common/Toast.tsx';

export const AlertsPage: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [alerts, setAlerts] = useState<AlertNotification[]>(() => incidentService.getAlerts());
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'high_priority' | 'acknowledged'>('all');

  useEffect(() => {
    const unsub = incidentService.subscribe(() => {
      setAlerts(incidentService.getAlerts());
    });
    return unsub;
  }, []);

  const filteredAlerts = useMemo(() => {
    switch (activeTab) {
      case 'unread':
        return alerts.filter((a) => !a.acknowledged || !a.read);
      case 'high_priority':
        return alerts.filter((a) => a.severity === 'High');
      case 'acknowledged':
        return alerts.filter((a) => a.acknowledged);
      case 'all':
      default:
        return alerts;
    }
  }, [alerts, activeTab]);

  const handleAcknowledge = (alertId: string) => {
    incidentService.acknowledgeAlert(alertId);
    addToast({
      type: 'success',
      title: 'Alert Acknowledged',
      message: `Alert marked as acknowledged by current user.`,
    });
  };

  const unreadCount = alerts.filter((a) => !a.acknowledged || !a.read).length;
  const highPriorityCount = alerts.filter((a) => a.severity === 'High').length;
  const acknowledgedCount = alerts.filter((a) => a.acknowledged).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Bell size={18} className="text-cyan-600" />
            <span>Alert & Dispatch Centre</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time queue of automated computer vision flags, sensor alarms, and student reports
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1 text-xs font-semibold text-slate-600">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-2 border-b-2 transition-all ${
            activeTab === 'all'
              ? 'border-cyan-600 text-cyan-700 font-bold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          All Alerts ({alerts.length})
        </button>
        <button
          onClick={() => setActiveTab('unread')}
          className={`px-3 py-2 border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'unread'
              ? 'border-cyan-600 text-cyan-700 font-bold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <span>Unacknowledged</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px]">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('high_priority')}
          className={`px-3 py-2 border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'high_priority'
              ? 'border-cyan-600 text-cyan-700 font-bold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <span>High Priority</span>
          {highPriorityCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px]">
              {highPriorityCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('acknowledged')}
          className={`px-3 py-2 border-b-2 transition-all ${
            activeTab === 'acknowledged'
              ? 'border-cyan-600 text-cyan-700 font-bold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          Acknowledged ({acknowledgedCount})
        </button>
      </div>

      {/* Alert List */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-400 text-xs">
            No alerts match this filter.
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-5 rounded-xl border bg-white shadow-xs transition-all ${
                !alert.acknowledged
                  ? 'border-amber-300 ring-1 ring-amber-100 bg-amber-50/20'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900">
                      {alert.id}
                    </span>
                    <SeverityBadge severity={alert.severity} size="sm" />
                    {!alert.acknowledged ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                        Pending Acknowledgement
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 flex items-center gap-1">
                        <Check size={11} />
                        <span>Acknowledged by {alert.acknowledgedBy}</span>
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-slate-900">{alert.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                    {alert.message}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                    <span className="flex items-center gap-1 text-slate-600">
                      <MapPin size={13} className="text-slate-400" />
                      <span>{alert.location}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock size={13} />
                      <span>{formatSafeDate(alert.createdAt)}</span>
                    </span>
                    <span>•</span>
                    <span>Linked Case: <strong className="text-slate-700">{alert.incidentId}</strong></span>
                  </div>
                </div>

                {/* Right Action buttons */}
                <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 shrink-0">
                  {!alert.acknowledged && (
                    <button
                      type="button"
                      onClick={() => handleAcknowledge(alert.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-xs"
                    >
                      <Check size={13} />
                      <span>Acknowledge Alert</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => navigate(`/incidents/${alert.incidentId}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-cyan-700 font-semibold text-xs transition-colors"
                  >
                    <span>Open Case</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};