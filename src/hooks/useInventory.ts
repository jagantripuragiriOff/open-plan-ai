import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import {
  inventoryService,
  fromApiStock,
  fromApiOrder,
  fromApiTransaction,
  fromApiBuild,
  fromApiBuildBomLine,
  type ReceiveStockDto,
  type AdjustQuantityDto,
  type IssueStockDto,
  type TransferStockDto,
  type AllocateStockDto,
  type PlaceOrderDto,
  type CreateBuildDto,
  type UpdateBuildDto,
} from '@/services/inventory.service';

export function useInventoryStock(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inventory.stock(orgId ?? ''),
    queryFn:  async () => (await inventoryService.listStock(orgId!)).map(fromApiStock),
    enabled:  !!orgId,
    staleTime: 30 * 1000,
  });
}

export function useInventoryOrders(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inventory.orders(orgId ?? ''),
    queryFn:  async () => (await inventoryService.listOrders(orgId!)).map(fromApiOrder),
    enabled:  !!orgId,
    staleTime: 30 * 1000,
  });
}

export function useInventoryTransactions(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inventory.transactions(orgId ?? ''),
    queryFn:  async () => (await inventoryService.listTransactions(orgId!)).map(fromApiTransaction),
    enabled:  !!orgId,
    staleTime: 30 * 1000,
  });
}

export function useInventoryBuilds(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inventory.builds(orgId ?? ''),
    queryFn:  async () => (await inventoryService.listBuilds(orgId!)).map(fromApiBuild),
    enabled:  !!orgId,
  });
}

// BOM lines for a single build, scoped to that build's own project BOM — see
// inventory.service.ts (backend) getBuildBomLines / inventoryData.tsx buildFromDef.
export function useBuildBomLines(orgId: string | undefined, buildId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inventory.buildBomLines(orgId ?? '', buildId ?? ''),
    queryFn:  async () => (await inventoryService.getBuildBomLines(orgId!, buildId!)).map(fromApiBuildBomLine),
    enabled:  !!orgId && !!buildId,
    staleTime: 30 * 1000,
  });
}

function invalidateInventory(queryClient: ReturnType<typeof useQueryClient>, orgId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stock(orgId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.inventory.orders(orgId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.inventory.transactions(orgId) });
  // Receive/adjust/order mutations may have registered a new custom location
  // server-side (see backend's ensureLocation) — refetch so the picker offers it.
  queryClient.invalidateQueries({ queryKey: queryKeys.locations.list(orgId) });
}

export function useReceiveStock(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ReceiveStockDto) => inventoryService.receiveStock(orgId, dto),
    onSuccess: () => invalidateInventory(queryClient, orgId),
  });
}

export function useAdjustStock(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: AdjustQuantityDto) => inventoryService.adjustStock(orgId, dto),
    onSuccess: () => invalidateInventory(queryClient, orgId),
  });
}

export function useReleaseQuarantine(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stockId, qty }: { stockId: string; qty: number }) =>
      inventoryService.releaseQuarantine(orgId, stockId, qty),
    onSuccess: () => invalidateInventory(queryClient, orgId),
  });
}

export function useIssueStock(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: IssueStockDto) => inventoryService.issueStock(orgId, dto),
    onSuccess: () => invalidateInventory(queryClient, orgId),
  });
}

export function useTransferStock(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TransferStockDto) => inventoryService.transferStock(orgId, dto),
    onSuccess: () => invalidateInventory(queryClient, orgId),
  });
}

export function useAllocateStock(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stockId, ...dto }: AllocateStockDto & { stockId: string }) =>
      inventoryService.allocateStock(orgId, stockId, dto),
    onSuccess: (_data, { buildId }) => {
      invalidateInventory(queryClient, orgId);
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.buildBomLines(orgId, buildId) });
    },
  });
}

export function usePlaceOrder(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: PlaceOrderDto) => inventoryService.placeOrder(orgId, dto),
    onSuccess: () => invalidateInventory(queryClient, orgId),
  });
}

export function useMarkOrderOrdered(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => inventoryService.markOrderOrdered(orgId, orderId),
    onSuccess: () => invalidateInventory(queryClient, orgId),
  });
}

export function useCreateInventoryBuild(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, ...dto }: CreateBuildDto & { projectId: string }) =>
      inventoryService.createBuild(projectId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.builds(orgId) });
    },
  });
}

export function useUpdateInventoryBuild(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, buildId, ...dto }: UpdateBuildDto & { projectId: string; buildId: string }) =>
      inventoryService.updateBuild(projectId, buildId, dto),
    onSuccess: (_data, { buildId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.builds(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.buildBomLines(orgId, buildId) });
    },
  });
}

function invalidateBuild(queryClient: ReturnType<typeof useQueryClient>, orgId: string, buildId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.inventory.builds(orgId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.inventory.buildBomLines(orgId, buildId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stock(orgId) });
}

export function useAllocateBuild(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (buildId: string) => inventoryService.allocateBuild(orgId, buildId),
    onSuccess: (_data, buildId) => invalidateBuild(queryClient, orgId, buildId),
  });
}

export function useKitBuild(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (buildId: string) => inventoryService.kitBuild(orgId, buildId),
    onSuccess: (_data, buildId) => invalidateBuild(queryClient, orgId, buildId),
  });
}

export function useGenerateShortageOrders(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ buildId, partIds }: { buildId: string; partIds: string[] }) =>
      inventoryService.generateShortageOrders(orgId, buildId, partIds),
    onSuccess: (_data, { buildId }) => {
      invalidateBuild(queryClient, orgId, buildId);
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.orders(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.locations.list(orgId) });
    },
  });
}
