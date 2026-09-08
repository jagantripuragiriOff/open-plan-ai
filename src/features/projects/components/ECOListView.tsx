import { useEffect, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  GitMerge, GitBranch, Clock, ClipboardCheck,
  Boxes, Calendar, ChevronLeft, ChevronRight, CheckCircle, Download, Loader2, Plus, Upload,
} from 'lucide-react';
import { ImportEcoDialog } from '@/features/eco-import/ImportEcoDialog';
import {
  ECOListItem, MAIN_STATUSES, ECO_TYPE_LABEL, REASON_LABEL,
  MODULE_COLORS,
  statusMeta, priorityMeta, changeClassMeta, effectivityText,
  buildDetail, fromApiEcoListItem, fromApiEcoDetail,
} from './ecoData';
import { ECOAvatar, StatusPill } from './ECOShared';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  useECOList, useECOStats, useECODetail,
  useExportEcoSummaryCsv, useExportEcoDetailedCsv, fetchAllEcoIds,
} from '@/hooks/useECOs';
import { downloadEcoCsv } from '@/features/reports/utils/exportUtils';

const ECO_PAGE_SIZE = 10;

// ── KPI stat card ─────────────────────────────────────────────────────────────

function softTint(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function StatCard({
  label, value, icon: Icon, iconColor, accent,
}: {
  label: string; value: number;
  icon: React.ElementType; iconColor: string; accent?: boolean;
}) {
  return (
    <div className={cn(
      'bg-card border rounded-lg px-3.5 py-2.5 flex-1 min-w-[140px] flex items-center gap-2.5',
      accent ? 'border-blue-500/25' : 'border-border',
    )}>
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: softTint(iconColor, 0.12) }}
      >
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-bold leading-tight truncate" style={{ color: accent ? iconColor : undefined }}>
          {value}
        </span>
        <span className="block text-[11px] text-muted-foreground truncate">{label}</span>
      </span>
    </div>
  );
}

// ── Skeleton components ───────────────────────────────────────────────────────

function SkeletonStatCard() {
  return (
    <div className="bg-card border border-border rounded-lg p-2.5 flex-1 min-w-[140px] flex items-center gap-2.5 animate-pulse">
      <div className="w-8 h-8 rounded-lg bg-muted shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="h-4 rounded bg-muted w-10 mb-1.5" />
        <div className="h-2.5 rounded bg-muted w-20" />
      </div>
    </div>
  );
}

function SkeletonECORow() {
  return (
    <div className="px-3.5 py-3 rounded-lg border border-border animate-pulse">
      <div className="flex justify-between items-start gap-2 mb-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-3.5 rounded bg-muted w-24" />
            <div className="h-5 rounded-full bg-muted w-16" />
            <div className="h-3 rounded bg-muted w-20" />
          </div>
          <div className="h-4 rounded bg-muted w-3/4" />
        </div>
        <div className="h-5 rounded-full bg-muted w-20 shrink-0" />
      </div>
      <div className="flex gap-4 items-center">
        <div className="h-3 rounded bg-muted w-24" />
        <div className="h-3 rounded bg-muted w-16" />
        <div className="h-3 rounded bg-muted w-20" />
      </div>
    </div>
  );
}

function SkeletonPreviewPanel() {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="h-4 rounded bg-muted w-24 animate-pulse" />
        <div className="h-5 rounded-full bg-muted w-16 animate-pulse" />
      </div>
      <div className="p-4 flex flex-col gap-4 animate-pulse">
        <div>
          <div className="h-5 rounded bg-muted w-3/4 mb-2" />
          <div className="h-3 rounded bg-muted w-full mb-1.5" />
          <div className="h-3 rounded bg-muted w-5/6" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[80, 72, 64, 52].map(w => <div key={w} className="h-5 rounded-full bg-muted" style={{ width: w }} />)}
        </div>
        <div className="h-px bg-border" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i}>
              <div className="h-2.5 rounded bg-muted w-12 mb-1.5" />
              <div className="h-3.5 rounded bg-muted w-20" />
            </div>
          ))}
        </div>
        <div>
          <div className="h-2.5 rounded bg-muted w-32 mb-3" />
          <div className="flex flex-col gap-2.5">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-[22px] h-[22px] rounded-full bg-muted shrink-0" />
                <div className="flex-1">
                  <div className="h-3 rounded bg-muted w-24 mb-1" />
                  <div className="h-2.5 rounded bg-muted w-16" />
                </div>
                <div className="h-3.5 w-3.5 rounded-full bg-muted shrink-0" />
              </div>
            ))}
          </div>
        </div>
        <div className="h-10 rounded-md bg-muted w-full" />
      </div>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border border-border rounded-lg px-5 py-2.5 text-[13px] font-medium text-foreground shadow-xl z-[300] flex items-center gap-2">
      <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#16A34A' }} />
      {message}
    </div>
  );
}

