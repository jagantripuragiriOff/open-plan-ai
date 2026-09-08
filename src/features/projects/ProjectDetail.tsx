import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { Flag, AlertTriangle, Users, Calendar, Search, X, Plus, Filter, User, Clock, LayoutGrid, List, Loader2, MessageCircle, Trash2, Upload, Download, Tag, ChevronDown, FolderOpen } from 'lucide-react';
import { BOMView } from './components/BOMView';
import RequirementsView from './components/RequirementsView';
import { ECOView } from './components/ECOView';
import { GateView } from './components/GateView';
import { RiskView } from './components/RiskView';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';

import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { TasksSection, ViewControls } from './components/TasksSection';
import { ImportTasksDialog } from '../task-import/ImportTasksDialog';
import { ImportIssuesDialog } from '../issue-import/ImportIssuesDialog';
import { ModulesSection, ModuleViewControls } from './components/ModulesSection';
import { MilestonesView } from './components/MilestonesView';
import { IssuesView } from './components/IssuesView';
import { SupportLinksSheet } from './components/SupportLinksSheet';
import { useFeatureTogglesStore } from '@/stores/useFeatureTogglesStore';
import { ProjectDetailSkeleton } from './components/ProjectDetailSkeleton';
import { ProjectProgressPopover } from './components/ProjectProgressPopover';
import { AddModuleDialog } from './components/AddModuleDialog';
import { TaskDetailModal } from './components/TaskDetailModal';
import { ModuleDetailModal } from './components/ModuleDetailModal';
import { MilestoneDetailModal } from './components/MilestoneDetailModal';
import { IssueDetailModal } from './components/IssueDetailModal';
import { TaskFiltersDropdown } from './components/TaskFiltersDropdown';
import { ProjectTeamButton } from './components/ProjectTeamButton';
import { resolveProjectTabConfig, visibleOrderedTabDefinitions } from './projectTabsConfig';
import { MultiSelect } from '@/components/ui/multi-select';
import { useProjectDetail, useProjectModules } from '@/hooks/useProjectDetail';
import { useProjectRealtime } from '@/hooks/useProjectRealtime';
import { useOrganizationMembers, useProjectMembers } from '@/hooks/useProjectTeam';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { useProjectTaskColumns } from '@/hooks/useProjectTaskColumns';
import { useProjectTags } from '@/hooks/useProjectTags';
import { buildTaskStatusOptions } from './utils/taskStatusOptions';
import { useIssueColumns } from '@/hooks/useIssueColumns';
import { DEFAULT_ISSUE_COLUMNS, type ProjectIssueColumn } from '@/services/issueColumns.service';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUpdateProjectProgress } from '@/hooks/useProjects';
import {
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useCreateIssue,
  useUpdateIssue,
  useDeleteIssue,
  useCreateMilestone,
  useUpdateMilestone,
  useToggleMilestoneComplete,
  useDeleteMilestone,
  useCreateModule,
  useUpdateModule,
  useDeleteModule,
  useBatchUpdateTasks,
  useBatchUpdateModules,
} from '@/hooks/useProjectMutations';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { projectMembersService } from '@/services/projectMembers.service';
import { attachmentsService } from '@/services/attachments.service';
import { commentsService } from '@/services/comments.service';
import { chatService } from '@/services/chat.service';
import { ProjectChatPanel } from './components/ProjectChatPanel';
import { toast } from 'sonner';
import { calculateProjectProgress, getModuleTasks, getModuleProgress } from './utils/projectUtils';
import { ProjectSection, ProjectTabId, Module, TaskViewMode, TaskFilter, ModuleViewMode, Issue, Milestone, Task, IssueStatus, IssueSeverity, TeamMember, ProjectRole } from '@/types';
import { logger } from '@/services/monitoring/logger';
import { format } from 'date-fns';
import { resolveFileUrl } from '@/utils/fileUrl';

// Issue Filter interface
interface IssueFilter {
  status?: string[]; // status keys from the project's issue buckets (custom, not a fixed enum)
  severity?: IssueSeverity[];
  assigneeId?: string[];
  assignedById?: string[];
  updatedById?: string[];
  dueDate?: 'overdue' | 'today' | 'this-week' | 'this-month' | 'no-date';
  dueDateCustom?: string; // start of a custom range (yyyy-MM-dd) picked from the calendar, overrides dueDate preset
  dueDateCustomTo?: string; // end of the custom range (yyyy-MM-dd), inclusive; same as dueDateCustom for a single-day pick
  reportedDate?: 'today' | 'this-week' | 'this-month';
  reportedDateCustom?: string; // start of a custom range (yyyy-MM-dd) picked from the calendar, overrides reportedDate preset
  reportedDateCustomTo?: string; // end of the custom range (yyyy-MM-dd), inclusive; same as reportedDateCustom for a single-day pick
  completedDate?: 'today' | 'this-week' | 'this-month';
  completedDateCustom?: string; // start of a custom range (yyyy-MM-dd) picked from the calendar, overrides completedDate preset
  completedDateCustomTo?: string; // end of the custom range (yyyy-MM-dd), inclusive; same as completedDateCustom for a single-day pick
  tags?: string[];
}



const DEFAULT_MEMBER_REMOVAL_PROMPT: {
  open: boolean;
  memberId: string | null;
  memberName: string;
} = {
  open: false,
  memberId: null,
  memberName: '',
};

/** Normalizes a loosely-typed TeamMember.role (or missing role) to a ProjectRole. */
const toProjectRole = (role: string | undefined | null): ProjectRole => {
  const normalized = (role || '').toLowerCase();
  if (normalized === 'admin' || normalized === 'maintainer') return normalized;
  return 'member';
};

// Milestone View Controls Component — only the toggle (search is in parent)
function MilestoneViewControls({
  viewMode,
  onViewModeChange,
}: {
  viewMode: 'list' | 'kanban';
  onViewModeChange: (mode: 'list' | 'kanban') => void;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-muted/50 p-1 rounded-lg shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onViewModeChange('kanban')}
            aria-label="Kanban view"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Kanban View</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onViewModeChange('list')}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">List View</TooltipContent>
      </Tooltip>
    </div>
  );
}

const BASE_DATE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'this-week', label: 'This Week' },
  { value: 'this-month', label: 'This Month' },
];

