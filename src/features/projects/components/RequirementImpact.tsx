import React, { useState } from 'react';
import { X, GitPullRequest, GitBranch, Package, ClipboardCheck, AlertTriangle, CircleCheck, ArrowRight } from 'lucide-react';
import { BY_KEY, impactOf } from './requirementsData';
import { ReqKeyTag, StatusBadge, PriorityPill, softTint } from './RequirementsShared';
import { RequirementECOSheet } from './RequirementECOSheet';

export default function RequirementImpact({ reqKey, projectId, onClose, onOpen, onEcoCreated }:
  { reqKey: string; projectId: string; onClose: () => void; onOpen: (k:string) => void; onEcoCreated?: (ecoId: string) => void }) {

  const r = BY_KEY[reqKey];
  const [stage, setStage] = useState<'assess'|'sheet'|'raised'>('assess');
  const [createdEcoId, setCreatedEcoId] = useState<string | null>(null);

  if (!r) return null;

  const impact = impactOf(reqKey);
  const sev = impact.blast >= 12 ? { label:'High', tint:'#DC2626' }
            : impact.blast >=  5 ? { label:'Medium', tint:'#D97706' }
            :                      { label:'Low', tint:'#16A34A' };
  const effortDays = Math.max(2, Math.round(impact.blast * 0.8));

  return (
    <>
      {/* z-index above everything else the Requirements feature renders,
          including the Map view's fullscreen mode (zIndex 1000) and its
          floating toolbar/minimap (up to 210) — otherwise those controls
          render on top of this drawer's backdrop instead of behind it. */}
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.42)', zIndex:1050 }}/>
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:480, maxWidth:'94vw', zIndex:1051, background:'hsl(var(--card))', borderLeft:'1px solid hsl(var(--border))', boxShadow:'-12px 0 40px rgba(0,0,0,0.18)', display:'flex', flexDirection:'column' }}>

        {/* header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid hsl(var(--border))', display:'flex', alignItems:'flex-start', gap:12 }}>
          <span style={{ width:36, height:36, borderRadius:9, flexShrink:0, background:softTint('#D97706',0.12), display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
            <GitPullRequest size={18} color="#D97706"/>
          </span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:15, fontWeight:600, color:'hsl(var(--foreground))' }}>Change impact</div>
            <div style={{ fontSize:12.5, color:'hsl(var(--muted-foreground))' }}>
              <ReqKeyTag reqKey={r.key}/> · {r.title}
            </div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, borderRadius:7, border:'1px solid hsl(var(--border))', background:'hsl(var(--card))', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
            onMouseEnter={e=>(e.currentTarget.style.background='hsl(var(--muted))')} onMouseLeave={e=>(e.currentTarget.style.background='hsl(var(--card))')}>
            <X size={17} color="hsl(var(--muted-foreground))"/>
          </button>
        </div>

        {stage !== 'raised' ? (
          <>
            <div style={{ flex:1, overflowY:'auto', padding:20 }}>
              {/* blast summary */}
              <div style={{ display:'flex', gap:12, marginBottom:18 }}>
                <div style={{ flex:1, padding:'13px 14px', borderRadius:10, border:`1px solid ${softTint(sev.tint,0.3)}`, background:softTint(sev.tint,0.05) }}>
                  <div style={{ fontSize:10.5, fontWeight:700, color:'hsl(var(--muted-foreground))', textTransform:'uppercase', letterSpacing:'0.05em' }}>Blast radius</div>
                  <div style={{ display:'flex', alignItems:'baseline', gap:7, marginTop:4 }}>
                    <span style={{ fontSize:26, fontWeight:700, color:sev.tint, lineHeight:1 }}>{impact.blast}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:sev.tint }}>{sev.label}</span>
                  </div>
                  <div style={{ fontSize:11, color:'hsl(var(--muted-foreground))', marginTop:3 }}>linked artifacts affected</div>
                </div>
                <div style={{ flex:1, padding:'13px 14px', borderRadius:10, border:'1px solid hsl(var(--border))', background:'hsl(var(--background))' }}>
                  <div style={{ fontSize:10.5, fontWeight:700, color:'hsl(var(--muted-foreground))', textTransform:'uppercase', letterSpacing:'0.05em' }}>Est. effort</div>
                  <div style={{ display:'flex', alignItems:'baseline', gap:7, marginTop:4 }}>
                    <span style={{ fontSize:26, fontWeight:700, color:'hsl(var(--foreground))', lineHeight:1 }}>{effortDays}</span>
                    <span style={{ fontSize:12, color:'hsl(var(--muted-foreground))' }}>days</span>
                  </div>
                  <div style={{ fontSize:11, color:'hsl(var(--muted-foreground))', marginTop:3 }}>re-design + re-verification</div>
                </div>
              </div>

              {/* AI trace summary */}
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:9, background:softTint('#3B82F6',0.06), border:`1px solid ${softTint('#3B82F6',0.18)}`, marginBottom:18 }}>
                <AlertTriangle size={14} color="#3B82F6"/>
                <span style={{ fontSize:12, color:'hsl(var(--foreground))', lineHeight:1.45 }}>
                  AI traced <strong>{impact.descendants.length}</strong> downstream requirements, <strong>{impact.parts.length}</strong> BOM parts and <strong>{impact.tests.length}</strong> test cases from this requirement's links.
                </span>
              </div>

              {/* sections */}
              {impact.descendants.length > 0 && (
                <ImpactSection icon={GitBranch} title="Downstream requirements" count={impact.descendants.length} tint="#DC2626" desc="Would be flagged suspect and need re-review.">
                  {impact.descendants.slice(0,6).map(k => <ImpactRow key={k} id={k} kind="suspect" onOpen={() => { onClose(); onOpen(k); }}/>)}
                  {impact.descendants.length > 6 && <div style={{ fontSize:11.5, color:'hsl(var(--muted-foreground))' }}>+ {impact.descendants.length-6} more</div>}
                </ImpactSection>
              )}

              {impact.parts.length > 0 && (
                <ImpactSection icon={Package} title="Affected BOM parts" count={impact.parts.length} tint="#D97706" desc="Allocated hardware that may require ECO.">
                  {impact.parts.slice(0,6).map(p => <ImpactRow key={p} id={p} kind="part"/>)}
                  {impact.parts.length > 6 && <div style={{ fontSize:11.5, color:'hsl(var(--muted-foreground))' }}>+ {impact.parts.length-6} more</div>}
                </ImpactSection>
              )}

              {impact.tests.length > 0 && (
                <ImpactSection icon={ClipboardCheck} title="Test cases to re-run" count={impact.tests.length} tint="#9333EA" desc="Verification evidence invalidated by the change.">
                  {impact.tests.slice(0,5).map(k => <ImpactRow key={`TC-${k}`} id={`TC-${k}`} kind="test"/>)}
                  {impact.tests.length > 5 && <div style={{ fontSize:11.5, color:'hsl(var(--muted-foreground))' }}>+ {impact.tests.length-5} more</div>}
                </ImpactSection>
              )}
            </div>

            {/* footer */}
            <div style={{ padding:'14px 20px', borderTop:'1px solid hsl(var(--border))', display:'flex', gap:10 }}>
              <button onClick={onClose} style={{ flex:'0 0 auto', height:38, padding:'0 16px', borderRadius:8, border:'1px solid hsl(var(--border))', background:'hsl(var(--card))', color:'hsl(var(--foreground))', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
              <button onClick={() => setStage('sheet')} style={{ flex:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, height:38, borderRadius:8, border:'none', background:'#D97706', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                <GitPullRequest size={15} color="#fff"/>Raise ECO with this scope
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 28px', textAlign:'center' }}>
            <span style={{ width:56, height:56, borderRadius:14, background:softTint('#16A34A',0.12), display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:18 }}>
              <CircleCheck size={28} color="#16A34A"/>
            </span>
            <div style={{ fontSize:17, fontWeight:600, color:'hsl(var(--foreground))', marginBottom:6 }}>Engineering change created</div>
            <div style={{ fontSize:13, color:'hsl(var(--muted-foreground))', lineHeight:1.55, marginBottom:8, maxWidth:320 }}>
              A change order was created for <strong style={{ color:'hsl(var(--foreground))' }}>{r.key}</strong> and its downstream requirements — now flagged suspect while it's open.
            </div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'6px 13px', borderRadius:9999, background:'hsl(var(--muted))', border:'1px solid hsl(var(--border))', fontSize:12, color:'hsl(var(--muted-foreground))', marginBottom:22 }}>
              <GitPullRequest size={13} color="#D97706"/> Routed to Eng. Changes for approval
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={onClose} style={{ height:38, padding:'0 16px', borderRadius:8, border:'1px solid hsl(var(--border))', background:'hsl(var(--card))', color:'hsl(var(--foreground))', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>Close</button>
              <button onClick={() => { if (createdEcoId) onEcoCreated?.(createdEcoId); onClose(); }} style={{ display:'inline-flex', alignItems:'center', gap:7, height:38, padding:'0 16px', borderRadius:8, border:'none', background:'hsl(var(--foreground))', color:'hsl(var(--background))', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                <ArrowRight size={15} color="hsl(var(--background))"/>Open change order
              </button>
            </div>
          </div>
        )}
        {stage === 'sheet' && (
          <RequirementECOSheet
            open
            onClose={() => setStage('assess')}
            reqKey={reqKey}
            projectId={projectId}
            onCreated={(ecoId) => { setCreatedEcoId(ecoId); setStage('raised'); }}
          />
        )}
      </div>
    </>
  );
}

function ImpactSection({ icon:Ic, title, count, tint, desc, children }: { icon:React.ElementType; title:string; count:number; tint:string; desc:string; children:React.ReactNode }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:8 }}>
        <span style={{ width:28, height:28, borderRadius:8, flexShrink:0, background:softTint(tint,0.12), display:'inline-flex', alignItems:'center', justifyContent:'center' }}><Ic size={14} color={tint}/></span>
        <span style={{ fontSize:13, fontWeight:600, color:'hsl(var(--foreground))', flex:1 }}>{title}</span>
        <span style={{ fontSize:12.5, fontWeight:700, color:tint }}>{count}</span>
      </div>
      <div style={{ fontSize:11.5, color:'hsl(var(--muted-foreground))', marginBottom:8, marginLeft:37 }}>{desc}</div>
      <div style={{ marginLeft:37 }}>{children}</div>
    </div>
  );
}

