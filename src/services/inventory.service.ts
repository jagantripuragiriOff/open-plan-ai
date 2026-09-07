import { apiClient } from '@/services/api/client';
import { ENDPOINTS } from '@/services/api/endpoints';
import { resolveFileUrl } from '@/utils/fileUrl';
import { isQuarantineLocation } from '@/features/projects/components/inventoryData';
import type { StockRecord, OrderRecord, StockTransaction, BuildDef, BuildBomLine, BuildAssignee } from '@/features/projects/components/inventoryData';

// ─── API response shapes (match backend inventory.types.ts responses) ─────────

export interface ApiStockRecord {
  id: string;
  partId: string;
  pn: string;
  name: string;
  mpn: string | null;
  manufacturer: string | null;
  cat: string;
  imageUrl: string | null;
  onHand: number;
  allocated: number;
  onOrder: number;
  location: string;
  locationNodeId: string | null;
  leadTimeDays: number;
  lotNumber: string | null;
  serialNumber: string | null;
  quarantineQty: number;
  createdAt: string;
  transactionId?: string;
}

export interface ApiOrderRecord {
  id: string;
  partId: string;
  pn: string;
  quantity: number;
  remainingQty: number;
  expectedDate: string;
  leadTimeDays: number | null;
  supplierRef: string | null;
  unitCost: number | null;
  location: string;
  locationNodeId: string | null;
  note: string | null;
  description: string | null;
  purpose: string | null;
  lotNumber: string | null;
  serialNumber: string | null;
  status: 'planned' | 'open' | 'partially_received' | 'received' | 'cancelled';
  createdAt: string;
  createdBy: string;
}

export interface ApiStockTransaction {
  id: string;
  partId: string;
  type: 'receive' | 'adjust' | 'allocate' | 'deallocate' | 'issue' | 'transfer';
  direction: 'add' | 'remove' | null;
  qty: number;
  location: string;
  locationNodeId: string | null;
  reference: string | null;
  reasonCode: string | null;
  note: string | null;
  description: string | null;
  quarantine: boolean;
  buildId: string | null;
  lotNumber: string | null;
  serialNumber: string | null;
  leadTimeDays: number | null;
  createdAt: string;
  createdBy: string;
}

export interface ApiBuildDef {
  id: string;
  projectId: string;
  name: string;
  type: string;
  units: number;
  bomRev: string;
  scrapPct: number;
  milestone: string | null;
  targetDate: string | null;
  status: 'planned' | 'allocated' | 'kitted';
  assignee: BuildAssignee | null;
}

export interface ApiBuildBomLine {
  partId: string;
  pn: string;
  name: string;
  cat: string;
  imageUrl: string | null;
  qtyPerUnit: number;
  uom: string;
  onHand: number;
  allocated: number;
  onOrder: number;
  quarantineQty: number;
  leadTimeDays: number;
  required: number;
  shortage: number;
}

export interface ApiAllocateBuildLineResult {
  partId: string;
  pn: string;
  required: number;
  allocated: number;
  shortage: number;
}

export interface ApiAllocateBuildResponse {
  build: ApiBuildDef;
  lines: ApiAllocateBuildLineResult[];
  fullyAllocated: boolean;
}

export interface ApiShortageOrderLineResult {
  partId: string;
  pn: string;
  quantityOrdered: number;
  orderId: string;
  action: 'created' | 'updated';
}

export interface ApiGenerateShortageOrdersResponse {
  build: ApiBuildDef;
  lines: ApiShortageOrderLineResult[];
}

// ─── Adapters ───────────────────────────────────────────────────────────────────

export function fromApiStock(r: ApiStockRecord): StockRecord {
  // Stock parked in a location literally named "Quarantine" is held wholesale — fold its
  // free-to-use on-hand into quarantineQty so every downstream figure (Available, the
  // Quarantine stat/count, the quarantine filter, the part-detail facts strip) matches what
  // the location implies. Anything already allocated stays allocated rather than going
  // negative-available.
  const byLocation = isQuarantineLocation(r.location);
  const quarantineQty = byLocation
    ? Math.max(r.quarantineQty || 0, r.onHand - r.allocated)
    : r.quarantineQty || undefined;
  return {
    id: r.id,
    partId: r.partId,
    pn: r.pn,
    name: r.name,
    mpn: r.mpn ?? undefined,
    manufacturer: r.manufacturer ?? undefined,
    cat: r.cat,
    onHand: r.onHand,
    allocated: r.allocated,
    onOrder: r.onOrder,
    location: r.location,
    locationNodeId: r.locationNodeId ?? undefined,
    leadTimeDays: r.leadTimeDays,
    lotNumber: r.lotNumber ?? undefined,
    serialNumber: r.serialNumber ?? undefined,
    quarantineQty: quarantineQty || undefined,
    quarantineByLocation: byLocation || undefined,
    imageUrl: resolveFileUrl(r.imageUrl) ?? undefined,
    createdAt: r.createdAt,
  };
}

