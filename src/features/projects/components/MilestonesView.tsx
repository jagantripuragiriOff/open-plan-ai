import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Milestone, Task, Issue, Module, TeamMember } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileKanbanColumn } from '@/components/shared/MobileKanbanColumn';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Flag,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronRight,
  Plus,
  Box,
} from 'lucide-react';
import {
  getMilestoneProgress,
  getMilestoneTasks,
  getMilestoneModules,
  getMilestoneIssues,
  getMilestoneStatus,
  sortMilestonesByDate,
  getModuleProgress,
} from '../utils/projectUtils';
import { MilestoneDetailModal } from './MilestoneDetailModal';
import { AddMilestoneDialog } from './AddMilestoneDialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface MilestonesViewProps {
  milestones: Milestone[];
  tasks: Task[];
  issues?: Issue[];
  modules?: Module[];
  assignableMembers?: TeamMember[];
  viewMode?: 'list' | 'kanban';
  /** Used to open the add-milestone calendar on the project’s start month/year */
  projectStartDate?: Date;
  searchQuery?: string;
  isAddDialogOpen?: boolean;
  onAddDialogClose?: () => void;
  onMilestoneUpdate?: (milestone: Milestone) => void;
  onMilestoneCreate?: (milestone: Omit<Milestone, 'id'>) => void;
  onMilestoneDelete?: (milestoneId: string) => void;
  onIssueUpdate?: (issue: Issue) => void;
  /** Px offset from the top of the scroll container to stick the kanban column headers below — e.g. the height of a sticky page header rendered above this view. */
  stickyOffset?: number;
}

const statusConfig = {
  completed: { color: 'bg-status-done', textColor: 'text-status-done', bgColor: 'bg-status-done/10', label: 'Completed', icon: CheckCircle2 },
  blocked: { color: 'bg-destructive', textColor: 'text-destructive', bgColor: 'bg-destructive/10', label: 'Blocked', icon: AlertTriangle },
  'at-risk': { color: 'bg-orange-500', textColor: 'text-orange-500', bgColor: 'bg-orange-500/10', label: 'At Risk', icon: Clock },
  'on-track': { color: 'bg-chart-2', textColor: 'text-chart-2', bgColor: 'bg-chart-2/10', label: 'On Track', icon: Flag },
};

// Mobile milestone cards use green for on-track (matching the mobile design spec)
// instead of the desktop timeline's purple `chart-2` token.
const mobileStatusColors: Record<keyof typeof statusConfig, { textColor: string; bgColor: string; barColor: string }> = {
  completed: { textColor: 'text-status-done', bgColor: 'bg-status-done/10', barColor: 'bg-status-done' },
  blocked: { textColor: 'text-destructive', bgColor: 'bg-destructive/10', barColor: 'bg-destructive' },
  'at-risk': { textColor: 'text-orange-500', bgColor: 'bg-orange-500/10', barColor: 'bg-orange-500' },
  'on-track': { textColor: 'text-status-done', bgColor: 'bg-status-done/10', barColor: 'bg-status-done' },
};

