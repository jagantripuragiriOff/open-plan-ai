import { useState, useMemo, useEffect } from 'react';
import {
  GitMerge, X, AlertCircle, ChevronDown, ChevronRight, ChevronLeft, Check, Plus,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  ECOType, ECOReason, ECOPriority, ImpactLevel, ImpactArea,
  ECO_TYPE_LABEL, REASON_LABEL, PRIORITY_LABEL, IMPACT_LABEL,
  IMPACT_AREA_OPTIONS, IMPACT_AREA_LABEL,
  PipelineStep, PIPELINE_STAGE_DEFS,
} from './ecoData';
import { ECOAvatar } from './ECOShared';
import { useCreateECO } from '@/hooks/useECOs';
import { useRequirementAllocations } from '@/hooks/useBom';
import { useProjectMembers } from '@/hooks/useProjectTeam';
import { BY_KEY, impactOf } from './requirementsData';
import { toast } from 'sonner';

// ── Local helpers — mirrors BOMECOSheet.tsx's, kept per-file per this
// codebase's established convention rather than a shared extraction. ──

const inputCls = 'w-full bg-muted/40 border border-border rounded-md text-foreground text-[13px] px-3 py-2 outline-none focus:border-primary/40 placeholder:text-muted-foreground/50 font-[inherit]';

function FL({ label, required, children, className }: {
  label: string; required?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function FInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input {...props} className={cn('h-8 text-sm bg-muted border-border focus-visible:ring-1', props.className)} />
  );
}

function FSelect<T extends string>({
  value, onChange, options, labels,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
  labels: Record<string, string>;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="w-full bg-muted/40 border border-border rounded-md text-foreground text-[13px] pl-3 pr-8 py-2 outline-none focus:border-primary/40 cursor-pointer appearance-none font-[inherit]"
      >
        {options.map(o => (
          <option key={o} value={o} className="bg-card">{labels[o] ?? o}</option>
        ))}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
    </div>
  );
}

const TABS = ['requirement', 'impact', 'reason', 'approval'] as const;
type TabId = typeof TABS[number];
const TAB_LABEL: Record<TabId, string> = {
  requirement: 'Requirement', impact: 'Impact', reason: 'Reason', approval: 'Approval',
};

interface PipelineStepLocal extends PipelineStep {
  justification: string;
  isCustom?: boolean;
}

// Set when this sheet is opened from a failed test result (Test &
// Verification closed loop, plan §E) rather than the requirement's own
// Impact drawer — pre-fills the title/reason with the failure context and
// threads triggeredByTestExecutionId through on create.
export interface TestFailureTrigger {
  testExecutionId: string;
  testCaseKey: string;
  measuredValue: number | null;
  unit: string | null;
  target: { value: number; unit: string; tolerance: string } | null;
}