export function fromApiOrder(r: ApiOrderRecord): OrderRecord {
  return {
    id: r.id,
    partId: r.partId,
    pn: r.pn,
    quantity: r.quantity,
    remainingQty: r.remainingQty,
    expectedDate: r.expectedDate,
    leadTimeDays: r.leadTimeDays ?? undefined,
    supplierRef: r.supplierRef ?? undefined,
    unitCost: r.unitCost ?? undefined,
    location: r.location,
    locationNodeId: r.locationNodeId ?? undefined,
    note: r.note ?? undefined,
    description: r.description ?? undefined,
    purpose: r.purpose ?? undefined,
    lotNumber: r.lotNumber ?? undefined,
    serialNumber: r.serialNumber ?? undefined,
    status: r.status,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
  };
}

export function fromApiTransaction(r: ApiStockTransaction): StockTransaction {
  return {
    id: r.id,
    partId: r.partId,
    type: r.type,
    direction: r.direction ?? undefined,
    qty: r.qty,
    location: r.location,
    locationNodeId: r.locationNodeId ?? undefined,
    // Normalise empty strings to undefined — older writes (and the Adjust dialog, which
    // has no reason-code field) persisted `reason_code = ''`, which then shadowed the
    // note/description in the Movements ledger because `?? ` only falls through on null.
    reference: r.reference?.trim() || undefined,
    reasonCode: r.reasonCode?.trim() || undefined,
    note: r.note?.trim() || undefined,
    description: r.description?.trim() || undefined,
    quarantine: r.quarantine,
    buildId: r.buildId ?? undefined,
    lotNumber: r.lotNumber ?? undefined,
    serialNumber: r.serialNumber ?? undefined,
    leadTimeDays: r.leadTimeDays ?? undefined,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
  };
}

export function fromApiBuild(r: ApiBuildDef): BuildDef {
  return {
    id: r.id,
    projectId: r.projectId,
    name: r.name,
    type: r.type,
    units: r.units,
    bomRev: r.bomRev,
    scrapPct: r.scrapPct,
    milestone: r.milestone ?? '',
    targetDate: r.targetDate ?? undefined,
    status: r.status,
    assignee: r.assignee ?? null,
  };
}

export function fromApiBuildBomLine(r: ApiBuildBomLine): BuildBomLine {
  return {
    partId: r.partId,
    pn: r.pn,
    name: r.name,
    cat: r.cat as BuildBomLine['cat'],
    imageUrl: resolveFileUrl(r.imageUrl) ?? undefined,
    qtyPerUnit: r.qtyPerUnit,
    uom: r.uom,
    onHand: r.onHand,
    allocated: r.allocated,
    onOrder: r.onOrder,
    quarantineQty: r.quarantineQty ?? 0,
    leadTimeDays: r.leadTimeDays,
    required: r.required,
    shortage: r.shortage,
  };
}

// ─── Request DTOs ──────────────────────────────────────────────────────────────

export interface ReceiveStockDto {
  partId: string;
  location: string;
  locationNodeId?: string | null;
  quantity: number;
  reference?: string;
  quarantine: boolean;
  note?: string;
  orderId?: string;
  lotNumber?: string;
  serialNumber?: string;
}

export interface AdjustQuantityDto {
  partId: string;
  location: string;
  locationNodeId?: string | null;
  direction: 'add' | 'remove';
  /** 'set' overwrites on-hand with `quantity`; 'delta' (default) adds/removes it per `direction`. */
  mode?: 'delta' | 'set';
  quantity: number;
  reasonCode?: string;
  note?: string;
  description?: string;
  lotNumber?: string;
  serialNumber?: string;
  leadTimeDays?: number;
}

export interface IssueStockDto {
  partId: string;
  location: string;
  quantity: number;
  buildId?: string;
  reference?: string;
  reasonCode?: string;
  note?: string;
}

export interface TransferStockDto {
  partId: string;
  fromLocation: string;
  toLocation: string;
  toLocationNodeId?: string | null;
  note?: string;
}

export interface AllocateStockDto {
  buildId: string;
  quantity: number;
}

export interface PlaceOrderDto {
  partId: string;
  quantity: number;
  expectedDate?: string;
  leadTimeDays?: number;
  supplierRef?: string;
  unitCost?: number;
  location: string;
  locationNodeId?: string | null;
  note?: string;
  description?: string;
  purpose?: string;
  lotNumber?: string;
  serialNumber?: string;
  /** 'planned' (want to order — not yet submitted to a supplier) or 'open' (already
   * ordered). Defaults to 'open' server-side when omitted. */
  status?: 'planned' | 'open';
}

export interface CreateBuildDto {
  name: string;
  type: string;
  units: number;
  bomRev: string;
  scrapPct: number;
  milestone?: string;
  targetDate?: string;
  assigneeId: string;
}

