import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  FileCode2,
  FileWarning,
  Info,
  Languages,
  MessageSquareCode,
  Mic,
  MicOff,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Terminal,
  Volume2,
  Wrench,
} from 'lucide-react';
import { MarkdownRenderer } from '../components/ui/MarkdownRenderer';
import { SeverityLabel } from '../components/ui/SeverityLabel';
import { Surface } from '../components/ui/Surface';
import { useApp, type InfraVoiceLaunchContextType } from '../context/AppContext';
import { INCIDENTS } from '../data/mockData';
import {
  getSpeechRecognitionConstructor,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  speakTextWithBrowser,
  SUPPORTED_VOICE_LANGUAGES,
  type SpeechRecognitionLike,
  type VoiceLanguageCode,
} from '../lib/voice/speech-client';
import type { ChatMessage, ChatMessageToolTrace } from '../types/infravoice';

interface AiStatusInfo {
  configured: boolean;
  provider: string;
  model: string;
}

const CONTEXT_OPTIONS: Array<{ id: InfraVoiceLaunchContextType; label: string }> = [
  { id: 'general', label: 'General DevOps' },
  { id: 'shipsafe', label: 'ShipSafe Scan' },
  { id: 'incident', label: 'Incident Investigation' },
  { id: 'kubernetes', label: 'Kubernetes' },
  { id: 'docker', label: 'Docker' },
  { id: 'terraform', label: 'Terraform' },
  { id: 'cicd', label: 'CI/CD' },
];

type VoiceCaptureState = 'idle' | 'listening' | 'ready' | 'unsupported' | 'denied' | 'error';

