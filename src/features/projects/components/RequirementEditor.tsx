import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft, Sparkles, Check, X, Zap, Activity, ToggleRight, ShieldAlert,
  GitBranch, PenLine, Infinity as InfinityIcon, ChevronDown,
} from 'lucide-react';
import {
  REQS, BY_KEY, REQ_TYPE, REQ_CATEGORY, REQ_STATUS, REQ_PRIORITY,
  REQ_TEAM, EARS, analyzeQuality,
  type ReqType, type ReqCategory, type ReqStatus, type ReqPriority,
} from './requirementsData';
import { ScoreRing, softTint } from './RequirementsShared';
import { useCreateRequirement, useUpdateRequirement, type ApiRequirementGroup } from '@/hooks/useRequirements';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FormState {
  pattern: string; subject: string; response: string; trigger: string;
  state: string; feature: string; condition: string; free: string;
  title: string;
  type: ReqType; category: ReqCategory; priority: ReqPriority; status: ReqStatus;
  vmethod: string; owner: string; rationale: string;
  targetValue: string; targetTolerance: string; targetUnit: string;
  groupId: string; parentId: string;
}

export interface ParsedEARS {
  pattern: 'ubiquitous' | 'event' | 'state' | 'optional' | 'unwanted' | 'complex' | 'free';
  subject: string;
  response: string;
  trigger: string;
  state: string;
  feature: string;
  condition: string;
}

export function parseEARSStatement(text: string): ParsedEARS {
  const clean = (text || '').trim().replace(/\s*\.\s*$/, '');
  if (!clean) {
    return { pattern: 'ubiquitous', subject: 'system', response: '', trigger: '', state: '', feature: '', condition: '' };
  }

  const complexMatch = clean.match(/^While\s+(.+?),\s*when\s+(.+?),\s*(?:the\s+)?(.+?)\s+shall\s+(.+)$/i);
  if (complexMatch) {
    return { pattern: 'complex', state: complexMatch[1].trim(), trigger: complexMatch[2].trim(), subject: complexMatch[3].trim(), response: complexMatch[4].trim(), feature: '', condition: '' };
  }

  const eventMatch = clean.match(/^When\s+(.+?),\s*(?:the\s+)?(.+?)\s+shall\s+(.+)$/i);
  if (eventMatch) {
    return { pattern: 'event', trigger: eventMatch[1].trim(), subject: eventMatch[2].trim(), response: eventMatch[3].trim(), state: '', feature: '', condition: '' };
  }

  const stateMatch = clean.match(/^While\s+(.+?),\s*(?:the\s+)?(.+?)\s+shall\s+(.+)$/i);
  if (stateMatch) {
    return { pattern: 'state', state: stateMatch[1].trim(), subject: stateMatch[2].trim(), response: stateMatch[3].trim(), trigger: '', feature: '', condition: '' };
  }

  const optionalMatch = clean.match(/^Where\s+(.+?),\s*(?:the\s+)?(.+?)\s+shall\s+(.+)$/i);
  if (optionalMatch) {
    return { pattern: 'optional', feature: optionalMatch[1].trim(), subject: optionalMatch[2].trim(), response: optionalMatch[3].trim(), trigger: '', state: '', condition: '' };
  }

  const unwantedMatch = clean.match(/^If\s+(.+?),\s*(?:then\s+)?(?:the\s+)?(.+?)\s+shall\s+(.+)$/i);
  if (unwantedMatch) {
    return { pattern: 'unwanted', condition: unwantedMatch[1].trim(), subject: unwantedMatch[2].trim(), response: unwantedMatch[3].trim(), trigger: '', state: '', feature: '' };
  }

  const ubiMatch = clean.match(/^(?:The\s+)?(.+?)\s+shall\s+(.+)$/i);
  if (ubiMatch) {
    return { pattern: 'ubiquitous', subject: ubiMatch[1].trim(), response: ubiMatch[2].trim(), trigger: '', state: '', feature: '', condition: '' };
  }

  return { pattern: 'free', subject: 'system', response: clean, trigger: '', state: '', feature: '', condition: '' };
}

const DEFAULT_PAT_FIELDS: Record<string, { trigger?: string; state?: string; feature?: string; condition?: string }> = {
  event: { trigger: 'a vehicle is connected' },
  state: { state: 'charging at rated power' },
  optional: { feature: 'card payment is enabled' },
  unwanted: { condition: 'a ground fault is detected' },
  complex: { state: 'a session is active', trigger: 'the e-stop is pressed' },
};

