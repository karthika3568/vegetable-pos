import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { authService } from '../services/auth.service.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    user: null,
    status: authService.hasToken() ? 'loading' : 'unauthenticated',
  });

  // Hydrate the session from /auth/me whenever a stored token exists.
  // Backend remains the source of truth: role + permissions are read
  // fresh from the database on that call.
  useEffect(() => {
    if (!authService.hasToken()) return;

    let active = true;
    authService
      .me()
      .then((user) => {
        if (active && user) setState({ user, status: 'authenticated' });
        else if (active) {
          authService.clearSession();
          setState({ user: null, status: 'unauthenticated' });
        }
      })
      .catch(() => {
        if (!active) return;
        authService.clearSession();
        setState({ user: null, status: 'unauthenticated' });
      });

    return () => {
      active = false;
    };
  }, []);

  // The API client broadcasts a window event on 401 so a stale token
  // anywhere in the app ends the session instead of leaving a dead screen.
  const clearSession = useCallback(() => {
    authService.clearSession();
    setState({ user: null, status: 'unauthenticated' });
  }, []);

  useEffect(() => {
    const onUnauthorized = () => clearSession();
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [clearSession]);

  const login = useCallback(async (credentials) => {
    const data = await authService.login(credentials);
    setState({ user: data.user, status: 'authenticated' });
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Best effort: always clear the local session even if the API is down.
    }
    clearSession();
  }, [clearSession]);

  const hasPermission = useCallback(
    (permission) => {
      if (state.status !== 'authenticated' || !state.user) return false;
      if (state.user.isAdmin) return true;
      return (
        Array.isArray(state.user.permissions) && state.user.permissions.includes(permission)
      );
    },
    [state]
  );

  const value = useMemo(
    () => ({
      user: state.user,
      status: state.status,
      isAuthenticated: state.status === 'authenticated',
      isLoading: state.status === 'loading',
      login,
      logout,
      clearSession,
      hasPermission,
    }),
    [state, login, logout, clearSession, hasPermission]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}