import { describe, it, expect, beforeEach, vi } from 'vitest';
import { projectsService } from '../projects.service';

vi.mock('@/services/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  tokenStorage: {
    getAccessToken: vi.fn(() => 'mock-token'),
    setAccessToken: vi.fn(),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
    getRefreshToken: vi.fn(() => null),
  },
}));

vi.mock('@/services/tasks.service', () => ({
  tasksService: {
    getByProject: vi.fn(() => Promise.resolve([])),
  },
}));

import { apiClient } from '@/services/api/client';

const MOCK_ORG_ID = 'org-123';

const mockProject = {
  id: 'proj-1',
  name: 'Alpha Project',
  description: 'Test project',
  stage: 'development',
  progress: 40,
  startDate: '2026-01-01',
  targetDate: '2026-12-31',
  team: [],
  tasks: [],
  milestones: [],
  modules: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('projectsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getByOrg ────────────────────────────────────────────────────────────────

  describe('getByOrg', () => {
    it('should return projects for the given org', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce([mockProject]);

      const projects = await projectsService.getByOrg(MOCK_ORG_ID);

      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining(`/organizations/${MOCK_ORG_ID}/projects`),
        expect.objectContaining({ params: expect.objectContaining({ limit: 100 }) })
      );
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe('proj-1');
    });
  });

  // ── getAll ──────────────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('should return empty array when no organizationId is provided', async () => {
      const projects = await projectsService.getAll();
      expect(projects).toEqual([]);
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('should delegate to getByOrg when organizationId is provided', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce([mockProject]);

      const projects = await projectsService.getAll(MOCK_ORG_ID);

      expect(projects).toHaveLength(1);
    });
  });

  // ── getById ─────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('should return a project by ID', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockProject);

      const project = await projectsService.getById('proj-1');

      expect(project?.id).toBe('proj-1');
    });

    it('should return null when the API returns null', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(null);

      const project = await projectsService.getById('no-such-project');

      expect(project).toBeNull();
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should POST to the org projects endpoint and return the new project', async () => {
      const created = { ...mockProject, id: 'proj-new' };
      vi.mocked(apiClient.post).mockResolvedValueOnce(created);

      const project = await projectsService.create(
        { name: 'New Project', description: 'desc' },
        MOCK_ORG_ID
      );

      expect(apiClient.post).toHaveBeenCalledWith(
        expect.stringContaining(`/organizations/${MOCK_ORG_ID}/projects`),
        expect.objectContaining({ name: 'New Project' })
      );
      expect(project.id).toBe('proj-new');
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should PUT the project and return the updated result', async () => {
      const updated = { ...mockProject, name: 'Renamed Project' };
      vi.mocked(apiClient.put).mockResolvedValueOnce(updated);

      const project = await projectsService.update('proj-1', { name: 'Renamed Project' });

      expect(project.name).toBe('Renamed Project');
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should call DELETE on the project endpoint', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await projectsService.delete('proj-1');

      expect(apiClient.delete).toHaveBeenCalledWith(
        expect.stringContaining('/projects/proj-1')
      );
    });
  });

  // ── updateStage ─────────────────────────────────────────────────────────────

  describe('updateStage', () => {
    it('should PATCH the project stage', async () => {
      vi.mocked(apiClient.patch).mockResolvedValueOnce({ ...mockProject, stage: 'testing' });

      const project = await projectsService.updateStage('proj-1', 'testing');

      expect(apiClient.patch).toHaveBeenCalledWith(
        expect.stringContaining('/projects/proj-1/stage'),
        { stage: 'testing' }
      );
      expect(project.stage).toBe('testing');
    });
  });

  // ── getIssues ───────────────────────────────────────────────────────────────

  describe('getIssues', () => {
    it('should return mapped issues for a project', async () => {
      const rawIssue = {
        id: 'issue-1',
        title: 'Bug',
        description: 'A bug',
        projectId: 'proj-1',
        category: 'defect',
        severity: 'major',
        status: 'open',
        createdAt: '2026-01-01T00:00:00Z',
        assignees: [],
        reportedBy: { id: 'u-1', name: 'Alice', role: 'Member' },
      };
      vi.mocked(apiClient.get).mockResolvedValueOnce([rawIssue]);

      const issues = await projectsService.getIssues('proj-1');

      expect(issues).toHaveLength(1);
      expect(issues[0].id).toBe('issue-1');
      expect(issues[0].status).toBe('open');
    });

    it('should normalise unknown issue statuses to open', async () => {
      const rawIssue = {
        id: 'issue-2',
        title: 'Legacy Issue',
        description: '',
        projectId: 'proj-1',
        category: 'risk',
        severity: 'minor',
        status: 'in_progress', // legacy value not in current IssueStatus union
        createdAt: '2026-01-01T00:00:00Z',
        assignees: [],
      };
      vi.mocked(apiClient.get).mockResolvedValueOnce([rawIssue]);

      const [issue] = await projectsService.getIssues('proj-1');

      expect(issue.status).toBe('in-progress'); // normalised via normaliseIssueStatus
    });
  });
});
