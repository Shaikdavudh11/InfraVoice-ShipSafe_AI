import { useState } from 'react';
import { Bell, Cpu, Moon, Palette, Save, Server, Sun } from 'lucide-react';
import { Surface } from '../components/ui/Surface';
import { useApp } from '../context/AppContext';

export function SettingsPage() {
  const {
    activeWorkspace,
    theme,
    setTheme,
    sidebarCollapsed,
    setSidebarCollapsed,
    showToast,
  } = useApp();

  const [workspaceDisplayName, setWorkspaceDisplayName] = useState(activeWorkspace.name);
  const [defaultNamespace, setDefaultNamespace] = useState('payments-prod');
  const [retentionDays, setRetentionDays] = useState('30');

  const [voiceLocale, setVoiceLocale] = useState('en-IN');
  const [responseStyle, setResponseStyle] = useState<'concise' | 'detailed'>('concise');
  const [safeCommandConfirm, setSafeCommandConfirm] = useState(true);

  const [notifCritical, setNotifCritical] = useState(true);
  const [notifIncidents, setNotifIncidents] = useState(true);
  const [notifDigest, setNotifDigest] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    showToast('Preferences saved locally for this Phase 1A preview');
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100">
            Settings
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-0.5">
            Configure workspace defaults, appearance, notifications, and Phase 2 AI preview options.
          </p>
        </div>

        <button
          type="submit"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save Preferences</span>
        </button>
      </div>

      {/* Workspace Settings */}
      <Surface className="p-5 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-white/[0.06]">
          <Server className="w-4 h-4 text-emerald-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
            Workspace Settings
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="ws-name"
              className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
            >
              Workspace Identifier
            </label>
            <input
              id="ws-name"
              type="text"
              value={workspaceDisplayName}
              onChange={(e) => setWorkspaceDisplayName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="ws-namespace"
              className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
            >
              Default Kubernetes Namespace
            </label>
            <input
              id="ws-namespace"
              type="text"
              value={defaultNamespace}
              onChange={(e) => setDefaultNamespace(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="ws-region"
              className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
            >
              Primary Cloud Region
            </label>
            <input
              id="ws-region"
              type="text"
              value={activeWorkspace.region}
              readOnly
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02] text-xs text-slate-500 dark:text-zinc-400"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="ws-retention"
              className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
            >
              Scan Audit Retention
            </label>
            <select
              id="ws-retention"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </div>
        </div>
      </Surface>

      {/* AI Configuration Placeholder */}
      <Surface className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-500" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
              AI & Voice Configuration
            </h2>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-zinc-400">
            Backend Gemini orchestration scheduled for Phase 2
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="ai-locale"
              className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
            >
              Voice Recognition Locale
            </label>
            <select
              id="ai-locale"
              value={voiceLocale}
              onChange={(e) => setVoiceLocale(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="en-IN">English (India)</option>
              <option value="en-US">English (United States)</option>
              <option value="en-GB">English (United Kingdom)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
              Diagnostic Output Format
            </span>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04] w-fit">
              {(['concise', 'detailed'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setResponseStyle(mode)}
                  className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                    responseStyle === mode
                      ? 'bg-white dark:bg-[#161B22] text-slate-900 dark:text-zinc-100 shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-start gap-3 pt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={safeCommandConfirm}
            onChange={(e) => setSafeCommandConfirm(e.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-xs">
            <span className="block font-medium text-slate-900 dark:text-zinc-100">
              Require safety explanation before destructive cluster commands
            </span>
            <span className="block text-slate-500 dark:text-zinc-400 mt-0.5">
              Never auto-execute rollouts, pod deletions, or IAM mutations without explicit engineer confirmation.
            </span>
          </span>
        </label>
      </Surface>

      {/* Appearance */}
      <Surface className="p-5 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-white/[0.06]">
          <Palette className="w-4 h-4 text-emerald-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
            Appearance
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">
              Interface Theme
            </div>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
              Dark-first engineering surface recommended for extended console sessions.
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04] w-fit">
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                theme === 'dark'
                  ? 'bg-white dark:bg-[#161B22] text-slate-900 dark:text-zinc-100 shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Dark</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'bg-white dark:bg-[#161B22] text-slate-900 dark:text-zinc-100 shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Light</span>
            </button>
          </div>
        </div>

        <label className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/[0.06] cursor-pointer">
          <span className="text-xs">
            <span className="block font-medium text-slate-900 dark:text-zinc-100">
              Compact sidebar navigation
            </span>
            <span className="block text-slate-500 dark:text-zinc-400 mt-0.5">
              Collapse desktop sidebar to icon-only rail.
            </span>
          </span>
          <input
            type="checkbox"
            checked={sidebarCollapsed}
            onChange={(e) => setSidebarCollapsed(e.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
        </label>
      </Surface>

      {/* Notification Preferences */}
      <Surface className="p-5 space-y-3">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-white/[0.06]">
          <Bell className="w-4 h-4 text-emerald-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
            Notification Preferences
          </h2>
        </div>

        <label className="flex items-center justify-between py-2 cursor-pointer">
          <span className="text-xs">
            <span className="block font-medium text-slate-900 dark:text-zinc-100">
              Critical ShipSafe policy violations
            </span>
            <span className="block text-slate-500 dark:text-zinc-400">
              Alert when privileged containers or wildcard IAM policies are detected.
            </span>
          </span>
          <input
            type="checkbox"
            checked={notifCritical}
            onChange={(e) => setNotifCritical(e.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
        </label>

        <label className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-white/[0.06] cursor-pointer">
          <span className="text-xs">
            <span className="block font-medium text-slate-900 dark:text-zinc-100">
              Kubernetes CrashLoopBackOff & OOM alerts
            </span>
            <span className="block text-slate-500 dark:text-zinc-400">
              Surface new incidents in the top-bar alert inbox.
            </span>
          </span>
          <input
            type="checkbox"
            checked={notifIncidents}
            onChange={(e) => setNotifIncidents(e.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
        </label>

        <label className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-white/[0.06] cursor-pointer">
          <span className="text-xs">
            <span className="block font-medium text-slate-900 dark:text-zinc-100">
              Weekly cluster posture & cost digest
            </span>
            <span className="block text-slate-500 dark:text-zinc-400">
              Summary email scheduled Mondays at 09:00 IST (Phase 2 integration).
            </span>
          </span>
          <input
            type="checkbox"
            checked={notifDigest}
            onChange={(e) => setNotifDigest(e.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
        </label>
      </Surface>
    </form>
  );
}