// Issue View Controls Component — view toggle + filter only (search is in parent)
function DateFilterSelect({
  label,
  preset,
  custom,
  customTo,
  extraOptions = [],
  onChange,
}: {
  label: string;
  preset?: string;
  custom?: string; // start of a custom range (yyyy-MM-dd); same as customTo for a single-day pick
  customTo?: string; // end of a custom range (yyyy-MM-dd), inclusive
  extraOptions?: { value: string; label: string }[];
  onChange: (value: { preset?: string; custom?: string; customTo?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Draft range while the calendar is open — only committed to the actual
  // filter (via onChange) once the user hits Apply, so a single click (which
  // react-day-picker's range mode reports as from===to) doesn't immediately
  // close the dialog before a second date can be picked.
  const [draftRange, setDraftRange] = useState<{ from?: Date; to?: Date }>({});
  const allOptions = [...extraOptions, ...BASE_DATE_OPTIONS];
  const isRange = !!custom && !!customTo && custom !== customTo;
  const displayLabel = custom
    ? (isRange ? `${format(new Date(custom), 'PP')} – ${format(new Date(customTo!), 'PP')}` : format(new Date(custom), 'PPP'))
    : (allOptions.find((o) => o.value === preset)?.label ?? 'Any Date');

  const openCalendar = () => {
    setOpen(false);
    setDraftRange({
      from: custom ? new Date(custom) : undefined,
      to: customTo ? new Date(customTo) : undefined,
    });
    setCalendarOpen(true);
  };

  const applyRange = () => {
    if (!draftRange.from) return;
    const from = format(draftRange.from, 'yyyy-MM-dd');
    const to = format(draftRange.to ?? draftRange.from, 'yyyy-MM-dd');
    onChange({ preset: undefined, custom: from, customTo: to });
    setCalendarOpen(false);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-8 w-full justify-between font-normal"
          >
            <span className="truncate">{displayLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1" align="end" sideOffset={4}>
          <div className="flex flex-col">
            <button
              type="button"
              className="w-full text-left px-2.5 py-1.5 text-sm rounded-sm hover:bg-accent"
              onClick={() => { onChange({ preset: undefined, custom: undefined, customTo: undefined }); setOpen(false); }}
            >
              Any Date
            </button>
            {allOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="w-full text-left px-2.5 py-1.5 text-sm rounded-sm hover:bg-accent"
                onClick={() => { onChange({ preset: opt.value, custom: undefined, customTo: undefined }); setOpen(false); }}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              className="w-full text-left px-2.5 py-1.5 text-sm rounded-sm hover:bg-accent"
              onClick={openCalendar}
            >
              Custom...
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent
          className="w-auto max-w-fit p-4"
          onPointerDownOutside={() => { }}
          onInteractOutside={() => { }}
        >
          <DialogHeader>
            <DialogTitle className="text-sm">{label}</DialogTitle>
          </DialogHeader>
          <CalendarPicker
            mode="range"
            selected={draftRange}
            onSelect={(range) => setDraftRange(range ?? {})}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs whitespace-nowrap">
              <span>
                <span className="text-muted-foreground">From </span>
                <span className="font-medium">{draftRange.from ? format(draftRange.from, 'PP') : '—'}</span>
              </span>
              <span>
                <span className="text-muted-foreground">To </span>
                <span className="font-medium">
                  {draftRange.to ? format(draftRange.to, 'PP') : (draftRange.from ? format(draftRange.from, 'PP') : '—')}
                </span>
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-xs shrink-0"
              disabled={!draftRange.from}
              onClick={applyRange}
            >
              Apply
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {custom && (
        <div className="flex items-center justify-between pl-1">
          <span className="text-xs text-muted-foreground">{displayLabel}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-xs"
            onClick={() => onChange({ preset: undefined, custom: undefined, customTo: undefined })}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}

function IssueViewControls({
  viewMode,
  onViewModeChange,
  filters,
  onFiltersChange,
  teamMembers,
  issueColumns,
  allTags,
  activeFilterCount,
  onClearFilters,
}: {
  viewMode: 'table' | 'kanban';
  onViewModeChange: (mode: 'table' | 'kanban') => void;
  filters: IssueFilter;
  onFiltersChange: (filters: IssueFilter) => void;
  teamMembers: TeamMember[];
  issueColumns: ProjectIssueColumn[];
  allTags: string[];
  activeFilterCount: number;
  onClearFilters: () => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const sortedTeamMembers = [...teamMembers].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="flex items-center gap-2">
      {/* View Toggle (kanban/table has no distinct mobile layout — hidden below md) */}
      <div className="hidden md:flex items-center gap-0.5 bg-muted/50 p-1 rounded-lg shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onViewModeChange('kanban')}
              aria-label="Kanban view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Kanban View</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onViewModeChange('table')}
              aria-label="Table view"
            >
              <List className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Table View</TooltipContent>
        </Tooltip>
      </div>

      {/* Filter Dropdown */}
      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 h-9 rounded-lg">
            <Filter className="h-4 w-4" />
            <span className="hidden md:inline">Filter</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 p-0 flex flex-col overflow-hidden max-h-[var(--radix-popover-content-available-height)]"
          align="end"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h4 className="font-medium text-sm">Filter Issues</h4>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onClearFilters();
                  setFilterOpen(false);
                }}
                className="h-6 px-2 text-xs"
              >
                Clear all
              </Button>
            )}
          </div>
          <div className="space-y-4 p-4 overflow-y-auto min-h-0">
            {/* Status Filter */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Status
              </Label>
              <MultiSelect
                options={issueColumns.map((column) => ({ value: column.status, label: column.label }))}
                selected={filters.status || []}
                onChange={(values) => onFiltersChange({ ...filters, status: values.length ? values : undefined })}
                placeholder="All Status"
              />
            </div>

            {/* Priority Filter */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <Flag className="h-3 w-3" />
                Priority
              </Label>
              <MultiSelect
                options={[
                  { value: 'critical', label: 'Critical' },
                  { value: 'major', label: 'Major' },
                  { value: 'minor', label: 'Minor' },
                  { value: 'trivial', label: 'Trivial' },
                ]}
                selected={filters.severity || []}
                onChange={(values) => onFiltersChange({ ...filters, severity: values.length ? (values as IssueSeverity[]) : undefined })}
                placeholder="All Priorities"
              />
            </div>

            {/* Due Date Filter */}
            <DateFilterSelect
              label="Due Date"
              preset={filters.dueDate}
              custom={filters.dueDateCustom}
              customTo={filters.dueDateCustomTo}
              extraOptions={[
                { value: 'overdue', label: 'Overdue' },
                { value: 'no-date', label: 'No Date' },
              ]}
              onChange={({ preset, custom, customTo }) => onFiltersChange({
                ...filters,
                dueDate: preset as IssueFilter['dueDate'],
                dueDateCustom: custom,
                dueDateCustomTo: customTo,
              })}
            />

            {/* Reported Date Filter */}
            <DateFilterSelect
              label="Reported Date"
              preset={filters.reportedDate}
              custom={filters.reportedDateCustom}
              customTo={filters.reportedDateCustomTo}
              onChange={({ preset, custom, customTo }) => onFiltersChange({
                ...filters,
                reportedDate: preset as IssueFilter['reportedDate'],
                reportedDateCustom: custom,
                reportedDateCustomTo: customTo,
              })}
            />

            {/* Completion Date Filter */}
            <DateFilterSelect
              label="Completion Date"
              preset={filters.completedDate}
              custom={filters.completedDateCustom}
              customTo={filters.completedDateCustomTo}
              onChange={({ preset, custom, customTo }) => onFiltersChange({
                ...filters,
                completedDate: preset as IssueFilter['completedDate'],
                completedDateCustom: custom,
                completedDateCustomTo: customTo,
              })}
            />

            {/* Assigned By Filter */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <User className="h-3 w-3" />
                Assigned By
              </Label>
              <MultiSelect
                options={sortedTeamMembers.map(member => ({ value: member.id, label: member.name }))}
                selected={filters.assignedById || []}
                onChange={(values) => onFiltersChange({ ...filters, assignedById: values.length ? values : undefined })}
                placeholder="All Members"
              />
            </div>

            {/* Assigned To Filter */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <User className="h-3 w-3" />
                Assigned To
              </Label>
              <MultiSelect
                options={[
                  { value: 'unassigned', label: 'Unassigned' },
                  ...sortedTeamMembers.map(member => ({ value: member.id, label: member.name }))
                ]}
                selected={filters.assigneeId || []}
                onChange={(values) => onFiltersChange({ ...filters, assigneeId: values.length ? values : undefined })}
                placeholder="All Assignees"
              />
            </div>

            {/* Tags Filter */}
            {allTags.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  Tags
                </Label>
                <MultiSelect
                  options={allTags.map((tag) => ({ value: tag, label: tag }))}
                  selected={filters.tags || []}
                  onChange={(values) => onFiltersChange({ ...filters, tags: values.length ? values : undefined })}
                  placeholder="All Tags"
                />
              </div>
            )}

            {/* Updated By Filter */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <User className="h-3 w-3" />
                Updated By
              </Label>
              <MultiSelect
                options={sortedTeamMembers.map(member => ({ value: member.id, label: member.name }))}
                selected={filters.updatedById || []}
                onChange={(values) => onFiltersChange({ ...filters, updatedById: values.length ? values : undefined })}
                placeholder="All Members"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function ProjectDetail() {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id, tab: tabParam, partId, reqKey, ecoId, taskId, moduleId, milestoneId, issueId } = useParams();
  const location = useLocation();
  // When a deep-linked entity modal (e.g. /issues/:issueId) is opened from an
  // external entry point like Notifications, the linker passes `backTo` in
  // location.state so closing the modal returns there instead of dropping the
  // user onto the project's default tab for that entity.
  const deepLinkBackTo = (location.state as { backTo?: string } | null)?.backTo;
  const isSupportFeatureEnabled = useFeatureTogglesStore((s) => s.enabled.support);
  // Requirements is both a project-configurable tab (Edit Project → Project
  // Tabs, tabConfig below) AND a per-user opt-in feature (Integrations page) —
  // it only shows when BOTH allow it, same "both must allow it" rule as any
  // other project tab a user has personally opted out of.
  const isRequirementsFeatureEnabled = useFeatureTogglesStore((s) => s.enabled.requirements);
  // Requirements' "New"/"Edit" editor isn't URL-driven (same reasoning as BOM's
  // "Add Part" sheet not having its own URL) — RequirementsView reports it up
  // via this callback so the tab-bar header can hide for it too, same as it
  // does for partId/ecoId/reqKey below.
  const [isRequirementsEditorOpen, setIsRequirementsEditorOpen] = useState(false);

  // The /bom/:partId, /requirements/:reqKey, /eng-changes/:ecoId, /tasks/:taskId,
  // /modules/:moduleId, /milestones/:milestoneId, and /issues/:issueId routes
  // encode the section as a literal path segment rather than the generic :tab
  // param, so infer it from which item id is present.
  const ALL_SECTIONS: ProjectSection[] = ['requirements', 'bom', 'eng-changes', 'tasks', 'modules', 'milestones', 'issues', 'gate-reviews', 'risk'];
  const section: ProjectSection = partId
    ? 'bom'
    : reqKey
      ? 'requirements'
      : ecoId
        ? 'eng-changes'
        : taskId
          ? 'tasks'
          : moduleId
            ? 'modules'
            : milestoneId
              ? 'milestones'
              : issueId
                ? 'issues'
                : ALL_SECTIONS.includes(tabParam as ProjectSection)
                  ? (tabParam as ProjectSection)
                  : 'requirements';

  // Board column definitions are only rendered on their own tab (Tasks status
  // filter / Issues status filter) — gating avoids fetching them on every tab
  // load (BOM, Modules, ECO, ...) when nothing on screen uses them yet.
  const { data: boardColumns } = useProjectTaskColumns(id, { enabled: section === 'tasks' });
  const filterStatusOptions = useMemo(() => buildTaskStatusOptions(boardColumns), [boardColumns]);
  const { data: apiIssueColumns } = useIssueColumns(id, { enabled: section === 'issues' });
  const issueColumns = apiIssueColumns && apiIssueColumns.length > 0 ? apiIssueColumns : DEFAULT_ISSUE_COLUMNS;

  const isMobile = useIsMobile();
  const [viewModeStr, setViewModeStr] = useState<TaskViewMode | null>(null);
  const [moduleViewModeStr, setModuleViewModeStr] = useState<ModuleViewMode | null>(null);
  const [issueViewModeStr, setIssueViewModeStr] = useState<'table' | 'kanban' | null>(null);
  const [bomAddOpen, setBomAddOpen] = useState(false);
  const [ecoNewOpen, setEcoNewOpen] = useState(false);
  const [milestoneViewModeStr, setMilestoneViewModeStr] = useState<'list' | 'kanban' | null>(null);

  // Height of the sticky tabs/search header block, so views below it (like the
  // Issues table) can stick their own header just underneath it instead of at top:0.
  // A callback ref (not useRef + useEffect([])) because this component early-returns
  // a skeleton while `isLoading` — the real header div doesn't exist yet on first
  // mount, so an effect with an empty dep array would observe `null` and never re-run
  // once the div actually appears.
  const [stickyHeaderEl, setStickyHeaderEl] = useState<HTMLDivElement | null>(null);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  useEffect(() => {
    const el = stickyHeaderEl;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      // Use the border-box height (not contentRect, which excludes the header's
      // bottom border) so the table header below sticks flush with no gap.
      const borderBoxSize = entries[0].borderBoxSize?.[0];
      setStickyHeaderHeight(borderBoxSize ? borderBoxSize.blockSize : entries[0].target.getBoundingClientRect().height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [stickyHeaderEl]);

  const viewMode = viewModeStr || (isMobile ? 'list' : 'kanban');
  const moduleViewMode = moduleViewModeStr || (isMobile ? 'list' : 'kanban');
  // Mobile has no kanban/table toggle — it always uses the grouped card list.
  const issueViewMode = isMobile ? 'table' : (issueViewModeStr || 'kanban');
  const milestoneViewMode = milestoneViewModeStr || (isMobile ? 'list' : 'kanban');

  const setViewMode = (val: TaskViewMode) => setViewModeStr(val);
  const setModuleViewMode = (val: ModuleViewMode) => setModuleViewModeStr(val);
  const setIssueViewMode = (val: 'table' | 'kanban') => setIssueViewModeStr(val);
  const setMilestoneViewMode = (val: 'list' | 'kanban') => setMilestoneViewModeStr(val);

  // Mobile-only: long-press a section tab to reveal its name below the icon.
  const [longPressedTab, setLongPressedTab] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (longPressHideTimerRef.current) clearTimeout(longPressHideTimerRef.current);
    };
  }, []);

  const handleTabLongPressStart = (value: string) => {
    if (!isMobile) return;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setLongPressedTab(value);
      if (longPressHideTimerRef.current) clearTimeout(longPressHideTimerRef.current);
      longPressHideTimerRef.current = setTimeout(() => setLongPressedTab(null), 1500);
    }, 500);
  };

  const handleTabLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const [filters, setFilters] = useState<TaskFilter>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleSearchQuery, setModuleSearchQuery] = useState('');
  // Mobile-only: the module detail full-page view supplies its own header/back
  // button, so the tab strip + search bar above it must hide while it's open.
  const [isMobileModuleDetailOpen, setIsMobileModuleDetailOpen] = useState(false);
  const [milestoneSearchQuery, setMilestoneSearchQuery] = useState('');
  const [issueSearchQuery, setIssueSearchQuery] = useState('');
  const [issueFilters, setIssueFilters] = useState<IssueFilter>({});
  const [isAddModuleDialogOpen, setIsAddModuleDialogOpen] = useState(false);
  const [isAddMilestoneDialogOpen, setIsAddMilestoneDialogOpen] = useState(false);
  const [isAddIssueDialogOpen, setIsAddIssueDialogOpen] = useState(false);
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [isImportTasksDialogOpen, setIsImportTasksDialogOpen] = useState(false);
  const [isImportIssuesDialogOpen, setIsImportIssuesDialogOpen] = useState(false);
  const [selectedMemberToAdd, setSelectedMemberToAdd] = useState('');
  const [selectedMemberRoleToAdd, setSelectedMemberRoleToAdd] = useState<ProjectRole>('member');
  const [isAddingProjectMember, setIsAddingProjectMember] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
  const [projectChatConversationId, setProjectChatConversationId] = useState<string | null>(null);
  const [memberRemovalPrompt, setMemberRemovalPrompt] = useState<{
    open: boolean;
    memberId: string | null;
    memberName: string;
  }>(DEFAULT_MEMBER_REMOVAL_PROMPT);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  const [memberRoleUpdatingId, setMemberRoleUpdatingId] = useState<string | null>(null);
  const isRemovingMemberRef = useRef(isRemovingMember);

  useEffect(() => {
    isRemovingMemberRef.current = isRemovingMember;
  }, [isRemovingMember]);

  // Fetch project data using React Query
  const { data: project, isLoading, error } = useProjectDetail(id);
  // Live-updates BOM/ECO/Issues caches from other users' actions, regardless
  // of which tab is currently mounted (see useProjectRealtime.ts).
  useProjectRealtime(id);
  const { data: projectModules = [] } = useProjectModules(id);
  const { data: organizationMembers = [] } = useOrganizationMembers(currentOrganization?.id);
  const { data: projectMembers = [] } = useProjectMembers(id);
  const {
    canManageMembers,
    isProjectMaintainerPlus,
    isProjectMemberPlus,
  } = useProjectPermissions(id);

  // Mutation hooks
  const createTaskMutation = useCreateTask(id || '');
  const updateTaskMutation = useUpdateTask(id || '');
  const deleteTaskMutation = useDeleteTask(id || '');
  const createIssueMutation = useCreateIssue(id || '');
  const updateIssueMutation = useUpdateIssue(id || '');
  const deleteIssueMutation = useDeleteIssue(id || '');
  const createMilestoneMutation = useCreateMilestone(id || '');
  const updateMilestoneMutation = useUpdateMilestone(id || '');
  const toggleMilestoneCompleteMutation = useToggleMilestoneComplete(id || '');
  const deleteMilestoneMutation = useDeleteMilestone(id || '');
  const createModuleMutation = useCreateModule(id || '');
  const updateModuleMutation = useUpdateModule(id || '');
  const deleteModuleMutation = useDeleteModule(id || '');
  const batchUpdateTasksMutation = useBatchUpdateTasks(id || '');
  const batchUpdateModulesMutation = useBatchUpdateModules(id || '');
  const updateProjectProgressMutation = useUpdateProjectProgress();

  // Project-configurable tab order/visibility (set in Edit Project). Falls back
  // to the default order with everything visible when the project has no saved config.
  const visibleTabs = useMemo(
    () => visibleOrderedTabDefinitions(resolveProjectTabConfig(project?.tabConfig))
      .filter((t) => t.id !== 'requirements' || isRequirementsFeatureEnabled),
    [project?.tabConfig, isRequirementsFeatureEnabled]
  );

  // If the current section's tab has been hidden by the project's tab config,
  // fall back to the first visible tab instead of rendering an unreachable section.
  useEffect(() => {
    if (!project || !tabParam || partId || reqKey || ecoId || taskId || moduleId || milestoneId || issueId) return;
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((t) => t.id === tabParam)) {
      navigate(`/projects/${id}/${visibleTabs[0].id}`, { replace: true });
    }
  }, [project, tabParam, partId, reqKey, ecoId, taskId, moduleId, milestoneId, issueId, visibleTabs, navigate, id]);

  // Calculate active filter count - moved before early returns
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status?.length) count++;
    if (filters.priority?.length) count++;
    if (filters.module?.length) count++;
    if (filters.assignee?.length) count++;
    if (filters.milestoneId) count++;
    if (filters.dueDate) count++;
    if (filters.tags?.length) count++;
    if (filters.hasBlockers) count++;
    return count;
  }, [filters]);

  // Get unique team members from tasks - moved before early returns
  const teamMembers = useMemo(() => {
    if (!project?.tasks) return [];
    const members = new Map<string, { id: string; name: string; initials: string }>();
    project.tasks.forEach(task => {
      task.assignees?.forEach(assignee => {
        members.set(assignee.id, {
          id: assignee.id,
          name: assignee.name,
          initials: assignee.initials,
        });
      });
    });
    return Array.from(members.values());
  }, [project?.tasks]);

  // Tag filter options come from the project-wide tag registry (same source
  // as the Create Task/Issue tag pickers) rather than scanning loaded
  // tasks/issues — otherwise a tag with no current usage, or one only used
  // on the other entity type, silently disappears from the filter list.
  const { data: projectTagsRegistry = [] } = useProjectTags(id);
  const allProjectTagNames = useMemo(
    () => projectTagsRegistry.map((t) => t.name).sort((a, b) => a.localeCompare(b)),
    [projectTagsRegistry]
  );
  const allTags = allProjectTagNames;
  const allIssueTags = allProjectTagNames;

  // Map database modules to frontend Module type
  const modules: Module[] = useMemo(() => {
    return projectModules.map((m) => {
      const owner = m.owner_id
        ? organizationMembers.find((member) => member.id === m.owner_id) ?? {
          id: m.owner_id,
          name: m.owner?.name || 'Unknown',
          initials: (m.owner?.name || '?').slice(0, 2).toUpperCase(),
          email: '',
          role: 'member',
        }
        : undefined;
      const createdBy = m.created_by
        ? organizationMembers.find((member) => member.id === m.created_by!.id) ?? {
          id: m.created_by.id,
          name: m.created_by.name || 'Unknown',
          initials: (m.created_by.name || '?').slice(0, 2).toUpperCase(),
          email: '',
          role: 'member',
        }
        : undefined;
      return {
        id: m.id,
        name: m.name,
        type: m.module_type,
        description: m.description || '',
        progress: m.progress || 0,
        status: m.status || 'active',
        owner,
        createdBy,
        createdAt: m.created_at || new Date().toISOString(),
        milestoneId: m.milestone_id || undefined,
      };
    });
  }, [projectModules, organizationMembers]);

  const existingModuleNames = useMemo(() => modules.map(m => m.name), [modules]);

  // Deep-linked entities (e.g. opened via a chat entity tag) — looked up from
  // already-loaded project data rather than fetched separately.
  const deepLinkTask = useMemo(
    () => (taskId ? (project?.tasks || []).find(t => t.id === taskId) ?? null : null),
    [taskId, project?.tasks]
  );
  const deepLinkModule = useMemo(() => {
    if (!moduleId) return null;
    const mod = modules.find(m => m.id === moduleId);
    if (!mod) return null;
    const moduleTasks = getModuleTasks(mod.id, project?.tasks || []);
    const progress = getModuleProgress(mod.id, project?.tasks || []);
    const openIssues = (project?.issues || []).filter(i => i.moduleId === mod.id && i.status !== 'resolved').length;
    return { ...mod, taskCount: moduleTasks.length, progress, openIssues, tasks: moduleTasks };
  }, [moduleId, modules, project?.tasks, project?.issues]);
  const deepLinkMilestone = useMemo(
    () => (milestoneId ? (project?.milestones || []).find(m => m.id === milestoneId) ?? null : null),
    [milestoneId, project?.milestones]
  );
  const deepLinkIssue = useMemo(
    () => (issueId ? (project?.issues || []).find(i => i.id === issueId) ?? null : null),
    [issueId, project?.issues]
  );

  // Calculate project progress breakdown
  const progressBreakdown = useMemo(() => {
    return calculateProjectProgress(
      project?.tasks || [],
      project?.milestones || [],
      modules,
      project?.issues || []
    );
  }, [project?.tasks, project?.milestones, modules, project?.issues]);

  // Refs for progress-sync effect (defined here so they're stable across renders)
  const updateProjectProgressMutateRef = useRef(updateProjectProgressMutation.mutate);
  updateProjectProgressMutateRef.current = updateProjectProgressMutation.mutate;
  const updateProjectIsPendingRef = useRef(updateProjectProgressMutation.isPending);
  updateProjectIsPendingRef.current = updateProjectProgressMutation.isPending;
  // Tracks the last progress value we attempted to sync, so a failed sync
  // (e.g. permission or network error) can't be retried on every re-render —
  // only a genuinely NEW target value triggers another attempt.
  const lastAttemptedProgressRef = useRef<number | null>(null);

  // Filter tasks by search query
  const filteredTasks = useMemo(() => {
    if (!project?.tasks || !searchQuery.trim()) return project?.tasks || [];
    const query = searchQuery.toLowerCase();
    return project.tasks.filter(task =>
      task.title.toLowerCase().includes(query)
    );
  }, [project?.tasks, searchQuery]);

  // Calculate active issue filter count
  const activeIssueFilterCount = useMemo(() => {
    let count = 0;
    if (issueFilters.status?.length) count++;
    if (issueFilters.severity?.length) count++;
    if (issueFilters.assigneeId?.length) count++;
    if (issueFilters.assignedById?.length) count++;
    if (issueFilters.updatedById?.length) count++;
    if (issueFilters.dueDate !== undefined) count++;
    if (issueFilters.dueDateCustom !== undefined) count++;
    if (issueFilters.reportedDate !== undefined) count++;
    if (issueFilters.reportedDateCustom !== undefined) count++;
    if (issueFilters.completedDate !== undefined) count++;
    if (issueFilters.completedDateCustom !== undefined) count++;
    if (issueFilters.tags?.length) count++;
    return count;
  }, [issueFilters]);

  const clearIssueFilters = () => {
    setIssueFilters({});
  };

  // Member management (add/remove/change role) is Admin-only.
  const canManageProjectMembers = canManageMembers;

  // Adding modules/milestones plus changing project stage/status is
  // Maintainer+ (manages all content, not just their own).
  const canAddModulesAndMilestones = isProjectMaintainerPlus;

  // Sync calculated progress — Maintainer+ only, via the dedicated
  // Maintainer-accessible progress endpoint (not the Admin-only general
  // project-update endpoint). Guarded by lastAttemptedProgressRef so a
  // failed sync is attempted once per distinct target value, never looped.
  useEffect(() => {
    if (
      project &&
      progressBreakdown.overallProgress !== project.progress &&
      progressBreakdown.overallProgress !== lastAttemptedProgressRef.current &&
      !updateProjectIsPendingRef.current &&
      canAddModulesAndMilestones
    ) {
      lastAttemptedProgressRef.current = progressBreakdown.overallProgress;
      updateProjectProgressMutateRef.current({
        id: project.id,
        progress: progressBreakdown.overallProgress
      });
    }
  }, [project, progressBreakdown.overallProgress, canAddModulesAndMilestones]);

  // Starting the project chat is available to any project member (any access at all).
  const canStartProjectChat = isProjectMemberPlus;

  const availableOrganizationMembers = useMemo(() => {
    const projectMemberIds = new Set(projectMembers.map((member) => member.id));
    return organizationMembers.filter((member) => !projectMemberIds.has(member.id));
  }, [organizationMembers, projectMembers]);

  const handleAddProjectMember = async () => {
    if (!project || !selectedMemberToAdd) return;
    if (!canManageProjectMembers) {
      toast.error('Only a project Admin can add or remove members');
      return;
    }

    const isMemberAlreadyInProject = projectMembers.some((m) => m.id === selectedMemberToAdd);
    if (isMemberAlreadyInProject) {
      toast.error('Member is already in this project');
      return;
    }

    const isMemberInOrganization = availableOrganizationMembers.some(
      (m) => m.id === selectedMemberToAdd
    );
    if (!isMemberInOrganization) {
      toast.error('Selected member is no longer available');
      return;
    }

    setIsAddingProjectMember(true);
    try {
      await projectMembersService.addMember({
        project_id: project.id,
        user_id: selectedMemberToAdd,
        role: selectedMemberRoleToAdd,
      });

      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all(currentOrganization?.id) });
      await queryClient.invalidateQueries({ queryKey: ['project-members', project.id] });

      toast.success('Member added to project');
      setSelectedMemberToAdd('');
      setSelectedMemberRoleToAdd('member');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add member to project';
      toast.error(message);
    } finally {
      setIsAddingProjectMember(false);
    }
  };

  const handleUpdateProjectMemberRole = async (memberId: string, role: ProjectRole) => {
    if (!project || !canManageProjectMembers) return;

    setMemberRoleUpdatingId(memberId);
    try {
      await projectMembersService.updateRole(project.id, memberId, role);
      await queryClient.invalidateQueries({ queryKey: ['project-members', project.id] });
      toast.success('Member role updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update member role';
      toast.error(message);
    } finally {
      setMemberRoleUpdatingId(null);
    }
  };

  const handleStartProjectChat = async () => {
    if (!project) return;
    if (!canStartProjectChat) {
      toast.error('Only project team members can start this project chat');
      return;
    }

    // Already resolved this project's chat — just toggle the docked panel
    // instead of re-hitting the lookup/ensure endpoints.
    if (projectChatConversationId) {
      setIsChatPanelOpen((prev) => !prev);
      return;
    }

    setIsStartingChat(true);
    try {
      const timeoutMs = Number(import.meta.env.VITE_CHAT_START_PROJECT_TIMEOUT_MS ?? 6000);
      const maxAttempts = Number(import.meta.env.VITE_CHAT_START_PROJECT_MAX_ATTEMPTS ?? 2);
      const withTimeout = async <T,>(p: Promise<T>, ms: number, timeoutMessage: string): Promise<T> =>
        Promise.race([
          p,
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), ms)),
        ]);

      const isNetworkError = (message: string) => {
        const m = message.toLowerCase();
        return (
          m.includes('network') ||
          m.includes('timeout') ||
          m.includes('failed to fetch') ||
          m.includes('fetch') ||
          m.includes('unavailable')
        );
      };

      let conversationId: string | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          if (attempt === 0) {
            conversationId = await withTimeout(
              chatService.getProjectGroupConversationId(project.id),
              timeoutMs,
              'Project chat lookup timed out'
            );
          }

          if (!conversationId) {
            // Ensure RPC is idempotent; we only do this when conversation mapping isn't present.
            conversationId = await withTimeout(
              chatService.ensureProjectGroup(project.id),
              timeoutMs,
              'Project chat start timed out'
            );
          }
        } catch (attemptErr) {
          const message = attemptErr instanceof Error ? attemptErr.message : 'Failed to start project chat';
          if (attempt >= maxAttempts - 1 || !isNetworkError(message)) throw attemptErr;
          conversationId = null;
          continue;
        }

        if (conversationId) break;
      }

      if (!conversationId) {
        throw new Error('Failed to start project chat. Please try again.');
      }

      setProjectChatConversationId(conversationId);
      setIsChatPanelOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start project chat';
      if (message && message.toLowerCase().includes('access denied')) {
        toast.error('You no longer have access to start this project chat');
      } else if (message) {
        toast.error(message);
      } else {
        toast.error('Failed to start project chat. Please try again.');
      }
    } finally {
      setIsStartingChat(false);
    }
  };

  const handleRemoveProjectMember = async (removeFromChatToo: boolean) => {
    if (!project || !memberRemovalPrompt.memberId) return;
    if (!canManageProjectMembers) {
      toast.error('Only a project Admin can add or remove members');
      return;
    }

    const isValidUuidLike = (value: unknown): value is string => {
      if (typeof value !== 'string') return false;
      return (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ||
        /^[0-9a-f]{32}$/i.test(value)
      );
    };

    const memberId = memberRemovalPrompt.memberId;
    if (!isValidUuidLike(project.id) || !isValidUuidLike(memberId)) {
      toast.error('Invalid member selection');
      return;
    }
    const isMemberInProject = projectMembers.some((m) => m.id === memberId);
    if (!isMemberInProject) {
      toast.error('That member is not part of this project anymore');
      return;
    }

    setIsRemovingMember(true);
    try {
      if (!removeFromChatToo) {
        await chatService.retainProjectChatMembershipAfterRemoval(project.id, [memberId]);
      }

      await projectMembersService.removeMember(project.id, memberId);

      if (removeFromChatToo) {
        // Only attempt chat cleanup if the project chat mapping exists.
        // Member removal from the project should not fail due to chat cleanup issues.
        try {
          const conversationId = await chatService.getProjectGroupConversationId(project.id);
          if (conversationId) {
            await chatService.forceRemoveProjectChatMembers(project.id, [memberId]);
          }
        } catch (chatErr) {
          logger.warn('[ProjectDetail] chat cleanup failed during member removal', {
            projectId: project.id,
            memberId,
            error: chatErr instanceof Error ? chatErr.message : String(chatErr),
          });
          toast.warning(
            'Member removed from project, but could not update project group chat',
            { description: chatErr instanceof Error ? chatErr.message : undefined }
          );
        }
      }

      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.all(currentOrganization?.id) }),
        queryClient.invalidateQueries({ queryKey: ['project-members', project.id] }),
      ]);

      toast.success('Member removed from project');
      setMemberRemovalPrompt(DEFAULT_MEMBER_REMOVAL_PROMPT);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove member';
      toast.error(message);
    } finally {
      setIsRemovingMember(false);
    }
  };

  const handleIssueCreate = async (newIssuePartial: Partial<Issue>, pendingFiles?: File[]) => {
    if (!project) return;

    const created = await createIssueMutation.mutateAsync({
      ...newIssuePartial,
      title: newIssuePartial.title || 'New Issue',
      description: newIssuePartial.description || '',
      descriptionBlocks: newIssuePartial.descriptionBlocks || [],
      status: newIssuePartial.status || 'open',
      severity: newIssuePartial.severity || 'minor',
      category: newIssuePartial.category || 'other',
      assignees: newIssuePartial.assignees || [],
      tags: newIssuePartial.tags || [],
      checklist: newIssuePartial.checklist || [],
      dueDate: newIssuePartial.dueDate,
      blocksTaskIds: newIssuePartial.blocksTaskIds || [],
      reportedBy: newIssuePartial.reportedBy || { id: '', name: '', email: '', role: 'Member', initials: '' },
    } as Omit<Issue, 'id' | 'reportedAt'>);

    if (pendingFiles && pendingFiles.length > 0 && created?.id) {
      try {
        await Promise.all(
          pendingFiles.map(file =>
            attachmentsService.upload({
              entityId: created.id,
              entityType: 'issue',
              projectId: project.id,
              file,
            })
          )
        );
      } catch {
        toast.warning('Issue created but some attachments failed to upload');
      }
    }

    if (newIssuePartial.comments && newIssuePartial.comments.length > 0 && created?.id) {
      try {
        await Promise.all(
          newIssuePartial.comments.map(comment =>
            commentsService.create({
              content: comment.content,
              entity_id: created.id,
              entity_type: 'issue',
            })
          )
        );
      } catch {
        toast.warning('Issue created but some comments failed to save');
      }
    }
  };

  const handleIssueUpdate = (updatedIssue: Issue) => {
    updateIssueMutation.mutate({
      projectId: updatedIssue.projectId || id || '',
      issueId: updatedIssue.id,
      updates: updatedIssue,
    });
  };

  const handleAddModule = () => {
    setIsAddModuleDialogOpen(true);
  };

  const handleModuleAdd = async (newModule: Omit<Module, 'id' | 'createdAt'>): Promise<boolean> => {
    try {
      await createModuleMutation.mutateAsync({
        name: newModule.name,
        module_type: newModule.type,
        description: newModule.description || undefined,
        status: 'active',
        progress: 0,
        owner_id: newModule.owner?.id || null,
      });
      setIsAddModuleDialogOpen(false);
      return true;
    } catch {
      return false;
    }
  };

  const handleModuleUpdate = async (updatedModule: Module): Promise<boolean> => {
    try {
      await updateModuleMutation.mutateAsync({
        moduleId: updatedModule.id,
        updates: {
          name: updatedModule.name,
          module_type: updatedModule.type,
          description: updatedModule.description || null,
          status: updatedModule.status || 'active',
          progress: updatedModule.progress ?? 0,
          owner_id: updatedModule.owner?.id || null,
          milestone_id: updatedModule.milestoneId || null,
        },
      });
      return true;
    } catch {
      return false;
    }
  };

  const handleMilestoneCreate = async (newMilestonePartial: Omit<Milestone, 'id'>) => {
    if (!project) return;

    try {
      const createdMilestone = await createMilestoneMutation.mutateAsync({
        name: newMilestonePartial.title,
        due_date: newMilestonePartial.date || null,
        description: newMilestonePartial.description || null,
        status: newMilestonePartial.completed ? 'completed' : 'upcoming',
        assignee_id: newMilestonePartial.assignee?.id || null,
      });

      // Link tasks if any were selected during creation
      if (newMilestonePartial.linkedTaskIds && newMilestonePartial.linkedTaskIds.length > 0) {
        batchUpdateTasksMutation.mutate(
          newMilestonePartial.linkedTaskIds.map(taskId => ({ id: taskId, updates: { milestoneId: createdMilestone.id } }))
        );
      }

      // Link modules if any were selected during creation
      if (newMilestonePartial.linkedModuleIds && newMilestonePartial.linkedModuleIds.length > 0) {
        batchUpdateModulesMutation.mutate(
          newMilestonePartial.linkedModuleIds.map(moduleId => ({ id: moduleId, milestone_id: createdMilestone.id }))
        );
      }

      // Link issues if any were selected during creation
      if (newMilestonePartial.linkedIssueIds && newMilestonePartial.linkedIssueIds.length > 0) {
        const allIssues = project.issues || [];
        newMilestonePartial.linkedIssueIds.forEach(issueId => {
          const issue = allIssues.find(i => i.id === issueId);
          if (!issue) return;
          updateIssueMutation.mutate({
            projectId: issue.projectId || id || '',
            issueId,
            updates: { blocksMilestoneIds: [...(issue.blocksMilestoneIds || []), createdMilestone.id] },
          });
        });
      }
    } catch (error: any) {
      logger.error('Failed to create milestone and link tasks:', error);
      toast.error(error?.message || 'Failed to create milestone');
    }
  };

  const handleMilestoneUpdate = (updatedMilestone: Milestone) => {
    // Update milestone core fields
    updateMilestoneMutation.mutate({
      milestoneId: updatedMilestone.id,
      updates: {
        name: updatedMilestone.title,
        due_date: updatedMilestone.date || null,
        description: updatedMilestone.description || null,
        status: updatedMilestone.completed ? undefined : (updatedMilestone.status || null),
        assignee_id: updatedMilestone.assignee?.id || null,
      },
    });

    // Completion is a separate endpoint on the backend, not part of the general update.
    const previousMilestone = (project?.milestones || []).find(m => m.id === updatedMilestone.id);
    if (previousMilestone && previousMilestone.completed !== updatedMilestone.completed) {
      toggleMilestoneCompleteMutation.mutate({
        milestoneId: updatedMilestone.id,
        completed: updatedMilestone.completed,
      });
    }

    // Persist linked task changes by updating ONLY each task's milestoneId field
    const previousLinkedTaskIds = (project?.tasks || [])
      .filter(t => t.milestoneId === updatedMilestone.id)
      .map(t => t.id);
    const newLinkedTaskIds = updatedMilestone.linkedTaskIds || [];

    const addedTaskIds = newLinkedTaskIds.filter(id => !previousLinkedTaskIds.includes(id));
    const removedTaskIds = previousLinkedTaskIds.filter(id => !newLinkedTaskIds.includes(id));

    const taskUpdates = [
      ...addedTaskIds.map(id => ({ id, updates: { milestoneId: updatedMilestone.id } })),
      ...removedTaskIds.map(id => ({ id, updates: { milestoneId: null } }))
    ];

    if (taskUpdates.length > 0) {
      batchUpdateTasksMutation.mutate(taskUpdates);
    }

    // Persist linked module changes
    const currentModules = project?.projectModules || [];
    const previousLinkedModuleIds = currentModules
      .filter(m => m.milestoneId === updatedMilestone.id)
      .map(m => m.id);
    const newLinkedModuleIds = updatedMilestone.linkedModuleIds || [];

    const addedModuleIds = newLinkedModuleIds.filter(id => !previousLinkedModuleIds.includes(id));
    const removedModuleIds = previousLinkedModuleIds.filter(id => !newLinkedModuleIds.includes(id));

    const moduleUpdates = [
      ...addedModuleIds.map(id => ({ id, milestone_id: updatedMilestone.id })),
      ...removedModuleIds.map(id => ({ id, milestone_id: null }))
    ];

    if (moduleUpdates.length > 0) {
      batchUpdateModulesMutation.mutate(moduleUpdates);
    }
  };


  const handleTaskCreate = async (newTask: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>, pendingFiles?: File[]) => {
    const created = await createTaskMutation.mutateAsync(newTask);
    if (pendingFiles && pendingFiles.length > 0 && created?.id) {
      try {
        await Promise.all(
          pendingFiles.map(file =>
            attachmentsService.upload({
              entityId: created.id,
              entityType: 'task',
              projectId: id!,
              file,
            })
          )
        );
      } catch {
        toast.warning('Task created but some attachments failed to upload');
      }
    }

    if (newTask.comments && newTask.comments.length > 0 && created?.id) {
      try {
        await Promise.all(
          newTask.comments.map(comment =>
            commentsService.create({
              content: comment.content,
              entity_id: created.id,
              entity_type: 'task',
            })
          )
        );
      } catch {
        toast.warning('Task created but some comments failed to save');
      }
    }
  };

  const handleTaskUpdate = async (updatedTask: Task, onError?: () => void) => {
    try {
      await updateTaskMutation.mutateAsync({
        taskId: updatedTask.id,
        updates: updatedTask,
      });
    } catch (error) {
      if (onError) onError();
      throw error;
    }
  };

  const handleTaskDelete = (taskId: string) => {
    deleteTaskMutation.mutate(taskId);
  };

  const handleBatchTaskUpdate = async (updates: Array<{ id: string; updates: Partial<Task> }>) => {
    await batchUpdateTasksMutation.mutateAsync(updates);
  };

  const handleModuleDelete = (moduleId: string) => {
    deleteModuleMutation.mutate(moduleId);
  };

  const handleMilestoneDelete = (milestoneId: string) => {
    deleteMilestoneMutation.mutate(milestoneId);
  };

  const handleIssueDelete = (issueId: string) => {
    deleteIssueMutation.mutate(issueId);
  };

  // Loading state
  if (isLoading) {
    return (
      <>
        <ProjectDetailSkeleton />
      </>
    );
  }

  // Error or not found state
  if (error || !project) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-[60vh]">
          <h2 className="text-xl font-medium">Project not found</h2>
          <p className="text-muted-foreground mt-2">
            {error ? 'An error occurred while loading the project.' : 'The project you are looking for does not exist.'}
          </p>
          <Button asChild className="mt-4">
            <Link to="/projects">Back to Projects</Link>
          </Button>
        </div>
      </>
    );
  }

  const openIssuesCount = project.issues?.filter(i => i.status !== 'resolved' && i.status !== 'wont-fix').length || 0;
  const criticalIssuesCount = project.issues?.filter(i => i.severity === 'critical' && i.status !== 'resolved' && i.status !== 'wont-fix').length || 0;
  const openTasksCount = project.tasks?.filter(t => t.status !== 'done').length || 0;

  const tabBadges: Partial<Record<ProjectTabId, { count: number; variant: 'secondary' | 'destructive' }>> = {
    tasks: { count: openTasksCount, variant: 'secondary' },
    modules: { count: modules.length, variant: 'secondary' },
    milestones: { count: (project.milestones || []).length, variant: 'secondary' },
    ...(openIssuesCount > 0
      ? { issues: { count: openIssuesCount, variant: criticalIssuesCount > 0 ? 'destructive' : 'secondary' } }
      : {}),
  };
  const TAB_GRID_COLS_CLASS: Record<number, string> = {
    1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3',
    4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6',
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-6 w-full min-w-0">

        {/* Section Tabs - Entity-based navigation */}
        <Tabs value={section} onValueChange={(v) => navigate(`/projects/${id}/${v}`)} className="w-full">
          {/* Nothing inside this bar renders once a part/requirement/ECO detail,
              the requirements editor, or mobile module detail is open (both
              conditional blocks below check the same flags) — so gate the sticky
              wrapper itself too. Otherwise it still occupies its padding+border as
              an empty strip pinned at top:0, overlapping whatever scrolls
              underneath it (e.g. BOMDetailScreen's own header, which scrolls in
              its own inner container). */}
          {!partId && !reqKey && !isRequirementsEditorOpen && !ecoId && !isMobileModuleDetailOpen && (
          <div ref={setStickyHeaderEl} className="sticky -top-4 md:-top-4 z-20 bg-background -mt-4 pt-4 -mx-4 px-4 pb-2.5 border-b border-border md:-mx-6 md:px-6 md:pb-2.5 will-change-transform">
            {!partId && !reqKey && !isRequirementsEditorOpen && !ecoId && !isMobileModuleDetailOpen && (
              <div className="flex flex-row md:items-center justify-between gap-2 w-full pb-1">
                {/* Left Side: Tabs */}
                <div className="flex-1 md:flex-none w-full md:w-auto py-1 min-w-0 md:mr-auto overflow-x-auto hide-scrollbar">
                  <TabsList
                    className={`bg-muted/50 grid ${TAB_GRID_COLS_CLASS[visibleTabs.length] || 'grid-cols-6'} min-w-[300px] md:min-w-0 w-full h-11 md:w-auto md:flex md:shrink-0`}
                  >
                    {visibleTabs.map(({ id: tabId, label, title, icon: Icon }) => {
                      const badge = tabBadges[tabId];
                      return (
                        <TabsTrigger
                          key={tabId}
                          value={tabId}
                          className="relative gap-1 sm:gap-2 px-2 justify-center min-w-0"
                          title={title}
                          onTouchStart={() => handleTabLongPressStart(tabId)}
                          onTouchEnd={handleTabLongPressEnd}
                          onTouchCancel={handleTabLongPressEnd}
                          onTouchMove={handleTabLongPressEnd}
                        >
                          <Icon className="h-5 w-5 md:h-4 md:w-4 shrink-0" />
                          {!isMobile && <span className="truncate">{label}</span>}
                          {!isMobile && badge && (
                            <Badge variant={badge.variant} className="ml-1 h-5 px-1.5 text-[10px] shrink-0">
                              {badge.count}
                            </Badge>
                          )}
                          {isMobile && longPressedTab === tabId && (
                            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-md">
                              {label}
                            </span>
                          )}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </div>

                  {/* Right Side: Team + Chat + Add Button */}
                  <div className="flex items-center gap-2 shrink-0 justify-end md:w-auto">
                    {!isMobile && <ProjectProgressPopover breakdown={progressBreakdown} />}
                    {/* Project details — the full record (description, dates,
                    departments, links). Unreachable from inside the project
                    before this. */}
                    {!isMobile && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 rounded-lg shrink-0"
                            onClick={() => navigate(`/projects/${id}/details`)}
                          >
                            <FolderOpen className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Project Details</TooltipContent>
                      </Tooltip>
                    )}
                    {/* Team Popover */}
                    <div className="hidden md:block">
                      <ProjectTeamButton projectId={id!} />
                    </div>
                    {/* Start Chat */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant={isChatPanelOpen ? 'secondary' : 'outline'}
                          size="icon"
                          className="h-9 w-9 rounded-lg hidden sm:flex shrink-0"
                          onClick={handleStartProjectChat}
                          disabled={isStartingChat || !canStartProjectChat}
                        >
                          {isStartingChat ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Chat</TooltipContent>
                    </Tooltip>
                    {/* Critical Issues Badge */}
                    {/* {criticalIssuesCount > 0 && (
                <Badge variant="destructive" className="gap-1 shrink-0 hidden sm:inline-flex">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {criticalIssuesCount} Critical
                </Badge>
              )} */}
                    {/* Section Add/Action Buttons — on mobile these move down next to each
                    section's search bar instead (see the "Second Row" block below),
                    so the tab strip doesn't end in a floating "+" square. */}
                    {section === 'tasks' && !isMobile && (
                      <Button
                        size="sm"
                        onClick={() => setIsAddTaskDialogOpen(true)}
                        className="gap-2 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-0 w-9 sm:w-auto sm:px-3 rounded-lg"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">Create Task</span>
                      </Button>
                    )}
                    {section === 'modules' && canAddModulesAndMilestones && !isMobile && (
                      <Button size="sm" className="gap-2 shrink-0 px-2 md:px-3" onClick={handleAddModule}>
                        <Plus className="h-4 w-4" />
                        <span className="hidden md:inline">Add Module</span>
                      </Button>
                    )}
                    {section === 'milestones' && canAddModulesAndMilestones && !isMobile && (
                      <Button size="sm" className="gap-2 shrink-0 px-2 md:px-3" onClick={() => setIsAddMilestoneDialogOpen(true)}>
                        <Plus className="h-4 w-4" />
                        <span className="hidden md:inline">Add Milestone</span>
                      </Button>
                    )}
                    {section === 'issues' && !isMobile && (
                      <>
                        {id && isSupportFeatureEnabled && <SupportLinksSheet projectId={id} />}
                        <Button size="sm" className="gap-2 shrink-0 px-2 md:px-3" onClick={() => setIsAddIssueDialogOpen(true)}>
                          <Plus className="h-4 w-4" />
                          <span className="hidden md:inline">Report Issue</span>
                        </Button>
                      </>
                    )}
                    {section === 'bom' && !isMobile && (
                      <Button size="sm" onClick={() => setBomAddOpen(true)} className="gap-2 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-0 w-9 sm:w-auto sm:px-3 rounded-lg">
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">Add Part</span>
                      </Button>
                    )}
                    {section === 'eng-changes' && !isMobile && (
                      <Button size="sm" onClick={() => setEcoNewOpen(true)} className="gap-2 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-0 w-9 sm:w-auto sm:px-3 rounded-lg">
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">New ECO</span>
                      </Button>
                    )}
                    {section === 'gate-reviews' && (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5 shrink-0 h-9">
                          <Download className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Export</span>
                        </Button>
                        <Button size="sm" className="gap-2 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-0 w-9 sm:w-auto sm:px-3 rounded-lg">
                          <Plus className="h-4 w-4" />
                          <span className="hidden sm:inline">Add Gate</span>
                        </Button>
                      </div>
                    )}
                    {section === 'risk' && (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5 shrink-0 h-9">
                          <Download className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Export</span>
                        </Button>
                        <Button size="sm" className="gap-2 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-0 w-9 sm:w-auto sm:px-3 rounded-lg">
                          <Plus className="h-4 w-4" />
                          <span className="hidden sm:inline">Add Risk</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Second Row: Search + View Toggle + Filter toolbar (below tabs, like BOM UI) */}
              {(section === 'tasks' || section === 'modules' || section === 'milestones' || section === 'issues') && !isMobileModuleDetailOpen && (
                <div className="flex items-center justify-between gap-3 mt-2.5 pb-2.5 w-full bg-background">
                  {section === 'tasks' && (
                    <>
                      {/* Left: Search */}
                      <div className="relative flex items-center flex-1 min-w-0 max-w-sm sm:max-w-md">
                        <Search className="absolute left-3 h-4 w-4 text-muted-foreground shrink-0" />
                        <Input
                          placeholder="Search tasks..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9 pr-9 h-9 w-full bg-background rounded-lg"
                        />
                        {searchQuery && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 h-9 w-9 text-foreground hover:opacity-70"
                            onClick={() => setSearchQuery('')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {/* Right: View toggle + Filter */}
                      <div className="flex items-center gap-2 shrink-0">
                        <ViewControls
                          viewMode={viewMode}
                          onViewModeChange={setViewMode}
                        />
                        {!isMobile && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 gap-1.5"
                            onClick={() => setIsImportTasksDialogOpen(true)}
                          >
                            <Upload className="h-4 w-4" />
                            Import
                          </Button>
                        )}
                        <TaskFiltersDropdown
                          milestones={project.milestones || []}
                          modules={modules.map(m => ({ id: m.id, name: m.name, type: m.type }))}
                          teamMembers={teamMembers}
                          allTags={allTags}
                          filters={filters}
                          onFiltersChange={setFilters}
                          activeFilterCount={activeFilterCount}
                          statusOptions={filterStatusOptions}
                        />
                        {isMobile && (
                          <button
                            type="button"
                            onClick={() => setIsAddTaskDialogOpen(true)}
                            aria-label="Create Task"
                            className="w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0 active:opacity-90 transition-opacity"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                  {section === 'modules' && (
                    <>
                      {/* Left: Search */}
                      <div className="relative flex items-center flex-1 min-w-0 max-w-sm sm:max-w-md">
                        <Search className="absolute left-3 h-4 w-4 text-muted-foreground shrink-0" />
                        <Input
                          placeholder="Search modules..."
                          value={moduleSearchQuery}
                          onChange={(e) => setModuleSearchQuery(e.target.value)}
                          className="pl-9 pr-9 h-9 w-full bg-background rounded-full md:rounded-lg"
                        />
                        {moduleSearchQuery && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 h-9 w-9 text-foreground hover:opacity-70"
                            onClick={() => setModuleSearchQuery('')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {/* Right: View toggle (desktop/tablet only — mobile always uses the card view) */}
                      <div className="hidden md:flex items-center gap-2 shrink-0">
                        <ModuleViewControls
                          viewMode={moduleViewMode}
                          onViewModeChange={setModuleViewMode}
                        />
                      </div>
                      {isMobile && canAddModulesAndMilestones && (
                        <button
                          type="button"
                          onClick={handleAddModule}
                          aria-label="Add Module"
                          className="w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0 active:opacity-90 transition-opacity"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  )}
                  {section === 'milestones' && (
                    <>
                      {/* Left: Search */}
                      <div className="relative flex items-center flex-1 min-w-0 max-w-sm sm:max-w-md">
                        <Search className="absolute left-3 h-4 w-4 text-muted-foreground shrink-0" />
                        <Input
                          placeholder="Search milestones..."
                          value={milestoneSearchQuery}
                          onChange={(e) => setMilestoneSearchQuery(e.target.value)}
                          className="pl-9 pr-9 h-9 w-full bg-background rounded-lg"
                        />
                        {milestoneSearchQuery && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 h-9 w-9 text-foreground hover:opacity-70"
                            onClick={() => setMilestoneSearchQuery('')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {/* Right: View toggle */}
                      <div className="flex items-center gap-2 shrink-0">
                        <MilestoneViewControls
                          viewMode={milestoneViewMode}
                          onViewModeChange={setMilestoneViewMode}
                        />
                        {isMobile && canAddModulesAndMilestones && (
                          <button
                            type="button"
                            onClick={() => setIsAddMilestoneDialogOpen(true)}
                            aria-label="Add Milestone"
                            className="w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0 active:opacity-90 transition-opacity"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                  {section === 'issues' && (
                    <>
                      {/* Left: Search */}
                      <div className="relative flex items-center flex-1 min-w-0 max-w-sm sm:max-w-md">
                        <Search className="absolute left-3 h-4 w-4 text-muted-foreground shrink-0" />
                        <Input
                          placeholder="Search issues..."
                          value={issueSearchQuery}
                          onChange={(e) => setIssueSearchQuery(e.target.value)}
                          className="pl-9 pr-9 h-9 w-full bg-background rounded-lg"
                        />
                        {issueSearchQuery && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 h-9 w-9 text-foreground hover:opacity-70"
                            onClick={() => setIssueSearchQuery('')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {/* Right: View toggle + Filter */}
                      <div className="flex items-center gap-2 shrink-0">
                        {!isMobile && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 gap-1.5"
                            onClick={() => setIsImportIssuesDialogOpen(true)}
                          >
                            <Upload className="h-4 w-4" />
                            Import
                          </Button>
                        )}
                        <IssueViewControls
                          viewMode={issueViewMode}
                          onViewModeChange={setIssueViewMode}
                          filters={issueFilters}
                          onFiltersChange={setIssueFilters}
                          teamMembers={projectMembers}
                          issueColumns={issueColumns}
                          allTags={allIssueTags}
                          activeFilterCount={activeIssueFilterCount}
                          onClearFilters={clearIssueFilters}
                        />
                        {isMobile && (
                          <button
                            type="button"
                            onClick={() => setIsAddIssueDialogOpen(true)}
                            aria-label="Report Issue"
                            className="w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0 active:opacity-90 transition-opacity"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <TabsContent value="tasks" className="mt-3 md:mt-4 flex flex-col">
            <TasksSection
              tasks={filteredTasks}
              allTasks={project.tasks || []}
              projectId={project.id}
              projectCode={project.code}
              milestones={project.milestones || []}
              issues={project.issues || []}
              modules={modules.map(m => ({ id: m.id, name: m.name, type: m.type }))}
              assignableMembers={projectMembers}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              filters={filters}
              onFiltersChange={setFilters}
              onTaskCreate={handleTaskCreate}
              onTaskUpdate={handleTaskUpdate}
              onBatchTaskUpdate={handleBatchTaskUpdate}
              onTaskDelete={handleTaskDelete}
              userProjectRole={project?.myRole}
              onAddModule={canAddModulesAndMilestones ? handleAddModule : undefined}
            />
          </TabsContent>
          <TabsContent value="modules" className={isMobileModuleDetailOpen ? '-mx-4' : 'mt-3 md:mt-4 flex flex-col'}>
            <ModulesSection
              modules={modules}
              tasks={project.tasks || []}
              issues={project.issues || []}
              teamMembers={projectMembers}
              projectId={project.id}
              projectCode={project.code}
              viewMode={moduleViewMode}
              onViewModeChange={setModuleViewMode}
              searchQuery={moduleSearchQuery}
              isAddDialogOpen={isAddModuleDialogOpen}
              onAddDialogClose={() => setIsAddModuleDialogOpen(false)}
              onModuleAdd={handleModuleAdd}
              onModuleUpdate={handleModuleUpdate}
              onModuleDelete={handleModuleDelete}
              onTaskUpdate={handleTaskUpdate}
              onIssueUpdate={handleIssueUpdate}
              onMobileDetailOpenChange={setIsMobileModuleDetailOpen}
            />
          </TabsContent>
          <TabsContent value="milestones" className="mt-3 md:mt-4 flex flex-col">
            <MilestonesView
              milestones={project.milestones || []}
              tasks={project.tasks || []}
              issues={project.issues || []}
              modules={modules}
              assignableMembers={projectMembers}
              viewMode={milestoneViewMode}
              projectStartDate={project.startDate ? new Date(project.startDate) : undefined}
              searchQuery={milestoneSearchQuery}
              isAddDialogOpen={isAddMilestoneDialogOpen}
              onAddDialogClose={() => setIsAddMilestoneDialogOpen(false)}
              onMilestoneUpdate={handleMilestoneUpdate}
              onMilestoneCreate={handleMilestoneCreate}
              onMilestoneDelete={handleMilestoneDelete}
              onIssueUpdate={handleIssueUpdate}
              stickyOffset={stickyHeaderHeight}
            />
          </TabsContent>
          <TabsContent value="issues" className="mt-3 md:mt-4 flex flex-col bg-background">
            <IssuesView
              issues={project.issues || []}
              projectCode={project.code}
              viewMode={issueViewMode}
              tasks={project.tasks || []}
              teamMembers={projectMembers}
              searchQuery={issueSearchQuery}
              severityFilter={issueFilters.severity}
              statusFilter={issueFilters.status}
              assigneeFilter={issueFilters.assigneeId}
              assignedByFilter={issueFilters.assignedById}
              updatedByFilter={issueFilters.updatedById}
              dueDateFilter={issueFilters.dueDate}
              dueDateCustomFilter={issueFilters.dueDateCustom}
              dueDateCustomToFilter={issueFilters.dueDateCustomTo}
              reportedDateFilter={issueFilters.reportedDate}
              reportedDateCustomFilter={issueFilters.reportedDateCustom}
              reportedDateCustomToFilter={issueFilters.reportedDateCustomTo}
              completedDateFilter={issueFilters.completedDate}
              completedDateCustomFilter={issueFilters.completedDateCustom}
              completedDateCustomToFilter={issueFilters.completedDateCustomTo}
              tagsFilter={issueFilters.tags}
              isAddDialogOpen={isAddIssueDialogOpen}
              onAddDialogClose={() => setIsAddIssueDialogOpen(false)}
              onIssueCreate={handleIssueCreate}
              onIssueUpdate={handleIssueUpdate}
              onIssueDelete={handleIssueDelete}
              userProjectRole={project?.myRole}
              stickyOffset={stickyHeaderHeight}
            />
          </TabsContent>
          <TabsContent value="bom" className="mt-3 md:mt-4 -mx-4 md:-mx-6 -mb-6 flex flex-col">
            <BOMView
              projectId={project.id}
              orgId={currentOrganization?.id ?? ''}
              addOpen={bomAddOpen}
              onAddClose={() => setBomAddOpen(false)}
              selectedId={partId ?? null}
              onSelectedIdChange={(newId) =>
                navigate(`/projects/${id}/bom${newId ? `/${newId}` : ''}`)
              }
              onEcoCreated={(ecoId) => navigate(`/projects/${id}/eng-changes/${ecoId}`)}
            />
          </TabsContent>
          <TabsContent value="requirements" className="mt-3 md:mt-4 -mx-4 md:-mx-6 -mb-6 flex flex-col">
            <RequirementsView
              projectId={project.id}
              orgId={currentOrganization?.id ?? ''}
              selectedKey={reqKey ?? null}
              onSelectedKeyChange={(newKey) =>
                navigate(`/projects/${id}/requirements${newKey ? `/${newKey}` : ''}`)
              }
              onEditorOpenChange={setIsRequirementsEditorOpen}
              onEcoCreated={(ecoId) => navigate(`/projects/${id}/eng-changes/${ecoId}`)}
            />
          </TabsContent>
          <TabsContent value="eng-changes" className="mt-3 md:mt-4 -mx-4 md:-mx-6 -mb-6 flex flex-col">
            <ECOView
              projectId={id!}
              projectName={project?.name}
              newTrigger={ecoNewOpen}
              onNewConsumed={() => setEcoNewOpen(false)}
              openEcoId={ecoId ?? null}
              onOpenEcoIdChange={(newId) =>
                navigate(`/projects/${id}/eng-changes${newId ? `/${newId}` : ''}`)
              }
            />
          </TabsContent>
          <TabsContent value="gate-reviews" className="mt-3 md:mt-4 flex flex-col">
            <GateView />
          </TabsContent>
          <TabsContent value="risk" className="mt-3 md:mt-4 flex flex-col">
            <RiskView />
          </TabsContent>
        </Tabs>
      </div>

      <AddModuleDialog
        isOpen={isAddModuleDialogOpen}
        onClose={() => setIsAddModuleDialogOpen(false)}
        onAdd={handleModuleAdd}
        teamMembers={projectMembers}
        existingModuleNames={existingModuleNames}
      />

      <ImportTasksDialog
        open={isImportTasksDialogOpen}
        onClose={() => setIsImportTasksDialogOpen(false)}
        projectId={project.id}
      />

      <ImportIssuesDialog
        open={isImportIssuesDialogOpen}
        onClose={() => setIsImportIssuesDialogOpen(false)}
        projectId={project.id}
      />

      <TaskDetailModal
        task={null}
        allTasks={project.tasks || []}
        isOpen={isAddTaskDialogOpen}
        onClose={() => setIsAddTaskDialogOpen(false)}
        onUpdate={handleTaskUpdate}
        mode="create"
        onCreate={handleTaskCreate}
        modules={modules}
        milestones={project.milestones || []}
        projectId={id}
        projectCode={project.code}
        onAddModule={canAddModulesAndMilestones ? handleAddModule : undefined}
        assignableMembers={projectMembers}
        statusOptions={(boardColumns ?? []).map((c) => ({
          value: c.status,
          label: c.label,
          color: c.color,   // hex kept as-is; TaskDetailModal dot uses inline style
        }))}
      />

      {/* Deep-linked entity modals — opened via a route param (e.g. /tasks/:taskId),
          such as when navigating from a chat entity tag. */}
      {taskId && (
        <TaskDetailModal
          task={deepLinkTask}
          allTasks={project.tasks || []}
          isOpen={!!taskId}
          onClose={() => navigate(deepLinkBackTo || `/projects/${id}/tasks`)}
          onUpdate={handleTaskUpdate}
          onDelete={handleTaskDelete}
          mode="view"
          modules={modules}
          milestones={project.milestones || []}
          projectId={id}
          projectCode={project.code}
          onAddModule={canAddModulesAndMilestones ? handleAddModule : undefined}
          assignableMembers={organizationMembers}
          statusOptions={(boardColumns ?? []).map((c) => ({
            value: c.status,
            label: c.label,
            color: c.color,
          }))}
        />
      )}

      {moduleId && (
        <ModuleDetailModal
          module={deepLinkModule}
          allTasks={project.tasks || []}
          allIssues={project.issues || []}
          teamMembers={organizationMembers}
          isOpen={!!moduleId}
          onClose={() => navigate(deepLinkBackTo || `/projects/${id}/modules`)}
          onUpdate={handleModuleUpdate}
        />
      )}

      {milestoneId && (
        <MilestoneDetailModal
          milestone={deepLinkMilestone}
          tasks={project.tasks || []}
          issues={project.issues || []}
          modules={modules}
          assignableMembers={projectMembers}
          isOpen={!!milestoneId}
          onClose={() => navigate(deepLinkBackTo || `/projects/${id}/milestones`)}
          onUpdate={handleMilestoneUpdate}
          onIssueUpdate={handleIssueUpdate}
        />
      )}

      {issueId && (
        <IssueDetailModal
          issue={deepLinkIssue}
          tasks={project.tasks || []}
          teamMembers={projectMembers}
          isOpen={!!issueId}
          onClose={() => navigate(deepLinkBackTo || `/projects/${id}/issues`)}
          onUpdate={handleIssueUpdate}
          onDelete={handleIssueDelete}
          userProjectRole={project?.myRole}
          mode="view"
          projectCode={project.code}
        />
      )}

      <Dialog
        open={memberRemovalPrompt.open}
        onOpenChange={(open) => {
          if (!open && !isRemovingMemberRef.current) {
            setMemberRemovalPrompt(DEFAULT_MEMBER_REMOVAL_PROMPT);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member from project?</DialogTitle>
            <DialogDescription>
              {memberRemovalPrompt.memberName
                ? `${memberRemovalPrompt.memberName} will be removed from this project. Should they also be removed from the project group chat, or kept in that chat?`
                : 'This person will be removed from the project. Should they also be removed from the project group chat, or kept in that chat?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMemberRemovalPrompt(DEFAULT_MEMBER_REMOVAL_PROMPT)}
              disabled={isRemovingMember}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleRemoveProjectMember(false)}
              disabled={isRemovingMember}
            >
              No, keep in chat
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleRemoveProjectMember(true)}
              disabled={isRemovingMember}
            >
              {isRemovingMember ? 'Removing...' : 'Yes, remove from chat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectChatPanel
        open={isChatPanelOpen}
        onOpenChange={setIsChatPanelOpen}
        conversationId={projectChatConversationId}
      />
    </>
  );
}