export function RequirementECOSheet({
  open,
  onClose,
  reqKey,
  projectId,
  onCreated,
  trigger,
}: {
  open: boolean;
  onClose: () => void;
  reqKey: string;
  projectId: string;
  onCreated?: (ecoId: string) => void;
  trigger?: TestFailureTrigger;
}) {
  const createMutation = useCreateECO(projectId);
  const { data: allocations = [] } = useRequirementAllocations(projectId);
  const r = BY_KEY[reqKey];
  const impact = useMemo(() => impactOf(reqKey), [reqKey]);

  const [activeTab, setActiveTab] = useState<TabId>('requirement');
  const [maxTabReached, setMaxTabReached] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [ecoTitle, setEcoTitle] = useState('');

  useEffect(() => {
    if (!open || !r) return;
    if (trigger) {
      setEcoTitle(`Fix: ${trigger.testCaseKey} failure on ${r.key}`);
      setReasonCode('QUALITY');
      setPriority('HIGH');
      const measured = trigger.measuredValue !== null
        ? `${trigger.measuredValue}${trigger.unit ? ` ${trigger.unit}` : ''}` : 'a non-passing result';
      const targetText = trigger.target
        ? ` (target: ${trigger.target.value}${trigger.target.unit}${trigger.target.tolerance ? `, tolerance ${trigger.target.tolerance}` : ''})`
        : '';
      setReasonDesc(`Raised from a failed test result on ${trigger.testCaseKey}: measured ${measured}${targetText}.`);
    } else {
      setEcoTitle(`Change: ${r.title}`);
    }
    setErrors({});
    setActiveTab('requirement');
    setMaxTabReached(0);
  }, [open, reqKey, trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // The requirement itself plus every descendant — matches the copy already
  // shown in the Impact drawer ("Downstream requirements would be flagged
  // suspect"), so what actually gets linked matches what was promised.
  const affectedRequirementIds = useMemo(() => {
    const keys = [reqKey, ...impact.descendants];
    return keys.map(k => BY_KEY[k]?._id).filter((id): id is string => !!id);
  }, [reqKey, impact.descendants]);

  const affectedRequirementKeys = useMemo(
    () => [reqKey, ...impact.descendants],
    [reqKey, impact.descendants],
  );

  // Resolve the requirement + descendants' currently-allocated part numbers
  // (impact.parts) into real {partId, nodeId} pairs via the live allocations
  // list, deduped by partId.
  const affectedParts = useMemo(() => {
    const idSet = new Set(affectedRequirementIds);
    const seen = new Set<string>();
    const out: { partId: string; nodeId: string; partNumber: string; partName: string }[] = [];
    allocations.forEach(a => {
      if (!idSet.has(a.requirementId) || seen.has(a.partId)) return;
      seen.add(a.partId);
      out.push({ partId: a.partId, nodeId: a.nodeId, partNumber: a.partNumber, partName: a.partName });
    });
    return out;
  }, [allocations, affectedRequirementIds]);

  // ── Impact tab state ──
  const [impactArea, setImpactArea] = useState<ImpactArea>('schedule');
  const [impactAreaOther, setImpactAreaOther] = useState('');
  const [impactLevel, setImpactLevel] = useState<ImpactLevel>('MEDIUM');
  const [impactDesc, setImpactDesc] = useState('');

  // ── Reason tab state ──
  const [changeType, setChangeType] = useState<ECOType>('DESIGN_CHANGE');
  const [changeTypeOther, setChangeTypeOther] = useState('');
  const [reasonCode, setReasonCode] = useState<ECOReason>('PERFORMANCE');
  const [reasonCodeOther, setReasonCodeOther] = useState('');
  const [priority, setPriority] = useState<ECOPriority>('MEDIUM');
  const [reasonDesc, setReasonDesc] = useState('');

  // ── Approval tab state (approvers are real project members, picked by the user) ──
  const { data: projectMembers = [] } = useProjectMembers(projectId);

  const defaultOrder = useMemo(() => {
    const m: Record<string, number> = {};
    PIPELINE_STAGE_DEFS.forEach((s, i) => { m[s.stage] = i; });
    return m;
  }, []);

  const [pipeline, setPipeline] = useState<PipelineStepLocal[]>(
    PIPELINE_STAGE_DEFS.map(s => ({ ...s, justification: s.optionalReason ?? '' })),
  );

  const assignApprover = (idx: number, memberId: string) => {
    const member = projectMembers.find(m => m.id === memberId);
    setPipeline(pl => pl.map((x, i) => (
      i === idx ? { ...x, approverId: member?.id ?? null, name: member?.name ?? '', role: member?.role ?? '' } : x
    )));
  };

  const stageMoved = (p: PipelineStep, idx: number) =>
    defaultOrder[p.stage] !== undefined && defaultOrder[p.stage] !== idx;

  const pipelineValid = pipeline.every((p, idx) => {
    const needsReason = p.optional || stageMoved(p, idx);
    const reasonOk = !needsReason || (p.justification ?? '').trim().length > 0;
    return reasonOk && !!p.approverId;
  });

  const canSubmit = ecoTitle.trim().length > 0 && pipeline.length >= 1 && pipelineValid;

  const isTabValid = useMemo(() => {
    if (activeTab === 'requirement') return ecoTitle.trim().length > 0;
    if (activeTab === 'impact') return impactArea !== 'other' || impactAreaOther.trim().length > 0;
    if (activeTab === 'reason') {
      return (
        (changeType !== 'OTHER' || changeTypeOther.trim().length > 0) &&
        (reasonCode !== 'OTHER' || reasonCodeOther.trim().length > 0)
      );
    }
    return true;
  }, [activeTab, ecoTitle, impactArea, impactAreaOther, changeType, changeTypeOther, reasonCode, reasonCodeOther]);

  const validateTab = (tab: TabId): boolean => {
    const e: Record<string, string> = {};
    if (tab === 'requirement' && !ecoTitle.trim()) e.title = 'ECO title is required';
    if (tab === 'impact' && impactArea === 'other' && !impactAreaOther.trim()) {
      e.impactAreaOther = 'Specify the impact area';
    }
    if (tab === 'reason') {
      if (changeType === 'OTHER' && !changeTypeOther.trim()) e.changeTypeOther = 'Describe the change type';
      if (reasonCode === 'OTHER' && !reasonCodeOther.trim()) e.reasonCodeOther = 'Describe the reason';
    }
    if (tab === 'approval') {
      if (pipeline.length < 1) e.pipeline = 'At least 1 approval stage is required';
      else if (!pipelineValid) e.pipeline = 'Every stage needs an approver, and optional/reordered stages need a justification';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleTabChange = (targetTab: TabId) => {
    const currentIndex = TABS.indexOf(activeTab);
    const targetIndex = TABS.indexOf(targetTab);
    if (targetIndex > currentIndex) {
      for (let i = currentIndex; i < targetIndex; i++) {
        if (!validateTab(TABS[i])) return;
      }
    }
    setErrors({});
    setActiveTab(targetTab);
    setMaxTabReached(m => Math.max(m, targetIndex));
  };

  const handleNext = () => {
    if (!validateTab(activeTab)) return;
    setErrors({});
    const nextIndex = TABS.indexOf(activeTab) + 1;
    setActiveTab(TABS[nextIndex]);
    setMaxTabReached(m => Math.max(m, nextIndex));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      const created = await createMutation.mutateAsync({
        title: ecoTitle.trim(),
        description: reasonDesc || null,
        triggeredByTestExecutionId: trigger?.testExecutionId,
        type: changeType.toLowerCase(),
        typeOther: changeType === 'OTHER' ? changeTypeOther.trim() : null,
        reason: reasonCode.toLowerCase(),
        reasonOther: reasonCode === 'OTHER' ? reasonCodeOther.trim() : null,
        priority: priority.toLowerCase(),
        changeClass: 'II',
        scheduleImpact: impactLevel.toLowerCase(),
        impactArea: impactArea === 'other' ? (impactAreaOther.trim() || 'other') : impactArea,
        certNotes: impactDesc || null,
        requirementIds: affectedRequirementIds,
        parts: affectedParts.map(p => ({
          partId: p.partId,
          bomNodeId: p.nodeId,
          impactLevel: impactLevel.toLowerCase(),
          disposition: 'use_as_is',
          notes: null,
        })),
        pipelineSteps: pipeline.map((p, i) => ({
          order: i + 1,
          stage: p.stage,
          stageLabel: p.stage,
          approverUserId: p.approverId ?? null,
          approverName: p.name ?? null,
          approverRole: p.role ?? null,
          isOptional: p.optional ?? false,
          optionalReason: p.optionalReason ?? null,
          justification: p.justification || null,
        })),
      });
      toast.success('ECO created successfully');
      onClose();
      if (created?.id) onCreated?.(created.id);
    } catch {
      toast.error('Failed to create ECO');
    }
  };

  if (!r) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        overlayClassName="z-[3000]"
        className="z-[3001] max-w-[1050px] w-[90vw] p-0 gap-0 flex flex-col overflow-hidden"
        style={{ zIndex: 3001, maxHeight: '88vh', minHeight: '70vh' }}
      >
        <DialogHeader className="px-7 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <GitMerge className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-semibold leading-none">
                  New Engineering Change Order
                </DialogTitle>
                <span className="px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground text-[11px] font-mono font-medium shrink-0">
                  {r.key}
                </span>
              </div>
              <DialogDescription className="text-[12px] text-muted-foreground mt-0.5">
                {trigger ? `Raised from a failed test result (${trigger.testCaseKey})` : "Raised from this requirement's change impact"} · ECO number assigned on save
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={v => handleTabChange(v as TabId)} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-7 pt-3 pb-0 border-b border-border shrink-0">
            <TabsList className="bg-transparent h-auto p-0 gap-0 w-full justify-start rounded-none">
              {TABS.map((t, i) => {
                const locked = i > maxTabReached;
                return (
                  <TabsTrigger
                    key={t}
                    value={t}
                    disabled={locked}
                    className={cn(
                      "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent text-muted-foreground text-[13px] font-medium px-4 py-2 capitalize transition-opacity",
                      locked && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    {TAB_LABEL[t]}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {/* Requirement tab */}
          <TabsContent value="requirement" className="flex-1 min-h-0 relative mt-0">
            <div className="absolute inset-0 overflow-y-auto">
              <div className="px-7 py-5 flex flex-col gap-5">
                <FL label="ECO Title" required>
                  <FInput
                    value={ecoTitle}
                    onChange={e => { setEcoTitle(e.target.value); if (errors.title) setErrors(({ title: _title, ...rest }) => rest); }}
                    placeholder="e.g. Enclosure gasket rework"
                    className={cn(errors.title && 'border-destructive')}
                  />
                  {errors.title && <p className="text-[11px] text-destructive flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" />{errors.title}</p>}
                </FL>

                <div className="border-t border-border/60 pt-4 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] text-muted-foreground">
                      Requirement&nbsp;<span className="font-mono font-semibold text-foreground">{r.key}</span>
                      &nbsp;· {r.title}
                    </span>
                  </div>

                  <div>
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
                      Affected requirements ({affectedRequirementKeys.length})
                    </Label>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      This requirement and its downstream dependents — all will be flagged suspect while this ECO is open.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {affectedRequirementKeys.map(k => (
                        <span key={k} className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-mono font-medium bg-muted text-foreground border border-border">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
                      Affected BOM parts ({affectedParts.length})
                    </Label>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      Auto-derived from this requirement's current BOM allocations.
                    </p>
                    {affectedParts.length === 0 ? (
                      <div className="flex items-center justify-center h-16 rounded-md border border-dashed border-border bg-muted/20 text-[12px] text-muted-foreground">
                        No parts currently allocated
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {affectedParts.map(p => (
                          <span key={p.partId} title={p.partName} className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-mono font-medium bg-muted text-foreground border border-border">
                            {p.partNumber}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Impact tab */}
          <TabsContent value="impact" className="flex-1 min-h-0 relative mt-0">
            <div className="absolute inset-0 overflow-y-auto">
              <div className="px-7 py-5 flex flex-col gap-5">
                <p className="text-[13px] text-muted-foreground">
                  Describe the consequences of this engineering change on the product or project.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <FL label="Impact Area">
                    <FSelect value={impactArea} onChange={v => setImpactArea(v as ImpactArea)} options={IMPACT_AREA_OPTIONS} labels={IMPACT_AREA_LABEL} />
                  </FL>
                  <FL label="Impact Level">
                    <FSelect value={impactLevel} onChange={v => setImpactLevel(v as ImpactLevel)} options={(['HIGH', 'MEDIUM', 'LOW'] as ImpactLevel[])} labels={IMPACT_LABEL} />
                  </FL>
                </div>
                {impactArea === 'other' && (
                  <FL label="Specify Impact Area" required>
                    <FInput
                      value={impactAreaOther}
                      onChange={e => { setImpactAreaOther(e.target.value); if (errors.impactAreaOther) setErrors(({ impactAreaOther: _o, ...rest }) => rest); }}
                      placeholder="e.g. Logistics, Documentation"
                      className={cn(errors.impactAreaOther && 'border-destructive')}
                    />
                    {errors.impactAreaOther && <p className="text-[11px] text-destructive flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" />{errors.impactAreaOther}</p>}
                  </FL>
                )}
                <FL label="Impact Description">
                  <textarea
                    value={impactDesc}
                    onChange={e => setImpactDesc(e.target.value)}
                    placeholder="Describe the full impact of this change — schedule effects, cost consequences, quality implications, safety considerations, etc."
                    rows={6}
                    className={cn(inputCls, 'resize-none')}
                  />
                </FL>
              </div>
            </div>
          </TabsContent>

          {/* Reason tab */}
          <TabsContent value="reason" className="flex-1 min-h-0 relative mt-0">
            <div className="absolute inset-0 overflow-y-auto">
              <div className="px-7 py-5 flex flex-col gap-5">
                <p className="text-[13px] text-muted-foreground">
                  Specify why this engineering change is needed.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <FL label="Change Type">
                    <FSelect value={changeType} onChange={v => setChangeType(v as ECOType)} options={Object.keys(ECO_TYPE_LABEL) as ECOType[]} labels={ECO_TYPE_LABEL} />
                  </FL>
                  <FL label="Reason Code">
                    <FSelect value={reasonCode} onChange={v => setReasonCode(v as ECOReason)} options={Object.keys(REASON_LABEL) as ECOReason[]} labels={REASON_LABEL} />
                  </FL>
                  <FL label="Priority">
                    <FSelect value={priority} onChange={v => setPriority(v as ECOPriority)} options={(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as ECOPriority[])} labels={PRIORITY_LABEL} />
                  </FL>
                </div>
                {(changeType === 'OTHER' || reasonCode === 'OTHER') && (
                  <div className="grid grid-cols-2 gap-4">
                    {changeType === 'OTHER' && (
                      <FL label="Specify Change Type" required>
                        <FInput
                          value={changeTypeOther}
                          onChange={e => { setChangeTypeOther(e.target.value); if (errors.changeTypeOther) setErrors(({ changeTypeOther: _c, ...rest }) => rest); }}
                          placeholder="e.g. Tooling Change"
                          className={cn(errors.changeTypeOther && 'border-destructive')}
                        />
                        {errors.changeTypeOther && <p className="text-[11px] text-destructive flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" />{errors.changeTypeOther}</p>}
                      </FL>
                    )}
                    {reasonCode === 'OTHER' && (
                      <FL label="Specify Reason" required>
                        <FInput
                          value={reasonCodeOther}
                          onChange={e => { setReasonCodeOther(e.target.value); if (errors.reasonCodeOther) setErrors(({ reasonCodeOther: _r, ...rest }) => rest); }}
                          placeholder="e.g. Field Failure"
                          className={cn(errors.reasonCodeOther && 'border-destructive')}
                        />
                        {errors.reasonCodeOther && <p className="text-[11px] text-destructive flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" />{errors.reasonCodeOther}</p>}
                      </FL>
                    )}
                  </div>
                )}
                <FL label="Reason Description">
                  <textarea
                    value={reasonDesc}
                    onChange={e => setReasonDesc(e.target.value)}
                    placeholder="Explain in detail why this change is necessary — root cause, customer feedback, regulatory requirement, etc."
                    rows={6}
                    className={cn(inputCls, 'resize-none')}
                  />
                </FL>
              </div>
            </div>
          </TabsContent>

          {/* Approval tab */}
          <TabsContent value="approval" className="flex-1 min-h-0 relative mt-0">
            <div className="absolute inset-0 overflow-y-auto">
              <div className="px-7 py-5 flex flex-col gap-2.5">
                <p className="text-[13px] text-muted-foreground mb-1">
                  Ordered sign-off pipeline · assign a project member to each stage · reorder with arrows · mark stages optional. Any change to the default requires a justification.
                </p>
                {projectMembers.length === 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px]" style={{ color: '#F59E0B', background: '#F59E0B14', border: '1px solid #F59E0B33' }}>
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    No project members found — add members to the project team before assigning approvers.
                  </div>
                )}
                {pipeline.map((p, idx) => {
                  const moved = stageMoved(p, idx);
                  const needsReason = p.optional || moved;
                  return (
                    <div key={idx} className="border rounded-lg px-3 py-2.5" style={{ borderColor: needsReason ? '#F59E0B55' : 'hsl(var(--border))' }}>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-muted-foreground w-5">{idx + 1}</span>
                        <ECOAvatar name={p.name || '?'} size={26} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                            {p.isCustom ? (
                              <input
                                value={p.stage}
                                onChange={e => setPipeline(pl => pl.map((x, i) => i === idx ? { ...x, stage: e.target.value } : x))}
                                placeholder="Stage name…"
                                className={inputCls}
                                style={{ fontSize: 13, fontWeight: 600, padding: '1px 6px', width: 160, borderColor: p.stage.trim() ? undefined : '#F59E0B88' }}
                              />
                            ) : p.stage}
                            <span className="text-destructive font-semibold ml-0.5">*</span>
                            {moved && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: '#F59E0B', background: '#F59E0B1f', border: '1px solid #F59E0B33' }}>
                                reordered
                              </span>
                            )}
                          </div>
                          <div className="relative mt-0.5 w-full max-w-[240px]">
                            <select
                              value={p.approverId ?? ''}
                              onChange={e => assignApprover(idx, e.target.value)}
                              className="w-full bg-muted/40 border rounded-md text-foreground text-[11px] pl-2 pr-7 py-1 outline-none focus:border-primary/40 cursor-pointer appearance-none font-[inherit]"
                              style={{ borderColor: p.approverId ? 'hsl(var(--border))' : '#F59E0B88' }}
                            >
                              <option value="" disabled className="bg-card">Select approver *</option>
                              {projectMembers.map(m => (
                                <option key={m.id} value={m.id} className="bg-card">{m.name} · {m.role}</option>
                              ))}
                            </select>
                            <ChevronDown className="w-3 h-3 text-muted-foreground pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                          </div>
                        </div>
                        <button
                          onClick={() => setPipeline(pl => pl.map((x, i) => i === idx ? { ...x, optional: !x.optional } : x))}
                          className="px-2 py-1 rounded-full text-[10px] font-semibold transition-colors font-[inherit]"
                          style={{
                            background: p.optional ? '#F59E0B1a' : 'hsl(var(--muted))',
                            color: p.optional ? '#F59E0B' : undefined,
                            border: `1px solid ${p.optional ? '#F59E0B44' : 'hsl(var(--border))'}`,
                            cursor: 'pointer',
                          }}
                        >
                          {p.optional ? 'Optional' : 'Required'}
                        </button>
                        <div className="flex flex-col gap-0.5">
                          <button
                            disabled={idx === 0}
                            onClick={() => setPipeline(pl => { const n = [...pl]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n; })}
                            className="disabled:opacity-30 cursor-pointer disabled:cursor-default"
                            style={{ background: 'none', border: 'none', padding: 0 }}
                          >
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground rotate-180" />
                          </button>
                          <button
                            disabled={idx === pipeline.length - 1}
                            onClick={() => setPipeline(pl => { const n = [...pl]; [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]]; return n; })}
                            className="disabled:opacity-30 cursor-pointer disabled:cursor-default"
                            style={{ background: 'none', border: 'none', padding: 0 }}
                          >
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </div>
                        <button
                          onClick={() => setPipeline(pl => pl.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {needsReason && (
                        <div className="mt-2.5 pt-2.5 border-t border-dashed border-border/60">
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#F59E0B' }}>
                            <AlertCircle className="w-3 h-3" />
                            {p.optional ? 'Why optional' : 'Why reordered'} <span className="text-destructive ml-0.5">*</span> — justification required
                          </div>
                          <input
                            value={p.justification ?? ''}
                            onChange={e => setPipeline(pl => pl.map((x, i) => i === idx ? { ...x, justification: e.target.value } : x))}
                            placeholder={p.optional ? `e.g. ${p.stage} waived — low geometric risk` : 'e.g. moved Final ahead of QA per program waiver'}
                            className={inputCls}
                            style={{ borderColor: (p.justification ?? '').trim() ? undefined : '#F59E0B88' }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                <button
                  onClick={() => setPipeline(pl => [
                    ...pl,
                    { order: pl.length, stage: '', name: '', role: '', approverId: null, optional: false, justification: '', isCustom: true },
                  ])}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors w-fit font-[inherit]"
                  style={{ background: 'none', border: '1px dashed hsl(var(--border))', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add stage
                </button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-border flex items-center justify-between gap-4 shrink-0 bg-card">
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            {activeTab !== 'approval' ? (
              <span>Step {TABS.indexOf(activeTab) + 1} of {TABS.length}</span>
            ) : canSubmit ? (
              <>
                <Check className="w-3.5 h-3.5" style={{ color: '#16A34A' }} />
                <span>Ready to create ECO</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#F59E0B' }} />
                <span>
                  {pipeline.length < 1
                    ? 'At least 1 approval stage is required'
                    : 'Assign an approver to every stage, and a justification for each optional / reordered stage'}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-md text-sm font-medium border border-border bg-transparent text-foreground hover:bg-muted transition-colors font-[inherit]"
            >
              Cancel
            </button>
            {TABS.indexOf(activeTab) > 0 && (
              <button
                onClick={() => { setErrors({}); setActiveTab(TABS[TABS.indexOf(activeTab) - 1]); }}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium border border-border bg-transparent text-foreground hover:bg-muted transition-colors font-[inherit]"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            {activeTab !== 'approval' ? (
              <button
                onClick={handleNext}
                disabled={!isTabValid}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-[inherit]"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || createMutation.isPending}
                className="px-4 py-1.5 rounded-md text-sm font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-[inherit]"
              >
                {createMutation.isPending ? 'Creating…' : 'Create ECO'}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
