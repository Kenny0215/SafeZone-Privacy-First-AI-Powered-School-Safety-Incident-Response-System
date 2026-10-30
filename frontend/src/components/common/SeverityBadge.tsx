import React from 'react';
import { AlertTriangle, AlertCircle, ShieldCheck } from 'lucide-react';
import { IncidentSeverity } from '../../types/index.ts';

interface SeverityBadgeProps {
  severity: IncidentSeverity;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({
  severity,
  size = 'md',
  showIcon = true,
}) => {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
    lg: 'text-sm px-3 py-1.5 gap-2 font-semibold',
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16,
  };

  if (severity === 'High') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 ${sizeClasses[size]}`}
      >
        {showIcon && <AlertTriangle size={iconSizes[size]} className="shrink-0 text-rose-600" />}
        <span>High Priority</span>
      </span>
    );
  }

  if (severity === 'Medium') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 ${sizeClasses[size]}`}
      >
        {showIcon && <AlertCircle size={iconSizes[size]} className="shrink-0 text-amber-600" />}
        <span>Medium Priority</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 ${sizeClasses[size]}`}
    >
      {showIcon && <ShieldCheck size={iconSizes[size]} className="shrink-0 text-emerald-600" />}
      <span>Low Priority</span>
    </span>
  );
};
