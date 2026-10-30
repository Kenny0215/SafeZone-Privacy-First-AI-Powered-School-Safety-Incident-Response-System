import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  MapPin,
  Video,
  ShieldAlert,
  FolderOpenDot,
  Bell,
  Lock,
  Shield,
  X,
} from 'lucide-react';

interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  unreadAlertCount: number;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  isOpen,
  onClose,
  unreadAlertCount,
}) => {
  const location = useLocation();

  const navItems = [
    { name: 'Overview', path: '/', icon: LayoutDashboard },
    { name: 'Safety Map', path: '/map', icon: MapPin },
    { name: 'Video Analysis', path: '/video-analysis', icon: Video },
    { name: 'Incident Management', path: '/incidents', icon: FolderOpenDot },
    {
      name: 'Alerts & Notifications',
      path: '/alerts',
      icon: Bell,
      badge: unreadAlertCount > 0 ? unreadAlertCount : undefined,
    },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-slate-900 border-r border-slate-800 text-slate-300 transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-cyan-600 flex items-center justify-center text-white shadow-md shadow-cyan-900/40">
              <Shield size={20} className="stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base text-white tracking-tight">SafeZone</span>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-sm bg-cyan-950 text-cyan-400 border border-cyan-800/50">
                  Core
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium leading-none">Privacy-First AI Response</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close sidebar navigation"
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Operations & Triage
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => onClose()}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-cyan-950/70 text-cyan-300 border-l-4 border-cyan-400 shadow-xs pl-2.5 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    size={18}
                    className={`shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`}
                  />
                  <span className="truncate">{item.name}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="ml-auto px-1.5 py-0.5 text-xs font-bold rounded-full bg-rose-600 text-white animate-pulse">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </aside>
    </>
  );
};