export function MilestonesView({
  milestones,
  tasks,
  issues = [],
  modules = [],
  assignableMembers = [],
  viewMode = 'list',
  projectStartDate,
  searchQuery = '',
  isAddDialogOpen: externalIsAddDialogOpen,
  onAddDialogClose,
  onMilestoneUpdate,
  onMilestoneCreate,
  onMilestoneDelete,
  onIssueUpdate,
  stickyOffset = 0,
}: MilestonesViewProps) {
  const [expandedMilestones, setExpandedMilestones] = useState<string[]>([]);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [internalIsAddDialogOpen, setInternalIsAddDialogOpen] = useState(false);
  const isMobile = useIsMobile();
  const [mobileColumnOrder, setMobileColumnOrder] = useState<string[]>([
    'on-track',
    'at-risk',
    'blocked',
    'completed',
  ]);

  const isAddDialogOpen = externalIsAddDialogOpen ?? internalIsAddDialogOpen;

  // Filter milestones by search query
  const filteredMilestones = searchQuery.trim()
    ? milestones.filter(m =>
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : milestones;

  const sortedMilestones = sortMilestonesByDate(filteredMilestones);
  const milestoneKanbanColumns: Array<{
    key: 'on-track' | 'at-risk' | 'blocked' | 'completed';
    label: string;
    color: string;
  }> = [
      { key: 'on-track', label: 'On Track', color: 'bg-chart-2' },
      { key: 'at-risk', label: 'At Risk', color: 'bg-orange-500' },
      { key: 'blocked', label: 'Blocked', color: 'bg-destructive' },
      { key: 'completed', label: 'Completed', color: 'bg-status-done' },
    ];

  const handleColumnDragEnd = (result: DropResult) => {
    const { destination, source } = result;
    if (!destination || destination.index === source.index) return;
    setMobileColumnOrder((prev) => {
      const next = Array.from(prev);
      const [removed] = next.splice(source.index, 1);
      next.splice(destination.index, 0, removed);
      return next;
    });
  };

  const toggleExpanded = (milestoneId: string) => {
    setExpandedMilestones(prev =>
      prev.includes(milestoneId)
        ? prev.filter(id => id !== milestoneId)
        : [...prev, milestoneId]
    );
  };

  const handleMilestoneClick = (milestone: Milestone) => {
    setSelectedMilestone(milestone);
    setIsModalOpen(true);
  };

  const handleMilestoneUpdateFromModal = (updatedMilestone: Milestone) => {
    setSelectedMilestone(updatedMilestone);
    onMilestoneUpdate?.(updatedMilestone);
  };

  const handleAddMilestone = (milestone: Omit<Milestone, 'id'>) => {
    onMilestoneCreate?.(milestone);
    setInternalIsAddDialogOpen(false);
    onAddDialogClose?.();
  };

  return (
    <div className="space-y-6 min-h-[calc(100vh-260px)]">
      {/* Only a search yielding nothing gets the full-page takeover — a genuinely
          empty board (no milestones at all) instead falls through to the normal
          Kanban/timeline layout below, which already renders each column/section
          empty on its own (e.g. renderMilestoneCards' "No milestones" placeholder),
          so the column headers and counts stay visible instead of the whole board
          disappearing behind a single generic card. */}
      {searchQuery.trim() && sortedMilestones.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center min-h-[calc(100vh-260px)]">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Flag className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No matching milestones</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            No milestones match your search query.
          </p>
        </Card>
      ) : viewMode === 'kanban' ? (
        (() => {
          const orderedColumns = isMobile
            ? mobileColumnOrder
              .map((key) => milestoneKanbanColumns.find((c) => c.key === key))
              .filter((c): c is (typeof milestoneKanbanColumns)[number] => Boolean(c))
            : milestoneKanbanColumns;

          const renderMilestoneCards = (columnMilestones: Milestone[]) =>
            columnMilestones.length === 0 ? (
              <Card className="p-4 border-dashed">
                <p className="text-xs text-muted-foreground">No milestones</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {columnMilestones.map((milestone) => {
                  const progress = getMilestoneProgress(milestone, tasks);
                  const milestoneTasks = getMilestoneTasks(milestone, tasks);
                  const milestoneIssues = getMilestoneIssues(milestone.id, issues);
                  const daysUntil = milestone.date ? Math.ceil((new Date(milestone.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : NaN;
                  const isOverdue = !milestone.completed && daysUntil < 0;

                  return (
                    <Card
                      key={milestone.id}
                      className={cn(
                        'p-3 cursor-pointer transition-all hover:shadow-md border-l-2 border-l-primary/70',
                        milestone.completed && 'opacity-75'
                      )}
                      onClick={() => handleMilestoneClick(milestone)}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className={cn('text-sm font-medium leading-tight line-clamp-2 break-words min-w-0', milestone.completed && 'line-through text-muted-foreground')}>
                            {milestone.title}
                          </h4>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {progress}%
                          </Badge>
                        </div>

                        {milestone.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 break-words">{milestone.description}</p>
                        )}

                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {milestone.date ? new Date(milestone.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            }) : 'No date'}
                          </span>
                          {!milestone.completed && !isNaN(daysUntil) && (
                            <span className={cn(isOverdue ? 'text-destructive' : 'text-muted-foreground')}>
                              {isOverdue ? `• ${Math.abs(daysUntil)}d overdue` : daysUntil === 0 ? '• Due today' : `• ${daysUntil}d left`}
                            </span>
                          )}
                        </div>

                        <Progress value={progress} className="h-1.5" />

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{milestoneTasks.filter(t => t.status === 'done').length}/{milestoneTasks.length} tasks</span>
                          {milestoneIssues.length > 0 && (
                            <span className="text-destructive">{milestoneIssues.length} issues</span>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            );

          if (isMobile) {
            return (
              <DragDropContext onDragEnd={handleColumnDragEnd}>
                <Droppable droppableId="milestone-board" type="COLUMN" direction="vertical">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-3 w-full">
                      {orderedColumns.map((column, index) => {
                        const columnMilestones = sortedMilestones.filter(
                          (milestone) => getMilestoneStatus(milestone, tasks, issues) === column.key
                        );

                        return (
                          <Draggable key={column.key} draggableId={column.key} index={index}>
                            {(dragProvided, dragSnapshot) => (
                              <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} className="w-full">
                                <MobileKanbanColumn
                                  label={column.label}
                                  count={columnMilestones.length}
                                  countLabel="milestones"
                                  dot={<div className={cn('w-2 h-2 rounded-full shrink-0', column.color)} />}
                                  dragHandleProps={dragProvided.dragHandleProps}
                                  isDragging={dragSnapshot.isDragging}
                                >
                                  {renderMilestoneCards(columnMilestones)}
                                </MobileKanbanColumn>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            );
          }

          return (
            <div className="w-full overflow-x-auto overflow-y-visible pb-4">
              <div className="inline-flex gap-4 min-w-full pr-4 md:pr-6" style={{ width: 'max-content' }}>
                {orderedColumns.map((column) => {
                  const columnMilestones = sortedMilestones.filter(
                    (milestone) => getMilestoneStatus(milestone, tasks, issues) === column.key
                  );

                  return (
                    <div key={column.key} className="w-[300px] flex-shrink-0 flex flex-col">
                      <div className="bg-background pb-3 space-y-3">
                        <div className="flex items-center gap-2 px-1">
                          <div className={cn('w-2 h-2 rounded-full', column.color)} />
                          <h3 className="font-medium text-sm">{column.label}</h3>
                          <span className="text-xs text-muted-foreground">{columnMilestones.length}</span>
                        </div>
                      </div>

                      {renderMilestoneCards(columnMilestones)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()
      ) : isMobile ? (
        /* Mobile Milestone Cards */
        <div className="space-y-3">
          {sortedMilestones.length === 0 && (
            <Card className="p-4 border-dashed text-center">
              <p className="text-sm text-muted-foreground">No milestones yet</p>
            </Card>
          )}
          {sortedMilestones.map((milestone) => {
            const progress = getMilestoneProgress(milestone, tasks);
            const milestoneTasks = getMilestoneTasks(milestone, tasks);
            const status = getMilestoneStatus(milestone, tasks, issues);
            const label = statusConfig[status].label;
            const colors = mobileStatusColors[status];

            return (
              <Card
                key={milestone.id}
                className={cn(
                  'p-4 rounded-2xl cursor-pointer transition-shadow hover:shadow-md',
                  milestone.completed && 'opacity-75'
                )}
                onClick={() => handleMilestoneClick(milestone)}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className={cn(
                    'font-semibold text-base leading-tight',
                    milestone.completed && 'line-through text-muted-foreground'
                  )}>
                    {milestone.title}
                  </h3>
                  <Badge
                    variant="outline"
                    className={cn('shrink-0 border-transparent px-3 py-1 text-xs font-medium', colors.textColor, colors.bgColor)}
                  >
                    {label}
                  </Badge>
                </div>

                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1.5">
                  <Flag className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {milestone.date
                      ? `Target ${new Date(milestone.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                      : 'No target date'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 mt-3">
                  <span className="text-sm text-muted-foreground truncate">
                    {milestone.description || `${milestoneTasks.filter(t => t.status === 'done').length}/${milestoneTasks.length} tasks`}
                  </span>
                  <span className="text-base font-semibold shrink-0">{progress}%</span>
                </div>

                <Progress value={progress} className="h-2 mt-2" indicatorClassName={colors.barColor} />
              </Card>
            );
          })}
        </div>
      ) : (
        /* Timeline View */
        <Card className="p-3 sm:p-6 min-h-[calc(100vh-260px)] flex flex-col">
          {sortedMilestones.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 min-h-[calc(100vh-320px)]">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Flag className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">No milestones yet</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-3 sm:left-4 top-0 bottom-0 w-0.5 bg-border" />

              <div className="space-y-4 sm:space-y-6">
                {sortedMilestones.map((milestone, index) => {
                  const progress = getMilestoneProgress(milestone, tasks);
                  const milestoneTasks = getMilestoneTasks(milestone, tasks);
                  const milestoneIssues = getMilestoneIssues(milestone.id, issues);
                  const linkedModules = getMilestoneModules(milestone, modules);
                  const status = getMilestoneStatus(milestone, tasks, issues);
                  const StatusIcon = statusConfig[status].icon;
                  const isExpanded = expandedMilestones.includes(milestone.id);
                  const daysUntil = milestone.date ? Math.ceil((new Date(milestone.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : NaN;
                  const displayTitle = isMobile && milestone.title.length > 22
                    ? `${milestone.title.slice(0, 22)}...`
                    : milestone.title;

                  return (
                    <Collapsible key={milestone.id} open={isExpanded} onOpenChange={() => toggleExpanded(milestone.id)}>
                      <div className="relative pl-8 sm:pl-10">
                        {/* Timeline dot */}
                        <div className={cn(
                          'absolute left-1 sm:left-2 top-0.5 sm:top-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 border-background flex items-center justify-center',
                          statusConfig[status].color
                        )}>
                          {milestone.completed && <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-white" />}
                        </div>

                        {/* Milestone card */}
                        <Card className={cn(
                          'p-3 sm:p-4 transition-shadow hover:shadow-md cursor-pointer',
                          milestone.completed && 'opacity-75'
                        )}
                          onClick={() => handleMilestoneClick(milestone)}
                        >
                          <div className="space-y-2.5 sm:space-y-3">
                            {/* Header */}
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                                <CollapsibleTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </Button>
                                </CollapsibleTrigger>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className={cn(
                                      'font-medium text-sm sm:text-base line-clamp-2 break-words min-w-0',
                                      milestone.completed && 'line-through text-muted-foreground'
                                    )}>
                                      {displayTitle}
                                    </h3>
                                    <Badge variant="outline" className={cn('text-xs shrink-0', statusConfig[status].textColor)}>
                                      <StatusIcon className="h-3 w-3 mr-1" />
                                      {statusConfig[status].label}
                                    </Badge>
                                  </div>
                                  {milestone.description && (
                                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2 break-words">{milestone.description}</p>
                                  )}
                                </div>
                              </div>
                              <div className="pl-8 sm:pl-0 text-xs sm:text-sm sm:text-right shrink-0">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                                  {milestone.date ? new Date(milestone.date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  }) : 'No target date'}
                                </div>
                                {!milestone.completed && !isNaN(daysUntil) && (
                                  <div className={cn(
                                    'text-xs mt-0.5 sm:mt-1',
                                    daysUntil < 0 ? 'text-destructive' : daysUntil < 7 ? 'text-orange-500' : 'text-muted-foreground'
                                  )}>
                                    {daysUntil < 0
                                      ? `${Math.abs(daysUntil)} days overdue`
                                      : daysUntil === 0
                                        ? 'Due today'
                                        : `${daysUntil} days left`
                                    }
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Progress and stats */}
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 pl-8 sm:pl-9">
                              <div className="flex-1 flex items-center gap-3">
                                <Progress value={progress} className="h-2 flex-1 sm:max-w-[200px]" />
                                <span className="text-sm font-medium shrink-0">{progress}%</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs sm:text-sm text-muted-foreground">
                                <span>{milestoneTasks.filter(t => t.status === 'done').length}/{milestoneTasks.length} tasks</span>
                                {milestoneIssues.length > 0 && (
                                  <Badge variant="destructive" className="text-xs gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {milestoneIssues.length} issue{milestoneIssues.length > 1 ? 's' : ''}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Expanded content */}
                            <CollapsibleContent>
                              <div className="pl-8 sm:pl-9 pt-3 space-y-3">
                                <div className="text-sm font-medium text-muted-foreground">Linked Tasks</div>
                                <div className="space-y-2">
                                  {milestoneTasks.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic">No tasks linked to this milestone</p>
                                  ) : (
                                    milestoneTasks.map(task => (
                                      <div key={task.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                                        <div className="flex items-center gap-2">
                                          <div className={cn(
                                            'w-2 h-2 rounded-full',
                                            task.status === 'done' ? 'bg-status-done' :
                                              task.status === 'in-progress' ? 'bg-status-in-progress' :
                                                task.status === 'blocked' ? 'bg-status-blocked' :
                                                  'bg-status-todo'
                                          )} />
                                          <span className={cn(
                                            'text-sm',
                                            task.status === 'done' && 'line-through text-muted-foreground'
                                          )}>
                                            {task.title}
                                          </span>
                                        </div>
                                        <Badge variant="outline" className="text-xs capitalize">
                                          {task.status.replace('-', ' ')}
                                        </Badge>
                                      </div>
                                    ))
                                  )}
                                </div>

                                {/* Linked Modules */}
                                {linkedModules.length > 0 && (
                                  <>
                                    <div className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mt-4">
                                      <Box className="h-4 w-4" />
                                      Linked Modules
                                    </div>
                                    <div className="space-y-2">
                                      {linkedModules.map(module => {
                                        const moduleProgress = getModuleProgress(module.id, tasks);
                                        return (
                                          <div key={module.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                                            <div className="flex items-center gap-2">
                                              <div
                                                className="w-2.5 h-2.5 rounded-full"
                                                style={{ backgroundColor: module.color || '#6B7280' }}
                                              />
                                              <span className="text-sm">{module.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Progress value={moduleProgress} className="h-1.5 w-16" />
                                              <span className="text-xs text-muted-foreground">{moduleProgress}%</span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </>
                                )}

                                {milestoneIssues.length > 0 && (
                                  <>
                                    <div className="text-sm font-medium text-destructive flex items-center gap-1.5 mt-4">
                                      <AlertTriangle className="h-4 w-4" />
                                      Blocking Issues
                                    </div>
                                    <div className="space-y-2">
                                      {milestoneIssues.map(issue => (
                                        <div key={issue.id} className="flex items-center justify-between p-2 bg-destructive/10 rounded-md border border-destructive/20">
                                          <span className="text-sm">{issue.title}</span>
                                          <Badge variant="outline" className="text-xs capitalize border-destructive/30 text-destructive">
                                            {issue.severity}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Card>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )
      }

      {/* Milestone Detail Modal */}
      {
        isModalOpen && selectedMilestone && (
          <MilestoneDetailModal
            milestone={selectedMilestone}
            tasks={tasks}
            issues={issues}
            modules={modules}
            assignableMembers={assignableMembers}
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onUpdate={handleMilestoneUpdateFromModal}
            onDelete={onMilestoneDelete}
            onIssueUpdate={onIssueUpdate}
          />
        )
      }

      {/* Add Milestone Dialog */}
      {
        isAddDialogOpen && (
          <AddMilestoneDialog
            isOpen={isAddDialogOpen}
            onClose={() => {
              setInternalIsAddDialogOpen(false);
              onAddDialogClose?.();
            }}
            onAdd={handleAddMilestone}
            tasks={tasks}
            modules={modules}
            issues={issues}
            assignableMembers={assignableMembers}
            projectStartDate={projectStartDate}
          />
        )
      }
    </div >
  );
}
