import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileCode2,
  MessageSquareCode,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { CodeBlock } from '../components/ui/CodeBlock';
import { SeverityLabel } from '../components/ui/SeverityLabel';
import { EmptyState, TableSkeleton } from '../components/ui/States';
import { Surface } from '../components/ui/Surface';
import { useApp } from '../context/AppContext';
import {
  analyzeConfigFiles,
  INITIAL_SCAN_FINDINGS,
  SAMPLE_CONFIG_PRESETS,
} from '../data/mockData';
import type { RiskCategory, ScanFinding, Severity, UploadedConfigFile } from '../types/infravoice';

const CATEGORY_LABELS: Record<'all' | RiskCategory, string> = {
  all: 'All Categories',
  container: 'Container Security',
  kubernetes: 'Kubernetes Config',
  iam: 'IAM & Secrets',
  cicd: 'CI/CD Pipeline',
};

function detectFormat(fileName: string): UploadedConfigFile['format'] {
  const lower = fileName.toLowerCase();
  if (lower.includes('dockerfile')) return 'Dockerfile';
  if (lower.endsWith('.tf') || lower.endsWith('.hcl')) return 'Terraform';
  if (lower.includes('workflow') || lower.includes('deploy')) return 'GitHub Actions';
  return 'YAML';
}

