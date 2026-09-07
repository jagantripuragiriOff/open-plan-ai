// BOM types, API response types, adapters, and tree helpers

import { parseNumericCell } from '@/lib/numericCell';

export interface SupplierEntry {
  distributor: string;
  price: string;
  calcFromSubparts: boolean;
}

export type BOMStatus = 'approved' | 'pending' | 'rejected' | 'draft';
// Free text — not a closed union. Known presets (below) plus any custom
// category a user adds via the "Other" option when adding/importing parts.
export type BOMCategory = string;
export const KNOWN_BOM_CATEGORIES = [
  'assembly', 'power', 'control', 'connector', 'enclosure', 'hmi', 'safety',
] as const;
export const UOM_OPTIONS = ['EA', 'SET', 'LIC', 'KG', 'M', 'FT', 'PCS', 'LOT'] as const;

export interface BOMRevision {
  id: string;
  rev: string;
  date: string;       // ISO date string
  author: string;
  changes: string;    // change description
  status: BOMStatus;
  price: number;
  leadTime: number;   // days — mirrors backend leadTimeDays 1:1, no unit conversion
  quantity: number | null; // snapshot of the owning node's quantity at revision creation time
  ecoId: string | null;
  // Snapshots of the part's fields as they stood at revision creation time
  name: string | null;
  description: string | null;
  category: BOMCategory | null;
  manufacturer: string | null;
  distributor: string | null;
  mpn: string | null;
  suppliers: SupplierEntry[];
  customFields: CustomFieldEntry[];
}

export interface CustomFieldEntry {
  label: string;
  value: string;
}

export interface BOMNode {
  id: string;
  level: number;
  levelLabel?: string;  // hierarchical position, e.g. "1.0", "1.1", "1.1.1" — set via assignLevelLabels()
  pn: string;
  name: string;
  desc: string;
  qty: number;
  uom: string;
  designators: string;   // comma-separated reference designators, e.g. "C3, C4, C11" — mirrors backend bom_nodes.designators 1:1
  supplier: string;
  rev: string;
  status: BOMStatus;
  req: string[];       // display labels — resolved requirement key, or legacy free-typed text for old unmatched links
  reqIds: string[];    // real requirement UUIDs currently linked — the set to diff against on save
  cat: BOMCategory;
  manufacturer: string;
  distributor: string;
  price: number;
  leadTime: number;   // days — mirrors backend leadTimeDays 1:1, no unit conversion
  mpn: string;
  imageUrl: string | null;  // explicitly-set product photo — mirrors backend parts.imageUrl 1:1; never a Documents-tab fallback
  suppliers: SupplierEntry[];
  owner: string;
  ownerId?: string;
  createdByName: string;
  createdById?: string;
  customFields: CustomFieldEntry[];
  revHistory: BOMRevision[];
  available: number | null;  // sum of on-hand-allocated-quarantine across inventory locations; null = part not in inventory
  location: string | null;   // inventory stock location(s) for this part; null = part not in inventory
  children?: BOMNode[];
  _x?: number;
  _y?: number;
  _partId?: string;   // backend part UUID — stored on adapted nodes for mutation calls
  _reqLinks?: ApiReqLinkResponse[];  // raw requirement links (id + requirementId) — needed to remove a link by id
}

export type LeadTimeOp = 'any' | 'lt' | 'gt' | 'eq';
export type LeadTimeUnit = 'days' | 'weeks' | 'months';

export const EMPTY_FILTERS = {
  priceMin: '', priceMax: '',
  leadOp: 'any' as LeadTimeOp,
  leadValue: '',
  leadUnit: 'days' as LeadTimeUnit,
  units: [] as string[], suppliers: [] as string[],
  manufacturers: [] as string[], statuses: [] as BOMStatus[],
  categories: [] as string[],
  owners: [] as string[],
  bomType: 'all' as 'all' | 'top' | 'catalog',
  mpns: [] as string[],
};
export type BOMFilters = typeof EMPTY_FILTERS;

