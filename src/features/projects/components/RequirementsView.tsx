import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  ChevronRight, ChevronLeft, ChevronDown, ChevronUp, SlidersHorizontal, Search,
  Plus, Download, GitBranch, X, Hash,
  AlertTriangle, Check, ArrowUpDown, Cpu, Zap, Package, Package2,
  Monitor, Shield, Lock, Flag, Activity, FlaskConical, BookOpen,
  GitPullRequest, TriangleAlert, ClipboardCheck, Layers,
  ListChecks, Boxes, Share2, Network, Gauge, Target,
  ListTree, ArrowDownAZ, ShieldCheck, Unlink, PackageX, UserPlus,
  ChevronsDownUp, ChevronsUpDown, CheckCircle, Table2, GitMerge,
  Maximize2, Minimize2, RefreshCw, Minus,
  FolderTree, FunctionSquare, FolderCheck, FileText, Triangle, FolderKanban,
  BookMarked, Cable, Ruler, BadgeCheck, Scale, Play, Circle,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  REQS, BY_KEY, REQ_ROOTS, REQ_TYPE, REQ_CATEGORY, REQ_STATUS, REQ_STATUS_FLOW,
  REQ_VSTATUS, REQ_PRIORITY, REQ_GROUP, REQ_VMETHOD, REQ_LINKTYPE, GAP_META, REQ_TEAM,
  flattenTree, matchWithAncestors, descendants, ancestors, coverageBy, worstOffenders,
  reqStats, vDistribution, standardsRollup, gateReadiness, manufacturingReadiness,
  rebuildRequirementsFromApi, rebuildTeamFromApi,
  traceDown, traceUp, requirementsAllocatingPart, allAllocatedParts, qtyForPart,
  GATES, STANDARDS,
  type Requirement, type ReqType, type ReqCategory, type ReqStatus,
  type ReqVStatus, type ReqPriority, type ReqGroup, type ReqVMethod,
  type AllocatedPartStock,
} from './requirementsData';
import { useRequirementGroups, useRequirementTree, useRequirementLinks } from '@/hooks/useRequirements';
import { useRequirementAllocations } from '@/hooks/useBom';
import { useECOAffectedRequirements } from '@/hooks/useECOs';
import { useVerificationSummary } from '@/hooks/useVerification';
import { useInventoryStock, useInventoryBuilds } from '@/hooks/useInventory';
import { useProjectMembers } from '@/hooks/useProjectTeam';
import {
  ReqKeyTag, TypePill, CatPill, StatusBadge, VStatusBadge, PriorityPill,
  CoverageCell, OwnerAvatar, Donut, StatTile, CoverageBar, ScoreRing, softTint,
} from './RequirementsShared';
import RequirementDetailScreen from './RequirementDetailScreen';
import RequirementEditor from './RequirementEditor';
import RequirementImpact from './RequirementImpact';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ── Group icons ────────────────────────────────────────────────────────────────
const GROUP_ICONS: Record<ReqGroup, React.ElementType> = {
  SYS: Boxes, PWR: Zap, CTL: Cpu, CHD: Package, ENC: Package2,
  HMI: Monitor, SAF: Shield, SEC: Lock, STK: Flag,
};

// ── Sort options (module-level so SortDropdown can reference) ──────────────────
type SortField = 'tree' | 'key' | 'title' | 'priority' | 'status' | 'verification';

const SORT_OPTS: { id: SortField; icon: React.ElementType; label: string }[] = [
  { id: 'tree', icon: ListTree, label: 'Hierarchy' },
  { id: 'key', icon: Hash, label: 'Key (A→Z)' },
  { id: 'title', icon: ArrowDownAZ, label: 'Title (A→Z)' },
  { id: 'priority', icon: Flag, label: 'Priority' },
  { id: 'status', icon: GitBranch, label: 'Status' },
  { id: 'verification', icon: CheckCircle, label: 'Verification' },
];

// ── Filter state ───────────────────────────────────────────────────────────────
interface FilterState {
  search: string; type: ReqType[]; category: ReqCategory[]; status: ReqStatus[];
  vstatus: ReqVStatus[]; priority: ReqPriority[]; group: ReqGroup[];
  gap: keyof typeof GAP_META | null; owner: string[];
}
const emptyFilters = (): FilterState => ({
  search: '', type: [], category: [], status: [], vstatus: [],
  priority: [], group: [], gap: null, owner: [],
});

// Returns true boolean — prevents {0 && <div/>} rendering "0" in JSX
const hasActiveFilters = (f: FilterState): boolean =>
  f.search !== '' || f.type.length > 0 || f.category.length > 0 || f.status.length > 0 ||
  f.vstatus.length > 0 || f.priority.length > 0 || f.group.length > 0 ||
  f.gap !== null || f.owner.length > 0;

type ViewTab = 'table' | 'map' | 'trace' | 'coverage' | 'readiness';

// ── Main component ────────────────────────────────────────────────────────────
interface RequirementsViewProps {
  projectId: string;
  /** Org id — used only to fetch live Inventory stock for the "allocated to"
   * traceability links (mirrors BOM's `orgId`). */
  orgId: string;
  /** Currently open requirement detail, controlled via the URL (mirrors BOM's `selectedId`). */
  selectedKey?: string | null;
  onSelectedKeyChange?: (key: string | null) => void;
  /** Reports whether the full-page create/edit editor is open, so the host
   * (ProjectDetail) can hide its own tab-bar header while it's up — the editor
   * isn't URL-driven (same reasoning as BOM's "Add Part" sheet), so this is the
   * only way the host knows. */
  onEditorOpenChange?: (open: boolean) => void;
  /** Fired when "Raise ECO" (from the Impact drawer) creates a real ECO —
   * mirrors BOM's onEcoCreated so the host can navigate to it. */
  onEcoCreated?: (ecoId: string) => void;
}
export default function RequirementsView({ projectId, orgId, selectedKey = null, onSelectedKeyChange, onEditorOpenChange, onEcoCreated }: RequirementsViewProps) {
  // Live data — rebuilds the module-level REQS/BY_KEY index (requirementsData.ts)
  // from the real backend in place, synchronously during render. Every helper
  // and every other Requirements file reads that same shared index, so this is
  // the only place that needs to know about the API.
  const { data: apiGroups, isLoading: groupsLoading } = useRequirementGroups(projectId);
  const { data: apiTree, isLoading: treeLoading, isError: treeError } = useRequirementTree(projectId);
  const { data: apiLinks } = useRequirementLinks(projectId);
  const { data: apiAllocations } = useRequirementAllocations(projectId);
  const { data: apiEcoSuspects } = useECOAffectedRequirements(projectId);
  const { data: apiVerificationSummary } = useVerificationSummary(projectId);
  const { data: stockRows } = useInventoryStock(orgId);
  // Inventory stock is org-wide (not project-scoped — see project_inventory
  // memory), aggregated here across every location for the one figure a
  // requirement's traceability chain actually needs: is this allocated part
  // in stock, and how much of it is actually free. Mirrors Inventory's own
  // `availableOf()` so the two features never disagree.
  const stockByPartId = useMemo(() => {
    const map = new Map<string, AllocatedPartStock>();
    (stockRows ?? []).forEach(s => {
      const prev = map.get(s.partId) ?? { onHand: 0, allocated: 0, available: 0 };
      map.set(s.partId, {
        onHand: prev.onHand + s.onHand,
        allocated: prev.allocated + s.allocated,
        available: prev.available + (s.onHand - s.allocated - (s.quarantineQty ?? 0)),
      });
    });
    return map;
  }, [stockRows]);
  const { data: projectMembers } = useProjectMembers(projectId);
  // Same idempotent-rebuild-on-every-render approach as REQS below — REQ_TEAM
  // is a mutable singleton too. Guarded on `projectMembers` being loaded (not
  // just non-empty) so a project with zero real members doesn't get wiped
  // back to nothing before the first fetch settles.
  if (projectMembers) {
    rebuildTeamFromApi(projectMembers);
  }
  // REQS/BY_KEY/REQ_ROOTS are mutated in place, not replaced — plain object
  // identity never changes, so nothing here can appear in a useMemo dependency
  // array to signal "the data changed." Rebuilding unconditionally every render
  // (cheap — O(requirement count), and idempotent for given inputs) keeps them
  // in sync without a ref-based guard: a ref mutated as a render-time "already
  // handled this" flag is unsafe under StrictMode's double render, which
  // invokes the function twice per commit and silently drops a conditional
  // setState made only on the first invocation. `dataVersion` (below) is used
  // as the dependency for every memo that reads REQS-derived data — in this
  // component and in CoverageDashboard/ReadinessView/TraceabilityView/
  // RequirementsMapView.
  if (apiTree) {
    rebuildRequirementsFromApi(apiTree, apiLinks, apiAllocations, apiEcoSuspects, stockByPartId, apiVerificationSummary);
  }
  // apiTree, apiLinks, apiAllocations, apiEcoSuspects, stockByPartId and
  // apiVerificationSummary are independent React Query-derived values, each
  // stable (unchanged reference) until its own data actually changes —
  // combined into one memoized value so every dependency array below only
  // has one thing to list, and still only changes reference when any input
  // really does.
  const dataVersion = useMemo(
    () => ({ apiTree, apiLinks, apiAllocations, apiEcoSuspects, stockByPartId, apiVerificationSummary }),
    [apiTree, apiLinks, apiAllocations, apiEcoSuspects, stockByPartId, apiVerificationSummary],
  );
  const groups = apiGroups ?? [];

  const [view, setView] = useState<ViewTab>('table');
  const [filters, setFilters] = useState<FilterState>(emptyFilters());
  const [sortField, setSortField] = useState<SortField>('tree');
  // Default: all parent nodes collapsed
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    REQS.forEach(r => { if (r.childKeys.length) m[r.key] = false; });
    return m;
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const detailKey = selectedKey;
  const setDetailKey = (key: string | null) => onSelectedKeyChange?.(key);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [impactKey, setImpactKey] = useState<string | null>(null);

  // Editor is a local full-page swap, not URL-driven, so the host only learns
  // about it through this callback — including resetting it on unmount, so
  // navigating away mid-edit doesn't leave the host thinking it's still open.
  useEffect(() => {
    onEditorOpenChange?.(editorOpen);
    return () => onEditorOpenChange?.(false);
  }, [editorOpen, onEditorOpenChange]);

  // The Impact drawer is opened from the detail screen but its own open state
  // (impactKey) isn't tied to the URL the way detailKey is — so browser back
  // (or any other URL-driven navigation away from the detail view) changes
  // detailKey without touching impactKey, leaving the drawer floating open
  // over whatever view comes back into view. Close it whenever detailKey
  // changes (including closing to null) so it can never outlive the detail
  // screen it was opened from.
  useEffect(() => {
    setImpactKey(null);
  }, [detailKey]);

  const stats = useMemo(() => reqStats(), [dataVersion]);

  const filterSet = useMemo((): Set<string> | null => {
    if (!hasActiveFilters(filters)) return null;
    const txt = filters.search.toLowerCase();
    return matchWithAncestors(r => {
      if (filters.type.length && !filters.type.includes(r.type)) return false;
      if (filters.category.length && !filters.category.includes(r.category)) return false;
      if (filters.status.length && !filters.status.includes(r.status)) return false;
      if (filters.vstatus.length && !filters.vstatus.includes(r.vstatus)) return false;
      if (filters.priority.length && !filters.priority.includes(r.priority)) return false;
      if (filters.group.length && !filters.group.includes(r.group)) return false;
      if (filters.owner.length && !filters.owner.includes(r.owner)) return false;
      if (filters.gap !== null && !r.coverage[filters.gap]) return false;
      if (txt && !r.key.toLowerCase().includes(txt) &&
        !r.title.toLowerCase().includes(txt) &&
        !r.statement.toLowerCase().includes(txt)) return false;
      return true;
    });
  }, [filters, dataVersion]);

  const rows = useMemo(() => {
    const filtersActive = hasActiveFilters(filters);
    const sortMode = sortField !== 'tree';
    if (filtersActive || sortMode) {
      // Flat list: use all matching rows at depth 0
      const flatRows = filtersActive
        ? flattenTree({}, filterSet ?? undefined).map(r => ({ ...r, depth: 0 }))
        : flattenTree({});
      if (!sortMode) return flatRows;
      return [...flatRows].sort((a, b) => {
        if (sortField === 'key') return a.key.localeCompare(b.key);
        if (sortField === 'title') return a.title.localeCompare(b.title);
        if (sortField === 'priority') return REQ_PRIORITY[a.priority].rank - REQ_PRIORITY[b.priority].rank;
        if (sortField === 'status') return REQ_STATUS[b.status].step - REQ_STATUS[a.status].step;
        if (sortField === 'verification') return a.vstatus.localeCompare(b.vstatus);
        return 0;
      });
    }
    return flattenTree(expanded, filterSet ?? undefined);
  }, [expanded, filterSet, sortField, filters, dataVersion]);

  // Expand / collapse all
  const expandAll = useCallback(() => setExpanded({}), []);
  const collapseAll = useCallback(() => {
    const m: Record<string, boolean> = {};
    REQS.forEach(r => { if (r.childKeys.length) m[r.key] = false; });
    setExpanded(m);
  }, []);
  const anyExpanded = useMemo(
    () => REQS.some(r => r.childKeys.length > 0 && expanded[r.key] !== false),
    [expanded, dataVersion],
  );

  const toggleExpand = useCallback((key: string) =>
    setExpanded(p => ({ ...p, [key]: p[key] === false ? true : false })), []);

  const toggleSelect = useCallback((key: string) =>
    setSelected(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; }), []);

  const allVisible = rows.map(r => r.key);
  const allSelected = allVisible.length > 0 && allVisible.every(k => selected.has(k));
  const toggleAll = () => allSelected ? setSelected(new Set()) : setSelected(new Set(allVisible));

  const drillToTable = useCallback((gapKey: keyof typeof GAP_META | null, extra?: Partial<FilterState>) => {
    setFilters({ ...emptyFilters(), ...(gapKey ? { gap: gapKey } : {}), ...(extra ?? {}) });
    setView('table');
  }, []);

  const openDetail = useCallback((key: string) => onSelectedKeyChange?.(key), [onSelectedKeyChange]);
  const openEditor = useCallback((key?: string) => { setEditKey(key ?? null); setEditorOpen(true); }, []);

  if (detailKey) return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: 'calc(100vh - 75px)' }}>
      <RequirementDetailScreen reqKey={detailKey} projectId={projectId} orgId={orgId} onClose={() => setDetailKey(null)}
        onEdit={key => { setDetailKey(null); openEditor(key); }}
        onImpact={key => setImpactKey(key)} onNavigate={openDetail} onEcoCreated={onEcoCreated} />
      {/* Rendered here too (not just in the main-view return below) — the
          Impact button lives on the detail screen, so without this the
          drawer's state gets set on click but nothing appears until the
          user navigates away to a return path that does render it. */}
      {impactKey && (
        <RequirementImpact reqKey={impactKey} projectId={projectId} onClose={() => setImpactKey(null)} onOpen={openDetail} onEcoCreated={onEcoCreated} />
      )}
    </div>
  );
  if (editorOpen) return (
    <RequirementEditor reqKey={editKey} projectId={projectId} groups={groups}
      onClose={() => { setEditorOpen(false); setEditKey(null); }}
      onSaved={() => { setEditorOpen(false); setEditKey(null); }} />
  );

  const showExpandToggle = view === 'table' && !hasActiveFilters(filters) && sortField === 'tree';
  const activeFilterCount = filterSet?.size ?? null;

  if ((treeLoading || groupsLoading) && !apiTree) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height: 'calc(100vh - 140px)' }}>
        Loading requirements…
      </div>
    );
  }
  if (treeError) {
    return (
      <div className="flex items-center justify-center text-sm text-destructive" style={{ height: 'calc(100vh - 140px)' }}>
        Failed to load requirements.
      </div>
    );
  }

  return (
    <div className="flex flex-col px-6 overflow-hidden bg-background" style={{ height: 'calc(100vh - 140px)' }}>

      {/* ── Fixed header zone (no scroll) ─────────────────────────── */}
      <div className="shrink-0 py-4">

        {/* Stats tiles row */}
        <div className="flex items-stretch gap-2.5 md:gap-3 flex-wrap mb-3">
          <SummaryTile icon={ShieldCheck} label="Verified or validated" value={`${stats.verifiedPct}%`}
            tint="#16A34A" accent />
          <SummaryTile icon={Unlink} label="Orphans" value={stats.orphan} tint="#DC2626"
            gapKey="orphan" active={filters.gap === 'orphan'} onFilter={g => setFilters({ ...emptyFilters(), gap: g })} />
          <SummaryTile icon={FlaskConical} label="Untested" value={stats.untested} tint="#D97706"
            gapKey="untested" active={filters.gap === 'untested'} onFilter={g => setFilters({ ...emptyFilters(), gap: g })} />
          <SummaryTile icon={PackageX} label="Unimplemented" value={stats.unimplemented} tint="#D97706"
            gapKey="unimplemented" active={filters.gap === 'unimplemented'} onFilter={g => setFilters({ ...emptyFilters(), gap: g })} />
          <SummaryTile icon={AlertTriangle} label="Suspect links" value={stats.suspect} tint="#DC2626"
            gapKey="suspect" active={filters.gap === 'suspect'} onFilter={g => setFilters({ ...emptyFilters(), gap: g })} />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">

          <ViewTabs view={view} setView={setView} />

          {/* Expand / collapse all — table tree mode only */}
          {showExpandToggle && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12.5px] text-muted-foreground"
              onClick={() => anyExpanded ? collapseAll() : expandAll()}>
              {anyExpanded
                ? <><ChevronsDownUp className="w-3.5 h-3.5" /> Collapse all</>
                : <><ChevronsUpDown className="w-3.5 h-3.5" /> Expand all</>}
            </Button>
          )}

          <div className="flex-1" />

          {/* Search */}
          <div className="flex items-center gap-2 bg-muted border border-border rounded-md px-2.5 py-1.5 w-64">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search key, title, or statement…"
              className="bg-transparent border-none outline-none text-foreground text-sm w-full placeholder:text-muted-foreground" />
            {filters.search && (
              <button onClick={() => setFilters({ ...filters, search: '' })}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort — table view only */}
          {view === 'table' && <SortDropdown sortField={sortField} setSortField={setSortField} />}

          {/* Filters — table + map views */}
          {(view === 'table' || view === 'map') && (
            <button onClick={() => setFilterDrawerOpen(true)}
              className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium border cursor-pointer transition-colors',
                activeFilterCount ? 'bg-primary/10 text-primary border-primary/30' : 'bg-card text-foreground border-border hover:bg-muted')}>
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount ? (
                <span className="min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-primary text-primary-foreground">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          )}

          <div className="w-px h-5 bg-border" />

          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12.5px]">
            <Download className="w-3.5 h-3.5" />
            Import
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-[12.5px]" onClick={() => openEditor()}>
            <Plus className="w-3.5 h-3.5" />
            New Requirement
          </Button>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters(filters) && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2.5">
            <span className="text-[11.5px] text-muted-foreground">Active:</span>
            {filters.type.map(t => <FilterChip key={t} label={REQ_TYPE[t].short} onRemove={() => setFilters({ ...filters, type: filters.type.filter(x => x !== t) })} />)}
            {filters.category.map(c => <FilterChip key={c} label={REQ_CATEGORY[c].label} onRemove={() => setFilters({ ...filters, category: filters.category.filter(x => x !== c) })} />)}
            {filters.status.map(s => <FilterChip key={s} label={REQ_STATUS[s].label} onRemove={() => setFilters({ ...filters, status: filters.status.filter(x => x !== s) })} />)}
            {filters.priority.map(p => <FilterChip key={p} label={REQ_PRIORITY[p].label} onRemove={() => setFilters({ ...filters, priority: filters.priority.filter(x => x !== p) })} />)}
            {filters.gap && (
              <FilterChip label={GAP_META[filters.gap].label.split(' ')[0]}
                tint={GAP_META[filters.gap].tint}
                onRemove={() => setFilters({ ...filters, gap: null })} />
            )}
            <button onClick={() => setFilters(emptyFilters())}
              className="text-[11.5px] text-muted-foreground hover:text-foreground underline transition-colors">
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 border-t border-border">
        {view === 'table' ? (
          <ReqTable rows={rows} expanded={expanded} selected={selected}
            filtersActive={hasActiveFilters(filters)}
            toggleExpand={toggleExpand} toggleSelect={toggleSelect}
            allSelected={allSelected} toggleAll={toggleAll}
            onOpen={openDetail} onEdit={k => openEditor(k)} onImpact={k => setImpactKey(k)}
            onClearFilters={() => setFilters(emptyFilters())} />
        ) : view === 'map' ? (
          <RequirementsMapView onOpen={openDetail} dataVersion={dataVersion} />
        ) : view === 'trace' ? (
          <TraceabilityView onOpen={openDetail} onDrill={drillToTable} dataVersion={dataVersion} />
        ) : view === 'coverage' ? (
          <CoverageDashboard stats={stats} onDrill={drillToTable} onOpen={openDetail} dataVersion={dataVersion} />
        ) : (
          <ReadinessView dataVersion={dataVersion} projectId={projectId} orgId={orgId} />
        )}
      </div>

      {/* ── Bulk bar ── */}
      {selected.size > 0 && (
        <BulkBar count={selected.size} onClear={() => setSelected(new Set())} />
      )}

      {/* ── Filter drawer ── */}
      {filterDrawerOpen && (
        <FilterDrawer filters={filters} setFilters={setFilters} onClose={() => setFilterDrawerOpen(false)} />
      )}

      {/* ── Impact drawer ── */}
      {impactKey && (
        <RequirementImpact reqKey={impactKey} projectId={projectId} onClose={() => setImpactKey(null)} onOpen={openDetail} onEcoCreated={onEcoCreated} />
      )}
    </div>
  );
}

