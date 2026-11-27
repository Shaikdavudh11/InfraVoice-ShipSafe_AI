import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileWarning,
  Info,
  MessageSquareCode,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { CodeBlock } from '../components/ui/CodeBlock';
import { SeverityLabel } from '../components/ui/SeverityLabel';
import { Surface } from '../components/ui/Surface';
import { useApp } from '../context/AppContext';
import {
  EVIDENCE_ITEMS,
  generateMockAssistantResponse,
  INITIAL_CHAT_MESSAGES,
  SUGGESTED_PROMPTS,
} from '../data/mockData';
import type { ChatMessage, EvidenceItem } from '../types/infravoice';

export function InfraVoicePage() {
  const {
    activeWorkspace,
    pendingVoicePrompt,
    clearPendingVoicePrompt,
    navigate,
  } = useApp();

  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const [isResponding, setIsResponding] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [activeEvidenceIds, setActiveEvidenceIds] = useState<string[]>([
    'ev-k8s-oom',
    'ev-scan-limits',
    'ev-scan-priv',
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isResponding) return;

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

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setVoiceListening(false);
    setIsResponding(true);

    window.setTimeout(() => {
      const reply = generateMockAssistantResponse(trimmed);
      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        timestamp: `${now} IST`,
        ...reply,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (reply.evidenceIds && reply.evidenceIds.length > 0) {
        setActiveEvidenceIds(reply.evidenceIds);
      }
      setIsResponding(false);
    }, 520);
  };

  useEffect(() => {
    if (pendingVoicePrompt) {
      const prompt = pendingVoicePrompt;
      clearPendingVoicePrompt();
      sendMessage(prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingVoicePrompt]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isResponding]);

  const activeEvidence: EvidenceItem[] = useMemo(() => {
    return activeEvidenceIds
      .map((id) => EVIDENCE_ITEMS[id])
      .filter((item): item is EvidenceItem => Boolean(item));
  }, [activeEvidenceIds]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const resetChat = () => {
    setMessages(INITIAL_CHAT_MESSAGES);
    setActiveEvidenceIds(['ev-k8s-oom', 'ev-scan-limits', 'ev-scan-priv']);
    setVoiceListening(false);
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
            Ask questions in natural language against{' '}
            <span className="font-mono text-slate-700 dark:text-zinc-300">{activeWorkspace.name}</span>{' '}
            · Simulated Phase 1A responses (Gemini integration deferred to Phase 2)
          </p>
        </div>

        <button
          type="button"
          onClick={resetChat}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Thread</span>
        </button>
      </div>

      {/* Main Two-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Chat Workspace */}
        <Surface className="lg:col-span-8 flex flex-col min-h-[600px] max-h-[calc(100vh-190px)]">
          {/* Suggested Prompt Cards */}
          <div className="p-4 border-b border-slate-200 dark:border-white/[0.06]">
            <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-2.5">
              Suggested diagnostics prompts
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  onClick={() => sendMessage(prompt.label)}
                  className="text-left p-2.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#090B0E] hover:border-emerald-500/40 hover:bg-emerald-500/[0.04] transition-colors cursor-pointer"
                >
                  <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">
                    {prompt.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                    {prompt.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400 mb-1">
                  <span className="font-medium text-slate-700 dark:text-zinc-300">
                    {msg.role === 'user' ? 'You' : 'InfraVoice'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{msg.timestamp}</span>
                </div>

                {msg.role === 'user' ? (
                  <div className="max-w-[85%] rounded-xl px-4 py-2.5 bg-emerald-600 text-white text-[13px] leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  <div className="w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#090B0E] p-4 space-y-3.5">
                    <p className="text-[13px] font-medium text-slate-900 dark:text-zinc-100 leading-relaxed">
                      {msg.content}
                    </p>

                    {msg.structured && (
                      <div className="space-y-3 pt-2 border-t border-slate-200/80 dark:border-white/[0.06]">
                        <p className="text-[13px] text-slate-600 dark:text-zinc-300 leading-relaxed">
                          {msg.structured.summary}
                        </p>

                        <div>
                          <div className="text-xs font-semibold text-slate-800 dark:text-zinc-200 mb-1.5">
                            Contributing Causes
                          </div>
                          <ul className="space-y-1 text-[13px] text-slate-600 dark:text-zinc-300 list-disc pl-4">
                            {msg.structured.causes.map((cause, i) => (
                              <li key={i}>{cause}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="space-y-2.5">
                          <div className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            Recommended Safe Steps
                          </div>
                          {msg.structured.remediationSteps.map((stepObj, i) => (
                            <div key={i} className="space-y-2">
                              <p className="text-[13px] text-slate-700 dark:text-zinc-300">
                                {i + 1}. {stepObj.step}
                              </p>
                              {stepObj.command && (
                                <CodeBlock code={stepObj.command} label="kubectl / cli" />
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="flex items-start gap-2 pt-2 border-t border-slate-200/80 dark:border-white/[0.06] text-xs text-emerald-700 dark:text-emerald-400">
                          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{msg.structured.safetyNote}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {isResponding && (
              <div className="flex flex-col items-start">
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 mb-1">
                  InfraVoice · Analyzing workspace evidence...
                </div>
                <div className="w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#090B0E] p-4 space-y-2 animate-pulse">
                  <div className="h-3.5 w-3/4 rounded bg-slate-200 dark:bg-white/[0.08]" />
                  <div className="h-3 w-1/2 rounded bg-slate-200/70 dark:bg-white/[0.05]" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Voice Capture Preview Banner (when Mic toggled) */}
          {voiceListening && (
            <div className="mx-4 mb-2 px-3.5 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex items-end gap-0.5 h-4" aria-hidden="true">
                  <span className="w-1 bg-emerald-400 rounded-full h-2 animate-bounce" />
                  <span className="w-1 bg-emerald-400 rounded-full h-4 animate-bounce [animation-delay:120ms]" />
                  <span className="w-1 bg-emerald-400 rounded-full h-2.5 animate-bounce [animation-delay:240ms]" />
                  <span className="w-1 bg-emerald-400 rounded-full h-3.5 animate-bounce [animation-delay:80ms]" />
                </div>
                <div className="text-xs">
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">
                    Voice input preview active
                  </span>
                  <span className="text-slate-600 dark:text-zinc-400 ml-1.5">
                    — Live audio capture & Speech-to-Text will connect in Phase 2.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => sendMessage('Why is my Kubernetes deployment failing?')}
                  className="px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-600 text-white hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
                >
                  Simulate Voice Query
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceListening(false)}
                  className="px-2 py-1 rounded text-[11px] font-medium text-slate-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/[0.06] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Input Composer */}
          <form
            onSubmit={handleSubmit}
            className="p-3.5 border-t border-slate-200 dark:border-white/[0.06] flex items-center gap-2"
          >
            <button
              type="button"
              onClick={() => setVoiceListening((v) => !v)}
              aria-label={voiceListening ? 'Stop voice preview' : 'Start voice input preview'}
              aria-pressed={voiceListening}
              title="Voice input (UI preview)"
              className={`p-2.5 rounded-lg border transition-colors shrink-0 cursor-pointer ${
                voiceListening
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
                  : 'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.05]'
              }`}
            >
              {voiceListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask about pod crashes, deployment risks, IAM policies, or cluster costs..."
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

        {/* Right: Evidence Panel Placeholder */}
        <Surface className="lg:col-span-4 p-4 space-y-4">
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200 dark:border-white/[0.06]">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                Evidence Context
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                Simulated cluster events & scan rules linked to this thread.
              </p>
            </div>
            <MessageSquareCode className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" aria-hidden="true" />
          </div>

          <div className="space-y-3">
            {activeEvidence.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E] space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  {item.severity ? (
                    <SeverityLabel severity={item.severity} />
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-zinc-400">
                      <Info className="w-3.5 h-3.5" />
                      <span>Metric</span>
                    </span>
                  )}
                  <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-zinc-500">
                    {item.timestamp}
                  </span>
                </div>

                <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">
                  {item.title}
                </div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 truncate">
                  {item.source}
                </div>
                <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between gap-2 text-xs">
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
