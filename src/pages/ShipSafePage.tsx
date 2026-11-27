import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileCode2,
  Play,
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
import { DEMO_VULNERABLE_BUNDLE } from '../lib/shipsafe/demo-bundle';
import {
  MAX_FILE_COUNT,
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_SIZE_BYTES,
} from '../lib/shipsafe/file-detector';
import type {
  ShipSafeCategory,
  ShipSafeFinding,
  ShipSafeScanResult,
  ShipSafeSeverity,
} from '../lib/shipsafe/types';

interface StagedUploadFile {
  id: string;
  fileName: string;
  sizeBytes: number;
  hintFormat: string;
  fileObj: File;
}

const CATEGORY_LABELS: Record<'all' | ShipSafeCategory, string> = {
  all: 'All Categories',
  container: 'Container',
  kubernetes: 'Kubernetes',
  compose: 'Compose',
  terraform: 'Terraform',
  cicd: 'CI/CD',
  secrets: 'Secrets',
};

function inferFormatHint(name: string): string {
  const lower = name.toLowerCase();
  const base = lower.split('/').pop() || lower;
  if (base === 'dockerfile' || base.startsWith('dockerfile.') || base.endsWith('.dockerfile')) {
    return 'Dockerfile';
  }
  if (base === '.dockerignore' || base.endsWith('.dockerignore')) {
    return '.dockerignore';
  }
  if (base.endsWith('.tf')) return 'Terraform';
  if (lower.includes('.github/workflows/')) return 'GitHub Actions';
  if (base.endsWith('.yaml') || base.endsWith('.yml')) return 'YAML (auto-classified on scan)';
  return 'Unsupported';
}

function isSupportedNameClient(name: string): boolean {
  const lower = name.toLowerCase();
  const base = lower.split('/').pop() || lower;
  return (
    base === 'dockerfile' ||
    base.startsWith('dockerfile.') ||
    base.endsWith('.dockerfile') ||
    base === '.dockerignore' ||
    base.endsWith('.dockerignore') ||
    base.endsWith('.tf') ||
    base.endsWith('.yaml') ||
    base.endsWith('.yml')
  );
}

