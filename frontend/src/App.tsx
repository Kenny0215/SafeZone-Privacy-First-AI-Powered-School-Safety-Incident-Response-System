/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/common/Toast.tsx';
import { AppLayout } from './components/layout/AppLayout.tsx';
import { ProtectedRoute } from './components/layout/ProtectedRoute.tsx';
import { OverviewPage } from './pages/OverviewPage.tsx';
import { SafetyMapPage } from './pages/SafetyMapPage.tsx';
import { VideoAnalysisPage } from './pages/VideoAnalysisPage.tsx';
import { IncidentsPage } from './pages/IncidentsPage.tsx';
import { IncidentDetailPage } from './pages/IncidentDetailPage.tsx';
import { AlertsPage } from './pages/AlertsPage.tsx';
import { StudentReportPage } from './pages/StudentReportPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Staff Login — separate, unauthenticated route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Main Administrative SaaS Dashboard Shell — login required */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="map" element={<SafetyMapPage />} />
            <Route path="video-analysis" element={<VideoAnalysisPage />} />
            <Route path="incidents" element={<IncidentsPage />} />
            <Route path="incidents/:id" element={<IncidentDetailPage />} />
            <Route path="alerts" element={<AlertsPage />} />
          </Route>

          {/* Dedicated Supportive Student Reporting Portal — fully
              separate route tree, no login, no staff layout */}
          <Route path="/student-report" element={<StudentReportPage />} />

          {/* Fallback to Overview (redirects through the login gate if
              there's no active staff session) */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}