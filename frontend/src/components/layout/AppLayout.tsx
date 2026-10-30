import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { AppSidebar } from './AppSidebar.tsx';
import { AppHeader } from './AppHeader.tsx';
import { incidentService } from '../../services/incidentService.ts';
import { authService } from '../../services/authService.ts';
import { AlertNotification } from '../../types/index.ts';
import { CURRENT_USER } from '../../data/seedData.ts';

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertNotification[]>(() => incidentService.getAlerts());

  // ProtectedRoute guarantees a session exists by the time this renders,
  // but fall back to the seed identity defensively rather than crash.
  const currentUser = authService.getCurrentUser() ?? CURRENT_USER;

  const handleLogout = () => {
    authService.logout();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    const unsubscribe = incidentService.subscribe(() => {
      setAlerts(incidentService.getAlerts());
    });
    return unsubscribe;
  }, []);

  const handleAcknowledgeAlert = (id: string) => {
    incidentService.acknowledgeAlert(id);
  };

  const unreadAlertCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden antialiased text-slate-900">
      {/* Sidebar */}
      <AppSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        unreadAlertCount={unreadAlertCount}
      />

      {/* Main Column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <AppHeader
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          alerts={alerts}
          onAcknowledgeAlert={handleAcknowledgeAlert}
          currentUser={currentUser}
          onLogout={handleLogout}
        />

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};