export function ShipSafePage() {
  const { shipSafeInitialSeverity, setShipSafeInitialSeverity, askInfraVoice, showToast } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [queuedFiles, setQueuedFiles] = useState<UploadedConfigFile[]>([
    SAMPLE_CONFIG_PRESETS.kubernetes,
    SAMPLE_CONFIG_PRESETS.dockerfile,
    SAMPLE_CONFIG_PRESETS.terraform,
  ]);
  const [findings, setFindings] = useState<ScanFinding[]>(INITIAL_SCAN_FINDINGS);
  const [isScanning, setIsScanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'all' | RiskCategory>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<'all' | Severity>(shipSafeInitialSeverity);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastScannedLabel, setLastScannedLabel] = useState('Baseline preview results (3 files)');

  useEffect(() => {
    setSelectedSeverity(shipSafeInitialSeverity);
  }, [shipSafeInitialSeverity]);

  const handleSeverityChange = (sev: 'all' | Severity) => {
    setSelectedSeverity(sev);
    setShipSafeInitialSeverity(sev);
  };

  const readBrowserFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);

    const allowedExtensions = ['.yaml', '.yml', '.tf', '.hcl', '.dockerfile', '.json'];
    const added: UploadedConfigFile[] = [];

    for (const file of Array.from(fileList)) {
      const lower = file.name.toLowerCase();
      const isAllowed =
        lower === 'dockerfile' ||
        lower.startsWith('dockerfile.') ||
        allowedExtensions.some((ext) => lower.endsWith(ext));

      if (!isAllowed) {
        setUploadError(
          `Unsupported file "${file.name}". Please upload Dockerfile, YAML, Terraform (.tf), or GitHub Actions workflow files.`
        );
        continue;
      }

      const text = await file.text();
      added.push({
        id: `file-${Date.now()}-${file.name}`,
        name: file.name,
        format: detectFormat(file.name),
        sizeBytes: file.size,
        content: text,
      });
    }

    if (added.length > 0) {
      setQueuedFiles((prev) => {
        const existingNames = new Set(added.map((a) => a.name));
        return [...prev.filter((p) => !existingNames.has(p.name)), ...added];
      });
      showToast(`Added ${added.length} configuration file${added.length > 1 ? 's' : ''}`);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    await readBrowserFiles(e.dataTransfer.files);
  };

  const loadSample = (key: keyof typeof SAMPLE_CONFIG_PRESETS) => {
    setUploadError(null);
    const sample = SAMPLE_CONFIG_PRESETS[key];
    setQueuedFiles((prev) => {
      if (prev.some((f) => f.id === sample.id)) return prev;
      return [...prev, sample];
    });
    showToast(`Loaded ${sample.name}`);
  };

  const removeFile = (id: string) => {
    setQueuedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const runScan = () => {
    if (queuedFiles.length === 0) {
      setUploadError('Add at least one configuration file before running a scan.');
      return;
    }
    setUploadError(null);
    setIsScanning(true);

    window.setTimeout(() => {
      const results = analyzeConfigFiles(queuedFiles);
      setFindings(results);
      setIsScanning(false);
      setLastScannedLabel(
        `Scanned ${queuedFiles.length} file${queuedFiles.length > 1 ? 's' : ''} locally (Phase 1A static preview)`
      );
      showToast(`Scan complete · ${results.length} finding${results.length === 1 ? '' : 's'} surfaced`);
    }, 650);
  };

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      const catMatch = selectedCategory === 'all' || f.category === selectedCategory;
      const sevMatch = selectedSeverity === 'all' || f.severity === selectedSeverity;
      const q = searchQuery.trim().toLowerCase();
      const qMatch =
        !q ||
        f.title.toLowerCase().includes(q) ||
        f.fileName.toLowerCase().includes(q) ||
        f.ruleId.toLowerCase().includes(q) ||
        f.explanation.toLowerCase().includes(q);
      return catMatch && sevMatch && qMatch;
    });
  }, [findings, selectedCategory, selectedSeverity, searchQuery]);

  const severityCounts = useMemo(() => {
    return {
      critical: findings.filter((f) => f.severity === 'critical').length,
      high: findings.filter((f) => f.severity === 'high').length,
      medium: findings.filter((f) => f.severity === 'medium').length,
      low: findings.filter((f) => f.severity === 'low').length,
    };
  }, [findings]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100">
            ShipSafe — Deployment Security Scanner
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1">
            Inspect Dockerfiles, Kubernetes YAML, Terraform, and GitHub Actions workflows before shipping.
          </p>
        </div>

        <button
          type="button"
          onClick={runScan}
          disabled={isScanning}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>{isScanning ? 'Scanning files...' : 'Run Security Scan'}</span>
        </button>
      </div>

      {/* Upload & File Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Dropzone */}
        <Surface className="lg:col-span-7 p-5 flex flex-col justify-between">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-xl border border-dashed p-6 text-center transition-colors ${
              isDragging
                ? 'border-emerald-500 bg-emerald-500/[0.06]'
                : 'border-slate-300 dark:border-white/[0.14] bg-slate-50/70 dark:bg-[#090B0E]'
            }`}
          >
            <div className="w-10 h-10 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0F1216] flex items-center justify-center mx-auto mb-3">
              <Upload className="w-4 h-4 text-emerald-500" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">
              Drop infrastructure configuration files here
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Supports Dockerfile · Kubernetes YAML · Terraform (.tf) · GitHub Actions (.yml)
            </p>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".yaml,.yml,.tf,.hcl,.dockerfile,Dockerfile,.json"
              onChange={(e) => readBrowserFiles(e.target.files)}
              className="hidden"
            />

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity whitespace-nowrap cursor-pointer"
              >
                Browse Local Files
              </button>
              <button
                type="button"
                onClick={() => loadSample('workflow')}
                className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/[0.1] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors whitespace-nowrap cursor-pointer"
              >
                + Sample Workflow
              </button>
              <button
                type="button"
                onClick={() => loadSample('terraform')}
                className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/[0.1] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors whitespace-nowrap cursor-pointer"
              >
                + Sample Terraform
              </button>
            </div>
          </div>

          {uploadError && (
            <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400">
              {uploadError}
            </p>
          )}
        </Surface>

        {/* Queued Files List */}
        <Surface className="lg:col-span-5 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                Staged Files ({queuedFiles.length})
              </h2>
              {queuedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQueuedFiles([]);
                    setFindings([]);
                    setLastScannedLabel('Queue cleared');
                  }}
                  className="text-xs text-slate-500 dark:text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>

            {queuedFiles.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400 py-8 text-center">
                No files staged. Browse local files or load a sample preset to run ShipSafe checks.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/[0.06] max-h-48 overflow-y-auto">
                {queuedFiles.map((file) => (
                  <li key={file.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileCode2 className="w-4 h-4 text-slate-400 dark:text-zinc-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-mono font-medium text-slate-900 dark:text-zinc-100 truncate">
                          {file.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
                          {file.format} · {(file.sizeBytes / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(file.id)}
                      aria-label={`Remove ${file.name}`}
                      className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-white/[0.04] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-white/[0.06] text-[11px] text-slate-500 dark:text-zinc-400">
            {lastScannedLabel}
          </div>
        </Surface>
      </div>

      {/* Filters & Results */}
      <Surface className="overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-white/[0.06] space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Risk Category Tabs */}
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04]">
              {(Object.keys(CATEGORY_LABELS) as ('all' | RiskCategory)[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-white dark:bg-[#161B22] text-slate-900 dark:text-zinc-100 shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full lg:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter findings or files..."
                aria-label="Filter scan findings"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Severity Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => {
                const count =
                  sev === 'all' ? findings.length : severityCounts[sev];
                const active = selectedSeverity === sev;
                return (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => handleSeverityChange(sev)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize border transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {sev} <span className="font-mono tabular-nums opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>

            <span className="text-xs text-slate-500 dark:text-zinc-400 tabular-nums">
              Showing {filteredFindings.length} of {findings.length} findings
            </span>
          </div>
        </div>

        {/* Findings List */}
        {isScanning ? (
          <TableSkeleton rows={4} />
        ) : filteredFindings.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="No findings match the current filter"
            description="Adjust severity or category filters, or stage configuration files and run a fresh ShipSafe scan."
            actionLabel="Reset filters"
            onAction={() => {
              setSelectedCategory('all');
              handleSeverityChange('all');
              setSearchQuery('');
              if (findings.length === 0) {
                setFindings(INITIAL_SCAN_FINDINGS);
                setQueuedFiles([
                  SAMPLE_CONFIG_PRESETS.kubernetes,
                  SAMPLE_CONFIG_PRESETS.dockerfile,
                  SAMPLE_CONFIG_PRESETS.terraform,
                ]);
              }
            }}
          />
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
            {filteredFindings.map((finding) => (
              <div key={finding.id} className="p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                      <SeverityLabel severity={finding.severity} />
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{finding.ruleId}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-700 dark:text-zinc-300">
                        {finding.fileName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{finding.lineRange}</span>
                    </div>
                    <h3 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-100">
                      {finding.title}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      askInfraVoice(
                        `Analyze ShipSafe finding ${finding.ruleId} (${finding.title}) in ${finding.fileName} and explain how to remediate it safely.`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <MessageSquareCode className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Ask InfraVoice</span>
                  </button>
                </div>

                <div className="text-[13px] text-slate-600 dark:text-zinc-300 space-y-1">
                  <p>{finding.explanation}</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    <span className="font-medium text-slate-700 dark:text-zinc-300">Impact:</span>{' '}
                    {finding.impact}
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <CodeBlock
                    code={finding.snippet}
                    label={`${finding.fileName} (${finding.lineRange})`}
                    tone="danger"
                  />
                  <CodeBlock
                    code={finding.remediation}
                    label="Recommended remediation"
                    tone="success"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Surface>
    </div>
  );
}
