import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  CheckCircle2,
  FileText,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';
import { incidentService } from '../services/incidentService.ts';
import { Incident } from '../types/index.ts';
import { computeDashboardStats } from '../utils/incidentLogic.ts';
import { StatCard } from '../components/common/StatCard.tsx';

export const OverviewPage: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>(() => incidentService.getIncidents());

  useEffect(() => {
    const unsub = incidentService.subscribe(() => {
      setIncidents(incidentService.getIncidents());
    });
    return unsub;
  }, []);

  const stats = useMemo(() => computeDashboardStats(incidents), [incidents]);

  // Real 7-day trend — grouped from each incident's actual reportedAt
  // date, not seeded/sample numbers. "Today" anchors the last column so
  // the chart always reflects the current 7-day window as incidents
  // come in.
  const trendData = useMemo(() => {
    const formatDayLabel = (d: Date) => {
      const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${weekday} (${month}/${day})`;
    };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const days: { day: string; total: number; highPriority: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(todayStart);
      dayStart.setDate(todayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayStart.getDate() + 1);

      const dayIncidents = incidents.filter((inc) => {
        const reported = new Date(inc.reportedAt);
        return reported >= dayStart && reported < dayEnd;
      });

      days.push({
        day: formatDayLabel(dayStart),
        total: dayIncidents.length,
        highPriority: dayIncidents.filter((inc) => inc.severity === 'High').length,
      });
    }

    return days;
  }, [incidents]);

  const categoryPieData = useMemo(() => {
    return Object.entries(stats.categoryCounts)
      .filter(([_, count]) => count > 0)
      .map(([name, value]) => ({ name, value }));
  }, [stats.categoryCounts]);

  const zoneBarData = useMemo(() => {
    return Object.entries(stats.zoneCounts)
      .map(([zone, count]) => ({ zone: zone.replace(' Entrance', ''), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [stats.zoneCounts]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Privacy-First Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-950 p-6 md:p-8 text-white shadow-lg border border-slate-700/60">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-semibold mb-3 border border-cyan-500/30">
            <Sparkles size={13} />
            <span>AI for Safer Schools • Live Prototype</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white mb-2">
            SafeZone Intelligent Operations & Incident Triage
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed mb-5">
            A privacy-first safety ecosystem combining computer vision in permitted public corridors, non-visual acoustic safeguards in private spaces, and secure student reporting with zero invasive surveillance.
          </p>
        </div>

        {/* Abstract subtle badge background decoration */}
        <div className="absolute -right-8 -bottom-10 opacity-10 pointer-events-none text-white">
          <ShieldAlert size={280} />
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Incidents"
          value={stats.total}
          subtext="Logged across all school zones"
          icon={FileText}
          variant="default"
        />
        <StatCard
          label="High-Priority Incidents"
          value={stats.highPriority}
          subtext="Require urgent staff action"
          icon={AlertTriangle}
          variant="urgent"
          trend={{ value: 'Active triage', isUpward: true }}
        />
        <StatCard
          label="Awaiting Review"
          value={stats.awaitingReview}
          subtext="New & triage in progress"
          icon={Clock}
          variant="warning"
        />
        <StatCard
          label="Resolved Cases"
          value={stats.resolved}
          subtext="Closed with written resolution"
          icon={CheckCircle2}
          variant="success"
          trend={{ value: `${Math.round((stats.resolved / (stats.total || 1)) * 100)}% resolved`, isUpward: false }}
        />
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 7-Day Trend Line Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp size={16} className="text-cyan-600" />
                <span>Incident Trend (Last 7 Days)</span>
              </h3>
              <p className="text-xs text-slate-500">Total volume vs. high-severity events</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-600"></span>
                <span className="text-slate-600">Total</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
                <span className="text-slate-600">High Priority</span>
              </div>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="total" stroke="#0891b2" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="highPriority" stroke="#f43f5e" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Most Active School Zones — moved beside Incident Trend */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Most Active School Zones</h3>
          <p className="text-xs text-slate-500 mb-4">Incident counts by location</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zoneBarData} layout="vertical" margin={{ top: 5, right: 20, left: 25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis dataKey="zone" type="category" tick={{ fontSize: 11, fill: '#334155' }} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Bar dataKey="count" fill="#0891b2" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};