const defaultForm = (defaultGroupId: string): FormState => ({
  pattern:'ubiquitous', subject:'system', response:'provide the specified functionality', trigger:'a vehicle is connected', state:'charging at rated power', feature:'card payment is enabled', condition:'a ground fault is detected', free:'',
  title:'',
  type:'system-req', category:'functional', priority:'medium', status:'draft', vmethod:'test',
  owner: REQ_TEAM[0]?.id ?? '', rationale:'', targetValue:'', targetTolerance:'', targetUnit:'',
  groupId: defaultGroupId, parentId:'',
});

const PATTERN_ICONS: Record<string, React.ElementType> = {
  ubiquitous: InfinityIcon, event: Zap, state: Activity, optional: ToggleRight, unwanted: ShieldAlert, complex: GitBranch, free: PenLine,
};

const REWRITE: Record<string, string> = {
  quickly:'within the specified time', fast:'within the specified time', meaningful:'the specified amount of',
  practical:'specified', minimal:'no more than the specified', 'user-friendly':'compliant with the HMI spec',
  easy:'per the HMI spec', efficient:'at the specified efficiency', robust:'per the reliability spec',
  flexible:'configurable', 'as needed':'per the configured schedule', sufficient:'the specified',
  adequate:'the specified', reasonable:'the specified', optimal:'the specified', seamless:'uninterrupted',
  intuitive:'per the HMI spec', support:'provide', handle:'process',
};

function rewriteWeak(text: string): string {
  let out = text;
  Object.keys(REWRITE).forEach(w => { out = out.replace(new RegExp('\\b'+w.replace('/','\\/')+'\\b','gi'), REWRITE[w]); });
  return out.replace(/\s{2,}/g,' ').trim();
}

function previewStatement(form: FormState): string {
  const p = EARS[form.pattern];
  if (!p) return '';
  const fields: Record<string,string> = { subject:form.subject||'system', response:form.response, trigger:form.trigger, state:form.state, feature:form.feature, condition:form.condition, free:form.free };
  return p.tpl(fields);
}

function highlightEARS(text: string): React.ReactNode {
  const parts = text.split(/(\bWhile\b|\bWhen\b|\bIf\b|\bWhere\b|\bthen\b|\bshall\b)/g);
  return parts.map((p, i) => {
    const low = p.toLowerCase();
    if (['while','when','if','where','then'].includes(low)) return <strong key={i} className="text-blue-500">{p}</strong>;
    if (low === 'shall') return <strong key={i} className="text-purple-500">{p}</strong>;
    return <span key={i}>{p}</span>;
  });
}

