import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: number | string;
  subtext?: string;
  icon: LucideIcon;
  variant?: 'default' | 'urgent' | 'warning' | 'success';
  trend?: {
    value: string;
    isUpward: boolean;
  };
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  icon: Icon,
  variant = 'default',
  trend,
  onClick,
}) => {
  const variantStyles = {
    default: {
      bg: 'bg-white',
      border: 'border-slate-200/80',
      iconBg: 'bg-cyan-50 text-cyan-700 border-cyan-100',
      valueColor: 'text-slate-900',
    },
    urgent: {
      bg: 'bg-white',
      border: 'border-rose-200',
      iconBg: 'bg-rose-50 text-rose-700 border-rose-100',
      valueColor: 'text-rose-700',
    },
    warning: {
      bg: 'bg-white',
      border: 'border-amber-200',
      iconBg: 'bg-amber-50 text-amber-700 border-amber-100',
      valueColor: 'text-amber-800',
    },
    success: {
      bg: 'bg-white',
      border: 'border-emerald-200',
      iconBg: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      valueColor: 'text-emerald-700',
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      onClick={onClick}
      className={`${style.bg} ${style.border} border rounded-xl p-5 shadow-xs transition-all duration-150 ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-slate-300' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
            {label}
          </p>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold tracking-tight ${style.valueColor}`}>
              {value}
            </span>
            {trend && (
              <span
                className={`text-xs font-medium ${
                  trend.isUpward ? 'text-rose-600' : 'text-emerald-600'
                }`}
              >
                {trend.value}
              </span>
            )}
          </div>
          {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
        </div>
        <div className={`p-2.5 rounded-lg border ${style.iconBg} shrink-0`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
};
