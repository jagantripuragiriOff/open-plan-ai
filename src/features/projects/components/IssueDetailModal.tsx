import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Issue,
  Task,
  IssueSeverity,
  TeamMember,
} from '@/types';
import { IssueDetailContent, IssueDetailContentHandle } from './IssueDetailContent';
import { Button } from '@/components/ui/button';
import { DialogClose } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Trash2, Maximize2, MoreVertical, Check, ChevronLeft, X, Pencil } from 'lucide-react';
import { useState, useLayoutEffect, useMemo, useRef } from 'react';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { toast } from 'sonner';
import { logger } from '@/services/monitoring/logger';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn, getDisplayId } from '@/lib/utils';
import { serializeBlocksForDirtyCheck } from '@/lib/descriptionBlocks';

interface IssueDetailModalProps {
  issue: Issue | null;
  tasks?: Task[];
  teamMembers?: TeamMember[];
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (issue: Issue) => void;
  onDelete?: (issueId: string) => void;
  userProjectRole?: string;
  mode?: 'view' | 'create';
  onCreate?: (issue: Issue, pendingFiles?: File[]) => void;
  /** Shown as a read-only "Project" field when provided. Only pass this from contexts (like My Day) where the issue's project isn't already implied by the surrounding page. */
  projectName?: string;
  /** Project's short display-ID prefix — renders a "{projectCode}-I-{number}" pill next to the title when both this and the issue's number are available. */
  projectCode?: string;
}