// ── List row ──────────────────────────────────────────────────────────────────

function ECORow({
  eco, selected, onSelect, onOpen, isMobile,
}: {
  eco: ECOListItem; selected: boolean;
  onSelect: () => void; onOpen: () => void; isMobile: boolean;
}) {
  const sm = statusMeta(eco.status);
  const pm = priorityMeta(eco.priority);

  return (
    <div
      onClick={isMobile ? onOpen : onSelect}
      onDoubleClick={isMobile ? undefined : onOpen}
      className={cn(
        'px-3.5 py-3 rounded-lg border cursor-pointer transition-all',
        selected
          ? 'border-blue-500/50 bg-blue-500/5'
          : 'border-border hover:bg-accent/30',
      )}
    >
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[12px] font-mono font-semibold text-blue-500 whitespace-nowrap">
              {eco.num}
            </span>
            <StatusPill meta={pm} />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {ECO_TYPE_LABEL[eco.type]}
            </span>
            {eco.awaitingMe && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                style={{ background: '#DC262618', color: '#DC2626', border: '1px solid #DC262640' }}
              >
                <ClipboardCheck className="w-2.5 h-2.5" />
                Awaiting your action
              </span>
            )}
          </div>
          <div className="text-[14px] font-medium text-foreground truncate">{eco.title}</div>
        </div>
        <StatusPill meta={sm} />
      </div>
      <div className="flex gap-3 items-center text-[11px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5">
          <ECOAvatar name={eco.owner} size={16} />
          {eco.owner}
        </span>
        <span className="flex items-center gap-1">
          <Boxes className="w-3 h-3" />
          {eco.parts} parts
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {eco.created}
        </span>
        {eco.revFrom && eco.revTo && (
          <span className="font-mono text-muted-foreground/70">Rev {eco.revFrom}→{eco.revTo}</span>
        )}
      </div>
    </div>
  );
}

// ── Preview panel ─────────────────────────────────────────────────────────────