export function ShipSafePage() {
  const { shipSafeInitialSeverity, setShipSafeInitialSeverity, showToast } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stagedFiles, setStagedFiles] = useState<StagedUploadFile[]>([]);
  const [scanResult, setScanResult] = useState<ShipSafeScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [selectedSeverity, setSelectedSeverity] = useState<'all' | ShipSafeSeverity>(
    shipSafeInitialSeverity
  );
  const [selectedCategory, setSelectedCategory] = useState<'all' | ShipSafeCategory>('all');
  const [selectedFileFilter, setSelectedFileFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFindingIds, setExpandedFindingIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSelectedSeverity(shipSafeInitialSeverity);
  }, [shipSafeInitialSeverity]);

  const handleSeverityChange = (sev: 'all' | ShipSafeSeverity) => {
    setSelectedSeverity(sev);
    setShipSafeInitialSeverity(sev);
  };

  const addBrowserFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setScanError(null);

    const incoming: StagedUploadFile[] = [];
    const errors: string[] = [];

    for (const file of Array.from(fileList)) {
      const displayName = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (!isSupportedNameClient(displayName)) {
        errors.push(`Unsupported file type: "${file.name}"`);
        continue;
      }
      if (file.size === 0) {
        errors.push(`"${file.name}" is empty (0 bytes).`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`"${file.name}" exceeds the 1 MB individual file limit.`);
        continue;
      }

      incoming.push({
        id: `${displayName}-${file.size}-${file.lastModified}`,
        fileName: displayName,
        sizeBytes: file.size,
        hintFormat: inferFormatHint(displayName),
        fileObj: file,
      });
    }

    if (errors.length > 0) {
      setScanError(errors[0]);
    }

    if (incoming.length > 0) {
      setStagedFiles((prev) => {
        const incomingNames = new Set(incoming.map((i) => i.fileName));
        const merged = [...prev.filter((p) => !incomingNames.has(p.fileName)), ...incoming];
        if (merged.length > MAX_FILE_COUNT) {
          setScanError(`Maximum ${MAX_FILE_COUNT} files allowed per scan.`);
          return merged.slice(0, MAX_FILE_COUNT);
        }
        const totalSize = merged.reduce((sum, f) => sum + f.sizeBytes, 0);
        if (totalSize > MAX_TOTAL_SIZE_BYTES) {
          setScanError('Combined file size exceeds 5 MB limit.');
          return prev;
        }
        return merged;
      });
      showToast(`Staged ${incoming.length} file${incoming.length === 1 ? '' : 's'}`);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    addBrowserFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
    setScanError(null);
  };

  const clearAllFiles = () => {
    setStagedFiles([]);
    setScanResult(null);
    setScanError(null);
    setSelectedFileFilter('all');
    setExpandedFindingIds({});
  };

  const executeScan = async (filesToScan: StagedUploadFile[]) => {
    if (isScanning) return;
    if (filesToScan.length === 0) {
      setScanError('Select or drop at least one infrastructure file before scanning.');
      return;
    }

    setScanError(null);
    setIsScanning(true);

    try {
      const formData = new FormData();
      for (const item of filesToScan) {
        formData.append('files', item.fileObj, item.fileName);
      }

      const response = await fetch('/api/shipsafe/scan', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        setScanError(payload?.error || 'Scan failed due to validation or server error.');
        setIsScanning(false);
        return;
      }

      const result = payload as ShipSafeScanResult;
      setScanResult(result);
      setSelectedFileFilter('all');
      // Auto-expand the first critical/high finding for immediate clarity
      const firstTop = result.findings[0];
      setExpandedFindingIds(firstTop ? { [firstTop.id]: true } : {});
      showToast(
        `Scan complete · Risk Score ${result.riskScore}/100 (${result.totalFindings} finding${result.totalFindings === 1 ? '' : 's'})`
      );
    } catch {
      setScanError('Unable to reach scanner API. Verify the server is running.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleTrySampleScan = async () => {
    if (isScanning) return;
    const sampleStaged: StagedUploadFile[] = DEMO_VULNERABLE_BUNDLE.map((item, idx) => {
      const blob = new Blob([item.content], { type: 'text/plain' });
      const fileObj = new File([blob], item.fileName, { type: 'text/plain' });
      return {
        id: `demo-${idx}-${item.fileName}`,
        fileName: item.fileName,
        sizeBytes: fileObj.size,
        hintFormat: inferFormatHint(item.fileName),
        fileObj,
      };
    });

    setStagedFiles(sampleStaged);
    await executeScan(sampleStaged);
  };

  const handleExportJson = () => {
    if (!scanResult) return;
    const blob = new Blob([JSON.stringify(scanResult, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shipsafe-report-${scanResult.scanId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(`Exported shipsafe-report-${scanResult.scanId}.json`);
  };

  const toggleFinding = (id: string) => {
    setExpandedFindingIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredFindings: ShipSafeFinding[] = useMemo(() => {
    if (!scanResult) return [];
    const q = searchQuery.trim().toLowerCase();
    return scanResult.findings.filter((f) => {
      const sevOk = selectedSeverity === 'all' || f.severity === selectedSeverity;
      const catOk = selectedCategory === 'all' || f.category === selectedCategory;
      const fileOk = selectedFileFilter === 'all' || f.fileName === selectedFileFilter;
      const searchOk =
        !q ||
        f.title.toLowerCase().includes(q) ||
        f.ruleId.toLowerCase().includes(q) ||
        f.fileName.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.evidence.toLowerCase().includes(q);
      return sevOk && catOk && fileOk && searchOk;
    });
  }, [scanResult, selectedSeverity, selectedCategory, selectedFileFilter, searchQuery]);

  const scoreColorClass = useMemo(() => {
    if (!scanResult) return 'text-slate-400';
    if (scanResult.riskScore >= 80) return 'text-red-500';
    if (scanResult.riskScore >= 60) return 'text-red-400';
    if (scanResult.riskScore >= 40) return 'text-amber-500';
    if (scanResult.riskScore >= 20) return 'text-sky-500';
    return 'text-emerald-500';
  }, [scanResult]);

  const scoreBarClass = useMemo(() => {
    if (!scanResult) return 'bg-slate-400';
    if (scanResult.riskScore >= 60) return 'bg-red-500';
    if (scanResult.riskScore >= 40) return 'bg-amber-500';
    if (scanResult.riskScore >= 20) return 'bg-sky-500';
    return 'bg-emerald-500';
  }, [scanResult]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100">
            ShipSafe — Infrastructure Risk Scanner
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1">
            Deterministic static security & reliability checks for Dockerfile, .dockerignore, Kubernetes, Docker Compose, Terraform, and GitHub Actions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTrySampleScan}
            disabled={isScanning}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#0F1216] hover:bg-slate-100 dark:hover:bg-white/[0.05] disabled:opacity-50 text-slate-800 dark:text-zinc-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-emerald-500" />
            <span>Try sample scan</span>
          </button>

          <button
            type="button"
            onClick={() => executeScan(stagedFiles)}
            disabled={isScanning || stagedFiles.length === 0}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isScanning ? 'Scanning files...' : 'Scan Files'}</span>
          </button>
        </div>
      </div>

      {/* Upload & File Staging */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
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
              Drop configuration files here to scan
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Dockerfile · Dockerfile.* · .dockerignore · Kubernetes YAML · Docker Compose · Terraform (.tf) · GitHub Actions
            </p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1 tabular-nums">
              Up to {MAX_FILE_COUNT} files · Max 1 MB per file · Max 5 MB total · Secrets redacted automatically
            </p>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".yaml,.yml,.tf,.dockerfile,.dockerignore,Dockerfile,.env"
              onChange={(e) => {
                addBrowserFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isScanning}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap cursor-pointer"
              >
                Browse Files
              </button>
              <button
                type="button"
                onClick={handleTrySampleScan}
                disabled={isScanning}
                className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/[0.1] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/[0.04] disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                Load Vulnerable Demo Bundle
              </button>
            </div>
          </div>

          {scanError && (
            <div
              role="alert"
              className="mt-3 px-3 py-2 rounded-lg border border-red-500/25 bg-red-500/[0.06] text-xs text-red-600 dark:text-red-400"
            >
              {scanError}
            </div>
          )}
        </Surface>

        {/* Staged Files Queue */}
        <Surface className="lg:col-span-5 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 tabular-nums">
                Upload Queue ({stagedFiles.length}/{MAX_FILE_COUNT})
              </h2>
              {stagedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllFiles}
                  disabled={isScanning}
                  className="text-xs text-slate-500 dark:text-zinc-400 hover:text-red-500 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>

            {stagedFiles.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400 py-8 text-center">
                No files staged yet. Upload local files or click &ldquo;Try sample scan&rdquo; to run deterministic rules on the server.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/[0.06] max-h-52 overflow-y-auto">
                {stagedFiles.map((file) => (
                  <li key={file.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileCode2 className="w-4 h-4 text-slate-400 dark:text-zinc-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-mono font-medium text-slate-900 dark:text-zinc-100 truncate">
                          {file.fileName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
                          {file.hintFormat} · {(file.sizeBytes / 1024).toFixed(2)} KB
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(file.id)}
                      disabled={isScanning}
                      aria-label={`Remove ${file.fileName}`}
                      className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-white/[0.04] disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
            <span>Stateless memory scan · Files never persisted</span>
            <span className="font-mono tabular-nums">
              {(stagedFiles.reduce((s, f) => s + f.sizeBytes, 0) / 1024).toFixed(1)} KB
            </span>
          </div>
        </Surface>
      </div>

      {/* Results Overview */}
      {isScanning && (
        <Surface className="overflow-hidden">
          <TableSkeleton rows={5} />
        </Surface>
      )}

      {!isScanning && !scanResult && (
        <Surface>
          <EmptyState
            icon={ShieldCheck}
            title="Ready to scan your infrastructure"
            description="Upload Dockerfile, Kubernetes, Compose, Terraform, or GitHub Actions files above, or run the sample vulnerable bundle through the server-side rule engine."
            actionLabel="Try sample scan"
            onAction={handleTrySampleScan}
          />
        </Surface>
      )}

      {!isScanning && scanResult && (
        <>
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            <Surface className="lg:col-span-4 p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
                  <span>ShipSafe Risk Score</span>
                  <span className="font-mono">{scanResult.riskLabel}</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-3xl font-mono font-semibold tabular-nums ${scoreColorClass}`}>
                    {scanResult.riskScore}
                  </span>
                  <span className="text-xs font-mono text-slate-500 dark:text-zinc-400">/ 100</span>
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden">
                  <div
                    style={{ width: `${scanResult.riskScore}%` }}
                    className={`h-full transition-all ${scoreBarClass}`}
                  />
                </div>
              </div>
              <p
                title={scanResult.riskFormula}
                className="text-[11px] text-slate-500 dark:text-zinc-400 mt-3 leading-snug"
              >
                {scanResult.overallSummary}
              </p>
            </Surface>

            <Surface className="lg:col-span-8 p-5 flex flex-col justify-between gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div>
                    <div className="text-slate-500 dark:text-zinc-400">Total Findings</div>
                    <div className="text-lg font-mono font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                      {scanResult.totalFindings}
                    </div>
                  </div>
                  <div className="h-8 w-px bg-slate-200 dark:bg-white/[0.08]" />
                  <div>
                    <div className="text-slate-500 dark:text-zinc-400">Files Scanned</div>
                    <div className="text-lg font-mono font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                      {scanResult.fileSummaries.length}
                    </div>
                  </div>
                  <div className="h-8 w-px bg-slate-200 dark:bg-white/[0.08]" />
                  <div>
                    <div className="text-slate-500 dark:text-zinc-400">Scan Duration</div>
                    <div className="text-lg font-mono font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                      {scanResult.scanDurationMs} ms
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportJson}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
              </div>

              {/* Scanned File Summaries */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 border-t border-slate-200 dark:border-white/[0.06]">
                {scanResult.fileSummaries.map((fs) => (
                  <button
                    key={fs.fileName}
                    type="button"
                    onClick={() =>
                      setSelectedFileFilter((prev) =>
                        prev === fs.fileName ? 'all' : fs.fileName
                      )
                    }
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                      selectedFileFilter === fs.fileName
                        ? 'border-emerald-500/40 bg-emerald-500/[0.08]'
                        : 'border-slate-200 dark:border-white/[0.06] bg-slate-50/60 dark:bg-[#090B0E] hover:bg-slate-100 dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-medium text-slate-900 dark:text-zinc-100 truncate">
                        {fs.fileName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
                        {fs.fileType} · {fs.lineCount} lines
                      </div>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-700 dark:text-zinc-300 shrink-0">
                      {fs.findingCount} {fs.findingCount === 1 ? 'issue' : 'issues'}
                    </span>
                  </button>
                ))}
              </div>
            </Surface>
          </div>

          {/* Filter Toolbar + Findings */}
          <Surface className="overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-white/[0.06] space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Category Tabs */}
                <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04]">
                  {(Object.keys(CATEGORY_LABELS) as ('all' | ShipSafeCategory)[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-white dark:bg-[#161B22] text-slate-900 dark:text-zinc-100 shadow-xs'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>

                {/* File Filter + Search */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <select
                    aria-label="Filter by scanned file"
                    value={selectedFileFilter}
                    onChange={(e) => setSelectedFileFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] text-xs font-mono text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="all">All files ({scanResult.fileSummaries.length})</option>
                    {scanResult.fileSummaries.map((f) => (
                      <option key={f.fileName} value={f.fileName}>
                        {f.fileName}
                      </option>
                    ))}
                  </select>

                  <div className="relative w-full sm:w-60">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search rules, titles, evidence..."
                      aria-label="Search scan findings"
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#090B0E] text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Severity Filter Pills */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['all', 'critical', 'high', 'medium', 'low', 'info'] as const).map((sev) => {
                    const count =
                      sev === 'all' ? scanResult.totalFindings : scanResult.severityCounts[sev];
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
                  Showing {filteredFindings.length} of {scanResult.totalFindings} findings
                </span>
              </div>
            </div>

            {scanResult.totalFindings === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="Zero findings detected"
                description="All scanned configuration files passed ShipSafe's deterministic security and reliability rules with a Risk Score of 0/100."
              />
            ) : filteredFindings.length === 0 ? (
              <EmptyState
                icon={ShieldAlert}
                title="No findings match current filters"
                description="Adjust severity, category, file filter, or search text to view findings from this scan."
                actionLabel="Reset filters"
                onAction={() => {
                  setSelectedCategory('all');
                  handleSeverityChange('all');
                  setSelectedFileFilter('all');
                  setSearchQuery('');
                }}
              />
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
                {filteredFindings.map((finding) => {
                  const expanded = Boolean(expandedFindingIds[finding.id]);
                  return (
                    <div key={finding.id} className="p-5 space-y-3">
                      {/* Finding Summary Row */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                            <SeverityLabel severity={finding.severity} />
                            <span aria-hidden="true">·</span>
                            <span className="font-mono font-medium text-slate-700 dark:text-zinc-300">
                              {finding.ruleId}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{finding.fileName}</span>
                            {finding.lineNumber !== null && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">
                                  Line {finding.lineNumber}
                                </span>
                              </>
                            )}
                          </div>
                          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-100">
                            {finding.title}
                          </h3>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleFinding(finding.id)}
                          aria-expanded={expanded}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {expanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                          <span>{expanded ? 'Hide details' : 'Inspect details'}</span>
                        </button>
                      </div>

                      {/* Always-visible concise developer context */}
                      <p className="text-[13px] text-slate-600 dark:text-zinc-300">
                        {finding.description}
                      </p>

                      <div className="text-xs text-slate-500 dark:text-zinc-400">
                        <span className="font-medium text-slate-700 dark:text-zinc-300">
                          Recommendation:
                        </span>{' '}
                        {finding.recommendation}
                      </div>

                      {/* Expanded Detail View */}
                      {expanded && (
                        <div className="pt-3 space-y-3 border-t border-slate-100 dark:border-white/[0.06]">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E]">
                              <div className="font-semibold text-slate-800 dark:text-zinc-200">
                                Why this matters (Impact)
                              </div>
                              <p className="text-slate-600 dark:text-zinc-300 mt-1 leading-relaxed">
                                {finding.impact}
                              </p>
                            </div>
                            <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#090B0E] space-y-1">
                              <div className="font-semibold text-slate-800 dark:text-zinc-200">
                                Rule Metadata
                              </div>
                              <div className="text-slate-500 dark:text-zinc-400 font-mono text-[11px]">
                                Source: {finding.source} · Confidence: {finding.confidence}
                              </div>
                              {finding.references && finding.references.length > 0 && (
                                <div className="text-slate-500 dark:text-zinc-400 text-[11px]">
                                  References: {finding.references.join(', ')}
                                </div>
                              )}
                            </div>
                          </div>

                          <div
                            className={`grid grid-cols-1 ${
                              finding.fixExample ? 'lg:grid-cols-2' : ''
                            } gap-3`}
                          >
                            <CodeBlock
                              code={finding.evidence}
                              label={`Sanitized evidence · ${finding.fileName}${
                                finding.lineNumber ? ` (Line ${finding.lineNumber})` : ''
                              }`}
                              tone="danger"
                            />
                            {finding.fixExample && (
                              <CodeBlock
                                code={finding.fixExample}
                                label="Recommended configuration fix"
                                tone="success"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Surface>
        </>
      )}
    </div>
  );
}