// ── Editor entry point ────────────────────────────────────────────────────────
export default function RequirementEditor({ reqKey, projectId, groups, onClose, onSaved }:
  { reqKey: string|null; projectId: string; groups: ApiRequirementGroup[]; onClose: () => void; onSaved: () => void }) {

  const existing = reqKey ? BY_KEY[reqKey] : null;
  const [form, setForm] = useState<FormState>(() => {
    if (!existing) return defaultForm(groups[0]?.id ?? '');

    const parsed = parseEARSStatement(existing.statement);
    const patKey = parsed.pattern !== 'free' ? parsed.pattern : 'ubiquitous';
    const defaults = DEFAULT_PAT_FIELDS[patKey] ?? {};

    return {
      pattern: parsed.pattern,
      subject: parsed.subject || 'system',
      response: parsed.response || existing.statement,
      trigger: parsed.trigger || defaults.trigger || 'a vehicle is connected',
      state: parsed.state || defaults.state || 'charging at rated power',
      feature: parsed.feature || defaults.feature || 'card payment is enabled',
      condition: parsed.condition || defaults.condition || 'a ground fault is detected',
      free: existing.statement,
      title: existing.title,
      type: existing.type, category: existing.category, priority: existing.priority,
      status: existing.status, vmethod: existing.vmethod, owner: existing.owner,
      rationale: existing.rationale,
      targetValue: existing.target?.value.toString() ?? '',
      targetTolerance: existing.target?.tolerance ?? '',
      targetUnit: existing.target?.unit ?? '',
      groupId: existing._groupId ?? groups[0]?.id ?? '',
      parentId: existing.parent ? (BY_KEY[existing.parent]?._id ?? '') : '',
    };
  });

  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(p => ({ ...p, [k]: v }));

  const handlePatternSelect = (k: string) => {
    setForm(prev => {
      const defaults = DEFAULT_PAT_FIELDS[k] ?? {};
      let currentResp = prev.response || prev.free;
      let currentSubj = prev.subject || 'system';

      if (!currentResp && existing?.statement) {
        const parsed = parseEARSStatement(existing.statement);
        currentResp = parsed.response || existing.statement;
        if (parsed.subject) currentSubj = parsed.subject;
      }

      return {
        ...prev,
        pattern: k,
        subject: currentSubj,
        response: currentResp || (existing ? existing.statement : 'provide the specified functionality'),
        trigger: prev.trigger || defaults.trigger || 'a vehicle is connected',
        state: prev.state || defaults.state || 'charging at rated power',
        feature: prev.feature || defaults.feature || 'card payment is enabled',
        condition: prev.condition || defaults.condition || 'a ground fault is detected',
        free: currentResp || prev.free,
      };
    });
  };
  const preview = previewStatement(form);
  // Live AI quality panel is commented out for now (see below) — commenting this
  // out too so it doesn't compute on every keystroke for nothing.
  // const ai = useMemo(() => analyzeQuality({ statement:preview, type:form.type, category:form.category, vmethod:form.vmethod as any, vstatus:'not-verified', rationale:form.rationale, parent:null, source:'' }), [preview, form.type, form.category, form.vmethod, form.rationale]);

  const pat = EARS[form.pattern];

  // Parent options: any requirement with a strictly lower tier than the chosen
  // type — mirrors the backend's own tier-validation rule (see
  // requirements.service.ts's REQUIREMENT_TIER map). Not filtered by group —
  // cross-group parenting is normal (e.g. a system-req in SYS parenting a
  // subsystem-req in PWR), matching the original data's own structure.
  const parentOptions = useMemo(() => {
    const tier = REQ_TYPE[form.type].tier;
    return REQS
      .filter(r => REQ_TYPE[r.type].tier < tier && r._id && r._id !== existing?._id)
      .map(r => ({ value: r._id as string, label: `${r.key} — ${r.title}` }));
  }, [form.type, existing?._id]);

  const createMutation = useCreateRequirement(projectId);
  const updateMutation = useUpdateRequirement(projectId);
  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSave = async () => {
    const statement = (preview || form.free).trim();
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!statement) { toast.error('Statement is required'); return; }
    if (!form.groupId) { toast.error('Select a group'); return; }

    const target = form.targetValue.trim()
      ? { value: Number(form.targetValue), tolerance: form.targetTolerance || undefined, unit: form.targetUnit || undefined }
      : null;

    try {
      if (existing?._id) {
        await updateMutation.mutateAsync({
          requirementId: existing._id,
          payload: {
            groupId: form.groupId,
            parentId: form.parentId || null,
            category: form.category,
            priority: form.priority,
            status: form.status,
            title: form.title,
            statement,
            rationale: form.rationale || undefined,
            target,
            ownerId: form.owner || undefined,
          },
        });
        toast.success('Requirement updated');
      } else {
        await createMutation.mutateAsync({
          groupId: form.groupId,
          parentId: form.parentId || null,
          type: form.type.replace(/-/g, '_'),
          category: form.category,
          priority: form.priority,
          title: form.title,
          statement,
          rationale: form.rationale || undefined,
          target,
          ownerId: form.owner || undefined,
        });
        toast.success('Requirement created');
      }
      onSaved();
    } catch {
      toast.error(existing ? 'Failed to update requirement' : 'Failed to create requirement');
    }
  };

  return (
    <div className="flex flex-col bg-background overflow-hidden" style={{ height: 'calc(100vh - 75px)', minHeight: 0 }}>
      {/* header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card shrink-0">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={onClose}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <span className="text-base font-bold text-foreground">{existing ? `Edit ${existing.key}` : 'New Requirement'}</span>
        <div className="flex-1" />
        <Button size="sm" className="h-8 gap-1.5 text-[12.5px]" onClick={handleSave} disabled={saving}>
          <Check className="w-3.5 h-3.5" /> {saving ? 'Saving…' : existing ? 'Save changes' : 'Create'}
        </Button>
      </div>

      {/* body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* main form */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="w-full">

            {/* 1. EARS pattern */}
            <EditorCard num="1" title="EARS pattern" icon={GitBranch}>
              <div className="flex flex-wrap gap-1.5 mb-3.5">
                {Object.keys(EARS).map(k => {
                  const p = EARS[k]; const Ic = PATTERN_ICONS[k] ?? PenLine; const active = form.pattern === k;
                  return (
                    <button key={k} onClick={() => handlePatternSelect(k)}
                      className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs cursor-pointer transition-colors',
                        active ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border bg-card text-foreground font-normal hover:bg-muted')}>
                      <Ic className="w-3 h-3" />{p.label}
                    </button>
                  );
                })}
              </div>
              {pat && (
                <div className="px-3 py-2 rounded-md bg-muted/40 text-[12.5px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{pat.label}</span> — {pat.desc}
                </div>
              )}
            </EditorCard>

            {/* 2. Statement fields */}
            <EditorCard num="2" title="Statement fields" icon={PenLine}>
              <Field label="Title" required hint="Short label shown in lists">
                <EdInput value={form.title} onChange={v => upd('title',v)} placeholder="e.g. Rated DC output power"/>
              </Field>
              <Field label="Subject" required hint="The entity that shall do something">
                <EdInput value={form.subject} onChange={v => upd('subject',v)} placeholder="e.g. charging station"/>
              </Field>
              {pat?.fields.map(([name, label, placeholder]) => (
                <Field key={name} label={label}>
                  <EdInput value={form[name as keyof FormState] as string} onChange={v => upd(name as keyof FormState, v)} placeholder={placeholder}/>
                </Field>
              ))}
              {form.pattern !== 'free' && (
                <Field label="Response" required hint="What shall happen">
                  <EdTextarea value={form.response} onChange={v => upd('response',v)} placeholder="provide DC output at the rated power…" rows={2}/>
                </Field>
              )}

              {/* preview */}
              <div className="mt-3 px-3.5 py-2.5 rounded-md border border-border bg-muted/40">
                <div className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Live preview</div>
                <p className="text-[13.5px] text-foreground leading-relaxed m-0">{highlightEARS(preview || '…')}</p>
                {preview && (
                  <button onClick={() => { const rw = rewriteWeak(form.free || preview); upd('free', rw); if (form.pattern !== 'free') upd('pattern','free'); }}
                    className="mt-2 text-[11.5px] text-primary hover:underline cursor-pointer bg-transparent border-none p-0">
                    <Sparkles className="w-3 h-3 inline -mt-0.5 mr-0.5" /> Auto-clarify ambiguous terms
                  </button>
                )}
              </div>
            </EditorCard>

            {/* 3. Target */}
            <EditorCard num="3" title="Quantitative target (optional)" icon={Activity}>
              <div className="flex gap-2.5">
                <Field label="Value" hint="numeric"><EdInput value={form.targetValue} onChange={v => upd('targetValue',v)} placeholder="150"/></Field>
                <Field label="Tolerance"><EdInput value={form.targetTolerance} onChange={v => upd('targetTolerance',v)} placeholder="±2 or max or min"/></Field>
                <Field label="Unit"><EdInput value={form.targetUnit} onChange={v => upd('targetUnit',v)} placeholder="kW"/></Field>
              </div>
            </EditorCard>

            {/* 4. Metadata */}
            <EditorCard num="4" title="Metadata" icon={Activity}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <EdSelect value={form.type} onChange={v => upd('type', v as ReqType)} options={Object.keys(REQ_TYPE).map(k => ({ value:k, label:REQ_TYPE[k as ReqType].label }))}/>
                </Field>
                <Field label="Category">
                  <EdSelect value={form.category} onChange={v => upd('category', v as ReqCategory)} options={Object.keys(REQ_CATEGORY).map(k => ({ value:k, label:REQ_CATEGORY[k as ReqCategory].label }))}/>
                </Field>
                <Field label="Priority">
                  <EdSelect value={form.priority} onChange={v => upd('priority', v as ReqPriority)} options={Object.keys(REQ_PRIORITY).map(k => ({ value:k, label:REQ_PRIORITY[k as ReqPriority].label }))}/>
                </Field>
                <Field label="Status">
                  <EdSelect value={form.status} onChange={v => upd('status', v as ReqStatus)} options={Object.keys(REQ_STATUS).filter(k => k!=='obsolete').map(k => ({ value:k, label:REQ_STATUS[k as ReqStatus].label }))}/>
                </Field>
                <Field label="Verification method">
                  <EdSelect value={form.vmethod} onChange={v => upd('vmethod', v)} options={[{value:'test',label:'Test'},{value:'analysis',label:'Analysis'},{value:'inspection',label:'Inspection'},{value:'demonstration',label:'Demonstration'}]}/>
                </Field>
                <Field label="Owner">
                  <EdSelect value={form.owner} onChange={v => upd('owner', v)} options={REQ_TEAM.map(m => ({ value:m.id, label:m.name }))}/>
                </Field>
                <Field label="Group">
                  <EdSelect value={form.groupId} onChange={v => upd('groupId', v)}
                    options={groups.map(g => ({ value:g.id, label:g.label }))}/>
                </Field>
                <Field label="Parent" hint="optional">
                  <EdSelect value={form.parentId} onChange={v => upd('parentId', v)}
                    options={[{ value:'', label:'— None (top-level) —' }, ...parentOptions]}/>
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Rationale" hint="Why does this requirement exist?">
                  <EdTextarea value={form.rationale} onChange={v => upd('rationale',v)} placeholder="Explain the design intent and source of this requirement…" rows={3}/>
                </Field>
              </div>
            </EditorCard>

          </div>
        </div>

        {/* live AI quality panel — commented out for now, not deleted.
            To bring it back: uncomment this block and the `ai` useMemo above.
        <div className="w-[300px] shrink-0 border-l border-border bg-card overflow-y-auto p-4">
          <div className="flex items-center gap-1.5 mb-3.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-[13.5px] font-semibold text-foreground">Live AI quality</span>
          </div>

          <div className="flex items-center gap-3.5 mb-4 px-3.5 py-3 rounded-lg border"
            style={{ borderColor: softTint(ai.tint, 0.3), background: softTint(ai.tint, 0.05) }}>
            <ScoreRing pct={ai.pct} tint={ai.tint} grade={ai.grade} size={64}/>
            <div>
              <div className="text-xl font-extrabold leading-none" style={{ color: ai.tint }}>{ai.pct}%</div>
              <div className="text-[11px] text-muted-foreground mt-1">quality score</div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mb-4">
            {ai.checks.map(c => (
              <div key={c.id} className="flex items-start gap-1.5">
                <span className="w-[15px] h-[15px] rounded-full shrink-0 mt-0.5 inline-flex items-center justify-center"
                  style={{ background: c.pass ? softTint('#16A34A', 0.15) : softTint('#DC2626', 0.15) }}>
                  {c.pass ? <Check className="w-2.5 h-2.5 text-green-600" /> : <X className="w-2.5 h-2.5 text-red-600" />}
                </span>
                <div>
                  <div className="text-[11.5px] font-semibold text-foreground">{c.label}</div>
                  <div className="text-[10.5px] text-muted-foreground leading-snug">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>

          {ai.suggestions.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="text-[11.5px] font-bold text-foreground mb-2 uppercase tracking-wide">Suggestions</div>
              {ai.suggestions.map((s, i) => (
                <div key={i} className="flex gap-1.5 px-2.5 py-1.5 rounded-md bg-muted mb-1.5">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-primary/10 text-primary">{s.kind}</span>
                  <span className="text-[11px] text-foreground leading-snug">{s.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        */}
      </div>
    </div>
  );
}