// ── Summary tile (large card, reference style) ─────────────────────────────────
function SummaryTile({ icon: Ic, label, value, tint, gapKey, active, accent, onFilter }:
  {
    icon: React.ElementType; label: string; value: string | number; tint: string;
    gapKey?: string; active?: boolean; accent?: boolean; onFilter?: (k: string | null) => void
  }) {
  const clickable = !!gapKey && !!onFilter;
  return (
    <button
      onClick={() => clickable && onFilter!(active ? null : gapKey!)}
      className={cn(
        'flex-1 min-w-0 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border bg-card transition-colors',
        clickable ? 'cursor-pointer hover:bg-muted' : 'cursor-default',
      )}
      style={{
        background: active ? softTint(tint, 0.10) : undefined,
        borderColor: active ? softTint(tint, 0.35) : undefined,
      }}>
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: softTint(tint, 0.12) }}>
        <Ic className="w-4 h-4" style={{ color: tint }} />
      </span>
      <span className="text-left min-w-0">
        <span className="block text-lg font-bold leading-tight tabular-nums truncate"
          style={{ color: accent ? tint : undefined }}>
          {value}
        </span>
        <span className="block text-[11px] text-muted-foreground truncate">{label}</span>
      </span>
    </button>
  );
}

// ── View tabs (gray container, reference style) ────────────────────────────────
const VIEW_TABS: { key: ViewTab; icon: React.ElementType; label: string }[] = [
  { key: 'table', icon: Table2, label: 'Table' },
  { key: 'map', icon: Share2, label: 'Map' },
  { key: 'trace', icon: Network, label: 'Traceability' },
  { key: 'coverage', icon: Gauge, label: 'Coverage' },
  { key: 'readiness', icon: Target, label: 'Readiness' },
];
function ViewTabs({ view, setView }: { view: ViewTab; setView: (v: ViewTab) => void }) {
  return (
    <div className="flex items-center bg-muted border border-border rounded-lg p-0.5 gap-0.5">
      {VIEW_TABS.map(v => {
        const Ic = v.icon;
        const active = view === v.key;
        return (
          <button key={v.key} onClick={() => setView(v.key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border-none cursor-pointer transition-colors',
              active ? 'bg-card text-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:text-foreground',
            )}>
            <Ic className="w-3.5 h-3.5" />{v.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Sort dropdown ──────────────────────────────────────────────────────────────
function SortDropdown({ sortField, setSortField }: { sortField: SortField; setSortField: (s: SortField) => void }) {
  const current = SORT_OPTS.find(o => o.id === sortField) ?? SORT_OPTS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-card text-foreground text-[12.5px] font-medium cursor-pointer hover:bg-muted transition-colors">
          <current.icon className="w-3.5 h-3.5" />
          {current.label}
          <ChevronDown className="w-2.5 h-2.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {SORT_OPTS.map(o => {
          const OIc = o.icon;
          const active = sortField === o.id;
          return (
            <DropdownMenuItem key={o.id} onClick={() => setSortField(o.id)}
              className={cn('flex items-center gap-2', active && 'bg-muted')}>
              <OIc className={cn('w-3.5 h-3.5', active ? 'text-foreground' : 'text-muted-foreground')} />
              <span className="flex-1">{o.label}</span>
              {active && <Check className="w-3.5 h-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Filter chip ────────────────────────────────────────────────────────────────
function FilterChip({ label, onRemove, tint }: { label: string; onRemove: () => void; tint?: string }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full border border-border bg-card text-[11.5px]"
      style={{ background: tint ? softTint(tint, 0.10) : undefined, color: tint }}>
      {label}
      <button onClick={onRemove} className="border-none bg-transparent cursor-pointer p-0 flex items-center opacity-70 hover:opacity-100">
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────
// 12 columns matching reference: sel(36) key(188) title(1fr) type(108) cat(118) pri(96) status(112) vstat(128) owner(62) cov(106) ver(54) act(34)
const COL_TEMPLATE = '36px 188px 1fr 108px 118px 96px 112px 128px 62px 106px 54px 34px';
const TABLE_MIN_W = 1240;

const COL_HEADERS = ['', 'Key', 'Requirement', 'Type', 'Category', 'Priority', 'Status', 'Verification', '', 'Coverage', 'Ver.', ''];

function ReqTable({ rows, expanded, selected, filtersActive, toggleExpand, toggleSelect,
  allSelected, toggleAll, onOpen, onEdit, onImpact, onClearFilters }:
  {
    rows: (Requirement & { depth: number })[]; expanded: Record<string, boolean>; selected: Set<string>;
    filtersActive: boolean; toggleExpand: (k: string) => void; toggleSelect: (k: string) => void;
    allSelected: boolean; toggleAll: () => void; onOpen: (k: string) => void; onEdit: (k: string) => void;
    onImpact: (k: string) => void; onClearFilters: () => void
  }) {

  if (!rows.length) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 48 }}>
      <ListChecks size={40} color="hsl(var(--muted-foreground))" />
      <div style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--foreground))' }}>No requirements match</div>
      <button onClick={onClearFilters} style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', border: 'none', background: 'transparent', cursor: 'pointer', textDecoration: 'underline' }}>
        Clear filters
      </button>
    </div>
  );

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: COL_TEMPLATE,
    minWidth: TABLE_MIN_W,
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 2, minWidth: TABLE_MIN_W }}>
        <div style={{ ...gridStyle, background: 'hsl(var(--card))', borderBottom: '1px solid hsl(var(--border))', padding: '0 6px', alignItems: 'center', height: 36 }}>
          {/* checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll}
              style={{ cursor: 'pointer', accentColor: 'hsl(var(--foreground))' }} />
          </div>
          {COL_HEADERS.slice(1).map((h, i) => (
            <div key={i} style={{
              fontSize: 10.5, fontWeight: 700, color: 'hsl(var(--muted-foreground))',
              textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center',
              padding: i === 0 ? '0 0 0 4px' : '0 4px', overflow: 'hidden', whiteSpace: 'nowrap'
            }}>
              {h}
            </div>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div style={{ minWidth: TABLE_MIN_W }}>
        {rows.map(r => (
          <TableRow key={r.key} r={r}
            isExpanded={expanded[r.key] !== false && r.childKeys.length > 0}
            isSelected={selected.has(r.key)}
            filtersActive={filtersActive}
            gridStyle={gridStyle}
            onToggle={() => toggleExpand(r.key)}
            onSelect={() => toggleSelect(r.key)}
            onOpen={() => onOpen(r.key)}
            onEdit={() => onEdit(r.key)}
            onImpact={() => onImpact(r.key)} />
        ))}
        {/* footer */}
        <div style={{
          minWidth: TABLE_MIN_W, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
          borderTop: '1px solid hsl(var(--border))', background: 'hsl(var(--card))'
        }}>
          <span style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))' }}>
            Showing {rows.length} requirement{rows.length !== 1 ? 's' : ''}
            {filtersActive ? ' (filtered)' : ''}
          </span>
          <span style={{ width: 4, height: 4, borderRadius: 9999, background: 'hsl(var(--border))', flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))' }}>Baseline BL-2.0 · 5-tier decomposition</span>
        </div>
      </div>
    </div>
  );
}

function TableRow({ r, isExpanded, isSelected, filtersActive, gridStyle, onToggle, onSelect, onOpen, onEdit, onImpact }:
  {
    r: Requirement & { depth: number }; isExpanded: boolean; isSelected: boolean; filtersActive: boolean;
    gridStyle: React.CSSProperties; onToggle: () => void; onSelect: () => void;
    onOpen: () => void; onEdit: () => void; onImpact: () => void
  }) {

  const [hov, setHov] = useState(false);
  const [actHov, setActHov] = useState(false);
  const hasChildren = r.childKeys.length > 0;
  const depth = filtersActive ? 0 : r.depth;
  const ver = (r as Record<string, unknown>).ver as string | undefined;

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        ...gridStyle, alignItems: 'center', height: 38, padding: '0 6px',
        borderBottom: '1px solid hsl(var(--border))',
        background: isSelected ? 'hsl(var(--muted))' : hov ? 'hsl(var(--muted))' : 'hsl(var(--background))',
        borderLeft: `3px solid ${isSelected ? 'hsl(var(--foreground))' : 'transparent'}`,
        transition: 'background .1s'
      }}>

      {/* checkbox */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <input type="checkbox" checked={isSelected} onChange={onSelect}
          onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', accentColor: 'hsl(var(--foreground))' }} />
      </div>

      {/* key + tree control (188px) */}
      <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 4, overflow: 'hidden' }}>
        {/* depth spacer */}
        <span style={{ width: depth * 14, flexShrink: 0 }} />
        {/* expand/collapse or dot */}
        {hasChildren && !filtersActive ? (
          <button onClick={e => { e.stopPropagation(); onToggle(); }}
            style={{
              width: 16, height: 16, borderRadius: 4, border: 'none', background: 'transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0
            }}>
            {isExpanded
              ? <ChevronDown size={12} color="hsl(var(--muted-foreground))" />
              : <ChevronRight size={12} color="hsl(var(--muted-foreground))" />}
          </button>
        ) : (
          <span style={{ width: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {!hasChildren && <span style={{ width: 4, height: 4, borderRadius: 9999, background: 'hsl(var(--border))' }} />}
          </span>
        )}
        {/* key tag */}
        <span onClick={onOpen} style={{ marginLeft: 4, overflow: 'hidden' }}>
          <ReqKeyTag reqKey={r.key} onClick={onOpen} />
        </span>
        {r.coverage.suspect && (
          <AlertTriangle size={11} color="#DC2626" style={{ marginLeft: 4, flexShrink: 0 }} title="Suspect link" />
        )}
      </div>

      {/* title (1fr) */}
      <div
        onClick={onOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          minWidth: 0,
          fontSize: 12.5,
          color: 'hsl(var(--foreground))',
          overflow: 'hidden',
          cursor: 'pointer',
          paddingRight: 8,
        }}
        title={r.title}
      >
        {r.hasGap ? (
          <AlertTriangle size={12} color="#D97706" style={{ flexShrink: 0 }} title="Has gaps" />
        ) : (
          <span style={{ width: 12, height: 12, flexShrink: 0 }} aria-hidden="true" />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.title}
        </span>
      </div>

      {/* type */}
      <div style={{ overflow: 'hidden' }}><TypePill type={r.type} /></div>

      {/* category */}
      <div style={{ overflow: 'hidden' }}><CatPill category={r.category} /></div>

      {/* priority */}
      <div style={{ overflow: 'hidden' }}><PriorityPill priority={r.priority} /></div>

      {/* status */}
      <div style={{ overflow: 'hidden' }}><StatusBadge status={r.status} /></div>

      {/* vstatus */}
      <div style={{ overflow: 'hidden' }}><VStatusBadge vstatus={r.vstatus} /></div>

      {/* owner avatar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <OwnerAvatar ownerId={r.owner} />
      </div>

      {/* coverage */}
      <div style={{ display: 'flex', alignItems: 'center' }}><CoverageCell coverage={r.coverage} /></div>

      {/* ver */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5,
          color: 'hsl(var(--muted-foreground))', fontVariantNumeric: 'tabular-nums'
        }}>
          {ver ?? '—'}
        </span>
      </div>

      {/* actions */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
        opacity: hov ? 1 : 0, transition: 'opacity .1s'
      }}>
        <RowBtn icon={GitPullRequest} title="Change impact" onClick={e => { e.stopPropagation(); onImpact(); }} />
      </div>
    </div>
  );
}

