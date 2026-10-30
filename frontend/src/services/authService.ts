import { UserProfile } from '../types/index.ts';
import { AVAILABLE_STAFF } from '../data/seedData.ts';

const SESSION_KEY = 'safezone_staff_session';
const DEMO_PASSWORD = 'safezone2026';

interface StoredSession {
  user: UserProfile;
}

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Accepts either the full staff email (e.g. "m.vance@oakwood-schools.edu")
 * or just the part before the "@" (e.g. "m.vance") as the username, so
 * staff don't have to type the full address on a small screen.
 */
const findStaffByUsername = (username: string): UserProfile | undefined => {
  const needle = normalize(username);
  return AVAILABLE_STAFF.find((staff) => {
    const email = normalize(staff.email);
    return email === needle || email.split('@')[0] === needle;
  });
};

export const authService = {
  login(username: string, password: string): UserProfile | null {
    if (!username.trim() || !password) return null;

    const staff = findStaffByUsername(username);
    if (!staff || password !== DEMO_PASSWORD) return null;

    const session: StoredSession = { user: staff };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return staff;
  },

  logout(): void {
    sessionStorage.removeItem(SESSION_KEY);
  },

  getCurrentUser(): UserProfile | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredSession;
      return parsed.user ?? null;
    } catch {
      return null;
    }
  },

  isAuthenticated(): boolean {
    return authService.getCurrentUser() !== null;
  },
};