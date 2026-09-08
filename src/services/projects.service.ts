import { apiClient } from '@/services/api/client';
import { ENDPOINTS } from '@/services/api/endpoints';
import { resolveFileUrl } from '@/utils/fileUrl';
import { Project, Task, Milestone, Issue, IssueCategory, IssueSeverity, IssueStatus, TeamMember } from '@/types';
import { tasksService } from '@/services/tasks.service';

const LEGACY_ISSUE_STATUS_MAP: Record<string, IssueStatus> = {
  'in_progress': 'in-progress',
  'pending':     'in-progress',
};

/** Normalise an issue status value from the API. Passes custom statuses through as-is. */
function normaliseIssueStatus(raw: unknown): string {
  if (typeof raw === 'string' && raw.length > 0) {
    return LEGACY_ISSUE_STATUS_MAP[raw] ?? raw;
  }
  return 'open';
}

/** Backend returns `dueDate`; the UI Milestone type uses `date`. */
function fromApiMilestone(raw: Record<string, unknown>): Milestone {
  const creator = raw.createdBy as { id: string; name: string; avatarUrl?: string | null } | null | undefined;
  const assignee = raw.assignee as { id: string; name: string; avatarUrl?: string | null } | null | undefined;

  return {
    id: raw.id as string,
    title: raw.title as string,
    description: (raw.description as string) || undefined,
    date: raw.dueDate as string,
    completed: Boolean(raw.completed),
    completedAt: (raw.completedAt as string) || undefined,
    status: (raw.statusOverride as Milestone['status']) || undefined,
    createdBy: creator
      ? {
          id: creator.id,
          name: creator.name || 'Unknown',
          email: '',
          role: 'member',
          initials: (creator.name || '?').slice(0, 2).toUpperCase(),
          avatar: creator.avatarUrl || '',
        }
      : undefined,
    assignee: assignee ? mapPerson(assignee) : null,
  };
}

/** Map a raw {id, name, avatarUrl} person object from the API into a TeamMember. */
function mapPerson(raw: any): TeamMember {
  return {
    id: raw?.id ?? '',
    name: raw?.name ?? 'Unknown',
    email: '',
    role: 'Member' as const,
    initials: raw?.name
      ? (raw.name as string).split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
      : 'U',
    avatar: raw?.avatar ?? raw?.avatarUrl ?? '',
    avatarUrl: raw?.avatarUrl ?? null,
  };
}

export function fromApiIssue(raw: Record<string, unknown>): Issue {
  const assignees = ((raw.assignees as any[]) || []).map((a: any): TeamMember => ({
    id: a.id,
    name: a.name ?? '',
    email: '',
    role: 'Member' as const,
    initials: a.name ? (a.name as string).split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) : '?',
    avatar: a.avatarUrl ?? '',
    avatarUrl: a.avatarUrl ?? null,
  }));

  const reportedBy: TeamMember = raw.reportedBy
    ? mapPerson(raw.reportedBy)
    : { id: '', name: 'Unknown', email: '', role: 'Member', initials: 'U', avatar: '' };

  const updatedBy: TeamMember | null = raw.updatedBy ? mapPerson(raw.updatedBy) : null;

  return {
    id: raw.id as string,
    title: raw.title as string,
    description: (raw.description as string) ?? '',
    projectId: (raw.projectId ?? raw.project_id) as string,
    number: raw.number as number,
    moduleId: (raw.moduleId as string) || undefined,
    category: raw.category as IssueCategory,
    categoryOther: (raw.categoryOther as string) || undefined,
    severity: (raw.severity as IssueSeverity) ?? 'minor',
    status: normaliseIssueStatus(raw.status),
    reportedAt: (raw.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (raw.updatedAt as string) || undefined,
    resolvedAt: (raw.resolvedAt as string) || undefined,
    dueDate: (raw.dueDate as string) || undefined,
    resolution: (raw.resolution as string) || undefined,
    reportedBy,
    updatedBy,
    lastModifiedFields: (raw.lastModifiedFields as string[] | null) ?? null,
    changeHistory: (raw.changeHistory as Issue['changeHistory']) ?? null,
    assignees,
    blocksTaskIds: ((raw.blockedTasks as any[]) || []).map((t: any) => t.id),
    blockedBy: ((raw.blockedByTasks as any[]) || []).map((t: any) => t.id),
    blocksMilestoneIds: (raw.blocksMilestoneIds as string[]) ?? [],
    tags: (raw.tags as string[]) ?? [],
    checklist: (raw.checklist as Issue['checklist']) ?? [],
    descriptionBlocks: (raw.descriptionBlocks as Issue['descriptionBlocks']) ?? [],
    videoLinks: (raw.videoLinks as Issue['videoLinks']) ?? [],
    attachmentCounts: raw.attachmentCounts as Issue['attachmentCounts'],
  } as Issue;
}