function ImpactRow({ id, kind, onOpen }: { id:string; kind:'suspect'|'part'|'test'; onOpen?:()=>void }) {
  const req = BY_KEY[id];
  const [hov, setHov] = useState(false);
  const col = kind==='part'?'#D97706':kind==='test'?'#9333EA':'#3B82F6';
  return (
    <div onClick={onOpen} style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 10px', borderRadius:7, border:'1px solid hsl(var(--border))', background:'hsl(var(--background))', marginBottom:5, cursor:onOpen?'pointer':'default', borderColor:hov?'hsl(var(--foreground))':'hsl(var(--border))', transition:'border-color .1s' }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11.5, fontWeight:600, color:col, width:90, flexShrink:0 }}>{id}</span>
      <span style={{ fontSize:12.5, color:'hsl(var(--foreground))', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {req ? req.title : kind==='part' ? 'Allocated BOM part / assembly' : 'Test case'}
      </span>
      {kind==='suspect' && <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10.5, fontWeight:700, color:'#DC2626', flexShrink:0 }}><AlertTriangle size={11} color="#DC2626"/>suspect</span>}
      {kind==='test'    && <span style={{ fontSize:10.5, fontWeight:600, color:'#D97706', flexShrink:0 }}>re-verify</span>}
    </div>
  );
}