function RowBtn({ icon: Ic, title, onClick }: { icon: React.ElementType; title: string; onClick: (e: React.MouseEvent) => void }) {
  const [h, setH] = useState(false);
  return (
    <button title={title} onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        width: 22, height: 22, borderRadius: 5, border: 'none',
        background: h ? 'hsl(var(--muted))' : 'transparent', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0
      }}>
      <Ic size={12} color="hsl(var(--muted-foreground))" />
    </button>
  );
}

// ── Bulk bar ───────────────────────────────────────────────────────────────────
function BulkBar({ count, onClear }: { count: number; onClear: () => void }) {
  return (
    <div style={{
      position: 'sticky', bottom: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
      background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', borderTop: '1px solid rgba(255,255,255,0.15)', zIndex: 10
    }}>
      <Check size={15} /> <span style={{ fontSize: 13, fontWeight: 600 }}>{count} selected</span>
      <div style={{ flex: 1 }} />
      <BulkBtn label="Bulk approve" icon={Check} />
      <BulkBtn label="Assign owner" icon={UserPlus} />
      <BulkBtn label="Baseline" icon={GitMerge} />
      <BulkBtn label="Export CSV" icon={Download} />
      <button onClick={onClear} style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7,
        border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: 'hsl(var(--background))', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5
      }}>
        <X size={12} /> Clear
      </button>
    </div>
  );
}
function BulkBtn({ label, icon: Ic }: { label: string; icon: React.ElementType }) {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 7,
      border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500
    }}>
      <Ic size={12} />{label}
    </button>
  );
}

// ── Filter drawer ──────────────────────────────────────────────────────────────
function FilterDrawer({ filters, setFilters, onClose }: { filters: FilterState; setFilters: (f: FilterState) => void; onClose: () => void }) {
  const upd = <K extends keyof FilterState>(key: K, val: FilterState[K]) => setFilters({ ...filters, [key]: val });
  const toggleArr = <T,>(arr: T[], val: T): T[] => arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];

  return (
    <>
      {/* z-index above the Map view's fullscreen mode (1000) and floating
          toolbar/minimap (up to 210) — see the matching note in
          RequirementImpact.tsx. */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 340, maxWidth: '94vw', zIndex: 2001,
        background: 'hsl(var(--card))', borderLeft: '1px solid hsl(var(--border))',
        display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(0,0,0,0.15)'
      }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid hsl(var(--border))' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--foreground))' }}>Filters</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setFilters(emptyFilters())} style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', border: 'none', background: 'transparent', cursor: 'pointer', textDecoration: 'underline' }}>Reset</button>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <DrawerSection label="Gap type">
            {(Object.keys(GAP_META) as (keyof typeof GAP_META)[]).map(g => {
              const m = GAP_META[g]; const active = filters.gap === g;
              return <DrawerChip key={g} label={m.label.split(' ')[0]} tint={m.tint} active={active}
                onClick={() => upd('gap', active ? null : g)} />;
            })}
          </DrawerSection>
          <DrawerSection label="Priority">
            {(Object.keys(REQ_PRIORITY) as ReqPriority[]).map(p => {
              const m = REQ_PRIORITY[p];
              return <DrawerChip key={p} label={m.label} tint={m.tint} active={filters.priority.includes(p)}
                onClick={() => upd('priority', toggleArr(filters.priority, p))} />;
            })}
          </DrawerSection>
          <DrawerSection label="Status">
            {(Object.keys(REQ_STATUS) as ReqStatus[]).map(s => {
              const m = REQ_STATUS[s];
              return <DrawerChip key={s} label={m.label} tint={m.tint} active={filters.status.includes(s)}
                onClick={() => upd('status', toggleArr(filters.status, s))} />;
            })}
          </DrawerSection>
          <DrawerSection label="Type">
            {(Object.keys(REQ_TYPE) as ReqType[]).map(t => {
              const m = REQ_TYPE[t];
              return <DrawerChip key={t} label={m.short} tint={m.tint} active={filters.type.includes(t)}
                onClick={() => upd('type', toggleArr(filters.type, t))} />;
            })}
          </DrawerSection>
          <DrawerSection label="Category">
            {(Object.keys(REQ_CATEGORY) as ReqCategory[]).map(c => {
              const m = REQ_CATEGORY[c];
              return <DrawerChip key={c} label={m.label} tint={m.tint} active={filters.category.includes(c)}
                onClick={() => upd('category', toggleArr(filters.category, c))} />;
            })}
          </DrawerSection>
          <DrawerSection label="Subsystem">
            {(Object.keys(REQ_GROUP) as ReqGroup[]).map(g => {
              const m = REQ_GROUP[g];
              return <DrawerChip key={g} label={m.label} tint={m.tint} active={filters.group.includes(g)}
                onClick={() => upd('group', toggleArr(filters.group, g))} />;
            })}
          </DrawerSection>
          <DrawerSection label="Owner">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {REQ_TEAM.map(m => {
                const active = filters.owner.includes(m.id);
                return (
                  <button key={m.id} onClick={() => upd('owner', toggleArr(filters.owner, m.id))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 9999,
                      border: `1px solid ${active ? m.color : 'hsl(var(--border))'}`,
                      background: active ? softTint(m.color, 0.12) : 'hsl(var(--card))', cursor: 'pointer', fontFamily: 'inherit'
                    }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 9999, background: softTint(m.color, 0.18), color: m.color,
                      fontSize: 9.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {m.initials}
                    </span>
                    <span style={{ fontSize: 12, color: 'hsl(var(--foreground))', fontWeight: 500 }}>{m.name}</span>
                  </button>
                );
              })}
            </div>
          </DrawerSection>
        </div>
      </div>
    </>
  );
}

function DrawerSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
    </div>
  );
}

function DrawerChip({ label, tint, active, onClick }: { label: string; tint: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 9999,
        border: `1px solid ${active ? tint : 'hsl(var(--border))'}`,
        background: active ? softTint(tint, 0.12) : 'hsl(var(--card))',
        color: active ? tint : 'hsl(var(--foreground))',
        cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: active ? 600 : 400, transition: 'all .1s'
      }}>
      {label}
    </button>
  );
}

