import React from 'react';
import { Navigate } from 'react-router-dom';
import { authService } from '../../services/authService.ts';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Gates the staff operations dashboard behind the client-side login
 * session (see services/authService.ts). Anyone without a valid session
 * is bounced to /login — the student reporting portal is a fully
 * separate, unauthenticated route tree and is never affected by this.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  if (!authService.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};