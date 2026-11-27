import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { INITIAL_NOTIFICATIONS, WORKSPACES } from '../data/mockData';
import type { AppRoute, NotificationItem, Severity, Workspace } from '../types/infravoice';

const VALID_ROUTES: AppRoute[] = [
  '/',
  '/shipsafe',
  '/infravoice',
  '/incidents',
  '/history',
  '/settings',
];

function normalizeRoute(pathname: string): AppRoute {
  if (VALID_ROUTES.includes(pathname as AppRoute)) {
    return pathname as AppRoute;
  }
  return '/';
}

interface AppContextValue {
  route: AppRoute;
  navigate: (to: AppRoute) => void;
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  setActiveWorkspaceId: (id: string) => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  notifications: NotificationItem[];
  unreadCount: number;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  pendingVoicePrompt: string | null;
  clearPendingVoicePrompt: () => void;
  askInfraVoice: (prompt: string) => void;
  selectedIncidentId: string;
  setSelectedIncidentId: (id: string) => void;
  openIncident: (id: string) => void;
  shipSafeInitialSeverity: Severity | 'all';
  setShipSafeInitialSeverity: (sev: Severity | 'all') => void;
  openShipSafeWithSeverity: (sev: Severity | 'all') => void;
  toast: string | null;
  showToast: (message: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<AppRoute>(() =>
    typeof window !== 'undefined' ? normalizeRoute(window.location.pathname) : '/'
  );
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(WORKSPACES[0].id);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [pendingVoicePrompt, setPendingVoicePrompt] = useState<string | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('INC-2041');
  const [shipSafeInitialSeverity, setShipSafeInitialSeverity] = useState<Severity | 'all'>('all');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => {
      setRoute(normalizeRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const navigate = useCallback((to: AppRoute) => {
    if (window.location.pathname !== to) {
      window.history.pushState({}, '', to);
    }
    setRoute(to);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((prev) => (prev === message ? null : prev));
    }, 2600);
  }, []);

  const askInfraVoice = useCallback(
    (prompt: string) => {
      setPendingVoicePrompt(prompt);
      navigate('/infravoice');
    },
    [navigate]
  );

  const clearPendingVoicePrompt = useCallback(() => {
    setPendingVoicePrompt(null);
  }, []);

  const openIncident = useCallback(
    (id: string) => {
      setSelectedIncidentId(id);
      navigate('/incidents');
    },
    [navigate]
  );

  const openShipSafeWithSeverity = useCallback(
    (sev: Severity | 'all') => {
      setShipSafeInitialSeverity(sev);
      navigate('/shipsafe');
    },
    [navigate]
  );

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const activeWorkspace = useMemo(
    () => WORKSPACES.find((w) => w.id === activeWorkspaceId) || WORKSPACES[0],
    [activeWorkspaceId]
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const value: AppContextValue = {
    route,
    navigate,
    workspaces: WORKSPACES,
    activeWorkspace,
    setActiveWorkspaceId,
    theme,
    setTheme,
    sidebarCollapsed,
    setSidebarCollapsed,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    pendingVoicePrompt,
    clearPendingVoicePrompt,
    askInfraVoice,
    selectedIncidentId,
    setSelectedIncidentId,
    openIncident,
    shipSafeInitialSeverity,
    setShipSafeInitialSeverity,
    openShipSafeWithSeverity,
    toast,
    showToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within AppProvider');
  }
  return ctx;
}