function PreviewPanel({ projectId, eco, onOpen }: { projectId: string; eco: ECOListItem; onOpen: () => void }) {
  const sm = statusMeta(eco.status);
  const pm = priorityMeta(eco.priority);
  const cm = changeClassMeta(eco.changeClass);
  const { data: liveRaw } = useECODetail(projectId, eco.id);
  const detail = liveRaw ? fromApiEcoDetail(liveRaw) : buildDetail(eco);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-[13px] font-mono font-semibold text-blue-500">{eco.num}</span>
        <StatusPill meta={sm} />
      </div>

      <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">
        <div>
          <div className="text-[15px] font-semibold text-foreground mb-1.5">{eco.title}</div>
          <div className="text-[12px] text-muted-foreground leading-relaxed">{eco.desc}</div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <StatusPill meta={pm} />
          <StatusPill meta={cm} />
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted/60 text-muted-foreground border border-border">
            {ECO_TYPE_LABEL[eco.type]}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted/60 text-muted-foreground border border-border">
            {REASON_LABEL[eco.reason]}
          </span>
        </div>

        <div className="h-px bg-border" />

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {([
            ['Owner', eco.owner],
            ['Originator', eco.originator],
            ['Effectivity', effectivityText(eco.effectivity)],
            ['ECO Rev', eco.revFrom && eco.revTo ? `${eco.revFrom} → ${eco.revTo}` : '—'],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k}>
              <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 mb-0.5">{k}</div>
              <div className="text-[12px] font-medium text-foreground">{v}</div>
            </div>
          ))}
        </div>

        {eco.modules.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
              Affected Modules
            </div>
            <div className="flex flex-wrap gap-1.5">
              {eco.modules.map(m => (
                <span
                  key={m}
                  className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{
                    background: (MODULE_COLORS[m] ?? '#6B7280') + '22',
                    color: MODULE_COLORS[m] ?? '#6B7280',
                  }}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">
            Approval Pipeline
          </div>
          <div className="flex flex-col gap-2.5">
            {detail.steps.map((p) => {
              const done   = p.decision === 'APPROVED';
              const active = p.decision === 'ACTIVE';
              const rej    = p.decision === 'REJECTED';
              return (
                <div key={p.order} className="flex items-center gap-2.5">
                  <ECOAvatar name={p.name} size={22} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-foreground truncate">{p.stage}</div>
                    <div className="text-[10px] text-muted-foreground">{p.name}</div>
                  </div>
                  {done
                    ? <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#16A34A' }} />
                    : rej
                    ? <span className="w-3.5 h-3.5 rounded-full bg-red-500/20 border border-red-500/40 shrink-0" />
                    : active
                    ? <Clock className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                    : <span className="w-3 h-3 rounded-full border border-muted-foreground/30 shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={onOpen}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-md text-[13px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
        >
          Open Change Order <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── ECOListView ───────────────────────────────────────────────────────────────

export function ECOListView({
  projectId,
  onOpen,
  onNewEco,
}: {
  projectId: string;
  onOpen: (eco: ECOListItem) => void;
  onNewEco?: () => void;
}) {
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fStatus, setFStatus]     = useState<string>('ALL');
  const [fPriority, setFPriority] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2600); };
  const [importOpen, setImportOpen] = useState(false);

  const exportDetailedCsv = useExportEcoDetailedCsv(projectId);
  const exportSummaryCsv = useExportEcoSummaryCsv(projectId);
  const [exportingAll, setExportingAll] = useState(false);
  const exporting = exportDetailedCsv.isPending || exportSummaryCsv.isPending || exportingAll;

  const apiFilters: Record<string, string> = {};
  if (fStatus   !== 'ALL') apiFilters.status   = fStatus.toLowerCase();
  if (fPriority !== 'ALL') apiFilters.priority = fPriority.toLowerCase();

  const { data: listData, isLoading: listLoading } = useECOList(projectId, {
    ...apiFilters,
    page: String(page),
    limit: String(ECO_PAGE_SIZE),
  });
  const { data: stats, isLoading: statsLoading }   = useECOStats(projectId);

  const list: ECOListItem[] = (listData?.data ?? []).map(fromApiEcoListItem);
  const total = listData?.meta?.total ?? 0;
  const totalPages = Math.max(1, listData?.meta?.totalPages ?? 1);
  const isTrulyEmpty = !listLoading && !statsLoading && total === 0 && fStatus === 'ALL' && fPriority === 'ALL';

  const effectiveSelectedId = selectedId ?? list[0]?.id ?? null;
  const selected = list.find(e => e.id === effectiveSelectedId) ?? list[0] ?? null;

  useEffect(() => {
    if (listData && page > totalPages) setPage(totalPages);
  }, [listData, page, totalPages]);

  const changeFilter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const handleExport = async (format: 'summary' | 'detailed') => {
    if (total === 0) return;
    try {
      setExportingAll(true);
      const ids = await fetchAllEcoIds(projectId, apiFilters);
      const blob = await (format === 'summary' ? exportSummaryCsv : exportDetailedCsv).mutateAsync(ids);
      downloadEcoCsv(blob, format, ids.length);
      flash(`Exported ${ids.length} change order(s)`);
    } catch {
      flash('Failed to export');
    } finally {
      setExportingAll(false);
    }
  };

  const Sel = ({
    value, onChange, opts, allLabel,
  }: {
    value: string; onChange: (v: string) => void; opts: string[]; allLabel: string;
  }) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-7 shrink-0 bg-card border border-border rounded-md text-foreground text-[12px] px-2.5 outline-none cursor-pointer font-[inherit] appearance-none"
    >
      <option value="ALL">{allLabel}</option>
      {opts.map(o => (
        <option key={o} value={o} className="bg-card">
          {(o.charAt(0) + o.slice(1).toLowerCase()).replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  );

  if (isTrulyEmpty) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mb-6 border border-border shadow-sm">
          <GitMerge className="w-8 h-8 text-muted-foreground/80" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No change orders yet</h3>
        <p className="text-[13px] text-muted-foreground max-w-[360px] mb-8 leading-relaxed">
          Create your first Engineering Change Order to start tracking part updates, revisions, and approval workflows.
        </p>
        <div className="flex items-center gap-2.5">
          {onNewEco && (
            <button
              onClick={onNewEco}
              className="flex items-center gap-2 px-5 py-2.5 rounded-md text-[13px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Change Order
            </button>
          )}
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-md text-[13px] font-semibold bg-card text-foreground border border-border hover:bg-accent/50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import with AI
          </button>
        </div>
        {importOpen && (
          <ImportEcoDialog open={importOpen} onClose={() => setImportOpen(false)} projectId={projectId} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden text-foreground">
      {/* KPI cards */}
      <div className="shrink-0 px-4 md:px-6 pt-4 pb-3">
        <div className="flex gap-2.5 md:gap-3 flex-wrap">
          {statsLoading ? (
            <>
              <SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard />
            </>
          ) : (
            <>
              <StatCard label="Open ECOs"           value={stats?.openEcos ?? 0}           icon={GitMerge}       iconColor="#2563EB" accent />
              <StatCard label="In Review"           value={stats?.inReview ?? 0}           icon={Clock}          iconColor="#F59E0B" />
              <StatCard label="Awaiting My Action"  value={stats?.awaitingMyAction ?? 0}   icon={ClipboardCheck} iconColor="#DC2626" />
              <StatCard label="Released This Month" value={stats?.releasedThisMonth ?? 0}  icon={GitBranch}      iconColor="#16A34A" />
            </>
          )}
        </div>
      </div>

      {/* List + preview */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4 items-start">
          {/* Left: list */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 px-4 py-3 border-b border-border">
              <span className="text-[13px] font-semibold shrink-0">
                Change Orders{' '}
                <span className="font-normal text-muted-foreground">
                  · {listLoading ? '…' : total}
                </span>
              </span>
              <div className="flex items-center justify-end gap-2">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar min-w-0">
                  <Sel value={fStatus}   onChange={changeFilter(setFStatus)}   opts={MAIN_STATUSES}                          allLabel="All statuses" />
                  <Sel value={fPriority} onChange={changeFilter(setFPriority)} opts={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']} allLabel="All priorities" />
                  <div className="relative h-7 shrink-0">
                    <select
                      value=""
                      onChange={e => {
                        const v = e.target.value;
                        e.target.value = '';
                        if (v === 'summary' || v === 'detailed') void handleExport(v);
                      }}
                      disabled={total === 0 || exporting}
                      title="Export the ECO list"
                      aria-label="Export the ECO list"
                      className="h-7 pl-7 pr-2.5 rounded-md text-[12px] font-medium bg-card text-foreground border border-border hover:bg-accent/50 transition-colors font-[inherit] outline-none cursor-pointer appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="" disabled>Export</option>
                      <option value="summary">Importable list (CSV)</option>
                      <option value="detailed">Detailed report (CSV)</option>
                    </select>
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2">
                      {exporting
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Download className="w-3.5 h-3.5" />}
                    </span>
                  </div>
                  <button
                    onClick={() => setImportOpen(true)}
                    title="Import engineering changes with AI"
                    className="h-7 shrink-0 flex items-center gap-1.5 px-2.5 rounded-md text-[12px] font-medium bg-card text-foreground border border-border hover:bg-accent/50 transition-colors font-[inherit]"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import
                  </button>
                </div>
                {isMobile && onNewEco && (
                  <button
                    onClick={onNewEco}
                    title="New ECO"
                    aria-label="New ECO"
                    className="h-7 w-7 flex items-center justify-center rounded-md bg-foreground text-background hover:opacity-90 transition-opacity shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="p-2.5 flex flex-col gap-2">
              {listLoading ? (
                [0, 1, 2, 3, 4].map(i => <SkeletonECORow key={i} />)
              ) : list.length > 0 ? (
                list.map(eco => (
                  <ECORow
                    key={eco.id}
                    eco={eco}
                    selected={effectiveSelectedId === eco.id}
                    onSelect={() => setSelectedId(eco.id)}
                    onOpen={() => onOpen(eco)}
                    isMobile={isMobile}
                  />
                ))
              ) : (
                <div className="py-10 text-center text-[12px] text-muted-foreground">
                  No change orders match these filters.
                </div>
              )}
            </div>
            {!listLoading && total > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-border gap-3 flex-wrap">
                <span className="text-[11px] text-muted-foreground">
                  Showing {(page - 1) * ECO_PAGE_SIZE + 1}
                  –{Math.min(page * ECO_PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-border bg-card text-foreground hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] text-muted-foreground px-1 tabular-nums">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-border bg-card text-foreground hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: preview (desktop only) */}
          {!isMobile && (
            listLoading ? (
              <SkeletonPreviewPanel />
            ) : selected ? (
              <PreviewPanel projectId={projectId} eco={selected} onOpen={() => onOpen(selected)} />
            ) : (
              <div className="bg-card border border-border rounded-lg p-8 text-center text-[12px] text-muted-foreground">
                Select a change order to preview
              </div>
            )
          )}
        </div>
      </div>

      {toast && <Toast message={toast} />}
      {importOpen && (
        <ImportEcoDialog open={importOpen} onClose={() => setImportOpen(false)} projectId={projectId} />
      )}
    </div>
  );
}
