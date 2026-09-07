import { useState, Fragment } from 'react';
import * as LucideIcons from 'lucide-react';
import {
  ChevronLeft, ChevronRight, GitMerge, GitBranch, Check, CheckCircle,
  XCircle, Clock, Lock, AlertCircle, Boxes, Info, DollarSign, Flag,
  Package, Shield, Cpu, Scissors, RefreshCw, Send, Download, Edit,
  History, X, Pause, Plus, ClipboardCheck, Loader2, Target, MessageSquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  ECOListItem, ECODetail, PipelineStep,
  ECO_TYPE_LABEL, REASON_LABEL, CHANGE_CLASS_LABEL, EFFECTIVITY_LABEL,
  MODULE_COLORS, ACTIVITY_META, PIPELINE_TEMPLATE,
  statusMeta, priorityMeta, changeClassMeta, changeMeta, impactMeta, dispositionMeta,
  effectivityText, lifecycleIndex, buildDetail, topAssemblies, impactAreaLabel,
  ECOStatus, DecisionType, fromApiEcoDetail,
} from './ecoData';
import { ECOAvatar, StatusPill } from './ECOShared';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  useECODetail, useECODecision, useSubmitECO,
  useReleaseECO, useVerifyECO, useCloseECO, useHoldECO, useResumeECO,
  useExportEcoSummaryCsv, useExportEcoDetailedCsv, useDownloadEcnPdf,
} from '@/hooks/useECOs';
import { downloadEcoCsv } from '@/features/reports/utils/exportUtils';
import { useAuth } from '@/modules/auth';
import { useProjectMembers } from '@/hooks/useProjectTeam';

// ── Detail skeleton components ────────────────────────────────────────────────