export function InfraVoicePage() {
  const {
    activeWorkspace,
    pendingChatLaunch,
    clearPendingVoicePrompt,
    latestScanResult,
    selectedIncidentId,
    navigate,
    showToast,
  } = useApp();

  const [aiStatus, setAiStatus] = useState<AiStatusInfo | null>(null);
  const [contextType, setContextType] = useState<InfraVoiceLaunchContextType>('general');
  const [attachScan, setAttachScan] = useState<boolean>(() => Boolean(latestScanResult));
  const [attachedIncidentId, setAttachedIncidentId] = useState<string>('none');
  const [artifactText, setArtifactText] = useState<string>('');
  const [showArtifactDrawer, setShowArtifactDrawer] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>(() => `conv-${Date.now()}`);
  const [inputValue, setInputValue] = useState('');
  const [isResponding, setIsResponding] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Voice Input & Output state (Web Speech API)
  const [language, setLanguage] = useState<VoiceLanguageCode>('en-IN');
  const [voiceState, setVoiceState] = useState<VoiceCaptureState>(() =>
    isSpeechRecognitionSupported() ? 'idle' : 'unsupported'
  );
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const stopSpeakingRef = useRef<(() => void) | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/ai/status')
      .then((res) => res.json())
      .then((data: AiStatusInfo) => {
        if (active) setAiStatus(data);
      })
      .catch(() => {
        if (active) {
          setAiStatus({ configured: false, provider: 'gemini-developer-api', model: 'unavailable' });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
      stopSpeakingRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (latestScanResult) {
      setAttachScan(true);
    }
  }, [latestScanResult]);

  const attachedIncident = useMemo(() => {
    if (attachedIncidentId === 'none') return null;
    return INCIDENTS.find((i) => i.id === attachedIncidentId) || null;
  }, [attachedIncidentId]);

  const quickActions = useMemo(() => {
    const base: Array<{ label: string; prompt: string; hint: string }> = [];

    if (contextType === 'shipsafe' || (attachScan && latestScanResult)) {
      base.push(
        {
          label: 'What should I fix first?',
          hint: 'Prioritize active ShipSafe findings',
          prompt:
            'Based on the active ShipSafe scan findings, what should I fix first and why?',
        },
        {
          label: 'Explain top finding',
          hint: 'Impact and safe remediation',
          prompt:
            'Explain the highest-severity finding from the active ShipSafe scan and show a safe fix example.',
        },
        {
          label: 'Help me verify the fix',
          hint: 'Post-remediation validation checklist',
          prompt:
            'How should I verify my Dockerfile, Kubernetes, or Terraform fixes before shipping to production?',
        }
      );
    }

    if (contextType === 'incident' || attachedIncident) {
      base.push(
        {
          label: 'Explain this incident',
          hint: 'Confirmed evidence vs hypotheses',
          prompt:
            'Explain the attached incident, separating confirmed evidence from inferred causes and unverified hypotheses.',
        },
        {
          label: 'Analyze these logs',
          hint: 'Extract signals and safe commands',
          prompt:
            'Analyze the attached incident logs and suggest read-only diagnostic commands before any mitigation.',
        }
      );
    }

    if (base.length < 4) {
      base.push(
        {
          label: 'Review this configuration',
          hint: 'Static risks & reliability checks',
          prompt:
            'Review the attached infrastructure configuration or pasted snippet for security, IAM, and reliability risks.',
        },
        {
          label: 'Generate a remediation example',
          hint: 'Hardened YAML / Dockerfile patch',
          prompt:
            'Generate a hardened non-root Kubernetes or Dockerfile remediation example with resource limits and probes.',
        }
      );
    }

    return base.slice(0, 4);
  }, [contextType, attachScan, latestScanResult, attachedIncident]);

  const sendMessage = async (
    text: string,
    overrideOptions?: {
      contextType?: InfraVoiceLaunchContextType;
      attachScanOverride?: boolean;
      incidentIdOverride?: string;
    }
  ) => {
    const trimmed = text.trim();
    if (!trimmed || isResponding) return;

    const effectiveContextType = overrideOptions?.contextType ?? contextType;
    const effectiveAttachScan = overrideOptions?.attachScanOverride ?? attachScan;
    const effectiveIncident =
      overrideOptions?.incidentIdOverride && overrideOptions.incidentIdOverride !== 'none'
        ? INCIDENTS.find((i) => i.id === overrideOptions.incidentIdOverride) || null
        : attachedIncident;

    const now = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      timestamp: `${now} IST`,
      content: trimmed,
    };

    const historyForApi = messages
      .filter((m) => !m.isError)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    if (voiceState === 'ready') setVoiceState('idle');
    setIsResponding(true);

    try {
      const response = await fetch('/api/infravoice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          conversationId,
          contextType: effectiveContextType,
          language,
          workspaceName: activeWorkspace.name,
          history: historyForApi,
          scanResult: effectiveAttachScan && latestScanResult ? latestScanResult : null,
          incident: effectiveIncident
            ? {
                id: effectiveIncident.id,
                title: effectiveIncident.title,
                severity: effectiveIncident.severity,
                status: effectiveIncident.status,
                affectedService: effectiveIncident.affectedService,
                namespace: effectiveIncident.namespace,
                timestamp: effectiveIncident.timestamp,
                summary: effectiveIncident.summary,
                timeline: effectiveIncident.timeline.map((t) => ({
                  timestamp: t.timestamp,
                  source: t.source,
                  title: t.title,
                  detail: t.detail,
                })),
                logs: effectiveIncident.logs.map((l) => ({
                  timestamp: l.timestamp,
                  level: l.level,
                  pod: l.pod,
                  message: l.message,
                })),
              }
            : null,
          artifactText: artifactText.trim() || null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        const errMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          timestamp: `${now} IST`,
          content:
            payload?.error ||
            'Gemini AI could not complete this request. Verify configuration and retry.',
          isError: true,
          retryPrompt: payload?.retryable === false ? undefined : trimmed,
        };
        setMessages((prev) => [...prev, errMsg]);
        return;
      }

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        timestamp: `${now} IST`,
        content: payload.reply,
        model: payload.model,
        toolActivity: payload.toolActivity as ChatMessageToolTrace[] | undefined,
        contextSummary: payload.contextSummary as string[] | undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        timestamp: `${now} IST`,
        content: 'Network error reaching /api/infravoice/chat. Check server status and retry.',
        isError: true,
        retryPrompt: trimmed,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsResponding(false);
    }
  };

  useEffect(() => {
    if (!pendingChatLaunch) return;
    const launch = pendingChatLaunch;
    clearPendingVoicePrompt();

    if (launch.contextType) {
      setContextType(launch.contextType);
    }
    if (launch.attachScan) {
      setAttachScan(true);
    }
    if (launch.incidentId) {
      setAttachedIncidentId(launch.incidentId);
    }

    sendMessage(launch.prompt, {
      contextType: launch.contextType,
      attachScanOverride: launch.attachScan,
      incidentIdOverride: launch.incidentId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChatLaunch]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isResponding]);

  const startVoiceCapture = () => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setVoiceState('unsupported');
      setVoiceNote(
        'Web Speech recognition is not supported in this browser. Use Chrome/Edge or type your question directly.'
      );
      return;
    }

    if (voiceState === 'listening') {
      recognitionRef.current?.stop();
      setVoiceState('ready');
      return;
    }

    try {
      const rec = new Recognition();
      rec.lang = language;
      rec.continuous = false;
      rec.interimResults = true;
      setVoiceNote(null);
      setVoiceState('listening');

      rec.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInputValue(transcript.trim());
      };

      rec.onerror = (ev) => {
        const errCode = ev?.error || '';
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          setVoiceState('denied');
          setVoiceNote('Microphone permission denied. Allow microphone access in browser settings or type below.');
        } else if (errCode === 'no-speech') {
          setVoiceState('idle');
          setVoiceNote('No speech detected. Try speaking closer to the microphone.');
        } else {
          setVoiceState('error');
          setVoiceNote('Voice transcription interrupted. You can edit or type your prompt below.');
        }
      };

      rec.onend = () => {
        setVoiceState((prev) => (prev === 'listening' ? 'ready' : prev));
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setVoiceState('error');
      setVoiceNote('Unable to start browser speech recognition.');
    }
  };

  const toggleSpeakMessage = (msg: ChatMessage) => {
    if (speakingMsgId === msg.id) {
      stopSpeakingRef.current?.();
      stopSpeakingRef.current = null;
      setSpeakingMsgId(null);
      return;
    }

    const stopFn = speakTextWithBrowser(msg.content, language, {
      onStart: () => setSpeakingMsgId(msg.id),
      onEnd: () => setSpeakingMsgId(null),
      onError: (reason) => {
        setSpeakingMsgId(null);
        showToast(reason);
      },
    });
    stopSpeakingRef.current = stopFn;
  };

  const copyMessage = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedMsgId(msg.id);
      window.setTimeout(() => setCopiedMsgId(null), 1800);
    } catch {
      showToast('Clipboard access unavailable');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const resetChat = () => {
    stopSpeakingRef.current?.();
    setSpeakingMsgId(null);
    setMessages([]);
    setConversationId(`conv-${Date.now()}`);
    setVoiceNote(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100">
            InfraVoice — AI Assistant
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-0.5">
            Gemini-powered DevOps &amp; SRE reasoning grounded on{' '}
            <span className="font-mono text-slate-700 dark:text-zinc-300">
              {activeWorkspace.name}
            </span>{' '}
            · Evidence-first · Zero fabricated cluster data
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] text-xs text-slate-600 dark:text-zinc-300">
            <Languages className="w-3.5 h-3.5 text-emerald-500" />
            <select
              aria-label="Assistant language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as VoiceLanguageCode)}
              className="bg-transparent text-xs focus:outline-none cursor-pointer"
            >
              {SUPPORTED_VOICE_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code} className="bg-white dark:bg-[#0F1216]">
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={resetChat}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear Thread</span>
          </button>
        </div>
      </div>

      {/* AI Unavailable Banner (transparent when backend lacks GEMINI_API_KEY / Vertex config) */}
      {aiStatus && !aiStatus.configured && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-700 dark:text-amber-300"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Gemini AI credentials are not configured on the server.</span>{' '}
              Set <code className="font-mono">GEMINI_API_KEY</code> in Secrets or configure Vertex AI ADC in environment variables to enable live reasoning.
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="px-2.5 py-1 rounded border border-amber-500/30 hover:bg-amber-500/10 font-medium whitespace-nowrap self-start sm:self-auto cursor-pointer"
          >
            View AI Settings
          </button>
        </div>
      )}

      {/* Main Two-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Chat Workspace */}
        <Surface className="lg:col-span-8 flex flex-col min-h-[620px] max-h-[calc(100vh-195px)]">
          {/* Context Selector + Quick Actions */}
          <div className="p-4 border-b border-slate-200 dark:border-white/[0.06] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04]">
                {CONTEXT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setContextType(opt.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      contextType === opt.id
                        ? 'bg-white dark:bg-[#161B22] text-slate-900 dark:text-zinc-100 shadow-xs'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowArtifactDrawer((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                  showArtifactDrawer || artifactText.trim().length > 0
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
              >
                <Paperclip className="w-3 h-3" />
                <span>{artifactText.trim() ? 'Snippet attached' : 'Paste Config / Logs'}</span>
              </button>
            </div>

            {showArtifactDrawer && (
              <textarea
                rows={4}
                value={artifactText}
                onChange={(e) => setArtifactText(e.target.value)}
                placeholder="Paste a Dockerfile, Kubernetes YAML, Terraform HCL, GitHub Actions workflow, or pod log excerpt for InfraVoice to inspect..."
                aria-label="Paste configuration or log snippet"
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#090B0E] font-mono text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {quickActions.map((qa) => (
                <button
                  key={qa.label}
                  type="button"
                  disabled={isResponding}
                  onClick={() => sendMessage(qa.prompt)}
                  className="text-left p-2.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#090B0E] hover:border-emerald-500/40 hover:bg-emerald-500/[0.04] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">
                    {qa.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                    {qa.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !isResponding && (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10">
                <div className="w-10 h-10 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#090B0E] flex items-center justify-center mb-3">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  Talk to your infrastructure
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-md leading-relaxed">
                  Ask about ShipSafe findings, Kubernetes CrashLoopBackOff logs, Terraform IAM risks, or paste a config snippet above. Responses use real Gemini reasoning and never fabricate live cluster state.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400 mb-1">
                  <span className="font-medium text-slate-700 dark:text-zinc-300">
                    {msg.role === 'user' ? 'You' : 'InfraVoice'}
                  </span>
                  {msg.model && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[10px]">{msg.model}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{msg.timestamp}</span>
                </div>

                {msg.role === 'user' ? (
                  <div className="max-w-[85%] rounded-xl px-4 py-2.5 bg-emerald-600 text-white text-[13px] leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  <div
                    className={`w-full rounded-xl border p-4 space-y-3 ${
                      msg.isError
                        ? 'border-red-500/30 bg-red-500/[0.06]'
                        : 'border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#090B0E]'
                    }`}
                  >
                    {/* Transparent Read-Only Tool Activity */}
                    {msg.toolActivity && msg.toolActivity.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pb-2.5 border-b border-slate-200/80 dark:border-white/[0.06]">
                        {msg.toolActivity.map((trace, tIdx) => (
                          <span
                            key={`${trace.tool}-${tIdx}`}
                            title={trace.summary}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-500/25 bg-emerald-500/[0.06] text-[11px] text-emerald-700 dark:text-emerald-300"
                          >
                            <Wrench className="w-3 h-3" />
                            <span>{trace.label}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {msg.isError ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-red-600 dark:text-red-400">
                        <span>{msg.content}</span>
                        {msg.retryPrompt && (
                          <button
                            type="button"
                            onClick={() => sendMessage(msg.retryPrompt!)}
                            disabled={isResponding}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-red-500/30 bg-white dark:bg-[#090B0E] text-red-600 dark:text-red-300 hover:bg-red-500/10 shrink-0 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <MarkdownRenderer content={msg.content} />

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-white/[0.06]">
                          <div className="text-[11px] text-slate-500 dark:text-zinc-500">
                            {msg.contextSummary && msg.contextSummary.length > 0
                              ? `Context: ${msg.contextSummary.join(' · ')}`
                              : 'Grounded on supplied prompt'}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isSpeechSynthesisSupported() && (
                              <button
                                type="button"
                                onClick={() => toggleSpeakMessage(msg)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-white/[0.08] text-[11px] text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] cursor-pointer"
                              >
                                {speakingMsgId === msg.id ? (
                                  <>
                                    <Square className="w-3 h-3 text-emerald-500" />
                                    <span>Stop</span>
                                  </>
                                ) : (
                                  <>
                                    <Volume2 className="w-3 h-3" />
                                    <span>Listen</span>
                                  </>
                                )}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => copyMessage(msg)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-white/[0.08] text-[11px] text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] cursor-pointer"
                            >
                              {copiedMsgId === msg.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-500" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}

            {isResponding && (
              <div className="flex flex-col items-start">
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 mb-1">
                  InfraVoice · Reasoning with Gemini...
                </div>
                <div className="w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#090B0E] p-4 space-y-2 animate-pulse">
                  <div className="h-3.5 w-3/4 rounded bg-slate-200 dark:bg-white/[0.08]" />
                  <div className="h-3 w-1/2 rounded bg-slate-200/70 dark:bg-white/[0.05]" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Voice Status / Live Speech Feedback */}
          {(voiceState === 'listening' || voiceNote) && (
            <div className="mx-4 mb-2 px-3.5 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2.5 text-slate-700 dark:text-zinc-200">
                {voiceState === 'listening' && (
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                )}
                <span>
                  {voiceState === 'listening'
                    ? `Listening (${language})... Speak your question, then review or send below.`
                    : voiceNote}
                </span>
              </div>
              {voiceState === 'listening' && (
                <button
                  type="button"
                  onClick={() => recognitionRef.current?.stop()}
                  className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[11px] font-medium cursor-pointer"
                >
                  Stop
                </button>
              )}
            </div>
          )}

          {/* Input Composer */}
          <form
            onSubmit={handleSubmit}
            className="p-3.5 border-t border-slate-200 dark:border-white/[0.06] flex items-center gap-2"
          >
            <button
              type="button"
              onClick={startVoiceCapture}
              aria-label={voiceState === 'listening' ? 'Stop voice input' : 'Start voice input'}
              aria-pressed={voiceState === 'listening'}
              title={
                voiceState === 'unsupported'
                  ? 'Browser voice input unsupported — type your query'
                  : `Voice input (${language})`
              }
              className={`p-2.5 rounded-lg border transition-colors shrink-0 cursor-pointer ${
                voiceState === 'listening'
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
                  : 'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.05]'
              }`}
            >
              {voiceState === 'listening' ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>

            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask about ShipSafe findings, Kubernetes errors, Terraform, or pasted logs..."
              aria-label="Ask InfraVoice"
              className="flex-1 min-w-0 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] text-[13px] text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
            />

            <button
              type="submit"
              disabled={!inputValue.trim() || isResponding}
              aria-label="Send message"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </Surface>

        {/* Right: Real Attached Context Panel */}
        <Surface className="lg:col-span-4 p-4 space-y-4">
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200 dark:border-white/[0.06]">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                Grounded Context
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                Attach real ShipSafe scans or incident logs for Gemini to inspect.
              </p>
            </div>
            <MessageSquareCode className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" aria-hidden="true" />
          </div>

          {/* Active ShipSafe Scan Attachment */}
          <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-900 dark:text-zinc-100">
                <FileCode2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>ShipSafe Scan</span>
              </span>
              {latestScanResult && (
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attachScan}
                    onChange={(e) => setAttachScan(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span>Include</span>
                </label>
              )}
            </div>

            {latestScanResult ? (
              <div className="text-[11px] text-slate-600 dark:text-zinc-400 space-y-1">
                <div className="font-mono text-slate-800 dark:text-zinc-200">
                  {latestScanResult.scanId} · Risk {latestScanResult.riskScore}/100
                </div>
                <div>
                  {latestScanResult.totalFindings} findings across{' '}
                  {latestScanResult.fileSummaries.length} file(s)
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                No scan run in this session yet.{' '}
                <button
                  type="button"
                  onClick={() => navigate('/shipsafe')}
                  className="text-emerald-500 hover:underline cursor-pointer"
                >
                  Run a ShipSafe scan
                </button>
              </div>
            )}
          </div>

          {/* Incident Context Picker */}
          <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E] space-y-2">
            <label
              htmlFor="incident-context-select"
              className="block text-xs font-medium text-slate-900 dark:text-zinc-100"
            >
              Incident Evidence Context
            </label>
            <select
              id="incident-context-select"
              value={attachedIncidentId}
              onChange={(e) => setAttachedIncidentId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0F1216] text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="none">No incident attached</option>
              {INCIDENTS.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  {inc.id} — {inc.affectedService} ({inc.severity})
                </option>
              ))}
              {selectedIncidentId &&
                !INCIDENTS.some((i) => i.id === selectedIncidentId) && (
                  <option value={selectedIncidentId}>{selectedIncidentId}</option>
                )}
            </select>

            {attachedIncident && (
              <div className="pt-1 space-y-1 text-[11px] text-slate-600 dark:text-zinc-400">
                <div className="flex items-center justify-between">
                  <SeverityLabel severity={attachedIncident.severity} />
                  <span className="font-mono">{attachedIncident.namespace}</span>
                </div>
                <p className="text-slate-700 dark:text-zinc-300 leading-snug">
                  {attachedIncident.title}
                </p>
              </div>
            )}
          </div>

          {/* Live Integration Boundary Notice */}
          <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/50 dark:bg-[#090B0E] text-[11px] text-slate-500 dark:text-zinc-400 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
            <span>
              Read-only reasoning boundary: InfraVoice inspects only uploaded scans, selected incident logs, and pasted snippets. No live cluster mutations are executed.
            </span>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => navigate('/incidents')}
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-zinc-300 hover:text-emerald-500 transition-colors cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Open Incident Logs</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/shipsafe')}
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-zinc-300 hover:text-emerald-500 transition-colors cursor-pointer"
            >
              <FileWarning className="w-3.5 h-3.5" />
              <span>View Findings</span>
            </button>
          </div>
        </Surface>
      </div>
    </div>
  );
}
