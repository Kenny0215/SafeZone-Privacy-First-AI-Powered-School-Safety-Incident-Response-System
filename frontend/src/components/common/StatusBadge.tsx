import React from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  UserCheck,
  Radio,
  Search,
  Sparkles,
} from 'lucide-react';
import { IncidentStatus } from '../../types/index.ts';

interface StatusBadgeProps {
  status: IncidentStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5 gap-1' : 'text-xs px-2.5 py-1 gap-1.5 font-medium';

  switch (status) {
    case 'New':
      return (
        <span className={`inline-flex items-center rounded-md bg-blue-50 text-blue-700 border border-blue-200 ${sizeClasses}`}>
          <Sparkles size={13} className="text-blue-500" />
          <span>New</span>
        </span>
      );
    case 'Under Review':
      return (
        <span className={`inline-flex items-center rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 ${sizeClasses}`}>
          <Clock size={13} className="text-indigo-500" />
          <span>Under Review</span>
        </span>
      );
    case 'Assigned':
      return (
        <span className={`inline-flex items-center rounded-md bg-purple-50 text-purple-700 border border-purple-200 ${sizeClasses}`}>
          <UserCheck size={13} className="text-purple-500" />
          <span>Assigned</span>
        </span>
      );
    case 'Responding':
      return (
        <span className={`inline-flex items-center rounded-md bg-amber-50 text-amber-800 border border-amber-300 font-semibold animate-pulse ${sizeClasses}`}>
          <Radio size={13} className="text-amber-600" />
          <span>Responding</span>
        </span>
      );
    case 'Under Investigation':
      return (
        <span className={`inline-flex items-center rounded-md bg-cyan-50 text-cyan-800 border border-cyan-200 ${sizeClasses}`}>
          <Search size={13} className="text-cyan-600" />
          <span>Under Investigation</span>
        </span>
      );
    case 'Resolved':
      return (
        <span className={`inline-flex items-center rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium ${sizeClasses}`}>
          <CheckCircle2 size={13} className="text-emerald-600" />
          <span>Resolved</span>
        </span>
      );
    case 'Dismissed':
      return (
        <span className={`inline-flex items-center rounded-md bg-slate-100 text-slate-600 border border-slate-200 ${sizeClasses}`}>
          <XCircle size={13} className="text-slate-400" />
          <span>Dismissed</span>
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center rounded-md bg-slate-50 text-slate-700 border border-slate-200 ${sizeClasses}`}>
          <span>{status}</span>
        </span>
      );
  }
};