// ── Form primitives ───────────────────────────────────────────────────────────
function EditorCard({ num, title, icon:Ic, children }: { num:string; title:string; icon:React.ElementType; children:React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden mb-4">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <span className="w-[22px] h-[22px] rounded-full shrink-0 bg-primary/10 text-primary text-[11.5px] font-bold inline-flex items-center justify-center">{num}</span>
        <Ic className="w-3.5 h-3.5 text-muted-foreground"/>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, required, children }: { label:string; hint?:string; required?:boolean; children:React.ReactNode }) {
  return (
    <div className="mb-3 flex-1 min-w-0">
      <div className="flex items-center gap-1 mb-1">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
        {required && <span className="text-[11px] text-destructive">*</span>}
        {hint && <span className="text-[11px] text-muted-foreground normal-case tracking-normal">· {hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-muted/40 border border-border rounded-md text-foreground text-[13px] px-2.5 py-2 outline-none focus:border-primary/40 placeholder:text-muted-foreground/50 font-[inherit] transition-colors';

function EdInput({ value, onChange, placeholder, mono }: { value:string; onChange:(v:string)=>void; placeholder?:string; mono?:boolean }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={cn(inputCls, mono && 'font-mono')}/>
  );
}

function EdTextarea({ value, onChange, placeholder, rows=3 }: { value:string; onChange:(v:string)=>void; placeholder?:string; rows?:number }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      className={cn(inputCls, 'resize-y leading-relaxed')}/>
  );
}

function EdSelect({ value, onChange, options }: { value:string; onChange:(v:string)=>void; options:{value:string;label:string}[] }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className={cn(inputCls, 'cursor-pointer appearance-none pr-8')}>
        {options.map(o => <option key={o.value} value={o.value} className="bg-card">{o.label}</option>)}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
    </div>
  );
}