// Converts a lead-time filter value in weeks/months to days — BOMNode.leadTime is
// always stored in days, so comparisons need a common unit.
export function leadTimeValueToDays(value: number, unit: LeadTimeUnit): number {
  if (unit === 'weeks') return value * 7;
  if (unit === 'months') return value * 30;
  return value;
}

// ── Category metadata ─────────────────────────────────────────────
export const BOM_CAT_META: Record<BOMCategory, { tint: string; label: string; iconName: string }> = {
  power:     { tint: '#9333EA', label: 'Power Electronics',      iconName: 'Zap' },
  control:   { tint: '#6366F1', label: 'Control & Comms',        iconName: 'Cpu' },
  connector: { tint: '#16A34A', label: 'Charging Connectors',    iconName: 'Package' },
  enclosure: { tint: '#EA8C00', label: 'Enclosure & Mechanical', iconName: 'Box' },
  hmi:       { tint: '#0EA5E9', label: 'HMI & Interface',        iconName: 'Monitor' },
  safety:    { tint: '#DC2626', label: 'Safety & Protection',    iconName: 'Shield' },
  assembly:  { tint: '#2563EB', label: 'Top Assembly',           iconName: 'Layers' },
};

const CUSTOM_CATEGORY_TINT = '#64748B'; // neutral slate — categories outside the known presets

function humanizeCategory(cat: string): string {
  return cat
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ') || 'Uncategorized';
}

/**
 * Like BOM_CAT_META[cat], but falls back to a humanized label/neutral tint
 * for custom categories instead of mislabeling them as "Top Assembly".
 */
export function getCategoryMeta(cat: BOMCategory): { tint: string; label: string; iconName: string } {
  return BOM_CAT_META[cat] ?? { tint: CUSTOM_CATEGORY_TINT, label: humanizeCategory(cat), iconName: 'Tag' };
}

// Empty fallback — components that previously used BOM_NODES as a default now receive
// the live rootNodes prop; this empty array prevents import errors during the migration.
export const BOM_NODES: BOMNode[] = [];

// ── Raw API response types ────────────────────────────────────────

export interface ApiRevisionResponse {
  id: string;
  partId: string;
  rev: string;
  changes: string;
  author: string | null;
  status: BOMStatus;
  price: string | null;
  leadTimeDays: number | null;
  quantity: number | null;
  ecoId: string | null;
  name: string | null;
  description: string | null;
  category: string | null;
  manufacturer: string | null;
  distributor: string | null;
  mpn: string | null;
  suppliers: Array<{ distributor: string; price: number; calcFromSubparts: boolean }> | null;
  customFields: ApiCustomFieldEntry[] | null;
  createdAt: string;
}

export interface ApiCustomFieldEntry {
  label: string;
  value: string;
}