// Partial patch — only the changed fields are sent. `milestone`/`targetDate` accept
// `null` to explicitly clear the stored value (vs. omitting the key to leave it).
export interface UpdateBuildDto {
  name?: string;
  type?: string;
  units?: number;
  bomRev?: string;
  scrapPct?: number;
  milestone?: string | null;
  targetDate?: string | null;
  assigneeId?: string;
}

// ─── Service ────────────────────────────────────────────────────────────────────

export const inventoryService = {
  async listStock(orgId: string): Promise<ApiStockRecord[]> {
    return apiClient.get<ApiStockRecord[]>(ENDPOINTS.INVENTORY.STOCK(orgId));
  },

  async listOrders(orgId: string): Promise<ApiOrderRecord[]> {
    return apiClient.get<ApiOrderRecord[]>(ENDPOINTS.INVENTORY.ORDERS(orgId));
  },

  async listTransactions(orgId: string): Promise<ApiStockTransaction[]> {
    return apiClient.get<ApiStockTransaction[]>(ENDPOINTS.INVENTORY.TRANSACTIONS(orgId));
  },

  async listBuilds(orgId: string): Promise<ApiBuildDef[]> {
    return apiClient.get<ApiBuildDef[]>(ENDPOINTS.INVENTORY.BUILDS(orgId));
  },

  async getBuildBomLines(orgId: string, buildId: string): Promise<ApiBuildBomLine[]> {
    return apiClient.get<ApiBuildBomLine[]>(ENDPOINTS.INVENTORY.BUILD_BOM_LINES(orgId, buildId));
  },

  async createBuild(projectId: string, dto: CreateBuildDto): Promise<ApiBuildDef> {
    return apiClient.post<ApiBuildDef>(ENDPOINTS.INVENTORY.BUILDS_CREATE(projectId), dto);
  },

  async updateBuild(projectId: string, buildId: string, dto: UpdateBuildDto): Promise<ApiBuildDef> {
    return apiClient.patch<ApiBuildDef>(ENDPOINTS.INVENTORY.BUILDS_UPDATE(projectId, buildId), dto);
  },

  async receiveStock(orgId: string, dto: ReceiveStockDto): Promise<ApiStockRecord> {
    return apiClient.post<ApiStockRecord>(ENDPOINTS.INVENTORY.RECEIVE(orgId), dto);
  },

  async adjustStock(orgId: string, dto: AdjustQuantityDto): Promise<ApiStockRecord> {
    return apiClient.post<ApiStockRecord>(ENDPOINTS.INVENTORY.ADJUST(orgId), dto);
  },

  async releaseQuarantine(orgId: string, stockId: string, qty: number): Promise<ApiStockRecord> {
    return apiClient.post<ApiStockRecord>(ENDPOINTS.INVENTORY.RELEASE_QUARANTINE(orgId, stockId), { qty });
  },

  async issueStock(orgId: string, dto: IssueStockDto): Promise<ApiStockRecord> {
    return apiClient.post<ApiStockRecord>(ENDPOINTS.INVENTORY.ISSUE(orgId), dto);
  },

  async transferStock(orgId: string, dto: TransferStockDto): Promise<ApiStockRecord> {
    return apiClient.post<ApiStockRecord>(ENDPOINTS.INVENTORY.TRANSFER(orgId), dto);
  },

  async allocateStock(orgId: string, stockId: string, dto: AllocateStockDto): Promise<ApiStockRecord> {
    return apiClient.post<ApiStockRecord>(ENDPOINTS.INVENTORY.ALLOCATE_STOCK(orgId, stockId), dto);
  },

  async placeOrder(orgId: string, dto: PlaceOrderDto): Promise<ApiOrderRecord> {
    return apiClient.post<ApiOrderRecord>(ENDPOINTS.INVENTORY.PLACE_ORDER(orgId), dto);
  },

  async markOrderOrdered(orgId: string, orderId: string): Promise<ApiOrderRecord> {
    return apiClient.post<ApiOrderRecord>(ENDPOINTS.INVENTORY.MARK_ORDER_ORDERED(orgId, orderId), {});
  },

  async allocateBuild(orgId: string, buildId: string): Promise<ApiAllocateBuildResponse> {
    return apiClient.post<ApiAllocateBuildResponse>(ENDPOINTS.INVENTORY.ALLOCATE_BUILD(orgId, buildId), {});
  },

  async generateShortageOrders(
    orgId: string,
    buildId: string,
    partIds: string[],
  ): Promise<ApiGenerateShortageOrdersResponse> {
    return apiClient.post<ApiGenerateShortageOrdersResponse>(
      ENDPOINTS.INVENTORY.GENERATE_SHORTAGE_ORDERS(orgId, buildId),
      { partIds },
    );
  },

  async kitBuild(orgId: string, buildId: string): Promise<ApiBuildDef> {
    return apiClient.post<ApiBuildDef>(ENDPOINTS.INVENTORY.KIT_BUILD(orgId, buildId), {});
  },
};
