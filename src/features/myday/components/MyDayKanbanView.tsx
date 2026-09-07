import { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { resolveFileUrl } from '@/utils/fileUrl';
import { useIsMobile } from '@/hooks/use-mobile';
import { useKanbanEdgeAutoScroll, resolveKanbanColumnIdAtPoint } from '@/hooks/useKanbanEdgeAutoScroll';
import { MobileKanbanColumn } from '@/components/shared/MobileKanbanColumn';
import { Check, CheckSquare, Bug } from 'lucide-react';
import { MyDayItem, KanbanColumnId, groupItemsByKanbanStatus, formatTaskDateRange, isMyDayItemComplete } from '../utils/myDayUtils';
import { TaskStatus } from '@/types';
import { toast } from 'sonner';
import { logger } from '@/services/monitoring/logger';

interface MyDayKanbanViewProps {
  tasks: MyDayItem[];
  onTaskClick: (item: MyDayItem) => void;
  onStatusUpdate: (taskId: string, status: TaskStatus) => void;
}

// The status each column writes back when a card is dropped on it. The
// caller (MyDay.tsx's handleStatusUpdate) derives the right IssueStatus from
// this for issue cards — mirrored here so the optimistic local update shows
// the same status.
// 'dependency' is intentionally absent: it's a derived blocked-state, not a
// real status to write back, so it's never a valid drop destination.
const STATUS_BY_COLUMN: Partial<Record<KanbanColumnId, TaskStatus>> = {
  todo: 'todo',
  inProgress: 'in-progress',
  completed: 'done',
};

const ISSUE_STATUS_BY_COLUMN: Partial<Record<KanbanColumnId, string>> = {
  todo: 'open',
  inProgress: 'in-progress',
  completed: 'resolved',
};

const COLUMNS: { id: KanbanColumnId; label: string; color: string }[] = [
  { id: 'dependency', label: 'Dependency', color: 'bg-status-blocked' },
  { id: 'todo', label: 'To Do', color: 'bg-status-todo' },
  { id: 'inProgress', label: 'In Progress', color: 'bg-status-in-progress' },
  { id: 'completed', label: 'Completed', color: 'bg-status-done' },
];

const priorityColors: Record<string, string> = {
  critical: 'bg-priority-critical text-white',
  high: 'bg-priority-high text-white',
  major: 'bg-priority-high text-white',
  medium: 'bg-priority-medium text-white',
  minor: 'bg-priority-medium text-white',
  low: 'bg-priority-low text-white',
  trivial: 'bg-priority-low text-white',
};

const moduleColors: Record<string, string> = {
  hardware: 'border-l-module-hardware',
  software: 'border-l-module-software',
  firmware: 'border-l-module-firmware',
  testing: 'border-l-module-testing',
};

export function MyDayKanbanView({ tasks: initialTasks, onTaskClick, onStatusUpdate }: MyDayKanbanViewProps) {
  const [localTasks, setLocalTasks] = useState<MyDayItem[]>(initialTasks);
  const isMobile = useIsMobile();

  useEffect(() => {
    setLocalTasks(initialTasks);
  }, [initialTasks]);

  const grouped = useMemo(() => groupItemsByKanbanStatus(localTasks), [localTasks]);
  const columns = COLUMNS.map((config) => ({ ...config, tasks: grouped[config.id] }));

  const { containerRef: boardScrollRef, handleDragStart, handleDragEnd: handleAutoScrollDragEnd, getLastPointerPosition } = useKanbanEdgeAutoScroll();

  const handleDragEnd = (result: DropResult) => {
    const pointer = getLastPointerPosition();
    handleAutoScrollDragEnd();
    if (!result.destination) return;

    const { source, destination, draggableId } = result;

    // Auto-scrolling the board mid-drag leaves @hello-pangea/dnd's cached
    // position for the card stale, so `destination.droppableId` can name a
    // column that's no longer under the pointer. Hit-test the real DOM
    // element at the pointer's last known position and prefer that.
    const hitColumnId = pointer ? resolveKanbanColumnIdAtPoint(pointer.x, pointer.y) : undefined;
    const destinationColumnId = (hitColumnId ?? destination.droppableId) as KanbanColumnId;

    if (source.droppableId === destinationColumnId || destinationColumnId === 'dependency') return;

    const newStatus = STATUS_BY_COLUMN[destinationColumnId];
    if (!newStatus) return;

    const itemIndex = localTasks.findIndex((t) => t.id === draggableId);
    if (itemIndex === -1) return;

    const prevTasks = localTasks;
    const item = localTasks[itemIndex];
    let updatedItem: MyDayItem = item;
    if (item.itemType === 'task' && item.originalTask) {
      updatedItem = { ...item, status: newStatus, originalTask: { ...item.originalTask, status: newStatus } };
    } else if (item.itemType === 'issue' && item.originalIssue) {
      const mappedStatus = ISSUE_STATUS_BY_COLUMN[destinationColumnId] ?? 'open';
      updatedItem = { ...item, status: mappedStatus, originalIssue: { ...item.originalIssue, status: mappedStatus as typeof item.originalIssue.status } };
    }

    // Optimistic local update to avoid the card blinking back to its old column.
    setLocalTasks([...localTasks.slice(0, itemIndex), ...localTasks.slice(itemIndex + 1), updatedItem]);

    Promise.resolve(onStatusUpdate(draggableId, newStatus)).catch((err) => {
      logger.error('Status update failed', err);
      setLocalTasks(prevTasks);
      toast.error('Failed to update status');
    });
  };

  const handleCompleteTask = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onStatusUpdate(taskId, 'done');
  };

  const renderCardsDroppable = (column: { id: KanbanColumnId; tasks: MyDayItem[] }) => (
    <Droppable droppableId={column.id} type="TASK" isDropDisabled={column.id === 'dependency'}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          data-kanban-column-id={column.id}
          className={cn(
            'flex flex-col gap-2 flex-1 min-h-0 h-full p-2 rounded-lg overflow-y-auto',
            snapshot.isDraggingOver ? 'bg-muted/50' : 'bg-muted/30',
          )}
        >
          {column.tasks.map((task, taskIndex) => {
            const isComplete = isMyDayItemComplete(task.status);
            return (
              <Draggable key={task.id} draggableId={task.id} index={taskIndex} isDragDisabled={column.id === 'dependency'}>
                {(dragProvided, dragSnapshot) => (
                  <Card
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className={cn(
                      'p-3 border-l-4 relative group hover:shadow-md',
                      column.id === 'dependency' ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
                      task.itemType === 'task' && task.originalTask?.module
                        ? moduleColors[task.originalTask.module] || 'border-l-muted'
                        : 'border-l-muted',
                      dragSnapshot.isDragging && 'shadow-lg',
                    )}
                    onClick={() => onTaskClick(task)}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="relative flex flex-1 items-start min-w-0 overflow-hidden">
                          {isComplete ? (
                            <div className="absolute left-0 top-0 z-10 flex items-center justify-center w-4 h-4">
                              <div className="h-4 w-4 rounded-full bg-status-done/20 flex items-center justify-center">
                                <Check className="h-3 w-3 text-status-done" />
                              </div>
                            </div>
                          ) : (
                            <div className="absolute left-0 top-0 z-10 flex items-center justify-center w-4 h-4">
                              <button
                                onClick={(e) => handleCompleteTask(task.id, e)}
                                className="h-4 w-4 rounded-full border border-foreground/30 flex items-center justify-center hover:border-foreground hover:bg-muted transition-all bg-background"
                                aria-label="Mark task complete"
                              >
                                <span className="sr-only">Mark complete</span>
                              </button>
                            </div>
                          )}
                          <h4 className="text-sm font-medium leading-tight truncate translate-x-6">
                            {task.title}
                          </h4>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[9px] px-1 py-0 h-4 flex items-center gap-0.5',
                              task.itemType === 'task' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200',
                            )}
                          >
                            {task.itemType === 'task' ? (
                              <>
                                <CheckSquare className="h-2.5 w-2.5" />
                                <span>Task</span>
                              </>
                            ) : (
                              <>
                                <Bug className="h-2.5 w-2.5" />
                                <span>Issue</span>
                              </>
                            )}
                          </Badge>
                          {task.priority && (
                            <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', priorityColors[task.priority])}>
                              {task.priority}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {task.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 text-left">{task.description}</p>
                      )}

                      <div className="flex items-center justify-between pt-2">
                        {task.assignees && task.assignees.length > 0 && (
                          <div className="flex -space-x-2">
                            {task.assignees.slice(0, 3).map((assignee) => (
                              <Avatar key={assignee.id} className="h-5 w-5 border-2 border-background">
                                <AvatarImage src={resolveFileUrl(assignee.avatar) ?? assignee.avatar} alt={assignee.name} />
                                <AvatarFallback className="text-[9px] bg-muted">{assignee.initials}</AvatarFallback>
                              </Avatar>
                            ))}
                            {task.assignees.length > 3 && (
                              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center border-2 border-background z-10">
                                <span className="text-[8px] text-muted-foreground font-medium">+{task.assignees.length - 3}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {task.dueDate && (
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {formatTaskDateRange(task.originalTask?.startDate, task.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                )}
              </Draggable>
            );
          })}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );

  return (
    <div className="h-full min-h-0 w-full flex flex-col flex-1 min-w-0">
      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {isMobile ? (
          <div className="flex flex-col gap-3 w-full flex-1 min-h-0 overflow-y-auto">
            {columns.map((column) => (
              <MobileKanbanColumn
                key={column.id}
                label={column.label}
                count={column.tasks.length}
                countLabel="tasks"
                dot={<div className={cn('w-2 h-2 rounded-full shrink-0', column.color)} />}
                defaultExpanded
              >
                {renderCardsDroppable(column)}
              </MobileKanbanColumn>
            ))}
          </div>
        ) : (
          <div ref={boardScrollRef} className="w-full h-full min-h-0 flex flex-col flex-1 pb-2 overflow-x-auto md:overflow-visible touch-pan-x">
            <div className="grid grid-cols-4 gap-4 h-full min-h-0 flex-1 min-w-[960px] md:min-w-0">
              {columns.map((column) => (
                <div key={column.id} className="flex flex-col h-full min-h-0 flex-1">
                  <div className="flex-shrink-0 bg-background pb-3 space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <div className={cn('w-2 h-2 rounded-full', column.color)} />
                      <h3 className="font-medium text-sm">{column.label}</h3>
                      <span className="text-xs text-muted-foreground">{column.tasks.length}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{renderCardsDroppable(column)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DragDropContext>
    </div>
  );
}