export interface ApiPartResponse {
  id: string;
  orgId: string;
  partNumber: string;
  name: string;
  description: string;
  category: BOMCategory;
  manufacturer: string | null;
  distributor: string | null;
  mpn: string | null;
  unit: string;
  notes: string | null;
  imageUrl: string | null;
  customFields: ApiCustomFieldEntry[] | null;
  latestRevision: ApiRevisionResponse | null;
  available: number | null;
  inventoryLocation: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiReqLinkResponse {
  id: string;
  nodeId: string;
  requirementId: string | null;
  requirement: { id: string; key: string; title: string; type: string } | null;
  // Free-typed label from before the real FK existed — set only on old,
  // unmatched rows that don't resolve to a real requirement.
  legacyLabel: string | null;
  // Why this part was selected to satisfy the requirement — optional.
  rationale: string | null;
  createdAt: string;
}

export interface ApiRequirementAllocation {
  linkId: string;
  requirementId: string;
  nodeId: string;
  partId: string;
  partNumber: string;
  partName: string;
  rationale: string | null;
  // The BOM node's approval status — 'implemented' coverage requires an
  // 'approved' allocation, not just any allocation regardless of review state.
  status: BOMStatus;
}

export interface ApiNodeResponse {
  id: string;
  treeId: string;
  partId: string;
  parentId: string | null;
  position: number;
  quantity: string;
  unit: string;
  designators: string | null;
  status: BOMStatus;
  notes: string | null;
  owner: { id: string; name: string } | null;
  creator: { id: string; name: string } | null;
  part: ApiPartResponse;
  requirements: ApiReqLinkResponse[];
  children?: ApiNodeResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiTreeResponse {
  id: string;
  projectId: string;
  orgId: string;
  roots: ApiNodeResponse[];
  totalNodes: number;
  pendingCount: number;
  approvedCount: number;
}

export interface ApiApprovalResponse {
  id: string;
  nodeId: string;
  partId: string;
  action: 'approved' | 'rejected';
  performedBy: { id: string; name: string };
  reason: string | null;
  comment: string | null;
  createdAt: string;
}

export interface BOMApproval {
  id: string;
  action: 'approved' | 'rejected';
  performedByName: string;
  reason: string | null;
  comment: string | null;
  date: string; // ISO date string
}

export type BOMApprovalRequestScope = 'node' | 'subtree';
export type BOMApprovalRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ApiApprovalRequestResponse {
  id: string;
  treeId: string;
  rootNodeId: string;
  scope: BOMApprovalRequestScope;
  nodeIds: string[];
  requestedBy: { id: string; name: string };
  approvers: Array<{ id: string; name: string }>;
  approverDecisions: Array<{ id: string; name: string; decision: 'approved' | 'rejected' | 'pending' }>;
  status: BOMApprovalRequestStatus;
  decidedBy: { id: string; name: string } | null;
  decidedAt: string | null;
  reason: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BOMApprovalRequest {
  id: string;
  rootNodeId: string;
  scope: BOMApprovalRequestScope;
  nodeIds: string[];
  requestedByName: string;
  requestedById: string;
  approvers: Array<{ id: string; name: string }>;
  approverDecisions: Array<{ id: string; name: string; decision: 'approved' | 'rejected' | 'pending' }>;
  status: BOMApprovalRequestStatus;
  decidedByName: string | null;
  decidedAt: string | null;
  reason: string | null;
  comment: string | null;
  createdAt: string;
}

export function fromApiApprovalRequest(r: ApiApprovalRequestResponse): BOMApprovalRequest {
  return {
    id:                r.id,
    rootNodeId:        r.rootNodeId,
    scope:             r.scope,
    nodeIds:           r.nodeIds,
    requestedByName:   r.requestedBy.name,
    requestedById:     r.requestedBy.id,
    approvers:         r.approvers,
    approverDecisions: r.approverDecisions,
    status:            r.status,
    decidedByName:     r.decidedBy?.name ?? null,
    decidedAt:         r.decidedAt,
    reason:            r.reason,
    comment:           r.comment,
    createdAt:         r.createdAt,
  };
}

export interface ApiSummaryResponse {
  treeId: string | null;
  projectId: string;
  totalNodes: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalCost: number;
  byCategory: Array<{ category: string; count: number; totalCost: number }>;
}

// ── Adapters: API response → BOMNode / BOMRevision ────────────────

export function parseCustomFields(raw: unknown): CustomFieldEntry[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter(
      (item): item is CustomFieldEntry =>
        Boolean(item) && typeof item === 'object' && typeof (item as { label?: string }).label === 'string' && typeof (item as { value?: string }).value === 'string'
    );
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parseCustomFields(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

export function fromApiNode(node: ApiNodeResponse, depth = 0): BOMNode {
  const rev = node.part.latestRevision;
  return {
    id:           node.id,
    level:        depth,
    pn:           node.part.partNumber,
    name:         node.part.name,
    desc:         node.part.description,
    qty:          parseFloat(node.quantity),
    uom:          node.unit,
    designators:  node.designators ?? '',
    supplier:     node.part.manufacturer ?? '',
    rev:          rev?.rev ?? 'A',
    status:       node.status,
    req:          node.requirements.map(r => r.requirement?.key ?? r.legacyLabel ?? '(unlinked)'),
    reqIds:       node.requirements.filter(r => r.requirementId).map(r => r.requirementId!),
    _reqLinks:    node.requirements,
    cat:          node.part.category,
    manufacturer: node.part.manufacturer ?? '',
    distributor:  node.part.distributor ?? '',
    price:        parseFloat(rev?.price ?? '0'),
    leadTime:     rev?.leadTimeDays ?? 0,
    mpn:          node.part.mpn ?? '',
    imageUrl:     node.part.imageUrl ?? null,
    suppliers:    rev?.suppliers?.map(s => ({ ...s, price: String(s.price) })) ?? [],
    owner:        node.owner?.name ?? '',
    ownerId:      node.owner?.id,
    createdByName: node.creator?.name ?? '',
    createdById:   node.creator?.id,
    customFields: parseCustomFields(node.part.customFields),
    revHistory:   [],  // loaded on demand via usePartRevisions
    available:    node.part.available,
    location:     node.part.inventoryLocation ?? null,
    children:     node.children?.map(c => fromApiNode(c, depth + 1)),
    _partId:      node.part.id,
  };
}

/**
 * Post-pass: if a node has children, its unit price = sum(child.qty × child.price).
 * Leaf nodes keep their own revision price. Applied bottom-up (children first).
 */
export function applyPriceRollup(node: BOMNode): BOMNode {
  if (!node.children?.length) return node;
  const rolledChildren = node.children.map(applyPriceRollup);
  const childrenPrice = rolledChildren.reduce((sum, c) => sum + c.qty * c.price, 0);
  return { ...node, price: node.price + childrenPrice, children: rolledChildren };
}

export function fromApiRevision(r: ApiRevisionResponse): BOMRevision {
  return {
    id:        r.id,
    rev:       r.rev,
    date:      r.createdAt.split('T')[0],
    author:    r.author ?? 'Unknown',
    changes:   r.changes,
    status:    r.status,
    price:     parseFloat(r.price ?? '0'),
    leadTime:  r.leadTimeDays ?? 0,
    quantity:  r.quantity ?? null,
    ecoId:     r.ecoId ?? null,
    name:      r.name ?? null,
    description: r.description ?? null,
    category:  r.category ?? null,
    manufacturer: r.manufacturer ?? null,
    distributor: r.distributor ?? null,
    mpn:       r.mpn ?? null,
    suppliers: r.suppliers?.map(s => ({ ...s, price: String(s.price) })) ?? [],
    customFields: parseCustomFields(r.customFields),
  };
}

export function formatRevisionDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    if (y && m && d && y.length === 4) {
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
  }
  return dateStr;
}

export function resolveRevisionAuthor(revAuthor?: string | null, fallbackAuthor?: string | null): string {
  if (revAuthor && revAuthor !== 'Unknown' && revAuthor.trim() !== '') {
    return revAuthor;
  }
  if (fallbackAuthor && fallbackAuthor !== 'Unknown' && fallbackAuthor.trim() !== '') {
    return fallbackAuthor;
  }
  return 'Unknown';
}

// ── Lead time display ──────────────────────────────────────────────
// leadTime is always stored/passed around in days; this picks whichever
// unit (days/weeks/months) renders it most cleanly for display.
export function formatLeadTime(days: number): string {
  if (!days || days <= 0) return '—';
  if (days % 30 === 0 && days >= 30) return `${days / 30} mo`;
  if (days % 7 === 0 && days >= 7) return `${days / 7} wk`;
  return `${days} d`;
}

export function fromApiApproval(a: ApiApprovalResponse): BOMApproval {
  return {
    id:              a.id,
    action:          a.action,
    performedByName: a.performedBy.name,
    reason:          a.reason,
    comment:         a.comment,
    date:            a.createdAt,
  };
}

// ── Tree helpers ──────────────────────────────────────────────────

export const bomFlatAll = (nodes: BOMNode[]): BOMNode[] => {
  const r: BOMNode[] = [];
  const w = (list: BOMNode[]) => { for (const n of list) { r.push(n); if (n.children) w(n.children); } };
  w(nodes);
  return r;
};

export const bomFlatten = (nodes: BOMNode[], expanded: Record<string, boolean>): BOMNode[] => {
  const r: BOMNode[] = [];
  const w = (list: BOMNode[]) => { for (const n of list) { r.push(n); if (n.children && expanded[n.id]) w(n.children); } };
  w(nodes);
  return r;
};

export const bomCountAll = (nodes: BOMNode[]) => bomFlatAll(nodes).length;

export function describeDeleteImpact(node: BOMNode): { title: string; description: string } {
  const descendantCount = bomCountAll(node.children ?? []);
  if (descendantCount === 0) {
    return {
      title: 'Delete Part',
      description: `Delete ${node.pn} — ${node.name}? This cannot be undone.`,
    };
  }
  return {
    title: 'Delete Part & Sub-components',
    description: `Delete ${node.pn} — ${node.name} and its ${descendantCount} sub-component${descendantCount === 1 ? '' : 's'}? All nested parts, their revisions, and requirement links will be permanently removed. This cannot be undone.`,
  };
}

export const bomFind = (id: string, nodes: BOMNode[] = BOM_NODES): BOMNode | null => {
  for (const n of nodes) {
    if (n.id === id || n.pn === id || n._partId === id || (id && n.pn?.toLowerCase() === id.toLowerCase())) return n;
    if (n.children) { const f = bomFind(id, n.children); if (f) return f; }
  }
  return null;
};

export const bomPath = (id: string, nodes: BOMNode[] = BOM_NODES, trail: BOMNode[] = []): BOMNode[] | null => {
  for (const n of nodes) {
    const t = [...trail, n];
    if (n.id === id || n.pn === id || n._partId === id || (id && n.pn?.toLowerCase() === id.toLowerCase())) return t;
    if (n.children) { const f = bomPath(id, n.children, t); if (f) return f; }
  }
  return null;
};

export const bomFilterTree = (nodes: BOMNode[], pred: (n: BOMNode) => boolean): { matched: Set<string>; include: Set<string> } => {
  const matched = new Set<string>();
  const include = new Set<string>();
  const visit = (n: BOMNode, anc: BOMNode[]): boolean => {
    let match = pred(n), childMatch = false;
    if (n.children) for (const c of n.children) childMatch = visit(c, [...anc, n]) || childMatch;
    if (match) matched.add(n.id);
    if (match || childMatch) { include.add(n.id); anc.forEach(a => include.add(a.id)); return true; }
    return false;
  };
  nodes.forEach(n => visit(n, []));
  return { matched, include };
};

// `include` covers ancestors kept only so the walk can reach a matching descendant;
// only nodes in `matched` are actually pushed to the result so e.g. a "Rejected" filter
// doesn't surface a "Pending" parent row just because one of its children is rejected.
export const bomFlattenInclude = (nodes: BOMNode[], matched: Set<string>, include: Set<string>): BOMNode[] => {
  const r: BOMNode[] = [];
  const w = (list: BOMNode[]) => {
    for (const n of list) {
      if (!include.has(n.id)) continue;
      if (matched.has(n.id)) r.push(n);
      if (n.children) w(n.children);
    }
  };
  w(nodes);
  return r;
};

export const bomTypeOf = (n: BOMNode): 'top' | 'subassembly' | 'catalog' =>
  n.level === 0 ? 'top' : (n.children && n.children.length ? 'subassembly' : 'catalog');

// Assigns hierarchical position labels in place, e.g. root "1.0", its children "1.1"/"1.2",
// their children "1.1.1"/"1.1.2" — matches the dot-notation BOM level numbering convention.
export function assignLevelLabels(nodes: BOMNode[], prefix: number[] = []): void {
  nodes.forEach((node, i) => {
    const path = [...prefix, i + 1];
    node.levelLabel = path.length === 1 ? `${path[0]}.0` : path.join('.');
    if (node.children) assignLevelLabels(node.children, path);
  });
}

// ── Sub-component bulk import (Excel/CSV) ─────────────────────────


interface ImportColumnDef {
  label: string;
  required: boolean;
  aliases: string[]; // lowercase header strings that map to this column
}

export const SUBCOMPONENT_IMPORT_COLUMNS: ImportColumnDef[] = [
  { label: 'Level',              required: false, aliases: ['level', 'bom level', 'lvl', 'depth', 'indent', 'indentation'] },
  { label: 'Part Number',        required: true,  aliases: ['part number', 'partnumber', 'pn'] },
  { label: 'Part Name',          required: true,  aliases: ['part name', 'name'] },
  { label: 'Description',        required: true,  aliases: ['description', 'desc'] },
  { label: 'Category',           required: true,  aliases: ['category'] },
  { label: 'Manufacturer',       required: true,  aliases: ['manufacturer'] },
  { label: 'MPN',                required: true,  aliases: ['mpn', 'manufacturer pn', 'manufacturer part number'] },
  { label: 'Supplier',           required: true,  aliases: ['supplier', 'distributor'] },
  { label: 'Unit Price',         required: true,  aliases: ['unit price', 'price'] },
  { label: 'Lead Time (weeks)',  required: true,  aliases: ['lead time (weeks)', 'lead time', 'leadtime'] },
  { label: 'Quantity',           required: true,  aliases: ['quantity', 'qty'] },
  { label: 'UOM',                required: true,  aliases: ['uom', 'unit'] },
  { label: 'Reference Designator', required: false, aliases: ['reference designator', 'designator', 'designators', 'refdes', 'ref des', 'ref designator'] },
];

export interface ParsedImportRow {
  rowNumber: number; // 1-based spreadsheet row, header row counts as row 1
  level: number;    // tree depth: 0 = top-level, 1+ = nested; defaults to 0 if column absent
  partNumber: string;
  name: string;
  description: string;
  category: BOMCategory | '';
  status: BOMStatus;
  manufacturer: string;
  mpn: string;
  supplier: string;
  unitPrice?: number;
  leadTimeWeeks?: number;
  quantity: number;
  uom: string;
  designators: string;   // comma-separated reference designators, e.g. "C3, C4" — empty if the sheet has no such column
  existingPart?: ApiPartResponse;
  errors: string[];
}

const normalizeKey = (k: string) => k.trim().toLowerCase();

function pickField(row: Record<string, unknown>, aliases: string[]): string {
  for (const [rawKey, value] of Object.entries(row)) {
    if (aliases.includes(normalizeKey(rawKey))) {
      return value == null ? '' : String(value).trim();
    }
  }
  return '';
}

const colAliases = (label: string) =>
  SUBCOMPONENT_IMPORT_COLUMNS.find(c => c.label === label)!.aliases;

/**
 * Checks whether the alias-based fast path can confidently match every
 * required column. If not, the caller should fall back to the AI-assisted
 * backend mapping endpoint instead of running parseSubcomponentImportRows
 * directly against unmatched headers.
 */
export function checkColumnMappingConfidence(
  rawHeaders: string[],
): { confident: boolean; unmatchedRequired: string[] } {
  const normalizedHeaders = rawHeaders.map(normalizeKey);
  const unmatchedRequired = SUBCOMPONENT_IMPORT_COLUMNS
    .filter(c => c.required)
    .filter(c => !c.aliases.some(alias => normalizedHeaders.includes(alias)))
    .map(c => c.label);

  return { confident: unmatchedRequired.length === 0, unmatchedRequired };
}

/**
 * Renames raw header keys in each row to their mapped canonical column
 * label (e.g. "Item No." -> "Part Number"), so the result can be fed into
 * parseSubcomponentImportRows() unchanged via its existing alias matching.
 * Headers with no mapping entry are dropped.
 */
export function applyColumnMapping(
  rawRows: Record<string, unknown>[],
  mapping: Record<string, string>,
): Record<string, unknown>[] {
  return rawRows.map(row => {
    const mapped: Record<string, unknown> = {};
    for (const [rawKey, value] of Object.entries(row)) {
      const targetLabel = mapping[rawKey];
      if (targetLabel) mapped[targetLabel] = value;
    }
    return mapped;
  });
}

/**
 * Parses lead time strings to weeks.
 * Accepts plain numbers ("4"), or "N unit" strings ("7 days", "2 weeks", "3 months").
 * Returns null if the input cannot be parsed.
 */
function parseLeadTimeToWeeks(raw: string): number | null {
  const trimmed = raw.trim();
  const plain = Number(trimmed);
  if (!Number.isNaN(plain)) return plain;

  const match = trimmed.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(day|days?|d|week|weeks?|wk|wks?|w|month|months?|mo|mos?|m)$/);
  if (!match) return null;

  const amount = parseFloat(match[1]);
  const unit = match[2];
  if (unit.startsWith('d')) return amount / 7;
  if (unit.startsWith('w')) return amount;
  if (unit.startsWith('mo') || unit === 'm') return amount * 4.33;
  return null;
}

export function parseSubcomponentImportRows(
  rows: Record<string, unknown>[],
  existingParts: ApiPartResponse[],
): ParsedImportRow[] {
  // Sheets get imported under a parent that already exists in the BOM (the dialog's
  // target part), so users naturally treat that parent as an implicit "level 0" and
  // number every direct sub-component 1, 2, 3… instead of restarting at 0. That's
  // still a valid, flat/nested hierarchy — just uniformly shifted — so normalize by
  // the lowest well-formed level actually present instead of requiring literal 0.
  const parsedLevels = rows.map((row) => {
    const levelRaw = pickField(row, colAliases('Level'));
    if (levelRaw === '') return { valid: true, level: 0 };
    const n = parseInt(levelRaw, 10);
    const valid = Number.isInteger(n) && n >= 0 && String(n) === levelRaw.trim();
    return { valid, level: valid ? n : 0 };
  });
  const validLevels = parsedLevels.filter(r => r.valid).map(r => r.level);
  const levelOffset = validLevels.length > 0 ? Math.min(...validLevels) : 0;

  return rows.map((row, i) => {
    const errors: string[] = [];

    const levelRaw     = pickField(row, colAliases('Level'));
    let level = 0;
    if (levelRaw !== '') {
      const n = parseInt(levelRaw, 10);
      if (!Number.isInteger(n) || n < 0 || String(n) !== levelRaw.trim()) {
        errors.push('Level must be a non-negative integer');
      } else {
        level = n - levelOffset;
      }
    }

    const partNumber   = pickField(row, colAliases('Part Number'));
    const name         = pickField(row, colAliases('Part Name'));
    const description  = pickField(row, colAliases('Description'));
    const categoryRaw  = pickField(row, colAliases('Category')).toLowerCase();
    // Status is intentionally ignored during import — all imported parts start as 'pending'
    // and must be approved through the normal approval workflow.
    const manufacturer = pickField(row, colAliases('Manufacturer'));
    const mpn          = pickField(row, colAliases('MPN'));
    const supplier      = pickField(row, colAliases('Supplier'));
    const unitPriceRaw  = pickField(row, colAliases('Unit Price'));
    const leadTimeRaw   = pickField(row, colAliases('Lead Time (weeks)'));
    const quantityRaw   = pickField(row, colAliases('Quantity'));
    const uomRaw         = pickField(row, colAliases('UOM'));
    const designators    = pickField(row, colAliases('Reference Designator'));

    if (!partNumber) errors.push('Missing Part Number');
    if (!name) errors.push('Missing Part Name');
    if (!description) errors.push('Missing Description');

    // Category accepts any non-empty value — a known preset (KNOWN_BOM_CATEGORIES)
    // or a custom category typed/imported by the user.
    let category: BOMCategory | '' = '';
    if (!categoryRaw) {
      errors.push('Missing Category');
    } else {
      category = categoryRaw;
    }

    const status: BOMStatus = 'pending';

    if (!manufacturer) errors.push('Missing Manufacturer');
    if (!mpn) errors.push('Missing MPN');
    if (!supplier) errors.push('Missing Supplier');

    let unitPrice: number | undefined;
    if (!unitPriceRaw) {
      errors.push('Missing Unit Price');
    } else {
      // parseNumericCell, not Number(): sheets export prices as formatted text
      // ("₹314.65", "1,234.56"), which Number() reads as NaN and this used to
      // reject outright.
      const n = parseNumericCell(unitPriceRaw);
      if (n === null) errors.push('Unit Price must be a number');
      else unitPrice = n;
    }

    let leadTimeWeeks: number | undefined;
    if (!leadTimeRaw) {
      errors.push('Missing Lead Time');
    } else {
      const parsed = parseLeadTimeToWeeks(leadTimeRaw);
      if (parsed === null) errors.push('Lead Time must be a number');
      else leadTimeWeeks = parsed;
    }

    let quantity = 1;
    if (!quantityRaw) {
      errors.push('Missing Quantity');
    } else {
      const n = parseNumericCell(quantityRaw);
      if (n === null || n <= 0) errors.push('Quantity must be a positive number');
      else quantity = n;
    }

    if (!uomRaw) errors.push('Missing UOM');
    const uom = uomRaw || 'EA';

    const existingPart = partNumber
      ? existingParts.find(p => p.partNumber.trim().toLowerCase() === partNumber.toLowerCase())
      : undefined;

    return {
      rowNumber: i + 2,
      level,
      partNumber, name, description, category, status,
      manufacturer, mpn, supplier, unitPrice, leadTimeWeeks, quantity, uom,
      designators,
      existingPart,
      errors,
    };
  });
}

/**
 * Validates level-chain integrity across all parsed rows.
 * Returns a map of rowNumber → error string for any row whose level skips ahead
 * (e.g. level 2 with no preceding level-1 row). Only rows with no other errors
 * are checked — invalid rows are excluded from the import anyway.
 */
export function validateLevels(rows: ParsedImportRow[]): Map<number, string> {
  const issues = new Map<number, string>();
  // Track the highest level seen so far (starts at -1 so level 0 is always valid)
  let maxReachedLevel = -1;
  for (const row of rows) {
    if (row.errors.length > 0) continue; // skip already-invalid rows
    if (row.level > maxReachedLevel + 1) {
      issues.set(row.rowNumber, `Level ${row.level} skips ahead — a level ${row.level - 1} row must appear first`);
    } else {
      maxReachedLevel = Math.max(maxReachedLevel, row.level);
    }
  }
  return issues;
}

/**
 * Flags rows that would create a duplicate BOM node: a part number that's already
 * present under the same target parent, either as one of that parent's *existing*
 * children (re-importing a sheet after it was imported once already) or repeated
 * more than once within the sheet itself under the same resolved parent. Reusing
 * the same `bom_parts` catalog row (row.existingPart) is fine and intentional —
 * this only guards against attaching it as a second sibling node.
 * Only rows that already passed validateLevels are checked, since a level-chain
 * error means the row's resolved parent can't be trusted.
 */
export function validateDuplicateParts(
  rows: ParsedImportRow[],
  levelIssues: Map<number, string>,
  // Nodes that already sit where this import's level-0 rows would land — the
  // target parent's existing children, or the BOM's existing top-level nodes
  // when importing with no parent (see BOMImportSubcomponentsDialog).
  existingSiblings: BOMNode[],
): Map<number, string> {
  const issues = new Map<number, string>();
  const rootKey = '__root__';
  // parentKeyStack[N] = the key of the parent that level-N rows attach to.
  const parentKeyStack: string[] = [rootKey];
  const seenByParent = new Map<string, Set<string>>([
    [rootKey, new Set(existingSiblings.map(c => c.pn.trim().toLowerCase()))],
  ]);

  for (const row of rows) {
    if (row.errors.length > 0 || levelIssues.has(row.rowNumber)) continue;
    const parentKey = parentKeyStack[row.level] ?? rootKey;
    const pnKey = row.partNumber.trim().toLowerCase();
    const seen = seenByParent.get(parentKey) ?? new Set<string>();
    if (pnKey && seen.has(pnKey)) {
      issues.set(row.rowNumber, `${row.partNumber} already exists under this parent`);
    } else if (pnKey) {
      seen.add(pnKey);
      seenByParent.set(parentKey, seen);
    }
    // This row becomes the parent for deeper rows — keyed by its own row number
    // since it has no real id yet.
    parentKeyStack[row.level + 1] = `row:${row.rowNumber}`;
    parentKeyStack.length = row.level + 2;
  }
  return issues;
}