const serializeIssueForDirtyCheck = (issue: Issue): string => {
  const attachmentSnapshot = (issue.attachments || [])
    .map((a) => ({ id: a.id, filename: a.filename, fileType: a.fileType, fileSize: a.fileSize, url: a.url }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return JSON.stringify({
    title: issue.title || '',
    description: issue.description || '',
    descriptionBlocks: serializeBlocksForDirtyCheck(issue.descriptionBlocks),
    category: issue.category,
    categoryOther: issue.categoryOther || '',
    severity: issue.severity,
    status: issue.status,
    moduleId: issue.moduleId || null,
    dueDate: issue.dueDate || null,
    resolution: issue.resolution || '',
    assigneeIds: (issue.assignees || []).map((a) => a.id).sort(),
    tags: [...(issue.tags || [])].sort(),
    checklist: (issue.checklist || []).map((item) => ({ id: item.id, text: item.text, completed: item.completed })),
    blocksTaskIds: [...(issue.blocksTaskIds || [])].sort(),
    blocksMilestoneIds: [...(issue.blocksMilestoneIds || [])].sort(),
    attachments: attachmentSnapshot,
    videoLinks: (issue.videoLinks || []).map((v) => v.id).sort(),
  });
};

const severityOptions: { value: IssueSeverity; label: string; color: string }[] = [
  { value: 'critical', label: 'Critical', color: 'bg-destructive text-destructive-foreground' },
  { value: 'major', label: 'Major', color: 'bg-orange-500 text-white' },
  { value: 'minor', label: 'Minor', color: 'bg-yellow-500 text-black' },
  { value: 'trivial', label: 'Trivial', color: 'bg-muted text-muted-foreground' },
];

export function IssueDetailModal({
  issue,
  tasks = [],
  teamMembers = [],
  isOpen,
  onClose,
  onUpdate,
  onDelete,
  userProjectRole,
  mode = 'view',
  onCreate,
  projectName,
  projectCode,
}: IssueDetailModalProps) {
  const navigate = useNavigate();
  const { user: profile } = useAuth();
  const isMobile = useIsMobile();
  const [editedIssue, setEditedIssue] = useState<Issue | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [hasPendingAttachmentDeletions, setHasPendingAttachmentDeletions] = useState(false);
  const [isMobileEditMode, setIsMobileEditMode] = useState(false);
  const initialSnapshotRef = useRef<string>('');
  const issueContentRef = useRef<IssueDetailContentHandle>(null);
  const { canEditResource, canDeleteResource } = useProjectPermissions(editedIssue?.projectId);
  const canEditIssue = useMemo(
    () =>
      canEditResource({
        createdBy: editedIssue?.reportedBy?.id,
        assigneeIds: (editedIssue?.assignees || []).map((a) => a.id),
      }),
    [canEditResource, editedIssue?.reportedBy?.id, editedIssue?.assignees]
  );
  const canDeleteIssue = useMemo(
    () => canDeleteResource({ createdBy: editedIssue?.reportedBy?.id }),
    [canDeleteResource, editedIssue?.reportedBy?.id]
  );
  const editLockTitle = 'You can only edit items you created or are assigned to';
  const deleteLockTitle = 'Only the issue reporter or a project/organization Admin can delete this issue';

  // useLayoutEffect (not useEffect) — this runs synchronously before the
  // browser paints, so switching to a different issue while the modal is
  // already open (or reopening the same modal instance for a new one)
  // doesn't briefly flash the PREVIOUS issue's content for a frame before
  // this resets editedIssue to the new one.
  useLayoutEffect(() => {
    if (isOpen && issue) {
      setEditedIssue(issue);
      setPendingFiles([]);
      setHasPendingAttachmentDeletions(false);
      initialSnapshotRef.current = serializeIssueForDirtyCheck(issue);
    }
    if (!isOpen) {
      setIsMobileEditMode(false);
    }
  }, [isOpen, issue?.id]);

  if (!editedIssue) return null;

  const hasValidCategory = !!editedIssue.category && (editedIssue.category !== 'other' || !!editedIssue.categoryOther?.trim());

  const isDirty =
    pendingFiles.length > 0 ||
    hasPendingAttachmentDeletions ||
    (initialSnapshotRef.current !== '' && serializeIssueForDirtyCheck(editedIssue) !== initialSnapshotRef.current);

  const handleContentUpdate = (updated: Issue) => {
    setEditedIssue(updated);
    if (
      initialSnapshotRef.current !== '' &&
      (updated.attachments || []).length > 0 &&
      !hasPendingAttachmentDeletions
    ) {
      try {
        const parsed = JSON.parse(initialSnapshotRef.current);
        if ((parsed.attachments || []).length === 0) {
          initialSnapshotRef.current = serializeIssueForDirtyCheck(updated);
        }
      } catch {}
    }
  };

  const attemptClose = () => {
    if (isDirty) {
      setShowUnsavedConfirm(true);
    } else {
      onClose();
    }
  };

  const handleDelete = () => {
    if (onDelete && editedIssue) {
      onDelete(editedIssue.id);
      setShowDeleteConfirm(false);
      onClose();
    }
  };

  const handleUpdateIssue = async () => {
    if (editedIssue && isDirty) {
      await issueContentRef.current?.commitPendingDeletions();
      await issueContentRef.current?.commitPendingComments();
      await issueContentRef.current?.commitPendingFiles();
      onUpdate(editedIssue);
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && attemptClose()}>
      <DialogContent
        hideClose
        className={cn(
          'p-0 flex flex-col gap-0 overflow-hidden !duration-0 data-[state=open]:!animate-none data-[state=closed]:!animate-none',
          isMobile
            ? 'inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-[100dvh] max-w-none max-h-none rounded-none border-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom duration-300 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100'
            : 'max-w-4xl max-h-[90vh]'
        )}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >

        {/* Header - create mode */}
        {mode === 'create' && (
          <DialogHeader className="px-6 py-4 border-b flex-row items-center justify-between">
            <DialogTitle>Create New Issue</DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </DialogHeader>
        )}
        {/* Header - view mode, mobile: full-screen page with back + "..." actions menu */}
        {mode !== 'create' && isMobile && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0 bg-background">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={attemptClose}
                className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 text-foreground active:bg-muted/70 transition-colors"
                aria-label="Back"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <DialogTitle className="text-[15px] font-bold truncate">Issue Details</DialogTitle>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 text-foreground active:bg-muted/70 transition-colors"
                  aria-label="Issue actions"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!isMobileEditMode ? (
                  <DropdownMenuItem
                    onClick={() => setIsMobileEditMode(true)}
                    disabled={!canEditIssue}
                    title={canEditIssue ? undefined : editLockTitle}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit Issue
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={handleUpdateIssue}
                    disabled={!editedIssue.title.trim() || !canEditIssue || !hasValidCategory || !isDirty}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Update Issue
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={!canDeleteIssue}
                    title={canDeleteIssue ? undefined : deleteLockTitle}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Issue
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {/* Header - view mode, desktop: label + expand + close */}
        {mode !== 'create' && !isMobile && (
          <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-sm font-medium text-muted-foreground">Issue</DialogTitle>
              {getDisplayId(projectCode, 'I', editedIssue?.number) && (
                <span className="font-mono font-semibold text-[12px] text-blue-500">
                  {getDisplayId(projectCode, 'I', editedIssue?.number)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Expand"
                onClick={() => {
                  if (editedIssue.projectId) {
                    navigate(`/projects/${editedIssue.projectId}/issues/${editedIssue.id}/full`);
                  } else {
                    logger.warn('Could not expand issue: missing projectId', { issueId: editedIssue.id });
                  }
                }}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </div>
        )}
        <DialogDescription className="sr-only">
          View and edit details for issue {editedIssue?.title || 'New Issue'}
        </DialogDescription>
        <ScrollArea className={cn(
          'flex-1 overflow-y-auto w-full',
          isMobile && mode !== 'create' && isMobileEditMode && 'max-h-[calc(100dvh-129px)]'
        )}>
          <div className="p-6">
            <IssueDetailContent
              ref={issueContentRef}
              issue={editedIssue}
              tasks={tasks}
              teamMembers={teamMembers}
              projectName={projectName}
              projectCode={projectCode}
              onUpdate={handleContentUpdate}
              onDelete={undefined}
              isDraft={true} // Always pretend it's draft to enable auto-callbacks to onUpdate instead of parent
              mode={mode}
              onPendingFilesChange={setPendingFiles}
              onPendingAttachmentDeletionsChange={setHasPendingAttachmentDeletions}
              onExpand={undefined}
              isMobileEditMode={mode !== 'create' ? isMobileEditMode : undefined}
            />
          </div>
        </ScrollArea>

        {mode !== 'create' && isMobile && isMobileEditMode && (
          <div className="px-4 py-3 border-t bg-background z-10 w-full shrink-0">
            <Button
              className="w-full"
              onClick={handleUpdateIssue}
              disabled={!editedIssue.title.trim() || !canEditIssue || !hasValidCategory || !isDirty}
            >
              Update Issue
            </Button>
          </div>
        )}

        {mode === 'create' && (
          <div className="p-4 border-t flex justify-end gap-2 bg-background z-10 w-full">
            <Button variant="outline" onClick={attemptClose}>Cancel</Button>
            <Button
              onClick={() => onCreate?.(editedIssue!, pendingFiles)}
              disabled={!editedIssue.title.trim() || !hasValidCategory}
            >
              Create Issue
            </Button>
          </div>
        )}

        {mode === 'view' && !isMobile && (
          <div className="p-4 border-t flex justify-end gap-2 bg-background z-10 w-full">
            <div className="flex-1">
              {/* Delete button — only the issue reporter or a project/organization Admin can delete */}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={!canDeleteIssue}
                  title={canDeleteIssue ? 'Delete this issue' : deleteLockTitle}
                  className={cn(
                    'text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-2',
                    !canDeleteIssue && 'cursor-not-allowed opacity-60'
                  )}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Issue
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={attemptClose}>Cancel</Button>
            <Button
              onClick={handleUpdateIssue}
              disabled={!editedIssue.title.trim() || !canEditIssue || !hasValidCategory || !isDirty}
              title={canEditIssue ? undefined : (isDirty ? editLockTitle : 'No changes to save')}
            >
              Update Issue
            </Button>
          </div>
        )}
      </DialogContent>
      <ConfirmationDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={handleDelete}
        title="Delete Issue"
        description="Are you sure you want to delete this issue? This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
      />
      <ConfirmationDialog
        open={showUnsavedConfirm}
        onOpenChange={setShowUnsavedConfirm}
        onConfirm={onClose}
        title="Discard changes?"
        description="You have unsaved changes. Are you sure you want to discard them?"
        confirmText="Discard"
        cancelText="Keep Editing"
        variant="destructive"
        extraActionText={isMobile ? "Update Issue" : undefined}
        onExtraAction={isMobile ? () => {
          if (!editedIssue.title.trim() || !canEditIssue || !hasValidCategory) {
            toast.error('Please fix required fields before updating.');
            return;
          }
          handleUpdateIssue();
        } : undefined}
      />
    </Dialog>
  );
}
