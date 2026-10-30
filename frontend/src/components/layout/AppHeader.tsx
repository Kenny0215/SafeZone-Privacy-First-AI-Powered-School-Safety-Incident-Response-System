import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Menu,
  Bell,
  ChevronDown,
  Shield,
  LogOut,
} from 'lucide-react';
import { NotificationDropdown } from './NotificationDropdown.tsx';
import { AlertNotification, UserProfile } from '../../types/index.ts';

interface AppHeaderProps {
  onToggleSidebar: () => void;
  alerts: AlertNotification[];
  onAcknowledgeAlert: (id: string) => void;
  currentUser: UserProfile;
  onLogout: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onToggleSidebar,
  alerts,
  onAcknowledgeAlert,
  currentUser,
  onLogout,
}) => {
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadAlerts = alerts.filter((a) => !a.read || !a.acknowledged);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute title from route
  const getPageInfo = () => {
    const path = location.pathname;
    if (path === '/') return { title: 'Incident Overview Dashboard', breadcrumb: 'Operations / Overview' };
    if (path.startsWith('/map')) return { title: 'Interactive Safety Map', breadcrumb: 'Facilities / Safety Map' };
    if (path.startsWith('/video-analysis')) return { title: 'CCTV Video AI Analysis', breadcrumb: 'Permitted Vision / Video Analysis' };
    if (path.startsWith('/incidents/')) return { title: 'Incident Case Details', breadcrumb: 'Triage / Incidents / Details' };
    if (path.startsWith('/incidents')) return { title: 'Incident Case Management', breadcrumb: 'Triage / Incidents' };
    if (path.startsWith('/alerts')) return { title: 'Alerts & Staff Notifications', breadcrumb: 'Communications / Alerts' };
    if (path.startsWith('/student-report')) return { title: 'Student Incident Portal', breadcrumb: 'Public / Student Reporting' };
    return { title: 'SafeZone Dashboard', breadcrumb: 'Operations' };
  };

  const { title, breadcrumb } = getPageInfo();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-6 bg-white border-b border-slate-200 shadow-xs">
      {/* Left: Mobile hamburger + Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle navigation drawer"
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 lg:hidden"
        >
          <Menu size={20} />
        </button>

        <div>
          <h1 className="text-base md:text-lg font-bold text-slate-900 tracking-tight leading-tight">
            {title}
          </h1>
          <p className="text-[11px] text-slate-500 hidden sm:block leading-none mt-0.5">
            {breadcrumb}
          </p>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Notification Bell Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label={`Open notifications, ${unreadAlerts.length} unread alerts`}
            className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <Bell size={19} />
            {unreadAlerts.length > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-xs">
                {unreadAlerts.length}
              </span>
            )}
          </button>

          {showNotifications && (
            <NotificationDropdown
              alerts={alerts}
              onAcknowledge={onAcknowledgeAlert}
              onClose={() => setShowNotifications(false)}
            />
          )}
        </div>

        {/* User Avatar & Role */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="h-8 w-8 rounded-full bg-cyan-700 text-white flex items-center justify-center text-xs font-bold shadow-xs">
            {currentUser.avatarInitials}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold text-slate-900 leading-tight">
              {currentUser.name}
            </p>
            <p className="text-[11px] text-slate-500 leading-none">
              {currentUser.role}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            title="Log out"
            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};