function SkeletonPipelineCard() {
  return (
    <div
      className="shrink-0 basis-[210px] md:basis-0 md:flex-1 min-w-[210px] md:min-w-0 border rounded-lg px-4 py-3.5 animate-pulse"
      style={{ background: 'hsl(var(--muted)/0.3)', borderColor: 'hsl(var(--border))' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="h-2.5 rounded bg-muted w-24" />
        <div className="h-4 w-4 rounded-full bg-muted" />
      </div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-[22px] h-[22px] rounded-full bg-muted shrink-0" />
        <div className="flex-1">
          <div className="h-3.5 rounded bg-muted w-24 mb-1" />
          <div className="h-3 rounded bg-muted w-20" />
        </div>
      </div>
      <div className="h-3 rounded bg-muted w-28 mt-1" />
    </div>
  );
}

function SkeletonApprovalPipeline() {
  return (
    <div className="bg-card border border-border rounded-lg px-5 py-4 mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="h-5 rounded bg-muted w-40 animate-pulse" />
        <div className="h-4 rounded bg-muted w-36 animate-pulse" />
      </div>
      <div className="flex items-stretch py-4 overflow-x-auto -mx-1 px-1 md:mx-0 md:px-0">
        {[0, 1, 2, 3].map((_, i) => (
          <Fragment key={i}>
            <SkeletonPipelineCard />
            {i < 3 && (
              <div className="flex items-center shrink-0 px-1.5">
                <ChevronRight className="w-4 h-4 text-muted-foreground/20" />
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function SkeletonTableSection({ className }: { className?: string }) {
  return (
    <div className={cn('bg-card border border-border rounded-lg overflow-hidden', className)}>
      <div className="px-4 py-3.5 border-b border-border animate-pulse">
        <div className="h-5 rounded bg-muted w-40 mb-1.5" />
        <div className="h-3.5 rounded bg-muted w-28" />
      </div>
      <div className="p-4 flex flex-col gap-3 animate-pulse">
        {[100, 85, 92, 78, 88].map((pct, i) => (
          <div key={i} className="h-4 rounded bg-muted" style={{ width: `${pct}%` }} />
        ))}
      </div>
    </div>
  );
}

function SkeletonSideCard({ className }: { className?: string }) {
  return (
    <div className={cn('bg-card border border-border rounded-lg px-4 py-3.5', className)}>
      <div className="flex items-center justify-between mb-3 animate-pulse">
        <div className="h-5 rounded bg-muted w-36" />
        <div className="h-5 rounded-full bg-muted w-16" />
      </div>
      <div className="flex flex-col gap-3 animate-pulse">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex justify-between items-center py-2 border-b border-border/50">
            <div className="h-3.5 rounded bg-muted w-32" />
            <div className="h-3.5 rounded bg-muted w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonPartsCard({ className }: { className?: string }) {
  return (
    <div className={cn('bg-card border border-border rounded-lg overflow-hidden', className)}>
      <div className="px-4 py-3.5 border-b border-border animate-pulse">
        <div className="h-5 rounded bg-muted w-32 mb-1.5" />
        <div className="h-3.5 rounded bg-muted w-44" />
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} className="px-4 py-3 animate-pulse" style={{ borderBottom: '1px solid hsl(var(--border)/0.5)' }}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="h-3.5 rounded bg-muted w-28" />
            <div className="flex gap-1.5">
              <div className="h-5 rounded bg-muted w-24" />
              <div className="h-5 rounded bg-muted w-14" />
            </div>
          </div>
          <div className="h-3 rounded bg-muted w-48 mb-1.5" />
          <div className="flex gap-1.5">
            <div className="h-4 rounded bg-muted w-20" />
            <div className="h-4 rounded bg-muted w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonActivityTimeline() {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border flex items-center gap-2 animate-pulse">
        <div className="h-3.5 w-3.5 rounded bg-muted" />
        <div className="h-5 rounded bg-muted w-16" />
        <div className="h-3 rounded bg-muted w-32 ml-auto" />
      </div>
      <div className="px-4 py-4 animate-pulse">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 rounded-full bg-muted shrink-0" />
              {i < 4 && <div className="w-px flex-1 bg-border/30 min-h-[14px]" />}
            </div>
            <div className={cn('min-w-0', i < 4 ? 'pb-4' : 'pb-0')}>
              <div className="h-3 rounded bg-muted w-52 mb-1.5" />
              <div className="h-3 rounded bg-muted w-36" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Lifecycle tracker ─────────────────────────────────────────────────────────

const LC_NODES = [
  { key: 'DRAFT', label: 'Draft', icon: Edit },
  { key: 'IN_REVIEW', label: 'Send for review', icon: ClipboardCheck },
  { key: 'APPROVED', label: 'Approved', icon: CheckCircle },
  { key: 'RELEASED', label: 'Released', icon: GitBranch, sub: 'ECN' },
  { key: 'VERIFIED', label: 'Verified', icon: Shield },
  { key: 'CLOSED', label: 'Closed', icon: Check },
] as const;

function LifecycleTracker({ status }: { status: ECOStatus }) {
  const cur = lifecycleIndex(status);
  const offTrack =
    status === 'REWORK' ? { at: 1, label: 'Rework', color: '#f97316' }
      : status === 'ON_HOLD' ? { at: 1, label: 'On Hold', color: '#F59E0B' }
        : null;

  return (
    <div className="bg-card border border-border rounded-lg px-4 md:px-6 py-4 md:py-5 mb-4">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-1.5">
        <div className="text-[14px] font-semibold text-foreground">Change Lifecycle</div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0" />
          Approval authorizes release · release ≠ start of work
        </div>
      </div>
      <div className="flex items-start overflow-x-auto -mx-1 px-1 md:mx-0 md:px-0">
        {LC_NODES.map((n, i) => {
          const done = i < cur;
          const here = i === cur;
          const isOff = !!offTrack && offTrack.at === i && here;
          const reached = done || (here && !isOff);
          const NodeIcon = isOff ? RefreshCw : n.icon;
          return (
            <Fragment key={n.key}>
              {/* Node column */}
              <div className="flex flex-col items-center gap-2 shrink-0" style={{ width: 76 }}>
                <div
                  className={cn(
                    'rounded-full flex items-center justify-center shrink-0 transition-all',
                    here ? 'w-11 h-11' : 'w-9 h-9',
                  )}
                  style={{
                    background: reached ? '#16A34A' : here ? 'hsl(var(--primary))' : 'transparent',
                    border: reached || here ? 'none' : '1.5px solid hsl(var(--border))',
                    boxShadow: here ? (isOff ? '0 0 0 4px hsl(var(--primary)/0.15)' : '0 0 0 4px rgba(22,163,74,0.15)') : undefined,
                  }}
                >
                  {reached
                    ? <Check className="w-4 h-4 text-white" strokeWidth={3} />
                    : <NodeIcon
                      className={here ? 'w-5 h-5' : 'w-4 h-4'}
                      style={{ color: here ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))' }}
                    />
                  }
                </div>
                <span
                  className="text-[11px] text-center leading-tight w-full"
                  style={{
                    fontWeight: here ? 600 : 400,
                    color: reached ? (here ? '#16A34A' : 'hsl(var(--foreground))') : here ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {isOff ? offTrack!.label : n.label}
                </span>
                {'sub' in n && n.sub && (
                  <span className="text-[10px] text-muted-foreground -mt-1.5 leading-none">{n.sub}</span>
                )}
              </div>
              {/* Connector line between nodes */}
              {i < LC_NODES.length - 1 && (
                <div
                  className="h-0.5 rounded flex-1 min-w-[20px] mt-[22px]"
                  style={{ background: i < cur ? '#16A34A' : 'hsl(var(--border))' }}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── Approval pipeline ─────────────────────────────────────────────────────────

function ApprovalPipeline({
  detail,
  onDecision,
  isPending,
  canAct,
  isOverride,
}: {
  detail: ECODetail;
  onDecision: (kind: 'approve' | 'reject', comment: string) => void;
  isPending?: boolean;
  canAct?: boolean;
  isOverride?: boolean;
}) {
  const [comment, setComment] = useState('');
  const [err, setErr] = useState(false);

  const dotFor = (decision: DecisionType | undefined) => {
    if (decision === 'APPROVED') return { color: '#16A34A', Icon: Check };
    if (decision === 'REJECTED') return { color: '#DC2626', Icon: X };
    if (decision === 'ACTIVE') return { color: '#2563EB', Icon: null };
    if (decision === 'HOLD') return { color: '#F59E0B', Icon: Pause };
    return { color: '#6B7280', Icon: null };
  };

  const submit = (kind: 'approve' | 'reject') => {
    if (kind === 'reject' && !comment.trim()) { setErr(true); return; }
    onDecision(kind, comment.trim());
    setComment(''); setErr(false);
  };

  return (
    <div className="bg-card border border-border rounded-lg px-4 md:px-5 py-4 mb-4">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
        <div className="text-[14px] font-semibold text-foreground">Approval Pipeline</div>
        <div className="text-[12px] text-muted-foreground">
          {detail.steps.filter(s => s.decision === 'APPROVED').length} of {detail.steps.length} approved · single active approver
        </div>
      </div>

      {/* Steps strip — each card is flex-1 so all 4 share equal width on desktop;
          on mobile cards keep a fixed min-width and the strip scrolls horizontally */}
      <div className="flex items-stretch py-4 overflow-x-auto -mx-1 px-1 md:mx-0 md:px-0">
        {detail.steps.map((s, i) => {
          const { color, Icon } = dotFor(s.decision);
          const active = s.decision === 'ACTIVE';
          return (
            <Fragment key={s.order}>
              <div
                className="shrink-0 basis-[210px] md:basis-0 md:flex-1 min-w-[210px] md:min-w-0 border rounded-lg px-4 py-3.5"
                style={{
                  background: active
                    ? 'hsl(var(--primary)/0.06)'
                    : s.decision === 'APPROVED' ? 'rgba(22,163,74,0.05)'
                      : s.decision === 'REJECTED' ? 'rgba(220,38,38,0.05)'
                        : 'hsl(var(--muted)/0.3)',
                  borderColor: active ? 'hsl(var(--primary)/0.35)' : 'hsl(var(--border))',
                }}
              >
                {/* Stage label + status dot */}
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest truncate"
                    style={{ color }}
                  >
                    {s.stage}
                  </span>
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: color }}
                  >
                    {Icon
                      ? <Icon className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                      : active
                        ? <div className="w-2 h-2 rounded-full bg-white" />
                        : <div className="w-1.5 h-1.5 rounded-full bg-white/50" />}
                  </div>
                </div>
                {/* Approver */}
                <div className="flex items-center gap-2 mb-1.5">
                  <ECOAvatar name={s.name} size={22} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-foreground truncate">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{s.role}</div>
                  </div>
                </div>
                {/* Status line */}
                <div className="text-[12px] font-medium mt-1" style={{ color }}>
                  {s.decision === 'APPROVED'
                    ? `Approved · ${s.date}`
                    : s.decision === 'ACTIVE'
                      ? s.date === 'Revising' ? 'Revising artifacts' : `In review · ${s.date}`
                      : s.decision === 'REJECTED'
                        ? `Rejected · ${s.date}`
                        : s.decision === 'HOLD'
                          ? 'On hold'
                          : s.date}
                </div>
                {/* Decision note */}
                {(s.decision === 'APPROVED' || s.decision === 'REJECTED') && s.note && (
                  <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{s.note}</div>
                )}
                {/* Optional badge */}
                {s.optional && (
                  <div className="mt-2 pt-2 border-t border-dashed border-border/50">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ background: '#F59E0B18', color: '#F59E0B', border: '1px solid #F59E0B40' }}
                    >
                      Optional
                    </span>
                    {s.optionalReason && (
                      <div className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{s.optionalReason}</div>
                    )}
                  </div>
                )}
              </div>
              {/* Chevron separator */}
              {i < detail.steps.length - 1 && (
                <div className="flex items-center shrink-0 px-1.5">
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      {/* Rejection history */}
      {detail.rejections.length > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-lg mb-3" style={{ background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.22)' }}>
          <RefreshCw className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#f97316' }} />
          <div>
            <div className="text-[12px] font-semibold text-foreground">
              Rejected {detail.rejections.length === 1 ? 'once' : `${detail.rejections.length} times`} — last at {detail.rejections[detail.rejections.length - 1].stage} · {detail.rejections[detail.rejections.length - 1].when}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              {detail.rejections[detail.rejections.length - 1].by}: "{detail.rejections[detail.rejections.length - 1].reason}"
            </div>
          </div>
        </div>
      )}

      {/* Inline action */}
      {detail.steps.some(s => s.decision === 'ACTIVE') && canAct && (
        <div className="pt-4 border-t border-border">
          <div className="text-[12px] text-muted-foreground mb-2">
            {isOverride ? (
              <>
                Approving on behalf of{' '}
                <strong className="text-foreground">{detail.steps.find(s => s.decision === 'ACTIVE')?.name}</strong>
                {' '}for{' '}
                <strong className="text-foreground">{detail.steps.find(s => s.decision === 'ACTIVE')?.stage}</strong>
                {' '}as a project manager. This override is recorded in the activity log.
              </>
            ) : (
              <>
                You are the active approver for{' '}
                <strong className="text-foreground">{detail.steps.find(s => s.decision === 'ACTIVE')?.stage}</strong>.
                You are reviewing finished engineering artifacts — approve to advance, or reject to return them to the originator.
              </>
            )}
          </div>
          <textarea
            value={comment}
            onChange={e => { setComment(e.target.value); if (err) setErr(false); }}
            placeholder="Add a decision comment… (required to reject)"
            className={cn(
              'w-full bg-muted/40 border rounded-md text-foreground text-[13px] px-3 py-2.5 outline-none resize-none h-28 font-[inherit]',
              err ? 'border-red-500/60' : 'border-border focus:border-primary/40',
            )}
          />
          {err && (
            <div className="text-[11px] text-red-500 mt-1">A comment is required to reject — the originator needs to know what to revise.</div>
          )}
          <div className="flex gap-2 mt-2.5 flex-wrap">
            <button
              onClick={() => submit('approve')}
              disabled={isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-semibold text-white transition-colors disabled:opacity-60"
              style={{ background: '#16A34A' }}
            >
              {isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
              {isPending ? 'Saving…' : 'Approve step'}
            </button>
            <button
              onClick={() => submit('reject')}
              disabled={isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-semibold transition-colors disabled:opacity-60"
              style={{ color: '#DC2626', border: '1px solid #DC262655', background: 'transparent' }}
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              Reject → Rework
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Version diff table ────────────────────────────────────────────────────────

function VersionDiff({ detail }: { detail: ECODetail }) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden min-w-0">
      <div className="px-4 py-3.5 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[14px] font-semibold text-foreground">
            Version Diff — Rev {detail.revFrom} vs Rev {detail.revTo}
          </div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            Field-level change set · {detail.diff.length} parameters
          </div>
        </div>
        <div className="flex gap-4 text-[12px]">
          <span style={{ color: '#DC2626' }}>● Rev {detail.revFrom} (current)</span>
          <span style={{ color: '#16A34A' }}>● Rev {detail.revTo} (proposed)</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {['Parameter', `Rev ${detail.revFrom}`, `Rev ${detail.revTo}`, 'Change'].map((h, idx) => (
                <th key={idx} className="px-4 py-2 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detail.diff.map((d, i) => {
              const tag = changeMeta(d.cls);
              const removed = d.cls === 'REMOVED';
              const added = d.cls === 'ADDED';
              return (
                <tr
                  key={i}
                  className="border-b border-border/50 hover:bg-accent/20 transition-colors"
                >
                  <td className="px-4 py-2.5 text-muted-foreground w-44">{d.param}</td>
                  <td
                    className="px-4 py-2.5 border-l border-border/50"
                    style={{
                      color: '#DC2626',
                      background: 'rgba(220,38,38,0.04)',
                      textDecoration: removed ? 'line-through' : 'none',
                      opacity: added ? 0.45 : 1,
                    }}
                  >
                    {d.from}
                  </td>
                  <td
                    className="px-4 py-2.5 border-l border-border/50"
                    style={{
                      color: '#16A34A',
                      background: 'rgba(22,163,74,0.04)',
                      opacity: removed ? 0.45 : 1,
                    }}
                  >
                    {d.to}
                    {d.unit && <span className="text-muted-foreground"> {d.unit}</span>}
                  </td>
                  <td className="px-4 py-2.5 border-l border-border/50">
                    <span
                      className="px-2 py-0.5 rounded text-[11px] font-medium"
                      style={{ background: tag.background, color: tag.color, border: tag.border }}
                    >
                      {tag.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Affected parts ────────────────────────────────────────────────────────────

function AffectedParts({ detail, projectId }: { detail: ECODetail; projectId: string }) {
  const navigate = useNavigate();
  const sorted = [...detail.parts].sort((a, b) => (
    ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.impact] ?? 2) - ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[b.impact] ?? 2)
  ));

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border flex justify-between items-center">
        <div>
          <div className="text-[14px] font-semibold text-foreground">Affected Parts</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            {detail.parts.length} parts · each carries its own revision
          </div>
        </div>
        <Boxes className="w-4 h-4 text-muted-foreground" />
      </div>
      {sorted.map((p, i) => {
        const im = impactMeta(p.impact);
        const dp = dispositionMeta(p.disp);
        const tops = topAssemblies(p);
        const revChanged = p.rev && p.rev.from !== p.rev.to;
        return (
          <div
            key={i}
            className="px-4 py-3 hover:bg-accent/20 transition-colors flex flex-col gap-1.5"
            style={{ borderBottom: i < sorted.length - 1 ? '1px solid hsl(var(--border)/0.5)' : 'none' }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col min-w-0">
                <span
                  className="text-[12px] font-mono font-semibold text-blue-500 cursor-pointer hover:underline"
                  onClick={() => {
                    const params = new URLSearchParams({ partId: p.partId, pn: p.pn });
                    navigate(
                      p.bomNodeId
                        ? `/projects/${projectId}/bom/${p.bomNodeId}?${params}`
                        : `/projects/${projectId}/bom?${params}`,
                    );
                  }}
                >
                  {p.pn}
                </span>
                {p.name && <span className="text-[11px] text-foreground font-medium leading-tight">{p.name}</span>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {p.rev && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      color: revChanged ? '#16A34A' : undefined,
                      background: 'hsl(var(--muted)/0.5)',
                      border: `1px solid ${revChanged ? '#16A34A44' : 'hsl(var(--border))'}`,
                    }}
                  >
                    {revChanged ? `Rev ${p.rev.from} → ${p.rev.to}` : `Rev ${p.rev.from} (no change)`}
                  </span>
                )}
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                  style={{ background: im.background, color: im.color, border: im.border }}
                >
                  {im.label}
                </span>
              </div>
            </div>
            <span className="text-[12px] text-muted-foreground">{p.desc}</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ background: dp.background, color: dp.color, border: dp.border }}
              >
                {dp.label}
              </span>
              {p.qty > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  · {p.qty} units affected{tops.length > 1 ? ' across all usages' : ''}
                </span>
              )}
              {tops.length > 1 && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: '#F59E0B22', color: '#F59E0B', border: '1px solid #F59E0B44' }}
                >
                  used in {tops.length} assemblies
                </span>
              )}
            </div>
            {p.paths.length > 0 && (
              <div className="flex flex-col gap-1 mt-0.5">
                {p.paths.map((path, pi) => (
                  <div key={pi} className="flex items-center gap-1 flex-wrap">
                    <GitBranch className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                    <span className="text-[10px] font-mono text-blue-500">{p.pn.split(' ')[0]}</span>
                    {path.map((node, ni) => (
                      <span key={ni} className="flex items-center gap-1">
                        <ChevronRight className="w-2.5 h-2.5 text-muted-foreground" />
                        <span
                          className="text-[10px] px-1 py-0.5 rounded"
                          style={{
                            color: ni === path.length - 1 ? 'hsl(var(--foreground))' : undefined,
                            fontWeight: ni === path.length - 1 ? 600 : 400,
                            background: 'hsl(var(--muted)/0.5)',
                            border: `1px ${ni === path.length - 1 ? 'solid' : 'dashed'} hsl(var(--border))`,
                          }}
                        >
                          {node}
                        </span>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {/* <div className="px-4 py-2 bg-muted/20 border-t border-border/50 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <GitBranch className="w-2.5 h-2.5" />
        Where-used paths auto-rolled up from BOM hierarchy to top-level assembly
      </div> */}
    </div>
  );
}

// ── Shared info row ───────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, children, last }: {
  icon: React.ElementType; label: string; children: React.ReactNode; last?: boolean;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 py-2', !last && 'border-b border-border/50')}>
      <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </span>
      <span className="text-[12px] font-medium text-foreground text-right">{children}</span>
    </div>
  );
}

// ── Reason details ─────────────────────────────────────────────────────────────

function ReasonDetails({ detail }: { detail: ECODetail }) {
  const pm = priorityMeta(detail.priority);
  const typeLabel = ECO_TYPE_LABEL[detail.type] ?? detail.type;
  const reasonLabel = REASON_LABEL[detail.reason] ?? detail.reason;

  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3.5">
      <InfoRow icon={Edit} label="Change Type">
        {typeLabel}
        {detail.typeOther && <span className="text-muted-foreground"> — {detail.typeOther}</span>}
      </InfoRow>
      <InfoRow icon={AlertCircle} label="Reason Code">
        {reasonLabel}
        {detail.reasonOther && <span className="text-muted-foreground"> — {detail.reasonOther}</span>}
      </InfoRow>
      <InfoRow icon={Flag} label="Priority" last={!detail.desc}>
        <StatusPill meta={pm} />
      </InfoRow>
      {detail.desc && (
        <div className="pt-2.5 mt-1 border-t border-border/50">
          <span className="flex items-center gap-2 text-[12px] text-muted-foreground mb-1">
            <MessageSquare className="w-3.5 h-3.5" />
            Reason Description
          </span>
          <p className="text-[12px] text-foreground leading-relaxed">{detail.desc}</p>
        </div>
      )}
    </div>
  );
}

// ── Impact assessment ─────────────────────────────────────────────────────────

function ImpactAssessment({ detail }: { detail: ECODetail }) {
  const im = detail.impact;
  const im_level = impactMeta(im.schedule);

  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3.5">
      <InfoRow icon={Flag} label="Impact Level">
        <span
          className="px-2 py-0.5 rounded text-[11px] font-semibold"
          style={{ background: im_level.background, color: im_level.color, border: im_level.border }}
        >
          {im_level.label}
        </span>
      </InfoRow>
      <InfoRow icon={Target} label="Impact Area">
        <span>{impactAreaLabel(im.impactArea)}</span>
      </InfoRow>
      <InfoRow icon={Flag} label="Affected Milestones">
        <div className="flex flex-col items-end gap-1">
          {im.milestones.length
            ? im.milestones.map(m => <span key={m} className="text-blue-500 cursor-pointer">{m}</span>)
            : <span className="text-muted-foreground">None</span>}
        </div>
      </InfoRow>
      <InfoRow icon={DollarSign} label="Unit Cost Δ">
        <span style={{
          color: im.unitCostDelta > 0 ? '#F59E0B' : im.unitCostDelta < 0 ? '#16A34A' : undefined,
        }}>
          {im.unitCostDelta > 0 ? '+' : ''}${im.unitCostDelta.toFixed(2)}/unit
        </span>
      </InfoRow>
      <InfoRow icon={Package} label="One-Time Cost">
        {im.oneTimeCost > 0
          ? `$${im.oneTimeCost.toLocaleString()}`
          : <span className="text-muted-foreground">—</span>}
      </InfoRow>
      <InfoRow icon={Shield} label="Recertification">
        <span style={{ color: im.recert ? '#F59E0B' : undefined, fontWeight: im.recert ? 600 : 500 }}>
          {im.recert ? 'Required' : 'Not required'}
        </span>
      </InfoRow>
      <InfoRow icon={Cpu} label="Firmware Coupling" last={!im.certNotes}>
        <span style={{ color: im.firmware ? '#F59E0B' : undefined, fontWeight: im.firmware ? 600 : 500 }}>
          {im.firmware ? 'Yes — FW dependency' : 'None'}
        </span>
      </InfoRow>
      {/* <div className="flex items-start justify-between gap-3 pt-2">
        <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Boxes className="w-3.5 h-3.5" />
          Inventory Impact
        </span>
        <span className="text-[12px] font-medium text-foreground">
          {im.inventoryQty > 0 ? `${im.inventoryQty} units to rework/scrap` : <span className="text-muted-foreground">None</span>}
        </span>
      </div> */}
      {im.certNotes && (
        <div className="pt-2.5 mt-1 border-t border-border/50">
          <span className="flex items-center gap-2 text-[12px] text-muted-foreground mb-1">
            <MessageSquare className="w-3.5 h-3.5" />
            Impact Notes
          </span>
          <p className="text-[12px] text-foreground leading-relaxed">{im.certNotes}</p>
        </div>
      )}
    </div>
  );
}

// ── Activity timeline ─────────────────────────────────────────────────────────

function ActivityTimeline({ detail }: { detail: ECODetail }) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border flex items-center gap-2">
        <History className="w-3.5 h-3.5 text-muted-foreground" />
        <div className="text-[14px] font-semibold text-foreground">Activity</div>
        <span className="text-[11px] text-muted-foreground ml-auto">Append-only · ISO 9001 audit</span>
      </div>
      <div className="px-4 py-4">
        {detail.activity.map((a, i) => {
          const meta = ACTIVITY_META[a.action] ?? { icon: 'Activity', color: '#6B7280' };
          // Dynamic icon lookup
          const IconComp = (LucideIcons as Record<string, React.ElementType>)[meta.icon] ?? LucideIcons.Activity;
          const last = i === detail.activity.length - 1;
          return (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: meta.color + '22',
                    border: `1px solid ${meta.color}44`,
                  }}
                >
                  <IconComp className="w-3 h-3" style={{ color: meta.color }} />
                </div>
                {!last && <div className="w-px flex-1 bg-border/50 min-h-[14px]" />}
              </div>
              <div className={cn('min-w-0', last ? 'pb-0' : 'pb-4')}>
                <div className="text-[12px] flex items-center gap-1.5 flex-wrap">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize"
                    style={{
                      color: meta.color,
                      background: meta.color + '18',
                      border: `1px solid ${meta.color}33`,
                    }}
                  >
                    {a.action.replace(/_/g, ' ').toLowerCase()}
                  </span>
                  <span className="text-muted-foreground">by</span>
                  <strong className="font-semibold text-foreground">{a.actor}</strong>
                  <span className="text-muted-foreground/60">· {a.when}</span>
                </div>
                {a.note && (
                  <div className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{a.note}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ECN Release Modal ─────────────────────────────────────────────────────────

function ECNReleaseModal({
  detail,
  onClose,
  onRelease,
  onDownloadPdf,
}: {
  detail: ECODetail;
  onClose: () => void;
  onRelease: () => Promise<void>;
  onDownloadPdf?: () => void;
}) {
  const [releasing, setReleasing] = useState(false);
  const [released, setReleased] = useState(detail.status !== 'APPROVED');
  const ecn = detail.ecn;

  const revBumps = detail.parts.filter(p => p.rev && p.rev.from !== p.rev.to);
  const dispCounts = detail.parts.reduce<Record<string, number>>((acc, p) => {
    acc[p.disp] = (acc[p.disp] ?? 0) + 1; return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-3 md:p-6"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-[640px] max-w-full max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl shadow-2xl"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <GitBranch className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <div className="text-[15px] font-semibold text-foreground">
                {released ? 'ECN Released & Distributed' : 'Generate ECN — Release Change'}
              </div>
              <div className="text-[12px] text-muted-foreground">
                {detail.num}{ecn ? ` → ${ecn.num}` : ''} · {released ? 'controlled / released' : 'approved, ready to release'}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Info banner */}
          <div className="flex gap-3 p-3.5 rounded-lg" style={{ background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.22)' }}>
            <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-[12px] text-foreground leading-relaxed">
              The change is <strong>already approved</strong>. Generating the ECN releases it to manufacturing and suppliers and promotes the affected parts to released state at the effectivity cut-in. This is a controlled release — <strong>not</strong> another approval gate.
            </div>
          </div>

          {/* Milestone recalc */}
          {ecn && ecn.recalc.count > 0 ? (
            <div className="flex gap-3 p-3.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <RefreshCw className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#F59E0B' }} />
              <div>
                <div className="text-[13px] font-semibold text-foreground">
                  {ecn.recalc.count} downstream milestone{ecn.recalc.count > 1 ? 's' : ''} shift by +{ecn.recalc.days} days
                </div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  BOM-to-schedule recalculation moves the{' '}
                  <strong style={{ color: '#F59E0B' }}>{ecn.recalc.gate}</strong> gate. Review before confirming release.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 p-3.5 rounded-lg" style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.25)' }}>
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#16A34A' }} />
              <div className="text-[13px] text-foreground">No schedule impact — no downstream milestones shift on release.</div>
            </div>
          )}

          {/* Effectivity + on-release (only shown when ECN exists) */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px] p-3.5 rounded-lg bg-muted/40 border border-border">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Effectivity Cut-in</div>
              <div className="text-[14px] font-semibold text-foreground flex items-center gap-2">
                <Scissors className="w-3.5 h-3.5 text-blue-500" />
                {effectivityText(detail.effectivity)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {EFFECTIVITY_LABEL[detail.effectivity.type]} · enforced by manufacturing
              </div>
            </div>
            <div className="flex-1 min-w-[180px] p-3.5 rounded-lg bg-muted/40 border border-border">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">On Release</div>
              <div className="text-[12px] text-foreground">
                Promotes {revBumps.length} part revision{revBumps.length !== 1 ? 's' : ''} to released · writes audit records
              </div>
            </div>
          </div>

          {/* Dispositions */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Dispositions to Execute</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(dispCounts).map(([d, n]) => {
                const dm = dispositionMeta(d as any);
                return (
                  <span
                    key={d}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                    style={{ background: dm.background, color: dm.color, border: dm.border }}
                  >
                    {dm.label} · {n}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Distribution */}
          {ecn && ecn.distribution.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Distribution List <span className="normal-case tracking-normal font-normal">· notified on release</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ecn.distribution.map((name) => (
                  <div key={name} className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-muted/50 border border-border">
                    <ECOAvatar name={name} size={20} />
                    <span className="text-[12px] text-foreground">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tasks */}
          {ecn && ecn.tasks.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Implementation Tasks ({ecn.tasks.length}){' '}
                <span className="normal-case tracking-normal font-normal">· tracked to Verified</span>
              </div>
              <div className="flex flex-col gap-2">
                {ecn.tasks.map((t, i) => {
                  const done = t.status === 'done';
                  return (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-muted/30 border border-border">
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                        style={{
                          border: `1.5px solid ${done ? '#16A34A' : 'hsl(var(--muted-foreground)/0.4)'}`,
                          background: done ? '#16A34A' : 'transparent',
                        }}
                      >
                        {done && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </div>
                      <span
                        className="flex-1 text-[12px] text-foreground"
                        style={{ textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.5 : 1 }}
                      >
                        {t.task}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
                        <ECOAvatar name={t.assignee} size={16} />
                        {t.assignee}
                      </div>
                      <span className="text-[11px] text-muted-foreground w-10 text-right shrink-0">{t.due}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-card">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-[13px] font-medium bg-muted/50 text-foreground border border-border hover:bg-accent transition-colors"
          >
            {released ? 'Close' : 'Cancel'}
          </button>
          {!released && (
            <button
              disabled={releasing}
              onClick={async () => {
                setReleasing(true);
                try { await onRelease(); setReleased(true); } finally { setReleasing(false); }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              {releasing ? 'Releasing…' : 'Generate & Release ECN'}
            </button>
          )}
          {released && (
            <>
              {onDownloadPdf && (
                <button
                  onClick={onDownloadPdf}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-medium bg-muted/50 text-foreground border border-border hover:bg-accent transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download ECN PDF
                </button>
              )}
              <span
                className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold text-white"
                style={{ background: '#16A34A' }}
              >
                <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                Released{ecn ? ` · ${ecn.num} distributed` : ''}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Verify modal ──────────────────────────────────────────────────────────────

function VerifyModal({
  detail,
  onClose,
  onConfirm,
}: {
  detail: ECODetail;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-3 md:p-6">
      <div onClick={e => e.stopPropagation()} className="w-[480px] max-w-full bg-card border border-border rounded-xl shadow-2xl">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#9333EA22' }}>
            <Shield className="w-4 h-4" style={{ color: '#9333EA' }} />
          </div>
          <div>
            <div className="text-[15px] font-semibold text-foreground">Verify Implementation</div>
            <div className="text-[12px] text-muted-foreground">{detail.num} · {detail.ecn?.num ?? 'ECN'} released</div>
          </div>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <div className="flex gap-2.5 p-3 rounded-lg bg-muted/40 border border-border">
            <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-[12px] text-muted-foreground leading-relaxed">
              Confirm the change was implemented and the effectivity cut-in is in effect. This is an implementation check — it does <strong className="text-foreground">not</strong> re-open the approval pipeline.
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Verification Note</div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Rework complete on 240 cabinets; first S/N EVC-1450 built to Rev B; effectivity cut-in confirmed."
              className="w-full h-20 bg-muted/40 border border-border rounded-md text-foreground text-[13px] px-3 py-2 outline-none resize-none font-[inherit] focus:border-primary/40"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-[13px] font-medium bg-muted/50 text-foreground border border-border hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try { await onConfirm(note.trim()); } finally { setSaving(false); }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold text-white transition-colors disabled:opacity-60"
            style={{ background: '#9333EA' }}
          >
            <Shield className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Mark Verified'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Header action definitions ─────────────────────────────────────────────────

function headerActions(status: ECOStatus, isOriginator: boolean) {
  const ghost = 'ghost' as const;
  const primary = 'primary' as const;
  switch (status) {
    case 'DRAFT': {
      const actions: any[] = [{ k: 'edit', label: 'Edit Draft', icon: Edit, kind: ghost }];
      if (isOriginator) {
        actions.push({ k: 'submit', label: 'Submit for Review', icon: Send, kind: primary });
      }
      return actions;
    }
    case 'IN_REVIEW': return [{ k: 'export', label: 'Export PDF', icon: Download, kind: ghost }];
    case 'ON_HOLD': return [{ k: 'resume', label: 'Resume Review', icon: RefreshCw, kind: primary }];
    case 'REWORK': return [{ k: 'resubmit', label: 'Revise & Resubmit', icon: RefreshCw, kind: primary }];
    case 'APPROVED': return [{ k: 'generate', label: 'Generate ECN', icon: GitBranch, kind: primary }];
    case 'RELEASED': return [{ k: 'ecn', label: 'View ECN', icon: Download, kind: ghost }, { k: 'downloadPdf', label: 'Download ECN PDF', icon: Download, kind: ghost }, { k: 'verify', label: 'Mark Verified', icon: Shield, kind: primary }];
    case 'VERIFIED': return [{ k: 'ecn', label: 'View ECN', icon: Download, kind: ghost }, { k: 'downloadPdf', label: 'Download ECN PDF', icon: Download, kind: ghost }, { k: 'close', label: 'Close ECO', icon: Check, kind: primary }];
    default: return [];
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border border-border rounded-lg px-5 py-2.5 text-[13px] font-medium text-foreground shadow-xl z-[300] flex items-center gap-2">
      <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#16A34A' }} />
      {message}
    </div>
  );
}

// ── ECODetailView ─────────────────────────────────────────────────────────────

export function ECODetailView({
  eco,
  projectId,
  projectName,
  onBack,
  onEdit,
}: {
  eco: ECOListItem;
  projectId: string;
  projectName?: string;
  onBack: () => void;
  onEdit?: (eco: ECOListItem) => void;
}) {
  const [ecnOpen, setEcnOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  // Live data from API; fall back to list-item-derived detail during first load
  const { data: liveRaw, isLoading: detailLoading } = useECODetail(projectId, eco.id);
  const detail: ECODetail = liveRaw ? fromApiEcoDetail(liveRaw) : buildDetail(eco);
  const isFirstLoad = detailLoading && !liveRaw;

  // Approval rights: the assigned approver acts normally; project maintainers/admins
  // can act on the assignee's behalf (override). `awaitingMe` is server-computed
  // and true only for the assignee.
  const { user } = useAuth();
  const { data: projectMembers = [] } = useProjectMembers(projectId);
  const myRole = projectMembers.find(m => m.id === user?.id)?.role?.toLowerCase();
  const canOverride = myRole === 'maintainer' || myRole === 'admin';
  const canAct = detail.awaitingMe || canOverride;
  const isOverride = !detail.awaitingMe && canOverride;

  // Mutations
  const decisionMutation = useECODecision(projectId, eco.id);
  const submitMutation = useSubmitECO(projectId, eco.id);
  const releaseMutation = useReleaseECO(projectId, eco.id);
  const verifyMutation = useVerifyECO(projectId, eco.id);
  const closeMutation = useCloseECO(projectId, eco.id);
  const holdMutation = useHoldECO(projectId, eco.id);
  const resumeMutation = useResumeECO(projectId, eco.id);
  const exportSummaryCsv = useExportEcoSummaryCsv(projectId);
  const exportDetailedCsv = useExportEcoDetailedCsv(projectId);
  const downloadEcnPdfMutation = useDownloadEcnPdf(projectId, eco.id);

  // Export dropdown state
  const [exportOpen, setExportOpen] = useState(false);

  const sm = statusMeta(detail.status);
  const pm = priorityMeta(detail.priority);
  const cm = changeClassMeta(detail.changeClass);

  const actionPending: Record<string, boolean> = {
    submit: submitMutation.isPending,
    resume: resumeMutation.isPending,
    hold: holdMutation.isPending,
    close: closeMutation.isPending,
  };
  const anyActionPending = Object.values(actionPending).some(Boolean);

  const handleDecision = async (kind: 'approve' | 'reject', comment: string) => {
    try {
      await decisionMutation.mutateAsync({
        decision: kind === 'approve' ? 'approved' : 'rejected',
        note: comment || undefined,
      });
      flash(kind === 'approve' ? 'Step approved — pipeline advanced' : 'Returned to originator for artifact rework');
    } catch {
      flash('Failed to record decision');
    }
  };

  const onAction = async (k: string) => {
    if (k === 'edit') { onEdit?.(eco); return; }
    if (k === 'generate' || k === 'ecn') { setEcnOpen(true); return; }
    if (k === 'downloadPdf') {
      try {
        await downloadEcnPdfMutation.mutateAsync();
        flash('ECN PDF downloaded');
      } catch {
        flash('Failed to download ECN PDF');
      }
      return;
    }
    if (k === 'verify') { setVerifyOpen(true); return; }
    if (k === 'export') { setExportOpen(true); return; }
    if (k === 'exportSummaryCsv') {
      try {
        const blob = await exportSummaryCsv.mutateAsync([eco.id]);
        downloadEcoCsv(blob, 'summary', 1);
        flash('ECO exported as CSV');
      } catch {
        flash('Failed to export');
      }
      setExportOpen(false);
      return;
    }
    if (k === 'exportDetailedCsv') {
      try {
        const blob = await exportDetailedCsv.mutateAsync([eco.id]);
        downloadEcoCsv(blob, 'detailed', 1);
        flash('ECO exported as detailed CSV');
      } catch {
        flash('Failed to export');
      }
      setExportOpen(false);
      return;
    }
    if (k === 'resubmit') { onEdit?.(eco); return; }
    if (k === 'submit') {
      try {
        await submitMutation.mutateAsync();
        flash('Submitted for review');
      } catch { flash('Failed to submit'); }
      return;
    }
    if (k === 'resume') {
      try { await resumeMutation.mutateAsync(); flash('Review resumed'); } catch { flash('Failed to resume'); }
      return;
    }
    if (k === 'hold') {
      try { await holdMutation.mutateAsync(); flash('ECO placed on hold'); } catch { flash('Failed to hold'); }
      return;
    }
    if (k === 'close') {
      try { await closeMutation.mutateAsync(); flash('ECO closed'); } catch { flash('Failed to close'); }
      return;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background px-4 md:px-6 pt-0 md:pt-1 pb-12 h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-3">
        {projectName && (
          <>
            <span onClick={onBack} className="text-muted-foreground/70 cursor-pointer hover:text-foreground transition-colors">{projectName}</span>
            <ChevronRight className="w-3 h-3" />
          </>
        )}
        <span className="text-foreground font-medium">{detail.num}</span>
      </div>

      {/* <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 mb-4 px-2.5 py-1 rounded-md text-[12px] font-medium bg-card text-muted-foreground border border-border hover:bg-accent/50 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Back to changes
      </button> */}

      {/* Header */}
      <div className="bg-card border border-border rounded-lg px-4 md:px-5 py-4 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <GitMerge className="w-4.5 h-4.5 text-blue-500 shrink-0" />
            <span className="text-[13px] font-mono font-semibold text-blue-500">{detail.num}</span>
            <h1 className="text-[20px] font-semibold text-foreground">{detail.title}</h1>
            <StatusPill meta={sm} />
            <StatusPill meta={pm} />
            <StatusPill meta={cm} />
          </div>
          <div className="flex gap-2 flex-wrap shrink-0 w-full sm:w-auto">
          {headerActions(detail.status, detail.originator === user?.name).map(a => {
            const thisLoading = !!actionPending[a.k];

            // Special handling for export button
            if (a.k === 'export') {
              return (
                <DropdownMenu key={a.k} open={exportOpen} onOpenChange={setExportOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      disabled={anyActionPending}
                      className={cn(
                        'flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] cursor-pointer transition-colors font-[inherit] disabled:opacity-60 disabled:cursor-not-allowed',
                        a.kind === 'primary'
                          ? 'font-semibold bg-primary hover:bg-primary/90 text-primary-foreground border-none'
                          : 'font-medium bg-card text-foreground border border-border hover:bg-accent/50',
                      )}
                    >
                      {thisLoading
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <a.icon className="w-3.5 h-3.5" strokeWidth={2} />}
                      {a.label}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onAction('exportSummaryCsv')}>
                      Export as CSV (Summary)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAction('exportDetailedCsv')}>
                      Export as CSV (Detailed)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }

            return (
              <button
                key={a.k}
                onClick={() => onAction(a.k)}
                disabled={anyActionPending}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] cursor-pointer transition-colors font-[inherit] disabled:opacity-60 disabled:cursor-not-allowed',
                  a.kind === 'primary'
                    ? 'font-semibold bg-primary hover:bg-primary/90 text-primary-foreground border-none'
                    : 'font-medium bg-card text-foreground border border-border hover:bg-accent/50',
                )}
              >
                {thisLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <a.icon className="w-3.5 h-3.5" strokeWidth={2} />}
                {a.label}
              </button>
            );
          })}
          </div>
        </div>

        {detail.desc && (
          <p className="text-[13px] text-muted-foreground leading-relaxed max-w-3xl mb-4">{detail.desc}</p>
        )}

        {/* Field grid — one consistent layout for every header fact */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-3 pt-4 border-t border-border">
          {([
            // ['Originating ECR', detail.ecr
            //   ? <span className="text-blue-500 font-semibold font-mono cursor-pointer">{detail.ecr}</span>
            //   : <span className="text-muted-foreground/50">— (created directly)</span>],
            // ['Effectivity', <>{effectivityText(detail.effectivity)} <span className="text-muted-foreground/60 font-normal">· {EFFECTIVITY_LABEL[detail.effectivity.type]}</span></>],
            ['Type', ECO_TYPE_LABEL[detail.type]],
            ['Reason Code', REASON_LABEL[detail.reason]],
            ['Originator', detail.originator],
            ['Change Owner', detail.owner],
            ['Initiated', detail.created],
            ['Affected Parts', String(detail.parts.length)],
            ['ECO Revision', `${detail.revFrom} → ${detail.revTo}`],
          ] as [string, React.ReactNode][]).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-0.5">{k}</div>
              <div className="text-[13px] font-medium text-foreground truncate">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Affected modules */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {detail.modules.map(m => (
          <span
            key={m}
            className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: (MODULE_COLORS[m] ?? '#6B7280') + '22', color: MODULE_COLORS[m] ?? '#6B7280' }}
          >
            {m}
          </span>
        ))}
      </div>

      <LifecycleTracker status={detail.status} />

      {isFirstLoad ? (
        <SkeletonApprovalPipeline />
      ) : (
        <ApprovalPipeline detail={detail} onDecision={handleDecision} isPending={decisionMutation.isPending} canAct={canAct} isOverride={isOverride} />
      )}

      {/* Two-column content — stacked on mobile (right/side column first), side-by-side from md up */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-4 items-start">
        <div className="order-2 md:order-1 w-full md:flex-[2] md:min-w-0 flex flex-col gap-4">
          {isFirstLoad ? (
            <>
              <SkeletonTableSection />
              <SkeletonActivityTimeline />
            </>
          ) : (
            <>
              <VersionDiff detail={detail} />
              <ActivityTimeline detail={detail} />
            </>
          )}
        </div>
        <div className="order-1 md:order-2 w-full md:flex-1 md:min-w-[280px] flex flex-col gap-4">
          {isFirstLoad ? (
            <>
              <SkeletonSideCard />
              <SkeletonSideCard />
              <SkeletonPartsCard />
            </>
          ) : (
            <>
              <ReasonDetails detail={detail} />
              <ImpactAssessment detail={detail} />
              <AffectedParts detail={detail} projectId={projectId} />
            </>
          )}
        </div>
      </div>

      {ecnOpen && (
        <ECNReleaseModal
          detail={detail}
          onClose={() => setEcnOpen(false)}
          onRelease={async () => {
            await releaseMutation.mutateAsync({});
            flash('ECN generated & released');
          }}
          onDownloadPdf={detail.ecn ? () => downloadEcnPdfMutation.mutate() : undefined}
        />
      )}

      {verifyOpen && (
        <VerifyModal
          detail={detail}
          onClose={() => setVerifyOpen(false)}
          onConfirm={async note => {
            try {
              await verifyMutation.mutateAsync({ note: note || undefined });
              setVerifyOpen(false);
              flash('Implementation verified');
            } catch { flash('Failed to verify'); }
          }}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