export const projectsService = {
  /**
   * Get all projects for an organization
   */
  async getByOrg(orgId: string): Promise<Project[]> {
    // Backend paginates this endpoint (default limit 20) and sorts pinned-first.
    // The frontend does its own client-side search/sort/pagination over the
    // full list, so request the backend's max page size rather than its default —
    // otherwise pinning/unpinning a project can shift it in or out of a
    // truncated window and make it appear to vanish from the list.
    return apiClient.get<Project[]>(ENDPOINTS.PROJECTS.LIST(orgId), { params: { limit: 100 } });
  },

  /**
   * Get all projects (no org filter — returns empty; use getByOrg for actual data)
   */
  async getAll(organizationId?: string): Promise<Project[]> {
    if (!organizationId) return [];
    return this.getByOrg(organizationId);
  },

  /**
   * Get project by ID with full details
   */
  async getById(id: string, signal?: AbortSignal): Promise<Project | null> {
    return apiClient.get<Project>(ENDPOINTS.PROJECTS.BY_ID(id), { signal });
  },

  /**
   * Create new project
   */
  async create(
    project: {
      name: string;
      description?: string;
      stage?: string;
      type?: string;
      progress?: number;
      startDate?: string;
      targetDate?: string;
      icon?: string;
      clientName?: string;
      clientOrganization?: string;
      clientContact?: string;
      notes?: string;
      departments?: string[];
    },
    organizationId: string
  ): Promise<Project> {
    return apiClient.post<Project>(ENDPOINTS.PROJECTS.LIST(organizationId), project);
  },

  /**
   * Update existing project
   */
  async update(id: string, updates: Partial<Project>): Promise<Project> {
    return apiClient.put<Project>(ENDPOINTS.PROJECTS.BY_ID(id), updates);
  },

  /**
   * Delete project
   */
  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(ENDPOINTS.PROJECTS.BY_ID(id));
  },

  /**
   * Upload a square project logo — single-step endpoint handles S3 storage +
   * the `logo_url` column update. Replaces the emoji icon when present.
   */
  async uploadLogo(projectId: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.raw.post<{ success: boolean; data: { logoUrl: string } }>(
      ENDPOINTS.PROJECTS.LOGO(projectId),
      formData,
      { headers: { 'Content-Type': undefined } },
    );
    const rawUrl = res.data.data.logoUrl;
    return resolveFileUrl(rawUrl) ?? rawUrl;
  },

  /**
   * Remove the project's logo, reverting the icon slot back to the emoji.
   */
  async deleteLogo(projectId: string): Promise<void> {
    await apiClient.delete<void>(ENDPOINTS.PROJECTS.LOGO(projectId));
  },

  /**
   * Update project stage
   */
  async updateStage(id: string, stage: string): Promise<Project> {
    return apiClient.patch<Project>(ENDPOINTS.PROJECTS.STAGE(id), { stage });
  },

  /**
   * Sync computed project progress — Maintainer+ accessible, unlike the
   * general update() endpoint which is Admin-only (project identity/settings).
   */
  async updateProgress(id: string, progress: number): Promise<Project> {
    return apiClient.patch<Project>(ENDPOINTS.PROJECTS.PROGRESS(id), { progress });
  },

  /**
   * Toggle the current user's pin on a project — private per-user, reorders
   * only that user's own project list.
   */
  async togglePin(id: string): Promise<Project> {
    return apiClient.patch<Project>(ENDPOINTS.PROJECTS.PIN(id), {});
  },

  /**
   * Get project team members
   */
  async getTeam(id: string): Promise<TeamMember[]> {
    return apiClient.get<TeamMember[]>(ENDPOINTS.PROJECTS.TEAM(id));
  },

  /**
   * Get project members (alias for getTeam)
   */
  async getProjectMembers(projectId: string): Promise<TeamMember[]> {
    return this.getTeam(projectId);
  },

  /**
   * Get tasks for a project
   */
  async getTasks(projectId: string, limit = 100, signal?: AbortSignal): Promise<Task[]> {
    return tasksService.getByProject(projectId, limit, signal);
  },

  /**
   * Get milestones for a project
   */
  async getMilestones(projectId: string, limit = 100, signal?: AbortSignal): Promise<Milestone[]> {
    const data = await apiClient.get<Record<string, unknown>[]>(`${ENDPOINTS.MILESTONES.LIST(projectId)}?limit=${limit}`, { signal });
    return (data || []).map(fromApiMilestone);
  },

  /**
   * Get issues for a project
   */
  async getIssues(projectId: string, _limit = 100, signal?: AbortSignal): Promise<Issue[]> {
    const data = await apiClient.get<Record<string, unknown>[]>(ENDPOINTS.ISSUES.LIST_ALL(projectId), { signal });
    return (data || []).map(fromApiIssue);
  },

  /**
   * Get modules for a project
   */
  async getModules(projectId: string): Promise<unknown[]> {
    return apiClient.get<unknown[]>(ENDPOINTS.MODULES.LIST(projectId));
  },
};