// ── Coverage dashboard ─────────────────────────────────────────────────────────
function CoverageDashboard({ stats, onDrill, onOpen, dataVersion }:
  { stats: ReturnType<typeof reqStats>; onDrill: (g: keyof typeof GAP_META | null, extra?: Partial<FilterState>) => void; onOpen: (k: string) => void; dataVersion: unknown }) {
  const vd = useMemo(() => vDistribution(), [dataVersion]);
  const TYPE_ORDER: ReqType[] = ['stakeholder-need', 'stakeholder-req', 'system-req', 'subsystem-req', 'component-req'];
  const byTier = useMemo(() => coverageBy(r => r.type, TYPE_ORDER), [dataVersion]);
  const byGroup = useMemo(() => coverageBy(r => r.group).sort((a, b) => b.total - a.total), [dataVersion]);
  const worst = useMemo(() => worstOffenders(7), [dataVersion]);

  const vSegments = [
    { value: vd.passed, tint: REQ_VSTATUS.passed.tint, label: 'Passed' },
    { value: vd['in-progress'], tint: REQ_VSTATUS['in-progress'].tint, label: 'In progress' },
    { value: vd.failed, tint: REQ_VSTATUS.failed.tint, label: 'Failed' },
    { value: vd.waived, tint: REQ_VSTATUS.waived.tint, label: 'Waived' },
    { value: vd['not-verified'], tint: REQ_VSTATUS['not-verified'].tint, label: 'Not verified' },
  ];
  const passPct = Math.round(vd.passed / stats.total * 100);

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'hsl(var(--background))', padding: '20px 24px 48px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>

        {/* Top row */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '20px 24px', borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', flex: '1 1 460px' }}>
            <Donut segments={vSegments} total={stats.total} centerLabel={`${passPct}%`} centerSub="passed" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: 3 }}>Verification status</div>
              <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 12 }}>{stats.total} requirements</div>
              {vSegments.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: s.tint, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: 'hsl(var(--foreground))', flex: 1 }}>{s.label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'hsl(var(--foreground))', fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
                  <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', width: 38, textAlign: 'right' }}>{Math.round(s.value / stats.total * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 280px' }}>
            <div style={{ display: 'flex', gap: 12, flex: 1 }}>
              <StatTile label="Total requirements" value={stats.total} icon={ListChecks} tint="hsl(var(--foreground))" />
              <StatTile label="Approved & above" value={`${stats.approvedPct}%`} icon={Check} tint="#16A34A" />
            </div>
            <div style={{ display: 'flex', gap: 12, flex: 1 }}>
              <StatTile label="Open gaps" value={stats.orphan + stats.untested + stats.unimplemented + stats.suspect} icon={TriangleAlert} tint="#D97706" />
              <StatTile label="5-tier depth" value="5" icon={GitBranch} tint="#9333EA" sub="Need → Component" />
            </div>
          </div>
        </div>

        {/* Gap cards */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {(['orphan', 'untested', 'unimplemented', 'suspect'] as const).map(g => {
            const m = GAP_META[g];
            const GapIcons = { orphan: Unlink, untested: FlaskConical, unimplemented: PackageX, suspect: AlertTriangle };
            const GIc = GapIcons[g];
            return (
              <button key={g} onClick={() => onDrill(g)}
                style={{
                  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9, padding: '15px 16px',
                  borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'border-color .12s'
                }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, background: softTint(m.tint, 0.12), display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <GIc size={17} color={m.tint} />
                  </span>
                  <ChevronRight size={15} color="hsl(var(--muted-foreground))" />
                </div>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: stats[g] > 0 ? m.tint : 'hsl(var(--muted-foreground))', lineHeight: 1 }}>{stats[g]}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'hsl(var(--foreground))', marginTop: 5, textTransform: 'capitalize' }}>
                    {g === 'orphan' ? 'Orphans' : g === 'suspect' ? 'Suspect links' : g === 'untested' ? 'Untested' : 'Unimplemented'}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>{m.label.split('—')[1]?.trim()}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Bars */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 16px', borderBottom: '1px solid hsl(var(--border))' }}>
              <Layers size={15} color="hsl(var(--muted-foreground))" /><span style={{ fontSize: 13.5, fontWeight: 600, color: 'hsl(var(--foreground))' }}>Coverage by tier</span>
            </div>
            <div style={{ padding: 16 }}>
              {byTier.map(t => (
                <CoverageBar key={t.key} label={REQ_TYPE[t.key as ReqType]?.label ?? t.key} total={t.total} verified={t.verified} gaps={t.gaps}
                  tint={REQ_TYPE[t.key as ReqType]?.tint} sub={`${t.verified}/${t.total}`} onClick={() => onDrill(null, { type: [t.key as ReqType] })} />
              ))}
            </div>
          </div>
          <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 16px', borderBottom: '1px solid hsl(var(--border))' }}>
              <Boxes size={15} color="hsl(var(--muted-foreground))" /><span style={{ fontSize: 13.5, fontWeight: 600, color: 'hsl(var(--foreground))' }}>Coverage by subsystem</span>
            </div>
            <div style={{ padding: 16 }}>
              {byGroup.map(g => (
                <CoverageBar key={g.key} label={REQ_GROUP[g.key as ReqGroup]?.label ?? g.key} total={g.total} verified={g.verified} gaps={g.gaps}
                  tint={REQ_GROUP[g.key as ReqGroup]?.tint} sub={`${g.verified}/${g.total}`} onClick={() => onDrill(null, { search: g.key })} />
              ))}
            </div>
          </div>
        </div>

        {/* Worst offenders */}
        <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 16px', borderBottom: '1px solid hsl(var(--border))' }}>
            <TriangleAlert size={15} color="hsl(var(--muted-foreground))" />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'hsl(var(--foreground))', flex: 1 }}>Highest-risk gaps</span>
            <span style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))' }}>ranked by gap count × priority</span>
          </div>
          <div style={{ padding: '8px 16px' }}>
            {worst.map(({ r, n }) => {
              const gaps = (['orphan', 'untested', 'unimplemented', 'suspect'] as const).filter(g => r.coverage[g]);
              const GapIcons = { orphan: Unlink, untested: FlaskConical, unimplemented: PackageX, suspect: AlertTriangle };
              return (
                <div key={r.key} onClick={() => onOpen(r.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', borderBottom: '1px solid hsl(var(--border))', cursor: 'pointer', borderRadius: 7, transition: 'background .1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--muted))')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ width: 26, height: 26, borderRadius: 9999, flexShrink: 0, background: softTint('#DC2626', 0.1), color: '#DC2626', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
                  <ReqKeyTag reqKey={r.key} />
                  <span style={{ fontSize: 13, color: 'hsl(var(--foreground))', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  <PriorityPill priority={r.priority} />
                  <div style={{ display: 'flex', gap: 5 }}>
                    {gaps.map(g => { const m = GAP_META[g]; const GIc = GapIcons[g]; return <span key={g} title={m.label} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 5, background: softTint(m.tint, 0.12) }}><GIc size={12} color={m.tint} /></span>; })}
                  </div>
                  <ChevronRight size={15} color="hsl(var(--muted-foreground))" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Readiness view ─────────────────────────────────────────────────────────────
function ReadinessView({ dataVersion, projectId, orgId }: { dataVersion: unknown; projectId: string; orgId: string }) {
  const gate = useMemo(() => gateReadiness(), [dataVersion]);
  const stds = useMemo(() => standardsRollup(), [dataVersion]);

  // Manufacturing readiness by build — plan §F: "roll up from real
  // build-level pass/fail instead of requirement-level guesses." Empty
  // buildId means the project-wide rollup (unchanged default behavior).
  const [buildId, setBuildId] = useState('');
  const { data: allBuilds } = useInventoryBuilds(orgId);
  const projectBuilds = useMemo(
    () => (allBuilds ?? []).filter(b => b.projectId === projectId),
    [allBuilds, projectId],
  );
  const { data: buildSummary } = useVerificationSummary(projectId, buildId || undefined);
  const buildVstatusMap = useMemo(() => {
    if (!buildId || !buildSummary) return undefined;
    const m = new Map<string, ReqVStatus>();
    buildSummary.forEach(s => m.set(s.requirementId, s.vstatus));
    return m;
  }, [buildId, buildSummary]);
  const mfr = useMemo(() => manufacturingReadiness(buildVstatusMap), [dataVersion, buildVstatusMap]);

  const statusColor = (s: string) => s === 'compliant' || s === 'ready' ? '#16A34A' : s === 'in-progress' || s === 'at-risk' ? '#D97706' : '#DC2626';
  const statusLabel = (s: string) => s === 'compliant' ? 'Compliant' : s === 'in-progress' ? 'In Progress' : s === 'ready' ? 'Ready' : s === 'at-risk' ? 'At Risk' : 'Blocked';

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'hsl(var(--background))', padding: '20px 24px 48px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>

        {/* Gate timeline */}
        <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, padding: '20px 28px 24px', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'hsl(var(--foreground))', marginBottom: 28 }}>Phase gate timeline</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
            {GATES.map((g, i) => {
              const isPassed  = g.state === 'passed';
              const isCurrent = g.state === 'current';
              const isFuture  = !isPassed && !isCurrent;
              const circleCol = isPassed ? '#16A34A' : isCurrent ? '#3B82F6' : 'hsl(var(--border))';
              const labelCol  = isPassed ? '#16A34A' : isCurrent ? '#3B82F6' : 'hsl(var(--muted-foreground))';
              const lineCol   = GATES[i - 1]?.state === 'passed' ? '#16A34A' : 'hsl(var(--border))';
              const initial   = (g.short ?? g.name ?? g.id).slice(0, 1).toUpperCase();
              return (
                <React.Fragment key={g.id}>
                  {i > 0 && (
                    <div style={{ flex: 1, height: 2, background: lineCol, marginTop: 21, flexShrink: 1 }} />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {/* Circle */}
                    <div style={{
                      width: 44, height: 44, borderRadius: 9999, flexShrink: 0,
                      background: isPassed ? '#16A34A' : isCurrent ? '#3B82F6' : 'transparent',
                      border: `2px solid ${circleCol}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: isCurrent ? `0 0 0 4px ${softTint('#3B82F6', 0.12)}` : 'none',
                    }}>
                      {isPassed
                        ? <Check size={18} color="#fff" />
                        : <span style={{ fontSize: 13, fontWeight: 700, color: isCurrent ? '#fff' : 'hsl(var(--muted-foreground))' }}>{initial}</span>}
                    </div>
                    {/* Labels */}
                    <div style={{ textAlign: 'center', minWidth: 80 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: labelCol, marginBottom: 2 }}>{g.id}</div>
                      <div style={{ fontSize: 11.5, fontWeight: isCurrent ? 600 : 400, color: isFuture ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))', lineHeight: 1.3, marginBottom: 2 }}>{g.name}</div>
                      <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{g.date}</div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Gate readiness */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, padding: '18px 20px', borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>G2 gate readiness</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <ScoreRing pct={gate.score} tint={gate.score >= 80 ? '#16A34A' : gate.score >= 60 ? '#D97706' : '#DC2626'} grade={`${gate.score}%`} size={80} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <GateCrit label="Critical & high reqs approved" value={`${gate.approved}/${gate.critical}`} pct={gate.approvedPct} pass={gate.approvedPct >= 80} />
                <GateCrit label="System/subsystem verified" value={`${gate.verified}/${gate.sysSub}`} pct={gate.verifiedPct} pass={gate.verifiedPct >= 60} />
                <GateCrit label="Blocker gaps" value={`${gate.blockers.length}`} pct={100 - Math.round(gate.blockers.length / gate.critical * 100)} pass={gate.blockers.length < 3} />
              </div>
            </div>
          </div>
          <div style={{ flex: 1, padding: '18px 20px', borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Blockers ({gate.blockers.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 160, overflowY: 'auto' }}>
              {gate.blockers.slice(0, 8).map(b => (
                <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 7, background: 'hsl(var(--muted))', fontSize: 12 }}>
                  <ReqKeyTag reqKey={b.key} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'hsl(var(--foreground))' }}>{b.title}</span>
                  <PriorityPill priority={b.priority} />
                </div>
              ))}
              {gate.blockers.length > 8 && <div style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))' }}>+{gate.blockers.length - 8} more</div>}
            </div>
          </div>
        </div>

        {/* Manufacturing readiness */}
        <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', gap: 9 }}>
            <Activity size={15} color="hsl(var(--muted-foreground))" />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'hsl(var(--foreground))' }}>Manufacturing readiness by subsystem</span>
            <div style={{ flex: 1 }} />
            {projectBuilds.length > 0 && (
              <select value={buildId} onChange={e => setBuildId(e.target.value)} title="Scope readiness to one physical build's test results, instead of the project-wide rollup"
                style={{ height: 28, borderRadius: 6, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', color: 'hsl(var(--foreground))', fontFamily: 'inherit', fontSize: 12, padding: '0 8px' }}>
                <option value="">All builds (project-wide)</option>
                {projectBuilds.map(b => <option key={b.id} value={b.id}>{b.name} ({b.type})</option>)}
              </select>
            )}
          </div>
          <div style={{ padding: 16 }}>
            {mfr.map(m => (
              <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid hsl(var(--border))' }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'hsl(var(--muted-foreground))', width: 32, flexShrink: 0 }}>{m.key}</span>
                <span style={{ fontSize: 12.5, color: 'hsl(var(--foreground))', width: 160, flexShrink: 0 }}>{REQ_GROUP[m.key as ReqGroup]?.label ?? m.key}</span>
                <div style={{ flex: 1 }}><CoverageBar label="" total={m.reqs} verified={m.verified} gaps={m.open} /></div>
                <span style={{ width: 52, textAlign: 'right', fontSize: 12, fontWeight: 600, color: statusColor(m.status) }}>{statusLabel(m.status)}</span>
                <span style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))', width: 60, textAlign: 'right' }}>{m.parts} parts</span>
              </div>
            ))}
          </div>
        </div>

        {/* Standards compliance */}
        <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', gap: 9 }}>
            <BookOpen size={15} color="hsl(var(--muted-foreground))" />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'hsl(var(--foreground))' }}>Standards compliance overlay</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'hsl(var(--muted))' }}>
                  {['Standard', 'Domain', 'Reqs', 'Verified', 'Passed', 'Gaps', 'Status'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stds.map((s, i) => (
                  <tr key={s.code} style={{ borderBottom: '1px solid hsl(var(--border))', background: i % 2 === 0 ? 'transparent' : 'hsl(var(--muted))' }}>
                    <td style={{ padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>{s.code}</td>
                    <td style={{ padding: '9px 12px', color: 'hsl(var(--foreground))' }}>{s.domain}</td>
                    <td style={{ padding: '9px 12px', color: 'hsl(var(--foreground))', textAlign: 'center' }}>{s.count}</td>
                    <td style={{ padding: '9px 12px', color: 'hsl(var(--foreground))', textAlign: 'center' }}>{s.verified}</td>
                    <td style={{ padding: '9px 12px', color: 'hsl(var(--foreground))', textAlign: 'center' }}>{s.passed}</td>
                    <td style={{ padding: '9px 12px', color: s.gaps > 0 ? '#DC2626' : '#16A34A', fontWeight: 600, textAlign: 'center' }}>{s.gaps}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ padding: '2px 9px', borderRadius: 9999, fontSize: 10.5, fontWeight: 700, background: softTint(statusColor(s.status), 0.12), color: statusColor(s.status), border: `1px solid ${softTint(statusColor(s.status), 0.28)}` }}>
                        {statusLabel(s.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function GateCrit({ label, value, pct, pass }: { label: string; value: string; pct: number; pass: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 16, height: 16, borderRadius: 9999, background: pass ? softTint('#16A34A', 0.15) : softTint('#DC2626', 0.15), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {pass ? <Check size={10} color="#16A34A" /> : <X size={10} color="#DC2626" />}
      </span>
      <span style={{ flex: 1, fontSize: 12, color: 'hsl(var(--foreground))' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: pass ? '#16A34A' : '#DC2626' }}>{value}</span>
    </div>
  );
}

// ── Traceability helpers ────────────────────────────────────────────────────────
const MATRIX_COLS = [
  { key: 'source',   label: 'Source',    hint: 'Has an upstream link' },
  { key: 'refined',  label: 'Decomp.',   hint: 'Refined into children' },
  { key: 'alloc',    label: 'Allocated', hint: 'Allocated to a BOM part' },
  { key: 'verified', label: 'Verified',  hint: 'Verification result' },
  { key: 'approved', label: 'Approved',  hint: 'Lifecycle ≥ approved' },
  { key: 'suspect',  label: 'Clean',     hint: 'No suspect links' },
] as const;
type MatrixColKey = typeof MATRIX_COLS[number]['key'];

function cellState(r: Requirement, col: MatrixColKey): 'ok' | 'warn' | 'bad' | 'na' {
  switch (col) {
    case 'source':   return r.type === 'stakeholder-need' ? 'na' : (r.coverage.orphan ? 'bad' : 'ok');
    case 'refined':  return r.type === 'component-req' ? 'na' : (r.childKeys.length ? 'ok' : 'warn');
    case 'alloc':    return (r.type === 'subsystem-req' || r.type === 'component-req') ? (r.alloc.length ? 'ok' : 'bad') : 'na';
    case 'verified': return r.vstatus === 'passed' ? 'ok' : r.vstatus === 'failed' ? 'bad' : r.vstatus === 'not-verified' ? 'warn' : 'ok';
    case 'approved': return REQ_STATUS[r.status].step >= 2 ? 'ok' : 'warn';
    case 'suspect':  return r.coverage.suspect ? 'bad' : 'ok';
  }
}

function MatrixCell({ state, title }: { state: 'ok' | 'warn' | 'bad' | 'na'; title: string }) {
  const ok = state === 'ok', warn = state === 'warn', bad = state === 'bad', na = state === 'na';
  const tint = ok ? '#16A34A' : warn ? '#D97706' : bad ? '#DC2626' : '#9CA3AF';
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 24, height: 24, borderRadius: 6,
      background: na ? 'transparent' : softTint(tint, 0.12),
      border: na ? '1px dashed hsl(var(--border))' : 'none',
    }}>
      {ok   && <Check  size={13} color={tint} />}
      {warn && <Minus  size={13} color={tint} />}
      {bad  && <X      size={13} color={tint} />}
      {na   && <span style={{ width: 4, height: 4, borderRadius: 9999, background: 'hsl(var(--muted-foreground))' }} />}
    </span>
  );
}

// ── Traceability view ──────────────────────────────────────────────────────────
function TraceabilityView({ onOpen, dataVersion }: { onOpen: (k: string) => void; onDrill?: (g: keyof typeof GAP_META | null, extra?: Partial<FilterState>) => void; dataVersion: unknown }) {
  const [mode, setMode] = useState<'matrix' | 'graph' | 'proof'>('matrix');
  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 24px', borderTop: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 3, gap: 2 }}>
          {([
            { id: 'matrix', Icon: Table2,  label: 'Coverage matrix' },
            { id: 'graph',  Icon: Network, label: 'Dependency graph' },
            { id: 'proof',  Icon: Cable,   label: 'Full trace' },
          ] as const).map(({ id, Icon, label }) => {
            const on = mode === id;
            return (
              <button key={id} onClick={() => setMode(id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px',
                borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'inherit', border: 'none',
                background: on ? 'hsl(var(--card))' : 'transparent',
                color: on ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                boxShadow: on ? '0 1px 2px rgba(20,24,31,0.10)' : 'none',
              }}>
                <Icon size={14} color={on ? '#3B82F6' : 'hsl(var(--muted-foreground))'} />
                {label}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
          {mode === 'matrix'
            ? 'Requirement × coverage-dimension grid — green = covered, amber = partial, red = gap.'
            : mode === 'graph'
            ? 'Decomposition graph bridging requirements to allocated BOM parts. Hover to trace a path.'
            : 'Full multi-hop chain — tree + depends_on, in either direction — from a stakeholder need down to hardware, or from a part back up to why it exists.'}
        </span>
      </div>
      {mode === 'matrix' ? <TraceMatrix onOpen={onOpen} dataVersion={dataVersion} />
        : mode === 'graph' ? <DependencyGraph onOpen={onOpen} dataVersion={dataVersion} />
        : <FullTraceView onOpen={onOpen} dataVersion={dataVersion} />}
    </div>
  );
}

// Picks any requirement as the trace anchor, or any allocated BOM part — the
// part path is the literal "start at a component, see why it exists" query
// (plan §B/§10); picking a requirement runs both directions from it at once,
// answering §9 (forward, multi-hop through tree + depends_on) and the
// "final proof" query (§32: does this chain actually reach real hardware).
function FullTraceView({ onOpen, dataVersion }: { onOpen: (k: string) => void; dataVersion: unknown }) {
  const [anchor, setAnchor] = useState<'req' | 'part'>('req');
  const [focusKey, setFocusKey] = useState<string>('');
  const [focusPart, setFocusPart] = useState<string>('');
  const [pickOpen, setPickOpen] = useState(false);

  const reqOptions = useMemo(() => REQS, [dataVersion]);
  const partOptions = useMemo(() => allAllocatedParts(), [dataVersion]);

  const effectiveFocus = focusKey && BY_KEY[focusKey] ? focusKey : reqOptions[0]?.key ?? '';
  const fr = BY_KEY[effectiveFocus];

  const { down, up } = useMemo(() => {
    if (!fr) return { down: null, up: null };
    return { down: traceDown(fr.key), up: traceUp(fr.key) };
  }, [fr, dataVersion]);

  const partAllocators = useMemo(
    () => (focusPart ? requirementsAllocatingPart(focusPart) : []),
    [focusPart, dataVersion],
  );

  if (anchor === 'req' && (!fr || !down || !up)) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>No requirements yet.</div>;
  }

  // Exclude the focus itself from the rendered root list even though traceUp()
  // correctly includes it when it has no parent — the focus card below already
  // shows it; a self-referential "root" row would just duplicate that.
  const isFocusRoot = fr ? (up?.roots ?? []).includes(fr.key) : false;
  const rootReqs = (up?.roots ?? []).filter(k => k !== effectiveFocus).map(k => BY_KEY[k]).filter((r): r is Requirement => !!r);
  const midReqs = (up?.reqs ?? []).filter(k => !(up?.roots ?? []).includes(k)).map(k => BY_KEY[k]).filter((r): r is Requirement => !!r);
  const downReqs = (down?.reqs ?? []).map(k => BY_KEY[k]).filter((r): r is Requirement => !!r);
  const proofOk = (rootReqs.length > 0 || isFocusRoot) && (down?.parts.length ?? 0) > 0;

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', borderTop: '1px solid hsl(var(--border))', background: 'hsl(var(--background))' }}>
      {/* Anchor bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 24px', borderBottom: '1px solid hsl(var(--border))', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))', borderRadius: 7, padding: 2, gap: 2 }}>
          {([{ id: 'req' as const, label: 'Requirement' }, { id: 'part' as const, label: 'BOM part' }]).map(({ id, label }) => (
            <button key={id} onClick={() => { setAnchor(id); setPickOpen(false); }} style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              fontFamily: 'inherit', border: 'none',
              background: anchor === id ? 'hsl(var(--card))' : 'transparent',
              color: anchor === id ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
            }}>{label}</button>
          ))}
        </div>

        {anchor === 'req' ? (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setPickOpen(o => !o)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px',
              borderRadius: 7, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600, color: '#3B82F6' }}>{fr?.key}</span>
              <span style={{ fontSize: 12.5, color: 'hsl(var(--foreground))', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fr?.title}</span>
              <ChevronsUpDown size={13} color="hsl(var(--muted-foreground))" />
            </button>
            {pickOpen && (
              <>
                <div onClick={() => setPickOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{ position: 'absolute', left: 0, top: 36, width: 340, maxHeight: 360, overflowY: 'auto', zIndex: 50, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 9, boxShadow: '0 12px 32px rgba(20,24,31,0.16)', padding: 5 }}>
                  {reqOptions.map(r => (
                    <button key={r.key} onClick={() => { setFocusKey(r.key); setPickOpen(false); }} style={{
                      display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 9px',
                      borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      background: r.key === effectiveFocus ? softTint('#3B82F6', 0.08) : 'transparent',
                    }}
                    onMouseEnter={e => { if (r.key !== effectiveFocus) (e.currentTarget as HTMLElement).style.background = 'hsl(var(--muted))'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = r.key === effectiveFocus ? softTint('#3B82F6', 0.08) : 'transparent'; }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, fontWeight: 600, color: '#3B82F6', width: 72, flexShrink: 0 }}>{r.key}</span>
                      <span style={{ fontSize: 12.5, color: 'hsl(var(--foreground))', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setPickOpen(o => !o)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px',
              borderRadius: 7, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <Package size={13} color="#D97706" />
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600, color: '#D97706' }}>{focusPart || 'Pick a part…'}</span>
              <ChevronsUpDown size={13} color="hsl(var(--muted-foreground))" />
            </button>
            {pickOpen && (
              <>
                <div onClick={() => setPickOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{ position: 'absolute', left: 0, top: 36, width: 260, maxHeight: 360, overflowY: 'auto', zIndex: 50, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 9, boxShadow: '0 12px 32px rgba(20,24,31,0.16)', padding: 5 }}>
                  {partOptions.length === 0 && <div style={{ padding: '10px 9px', fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>No allocated parts yet.</div>}
                  {partOptions.map(p => (
                    <button key={p} onClick={() => { setFocusPart(p); setPickOpen(false); }} style={{
                      display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 9px',
                      borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      background: p === focusPart ? softTint('#D97706', 0.08) : 'transparent',
                    }}
                    onMouseEnter={e => { if (p !== focusPart) (e.currentTarget as HTMLElement).style.background = 'hsl(var(--muted))'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = p === focusPart ? softTint('#D97706', 0.08) : 'transparent'; }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, fontWeight: 600, color: '#D97706' }}>{p}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />
        {anchor === 'req' && (
          <span style={{ fontSize: 11.5, color: proofOk ? '#16A34A' : 'hsl(var(--muted-foreground))', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {proofOk ? <CheckCircle size={13} color="#16A34A" /> : <AlertTriangle size={13} />}
            {proofOk ? 'Full chain: need → hardware' : 'Chain incomplete — no root need or no hardware allocated'}
          </span>
        )}
      </div>

      {anchor === 'part' ? (
        <div style={{ padding: 24 }}>
          {!focusPart ? (
            <div style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>Pick a BOM part above to see why it exists.</div>
          ) : partAllocators.length === 0 ? (
            <div style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>Not allocated to any requirement.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: '#D97706' }}>{focusPart}</span> is allocated to {partAllocators.length} requirement{partAllocators.length === 1 ? '' : 's'}:
              </div>
              {partAllocators.map(k => BY_KEY[k]).filter((r): r is Requirement => !!r).map(r => (
                <div key={r.key} onClick={() => { setAnchor('req'); setFocusKey(r.key); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--muted))')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'hsl(var(--card))')}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, fontWeight: 600, color: '#3B82F6', width: 78, flexShrink: 0 }}>{r.key}</span>
                  <TypePill type={r.type} />
                  <span style={{ fontSize: 12.5, color: 'hsl(var(--foreground))', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  <span style={{ fontSize: 11, color: '#3B82F6', fontWeight: 600, flexShrink: 0 }}>View full trace →</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <TraceSection title="Traces up to" icon={ArrowUpRight} tint="#3B82F6"
            emptyLabel="This is already a root — no parent, no incoming dependency.">
            {rootReqs.map(r => <TraceReqRow key={r.key} r={r} tag="root" onOpen={onOpen} onFocus={setFocusKey} />)}
            {midReqs.map(r => <TraceReqRow key={r.key} r={r} onOpen={onOpen} onFocus={setFocusKey} />)}
          </TraceSection>

          {/* Focus card */}
          {fr && (
            <div onClick={() => onOpen(fr.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, border: '2px solid #3B82F6', background: softTint('#3B82F6', 0.08), cursor: 'pointer' }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, fontWeight: 700, color: '#3B82F6' }}>{fr.key}</span>
              <TypePill type={fr.type} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--foreground))', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fr.title}</span>
              {fr.target && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#3B82F6', flexShrink: 0 }}>target: {fr.target.value}{fr.target.unit}</span>}
              {isFocusRoot && <span style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', background: softTint('#16A34A', 0.12), padding: '2px 7px', borderRadius: 5, flexShrink: 0 }}>ROOT</span>}
              <StatusBadge status={fr.status} />
            </div>
          )}

          <TraceSection title="Traces down to" icon={ArrowDownRight} tint="#D97706"
            emptyLabel="Nothing derives from or depends on this yet, and no BOM parts are allocated.">
            {downReqs.map(r => <TraceReqRow key={r.key} r={r} onOpen={onOpen} onFocus={setFocusKey} />)}
            {(down?.parts ?? []).map(p => <TracePartRow key={p} partNumber={p} qty={qtyForPart(p)} onFocusPart={(pn) => { setAnchor('part'); setFocusPart(pn); }} />)}
          </TraceSection>
        </div>
      )}
    </div>
  );
}

function TraceSection({ title, icon: Icon, tint, emptyLabel, children }:
  { title: string; icon: React.ElementType; tint: string; emptyLabel: string; children: React.ReactNode }) {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 24, height: 24, borderRadius: 6, background: softTint(tint, 0.12), display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={13} color={tint} />
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{title}</span>
      </div>
      {hasChildren
        ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 8, borderLeft: `2px solid ${softTint(tint, 0.25)}` }}>{children}</div>
        : <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', paddingLeft: 8 }}>{emptyLabel}</div>}
    </div>
  );
}

function TraceReqRow({ r, tag, onOpen, onFocus }: { r: Requirement; tag?: string; onOpen: (k: string) => void; onFocus: (k: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}>
      <span onClick={() => onOpen(r.key)} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, fontWeight: 600, color: '#3B82F6', width: 78, flexShrink: 0, cursor: 'pointer' }}>{r.key}</span>
      <TypePill type={r.type} />
      <span onClick={() => onOpen(r.key)} style={{ fontSize: 12.5, color: 'hsl(var(--foreground))', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>{r.title}</span>
      {tag === 'root' && r.target && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16A34A', flexShrink: 0 }}>{r.target.value}{r.target.unit}</span>}
      {tag === 'root' && <span style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', background: softTint('#16A34A', 0.12), padding: '2px 7px', borderRadius: 5, flexShrink: 0 }}>ROOT</span>}
      <button onClick={() => onFocus(r.key)} title="Trace from here" style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--muted))')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <Cable size={12} color="hsl(var(--muted-foreground))" />
      </button>
    </div>
  );
}

function TracePartRow({ partNumber, qty, onFocusPart }: { partNumber: string; qty?: AllocatedPartStock; onFocusPart: (p: string) => void }) {
  return (
    <div onClick={() => onFocusPart(partNumber)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 8, border: `1px solid ${softTint('#D97706', 0.3)}`, background: softTint('#D97706', 0.03), cursor: 'pointer' }}>
      <Package size={13} color="#D97706" style={{ flexShrink: 0 }} />
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, fontWeight: 600, color: '#D97706', flex: 1 }}>{partNumber}</span>
      {qty && (
        <span style={{ fontSize: 10.5, fontWeight: 600, color: qty.available <= 0 ? '#DC2626' : 'hsl(var(--muted-foreground))', flexShrink: 0 }}>
          {qty.available <= 0 ? 'out of stock' : `${qty.available} available`}
        </span>
      )}
    </div>
  );
}

function TraceMatrix({ onOpen, dataVersion }: { onOpen: (k: string) => void; dataVersion: unknown }) {
  const groups = useMemo(() =>
    (Object.keys(REQ_GROUP) as ReqGroup[])
      .map(g => ({ g, rows: REQS.filter(r => r.group === g) }))
      .filter(x => x.rows.length > 0),
  [dataVersion]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const colPcts = useMemo(() => MATRIX_COLS.map(col => {
    const rel = REQS.filter(r => cellState(r, col.key) !== 'na');
    const ok  = rel.filter(r => cellState(r, col.key) === 'ok').length;
    return rel.length ? Math.round((ok / rel.length) * 100) : 0;
  }), [dataVersion]);

  const NAME_W = 320, COL_W = 92;

  return (
    <div style={{ flex: 1, overflow: 'auto', borderTop: '1px solid hsl(var(--border))', background: 'hsl(var(--background))' }}>
      <div style={{ minWidth: NAME_W + MATRIX_COLS.length * COL_W + 40, paddingBottom: 40 }}>

        {/* Sticky header */}
        <div style={{ display: 'flex', alignItems: 'stretch', position: 'sticky', top: 0, zIndex: 20, background: 'hsl(var(--card))', borderBottom: '1px solid hsl(var(--border))' }}>
          <div style={{
            width: NAME_W, flexShrink: 0, display: 'flex', alignItems: 'center',
            padding: '0 24px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'hsl(var(--muted-foreground))',
            position: 'sticky', left: 0, background: 'hsl(var(--card))', zIndex: 2,
            borderRight: '1px solid hsl(var(--border))',
          }}>Requirement</div>
          {MATRIX_COLS.map((col, i) => (
            <div key={col.key} title={col.hint} style={{
              width: COL_W, flexShrink: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', padding: '9px 0',
              borderRight: '1px solid hsl(var(--border))',
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{col.label}</span>
              <span style={{ fontSize: 10, fontWeight: 600, marginTop: 2, color: colPcts[i] >= 70 ? '#16A34A' : colPcts[i] >= 40 ? '#CA8A04' : '#DC2626' }}>
                {colPcts[i]}%
              </span>
            </div>
          ))}
        </div>

        {/* Groups */}
        {groups.map(({ g, rows }) => {
          const meta = REQ_GROUP[g];
          const Ic = GROUP_ICONS[g];
          const isCol = !!collapsed[g];
          const cleanCount = rows.filter(r => !r.hasGap).length;
          return (
            <div key={g}>
              {/* Collapsible group header */}
              <div
                onClick={() => setCollapsed(p => ({ ...p, [g]: !p[g] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '8px 24px',
                  background: 'hsl(var(--card))', borderBottom: '1px solid hsl(var(--border))',
                  cursor: 'pointer', position: 'sticky', left: 0, zIndex: 1,
                }}>
                <span style={{ display: 'inline-flex', transition: 'transform .15s', transform: isCol ? 'rotate(-90deg)' : 'none' }}>
                  <ChevronDown size={14} color="hsl(var(--muted-foreground))" />
                </span>
                <Ic size={14} color={meta.tint} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{meta.label}</span>
                <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{rows.length} reqs · {cleanCount} clean</span>
              </div>

              {/* Requirement rows */}
              {!isCol && rows.map(r => (
                <div key={r.key}
                  onClick={() => onOpen(r.key)}
                  style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid hsl(var(--border))', cursor: 'pointer', background: r.hasGap ? softTint('#DC2626', 0.02) : 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--muted))')}
                  onMouseLeave={e => (e.currentTarget.style.background = r.hasGap ? softTint('#DC2626', 0.02) : 'transparent')}>

                  {/* Sticky name cell */}
                  <div style={{
                    width: NAME_W, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9,
                    padding: '8px 24px', position: 'sticky', left: 0,
                    background: 'inherit', borderRight: '1px solid hsl(var(--border))', zIndex: 1,
                  }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, fontWeight: 600, color: '#3B82F6', width: 78, flexShrink: 0 }}>{r.key}</span>
                    <TypePill type={r.type} />
                    <span style={{ fontSize: 12.5, color: 'hsl(var(--foreground))', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  </div>

                  {/* Matrix cells */}
                  {MATRIX_COLS.map(col => (
                    <div key={col.key} style={{ width: COL_W, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid hsl(var(--border))' }}>
                      <MatrixCell state={cellState(r, col.key)} title={`${col.label}: ${cellState(r, col.key)}`} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DependencyGraph({ onOpen, dataVersion }: { onOpen: (k: string) => void; dataVersion: unknown }) {
  const FOCUS_OPTS = useMemo(() => REQS.filter(r => r.type === 'system-req' || r.type === 'stakeholder-req'), [dataVersion]);
  const [focus, setFocus] = useState('SYS-001');
  const [hover, setHover] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const fr = BY_KEY[focus];

  const nodeW = 168, nodeH = 46, COL_W = 188, V_GAP = 18, PAD = 30;

  type GraphNode = { key: string; x: number; y: number; kind: string; r: Requirement | null };
  type GraphEdge = { from: string; to: string; kind: 'derive' | 'alloc'; suspect: boolean };

  const { nodes, edges, svgW, svgH } = useMemo(() => {
    if (!fr) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[], svgW: 600, svgH: 300 };

    const anc = ancestors(focus).reverse();
    const kids = fr.childKeys.map(k => BY_KEY[k]).filter(Boolean) as Requirement[];

    const colMap: Record<number, { key: string; kind: string; r: Requirement | null }[]> = {};
    const addNode = (key: string, kind: string) => {
      const r = BY_KEY[key] ?? null;
      const tier = r ? REQ_TYPE[r.type].tier : 5;
      (colMap[tier] = colMap[tier] ?? []).push({ key, kind, r });
    };
    anc.forEach(k => addNode(k, 'anc'));
    addNode(focus, 'focus');
    kids.forEach(k => addNode(k.key, 'child'));
    const parts = new Set<string>();
    [fr, ...kids].forEach(r => r.alloc.forEach(p => parts.add(p)));
    Array.from(parts).slice(0, 8).forEach(p => (colMap[5] = colMap[5] ?? []).push({ key: p, kind: 'part', r: null }));

    const cols = Object.keys(colMap).map(Number).sort((a, b) => a - b);
    const maxRows = Math.max(...cols.map(c => colMap[c].length), 1);
    const svgH = PAD * 2 + maxRows * nodeH + (maxRows - 1) * V_GAP;
    const svgW = PAD * 2 + cols.length * COL_W;

    const pos: Record<string, { x: number; y: number; kind: string; r: Requirement | null }> = {};
    cols.forEach((c, ci) => {
      const list = colMap[c];
      const colH = list.length * nodeH + (list.length - 1) * V_GAP;
      const startY = (svgH - colH) / 2;
      list.forEach((n, ri) => {
        pos[n.key] = { x: PAD + ci * COL_W, y: startY + ri * (nodeH + V_GAP), kind: n.kind, r: n.r };
      });
    });

    const edgeList: GraphEdge[] = [];
    Object.keys(pos).forEach(k => {
      const r = BY_KEY[k]; if (!r) return;
      r.childKeys.forEach(c => { if (pos[c]) edgeList.push({ from: k, to: c, kind: 'derive', suspect: BY_KEY[c]?.coverage.suspect ?? false }); });
      r.alloc.forEach(p => { if (pos[p]) edgeList.push({ from: k, to: p, kind: 'alloc', suspect: false }); });
    });

    return { nodes: Object.keys(pos).map(k => ({ key: k, ...pos[k] })), edges: edgeList, svgW, svgH };
  }, [focus, fr, dataVersion]);

  const edgePath = (e: GraphEdge) => {
    const a = nodes.find(n => n.key === e.from), b = nodes.find(n => n.key === e.to);
    if (!a || !b) return '';
    const x1 = a.x + nodeW, y1 = a.y + nodeH / 2, x2 = b.x, y2 = b.y + nodeH / 2;
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  };

  const connected = (key: string) =>
    hover !== null && (hover === key || edges.some(e => (e.from === hover && e.to === key) || (e.to === hover && e.from === key)));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderTop: '1px solid hsl(var(--border))', background: 'hsl(var(--background))' }}>

      {/* Controls bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 24px', borderBottom: '1px solid hsl(var(--border))' }}>
        <span style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))' }}>Focus requirement</span>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setPickOpen(o => !o)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px',
            borderRadius: 7, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600, color: '#3B82F6' }}>{focus}</span>
            <span style={{ fontSize: 12.5, color: 'hsl(var(--foreground))', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fr?.title}</span>
            <ChevronsUpDown size={13} color="hsl(var(--muted-foreground))" />
          </button>
          {pickOpen && (
            <>
              <div onClick={() => setPickOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{
                position: 'absolute', left: 0, top: 36, width: 320, maxHeight: 340, overflowY: 'auto',
                zIndex: 50, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                borderRadius: 9, boxShadow: '0 12px 32px rgba(20,24,31,0.16)', padding: 5,
              }}>
                {FOCUS_OPTS.map(r => (
                  <button key={r.key} onClick={() => { setFocus(r.key); setPickOpen(false); }} style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 9px',
                    borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    background: r.key === focus ? softTint('#3B82F6', 0.08) : 'transparent',
                  }}
                  onMouseEnter={e => { if (r.key !== focus) (e.currentTarget as HTMLElement).style.background = 'hsl(var(--muted))'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = r.key === focus ? softTint('#3B82F6', 0.08) : 'transparent'; }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, fontWeight: 600, color: '#3B82F6', width: 72, flexShrink: 0 }}>{r.key}</span>
                    <span style={{ fontSize: 12.5, color: 'hsl(var(--foreground))', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, color: 'hsl(var(--muted-foreground))' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 18, height: 2, background: 'hsl(var(--border))', display: 'inline-block' }} />derives
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 18, height: 0, borderTop: '2px solid #D97706', display: 'inline-block' }} />allocated
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 18, height: 0, borderTop: '2px dashed #DC2626', display: 'inline-block' }} />suspect
          </span>
        </div>
      </div>

      {/* Graph canvas */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ position: 'relative', width: svgW, height: svgH, margin: '0 auto' }}>
          <svg width={svgW} height={svgH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {edges.map((e, i) => {
              const act = connected(e.from) || connected(e.to);
              const baseCol = e.kind === 'alloc' ? '#D97706' : e.suspect ? '#DC2626' : 'hsl(var(--border))';
              const actCol  = e.kind === 'alloc' ? '#D97706' : e.suspect ? '#DC2626' : '#3B82F6';
              return (
                <path key={i} d={edgePath(e)} fill="none"
                  stroke={act ? actCol : baseCol}
                  strokeWidth={act ? 2.2 : 1.5}
                  strokeDasharray={e.suspect ? '5 4' : undefined}
                  opacity={hover !== null && !act ? 0.25 : 1}
                  style={{ transition: 'opacity .15s, stroke .15s' }} />
              );
            })}
          </svg>
          {nodes.map(n => {
            const isPart = n.kind === 'part', isFocus = n.kind === 'focus';
            const tint = isPart ? '#D97706' : (n.r ? REQ_STATUS[n.r.status].tint : 'hsl(var(--muted-foreground))');
            const dim = hover !== null && !connected(n.key);
            const isConn = connected(n.key);
            return (
              <div key={n.key}
                onMouseEnter={() => setHover(n.key)}
                onMouseLeave={() => setHover(null)}
                onClick={() => { if (!isPart) onOpen(n.key); }}
                style={{
                  position: 'absolute', left: n.x, top: n.y, width: nodeW, height: nodeH,
                  boxSizing: 'border-box', borderRadius: 9, padding: '7px 10px',
                  cursor: isPart ? 'default' : 'pointer', overflow: 'hidden',
                  background: isFocus ? softTint('#3B82F6', 0.10) : 'hsl(var(--card))',
                  border: `${isFocus ? 2 : 1}px solid ${isFocus ? '#3B82F6' : (isConn ? tint : 'hsl(var(--border))')}`,
                  boxShadow: isFocus ? `0 4px 14px ${softTint('#3B82F6', 0.20)}` : '0 1px 2px rgba(20,24,31,0.06)',
                  opacity: dim ? 0.4 : 1, transition: 'opacity .15s, border-color .15s', zIndex: isConn ? 5 : 2,
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isPart
                    ? <Package size={11} color="#D97706" />
                    : <span style={{ width: 7, height: 7, borderRadius: 9999, background: tint, flexShrink: 0 }} />}
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: isPart ? '#D97706' : '#3B82F6' }}>{n.key}</span>
                </div>
                <div style={{ fontSize: 11, color: 'hsl(var(--foreground))', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.r ? n.r.title : 'BOM part / assembly'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Map view — multi-lens node graph ────────────────────────────────────────
// A view selector reshapes the same requirement model into different
// container-grouped layouts (Systems, Requirement Groups, Functions, Tests,
// Analysis, Risks & Safety, Interfaces, Requirement Hierarchy, Test Planning,
// Test Execution, Library). Containers collapse to an "N items" summary and
// expand to a tidy left→right tree of member cards with per-card collapse
// handles. Pan, wheel-zoom, fit-on-open, drag containers, minimap.
const MAP_NW = 234, MAP_NH = 112, MAP_HGAP = 58, MAP_VGAP = 20, MAP_PAD = 22, MAP_HEADER = 34;
const MAP_SPINE_W = 214, MAP_SPINE_H = 100, MAP_SPINE_GAP = 132, MAP_CGAP = 46;
const MAP_COL_W = 340, MAP_COL_H = 70, MAP_GRID_GAP = 26, MAP_GRID_COLS = 5;

interface MapNode {
  id: string; kind: 'req' | 'test'; r: Requirement; isRoot?: boolean; contId?: string;
  children: MapNode[]; _x: number; _y: number; ax: number; ay: number;
}
interface MapContainer {
  id: string; title: string; icon: React.ElementType; count: number; keys: string[];
  open: boolean; owner?: string; cards: MapNode[]; edges: MapEdge[];
  x: number; y: number; w: number; h: number;
}
interface MapEdge { x1: number; y1: number; x2: number; y2: number; col: string; dash?: boolean; }
interface MapViewDef {
  id: string; label: string; icon: React.ElementType; tint: string;
  engine: 'groups' | 'tree' | 'grid';
  group?: 'module' | 'tier' | 'category' | 'vmethod' | 'status' | 'vstatus';
  showTests?: boolean; filter?: 'tested' | 'planned' | 'interface' | 'risk';
}

const CAT_ICONS: Record<ReqCategory, React.ElementType> = {
  functional: Boxes, performance: Gauge, interface: Cable, constraint: Ruler, quality: BadgeCheck, regulatory: Scale,
};
const VMETHOD_ICONS: Record<string, React.ElementType> = {
  test: FlaskConical, analysis: Activity, inspection: Search, demonstration: Play,
};
const TIER_META: Record<string, { label: string; icon: React.ElementType }> = {
  stakeholder: { label: 'Stakeholder Requirements', icon: Flag },
  system: { label: 'System Requirements', icon: Boxes },
  subsystem: { label: 'Subsystem Requirements', icon: Layers },
  component: { label: 'Component Requirements', icon: Package },
};

const MAP_VIEWS: MapViewDef[] = [
  { id: 'systems',    label: 'Systems',              icon: Boxes,          tint: '#D97706', engine: 'groups', group: 'module' },
  { id: 'groups',     label: 'Requirement Groups',   icon: FolderTree,     tint: '#2563EB', engine: 'groups', group: 'tier' },
  { id: 'functions',  label: 'Functions',            icon: FunctionSquare, tint: '#9333EA', engine: 'groups', group: 'category', showTests: true },
  { id: 'tests',      label: 'Tests',                icon: FolderCheck,    tint: '#16A34A', engine: 'groups', group: 'vmethod', filter: 'tested', showTests: true },
  { id: 'analysis',   label: 'Analysis',             icon: FileText,       tint: '#646B76', engine: 'groups', group: 'status' },
  { id: 'risks',      label: 'Risks & Safety',       icon: Triangle,       tint: '#DC2626', engine: 'groups', group: 'module', filter: 'risk' },
  { id: 'interfaces', label: 'Interfaces',           icon: Boxes,          tint: '#0EA5E9', engine: 'groups', group: 'module', filter: 'interface' },
  { id: 'hierarchy',  label: 'Requirement Hierarchy',icon: ListTree,       tint: '#2563EB', engine: 'tree' },
  { id: 'testplan',   label: 'Test Planning',        icon: FolderKanban,   tint: '#84CC16', engine: 'groups', group: 'vmethod', filter: 'planned', showTests: true },
  { id: 'testexec',   label: 'Test Execution',       icon: FolderCheck,    tint: '#DB2777', engine: 'groups', group: 'vstatus', filter: 'tested', showTests: true },
  { id: 'library',    label: 'Library View',         icon: BookMarked,     tint: '#646B76', engine: 'grid' },
];

function RequirementsMapView({ onOpen, dataVersion }: { onOpen: (k: string) => void; dataVersion: unknown }) {
  const [viewId, setViewId] = useState('systems');
  const view = MAP_VIEWS.find(v => v.id === viewId) ?? MAP_VIEWS[0];
  const ViewIcon = view.icon;

  const [openContainers, setOpenContainers] = useState<Set<string>>(new Set());
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [zoom, setZoom] = useState(0.72);
  const [pan, setPan] = useState({ x: 60, y: 40 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [dragC, setDragC] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  type MapDragState =
    | { type: 'cont'; id: string; startX: number; startY: number; ox: number; oy: number; zoom: number; moved: boolean }
    | { type: 'pan'; startX: number; startY: number; px: number; py: number; moved: boolean };
  const dragRef = useRef<MapDragState | null>(null);
  const didFit = useRef(false);

  const posKey = (id: string) => `req_map_off_${id}`;

  // Reset per-view interaction state whenever the lens changes
  useEffect(() => {
    let off: Record<string, { x: number; y: number }> = {};
    try { off = JSON.parse(localStorage.getItem(posKey(viewId)) || '{}'); } catch { /* */ }
    setOffsets(off);
    setOpenContainers(new Set());
    setOpenCards(view.engine === 'tree' ? new Set(REQ_ROOTS) : new Set());
    didFit.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId]);

  const bucketize = useCallback((v: MapViewDef): { id: string; title: string; icon: React.ElementType; keys: string[] }[] => {
    const memberFilter: (r: Requirement) => boolean =
      v.filter === 'tested' ? (r => r.vstatus !== 'not-verified')
      : v.filter === 'planned' ? (r => r.vstatus === 'not-verified' || r.vstatus === 'in-progress')
      : v.filter === 'interface' ? (r => r.category === 'interface')
      : v.filter === 'risk' ? (r => r.group === 'SAF' || r.category === 'regulatory' || r.priority === 'critical')
      : () => true;

    const tierOf = (t: ReqType) => (t === 'stakeholder-need' || t === 'stakeholder-req') ? 'stakeholder' : t.replace('-req', '');

    const accessor: (r: Requirement) => string | null =
      v.group === 'module' ? (r => r.group)
      : v.group === 'tier' ? (r => tierOf(r.type))
      : v.group === 'category' ? (r => r.category)
      : v.group === 'vmethod' ? (r => r.vmethod)
      : v.group === 'status' ? (r => r.status)
      : v.group === 'vstatus' ? (r => r.vstatus)
      : () => null;

    type Meta = { order: string[]; label: (k: string) => string; icon: (k: string) => React.ElementType };
    const meta: Meta =
      v.group === 'module' ? { order: Object.keys(REQ_GROUP), label: k => REQ_GROUP[k as ReqGroup].label, icon: k => GROUP_ICONS[k as ReqGroup] }
      : v.group === 'tier' ? { order: ['stakeholder', 'system', 'subsystem', 'component'], label: k => TIER_META[k].label, icon: k => TIER_META[k].icon }
      : v.group === 'category' ? { order: Object.keys(REQ_CATEGORY), label: k => REQ_CATEGORY[k as ReqCategory].label, icon: k => CAT_ICONS[k as ReqCategory] }
      : v.group === 'vmethod' ? { order: Object.keys(REQ_VMETHOD), label: k => REQ_VMETHOD[k as ReqVMethod].label + ' Tests', icon: k => VMETHOD_ICONS[k] }
      : v.group === 'status' ? { order: REQ_STATUS_FLOW, label: k => REQ_STATUS[k as ReqStatus].label, icon: () => Circle }
      : { order: ['passed', 'failed', 'in-progress', 'not-verified', 'waived'], label: k => REQ_VSTATUS[k as ReqVStatus].label, icon: () => ClipboardCheck };

    const map: Record<string, string[]> = {};
    REQS.forEach(r => {
      if (!memberFilter(r)) return;
      const b = accessor(r);
      if (b == null) return;
      (map[b] ??= []).push(r.key);
    });
    return meta.order.filter(k => map[k]?.length).map(k => ({ id: k, title: meta.label(k), icon: meta.icon(k), keys: map[k] }));
  }, [dataVersion]);

  const buildTree = useCallback((keys: string[], v: MapViewDef): MapNode[] => {
    const set = new Set(keys);
    const testOK = (r: Requirement) => !!v.showTests && r.vstatus !== 'not-verified';
    const make = (key: string): MapNode => {
      const r = BY_KEY[key];
      const kids: MapNode[] = (r.childKeys || []).filter(k => set.has(k)).map(make);
      if (testOK(r)) kids.unshift({ id: 'TC:' + key, kind: 'test', r, children: [], _x: 0, _y: 0, ax: 0, ay: 0 });
      return { id: key, kind: 'req', r, isRoot: false, children: kids, _x: 0, _y: 0, ax: 0, ay: 0 };
    };
    const roots = keys.filter(k => { const p = BY_KEY[k].parent; return !p || !set.has(p); }).map(make);
    roots.forEach(n => { n.isRoot = true; });
    return roots;
  }, [dataVersion]);

  const dominantOwner = (keys: string[]) => {
    const tally: Record<string, number> = {};
    keys.forEach(k => { const o = BY_KEY[k].owner; tally[o] = (tally[o] || 0) + 1; });
    return Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
  };

  const edgeBetween = (a: MapNode, b: MapNode, col: string): MapEdge => ({
    x1: a.ax + MAP_NW, y1: a.ay + MAP_NH / 2, x2: b.ax, y2: b.ay + MAP_NH / 2, col,
    dash: b.kind === 'req' && b.r.coverage.suspect,
  });
  const tintOfNode = (n: MapNode) => n.kind === 'test' ? '#16A34A' : REQ_STATUS[n.r.status].tint;

  // ── layout: produces absolute geometry for spine, containers, cards, edges ──
  const L = useMemo(() => {
    const off = (id: string) => offsets[id] ?? { x: 0, y: 0 };

    if (view.engine === 'grid') {
      const cards: MapNode[] = REQS.map((r, i) => {
        const col = i % MAP_GRID_COLS, row = Math.floor(i / MAP_GRID_COLS);
        return { id: r.key, kind: 'req' as const, r, children: [], _x: 0, _y: 0, ax: col * (MAP_NW + MAP_GRID_GAP), ay: row * (MAP_NH + MAP_GRID_GAP) };
      });
      const rows = Math.ceil(REQS.length / MAP_GRID_COLS);
      return { mode: 'grid' as const, cards, containers: [] as MapContainer[], edges: [] as MapEdge[], spine: null,
        bounds: { w: MAP_GRID_COLS * (MAP_NW + MAP_GRID_GAP), h: rows * (MAP_NH + MAP_GRID_GAP) } };
    }

    if (view.engine === 'tree') {
      const build = (key: string): MapNode => {
        const r = BY_KEY[key];
        return { id: key, kind: 'req' as const, r, children: (r.childKeys || []).map(build), _x: 0, _y: 0, ax: 0, ay: 0 };
      };
      const roots = REQ_ROOTS.map(build);
      let leafY = 0;
      const place = (n: MapNode, d: number): number => {
        n._x = d * (MAP_NW + MAP_HGAP);
        const kids = openCards.has(n.id) ? n.children : [];
        if (!kids.length) { n._y = leafY; leafY += MAP_NH + MAP_VGAP; return n._y + MAP_NH / 2; }
        const cs = kids.map(k => place(k, d + 1));
        n._y = (cs[0] + cs[cs.length - 1]) / 2 - MAP_NH / 2;
        return n._y + MAP_NH / 2;
      };
      roots.forEach(r => place(r, 0));
      const cards: MapNode[] = [], edges: MapEdge[] = [];
      const walk = (n: MapNode) => {
        n.ax = n._x; n.ay = n._y; cards.push(n);
        if (openCards.has(n.id)) n.children.forEach(c => { walk(c); edges.push(edgeBetween(n, c, tintOfNode(c))); });
      };
      roots.forEach(walk);
      const b = cards.reduce((a, n) => ({ w: Math.max(a.w, n.ax + MAP_NW), h: Math.max(a.h, n.ay + MAP_NH) }), { w: 400, h: 200 });
      return { mode: 'tree' as const, cards, containers: [] as MapContainer[], edges, spine: null, bounds: b };
    }

    // groups engine
    const groups = bucketize(view);
    const containers: MapContainer[] = [];
    let cy = 0;
    const colX = MAP_SPINE_W + MAP_SPINE_GAP;
    groups.forEach(g => {
      const o = off('C:' + g.id);
      const open = openContainers.has(g.id);
      const cont: MapContainer = {
        id: g.id, title: g.title, icon: g.icon, count: g.keys.length, owner: dominantOwner(g.keys),
        keys: g.keys, open, cards: [], edges: [], x: 0, y: 0, w: 0, h: 0,
      };
      if (!open) {
        cont.x = colX + o.x; cont.y = cy + o.y; cont.w = MAP_COL_W; cont.h = MAP_COL_H;
        cy += MAP_COL_H + MAP_HEADER + MAP_CGAP;
      } else {
        const roots = buildTree(g.keys, view);
        let leafY = 0;
        const place = (n: MapNode, d: number): number => {
          n._x = d * (MAP_NW + MAP_HGAP);
          const kids = (n.kind === 'req' && openCards.has(n.id)) ? n.children : [];
          if (!kids.length) { n._y = leafY; leafY += MAP_NH + MAP_VGAP; return n._y + MAP_NH / 2; }
          const cs = kids.map(k => place(k, d + 1));
          n._y = (cs[0] + cs[cs.length - 1]) / 2 - MAP_NH / 2;
          return n._y + MAP_NH / 2;
        };
        roots.forEach(r => place(r, 0));
        let cw = 0, ch = 0;
        const collect = (n: MapNode) => {
          cw = Math.max(cw, n._x + MAP_NW); ch = Math.max(ch, n._y + MAP_NH);
          if (n.kind === 'req' && openCards.has(n.id)) n.children.forEach(collect);
        };
        roots.forEach(collect);
        cont.w = cw + MAP_PAD * 2; cont.h = ch + MAP_PAD * 2;
        cont.x = colX + o.x; cont.y = cy + o.y;
        const ox = cont.x + MAP_PAD, oy = cont.y + MAP_PAD;
        const walk = (n: MapNode) => {
          n.ax = ox + n._x; n.ay = oy + n._y; n.contId = g.id; cont.cards.push(n);
          if (n.kind === 'req' && openCards.has(n.id)) n.children.forEach(c => { walk(c); cont.edges.push(edgeBetween(n, c, tintOfNode(c))); });
        };
        roots.forEach(walk);
        cy += cont.h + MAP_HEADER + MAP_CGAP;
      }
      containers.push(cont);
    });
    const stackH = Math.max(cy - MAP_CGAP, MAP_SPINE_H);
    const so = off('SPINE');
    const spine = {
      x: 0 + so.x, y: (stackH - MAP_SPINE_H) / 2 + so.y, w: MAP_SPINE_W, h: MAP_SPINE_H,
      title: view.label, count: groups.reduce((s, g) => s + g.keys.length, 0),
    };
    const spineEdges: MapEdge[] = containers.map(c => ({
      x1: spine.x + spine.w, y1: spine.y + spine.h / 2, x2: c.x, y2: c.y + c.h / 2, col: view.tint,
    }));
    const cards: MapNode[] = [];
    containers.forEach(c => c.cards.forEach(n => cards.push(n)));
    const allEdges = spineEdges.concat(...containers.map(c => c.edges));
    const bx = Math.max(colX + MAP_COL_W, ...containers.map(c => c.x + c.w), spine.x + spine.w);
    const by = Math.max(stackH, spine.y + spine.h, ...containers.map(c => c.y + c.h));
    return { mode: 'groups' as const, spine, containers, cards, edges: allEdges, bounds: { w: bx, h: by } };
  }, [view, openContainers, openCards, offsets, bucketize, buildTree]);

  // ── drag containers / pan canvas ────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      if (d.type === 'cont') {
        const dx = (e.clientX - d.startX) / d.zoom, dy = (e.clientY - d.startY) / d.zoom;
        if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 4) d.moved = true;
        setOffsets(o => ({ ...o, [d.id]: { x: d.ox + dx, y: d.oy + dy } }));
      } else {
        d.moved = true;
        setPan({ x: d.px + (e.clientX - d.startX), y: d.py + (e.clientY - d.startY) });
      }
    };
    const onUp = () => {
      const d = dragRef.current; if (!d) return;
      if (d.type === 'cont') {
        setDragC(null);
        setOffsets(o => { localStorage.setItem(posKey(viewId), JSON.stringify(o)); return o; });
      }
      dragRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [viewId]);

  // Wheel zoom toward cursor
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      setZoom(z => {
        const nz = Math.min(2, Math.max(0.25, z * (e.deltaY < 0 ? 1.12 : 0.89)));
        setPan(p => ({ x: cx - ((cx - p.x) / z) * nz, y: cy - ((cy - p.y) / z) * nz }));
        return nz;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const startContDrag = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const o = offsets['C:' + id] ?? { x: 0, y: 0 };
    dragRef.current = { type: 'cont', id: 'C:' + id, startX: e.clientX, startY: e.clientY, ox: o.x, oy: o.y, zoom, moved: false };
    setDragC(id);
  };
  const startSpineDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const o = offsets['SPINE'] ?? { x: 0, y: 0 };
    dragRef.current = { type: 'cont', id: 'SPINE', startX: e.clientX, startY: e.clientY, ox: o.x, oy: o.y, zoom, moved: false };
  };
  const startPan = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { type: 'pan', startX: e.clientX, startY: e.clientY, px: pan.x, py: pan.y, moved: false };
  };

  const zoomBy = (f: number) => setZoom(z => {
    const nz = Math.min(2, Math.max(0.25, z * f));
    const el = containerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const cx = r.width / 2, cy = r.height / 2;
      setPan(p => ({ x: cx - ((cx - p.x) / z) * nz, y: cy - ((cy - p.y) / z) * nz }));
    }
    return nz;
  });

  const fit = useCallback(() => {
    const el = containerRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const nz = Math.min(1.1, Math.max(0.25, Math.min((r.width - 90) / L.bounds.w, (r.height - 90) / L.bounds.h)));
    setZoom(nz);
    setPan({ x: (r.width - L.bounds.w * nz) / 2, y: (r.height - L.bounds.h * nz) / 2 });
  }, [L.bounds]);

  const resetLayout = () => { setOffsets({}); localStorage.removeItem(posKey(viewId)); };
  const toggleFullscreen = () => setFullscreen(f => !f);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(fit, 60);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  useEffect(() => {
    if (didFit.current) return;
    const t = setTimeout(() => { fit(); didFit.current = true; }, 60);
    return () => clearTimeout(t);
  }, [viewId, L.bounds.w, L.bounds.h, fit]);

  const toggleContainer = (id: string) => setOpenContainers(s => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const toggleCard = (id: string) => setOpenCards(s => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  const ctrlBtn: React.CSSProperties = {
    width: 30, height: 30, borderRadius: 7,
    background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'hsl(var(--muted-foreground))', padding: 0,
  };

  const ReqCard = (n: MapNode) => {
    const r = n.r, st = REQ_STATUS[r.status];
    const isH = hovered === n.id, obsolete = r.status === 'obsolete';
    const soft = softTint(st.tint, 0.5);
    const hasKids = n.children.length > 0, isOpen = openCards.has(n.id);
    return (
      <div key={n.id}
        onMouseDown={e => e.stopPropagation()}
        onClick={() => onOpen(r.key)}
        onMouseEnter={() => setHovered(n.id)}
        onMouseLeave={() => setHovered(null)}
        style={{
          position: 'absolute', left: n.ax, top: n.ay, width: MAP_NW, minHeight: MAP_NH,
          background: 'hsl(var(--card))', border: `1px solid ${isH ? soft : 'hsl(var(--border))'}`,
          borderLeft: `3px solid ${st.tint}`, borderRadius: 10,
          boxShadow: isH ? '0 6px 16px rgba(20,24,31,0.12)' : '0 1px 3px rgba(20,24,31,0.07)',
          cursor: 'pointer', zIndex: isH ? 50 : 12, transition: 'box-shadow .12s, border-color .12s',
          display: 'flex', flexDirection: 'column',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 11px 0' }}>
          <TypePill type={r.type} />
          <ReqKeyTag reqKey={r.key} />
        </div>
        <div style={{ padding: '5px 11px 0', flex: 1 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 600, color: obsolete ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
            lineHeight: 1.28, textDecoration: obsolete ? 'line-through' : 'none',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{r.title}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '7px 11px 9px' }}>
          <StatusBadge status={r.status} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {(r.coverage.orphan || r.coverage.untested || r.coverage.unimplemented) && <AlertTriangle size={13} color="#D97706" />}
            <VStatusBadge vstatus={r.vstatus} />
          </span>
        </div>
        {hasKids && (
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); toggleCard(n.id); }}
            title={isOpen ? 'Collapse' : 'Expand'}
            style={{
              position: 'absolute', left: MAP_NW - 12, top: MAP_NH / 2 - 12, width: 24, height: 24,
              borderRadius: '50%', background: 'hsl(var(--card))', border: `1px solid ${soft}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: st.tint, zIndex: 30, padding: 0,
            }}>
            {isOpen ? <ChevronLeft size={13} color={st.tint} /> : <ChevronRight size={13} color={st.tint} />}
          </button>
        )}
      </div>
    );
  };

  const TestCard = (n: MapNode) => {
    const r = n.r, tint = '#16A34A', isH = hovered === n.id;
    return (
      <div key={n.id}
        onMouseDown={e => e.stopPropagation()}
        onClick={() => onOpen(r.key)}
        onMouseEnter={() => setHovered(n.id)}
        onMouseLeave={() => setHovered(null)}
        style={{
          position: 'absolute', left: n.ax, top: n.ay, width: MAP_NW, minHeight: MAP_NH,
          background: 'hsl(var(--card))', border: `1px solid ${isH ? softTint(tint, 0.5) : 'hsl(var(--border))'}`,
          borderLeft: `3px solid ${tint}`, borderRadius: 10,
          boxShadow: isH ? '0 6px 16px rgba(20,24,31,0.12)' : '0 1px 3px rgba(20,24,31,0.07)',
          cursor: 'pointer', zIndex: isH ? 50 : 12, transition: 'box-shadow .12s, border-color .12s',
          display: 'flex', flexDirection: 'column',
        }}>
        <div style={{ padding: '9px 11px 0' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 5,
            fontSize: 11, fontWeight: 600, background: softTint(tint, 0.10), color: tint, border: `1px solid ${softTint(tint, 0.22)}`,
          }}>
            <FlaskConical size={11} color={tint} /> Test Case
          </span>
        </div>
        <div style={{ padding: '5px 11px 0', flex: 1 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 600, color: 'hsl(var(--foreground))', lineHeight: 1.28,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{r.title} test</div>
        </div>
        <div style={{ padding: '7px 11px 9px' }}><VStatusBadge vstatus={r.vstatus} /></div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={startPan}
      style={{
        ...(fullscreen ? { position: 'fixed' as const, inset: 0, zIndex: 1000 } : { flex: 1, position: 'relative' as const }),
        overflow: 'hidden', background: 'hsl(var(--background))', cursor: 'grab',
        backgroundImage: `radial-gradient(hsl(var(--border)) 1px, transparent 1px)`,
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* View selector — top left */}
      <div style={{ position: 'absolute', top: 14, left: 16, zIndex: 210 }} onMouseDown={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 9, height: 36, padding: '0 12px',
              borderRadius: 8, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
              cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 1px 3px rgba(20,24,31,0.07)',
            }}>
              <ViewIcon size={15} color={view.tint} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{view.label}</span>
              <ChevronDown size={14} color="hsl(var(--muted-foreground))" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1.5">Views</div>
            {MAP_VIEWS.map(v => {
              const Ic = v.icon, on = v.id === viewId;
              return (
                <DropdownMenuItem key={v.id} onClick={() => setViewId(v.id)} className="flex items-center gap-2.5"
                  style={{ background: on ? softTint(v.tint, 0.09) : undefined }}>
                  <Ic size={15} color={v.tint} />
                  <span className="flex-1" style={{ color: on ? 'hsl(var(--foreground))' : undefined }}>{v.label}</span>
                  {on && <Check size={14} color={v.tint} />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Transformed canvas */}
      <div style={{ position: 'absolute', top: 0, left: 0, transformOrigin: '0 0', transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>

        {/* Edges */}
        <svg width={L.bounds.w + 60} height={L.bounds.h + 60}
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}>
          {L.edges.map((ed, i) => {
            const dx = Math.max(38, (ed.x2 - ed.x1) / 2);
            return (
              <path key={i} d={`M ${ed.x1} ${ed.y1} C ${ed.x1 + dx} ${ed.y1}, ${ed.x2 - dx} ${ed.y2}, ${ed.x2} ${ed.y2}`}
                fill="none" stroke={ed.col} strokeWidth={1.6} strokeOpacity={0.42}
                strokeDasharray={ed.dash ? '4 3' : undefined} />
            );
          })}
        </svg>

        {/* Spine root node (groups mode) */}
        {L.spine && (
          <div onMouseDown={startSpineDrag}
            style={{
              position: 'absolute', left: L.spine.x, top: L.spine.y, width: L.spine.w, minHeight: L.spine.h,
              background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderTop: `3px solid ${view.tint}`,
              borderRadius: 12, boxShadow: '0 2px 8px rgba(20,24,31,0.08)', padding: '14px 16px',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, cursor: 'grab', zIndex: 15,
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: softTint(view.tint, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ViewIcon size={16} color={view.tint} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'hsl(var(--foreground))', lineHeight: 1.2 }}>{L.spine.title}</span>
            </div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{L.spine.count} requirements · {L.containers.length} groups</div>
          </div>
        )}

        {/* Container shells (groups mode) */}
        {L.mode === 'groups' && L.containers.map(c => {
          const tint = view.tint, isDrag = dragC === c.id, soft = softTint(tint, 0.35);
          const Ic = c.icon;
          return (
            <React.Fragment key={c.id}>
              <div onMouseDown={e => startContDrag(e, c.id)}
                style={{ position: 'absolute', left: c.x, top: c.y - MAP_HEADER + 4, width: c.w, height: MAP_HEADER, display: 'flex', alignItems: 'center', gap: 8, cursor: 'grab', zIndex: 14 }}>
                <Ic size={15} color={tint} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{c.title}</span>
                <span style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))', fontVariantNumeric: 'tabular-nums' }}>{c.count}</span>
                <span style={{ flex: 1 }} />
                {c.owner && <OwnerAvatar ownerId={c.owner} size={22} />}
              </div>
              <div onMouseDown={e => startContDrag(e, c.id)}
                style={{
                  position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h, borderRadius: 14,
                  background: softTint(tint, 0.05), border: `1.5px solid ${isDrag ? soft : softTint(tint, 0.28)}`,
                  boxShadow: isDrag ? '0 14px 30px rgba(20,24,31,0.16)' : 'none', cursor: 'grab', zIndex: 8,
                  transition: 'background .1s, box-shadow .1s',
                  display: c.open ? 'block' : 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {!c.open && <span style={{ fontSize: 15, fontWeight: 600, color: tint }}>{c.count} item{c.count !== 1 ? 's' : ''}</span>}
                <button onMouseDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); toggleContainer(c.id); }}
                  title={c.open ? 'Collapse group' : 'Expand group'}
                  style={{
                    position: 'absolute', left: c.w / 2 - 13, bottom: -13, width: 26, height: 26, borderRadius: '50%',
                    background: 'hsl(var(--card))', border: `1px solid ${soft}`, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 16, padding: 0,
                  }}>
                  {c.open ? <ChevronUp size={14} color={tint} /> : <ChevronDown size={14} color={tint} />}
                </button>
              </div>
            </React.Fragment>
          );
        })}

        {/* Cards */}
        {L.cards.map(n => n.kind === 'test' ? TestCard(n) : ReqCard(n))}
      </div>

      {/* Floating controls — top right */}
      <div style={{ position: 'absolute', top: 14, right: 16, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 200 }} onMouseDown={e => e.stopPropagation()}>
        <button onClick={() => zoomBy(1.15)} title="Zoom in" style={ctrlBtn}><Plus size={15} /></button>
        <div style={{ textAlign: 'center', fontSize: 10.5, color: 'hsl(var(--muted-foreground))', fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(zoom * 100)}%
        </div>
        <button onClick={() => zoomBy(0.87)} title="Zoom out" style={ctrlBtn}><Minus size={15} /></button>
        <button onClick={toggleFullscreen} title={fullscreen ? 'Exit full screen' : 'Full screen'} style={ctrlBtn}>
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button onClick={resetLayout} title="Reset arrangement" style={ctrlBtn}><RefreshCw size={13} /></button>
      </div>

      {/* Minimap — bottom left */}
      <ReqMapMinimap L={L} pan={pan} zoom={zoom} tint={view.tint} containerRef={containerRef} setPan={setPan} />

      {/* Legend / hint — next to minimap */}
      <div style={{
        position: 'absolute', bottom: 14, left: 204, display: 'flex', alignItems: 'center', gap: 14,
        padding: '7px 12px', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, zIndex: 200,
      }}>
        {L.mode === 'groups'
          ? <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}><b style={{ color: view.tint }}>{view.label}</b> · click a group to expand · drag groups to arrange</span>
          : <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>Scroll to zoom · drag to pan · click a card to open</span>}
      </div>
    </div>
  );
}

// ── Minimap — bottom-left overview + viewport rect, click to recenter ──────────
function ReqMapMinimap({ L, pan, zoom, tint, containerRef, setPan }: {
  L: { bounds: { w: number; h: number }; spine: { x: number; y: number; w: number; h: number } | null; containers: MapContainer[]; cards: MapNode[] };
  pan: { x: number; y: number }; zoom: number; tint: string;
  containerRef: React.RefObject<HTMLDivElement>; setPan: (p: { x: number; y: number }) => void;
}) {
  const MW = 176, MH = 116, PADm = 8;
  const bw = Math.max(L.bounds.w, 100), bh = Math.max(L.bounds.h, 100);
  const s = Math.min((MW - PADm * 2) / bw, (MH - PADm * 2) / bh);
  const el = containerRef.current;
  const rect = el ? el.getBoundingClientRect() : { width: 800, height: 520 };
  const vx = -pan.x / zoom, vy = -pan.y / zoom, vw = rect.width / zoom, vh = rect.height / zoom;
  const map = (x: number, y: number) => ({ x: PADm + x * s, y: PADm + y * s });

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    const cxContent = (e.clientX - r.left - PADm) / s, cyContent = (e.clientY - r.top - PADm) / s;
    setPan({ x: rect.width / 2 - cxContent * zoom, y: rect.height / 2 - cyContent * zoom });
  };

  return (
    <div onMouseDown={e => e.stopPropagation()} onClick={onClick}
      style={{
        position: 'absolute', bottom: 14, left: 16, width: MW, height: MH,
        background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10,
        boxShadow: '0 4px 14px rgba(20,24,31,0.10)', overflow: 'hidden', cursor: 'pointer', zIndex: 200,
      }}>
      <svg width={MW} height={MH}>
        {L.spine && (() => {
          const p = map(L.spine!.x, L.spine!.y);
          return <rect x={p.x} y={p.y} width={L.spine!.w * s} height={L.spine!.h * s} rx={2} fill={softTint(tint, 0.35)} stroke={tint} strokeWidth={0.6} />;
        })()}
        {L.containers.length
          ? L.containers.map(c => {
              const p = map(c.x, c.y);
              return <rect key={c.id} x={p.x} y={p.y} width={Math.max(3, c.w * s)} height={Math.max(3, c.h * s)} rx={2} fill={softTint(tint, 0.18)} stroke={softTint(tint, 0.5)} strokeWidth={0.6} />;
            })
          : L.cards.map(n => {
              const p = map(n.ax, n.ay);
              return <rect key={n.id} x={p.x} y={p.y} width={Math.max(2, 234 * s)} height={Math.max(2, 92 * s)} rx={1} fill={softTint(tint, 0.22)} />;
            })}
        {(() => {
          const p = map(vx, vy);
          return <rect x={p.x} y={p.y} width={vw * s} height={vh * s} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.2} rx={2} />;
        })()}
      </svg>
    </div>
  );
}
