import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Issue, IssueStatus, IssueSeverity, IssueCategory, Task, TeamMember } from '@/types';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ColorSwatchPicker } from '@/components/shared/ColorSwatchPicker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { cn, getDisplayId } from '@/lib/utils';
import { playCompleteSound } from '@/lib/playSound';
import { resolveFileUrl } from '@/utils/fileUrl';
import {
  AlertTriangle,
  Info,
  Bug,
  Truck,
  FileWarning,
  FlaskConical,
  Pencil,
  Link2,
  GripVertical,
  Plus,
  Check,
  MoreHorizontal,
  Trash2,
  Calendar,
  Loader2,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IssueDetailModal } from './IssueDetailModal';
import { ISSUE_SEVERITY_DISPLAY } from './issueSeverity';
import { useIssueColumns, useCreateIssueColumn, useUpdateIssueColumn, useDeleteIssueColumn, useReorderIssueColumns } from '@/hooks/useIssueColumns';
import { useUpdateIssueStatus } from '@/hooks/useProjectMutations';
import { DEFAULT_ISSUE_COLUMNS } from '@/services/issueColumns.service';
import { useAuth } from '@/modules/auth';
import { useIsMobile } from '@/hooks/use-mobile';
import { useKanbanEdgeAutoScroll, resolveKanbanColumnIdAtPoint } from '@/hooks/useKanbanEdgeAutoScroll';
import { MobileKanbanColumn } from '@/components/shared/MobileKanbanColumn';
import { AttachmentBadges } from '@/components/shared/AttachmentBadges';

interface IssuesViewProps {
  issues: Issue[];
  projectCode?: string;
  viewMode?: 'table' | 'kanban';
  tasks?: Task[];
  teamMembers?: TeamMember[];
  searchQuery?: string;
  severityFilter?: IssueSeverity[];
  statusFilter?: string[]; // status keys from the project's issue buckets (custom, not a fixed enum)
  assigneeFilter?: string[];
  assignedByFilter?: string[];
  updatedByFilter?: string[];
  dueDateFilter?: 'overdue' | 'today' | 'this-week' | 'this-month' | 'no-date';
  dueDateCustomFilter?: string; // start of a custom range (yyyy-MM-dd), inclusive
  dueDateCustomToFilter?: string; // end of a custom range (yyyy-MM-dd), inclusive
  reportedDateFilter?: 'today' | 'this-week' | 'this-month';
  reportedDateCustomFilter?: string; // start of a custom range (yyyy-MM-dd), inclusive
  reportedDateCustomToFilter?: string; // end of a custom range (yyyy-MM-dd), inclusive
  completedDateFilter?: 'today' | 'this-week' | 'this-month';
  completedDateCustomFilter?: string; // start of a custom range (yyyy-MM-dd), inclusive
  completedDateCustomToFilter?: string; // end of a custom range (yyyy-MM-dd), inclusive
  tagsFilter?: string[];
  isAddDialogOpen?: boolean;
  onAddDialogClose?: () => void;
  onIssueUpdate?: (issue: Issue) => void;
  onIssueCreate?: (issue: Partial<Issue>, pendingFiles?: File[]) => void;
  onIssueDelete?: (issueId: string) => void;
  userProjectRole?: string;
  /** Px offset from the top of the scroll container to stick the table header below — e.g. the height of a sticky page header rendered above this view. */
  stickyOffset?: number;
}

interface IssuesKanbanColumn {
  id: string;
  status: string;
  label: string;
  color: string;
  isSpecial?: boolean;
}

const STATUS_BADGE_CONFIG: Record<string, { color: string; label: string }> = {
  open: { color: 'bg-destructive/20 text-destructive border-destructive/30', label: 'Open' },
  'in-progress': { color: 'bg-orange-500/20 text-orange-600 border-orange-500/30', label: 'In Progress' },
  resolved: { color: 'bg-status-done/20 text-status-done border-status-done/30', label: 'Resolved' },
  'wont-fix': { color: 'bg-muted text-muted-foreground border-muted line-through', label: "Won't Fix" },
};

function getStatusBadge(status: string) {
  return STATUS_BADGE_CONFIG[status] ?? { color: 'bg-primary/20 text-primary border-primary/30', label: status };
}

const categoryConfig: Record<IssueCategory, { icon: typeof Bug; label: string }> = {
  defect: { icon: Bug, label: 'Defect' },
  risk: { icon: AlertTriangle, label: 'Risk' },
  supplier: { icon: Truck, label: 'Supplier' },
  compliance: { icon: FileWarning, label: 'Compliance' },
  'test-failure': { icon: FlaskConical, label: 'Test Failure' },
  'design-change': { icon: Pencil, label: 'Design Change' },
  other: { icon: Info, label: 'Other' },
};

const getCategoryLabel = (issue: Issue): string =>
  issue.category === 'other' && issue.categoryOther?.trim()
    ? issue.categoryOther
    : categoryConfig[issue.category].label;

const DEPENDENCIES_COLUMN: IssuesKanbanColumn = {
  id: 'col-dependencies',
  status: 'dependencies',
  label: 'Dependencies',
  color: '#f59e0b',
  isSpecial: true,
};

function apiColumnsToKanban(apiCols: typeof DEFAULT_ISSUE_COLUMNS): IssuesKanbanColumn[] {
  return [
    DEPENDENCIES_COLUMN,
    ...apiCols.map((c) => ({
      id: c.id,
      status: c.status,
      label: c.label,
      color: c.color,
      isSpecial: c.isSpecial ?? false,
    })),
  ];
}

const issueSeverityBorder: Record<IssueSeverity, string> = {
  critical: 'border-l-destructive',
  major: 'border-l-orange-500',
  minor: 'border-l-yellow-500',
  trivial: 'border-l-muted-foreground',
};

const BOARD_CHECKLIST_PREVIEW_COUNT = 2;

// Stable identity for unset array filter props. A literal `[]` default in a
// destructured prop is re-created on every render, which made the pagination
// reset effect below (keyed on these arrays) fire on every render — including
// the one right after clicking "Next" — snapping the page back to 1 before
// the new rows ever showed.
const EMPTY_ARRAY: never[] = [];

