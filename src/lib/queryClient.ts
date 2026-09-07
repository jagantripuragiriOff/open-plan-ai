import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { logger } from '@/services/monitoring/logger';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // Route ALL React Query errors through the structured logger.
    // In production this means every failed query is recorded in client_error_logs.
    onError: (error, query) => {
      const queryKey = JSON.stringify(query.queryKey);
      logger.error(`Query failed: ${queryKey}`, {
        error: error instanceof Error ? error.message : String(error),
        queryKey,
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      logger.error('Mutation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Never retry on client errors (4xx) — auth failures should fail immediately.
      retry: (failureCount, error) => {
        if (error instanceof Error && 'status' in error) {
          const status = (error as Error & { status?: number }).status;
          if (status !== undefined && status >= 400 && status < 500) return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

// Query keys factory for consistent key management
export const queryKeys = {
  // Projects
  projects: {
    root: ['projects'] as const,
    all: (orgId?: string) => [...queryKeys.projects.root, orgId] as const,
    lists: () => [...queryKeys.projects.root, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.projects.lists(), filters] as const,
    details: () => [...queryKeys.projects.root, 'detail'] as const,
    detail: (id: string) => [...queryKeys.projects.details(), id] as const,
  },

  // Tasks
  tasks: {
    all: ['tasks'] as const,
    lists: () => [...queryKeys.tasks.all, 'list'] as const,
    list: (projectId: string) => [...queryKeys.tasks.lists(), projectId] as const,
    details: () => [...queryKeys.tasks.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.tasks.details(), id] as const,
    userTasks: (userId: string) => [...queryKeys.tasks.all, 'user', userId] as const,
  },

  // Issues
  issues: {
    all: ['issues'] as const,
    lists: () => [...queryKeys.issues.all, 'list'] as const,
    list: (projectId?: string) => [...queryKeys.issues.lists(), projectId] as const,
    details: () => [...queryKeys.issues.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.issues.details(), id] as const,
    openCount: () => [...queryKeys.issues.all, 'openCount'] as const,
  },

  // Milestones
  milestones: {
    all: ['milestones'] as const,
    list: (projectId: string) => [...queryKeys.milestones.all, 'list', projectId] as const,
    detail: (id: string) => [...queryKeys.milestones.all, 'detail', id] as const,
  },

  // Meetings (Calendar — Schedule a Meet)
  meetings: {
    all: ['meetings'] as const,
    org: (orgId?: string) => [...queryKeys.meetings.all, 'org', orgId] as const,
  },

  // Task Columns
  taskColumns: {
    all: ['task-columns'] as const,
    list: (projectId: string) => [...queryKeys.taskColumns.all, 'list', projectId] as const,
  },

  // Issue Columns
  issueColumns: {
    all: ['issue-columns'] as const,
    list: (projectId: string) => [...queryKeys.issueColumns.all, 'list', projectId] as const,
  },

  // Tags (shared project-wide registry)
  tags: {
    all: ['tags'] as const,
    list: (projectId: string) => [...queryKeys.tags.all, 'list', projectId] as const,
  },

  // Locations (org-wide registry backing the inventory Location picker)
  locations: {
    all: ['locations'] as const,
    list: (orgId: string) => [...queryKeys.locations.all, 'list', orgId] as const,
  },

  // Team
  team: {
    all: ['team'] as const,
    members: () => [...queryKeys.team.all, 'members'] as const,
    workload: () => [...queryKeys.team.all, 'workload'] as const,
  },

  // Modules
  modules: {
    all: ['modules'] as const,
    list: (projectId?: string) => [...queryKeys.modules.all, 'list', projectId] as const,
    detail: (id: string) => [...queryKeys.modules.all, 'detail', id] as const,
  },

  // Activities
  activities: {
    all: ['activities'] as const,
    byProject: (projectId: string) => [...queryKeys.activities.all, 'project', projectId] as const,
  },

  // Dashboard
  dashboard: {
    all: ['dashboard'] as const,
    stats: (orgId?: string) => [...queryKeys.dashboard.all, 'stats', orgId] as const,
    activity: (orgId?: string, limit?: number) => [...queryKeys.dashboard.all, 'activity', orgId, limit] as const,
    milestones: (orgId?: string, limit?: number) => [...queryKeys.dashboard.all, 'milestones', orgId, limit] as const,
    projects: (orgId?: string) => [...queryKeys.dashboard.all, 'projects', orgId] as const,
    // Single org-wide aggregate backing the ECO / BOM / milestone panels.
    overview: (orgId?: string) => [...queryKeys.dashboard.all, 'overview', orgId] as const,
  },

  // Organizations
  organizations: {
    all: ['organizations'] as const,
    current: () => [...queryKeys.organizations.all, 'current'] as const,
    members: (orgId: string) => [...queryKeys.organizations.all, 'members', orgId] as const,
  },

  // Reports
  reports: {
    all: ['reports'] as const,
    kpi: (filters?: Record<string, unknown>) => [...queryKeys.reports.all, 'kpi', filters] as const,
    trends: (filters?: Record<string, unknown>) => [...queryKeys.reports.all, 'trends', filters] as const,
  },

  // My Day
  myDay: {
    all: ['myDay'] as const,
    tasks: (userId: string) => [...queryKeys.myDay.all, 'tasks', userId] as const,
    issues: (userId: string) => [...queryKeys.myDay.all, 'issues', userId] as const,
    completedToday: (userId: string) => [...queryKeys.myDay.all, 'completedToday', userId] as const,
  },

  // BOM
  bom: {
    all:       ['bom'] as const,
    tree:      (projectId: string) => ['bom', 'tree', projectId] as const,
    summary:   (projectId: string) => ['bom', 'summary', projectId] as const,
    node:      (nodeId: string)    => ['bom', 'node', nodeId] as const,
    approvals:  (nodeId: string)    => ['bom', 'approvals', nodeId] as const,
    approvalRequests: (nodeId: string) => ['bom', 'approval-requests', nodeId] as const,
    projectApprovalRequests: (projectId: string, status?: string) => ['bom', 'project-approval-requests', projectId, status ?? 'all'] as const,
    notes:      (nodeId: string)    => ['bom', 'notes', nodeId] as const,
    costTrend:  (projectId: string, granularity: string) => ['bom', 'cost-trend', projectId, granularity] as const,
    requirementAllocations: (projectId: string) => ['bom', 'requirement-allocations', projectId] as const,
  },

  // Parts catalog
  parts: {
    all:       ['parts'] as const,
    // listRoot has no `params` slot — invalidating this prefix matches every
    // filtered/unfiltered useOrgParts query, since RQ does partial-key matching.
    listRoot:  (orgId: string) => ['parts', 'list', orgId] as const,
    list:      (orgId: string, params?: object) => ['parts', 'list', orgId, params] as const,
    detail:    (partId: string) => ['parts', 'detail', partId] as const,
    revisions: (partId: string) => ['parts', 'revisions', partId] as const,
  },

  // Requirements
  requirementGroups: {
    all:  ['requirementGroups'] as const,
    list: (projectId: string) => ['requirementGroups', 'list', projectId] as const,
  },
  requirements: {
    all:    ['requirements'] as const,
    tree:   (projectId: string) => ['requirements', 'tree', projectId] as const,
    detail: (requirementId: string) => ['requirements', 'detail', requirementId] as const,
  },
  requirementLinks: {
    all:         ['requirementLinks'] as const,
    list:        (requirementId: string) => ['requirementLinks', 'list', requirementId] as const,
    projectList: (projectId: string) => ['requirementLinks', 'projectList', projectId] as const,
  },
  // Test & Verification
  verification: {
    all:           ['verification'] as const,
    summary:       (projectId: string, buildId?: string) => ['verification', 'summary', projectId, buildId ?? null] as const,
    byRequirement: (requirementId: string) => ['verification', 'requirement', requirementId] as const,
    executions:    (testCaseId: string) => ['verification', 'executions', testCaseId] as const,
  },

  // Engineering Changes (ECO)
  ecos: {
    all:      ['ecos'] as const,
    // listRoot has no `filters` slot — invalidating this prefix matches every
    // filtered/unfiltered useECOList query, since RQ does partial-key matching.
    listRoot: (projectId: string) => ['ecos', 'list', projectId] as const,
    list:     (projectId: string, filters?: object) => ['ecos', 'list', projectId, filters] as const,
    byPart:   (partId: string) => ['ecos', 'by-part', partId] as const,
    affectedRequirements: (projectId: string) => ['ecos', 'affected-requirements', projectId] as const,
    stats:    (projectId: string) => ['ecos', 'stats', projectId] as const,
    detail:   (ecoId: string) => ['ecos', 'detail', ecoId] as const,
    ecn:      (ecoId: string) => ['ecos', 'ecn', ecoId] as const,
  },
  // Inventory
  inventory: {
    all:          ['inventory'] as const,
    stock:        (orgId: string) => ['inventory', 'stock', orgId] as const,
    orders:       (orgId: string) => ['inventory', 'orders', orgId] as const,
    transactions: (orgId: string) => ['inventory', 'transactions', orgId] as const,
    builds:       (orgId: string) => ['inventory', 'builds', orgId] as const,
    buildBomLines: (orgId: string, buildId: string) => ['inventory', 'builds', orgId, buildId, 'bom-lines'] as const,
  },

  supportLinks: {
    all:      ['support-links'] as const,
    listRoot: (projectId: string) => ['support-links', 'list', projectId] as const,
    list:     (projectId: string) => ['support-links', 'list', projectId] as const,
    detail:   (linkId: string) => ['support-links', 'detail', linkId] as const,
  },

  // AI Assistant (Ask)
  assistant: {
    all:          ['assistant'] as const,
    conversations: () => [...queryKeys.assistant.all, 'conversations'] as const,
    conversation: (id: string) => [...queryKeys.assistant.all, 'conversation', id] as const,
    shared:       (shareId: string) => [...queryKeys.assistant.all, 'shared', shareId] as const,
  },
};
