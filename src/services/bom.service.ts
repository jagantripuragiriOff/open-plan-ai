import { apiClient } from '@/services/api/client';
import { ENDPOINTS } from '@/services/api/endpoints';
import type {
  ApiTreeResponse,
  ApiNodeResponse,
  ApiSummaryResponse,
  ApiReqLinkResponse,
  ApiApprovalResponse,
  ApiApprovalRequestResponse,
  BOMApprovalRequestScope,
} from '@/features/projects/components/bomData';

export interface CreateNodeDto {
  partId: string;
  quantity: number;
  unit?: string;
  designators?: string | null;
  status?: 'approved' | 'pending' | 'draft';
  parentId?: string | null;
  position?: number;
  notes?: string;
  ownerId?: string | null;
}

export interface UpdateNodeDto {
  quantity?: number;
  unit?: string;
  designators?: string | null;
  status?: 'approved' | 'pending' | 'draft';
  notes?: string;
  ownerId?: string | null;
}

export interface MapColumnsResponse {
  mapping: Record<string, string>;
  unmatched: string[];
}

export interface FixRowRequest {
  partNumber: string; name: string; description: string; category: string;
  manufacturer: string; mpn: string; supplier: string;
  unitPriceRaw: string; leadTimeRaw: string; quantityRaw: string; uom: string;
  errors: string[];
}

export interface FixRowResponse {
  suggestions: { name: string | null; description: string | null; category: string | null };
}

export const bomService = {
  async mapImportColumns(
    headers: string[],
    sampleRows: Record<string, unknown>[],
  ): Promise<MapColumnsResponse> {
    return apiClient.post<MapColumnsResponse>(
      ENDPOINTS.BOM_IMPORT.MAP_COLUMNS(),
      { headers, sampleRows },
      { timeout: 20000 },
    );
  },

  async fixImportRow(payload: FixRowRequest): Promise<FixRowResponse> {
    return apiClient.post<FixRowResponse>(
      ENDPOINTS.BOM_IMPORT.FIX_ROW(),
      payload,
      { timeout: 20000 },
    );
  },


  async getTree(projectId: string): Promise<ApiTreeResponse> {
    return apiClient.get<ApiTreeResponse>(ENDPOINTS.BOM.TREE(projectId));
  },

  async getSummary(projectId: string): Promise<ApiSummaryResponse> {
    return apiClient.get<ApiSummaryResponse>(ENDPOINTS.BOM.SUMMARY(projectId));
  },

  async createNode(projectId: string, dto: CreateNodeDto): Promise<ApiNodeResponse> {
    return apiClient.post<ApiNodeResponse>(ENDPOINTS.BOM.NODES(projectId), dto);
  },

  async getNode(nodeId: string): Promise<ApiNodeResponse> {
    return apiClient.get<ApiNodeResponse>(ENDPOINTS.BOM.NODE(nodeId));
  },

  async updateNode(nodeId: string, dto: UpdateNodeDto): Promise<ApiNodeResponse> {
    return apiClient.put<ApiNodeResponse>(ENDPOINTS.BOM.NODE(nodeId), dto);
  },

  async moveNode(nodeId: string, dto: { parentId: string | null; position?: number }): Promise<ApiNodeResponse> {
    return apiClient.patch<ApiNodeResponse>(ENDPOINTS.BOM.NODE_MOVE(nodeId), dto);
  },

  async deleteNode(nodeId: string): Promise<{ deletedCount: number }> {
    return apiClient.delete<{ deletedCount: number }>(ENDPOINTS.BOM.NODE(nodeId));
  },

  async addRequirement(nodeId: string, requirementId: string, rationale?: string | null): Promise<ApiReqLinkResponse> {
    return apiClient.post<ApiReqLinkResponse>(ENDPOINTS.BOM.NODE_REQUIREMENTS(nodeId), { requirementId, rationale });
  },

  async updateRequirementLink(linkId: string, rationale: string | null): Promise<ApiReqLinkResponse> {
    return apiClient.patch<ApiReqLinkResponse>(ENDPOINTS.BOM.REQ_LINK(linkId), { rationale });
  },

  async removeRequirement(linkId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.BOM.REQ_LINK(linkId));
  },

  async getNodeApprovals(nodeId: string): Promise<ApiApprovalResponse[]> {
    return apiClient.get<ApiApprovalResponse[]>(ENDPOINTS.BOM.NODE_APPROVALS(nodeId));
  },

  async createApprovalRequest(
    nodeId: string,
    dto: { scope: BOMApprovalRequestScope; approverIds: string[]; comment?: string },
  ): Promise<ApiApprovalRequestResponse> {
    return apiClient.post<ApiApprovalRequestResponse>(ENDPOINTS.BOM.APPROVAL_REQUESTS(nodeId), dto);
  },

  async listApprovalRequests(nodeId: string): Promise<ApiApprovalRequestResponse[]> {
    return apiClient.get<ApiApprovalRequestResponse[]>(ENDPOINTS.BOM.APPROVAL_REQUESTS(nodeId));
  },

  async listProjectApprovalRequests(
    projectId: string,
    status?: 'pending' | 'approved' | 'rejected',
  ): Promise<ApiApprovalRequestResponse[]> {
    return apiClient.get<ApiApprovalRequestResponse[]>(
      ENDPOINTS.BOM.PROJECT_APPROVAL_REQUESTS(projectId) + (status ? `?status=${status}` : ''),
    );
  },

  async decideApprovalRequest(
    requestId: string,
    dto: { decision: 'approved' | 'rejected'; reason?: string; comment?: string },
  ): Promise<ApiApprovalRequestResponse> {
    return apiClient.post<ApiApprovalRequestResponse>(ENDPOINTS.BOM.APPROVAL_REQUEST_DECISION(requestId), dto);
  },

  async exportCsv(projectId: string): Promise<Blob> {
    const response = await fetch(
      `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1'}${ENDPOINTS.BOM.EXPORT(projectId)}`,
      { credentials: 'include' },
    );
    if (!response.ok) throw new Error('Export failed');
    return response.blob();
  },
};