/**
 * Inclusive yyyy-MM-dd comparison for the "Custom..." date filters — `to`
 * falls back to `from` so a single-day pick (from === to) still works via
 * this same path. String comparison is safe here since both sides are
 * always zero-padded ISO date strings, which sort identically to a real
 * date comparison.
 */
function matchesCustomDateRange(date: Date | null, from: string | undefined, to: string | undefined): boolean {
  if (!date || !from) return false;
  const day = format(date, 'yyyy-MM-dd');
  return day >= from && day <= (to || from);
}

export function IssuesView({
  issues,
  projectCode,
  viewMode = 'table',
  tasks = [],
  teamMembers = [],
  searchQuery: externalSearchQuery,
  severityFilter: externalSeverityFilter = EMPTY_ARRAY,
  statusFilter: externalStatusFilter = EMPTY_ARRAY,
  assigneeFilter: externalAssigneeFilter = EMPTY_ARRAY,
  assignedByFilter: externalAssignedByFilter = EMPTY_ARRAY,
  updatedByFilter: externalUpdatedByFilter = EMPTY_ARRAY,
  dueDateFilter: externalDueDateFilter,
  dueDateCustomFilter: externalDueDateCustomFilter,
  dueDateCustomToFilter: externalDueDateCustomToFilter,
  reportedDateFilter: externalReportedDateFilter,
  reportedDateCustomFilter: externalReportedDateCustomFilter,
  reportedDateCustomToFilter: externalReportedDateCustomToFilter,
  completedDateFilter: externalCompletedDateFilter,
  completedDateCustomFilter: externalCompletedDateCustomFilter,
  completedDateCustomToFilter: externalCompletedDateCustomToFilter,
  tagsFilter: externalTagsFilter = EMPTY_ARRAY,
  isAddDialogOpen: externalIsAddDialogOpen,
  onAddDialogClose,
  onIssueUpdate,
  onIssueCreate,
  onIssueDelete,
  userProjectRole,
  stickyOffset = 0,
}: IssuesViewProps) {
  const { id: routeProjectId } = useParams();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { data: apiIssueColumns, isLoading: isIssueColumnsLoading } = useIssueColumns(routeProjectId);
  const createIssueColumn = useCreateIssueColumn(routeProjectId);
  const updateIssueColumn = useUpdateIssueColumn(routeProjectId);
  const deleteIssueColumn = useDeleteIssueColumn(routeProjectId);
  const reorderIssueColumns = useReorderIssueColumns(routeProjectId);
  const updateIssueStatus = useUpdateIssueStatus(routeProjectId || '');

  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const [internalSeverityFilter, setInternalSeverityFilter] = useState<IssueSeverity[]>([]);
  const [internalStatusFilter, setInternalStatusFilter] = useState<string[]>([]);
  const [localIssues, setLocalIssues] = useState<Issue[]>(issues);
  const [columns, setColumns] = useState<IssuesKanbanColumn[]>(() =>
    apiColumnsToKanban(apiIssueColumns && apiIssueColumns.length > 0 ? apiIssueColumns : DEFAULT_ISSUE_COLUMNS),
  );
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'create'>('view');
  const [newIssueDraft, setNewIssueDraft] = useState<Issue | null>(null);
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('#3b82f6');
  const [renamingColumn, setRenamingColumn] = useState<IssuesKanbanColumn | null>(null);
  const [renameColumnName, setRenameColumnName] = useState('');
  const [expandedChecklistPreview, setExpandedChecklistPreview] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedMobileStatus, setSelectedMobileStatus] = useState<string>('all');
  // The table body scrolls inside its own fixed-height box (see max-h-[calc(100vh-320px)]
  // below) independent of the page scroll — without this, paging kept whatever
  // scroll position was left inside that box, so a new page could open already
  // scrolled past its first rows.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tableScrollRef.current?.scrollTo({ top: 0 });
  }, [currentPage]);

  // Sync columns from API
  useEffect(() => {
    if (apiIssueColumns && apiIssueColumns.length > 0) {
      setColumns(apiColumnsToKanban(apiIssueColumns));
    }
  }, [apiIssueColumns]);

  // Use external props if provided
  const searchQuery = externalSearchQuery ?? internalSearchQuery;
  const severityFilter = externalSeverityFilter ?? internalSeverityFilter;
  const statusFilter = externalStatusFilter ?? internalStatusFilter;
  const assigneeFilter = externalAssigneeFilter;
  const assignedByFilter = externalAssignedByFilter;
  const updatedByFilter = externalUpdatedByFilter;
  const dueDateFilter = externalDueDateFilter;
  const dueDateCustomFilter = externalDueDateCustomFilter;
  const dueDateCustomToFilter = externalDueDateCustomToFilter;
  const reportedDateFilter = externalReportedDateFilter;
  const reportedDateCustomFilter = externalReportedDateCustomFilter;
  const reportedDateCustomToFilter = externalReportedDateCustomToFilter;
  const completedDateFilter = externalCompletedDateFilter;
  const completedDateCustomFilter = externalCompletedDateCustomFilter;
  const completedDateCustomToFilter = externalCompletedDateCustomToFilter;
  const tagsFilter = externalTagsFilter;

  useEffect(() => {
    setLocalIssues(issues);
  }, [issues]);

  const handleAddColumn = () => {
    if (!newColumnName.trim() || !routeProjectId) return;
    createIssueColumn.mutate(
      { label: newColumnName, color: newColumnColor },
      {
        onSuccess: () => {
          setNewColumnName('');
          setNewColumnColor('#3b82f6');
          setIsAddColumnOpen(false);
        },
      },
    );
  };

  const handleRemoveColumn = (columnId: string) => {
    const column = columns.find((c) => c.id === columnId);
    if (column?.isSpecial) return;
    deleteIssueColumn.mutate(columnId);
  };

  const handleStartRenameColumn = (column: IssuesKanbanColumn) => {
    setRenamingColumn(column);
    setRenameColumnName(column.label);
  };

  const handleConfirmRenameColumn = () => {
    if (!renamingColumn || !renameColumnName.trim()) return;
    updateIssueColumn.mutate(
      { id: renamingColumn.id, input: { label: renameColumnName.trim() } },
      {
        onSuccess: () => {
          setRenamingColumn(null);
          setRenameColumnName('');
        },
      },
    );
  };


  const filteredIssues = localIssues.filter(issue => {
    const matchesSearch = (issue.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (issue.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = !severityFilter.length || severityFilter.includes(issue.severity);
    const matchesStatus = !statusFilter.length || statusFilter.includes(issue.status);
    const matchesAssignee = !assigneeFilter.length ||
      (assigneeFilter.includes('unassigned') && (!issue.assignees || issue.assignees.length === 0)) ||
      (issue.assignees?.some(a => assigneeFilter.includes(a.id)));
    const matchesAssignedBy = !assignedByFilter.length ||
      assignedByFilter.includes(issue.reportedBy.id);
    const matchesUpdatedBy = !updatedByFilter.length ||
      (!!issue.updatedBy && updatedByFilter.includes(issue.updatedBy.id));
    const matchesTags = !tagsFilter.length ||
      (issue.tags?.some(tag => tagsFilter.includes(tag)) ?? false);
    let matchesDueDate = true;
    if (dueDateCustomFilter) {
      const issueDueDate = issue.dueDate ? new Date(issue.dueDate) : null;
      matchesDueDate = matchesCustomDateRange(issueDueDate, dueDateCustomFilter, dueDateCustomToFilter);
    } else if (dueDateFilter) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const issueDueDate = issue.dueDate ? new Date(issue.dueDate) : null;
      switch (dueDateFilter) {
        case 'overdue': {
          const resolvedStatuses = ['resolved', 'wont-fix'];
          matchesDueDate = !!issueDueDate && issueDueDate < today && !resolvedStatuses.includes(issue.status);
          break;
        }
        case 'today':
          matchesDueDate = !!issueDueDate && issueDueDate.toDateString() === today.toDateString();
          break;
        case 'this-week': {
          const weekEnd = new Date(today);
          weekEnd.setDate(today.getDate() + 7);
          matchesDueDate = !!issueDueDate && issueDueDate >= today && issueDueDate <= weekEnd;
          break;
        }
        case 'this-month': {
          const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          matchesDueDate = !!issueDueDate && issueDueDate >= today && issueDueDate <= monthEnd;
          break;
        }
        case 'no-date':
          matchesDueDate = !issueDueDate;
          break;
      }
    }
    let matchesReportedDate = true;
    if (reportedDateCustomFilter) {
      const issueReportedDate = issue.reportedAt ? new Date(issue.reportedAt) : null;
      matchesReportedDate = matchesCustomDateRange(issueReportedDate, reportedDateCustomFilter, reportedDateCustomToFilter);
    } else if (reportedDateFilter) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const issueReportedDate = issue.reportedAt ? new Date(issue.reportedAt) : null;
      switch (reportedDateFilter) {
        case 'today':
          matchesReportedDate = !!issueReportedDate && issueReportedDate.toDateString() === todayStart.toDateString();
          break;
        case 'this-week': {
          const weekStart = new Date(todayStart);
          weekStart.setDate(todayStart.getDate() - 7);
          matchesReportedDate = !!issueReportedDate && issueReportedDate >= weekStart && issueReportedDate <= todayEnd;
          break;
        }
        case 'this-month': {
          const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
          matchesReportedDate = !!issueReportedDate && issueReportedDate >= monthStart && issueReportedDate <= todayEnd;
          break;
        }
      }
    }

    let matchesCompletedDate = true;
    if (completedDateCustomFilter) {
      const issueCompletedDate = issue.resolvedAt ? new Date(issue.resolvedAt) : null;
      matchesCompletedDate = matchesCustomDateRange(issueCompletedDate, completedDateCustomFilter, completedDateCustomToFilter);
    } else if (completedDateFilter) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const issueCompletedDate = issue.resolvedAt ? new Date(issue.resolvedAt) : null;
      switch (completedDateFilter) {
        case 'today':
          matchesCompletedDate = !!issueCompletedDate && issueCompletedDate.toDateString() === todayStart.toDateString();
          break;
        case 'this-week': {
          const weekStart = new Date(todayStart);
          weekStart.setDate(todayStart.getDate() - 7);
          matchesCompletedDate = !!issueCompletedDate && issueCompletedDate >= weekStart && issueCompletedDate <= todayEnd;
          break;
        }
        case 'this-month': {
          const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
          matchesCompletedDate = !!issueCompletedDate && issueCompletedDate >= monthStart && issueCompletedDate <= todayEnd;
          break;
        }
      }
    }

    return matchesSearch && matchesSeverity && matchesStatus && matchesAssignee && matchesAssignedBy && matchesUpdatedBy && matchesTags && matchesDueDate && matchesReportedDate && matchesCompletedDate;
  });

  // Sort by severity (critical first), then by date
  const sortedIssues = [...filteredIssues].sort((a, b) => {
    const severityOrder = { critical: 0, major: 1, minor: 2, trivial: 3 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
  });

  const totalPages = Math.max(1, Math.ceil(sortedIssues.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    severityFilter,
    statusFilter,
    assigneeFilter,
    assignedByFilter,
    updatedByFilter,
    tagsFilter,
    dueDateFilter,
    dueDateCustomFilter,
    reportedDateFilter,
    reportedDateCustomFilter,
    completedDateFilter,
    completedDateCustomFilter,
    pageSize,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedIssues = viewMode === 'kanban'
    ? sortedIssues
    : sortedIssues.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | 'ellipsis')[] = [1];
    if (currentPage > 3) pages.push('ellipsis');
    for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) {
      pages.push(p);
    }
    if (currentPage < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  };

  const handleIssueClick = (issue: Issue) => {
    setSelectedIssue(issue);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const handleCreateIssue = (initialStatus: IssueStatus = 'open') => {
    const newId = `issue-${Date.now()}`;
    // Assuming routeProjectId is available since we are inside ProjectDetail
    const pid = routeProjectId || (issues.length > 0 ? issues[0].projectId : 'p-1'); // Fallback if no issues

    const newIssueStub: Issue = {
      id: newId,
      title: '',
      description: '',
      status: initialStatus,
      severity: 'minor',
      category: 'defect' as IssueCategory,
      projectId: pid, // Ensure projectId is set
      reportedBy: { id: user?.id ?? 'currentUser', name: user?.name ?? 'Current User', initials: user?.initials ?? user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() ?? 'CU', avatar: user?.avatarUrl ?? '', email: user?.email ?? '', role: 'Member' },
      reportedAt: new Date().toISOString(), // Add reportedAt
      dueDate: undefined,
      assignees: [],
      tags: [],
      attachments: [],
      comments: [],
      checklist: [],
      descriptionBlocks: [],
      blocksTaskIds: [],
      blocksMilestoneIds: [],
      blockedBy: [],
      // Add other required fields if any, defaulting to empty or safe values
      updatedAt: new Date().toISOString(),
    } as Issue; // Cast to Issue since we might be missing some optional fields but trying to fit checks

    setNewIssueDraft(newIssueStub);
    setModalMode('create');
    setIsModalOpen(true);
  };

  // Handle external add dialog trigger
  // We use a ref to track previous value so we can detect rising edge (false->true)
  // This ensures re-clicking "Report Issue" always opens the modal even if the prop was already true
  useEffect(() => {
    if (externalIsAddDialogOpen) {
      handleCreateIssue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalIsAddDialogOpen]);

  const handleIssueUpdateFromModal = (updatedIssue: Issue) => {
    if (modalMode === 'create') {
      setNewIssueDraft(updatedIssue);
    } else {
      onIssueUpdate?.(updatedIssue);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    onAddDialogClose?.();
  };

  const handleCreateSubmit = (issueToCreate: Issue, pendingFiles?: File[]) => {
    onIssueCreate?.(issueToCreate, pendingFiles);
    setIsModalOpen(false);
    onAddDialogClose?.();
  };

  const hasIncompleteChecklistItems = (issue: Issue) =>
    (issue.checklist ?? []).some((item) => !item.completed);

  const handleStatusChange = (issue: Issue, status: IssueStatus) => {
    if (issue.status === status) return;

    if (status === 'resolved' && hasIncompleteChecklistItems(issue)) {
      toast.error('Complete all checklist items before resolving this issue');
      return;
    }

    const updatedIssue = {
      ...issue,
      status,
      updatedAt: new Date().toISOString(),
    };

    if (status === 'resolved') {
      playCompleteSound();
    }

    setLocalIssues(prev => prev.map(i => (i.id === issue.id ? updatedIssue : i)));
    onIssueUpdate?.(updatedIssue);
  };

  const isDependencyIssue = (issue: Issue) => {
    const blockingCount = (issue.blocksTaskIds?.length || 0) + (issue.blocksMilestoneIds?.length || 0);
    return (blockingCount > 0 || (issue.blockedBy?.length || 0) > 0)
      && issue.status !== 'resolved'
      && issue.status !== 'wont-fix';
  };

  const { containerRef: boardScrollRef, handleDragStart, handleDragEnd: handleAutoScrollDragEnd, getLastPointerPosition } = useKanbanEdgeAutoScroll();

  // Buckets past the visible width are easy to miss when filtering by status —
  // scroll the matching bucket into view so the filter's effect is visible
  // without having to manually scroll the board horizontally.
  const statusFilterKey = statusFilter.join(',');
  useEffect(() => {
    if (viewMode !== 'kanban' || isMobile || !statusFilter.length) return;
    const targetColumn = columns.find((column) => statusFilter.includes(column.status));
    if (!targetColumn) return;
    const columnEl = boardScrollRef.current?.querySelector<HTMLElement>(
      `[data-kanban-column-id="${targetColumn.id}"]`,
    );
    columnEl?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilterKey, viewMode, isMobile]);

  const dependencyIssuesCount = sortedIssues.filter(isDependencyIssue).length;

  // Hide the Dependencies bucket entirely until it has linked issues
  const visibleColumns = columns.filter(
    (column) => !(column.isSpecial && column.status === 'dependencies' && dependencyIssuesCount === 0),
  );

  // Mobile list view groups issues into the project's buckets, mirroring MobileTaskListView.
  const mobileStatusCounts = sortedIssues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.status] = (acc[issue.status] || 0) + 1;
    return acc;
  }, {});

  const MOBILE_OTHER_BUCKET = '__other__';
  const issueMatchesMobileBucket = (issue: Issue, bucketKey: string) =>
    bucketKey === MOBILE_OTHER_BUCKET
      ? !columns.some((column) => column.status === issue.status)
      : issue.status === bucketKey;

  const ungroupedMobileCount = sortedIssues.filter(
    (issue) => !columns.some((column) => column.status === issue.status),
  ).length;

  const mobileBuckets = [
    ...columns
      .filter((column) => column.status !== 'dependencies' && (mobileStatusCounts[column.status] || 0) > 0)
      .map((column) => ({
        key: column.status,
        label: column.label,
        color: column.color,
        count: mobileStatusCounts[column.status] || 0,
      })),
    ...(ungroupedMobileCount > 0
      ? [{ key: MOBILE_OTHER_BUCKET, label: 'Other', color: '#6b7280', count: ungroupedMobileCount }]
      : []),
  ];

  // A bucket can disappear while it's selected (last issue moved out) — fall back to All.
  const activeMobileStatus =
    selectedMobileStatus !== 'all' && !mobileBuckets.some((bucket) => bucket.key === selectedMobileStatus)
      ? 'all'
      : selectedMobileStatus;

  const mobileDisplayedIssues = activeMobileStatus === 'all'
    ? sortedIssues
    : sortedIssues.filter((issue) => issueMatchesMobileBucket(issue, activeMobileStatus));

  const mobileGroupedSections = mobileBuckets
    .map((bucket) => ({
      ...bucket,
      items: mobileDisplayedIssues.filter((issue) => issueMatchesMobileBucket(issue, bucket.key)),
    }))
    .filter((group) => group.items.length > 0);

  const handleDragEnd = (result: DropResult) => {
    const pointer = getLastPointerPosition();
    handleAutoScrollDragEnd();
    const { destination, source, type, draggableId } = result;
    if (!destination) return;

    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    if (type === 'COLUMN') {
      // source/destination indices refer to positions within visibleColumns (the
      // Dependencies bucket may be hidden), so translate them back into `columns`.
      const draggedColumn = visibleColumns[source.index];
      if (!draggedColumn) return;
      const sourceIndex = columns.findIndex((c) => c.id === draggedColumn.id);
      if (sourceIndex === -1) return;
      let destIndex = destination.index >= visibleColumns.length
        ? columns.length
        : columns.findIndex((c) => c.id === visibleColumns[destination.index].id);

      const newColumns = Array.from(columns);
      const [removed] = newColumns.splice(sourceIndex, 1);
      if (destIndex > sourceIndex) destIndex -= 1;
      newColumns.splice(destIndex, 0, removed);
      setColumns(newColumns);
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const persistableIds = newColumns.filter(col => UUID_RE.test(col.id)).map(col => col.id);
      if (persistableIds.length > 0) reorderIssueColumns.mutate(persistableIds);
      return;
    }

    // Auto-scrolling the board mid-drag leaves @hello-pangea/dnd's cached
    // position for the card stale, so `destination.droppableId` can name a
    // column that's no longer under the pointer. Hit-test the real DOM
    // element at the pointer's last known position and prefer that.
    const hitColumnId = pointer
      ? resolveKanbanColumnIdAtPoint(pointer.x, pointer.y)
      : undefined;
    const destinationColumn = columns.find((col) => col.id === (hitColumnId ?? destination.droppableId));
    if (!destinationColumn) return;

    if (destinationColumn.isSpecial && destinationColumn.status === 'dependencies') {
      return;
    }

    const movedIssue = localIssues.find(issue => issue.id === draggableId);
    if (!movedIssue) return;

    const newStatus = destinationColumn.status;
    if (movedIssue.status === newStatus) return;

    if (newStatus === 'resolved' && hasIncompleteChecklistItems(movedIssue)) {
      toast.error('Complete all checklist items before resolving this issue');
      return;
    }

    setLocalIssues(prev => prev.map(i => i.id === movedIssue.id ? { ...i, status: newStatus as IssueStatus } : i));
    updateIssueStatus.mutate({ issueId: movedIssue.id, status: newStatus });
  };

  const getColumnIssues = (column: IssuesKanbanColumn) => {
    if (column.isSpecial && column.status === 'dependencies') {
      return sortedIssues.filter(isDependencyIssue);
    }
    return sortedIssues.filter(issue => issue.status === column.status && !isDependencyIssue(issue));
  };

  const handleToggleChecklistItemOnCard = (issueId: string, checklistItemId: string) => {
    const issue = localIssues.find((i) => i.id === issueId);
    if (!issue) return;
    const updatedChecklist = (issue.checklist || []).map((item) =>
      item.id === checklistItemId ? { ...item, completed: !item.completed } : item
    );
    const updatedIssue = { ...issue, checklist: updatedChecklist };
    setLocalIssues(localIssues.map((i) => (i.id === issueId ? updatedIssue : i)));
    onIssueUpdate?.(updatedIssue);
  };

  const issuesPaginationControls = sortedIssues.length > 0 && (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sortedIssues.length)} of {sortedIssues.length}
        </span>
        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 / page</SelectItem>
            <SelectItem value="25">25 / page</SelectItem>
            <SelectItem value="50">50 / page</SelectItem>
            <SelectItem value="100">100 / page</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {totalPages > 1 && (
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setCurrentPage((p) => Math.max(1, p - 1));
                }}
                className={cn(currentPage === 1 && 'pointer-events-none opacity-50')}
              />
            </PaginationItem>
            {getPageNumbers().map((page, idx) =>
              page === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${idx}`}>
                  <span className="flex h-9 w-9 items-center justify-center text-muted-foreground">…</span>
                </PaginationItem>
              ) : (
                <PaginationItem key={page}>
                  <PaginationLink
                    href="#"
                    isActive={page === currentPage}
                    onClick={(e) => {
                      e.preventDefault();
                      setCurrentPage(page);
                    }}
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setCurrentPage((p) => Math.min(totalPages, p + 1));
                }}
                className={cn(currentPage === totalPages && 'pointer-events-none opacity-50')}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {viewMode === 'kanban' && isIssueColumnsLoading && !apiIssueColumns ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Loading board…</p>
        </div>
      ) : viewMode === 'kanban' ? (
        <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <Droppable droppableId="board" type="COLUMN" direction={isMobile ? 'vertical' : 'horizontal'}>
            {(provided) => (
              <div
                ref={(node) => {
                  provided.innerRef(node);
                  boardScrollRef.current = node;
                }}
                {...provided.droppableProps}
                className={isMobile ? 'w-full' : 'w-full overflow-x-auto pb-4'}
              >
                <div
                  className={isMobile ? 'flex flex-col gap-3 w-full' : 'inline-flex gap-4 min-w-full pr-4 md:pr-6'}
                  style={isMobile ? undefined : { width: 'max-content' }}
                >
                  {visibleColumns.map((column, index) => {
                    const columnIssues = getColumnIssues(column);
                    const isDependenciesColumn = column.isSpecial && column.status === 'dependencies';

                    return (
                      <Draggable
                        key={column.id}
                        draggableId={column.id}
                        index={index}
                        isDragDisabled={isDependenciesColumn || !apiIssueColumns?.length}
                      >
                        {(columnProvided, columnSnapshot) => {
                          const addIssueButton = !isDependenciesColumn && (
                            <div className={isMobile ? '' : 'px-2'}>
                              <Button
                                variant="ghost"
                                className="w-full h-8 text-xs text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
                                onClick={() => handleCreateIssue(column.status as IssueStatus)}
                              >
                                + Add Issue
                              </Button>
                            </div>
                          );

                          const cardsDroppable = (
                            <Droppable
                              droppableId={column.id}
                              type="ISSUE"
                              isDropDisabled={isDependenciesColumn}
                            >
                              {(issuesProvided, snapshot) => (
                                <div
                                  ref={issuesProvided.innerRef}
                                  {...issuesProvided.droppableProps}
                                  data-kanban-column-id={column.id}
                                  className={cn(
                                    'space-y-2 min-h-[120px] p-2 rounded-lg transition-colors flex-1 overflow-y-auto',
                                    snapshot.isDraggingOver ? 'bg-muted/50' : 'bg-muted/30'
                                  )}
                                >
                                  {columnIssues.length === 0 ? (
                                    <p className="text-xs text-muted-foreground p-1">
                                      {isDependenciesColumn ? 'No dependency-linked issues' : 'No issues'}
                                    </p>
                                  ) : (
                                    columnIssues.map((issue, issueIndex) => {
                                      const SeverityIcon = ISSUE_SEVERITY_DISPLAY[issue.severity].icon;
                                      const linkedCount = (issue.blocksTaskIds?.length || 0)
                                        + (issue.blocksMilestoneIds?.length || 0)
                                        + (issue.blockedBy?.length || 0);

                                      return (
                                        <Draggable key={issue.id} draggableId={issue.id} index={issueIndex}>
                                          {(issueProvided, issueSnapshot) => (
                                            <Card
                                              ref={issueProvided.innerRef}
                                              {...issueProvided.draggableProps}
                                              {...issueProvided.dragHandleProps}
                                              className={cn(
                                                'p-3 cursor-grab active:cursor-grabbing border-l-4 relative group hover:shadow-md transition-shadow',
                                                issueSeverityBorder[issue.severity],
                                                issueSnapshot.isDragging && 'shadow-lg rotate-2'
                                              )}
                                              onClick={() => handleIssueClick(issue)}
                                            >
                                              <div className="space-y-2">
                                                <div className="flex items-start justify-between gap-2">
                                                  <div className="flex items-start gap-2 min-w-0 flex-1">
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleStatusChange(issue, issue.status === 'resolved' ? 'open' : 'resolved');
                                                      }}
                                                      className={cn(
                                                        'shrink-0 mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center transition-all',
                                                        issue.status === 'resolved'
                                                          ? 'bg-status-done/20 border-status-done'
                                                          : 'border-foreground/30 hover:border-foreground hover:bg-muted bg-background'
                                                      )}
                                                      aria-label="Mark as resolved"
                                                    >
                                                      {issue.status === 'resolved' && <Check className="h-2.5 w-2.5 text-status-done" />}
                                                    </button>
                                                    <div className="min-w-0">
                                                      {getDisplayId(projectCode, 'I', issue.number) && (
                                                        <span className="font-mono font-semibold text-[10px] text-blue-500 block">
                                                          {getDisplayId(projectCode, 'I', issue.number)}
                                                        </span>
                                                      )}
                                                      <p className="text-sm font-medium line-clamp-2">{issue.title}</p>
                                                    </div>
                                                  </div>
                                                  <div className="text-muted-foreground hover:text-foreground mt-0.5">
                                                    <GripVertical className="h-4 w-4" />
                                                  </div>
                                                </div>

                                                {issue.description && (
                                                  <p className="text-xs text-muted-foreground line-clamp-2">{issue.description}</p>
                                                )}

                                                {(() => {
                                                  const boardChecklistItems = (issue.checklist || []).filter(
                                                    (item) => item.showInBoardView === true
                                                  );
                                                  if (boardChecklistItems.length === 0) return null;
                                                  const isExpanded = expandedChecklistPreview[issue.id] === true;
                                                  const visibleItems = isExpanded
                                                    ? boardChecklistItems
                                                    : boardChecklistItems.slice(0, BOARD_CHECKLIST_PREVIEW_COUNT);
                                                  const hasMore = boardChecklistItems.length > BOARD_CHECKLIST_PREVIEW_COUNT;
                                                  return (
                                                    <div className="space-y-1.5 pt-1">
                                                      {visibleItems.map((item) => (
                                                        <div key={item.id} className="flex items-center gap-2">
                                                          <Checkbox
                                                            checked={item.completed}
                                                            onCheckedChange={(checked) => {
                                                              if (checked === 'indeterminate') return;
                                                              handleToggleChecklistItemOnCard(issue.id, item.id);
                                                            }}
                                                            className="h-3.5 w-3.5 rounded-[3px]"
                                                            onClick={(event) => event.stopPropagation()}
                                                          />
                                                          <button
                                                            type="button"
                                                            onClick={(event) => {
                                                              event.stopPropagation();
                                                              handleToggleChecklistItemOnCard(issue.id, item.id);
                                                            }}
                                                            className={cn(
                                                              'min-w-0 flex-1 text-left text-[11px] text-muted-foreground truncate',
                                                              item.completed && 'line-through'
                                                            )}
                                                          >
                                                            {item.text}
                                                          </button>
                                                        </div>
                                                      ))}
                                                      {hasMore && (
                                                        <button
                                                          type="button"
                                                          className="text-[11px] text-primary hover:underline"
                                                          onClick={(event) => {
                                                            event.stopPropagation();
                                                            setExpandedChecklistPreview((prev) => ({
                                                              ...prev,
                                                              [issue.id]: !isExpanded,
                                                            }));
                                                          }}
                                                        >
                                                          {isExpanded ? 'View less' : `View more (${boardChecklistItems.length - BOARD_CHECKLIST_PREVIEW_COUNT})`}
                                                        </button>
                                                      )}
                                                    </div>
                                                  );
                                                })()}

                                                {/* <div className="flex items-center justify-between gap-2">
                                                    <Badge className={cn('gap-1', ISSUE_SEVERITY_DISPLAY[issue.severity].color)}>
                                                      <SeverityIcon className="h-3 w-3" />
                                                      {ISSUE_SEVERITY_DISPLAY[issue.severity].label}
                                                    </Badge>
                                                    {linkedCount > 0 ? (
                                                      <span className="text-xs text-destructive flex items-center gap-1">
                                                        <Link2 className="h-3 w-3" />
                                                        {linkedCount}
                                                      </span>
                                                    ) : (
                                                      <Badge variant="outline" className={cn(getStatusBadge(issue.status).color)}>
                                                        {getStatusBadge(issue.status).label}
                                                      </Badge>
                                                    )}
                                                  </div> */}

                                                <div className="flex items-center justify-between pt-1">
                                                  <div className="flex -space-x-2">
                                                    {(issue.assignees || []).slice(0, 3).map((assignee) => (
                                                      <Avatar key={assignee.id} className="h-5 w-5 border-2 border-background">
                                                        <AvatarImage src={resolveFileUrl(assignee.avatar) ?? assignee.avatar} alt={assignee.name} />
                                                        <AvatarFallback className="text-[9px] bg-muted">{assignee.initials}</AvatarFallback>
                                                      </Avatar>
                                                    ))}
                                                    {(issue.assignees || []).length > 3 && (
                                                      <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center border-2 border-background z-10">
                                                        <span className="text-[8px] text-muted-foreground font-medium">+{(issue.assignees || []).length - 3}</span>
                                                      </div>
                                                    )}
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    <AttachmentBadges
                                                      attachmentCounts={issue.attachmentCounts}
                                                      videoLinksCount={issue.videoLinks?.length ?? 0}
                                                      className="text-[10px]"
                                                    />
                                                    {issue.dueDate && (
                                                      <span className="text-[10px] text-muted-foreground">
                                                        {new Date(issue.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            </Card>
                                          )}
                                        </Draggable>
                                      );
                                    })
                                  )}
                                  {issuesProvided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          );

                          if (isMobile) {
                            return (
                              <div ref={columnProvided.innerRef} {...columnProvided.draggableProps} className="w-full">
                                <MobileKanbanColumn
                                  label={column.label}
                                  count={columnIssues.length}
                                  countLabel="issues"
                                  dot={isDependenciesColumn ? (
                                    <Link2 className="h-4 w-4 text-status-blocked shrink-0" />
                                  ) : (
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: column.color }} />
                                  )}
                                  labelClassName={isDependenciesColumn ? 'text-status-blocked' : undefined}
                                  dragHandleProps={
                                    isDependenciesColumn || !apiIssueColumns?.length ? null : columnProvided.dragHandleProps
                                  }
                                  isDragging={columnSnapshot.isDragging}
                                >
                                  <div className="space-y-3">
                                    {addIssueButton}
                                    {cardsDroppable}
                                  </div>
                                </MobileKanbanColumn>
                              </div>
                            );
                          }

                          return (
                            <div
                              ref={columnProvided.innerRef}
                              {...columnProvided.draggableProps}
                              className={cn(
                                'w-[280px] flex-shrink-0 flex flex-col transition-shadow max-h-[calc(100vh-220px)]',
                                columnSnapshot.isDragging && 'shadow-lg'
                              )}
                            >
                              <div className="flex-shrink-0 bg-background pb-3 space-y-3">
                                <div className="flex items-center gap-2 px-1">
                                  {!isDependenciesColumn && (
                                    <div {...columnProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  )}
                                  {isDependenciesColumn && <div {...columnProvided.dragHandleProps} />}
                                  {isDependenciesColumn ? (
                                    <Link2 className="h-4 w-4 text-status-blocked" />
                                  ) : (
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: column.color }} />
                                  )}
                                  <h3
                                    title={column.label}
                                    className={cn('font-medium text-sm truncate', isDependenciesColumn && 'text-status-blocked')}
                                  >
                                    {column.label}
                                  </h3>
                                  <span className="text-xs text-muted-foreground">{columnIssues.length}</span>
                                  {!column.isSpecial && !isDependenciesColumn && (
                                    <div className="ml-auto">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <MoreHorizontal className="h-3.5 w-3.5" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem
                                            className="gap-2"
                                            onClick={() => handleStartRenameColumn(column)}
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                            Rename Bucket
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            className="text-destructive focus:text-destructive gap-2"
                                            onClick={() => handleRemoveColumn(column.id)}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                            Delete Bucket
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  )}
                                </div>

                                {addIssueButton}
                              </div>

                              {cardsDroppable}
                            </div>
                          );
                        }}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}

                  {/* Add Bucket */}
                  <div className={isMobile ? 'w-full' : 'w-[280px] flex-shrink-0'}>
                    <div className={isMobile ? 'pb-1' : 'bg-background pb-3 space-y-3'}>
                      {!isMobile && (
                        <div className="flex items-center gap-2 px-1">
                          <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                          <h3 className="font-medium text-sm text-muted-foreground">Add Bucket</h3>
                        </div>
                      )}
                      <div className="px-2">
                        <Button
                          variant="ghost"
                          className="w-full h-8 text-xs text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
                          onClick={() => setIsAddColumnOpen(true)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add New Bucket
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : isMobile ? (
        <div className="space-y-4">
          {/* Bucket filter pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setSelectedMobileStatus('all')}
              className={cn(
                'shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors',
                activeMobileStatus === 'all'
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-foreground border-border'
              )}
            >
              All
              <span className={cn('text-xs', activeMobileStatus === 'all' ? 'opacity-70' : 'text-muted-foreground')}>
                {sortedIssues.length}
              </span>
            </button>
            {mobileBuckets.map((bucket) => (
              <button
                key={bucket.key}
                type="button"
                onClick={() => setSelectedMobileStatus(bucket.key)}
                className={cn(
                  'shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors',
                  activeMobileStatus === bucket.key
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-foreground border-border'
                )}
              >
                {bucket.label}
                <span className={cn('text-xs', activeMobileStatus === bucket.key ? 'opacity-70' : 'text-muted-foreground')}>
                  {bucket.count}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIsAddColumnOpen(true)}
              aria-label="Add New Bucket"
              className="shrink-0 flex items-center justify-center h-8 w-8 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground active:bg-muted transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {mobileGroupedSections.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              No issues found
            </div>
          ) : (
            <div className="space-y-5">
              {mobileGroupedSections.map((group) => (
                <div key={group.key} className="space-y-3">
                  <div className="flex items-center gap-2 px-0.5">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                    <h3 className="text-sm font-semibold">{group.label}</h3>
                    <span className="text-xs text-muted-foreground">{group.items.length}</span>
                  </div>

                  <div className="space-y-3">
                    {group.items.map((issue) => {
                      const severityDisplay = ISSUE_SEVERITY_DISPLAY[issue.severity];
                      const SeverityIcon = severityDisplay.icon;
                      const CategoryIcon = categoryConfig[issue.category].icon;
                      const statusBadge = getStatusBadge(issue.status);
                      const primaryAssignee = issue.assignees?.[0] ?? issue.reportedBy;

                      return (
                        <Card
                          key={issue.id}
                          onClick={() => handleIssueClick(issue)}
                          className="p-4 rounded-2xl cursor-pointer active:bg-muted/40 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge className={cn('gap-1 shrink-0', severityDisplay.color)}>
                              <SeverityIcon className="h-3 w-3" />
                              {severityDisplay.label}
                            </Badge>
                            <Badge variant="outline" className={cn('shrink-0', statusBadge.color)}>
                              {statusBadge.label}
                            </Badge>
                          </div>

                          {getDisplayId(projectCode, 'I', issue.number) && (
                            <span className="font-mono font-semibold text-[11px] text-blue-500 block mt-2.5">
                              {getDisplayId(projectCode, 'I', issue.number)}
                            </span>
                          )}
                          <h4 className={cn('font-semibold text-[15px] leading-snug', !getDisplayId(projectCode, 'I', issue.number) && 'mt-2.5')}>{issue.title}</h4>

                          {issue.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{issue.description}</p>
                          )}

                          <Separator className="my-3" />

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar className="h-6 w-6 shrink-0">
                                <AvatarImage src={resolveFileUrl(primaryAssignee.avatar) ?? primaryAssignee.avatar} alt={primaryAssignee.name} />
                                <AvatarFallback className="text-[10px] bg-muted">{primaryAssignee.initials}</AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-muted-foreground truncate min-w-0">{primaryAssignee.name}</span>
                              <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                                <CategoryIcon className="h-3.5 w-3.5" />
                                {getCategoryLabel(issue)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <AttachmentBadges
                                attachmentCounts={issue.attachmentCounts}
                                videoLinksCount={issue.videoLinks?.length ?? 0}
                                className="text-xs"
                                iconClassName="h-3.5 w-3.5"
                              />
                              <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                                <Calendar className="h-3.5 w-3.5" />
                                {new Date(issue.reportedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div ref={tableScrollRef} className="overflow-x-auto">
            <Table containerClassName="relative w-full">
              <TableHeader className="bg-muted/40 border-b border-border">
                <TableRow className="bg-background hover:bg-background">
                  <TableHead className="w-[80px] bg-background font-semibold text-foreground">Priority</TableHead>
                  <TableHead className="w-[300px] bg-background font-semibold text-foreground">Issue</TableHead>
                  <TableHead className="bg-background font-semibold text-foreground">Category</TableHead>
                  <TableHead className="bg-background font-semibold text-foreground">Status</TableHead>
                  <TableHead className="bg-background font-semibold text-foreground">Blocking</TableHead>
                  <TableHead className="bg-background font-semibold text-foreground">Assigned</TableHead>
                  <TableHead className="bg-background font-semibold text-foreground">Reported</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedIssues.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No issues found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedIssues.map((issue) => {
                    const SeverityIcon = ISSUE_SEVERITY_DISPLAY[issue.severity].icon;
                    const CategoryIcon = categoryConfig[issue.category].icon;
                    const blockingCount = (issue.blocksTaskIds?.length || 0) + (issue.blocksMilestoneIds?.length || 0);

                    return (
                      <TableRow
                        key={issue.id}
                        className="cursor-pointer hover:bg-muted/50 h-[72px]"
                        onClick={() => handleIssueClick(issue)}
                      >
                        <TableCell className="align-middle">
                          <Badge className={cn('gap-1', ISSUE_SEVERITY_DISPLAY[issue.severity].color)}>
                            <SeverityIcon className="h-3 w-3" />
                            {ISSUE_SEVERITY_DISPLAY[issue.severity].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-middle">
                          <div className="flex items-start gap-2">
                            {issue.status === 'resolved' && (
                              <div className="h-4 w-4 rounded-full bg-status-done/20 flex items-center justify-center shrink-0 mt-0.5">
                                <Check className="h-3 w-3 text-status-done" />
                              </div>
                            )}
                            <div className="min-w-0">
                              {getDisplayId(projectCode, 'I', issue.number) && (
                                <span className="font-mono font-semibold text-[11px] text-blue-500 block">
                                  {getDisplayId(projectCode, 'I', issue.number)}
                                </span>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="font-medium line-clamp-2 cursor-pointer">{issue.title}</p>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  {issue.title}
                                </TooltipContent>
                              </Tooltip>
                              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                {issue.description}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <CategoryIcon className="h-4 w-4" />
                            {getCategoryLabel(issue)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(getStatusBadge(issue.status).color)}>
                            {getStatusBadge(issue.status).label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {blockingCount > 0 ? (
                            <div className="flex items-center gap-1 text-sm text-destructive">
                              <Link2 className="h-3 w-3" />
                              {blockingCount} item{blockingCount > 1 ? 's' : ''}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {issue.assignees && issue.assignees.length > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2 w-fit cursor-default">
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={resolveFileUrl(issue.assignees[0].avatar) ?? issue.assignees[0].avatar} alt={issue.assignees[0].name} />
                                    <AvatarFallback className="text-[10px]">
                                      {issue.assignees[0].initials}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm">
                                    {issue.assignees[0].name}
                                    {issue.assignees.length > 1 && ` +${issue.assignees.length - 1}`}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {issue.assignees.map((a) => a.name).join(', ')}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground text-sm">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {new Date(issue.reportedAt).toLocaleDateString()}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {viewMode !== 'kanban' && !isMobile && issuesPaginationControls}

      {/* Add Bucket Dialog — shared by the desktop board and the mobile bucket pills */}
      <Dialog open={isAddColumnOpen} onOpenChange={setIsAddColumnOpen}>
        <DialogContent className="w-[calc(100%-2rem)] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add New Bucket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Bucket Name</Label>
              <Input
                placeholder="e.g., In Review"
                value={newColumnName}
                maxLength={30}
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <ColorSwatchPicker
                value={newColumnColor}
                onChange={setNewColumnColor}
              />
            </div>
            <Button
              onClick={handleAddColumn}
              disabled={!newColumnName.trim() || createIssueColumn.isPending}
              className="w-full"
            >
              Add Bucket
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Bucket Dialog */}
      <Dialog
        open={!!renamingColumn}
        onOpenChange={(open) => {
          if (!open) {
            setRenamingColumn(null);
            setRenameColumnName('');
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Rename Bucket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Bucket Name</Label>
              <Input
                placeholder="e.g., In Review"
                value={renameColumnName}
                maxLength={30}
                onChange={(e) => setRenameColumnName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmRenameColumn()}
                autoFocus
              />
            </div>
            <Button
              onClick={handleConfirmRenameColumn}
              disabled={!renameColumnName.trim() || updateIssueColumn.isPending}
              className="w-full"
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Issue Detail Modal */}
      <IssueDetailModal
        issue={modalMode === 'create' ? newIssueDraft : selectedIssue}
        tasks={tasks}
        teamMembers={teamMembers}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onUpdate={handleIssueUpdateFromModal}
        onDelete={onIssueDelete}
        userProjectRole={userProjectRole}
        mode={modalMode}
        onCreate={handleCreateSubmit}
        projectCode={projectCode}
      />
    </div>
  );
}
