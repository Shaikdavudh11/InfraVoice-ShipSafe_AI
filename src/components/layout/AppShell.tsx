import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  Bell,
  Check,
  ChevronDown,
  History,
  LayoutDashboard,
  Menu,
  MessageSquareCode,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CURRENT_USER } from '../../data/mockData';
import type { AppRoute } from '../../types/infravoice';

interface NavItem {
  route: AppRoute;
  label: string;
  shortLabel: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { route: '/', label: 'Overview', shortLabel: 'Overview', icon: LayoutDashboard },
  { route: '/shipsafe', label: 'ShipSafe — Security', shortLabel: 'ShipSafe', icon: ShieldCheck },
  { route: '/infravoice', label: 'InfraVoice — Assistant', shortLabel: 'InfraVoice', icon: MessageSquareCode },
  { route: '/simulation', label: 'Incident Simulation', shortLabel: 'Simulation', icon: Activity },
  { route: '/incidents', label: 'Incident Center', shortLabel: 'Incidents', icon: AlertOctagon },
  { route: '/history', label: 'Scan History', shortLabel: 'History', icon: History },
  { route: '/settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    route,
    navigate,
    workspaces,
    activeWorkspace,
    setActiveWorkspaceId,
    sidebarCollapsed,
    setSidebarCollapsed,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    toast,
  } = useApp();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const wsRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wsRef.current && !wsRef.current.contains(e.target as Node)) {
        setWsMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNav = (to: AppRoute) => {
    navigate(to);
    setMobileOpen(false);
  };

  const currentNav = NAV_ITEMS.find((n) => n.route === route) || NAV_ITEMS[0];

  const renderAvatar = (sizeClass = 'w-8 h-8') => {
    if (!avatarFailed) {
      return (
        <img
          src={CURRENT_USER.avatarUrl}
          alt={CURRENT_USER.name}
          referrerPolicy="no-referrer"
          onError={() => setAvatarFailed(true)}
          className={`${sizeClass} rounded-lg object-cover border border-slate-200 dark:border-white/[0.1] shrink-0`}
        />
      );
    }
    return (
      <div
        className={`${sizeClass} rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-xs font-semibold text-emerald-400 shrink-0`}
      >
        {CURRENT_USER.initials}
      </div>
    );
  };

  const sidebarContent = (isMobile = false) => {
    const collapsed = !isMobile && sidebarCollapsed;
    return (
      <div className="flex flex-col h-full bg-white dark:bg-[#0C0F13] border-r border-slate-200 dark:border-white/[0.08]">
        {/* Brand Header */}
        <div
          className={`h-14 flex items-center border-b border-slate-200 dark:border-white/[0.08] px-3.5 ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          <button
            type="button"
            onClick={() => handleNav('/')}
            className="flex items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-md cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 text-emerald-500 dark:text-emerald-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 2L4 6v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V6l-8-4z" />
                <path d="M8.5 12h2l1.5-3 2 6 1.5-3h1.5" />
              </svg>
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-zinc-100 whitespace-nowrap leading-tight">
                  InfraVoice
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 whitespace-nowrap leading-tight">
                  ShipSafe AI
                </div>
              </div>
            )}
          </button>

          {isMobile ? (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
              className="p-1.5 rounded-lg text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            !collapsed && (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = route === item.route;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => handleNav(item.route)}
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  collapsed ? 'justify-center' : ''
                } ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-emerald-600 dark:text-emerald-400' : ''
                  }`}
                  aria-hidden="true"
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}

          {collapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="w-full flex items-center justify-center px-2.5 py-2 mt-2 rounded-lg text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
        </nav>

        {/* Simulation Boundary Notice (when expanded) */}
        {!collapsed && (
          <div className="px-3.5 py-2.5 mx-2.5 mb-2 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02]">
            <p className="text-[11px] font-medium text-slate-700 dark:text-zinc-300">
              Simulated Environment
            </p>
            <p className="text-[11px] text-slate-500 dark:text-zinc-500 mt-0.5 leading-snug">
              Deterministic ShipSafe scanner, Gemini AI reasoning, and isolated simulation recovery. No real cluster connected.
            </p>
          </div>
        )}

        {/* User Profile Footer */}
        <div className="p-2.5 border-t border-slate-200 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={() => handleNav('/settings')}
            className={`w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors text-left cursor-pointer ${
              collapsed ? 'justify-center' : ''
            }`}
            title={collapsed ? `${CURRENT_USER.name} · Settings` : undefined}
          >
            {renderAvatar('w-8 h-8')}
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-slate-900 dark:text-zinc-100 truncate">
                  {CURRENT_USER.name}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  {CURRENT_USER.role}
                </div>
              </div>
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#090B0E] text-slate-900 dark:text-zinc-100">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-[width] duration-150 ${
          sidebarCollapsed ? 'w-[68px]' : 'w-[252px]'
        }`}
      >
        <div className="sticky top-0 h-screen">{sidebarContent(false)}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-64 max-w-[82vw] h-full z-10">{sidebarContent(true)}</div>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-[#090B0E]/95 backdrop-blur-sm border-b border-slate-200 dark:border-white/[0.08] px-4 lg:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-1 rounded-lg text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex items-center gap-2 text-[13px]">
              <span className="hidden sm:inline text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                {route === '/' ? `${getGreeting()}, Shaik Davudh` : currentNav.shortLabel}
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-zinc-700" aria-hidden="true">
                /
              </span>

              {/* Workspace Selector */}
              <div className="relative" ref={wsRef}>
                <button
                  type="button"
                  onClick={() => setWsMenuOpen((o) => !o)}
                  aria-expanded={wsMenuOpen}
                  aria-label="Select workspace"
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0F1216] hover:bg-slate-100 dark:hover:bg-white/[0.05] text-xs font-medium text-slate-800 dark:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span className="font-mono">{activeWorkspace.name}</span>
                  <span className="hidden md:inline text-slate-400 dark:text-zinc-500">
                    · {activeWorkspace.region}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
                </button>

                {wsMenuOpen && (
                  <div className="absolute left-0 mt-1.5 w-72 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#12161C] shadow-lg py-1.5 z-50">
                    <div className="px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-white/[0.06]">
                      Simulated Workspaces
                    </div>
                    {workspaces.map((ws) => {
                      const selected = ws.id === activeWorkspace.id;
                      return (
                        <button
                          key={ws.id}
                          type="button"
                          onClick={() => {
                            setActiveWorkspaceId(ws.id);
                            setWsMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-mono font-medium text-slate-900 dark:text-zinc-100 truncate">
                              {ws.name}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                              {ws.cluster} · {ws.region}
                            </div>
                          </div>
                          {selected && (
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Utilities */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                aria-label={`Notifications (${unreadCount} unread)`}
                aria-expanded={notifOpen}
                className="relative p-2 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0F1216] hover:bg-slate-100 dark:hover:bg-white/[0.05] text-slate-600 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-1.5 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#12161C] shadow-lg z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 dark:border-white/[0.06]">
                    <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                      Workspace Alerts
                    </span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-white/[0.06] max-h-80 overflow-y-auto">
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          markNotificationRead(n.id);
                          setNotifOpen(false);
                          navigate(n.route);
                        }}
                        className={`w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer ${
                          !n.read ? 'bg-emerald-500/[0.03]' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-900 dark:text-zinc-100 truncate">
                            {n.title}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 shrink-0 tabular-nums">
                            {n.timestamp}
                          </span>
                        </div>
                        <p className="text-[12px] text-slate-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                          {n.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate('/settings')}
              aria-label="Open profile and settings"
              className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
            >
              {renderAvatar('w-8 h-8')}
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 px-4 lg:px-6 py-6 max-w-[1360px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Subtle Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#161B22] text-xs font-medium text-slate-900 dark:text-zinc-100 shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
