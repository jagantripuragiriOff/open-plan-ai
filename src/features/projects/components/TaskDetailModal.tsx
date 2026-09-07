import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { attachmentsService } from '@/services/attachments.service';
import { format, isBefore, isAfter, parseISO, startOfDay } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LinkHighlightTextarea } from '@/components/ui/LinkHighlightTextarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, getDisplayId } from '@/lib/utils';
import {
  X,
  Calendar as CalendarIcon,
  Paperclip,
  MessageSquare,
  Link2,
  Plus,
  Trash2,
  Upload,
  FileText,
  Image as ImageIcon,
  File,
  Download,
  CheckSquare,
  User,
  Tag,
  AlertCircle,
  AlertTriangle,
  Info,
  Pencil,
  Check,
  Loader2,
  Send,
  Video,
  Play,
  FolderKanban,
  ChevronLeft,
  MoreVertical,
  Target,
} from 'lucide-react';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { commentsService } from '@/services/comments.service';
import { useNotifications } from '@/hooks/useNotifications';
import {
  Task,
  TaskStatus,
  Priority,
  ModuleType,
  TeamMember,
  ChecklistItem,
  Attachment,
  Comment,
  VideoLink,
  Milestone,
} from '@/types';
import { useOrganizationMembers } from '@/hooks/useProjectTeam';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logger } from '@/services/monitoring/logger';
import { resolveFileUrl } from '@/utils/fileUrl';
import { renamePastedImageFile } from '@/utils/pastedFile';
import { FilePreviewDialog, FilePreviewTarget, getVideoThumbnail } from '@/components/FilePreviewDialog';
import { useProjectTags, useCreateTag, useUpdateTag, useDeleteTag } from '@/hooks/useProjectTags';
import { getFallbackTagColor } from '@/lib/tagColors';
import { Switch } from '@/components/ui/switch';
import { SlashBlockEditor, EditorBlock } from '@/components/ui/SlashBlockEditor';
import { blocksToPlainText, hasBlockContent, plainTextToBlocks, serializeBlocksForDirtyCheck } from '@/lib/descriptionBlocks';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { ISSUE_SEVERITY_OPTIONS, ISSUE_SEVERITY_DISPLAY } from './issueSeverity';
import { formatModifiedFields } from './modifiedFields';

// Utility function to convert Date to YYYY-MM-DD format (date-only, no timezone shift)
const toDateOnly = (date: Date | undefined | null): string | undefined => {
  if (!date) return undefined;
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface TaskDetailModalProps {
  task: Task | null;
  allTasks: Task[];
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (task: Task) => Promise<void> | void;
  onBatchUpdate?: (updates: Array<{ id: string; updates: Partial<Task> }>) => Promise<void> | void;
  onDelete?: (taskId: string) => void;
  userProjectRole?: string;
  mode?: 'view' | 'create';
  onCreate?: (task: Task, pendingFiles?: File[]) => void;
  modules?: { id: string; name: string; type: ModuleType }[];
  milestones?: Milestone[];
  projectId?: string;
  onAddModule?: () => void;
  assignableMembers?: TeamMember[];
  statusOptions?: Array<{ value: string; label: string; color?: string }>;
  /** Shown as a read-only "Project" field in the metadata grid when provided. Only pass this from contexts (like My Day) where the task's project isn't already implied by the surrounding page. */
  projectName?: string;
  /** Project's short display-ID prefix — renders a "{projectCode}-T-{number}" pill next to the title when both this and the task's number are available. */
  projectCode?: string;
  /** Pre-populates the Assigned To field when creating a new task (mode="create"). Opt-in — leave unset to keep the field empty by default. */
  defaultAssignees?: TeamMember[];
}

/** Renders a status colour dot that works for both hex colours and Tailwind classes. */
function StatusDot({ color }: { color: string }) {
  if (!color) return <span className="w-2 h-2 rounded-full inline-block bg-muted-foreground/60" />;
  if (color.startsWith('#') || color.startsWith('rgb')) {
    return <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} />;
  }
  return <span className={cn('w-2 h-2 rounded-full inline-block shrink-0', color)} />;
}

const MAX_TAG_LENGTH = 20;

const DEFAULT_STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'backlog', label: 'Backlog', color: 'bg-[#6b7280]' },
  { value: 'todo', label: 'To Do', color: 'bg-[#3b82f6]' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-[#f59e0b]' },
  { value: 'in_review', label: 'In Review', color: 'bg-[#8b5cf6]' },
  { value: 'done', label: 'Done', color: 'bg-[#10b981]' },
];


const getFileIcon = (fileType: string) => {
  if (fileType.startsWith('image/')) return ImageIcon;
  if (fileType.startsWith('video/')) return Video;
  if (fileType.includes('pdf') || fileType.includes('document')) return FileText;
  return File;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const serializeTaskForDirtyCheck = (task: Task): string => {
  const attachmentSnapshot = (task.attachments || [])
    .map(a => ({
      id: a.id,
      filename: a.filename,
      fileType: a.fileType,
      fileSize: a.fileSize,
      url: a.url,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return JSON.stringify({
    title: task.title || '',
    description: task.description || '',
    descriptionBlocks: serializeBlocksForDirtyCheck(task.descriptionBlocks),
    status: task.status,
    priority: task.priority,
    module: task.module || null,
    moduleId: task.moduleId || null,
    moduleIds: [...(task.moduleIds || [])].sort(),
    milestoneId: task.milestoneId || null,
    dueDate: task.dueDate || null,
    startDate: task.startDate || null,
    assigneeIds: (task.assignees || []).map(a => a.id).sort(),
    tags: [...(task.tags || [])].sort(),
    checklist: (task.checklist || []).map(item => ({
      id: item.id,
      text: item.text,
      completed: item.completed,
      showInBoardView: item.showInBoardView ?? false,
    })),
    blockedBy: [...(task.blockedBy || [])].sort(),
    attachments: attachmentSnapshot,
    videoLinks: (task.videoLinks || []).map(v => v.id).sort(),
  });
};

export const TaskDetailModal = ({
  task,
  allTasks,
  isOpen,
  onClose,
  onUpdate,
  onBatchUpdate,
  onDelete,
  userProjectRole,
  mode = 'view',
  onCreate,
  modules = [],
  milestones = [],
  projectId,
  onAddModule,
  assignableMembers,
  statusOptions: providedStatusOptions,
  projectName,
  projectCode,
  defaultAssignees,
}: TaskDetailModalProps) => {
  const { user: profile } = useAuth();
  const isMobile = useIsMobile();
  const { currentOrganization } = useOrganization();
  const { data: organizationMembers = [] } = useOrganizationMembers(currentOrganization?.id);
  const availableAssignees = assignableMembers ?? organizationMembers;
  const currentOrganizationMembership = organizationMembers.find((m) => m.id === profile?.id);
  const currentOrganizationRole = (currentOrganizationMembership?.role || '').toLowerCase();
  const [editedTask, setEditedTask] = useState<Task>(task || {
    id: '',
    title: '',
    description: '',
    status: 'todo',
    priority: 'minor',
    module: '' as ModuleType,
    assignees: defaultAssignees ?? [],
    tags: [],
    checklist: [],
    blockedBy: [],
    comments: [],
    attachments: [],
    videoLinks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const [, setIsLoadingComments] = useState(false);
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistValue, setEditingChecklistValue] = useState('');
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentValue, setEditingCommentValue] = useState('');
  const [pendingNewCommentIds, setPendingNewCommentIds] = useState<Set<string>>(new Set());
  const [pendingEditedComments, setPendingEditedComments] = useState<Map<string, string>>(new Map());
  const [pendingDeletedCommentIds, setPendingDeletedCommentIds] = useState<Set<string>>(new Set());
  const [isAssigneePopoverOpen, setIsAssigneePopoverOpen] = useState(false);
  const [isModulePopoverOpen, setIsModulePopoverOpen] = useState(false);
  const [isBlockingTaskPopoverOpen, setIsBlockingTaskPopoverOpen] = useState(false);
  const [isBlockedByTaskPopoverOpen, setIsBlockedByTaskPopoverOpen] = useState(false);
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
  const [isStartDatePopoverOpen, setIsStartDatePopoverOpen] = useState(false);
  const [isDueDatePopoverOpen, setIsDueDatePopoverOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);
  const [editingTagValue, setEditingTagValue] = useState('');
  const [editingTagOriginal, setEditingTagOriginal] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingFileUrls, setPendingFileUrls] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [isAdvancedDescription, setIsAdvancedDescription] = useState(false);
  const [initialTaskSnapshot, setInitialTaskSnapshot] = useState('');
  const [previewingFile, setPreviewingFile] = useState<FilePreviewTarget | null>(null);
  const [videoLinkInput, setVideoLinkInput] = useState('');
  const [initialBlockedByIds, setInitialBlockedByIds] = useState<string[]>([]);
  const [initialBlockingToIds, setInitialBlockingToIds] = useState<string[]>([]);
  const [initializedForKey, setInitializedForKey] = useState<string | null>(null);
  const [isMobileEditMode, setIsMobileEditMode] = useState(false);
  const formSessionKey = `${mode}:${task?.id || 'create'}`;
  const statusOptions = useMemo(() => {
    if (!providedStatusOptions || providedStatusOptions.length === 0) {
      return DEFAULT_STATUS_OPTIONS;
    }

    const deduped = new Map<string, { value: string; label: string; color: string }>();
    providedStatusOptions.forEach((option) => {
      if (!option.value) return;
      deduped.set(option.value, {
        value: option.value,
        label: option.label || option.value,
        color: option.color || 'bg-muted-foreground/60',
      });
    });

    return Array.from(deduped.values());
  }, [providedStatusOptions]);
  const currentStatusOption = statusOptions.find((s) => s.value === editedTask.status);
  const currentStatusLabel =
    currentStatusOption?.label ||
    editedTask.status.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  const currentStatusColor = currentStatusOption?.color || 'bg-muted-foreground/60';
  const effectiveProjectId = editedTask.projectId ?? projectId;
  const { canEditResource, canDeleteResource } = useProjectPermissions(effectiveProjectId);
  const canEditTask = useMemo(
    () =>
      canEditResource({
        createdBy: editedTask.createdBy?.id,
        assigneeIds: (editedTask.assignees || []).map((a) => a.id),
      }),
    [canEditResource, editedTask.createdBy?.id, editedTask.assignees]
  );
  const canDeleteTask = useMemo(
    () => canDeleteResource({ createdBy: editedTask.createdBy?.id }),
    [canDeleteResource, editedTask.createdBy?.id]
  );
  const editLockTitle = 'You can only edit items you created or are assigned to';
  const deleteLockTitle = 'Only the task creator or a project/organization Admin can delete this task';
  const { data: projectTags = [] } = useProjectTags(effectiveProjectId);
  const createTagMutation = useCreateTag(effectiveProjectId);
  const updateTagMutation = useUpdateTag(effectiveProjectId);
  const tagColorMap = useMemo(() => {
    const map = new Map<string, string>();
    projectTags.forEach((t) => map.set(t.name.toLowerCase(), t.color));
    return map;
  }, [projectTags]);
  const tagIdByName = useMemo(() => {
    const map = new Map<string, string>();
    projectTags.forEach((t) => map.set(t.name.toLowerCase(), t.id));
    return map;
  }, [projectTags]);
  const getTagColor = (tag: string) => tagColorMap.get(tag.toLowerCase()) ?? getFallbackTagColor(tag);

  const tagSuggestions = useMemo(() => {
    const pool = new Set<string>();
    projectTags.forEach((t) => pool.add(t.name));
    allTasks.forEach((t) => {
      (t.tags || []).forEach((tag) => {
        const normalized = tag.trim();
        if (normalized) pool.add(normalized);
      });
    });
    (editedTask.tags || []).forEach((tag) => {
      const normalized = tag.trim();
      if (normalized) pool.add(normalized);
    });
    return Array.from(pool).sort((a, b) => a.localeCompare(b));
  }, [projectTags, allTasks, editedTask.tags]);
  const availableTagSuggestions = useMemo(
    () =>
      tagSuggestions.filter(
        (tag) => !editedTask.tags.some((existingTag) => existingTag.toLowerCase() === tag.toLowerCase())
      ),
    [editedTask.tags, tagSuggestions]
  );

  // A tag can only be removed from the project registry when nothing still
  // references it — deleting one that's in use would silently strip it from
  // every task and issue that had it, so those are refused with a message
  // naming what still holds it. The backend enforces the same rule.
  const deleteTagMutation = useDeleteTag(effectiveProjectId);
  const [tagPendingDelete, setTagPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const requestTagDelete = (e: React.MouseEvent, tagName: string) => {
    e.preventDefault();
    e.stopPropagation();
    const registryTag = projectTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
    if (!registryTag) {
      toast.error(`"${tagName}" isn't a saved project tag yet`);
      return;
    }
    const { taskCount, issueCount } = registryTag;
    if (taskCount > 0 || issueCount > 0) {
      const parts = [
        taskCount > 0 ? `${taskCount} task${taskCount === 1 ? '' : 's'}` : null,
        issueCount > 0 ? `${issueCount} issue${issueCount === 1 ? '' : 's'}` : null,
      ].filter(Boolean);
      toast.error(`"${registryTag.name}" is still in use`, {
        description: `Attached to ${parts.join(' and ')}. Remove it there before deleting the tag.`,
      });
      return;
    }
    setTagPendingDelete({ id: registryTag.id, name: registryTag.name });
  };

  // Blocks a tag input at MAX_TAG_LENGTH instead of letting the user type
  // past it and only finding out at task-create time — see handleCreate,
  // which fires onCreate without awaiting it, so a backend rejection (e.g.
  // the old 50-char limit) closed the modal with the task never created.
  const handleTagInputChange = (rawValue: string, setValue: (value: string) => void) => {
    if (rawValue.length > MAX_TAG_LENGTH) {
      toast.error(`Tags must be ${MAX_TAG_LENGTH} characters or less`);
      setValue(rawValue.slice(0, MAX_TAG_LENGTH));
      return;
    }
    setValue(rawValue);
  };

  // Always upserts against the shared project tag registry first — this is
  // what makes a tag created here show up (with the same color) when adding
  // tags to an issue, or any other task, in the same project.
  const addTag = async (rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;

    if (value.length > MAX_TAG_LENGTH) {
      toast.error(`Tags must be ${MAX_TAG_LENGTH} characters or less`);
      return;
    }

    setTagSearch('');
    setIsTagPopoverOpen(false);

    const exists = editedTask.tags.some((tag) => tag.toLowerCase() === value.toLowerCase());
    if (exists) return;

    try {
      const tag = await createTagMutation.mutateAsync({ name: value });
      handleFieldChange('tags', [...editedTask.tags, tag.name]);
    } catch {
      handleFieldChange('tags', [...editedTask.tags, value]);
    }
  };

  const saveEditedTag = () => {
    if (editingTagIndex === null && !editingTagOriginal) return;
    const value = editingTagValue.trim();

    if (value.length > MAX_TAG_LENGTH) {
      toast.error(`Tags must be ${MAX_TAG_LENGTH} characters or less`);
      return;
    }

    const nextTags = [...editedTask.tags];
    const targetIndex =
      editingTagOriginal !== null
        ? nextTags.findIndex((tag) => tag === editingTagOriginal)
        : editingTagIndex;

    if (targetIndex === null || targetIndex < 0) {
      setEditingTagIndex(null);
      setEditingTagValue('');
      setEditingTagOriginal(null);
      return;
    }

    const renamed = !!(editingTagOriginal && value && editingTagOriginal.toLowerCase() !== value.toLowerCase());

    if (!value) {
      nextTags.splice(targetIndex, 1);
    } else {
      nextTags[targetIndex] = value;
    }

    const deduped: string[] = [];
    nextTags.forEach((tag) => {
      const normalized = tag.trim();
      if (!normalized) return;
      if (!deduped.some((existingTag) => existingTag.toLowerCase() === normalized.toLowerCase())) {
        deduped.push(normalized);
      }
    });

    handleFieldChange('tags', deduped);

    // Renaming the registry entry cascades the new name into every other
    // task/issue in the project that referenced the old one.
    if (renamed && editingTagOriginal) {
      const tagId = tagIdByName.get(editingTagOriginal.toLowerCase());
      if (tagId) {
        updateTagMutation.mutate({ id: tagId, input: { name: value } });
      }
    }

    setEditingTagIndex(null);
    setEditingTagValue('');
    setEditingTagOriginal(null);
  };

  // Fetch real comments when task changes
  useEffect(() => {
    if (isOpen && task?.id && mode !== 'create') {
      setIsLoadingComments(true);
      commentsService.getByEntity(task.id, 'task')
        .then(dbComments => {
          const mappedComments: Comment[] = dbComments.map(c => ({
            id: c.id,
            content: c.content,
            author: {
              id: c.author?.id || '',
              name: c.author?.name || 'Unknown',
              initials: c.author?.initials || '?',
              avatar: c.author?.avatarUrl || undefined,
              email: '',
              role: 'member',
            },
            createdAt: c.createdAt || new Date().toISOString(),
          }));
          setEditedTask(prev => ({ ...prev, comments: mappedComments }));
        })
        .finally(() => setIsLoadingComments(false));
    }
  }, [isOpen, task?.id, mode]);

  useEffect(() => {
    const urls = pendingFiles.map(f => URL.createObjectURL(f));
    setPendingFileUrls(urls);
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [pendingFiles]);

  // The task payload returned by the project/task endpoints never embeds
  // attachments (they live behind a separate uploads endpoint), so fetch them
  // explicitly whenever an existing task is opened.
  useEffect(() => {
    if (!isOpen || !task?.id || mode === 'create') return;
    let cancelled = false;
    attachmentsService.getByEntity(task.id, 'task').then(records => {
      if (cancelled) return;
      const mapped = records.map(r => {
        const uploader = organizationMembers.find(m => m.id === (r.uploadedBy ?? r.uploaded_by));
        return {
          id: r.id,
          filename: r.fileName ?? r.file_name ?? 'file',
          url: r.fileUrl ?? r.url ?? '',
          fileSize: r.fileSize ?? r.file_size ?? 0,
          fileType: r.mimeType ?? r.mime_type ?? '',
          uploadedAt: r.createdAt ?? r.uploaded_at ?? new Date().toISOString(),
          uploadedBy: uploader ?? { id: '', name: 'Unknown', email: '', role: '', initials: '?' },
        };
      });
      setEditedTask(prev => {
        const updated = { ...prev, attachments: mapped };
        setInitialTaskSnapshot(current => current === '' ? current : serializeTaskForDirtyCheck(updated));
        return updated;
      });
    }).catch(() => { });
    return () => { cancelled = true; };
  }, [isOpen, task?.id, mode]);

  // Initialize form baselines once per modal session key. useLayoutEffect
  // (not useEffect) — this modal instance is reused across different tasks
  // opened one after another, so a regular useEffect (which runs after
  // paint) would show a frame of the PREVIOUS task's data before this reset
  // catches up: a visible flash when switching tasks quickly.
  useLayoutEffect(() => {
    if (!isOpen) {
      setInitializedForKey(null);
      setPreviewingFile(null);
      setIsMobileEditMode(false);
      return;
    }

    if (initializedForKey === formSessionKey) {
      return;
    }

    const baseTask = task || (mode === 'create' ? {
      id: '',
      title: '',
      description: '',
      status: 'todo' as const,
      priority: 'minor' as const,
      module: '' as ModuleType,
      assignees: defaultAssignees ?? [],
      tags: [],
      checklist: [],
      blockedBy: [],
      comments: [],
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: profile
        ? {
          id: profile.id,
          name: profile.name || profile.email,
          email: profile.email,
          role: profile.role || 'member',
          initials: profile.initials || (profile.name || profile.email || '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2),
          avatar: profile.avatarUrl || '',
        }
        : undefined,
    } : editedTask);
    setEditedTask(baseTask);
    setPendingFiles([]);
    setIsSaving(false);
    setIsAdvancedDescription(!!(baseTask.descriptionBlocks && baseTask.descriptionBlocks.length > 0));
    setInitialTaskSnapshot(serializeTaskForDirtyCheck(baseTask));

    // Track initial blocked by items
    setInitialBlockedByIds(baseTask.blockedBy || []);

    const linkedTaskIds = baseTask.id
      ? allTasks.filter(t => t.blockedBy?.includes(baseTask.id)).map(t => t.id)
      : [];

    setLocalBlockingToIds(linkedTaskIds);
    setInitialBlockingToIds(linkedTaskIds);
    setInitializedForKey(formSessionKey);
  }, [allTasks, editedTask, formSessionKey, initializedForKey, isOpen, task]);

  // "Blocking To" - tasks that have THIS task in their blockedBy.
  // We maintain a local copy to update immediately without waiting for allTasks prop to refresh.
  const [localBlockingToIds, setLocalBlockingToIds] = useState<string[]>([]);

  const blockingToTaskIds = localBlockingToIds;
  const dependencyExcludedTaskIds = useMemo(() => new Set([
    editedTask.id,
    ...(editedTask.blockedBy || []),
    ...blockingToTaskIds,
  ]), [blockingToTaskIds, editedTask.blockedBy, editedTask.id]);

  const handleFieldsChange = (patch: Partial<Task>) => {
    setEditedTask(prev => ({
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString()
    }));
  };

  const handleFieldChange = <K extends keyof Task>(field: K, value: Task[K]) => {
    handleFieldsChange({ [field]: value } as Partial<Task>);
  };

  // Advanced blocks are the source of truth while the toggle is on, but the
  // plain `description` is what every board card, list row and preview renders
  // — so mirror the flattened text across on every block edit. Without it an
  // advanced-only edit saved fine yet showed up nowhere, which reads as
  // "the update didn't happen".
  const handleDescriptionBlocksChange = (blocks: EditorBlock[]) => {
    handleFieldsChange({
      descriptionBlocks: blocks,
      description: blocksToPlainText(blocks),
    });
  };

  const handleAdvancedDescriptionToggle = (enabled: boolean) => {
    if (enabled) {
      // Carry whatever is in the plain box into the editor instead of dropping
      // the user in front of an empty one.
      if (!hasBlockContent(editedTask.descriptionBlocks as EditorBlock[] | undefined)) {
        const seeded = plainTextToBlocks(editedTask.description);
        if (seeded.length > 0) {
          handleFieldsChange({
            descriptionBlocks: seeded,
            description: blocksToPlainText(seeded),
          });
        }
      }
    } else {
      // Going back to simple mode: keep the text, drop the blocks — a task that
      // still has blocks reopens in advanced mode.
      const flattened = blocksToPlainText(editedTask.descriptionBlocks as EditorBlock[] | undefined);
      handleFieldsChange({
        description: flattened || editedTask.description || '',
        descriptionBlocks: [],
      });
    }
    setIsAdvancedDescription(enabled);
  };

  const handleStatusChange = (value: TaskStatus) => {
    if (value === 'blocked') {
      const hasDependencies =
        (editedTask.blockedBy?.length || 0) > 0 ||
        localBlockingToIds.length > 0 ||
        (editedTask.linkedIssueIds?.length || 0) > 0;

      if (!hasDependencies) {
        toast.error('Blocked selected. Please add dependencies before saving.');
      }
    }

    handleFieldChange('status', value);
  };

  const handleCancel = () => {
    setNewComment('');
    setEditingCommentId(null);
    setEditingCommentValue('');
    setPendingNewCommentIds(new Set());
    setPendingEditedComments(new Map());
    setPendingDeletedCommentIds(new Set());
    setNewChecklistItem('');
    setEditingChecklistId(null);
    setEditingChecklistValue('');
    setVideoLinkInput('');
    setTagSearch('');
    setEditingTagIndex(null);
    setEditingTagValue('');
    setEditingTagOriginal(null);

    if (task) {
      setEditedTask(task);
      const linkedTaskIds = task.id
        ? allTasks.filter(t => t.blockedBy?.includes(task.id)).map(t => t.id)
        : [];
      setLocalBlockingToIds(linkedTaskIds);
    } else {
      setPendingFiles([]);
    }

    onClose();
  };

  const handleCreate = () => {
    if (isSaving) return;

    if (!editedTask.title?.trim()) {
      toast.error('Task title is required');
      return;
    }

    if (!editedTask.startDate) {
      toast.error('Start date is required');
      return;
    }

    if (isBefore(startOfDay(parseISO(editedTask.startDate)), startOfDay(new Date()))) {
      toast.error('Start date cannot be in the past');
      return;
    }

    if (isBlockedWithoutDependencies) {
      toast.error('Please add dependencies before creating a blocked task');
      return;
    }

    if (editedTask && onCreate) {
      setIsSaving(true);
      const taskWithCreator: Task = {
        ...editedTask,
        createdBy: profile
          ? {
            id: profile.id,
            name: profile.name || profile.email,
            email: profile.email,
            role: profile.role || 'member',
            initials: profile.initials || (profile.name || profile.email || '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2),
            avatar: profile.avatarUrl || '',
          }
          : editedTask.createdBy,
      };
      onCreate(taskWithCreator, pendingFiles.length > 0 ? pendingFiles : undefined);
      setPendingFiles([]);
      onClose();
    }
  };

  // Checklist handlers
  const checklist = editedTask.checklist || [];
  const completedItems = checklist.filter(item => item.completed).length;
  const checklistProgress = checklist.length > 0 ? (completedItems / checklist.length) * 100 : 0;
  const showChecklistInBoardView = checklist.length > 0 && checklist.every((item) => item.showInBoardView === true);

  const handleAddChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    const newItem: ChecklistItem = {
      id: `checklist-${Date.now()}`,
      text: newChecklistItem,
      completed: false,
      showInBoardView: showChecklistInBoardView,
    };
    handleFieldChange('checklist', [...checklist, newItem]);
    setNewChecklistItem('');
  };

  const handleToggleChecklistItem = (itemId: string) => {
    const updated = checklist.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    handleFieldChange('checklist', updated);
  };

  const handleToggleChecklistBoardViewForAll = (showInBoardView: boolean) => {
    const updated = checklist.map(item => ({ ...item, showInBoardView }));
    handleFieldChange('checklist', updated);
  };

  const handleRemoveChecklistItem = (itemId: string) => {
    handleFieldChange('checklist', checklist.filter(item => item.id !== itemId));
  };

  const handleStartEditChecklist = (item: ChecklistItem) => {
    setEditingChecklistId(item.id);
    setEditingChecklistValue(item.text);
  };

  const handleSaveEditChecklist = () => {
    if (!editingChecklistId || !editingChecklistValue.trim()) return;
    const updated = checklist.map(item =>
      item.id === editingChecklistId ? { ...item, text: editingChecklistValue.trim() } : item
    );
    handleFieldChange('checklist', updated);
    setEditingChecklistId(null);
    setEditingChecklistValue('');
  };

  const handleCancelEditChecklist = () => {
    setEditingChecklistId(null);
    setEditingChecklistValue('');
  };


  // Attachment handlers
  const attachments = editedTask.attachments || [];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    if (isUploading) return;
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (isUploading) return;
    e.preventDefault();
    setIsDragging(false);
  };

  const processFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (mode === 'create') {
      setPendingFiles(prev => [...prev, ...Array.from(files)]);
      return;
    }
    setIsUploading(true);
    try {
      const results = await Promise.all(
        Array.from(files).map(file =>
          attachmentsService.upload({
            entityId: editedTask.id,
            entityType: 'task',
            projectId: editedTask.projectId ?? projectId,
            file,
          })
        )
      );
      handleFieldChange('attachments', [
        ...attachments,
        ...results.map(r => ({
          id: r.id,
          filename: r.fileName ?? r.file_name ?? 'file',
          url: r.fileUrl ?? r.url ?? '',
          fileSize: r.fileSize ?? r.file_size ?? 0,
          fileType: r.mimeType ?? r.mime_type ?? '',
          uploadedAt: r.createdAt ?? r.uploaded_at ?? new Date().toISOString(),
          uploadedBy: profile
            ? { id: profile.id, name: profile.name, email: profile.email, role: '', initials: profile.initials ?? '' }
            : { id: '', name: 'You', email: '', role: '', initials: '' },
        })),
      ]);
      toast.success(`${results.length} file(s) uploaded`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (isUploading) return;
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await processFiles(e.target.files);
    if (e.target) e.target.value = '';
  };

  const handlePaste = (e: ClipboardEvent) => {
    if (isUploading) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(renamePastedImageFile(file, imageFiles.length));
      }
    }
    if (imageFiles.length === 0) return;
    e.preventDefault();
    const dt = new DataTransfer();
    imageFiles.forEach(f => dt.items.add(f));
    processFiles(dt.files);
  };

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  });

  const handleRemoveAttachment = async (attachmentId: string) => {
    try {
      await attachmentsService.delete(attachmentId);
      handleFieldChange('attachments', attachments.filter((a: any) => a.id !== attachmentId));
    } catch {
      handleFieldChange('attachments', attachments.filter((a: any) => a.id !== attachmentId));
    }
  };

  const videoLinks: VideoLink[] = editedTask.videoLinks || [];

  const handleAddVideoLink = () => {
    const url = videoLinkInput.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast.error('Please enter a valid URL starting with http:// or https://');
      return;
    }
    const alreadyExists = videoLinks.some(v => v.url === url);
    if (alreadyExists) {
      toast.error('This video link has already been added');
      return;
    }
    const newLink: VideoLink = {
      id: crypto.randomUUID(),
      url,
      title: url,
      addedBy: profile
        ? { id: profile.id, name: profile.name || profile.email, email: profile.email, role: profile.role || 'member', initials: profile.initials ?? '' }
        : { id: '', name: 'You', email: '', role: '', initials: '' },
      addedAt: new Date().toISOString(),
    };
    handleFieldChange('videoLinks', [...videoLinks, newLink]);
    setVideoLinkInput('');
  };

  const handleRemoveVideoLink = (id: string) => {
    handleFieldChange('videoLinks', videoLinks.filter(v => v.id !== id));
  };

  const hasSelectedModules = (editedTask.moduleIds || []).length > 0;
  const normalizedEditedTaskSnapshot = useMemo(
    () => serializeTaskForDirtyCheck(editedTask),
    [editedTask]
  );
  const sortedCurrentBlockingToIds = useMemo(
    () => [...localBlockingToIds].sort(),
    [localBlockingToIds]
  );
  const sortedInitialBlockingToIds = useMemo(
    () => [...initialBlockingToIds].sort(),
    [initialBlockingToIds]
  );
  const hasBlockingToChanges = useMemo(() => {
    if (sortedCurrentBlockingToIds.length !== sortedInitialBlockingToIds.length) {
      return true;
    }

    return sortedCurrentBlockingToIds.some((id, idx) => id !== sortedInitialBlockingToIds[idx]);
  }, [sortedCurrentBlockingToIds, sortedInitialBlockingToIds]);

  // Check if blockedBy has changed
  const hasBlockedByChanges = useMemo(() => {
    const current = [...(editedTask.blockedBy || [])].sort();
    const initial = [...initialBlockedByIds].sort();
    if (current.length !== initial.length) return true;
    return current.some((id, idx) => id !== initial[idx]);
  }, [editedTask.blockedBy, initialBlockedByIds]);

  const hasDependenciesForBlocked =
    (editedTask.blockedBy?.length || 0) > 0 ||
    localBlockingToIds.length > 0 ||
    (editedTask.linkedIssueIds?.length || 0) > 0;
  const isBlockedWithoutDependencies = editedTask.status === 'blocked' && !hasDependenciesForBlocked;
  const isTaskDirty = initialTaskSnapshot !== '' && normalizedEditedTaskSnapshot !== initialTaskSnapshot;
  // Comment add/edit/delete is staged locally (see handleDeleteComment etc.)
  // and only actually persisted inside handleUpdateTask — so without these,
  // deleting or editing a comment and then hitting Cancel/X skipped the
  // unsaved-changes confirmation entirely and silently discarded it.
  const hasPendingCommentChanges =
    pendingNewCommentIds.size > 0 || pendingEditedComments.size > 0 || pendingDeletedCommentIds.size > 0;
  const isFormDirty =
    isTaskDirty || hasBlockingToChanges || hasBlockedByChanges || pendingFiles.length > 0 || hasPendingCommentChanges;
  const canSubmitTask = Boolean(
    editedTask.title &&
    editedTask.startDate &&
    editedTask.dueDate &&
    !isBlockedWithoutDependencies &&
    (mode === 'create' || isFormDirty)
  );

  const attemptClose = () => {
    if (isFormDirty) {
      setShowUnsavedConfirm(true);
    } else {
      handleCancel();
    }
  };

  // Comments handlers
  const comments = editedTask.comments || [];

  const handleAddComment = async () => {
    if (!newComment.trim() || !profile) return;

    const content = newComment.trim();
    setNewComment('');

    // Stage locally; only persisted to the DB when "Update" is clicked (see handleUpdateTask)
    const newCommentId = `comment-${Date.now()}`;
    const newCommentObj: Comment = {
      id: newCommentId,
      content: content,
      author: {
        id: profile.id,
        name: profile.name || profile.email,
        initials: profile.initials || '',
        avatar: profile.avatarUrl || undefined,
        email: profile.email,
        role: profile.role || 'member'
      },
      createdAt: new Date().toISOString(),
    };
    setEditedTask(prev => ({
      ...prev,
      comments: [...(prev.comments || []), newCommentObj]
    }));
    if (mode !== 'create') {
      setPendingNewCommentIds(prev => new Set(prev).add(newCommentId));
    }
  };

  const handleStartEditComment = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditingCommentValue(comment.content);
  };

  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentValue('');
  };

  const handleSaveEditComment = async () => {
    if (!editingCommentId || !editingCommentValue.trim()) return;
    const commentId = editingCommentId;
    const content = editingCommentValue.trim();

    // Stage locally; only persisted to the DB when "Update" is clicked (see handleUpdateTask)
    setEditedTask(prev => ({
      ...prev,
      comments: (prev.comments || []).map(c =>
        c.id === commentId ? { ...c, content } : c
      ),
    }));
    if (mode !== 'create' && !pendingNewCommentIds.has(commentId)) {
      setPendingEditedComments(prev => new Map(prev).set(commentId, content));
    }
    setEditingCommentId(null);
    setEditingCommentValue('');
  };

  const handleDeleteComment = async (commentId: string) => {
    // Stage locally; only persisted to the DB when "Update" is clicked (see handleUpdateTask)
    setEditedTask(prev => ({
      ...prev,
      comments: (prev.comments || []).filter(c => c.id !== commentId),
    }));
    if (pendingNewCommentIds.has(commentId)) {
      setPendingNewCommentIds(prev => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
    } else if (mode !== 'create') {
      setPendingDeletedCommentIds(prev => new Set(prev).add(commentId));
    }
    setPendingEditedComments(prev => {
      if (!prev.has(commentId)) return prev;
      const next = new Map(prev);
      next.delete(commentId);
      return next;
    });
  };

  const availableTasksForBlocking = allTasks.filter(
    t => !dependencyExcludedTaskIds.has(t.id)
  );
  const availableTasksForBlockedBy = allTasks.filter(
    t => !dependencyExcludedTaskIds.has(t.id)
  );


  // Adding to "Blocking To" - update the OTHER task's blockedBy and update local state
  const handleAddBlockingTask = (taskId: string) => {
    if (!taskId) return;
    const taskToUpdate = allTasks.find(t => t.id === taskId);
    if (taskToUpdate && !dependencyExcludedTaskIds.has(taskId)) {
      setLocalBlockingToIds(prev => [...prev, taskId]);
    }
  };

  const handleUpdateTask = async () => {
    if (isBlockedWithoutDependencies) {
      toast.error('Please add dependencies before saving blocked status');
      return;
    }

    setIsSaving(true);
    try {
      // Commit the main task changes
      await onUpdate(editedTask);

      // Commit staged comment changes (add/edit/delete) now that Update was confirmed
      if (mode !== 'create' && editedTask.id) {
        for (const id of pendingDeletedCommentIds) {
          try {
            await commentsService.delete(id);
          } catch (error) {
            logger.error('Failed to delete comment:', error);
          }
        }
        for (const [id, content] of pendingEditedComments) {
          try {
            await commentsService.update(id, content);
          } catch (error) {
            logger.error('Failed to update comment:', error);
          }
        }
        for (const id of pendingNewCommentIds) {
          const comment = editedTask.comments?.find(c => c.id === id);
          if (!comment || !profile) continue;
          try {
            await commentsService.create({
              author_id: profile.id,
              content: comment.content,
              entity_id: editedTask.id,
              entity_type: 'task',
            });
          } catch (error) {
            logger.error('Failed to add comment:', error);
          }
        }
        setPendingDeletedCommentIds(new Set());
        setPendingEditedComments(new Map());
        setPendingNewCommentIds(new Set());
      }

      // Compute blocking-to diffs: tasks where THIS task is listed in their blockedBy
      const originalBlockingToIds = allTasks
        .filter(t => t.blockedBy.includes(editedTask.id))
        .map(t => t.id);

      // Compute blockedBy diffs: tasks that THIS task depends on
      const originalBlockedByIds = editedTask.id
        ? allTasks.find(t => t.id === editedTask.id)?.blockedBy || []
        : [];

      // addedIds/removedIds logic...
      const batchUpdates: Array<{ id: string; updates: Partial<Task> }> = [];
      const mergeBatchUpdate = (id: string, updates: Partial<Task>) => {
        const existing = batchUpdates.find((item) => item.id === id);
        if (existing) {
          existing.updates = {
            ...existing.updates,
            ...updates,
          };
          return;
        }
        batchUpdates.push({ id, updates });
      };

      // Added blocking-to relationships
      const addedIds = localBlockingToIds.filter(id => !originalBlockingToIds.includes(id));
      for (const id of addedIds) {
        const other = allTasks.find(t => t.id === id);
        if (other && !other.blockedBy.includes(editedTask.id)) {
          mergeBatchUpdate(id, {
            id,
            updates: {
              blockedBy: [...other.blockedBy, editedTask.id],
              status: other.status === 'blocked' ? other.status : 'blocked'
            }
          }.updates);
        }
      }

      // Removed blocking-to relationships
      const removedIds = originalBlockingToIds.filter(id => !localBlockingToIds.includes(id));
      for (const id of removedIds) {
        const other = allTasks.find(t => t.id === id);
        if (other) {
          const newBlockedBy = other.blockedBy.filter(bid => bid !== editedTask.id);
          mergeBatchUpdate(id, {
            id,
            updates: {
              blockedBy: newBlockedBy,
              // If no more blockers, change status back to 'todo'
              status: newBlockedBy.length === 0 && other.status === 'blocked' ? 'todo' : other.status
            }
          }.updates);
        }
      }

      // Added blockedBy relationships (THIS task's dependencies)
      const addedBlockedByIds = editedTask.blockedBy.filter(id => !(originalBlockedByIds || []).includes(id));
      for (const id of addedBlockedByIds) {
        const blocker = allTasks.find(t => t.id === id);
        if (blocker) {
          mergeBatchUpdate(id, {
            id,
            updates: {
              status: blocker.status === 'blocked' ? blocker.status : 'blocked'
            }
          }.updates);
        }
      }

      // Removed blockedBy relationships
      const removedBlockedByIds = (originalBlockedByIds || []).filter(id => !editedTask.blockedBy.includes(id));
      for (const id of removedBlockedByIds) {
        const blocker = allTasks.find(t => t.id === id);
        if (blocker && blocker.status === 'blocked') {
          // Only change status if this blocker doesn't block anything else
          const blockingOthers = allTasks.some(t => t.blockedBy.includes(id));
          if (!blockingOthers) {
            mergeBatchUpdate(id, {
              id,
              updates: { status: 'todo' as TaskStatus }
            }.updates);
          }
        }
      }

      // Tag renames now cascade server-side via the project tag registry
      // (see saveEditedTag), so no client-side propagation across tasks is needed.

      if (batchUpdates.length > 0) {
        if (onBatchUpdate) {
          await onBatchUpdate(batchUpdates);
        } else {
          // Fallback to sequential if onBatchUpdate is not provided
          for (const update of batchUpdates) {
            const other = allTasks.find(t => t.id === update.id);
            if (other) {
              await onUpdate({ ...other, ...update.updates });
            }
          }
        }
      }

      onClose();
    } catch (error) {
      logger.error('Failed to update task:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Removing from "Blocking To" - will be handled in batch updates
  const handleRemoveBlockingTask = (taskId: string) => {
    setLocalBlockingToIds(prev => {
      const updated = prev.filter(id => id !== taskId);
      // If removing this leaves no blocking tasks and no blocked-by tasks, change status to 'todo'
      if (updated.length === 0 && editedTask.blockedBy.length === 0 && editedTask.status === 'blocked') {
        setEditedTask(prevTask => ({
          ...prevTask,
          status: 'todo',
          updatedAt: new Date().toISOString()
        }));
      }
      return updated;
    });
  };

  // Adding to "Blocked By" - update THIS task's blockedBy
  const handleAddBlockedByTask = (taskId: string) => {
    if (!taskId) return;
    setEditedTask(prev => {
      // Prevent duplicates
      if (dependencyExcludedTaskIds.has(taskId)) return prev;

      const updated = {
        ...prev,
        blockedBy: [...prev.blockedBy, taskId],
        updatedAt: new Date().toISOString()
      };
      return updated;
    });
  };

  // Removing from "Blocked By" - will be handled in batch updates
  const handleRemoveBlockedByTask = (taskId: string) => {
    setEditedTask(prev => {
      const updatedBlockedBy = prev.blockedBy.filter(id => id !== taskId);
      const updated = {
        ...prev,
        blockedBy: updatedBlockedBy,
        updatedAt: new Date().toISOString()
      };
      // If removing this leaves no blocked-by tasks and no blocking tasks, change status to 'todo'
      if (updatedBlockedBy.length === 0 && localBlockingToIds.length === 0 && prev.status === 'blocked') {
        updated.status = 'todo';
      }
      return updated;
    });
  };

  const getTaskById = (id: string) => {
    const taskFound = allTasks.find(t => t.id === id);
    if (!taskFound) {
      logger.warn(`Task with ID ${id} not found in allTasks`);
    }
    return taskFound;
  };

  const handleDelete = () => {
    if (onDelete && editedTask && editedTask.id) {
      onDelete(editedTask.id);
      setShowDeleteConfirm(false);
      onClose();
    }
  };

  // On mobile, the task overview opens as a full-screen page (not a centered dialog)
  // with edit/delete tucked behind a header "..." menu instead of a persistent footer bar.
  const showMobileHeader = isMobile && mode === 'view';
  // On mobile, fields stay read-only until "Edit Task" is tapped in the "..." menu.
  // Desktop is unaffected (showMobileHeader is false there, so this collapses to canEditTask).
  const canEditTaskFields = canEditTask && (!showMobileHeader || isMobileEditMode);
  const isMobileFieldsLocked = showMobileHeader && !isMobileEditMode;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && attemptClose()}>
        <DialogContent
          className={cn(
            'p-0 flex flex-col gap-0 overflow-hidden',
            isMobile
              ? 'inset-0 left-0 top-0 h-[100dvh] w-screen max-w-none max-h-none translate-x-0 translate-y-0 rounded-none border-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom duration-300 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100'
              : 'max-w-4xl max-h-[90vh]'
          )}
          hideClose
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {mode === 'create' && (
            <DialogHeader className="px-6 py-4 border-b flex-row items-center justify-between shrink-0">
              <DialogTitle>Add New Task</DialogTitle>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </DialogHeader>
          )}
          {mode !== 'create' && showMobileHeader ? (
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
                <DialogTitle className="text-[15px] font-bold truncate">Task Details</DialogTitle>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 text-foreground active:bg-muted/70 transition-colors"
                    aria-label="Task actions"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!isMobileEditMode ? (
                    <DropdownMenuItem
                      onClick={() => setIsMobileEditMode(true)}
                      disabled={!canEditTask}
                      title={canEditTask ? undefined : editLockTitle}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit Task
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={handleUpdateTask}
                      disabled={isSaving || !editedTask.title || !editedTask.dueDate || isBlockedWithoutDependencies || !canEditTask || !isFormDirty}
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Update Task
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={!canDeleteTask}
                      title={canDeleteTask ? undefined : deleteLockTitle}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Task
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : mode !== 'create' && (
            <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-sm font-medium text-muted-foreground">Task</DialogTitle>
                {getDisplayId(projectCode, 'T', task?.number) && (
                  <span className="font-mono font-semibold text-[12px] text-blue-500">
                    {getDisplayId(projectCode, 'T', task?.number)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <DialogClose asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </Button>
                </DialogClose>
              </div>
            </div>
          )}
          <DialogDescription className="sr-only">
            View and edit details for task {task?.title || 'New Task'}
          </DialogDescription>

          <ScrollArea className={cn(
            'flex-1 overflow-y-auto w-full min-h-0',
            isMobile && (showMobileHeader && isMobileEditMode ? 'max-h-[calc(100dvh-129px)]' : 'max-h-[calc(100dvh-57px)]')
          )}>
            <div className={cn('p-4 sm:p-6 space-y-6', showMobileHeader && 'space-y-5')}>
              {showMobileHeader && projectName && (
                <p className="text-xs text-muted-foreground -mb-2">
                  {projectName} <span className="mx-1">›</span> Board
                  {getDisplayId(projectCode, 'T', task?.number) && (
                    <span className="ml-2 font-mono font-semibold text-blue-500">
                      {getDisplayId(projectCode, 'T', task?.number)}
                    </span>
                  )}
                </p>
              )}
              <div className="space-y-2">
                {!showMobileHeader && (
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Task Title <span className="text-destructive" aria-hidden="true">*</span></Label>
                )}
                <Input
                  value={editedTask.title}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  className={cn(
                    showMobileHeader
                      ? 'text-xl font-bold h-auto py-1 px-0 border-0 shadow-none focus-visible:ring-0 rounded-none disabled:opacity-100 disabled:cursor-default'
                      : 'text-base font-semibold w-full',
                    showMobileHeader && !canEditTask && 'opacity-60'
                  )}
                  placeholder="Task title..."
                  aria-required="true"
                  disabled={!canEditTaskFields}
                  title={canEditTaskFields ? undefined : editLockTitle}
                />
              </div>

              {/* Metadata Section */}
              <div className="flex flex-col gap-6">
                {/* Assigned To — full-width row */}
                <div className="space-y-1.5">
                  <Label className={cn(
                    'text-xs text-muted-foreground flex items-center gap-1.5',
                    showMobileHeader && 'uppercase tracking-wider font-medium'
                  )}>
                    {!showMobileHeader && <User className="h-3 w-3" />}
                    Assigned To
                  </Label>
                  <Popover open={isAssigneePopoverOpen} onOpenChange={(open) => canEditTaskFields && setIsAssigneePopoverOpen(open)}>
                    <PopoverTrigger asChild>
                      <button
                        disabled={!canEditTaskFields}
                        title={canEditTaskFields ? undefined : editLockTitle}
                        className={cn(
                          'flex items-center gap-2 h-10 px-2 w-full text-left rounded-md hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          !canEditTask && 'cursor-not-allowed opacity-60 hover:bg-transparent'
                        )}
                      >
                        <div className="flex items-center">
                          {(editedTask.assignees || []).slice(0, 5).map((assignee, index) => (
                            <div
                              key={assignee.id}
                              className="rounded-full ring-2 ring-background"
                              style={{ zIndex: index, marginLeft: index === 0 ? 0 : '-8px' }}
                              title={assignee.assignedBy ? `Assigned by ${assignee.assignedBy.name}` : undefined}
                            >
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={resolveFileUrl(assignee.avatar) ?? assignee.avatar} alt={assignee.name} />
                                <AvatarFallback className="text-xs font-semibold bg-primary/15 text-primary">
                                  {assignee.initials}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                          ))}
                          {(editedTask.assignees || []).length > 5 && (
                            <div
                              className="h-8 w-8 rounded-full ring-2 ring-background bg-muted flex items-center justify-center"
                              style={{ zIndex: 5, marginLeft: '-8px' }}
                            >
                              <span className="text-xs text-muted-foreground font-medium">+{(editedTask.assignees || []).length - 5}</span>
                            </div>
                          )}
                        </div>
                        <div className="h-8 w-8 rounded-full border-2 border-dashed border-muted-foreground/40 hover:border-primary hover:text-primary transition-all flex items-center justify-center shrink-0">
                          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        {(editedTask.assignees || []).length === 0 && (
                          <span className="text-sm text-muted-foreground">Click to assign members...</span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[260px] min-h-[180px] max-h-[var(--radix-popover-content-available-height)] overflow-hidden" align="start">
                      <Command>
                        <CommandInput placeholder="Search members..." />

                        {(editedTask.assignees || []).length > 0 && (
                          <div className="p-2 border-b">
                            <p className="text-xs font-medium text-muted-foreground px-2 mb-1">Assigned</p>
                            {[...(editedTask.assignees || [])].sort((a, b) => a.name.localeCompare(b.name)).map((assignee) => (
                              <div key={assignee.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted group">
                                <Avatar className="h-6 w-6 shrink-0">
                                  <AvatarImage src={resolveFileUrl(assignee.avatar) ?? assignee.avatar} alt={assignee.name} />
                                  <AvatarFallback className="text-[10px]">{assignee.initials}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm truncate">{assignee.name}</p>
                                  {assignee.assignedBy && (
                                    <p className="text-[10px] text-muted-foreground truncate">Assigned by {assignee.assignedBy.name}</p>
                                  )}
                                </div>
                                <button
                                  disabled={!canEditTaskFields}
                                  title={canEditTaskFields ? undefined : editLockTitle}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFieldChange('assignees', (editedTask.assignees || []).filter(a => a.id !== assignee.id));
                                  }}
                                  className={cn(
                                    'text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100',
                                    !canEditTaskFields && 'cursor-not-allowed group-hover:opacity-60'
                                  )}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <CommandList>
                          <CommandEmpty>
                            {availableAssignees.filter(m => !editedTask.assignees?.some(a => a.id === m.id)).length === 0
                              ? "All members assigned"
                              : "No results found."}
                          </CommandEmpty>
                          {availableAssignees.filter(m => !editedTask.assignees?.some(a => a.id === m.id)).length > 0 && (
                            <CommandGroup heading="Add members">
                              {availableAssignees
                                .filter(m => !editedTask.assignees?.some(a => a.id === m.id))
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((member) => (
                                  <CommandItem
                                    key={member.id}
                                    value={`${member.id} ${member.name}`}
                                    onSelect={() => {
                                      handleFieldChange('assignees', [...(editedTask.assignees || []), member]);
                                    }}
                                    className="cursor-pointer"
                                  >
                                    <div className="flex items-start gap-2">
                                      <Avatar className="h-5 w-5 mt-0.5 shrink-0">
                                        <AvatarImage src={resolveFileUrl(member.avatar) ?? member.avatar} alt={member.name} />
                                        <AvatarFallback className="text-[9px]">{member.initials}</AvatarFallback>
                                      </Avatar>
                                      <span className="min-w-0">{member.name}</span>
                                    </div>
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Status pill — mobile only, mirrors the Bucket value as a prominent chip */}
                {showMobileHeader && (
                  <div className="space-y-1.5">
                    <Label className="block text-xs text-muted-foreground uppercase tracking-wider font-medium">Status</Label>
                    <Select
                      value={editedTask.status}
                      onValueChange={(value) => handleStatusChange(value as TaskStatus)}
                      disabled={!canEditTaskFields}
                    >
                      <SelectTrigger
                        className={cn(
                          'h-auto w-auto border-0 p-0 focus:ring-0 focus-visible:ring-0 shadow-none bg-transparent [&>svg]:hidden disabled:opacity-100 disabled:cursor-default',
                          !canEditTask && 'opacity-60'
                        )}
                        title={canEditTaskFields ? undefined : editLockTitle}
                      >
                        <SelectValue>
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-white',
                              currentStatusColor
                            )}
                          >
                            {currentStatusLabel}
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <StatusDot color={option.color} />
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Details card — mobile only wraps the metadata grid to match the card-based mobile layout */}
                {showMobileHeader && (
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium -mb-2">Details</Label>
                )}
                <div className={cn(showMobileHeader && 'border rounded-xl p-4')}>
                  {/* 4-column metadata grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start">
                    {/* Bucket */}
                    <div className="space-y-1.5">
                      <Label className={cn(
                        'text-xs text-muted-foreground flex items-center gap-1.5',
                        showMobileHeader && 'uppercase tracking-wider font-medium'
                      )}>
                        {!showMobileHeader && <AlertCircle className="h-3 w-3" />}
                        Bucket {!showMobileHeader && <span className="text-destructive" aria-hidden="true">*</span>}
                      </Label>
                      <Select
                        value={editedTask.status}
                        onValueChange={(value) => handleStatusChange(value as TaskStatus)}
                        disabled={!canEditTaskFields}
                      >
                        <SelectTrigger
                          className={cn(
                            showMobileHeader
                              ? 'h-auto w-auto border-0 p-0 shadow-none bg-transparent focus:ring-0 focus-visible:ring-0 [&>svg]:hidden disabled:opacity-100 disabled:cursor-default'
                              : 'h-9',
                            showMobileHeader && !canEditTask && 'opacity-60'
                          )}
                          aria-required="true"
                          title={canEditTaskFields ? undefined : editLockTitle}
                        >
                          <SelectValue>
                            <div className={cn('flex items-center gap-2', showMobileHeader && 'font-bold text-sm text-foreground')}>
                              <StatusDot color={currentStatusColor} />
                              {currentStatusLabel}
                            </div>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <div className="flex items-center gap-2">
                                <StatusDot color={option.color} />
                                {option.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Start Date */}
                    <div className="space-y-1.5">
                      <Label className={cn(
                        'text-xs text-muted-foreground flex items-center gap-1.5',
                        showMobileHeader && 'uppercase tracking-wider font-medium'
                      )}>
                        {!showMobileHeader && <CalendarIcon className="h-3 w-3" />}
                        Start Date
                        {!showMobileHeader && <span className="text-destructive">*</span>}
                      </Label>
                      <Popover open={isStartDatePopoverOpen} onOpenChange={(open) => canEditTaskFields && setIsStartDatePopoverOpen(open)}>
                        <PopoverTrigger asChild>
                          <Button
                            variant={showMobileHeader ? 'ghost' : 'outline'}
                            disabled={!canEditTaskFields}
                            title={canEditTaskFields ? undefined : editLockTitle}
                            className={cn(
                              showMobileHeader
                                ? 'h-auto w-auto p-0 justify-start text-left font-bold text-sm text-foreground hover:bg-transparent disabled:opacity-100 disabled:pointer-events-none'
                                : 'w-full justify-start text-left font-normal h-9 px-3',
                              !editedTask.startDate && 'text-muted-foreground',
                              showMobileHeader && !canEditTask && 'opacity-60'
                            )}
                          >
                            {editedTask.startDate
                              ? format(new Date(editedTask.startDate), showMobileHeader ? 'MMM d' : 'PPP')
                              : 'Pick a date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 min-h-[300px] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto" align={isMobile ? "center" : "start"}>
                          <Calendar
                            mode="single"
                            selected={editedTask.startDate ? new Date(editedTask.startDate) : undefined}
                            onSelect={(date) => {
                              handleFieldChange('startDate', toDateOnly(date || undefined));
                              setIsStartDatePopoverOpen(false);
                            }}
                            fromDate={mode === 'create' ? startOfDay(new Date()) : undefined}
                            disabled={(date) => {
                              // New tasks can only start today or later
                              if (mode === 'create' && isBefore(startOfDay(date), startOfDay(new Date()))) {
                                return true;
                              }
                              if (editedTask.dueDate) {
                                return isAfter(date, parseISO(editedTask.dueDate));
                              }
                              return false;
                            }}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Due Date */}
                    <div className="space-y-1.5">
                      <Label className={cn(
                        'text-xs text-muted-foreground flex items-center gap-1.5',
                        showMobileHeader && 'uppercase tracking-wider font-medium'
                      )}>
                        {!showMobileHeader && <CalendarIcon className="h-3 w-3" />}
                        Due Date {!showMobileHeader && <span className="text-destructive" aria-hidden="true">*</span>}
                      </Label>
                      <Popover open={isDueDatePopoverOpen} onOpenChange={(open) => canEditTaskFields && setIsDueDatePopoverOpen(open)}>
                        <PopoverTrigger asChild>
                          <Button
                            variant={showMobileHeader ? 'ghost' : 'outline'}
                            aria-required="true"
                            disabled={!canEditTaskFields}
                            title={canEditTaskFields ? undefined : editLockTitle}
                            className={cn(
                              showMobileHeader
                                ? 'h-auto w-auto p-0 justify-start text-left font-bold text-sm text-foreground hover:bg-transparent disabled:opacity-100 disabled:pointer-events-none'
                                : 'w-full justify-start text-left font-normal h-9 px-3',
                              !editedTask.dueDate && 'text-muted-foreground',
                              showMobileHeader && !canEditTask && 'opacity-60'
                            )}
                          >
                            {editedTask.dueDate
                              ? format(new Date(editedTask.dueDate), showMobileHeader ? 'MMM d' : 'PPP')
                              : 'Set date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 min-h-[300px] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto" align={isMobile ? "center" : "start"}>
                          <Calendar
                            mode="single"
                            selected={editedTask.dueDate ? new Date(editedTask.dueDate) : undefined}
                            onSelect={(date) => {
                              handleFieldChange('dueDate', toDateOnly(date || undefined));
                              setIsDueDatePopoverOpen(false);
                            }}
                            disabled={(date) => {
                              if (editedTask.startDate) {
                                return isBefore(date, parseISO(editedTask.startDate));
                              }
                              return false;
                            }}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Reported By */}
                    {(mode === 'create' ? profile : editedTask.createdBy) && (
                      <div className="space-y-1.5">
                        <Label className={cn(
                          'text-xs text-muted-foreground flex items-center gap-1.5',
                          showMobileHeader && 'uppercase tracking-wider font-medium'
                        )}>
                          {!showMobileHeader && <User className="h-3 w-3" />}
                          Reported By
                        </Label>
                        <div className={cn(
                          'flex items-center gap-2 overflow-hidden',
                          showMobileHeader ? '' : 'h-9 px-3 rounded-md border border-input bg-muted/20'
                        )}>
                          <Avatar className="h-5 w-5 shrink-0">
                            <AvatarFallback className="text-[9px]">
                              {mode === 'create'
                                ? (profile?.initials || (profile?.name || '').slice(0, 2).toUpperCase())
                                : editedTask.createdBy?.initials}
                            </AvatarFallback>
                          </Avatar>
                          <span
                            className={cn('text-sm truncate min-w-0', showMobileHeader && 'font-bold text-foreground')}
                            title={mode === 'create'
                              ? (profile?.name || profile?.email)
                              : editedTask.createdBy?.name}
                          >
                            {mode === 'create'
                              ? (profile?.name || profile?.email)
                              : editedTask.createdBy?.name}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Modified By */}
                    {mode !== 'create' && editedTask.updatedBy && (
                      <div className="space-y-1.5">
                        <Label className={cn(
                          'text-xs text-muted-foreground flex items-center gap-1.5',
                          showMobileHeader && 'uppercase tracking-wider font-medium'
                        )}>
                          {!showMobileHeader && <Pencil className="h-3 w-3" />}
                          Modified By
                          <HoverCard openDelay={150} closeDelay={100}>
                            <HoverCardTrigger asChild>
                              <Info className="h-3 w-3 cursor-help" />
                            </HoverCardTrigger>
                            <HoverCardContent
                              side="bottom"
                              align="start"
                              sideOffset={8}
                              className="w-[280px] p-3 text-xs space-y-2 max-h-[240px] overflow-y-auto"
                            >
                              {editedTask.changeHistory && editedTask.changeHistory.length > 0 ? (
                                editedTask.changeHistory.map((entry, idx) => (
                                  <div key={idx} className={idx > 0 ? 'pt-2 border-t border-border/50' : ''}>
                                    <p className="font-medium">{entry.userName}</p>
                                    {formatModifiedFields(entry.fields) && (
                                      <p>Changed: {formatModifiedFields(entry.fields)}</p>
                                    )}
                                    <p className="text-muted-foreground">{format(parseISO(entry.at), 'MMM d, yyyy • h:mm a')}</p>
                                  </div>
                                ))
                              ) : (
                                <div>
                                  <p className="font-medium">{editedTask.updatedBy.name}</p>
                                  {editedTask.updatedAt && (
                                    <p className="text-muted-foreground">{format(parseISO(editedTask.updatedAt), 'MMM d, yyyy • h:mm a')}</p>
                                  )}
                                </div>
                              )}
                            </HoverCardContent>
                          </HoverCard>
                        </Label>
                        <div className={cn(
                          'flex items-center gap-2 overflow-hidden',
                          showMobileHeader ? '' : 'h-9 px-3 rounded-md border border-input bg-muted/20'
                        )}>
                          <Avatar className="h-5 w-5 shrink-0">
                            <AvatarFallback className="text-[9px]">
                              {editedTask.updatedBy.initials}
                            </AvatarFallback>
                          </Avatar>
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={cn('text-sm truncate min-w-0', showMobileHeader && 'font-bold text-foreground')}>
                                  {editedTask.updatedBy.name}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {editedTask.updatedBy.name}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    )}

                    {/* Priority */}
                    <div className="space-y-1.5">
                      <Label className={cn(
                        'text-xs text-muted-foreground flex items-center gap-1.5',
                        showMobileHeader && 'uppercase tracking-wider font-medium'
                      )}>
                        {!showMobileHeader && <AlertTriangle className="h-3 w-3" />}
                        Priority {!showMobileHeader && <span className="text-destructive" aria-hidden="true">*</span>}
                      </Label>
                      <Select
                        value={editedTask.priority}
                        onValueChange={(value) => handleFieldChange('priority', value as Priority)}
                        disabled={!canEditTaskFields}
                      >
                        <SelectTrigger
                          className={cn(
                            showMobileHeader
                              ? 'h-auto w-auto border-0 p-0 shadow-none bg-transparent focus:ring-0 focus-visible:ring-0 [&>svg]:hidden disabled:opacity-100 disabled:cursor-default'
                              : 'h-9',
                            showMobileHeader && !canEditTask && 'opacity-60'
                          )}
                          aria-required="true"
                          title={canEditTaskFields ? undefined : editLockTitle}
                        >
                          <SelectValue>
                            <Badge className={cn('text-xs gap-1', ISSUE_SEVERITY_DISPLAY[editedTask.priority].color)}>
                              {(() => {
                                const PriorityIcon = ISSUE_SEVERITY_DISPLAY[editedTask.priority].icon;
                                return <PriorityIcon className="h-3 w-3" />;
                              })()}
                              {ISSUE_SEVERITY_DISPLAY[editedTask.priority].label}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {ISSUE_SEVERITY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <Badge className={cn('text-xs gap-1', option.color)}>
                                <option.icon className="h-3 w-3" />
                                {option.label}
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Milestone */}
                    {milestones.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className={cn(
                          'text-xs text-muted-foreground flex items-center gap-1.5',
                          showMobileHeader && 'uppercase tracking-wider font-medium'
                        )}>
                          {!showMobileHeader && <Target className="h-3 w-3" />}
                          Milestone
                        </Label>
                        <Select
                          value={editedTask.milestoneId || 'none'}
                          onValueChange={(value) => handleFieldChange('milestoneId', value === 'none' ? undefined : value)}
                          disabled={!canEditTaskFields}
                        >
                          <SelectTrigger
                            className={cn(
                              showMobileHeader
                                ? 'h-auto w-auto border-0 p-0 shadow-none bg-transparent focus:ring-0 focus-visible:ring-0 [&>svg]:hidden disabled:opacity-100 disabled:cursor-default'
                                : 'h-9',
                              showMobileHeader && !canEditTask && 'opacity-60'
                            )}
                            title={canEditTaskFields ? undefined : editLockTitle}
                          >
                            <SelectValue placeholder="No Milestone" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Milestone</SelectItem>
                            {milestones.map((milestone) => (
                              <SelectItem key={milestone.id} value={milestone.id}>{milestone.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Project — only shown when explicitly provided (e.g. My Day, which aggregates tasks across projects) */}
                    {projectName && (
                      <div className="space-y-1.5">
                        <Label className={cn(
                          'text-xs text-muted-foreground flex items-center gap-1.5',
                          showMobileHeader && 'uppercase tracking-wider font-medium'
                        )}>
                          {!showMobileHeader && <FolderKanban className="h-3 w-3" />}
                          Project
                        </Label>
                        <div className={cn(
                          'flex items-center gap-2',
                          showMobileHeader ? '' : 'h-9 px-3 rounded-md border border-input bg-muted/20'
                        )}>
                          <span className={cn('text-sm truncate', showMobileHeader && 'font-bold text-foreground')}>{projectName}</span>
                        </div>
                      </div>
                    )}

                    {/* Modules */}
                    <div className="space-y-1.5">
                      <Label className={cn(
                        'text-xs text-muted-foreground flex items-center gap-1.5',
                        showMobileHeader && 'uppercase tracking-wider font-medium'
                      )}>
                        {!showMobileHeader && <Tag className="h-3 w-3" />}
                        Modules
                      </Label>
                      <div
                        className={cn(
                          'min-h-9 flex w-full flex-wrap items-center gap-2 text-sm transition-colors',
                          showMobileHeader
                            ? ''
                            : 'rounded-md border border-input bg-transparent px-3 py-1.5 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
                          canEditTaskFields ? 'cursor-pointer hover:border-primary/50' : 'cursor-not-allowed',
                          !canEditTask && 'opacity-60'
                        )}
                        title={canEditTaskFields ? undefined : editLockTitle}
                        onClick={() => canEditTaskFields && setIsModulePopoverOpen(true)}
                      >
                        {(editedTask.moduleIds || []).length === 0 && (
                          <span className="text-muted-foreground text-xs">Select modules...</span>
                        )}
                        {(editedTask.moduleIds || []).map((moduleId) => {
                          const module = modules?.find(m => m.id === moduleId);
                          if (!module) return null;
                          return (
                            <Badge key={module.id} variant="secondary" className="max-w-full px-2 py-0.5 gap-1.5 h-6 hover:bg-secondary/80 transition-colors cursor-default">
                              <span className="text-xs font-normal truncate max-w-[120px]">{module.name}</span>
                              <button
                                disabled={!canEditTaskFields}
                                title={canEditTaskFields ? undefined : editLockTitle}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const updatedIds = (editedTask.moduleIds || []).filter(id => id !== module.id);
                                  setEditedTask(prev => ({
                                    ...prev,
                                    moduleIds: updatedIds,
                                    moduleId: updatedIds[0] || undefined,
                                    module: updatedIds.length > 0
                                      ? (modules.find(m => m.id === updatedIds[0])?.type || prev.module)
                                      : prev.module,
                                    updatedAt: new Date().toISOString()
                                  }));
                                }}
                                className={cn(
                                  'ml-auto text-muted-foreground hover:text-foreground transition-colors outline-none',
                                  !canEditTaskFields && 'cursor-not-allowed opacity-60'
                                )}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                        <Popover open={isModulePopoverOpen} onOpenChange={(open) => canEditTaskFields && setIsModulePopoverOpen(open)}>
                          <PopoverTrigger asChild>
                            <button
                              disabled={!canEditTaskFields}
                              title={canEditTaskFields ? undefined : editLockTitle}
                              onClick={(e) => e.stopPropagation()}
                              className={cn(
                                'h-6 w-6 rounded-full p-0 border border-dashed border-muted-foreground/50 hover:border-solid hover:border-primary hover:text-primary transition-all bg-transparent shadow-none focus:ring-0 [&>svg]:hidden flex items-center justify-center',
                                !canEditTaskFields && 'cursor-not-allowed opacity-60'
                              )}
                            >
                              <span>
                                <Plus className="h-3 w-3" />
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="p-0 w-[240px] min-h-[160px] max-h-[var(--radix-popover-content-available-height)] overflow-hidden" align="start">
                            <Command>
                              <CommandInput placeholder="Search modules..." />
                              <CommandList className="max-h-[calc(var(--radix-popover-content-available-height)_-_45px)] overflow-y-auto">
                                <CommandEmpty className="py-2 px-2">
                                  <div className="text-sm text-center py-2 text-muted-foreground">
                                    No modules found.
                                  </div>
                                  {onAddModule && (
                                    <button
                                      className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                                      onClick={() => {
                                        onAddModule();
                                        setIsModulePopoverOpen(false);
                                      }}
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                      Create New Module
                                    </button>
                                  )}
                                </CommandEmpty>
                                <CommandGroup heading="Available Modules">
                                  {modules
                                    .filter(m => !(editedTask.moduleIds || []).includes(m.id))
                                    .map((module) => (
                                      <CommandItem
                                        key={module.id}
                                        value={module.name}
                                        onSelect={() => {
                                          const isFirst = (editedTask.moduleIds || []).length === 0;
                                          const updatedIds = [...(editedTask.moduleIds || []), module.id];
                                          setEditedTask(prev => {
                                            const updated = {
                                              ...prev,
                                              moduleIds: updatedIds,
                                              moduleId: isFirst ? module.id : prev.moduleId,
                                              module: isFirst ? module.type : prev.module,
                                              updatedAt: new Date().toISOString()
                                            };
                                            if (mode !== 'create') {
                                              onUpdate(updated);
                                            }
                                            return updated;
                                          });
                                          setIsModulePopoverOpen(false);
                                        }}
                                        className="cursor-pointer min-w-0"
                                      >
                                        <div className="flex flex-col min-w-0 w-full">
                                          <span className="truncate block">{module.name}</span>
                                        </div>
                                      </CommandItem>
                                    ))}
                                </CommandGroup>
                                {onAddModule && (
                                  <>
                                    <Separator />
                                    <CommandGroup>
                                      <CommandItem
                                        onSelect={() => {
                                          onAddModule();
                                          setIsModulePopoverOpen(false);
                                        }}
                                        className="cursor-pointer text-primary"
                                      >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Create New Module
                                      </CommandItem>
                                    </CommandGroup>
                                  </>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {/* Tags — spans 2 cols */}
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className={cn(
                        'text-xs text-muted-foreground flex items-center gap-1.5',
                        showMobileHeader && 'uppercase tracking-wider font-medium'
                      )}>
                        {!showMobileHeader && <Tag className="h-3 w-3" />}
                        Tags
                      </Label>
                      <div className={cn(
                        'min-h-9 flex w-full flex-wrap items-center gap-2 text-sm',
                        showMobileHeader ? '' : 'rounded-md border border-input bg-transparent px-3 py-1.5'
                      )}>
                        {editedTask.tags.map((tag, index) => (
                          <Badge
                            key={`${tag}-${index}`}
                            className="gap-1 pr-1.5 text-white border-transparent hover:opacity-90"
                            style={{ backgroundColor: getTagColor(tag) }}
                          >
                            {editingTagIndex === index ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <Input
                                  autoFocus
                                  value={editingTagValue}
                                  onChange={(e) => handleTagInputChange(e.target.value, setEditingTagValue)}
                                  maxLength={MAX_TAG_LENGTH}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      saveEditedTag();
                                    }
                                  }}
                                  className="h-6 w-28 bg-background px-2 text-xs text-foreground"
                                />
                                <Button type="button" size="icon" variant="ghost" className="h-5 w-5 hover:bg-black/10" onClick={saveEditedTag}>
                                  <Check className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <span>{tag}</span>
                                {!isMobileFieldsLocked && (
                                  <>
                                    <button
                                      type="button"
                                      className="rounded p-0.5 hover:bg-black/10"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingTagIndex(index);
                                        setEditingTagValue(tag);
                                        setEditingTagOriginal(tag);
                                      }}
                                      aria-label={`Edit tag ${tag}`}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded p-0.5 hover:bg-black/10"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleFieldChange('tags', editedTask.tags.filter((_, tagIndex) => tagIndex !== index));
                                      }}
                                      aria-label={`Remove tag ${tag}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </Badge>
                        ))}

                        {!isMobileFieldsLocked && (
                          <Popover
                            open={isTagPopoverOpen}
                            onOpenChange={(open) => {
                              setIsTagPopoverOpen(open);
                              if (!open) {
                                setTagSearch('');
                                setEditingTagIndex(null);
                                setEditingTagValue('');
                                setEditingTagOriginal(null);
                              }
                            }}
                          >
                            <PopoverTrigger asChild>
                              <button className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/40 hover:border-primary hover:text-primary flex items-center justify-center transition-colors text-muted-foreground">
                                <Plus className="h-3 w-3" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-[240px] flex flex-col min-h-[180px] max-h-[var(--radix-popover-content-available-height)] overflow-hidden" align="start">
                              <div className="p-2 border-b">
                                <div className="flex items-center gap-2">
                                  <Input
                                    placeholder="Search or create tag…"
                                    value={tagSearch}
                                    onChange={(e) => handleTagInputChange(e.target.value, setTagSearch)}
                                    maxLength={MAX_TAG_LENGTH}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addTag(tagSearch);
                                      }
                                    }}
                                    className="h-7 text-sm"
                                    autoFocus
                                  />
                                </div>
                              </div>

                              {/* cmdk's CommandList owns the scroll here — the plain
                                  scrolling div this replaced sat inside the modal's
                                  ScrollArea and lost the wheel to it, so the list
                                  couldn't be scrolled the way the issue picker can. */}
                              <Command shouldFilter={false}>
                                <CommandList className="max-h-[180px] overflow-y-auto">
                                  {/* Own empty state rather than CommandEmpty: filtering is
                                      done here (shouldFilter={false}), so cmdk's own
                                      empty detection never fires. */}
                                  {availableTagSuggestions.filter(tag => !tagSearch.trim() || tag.toLowerCase().includes(tagSearch.toLowerCase())).length === 0 && (
                                    <div className="py-3 text-center text-sm text-muted-foreground">
                                      No matching tags.
                                    </div>
                                  )}
                                  <CommandGroup>
                                    {availableTagSuggestions
                                      .filter(tag => !tagSearch.trim() || tag.toLowerCase().includes(tagSearch.toLowerCase()))
                                      .map((tag) => (
                                        <CommandItem
                                          key={tag}
                                          value={tag}
                                          onSelect={() => addTag(tag)}
                                          className="cursor-pointer flex items-center gap-2 group/tag"
                                        >
                                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getTagColor(tag) }} />
                                          <span className="flex-1 truncate">{tag}</span>
                                          <button
                                            type="button"
                                            aria-label={`Delete tag ${tag}`}
                                            title="Delete tag from this project"
                                            className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover/tag:opacity-100"
                                            onClick={(e) => requestTagDelete(e, tag)}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </CommandItem>
                                      ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>

                              <div className="border-t p-1.5">
                                <button
                                  type="button"
                                  className={cn(
                                    "w-full flex items-center gap-2 text-sm px-2 py-1.5 rounded transition-colors",
                                    tagSearch.trim() && !availableTagSuggestions.some(t => t.toLowerCase() === tagSearch.trim().toLowerCase())
                                      ? "text-primary hover:bg-primary/10 cursor-pointer"
                                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
                                  )}
                                  onClick={() => addTag(tagSearch)}
                                >
                                  <Plus className="h-3 w-3 shrink-0" />
                                  {tagSearch.trim() && !availableTagSuggestions.some(t => t.toLowerCase() === tagSearch.trim().toLowerCase())
                                    ? <span>Create <strong>"{tagSearch.trim()}"</strong></span>
                                    : <span>Create new tag…</span>
                                  }
                                </button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Description Section */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className={cn('text-sm font-medium', showMobileHeader && 'text-xs uppercase tracking-wider text-muted-foreground')}>Description</Label>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="task-advanced-mode" className="text-xs text-muted-foreground cursor-pointer">Advanced Editor</Label>
                    <Switch
                      id="task-advanced-mode"
                      checked={isAdvancedDescription}
                      onCheckedChange={handleAdvancedDescriptionToggle}
                      disabled={!canEditTaskFields}
                      className={cn(showMobileHeader && 'disabled:opacity-100 disabled:cursor-pointer', showMobileHeader && !canEditTask && 'opacity-60')}
                    />
                  </div>
                </div>
                {isAdvancedDescription ? (
                  <div
                    className={cn(
                      'min-h-[200px] border rounded-md p-4 bg-background',
                      !canEditTask && 'opacity-60 cursor-not-allowed'
                    )}
                    title={canEditTaskFields ? undefined : editLockTitle}
                  >
                    <SlashBlockEditor
                      key={editedTask.id || 'create'}
                      readOnly={!canEditTaskFields}
                      initialBlocks={editedTask.descriptionBlocks}
                      onChange={handleDescriptionBlocksChange}
                    />
                  </div>
                ) : (
                  <LinkHighlightTextarea
                    value={editedTask.description || ''}
                    onChange={(e) => handleFieldChange('description', e.target.value)}
                    placeholder="Describe the task in detail..."
                    className={cn(
                      'min-h-[150px] resize-none',
                      showMobileHeader && 'disabled:opacity-100 disabled:cursor-default',
                      showMobileHeader && !canEditTask && 'opacity-60'
                    )}
                    disabled={!canEditTaskFields}
                    title={canEditTaskFields ? undefined : editLockTitle}
                  />
                )}
              </section>

              <Separator />

              {/* Checklist Section */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className={cn(
                    'text-sm font-medium text-muted-foreground flex items-center gap-2',
                    showMobileHeader && 'text-xs uppercase tracking-wider'
                  )}>
                    {!showMobileHeader && <CheckSquare className="h-4 w-4" />}
                    Checklist
                    {checklist.length > 0 && (
                      <span className="text-xs normal-case">({completedItems}/{checklist.length})</span>
                    )}
                  </h3>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="show-checklist-in-board-view"
                      checked={showChecklistInBoardView}
                      onCheckedChange={(checked) => handleToggleChecklistBoardViewForAll(checked === true)}
                      disabled={checklist.length === 0}
                    />
                    <Label
                      htmlFor="show-checklist-in-board-view"
                      className={cn(
                        "text-sm font-normal",
                        checklist.length === 0 ? "text-muted-foreground/60 cursor-not-allowed" : "cursor-pointer"
                      )}
                    >
                      Show in board view
                    </Label>
                  </div>
                </div>

                {checklist.length > 0 && !isMobile && (
                  <Progress value={checklistProgress} className="h-2" />
                )}

                <div className="space-y-2">
                  {!isMobileFieldsLocked && (
                    <div className="flex items-center gap-2 mb-4">
                      <Input
                        placeholder="Add checklist item..."
                        value={newChecklistItem}
                        onChange={(e) => setNewChecklistItem(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                        className="flex-1"
                      />
                      <Button size="sm" onClick={handleAddChecklistItem}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <div className={cn(showMobileHeader && checklist.length > 0 && 'border rounded-xl divide-y')}>
                    {checklist.map((item) => (
                      <div key={item.id} className={cn('flex items-center gap-3 group', showMobileHeader && 'px-3 py-2.5')}>
                        <Checkbox
                          checked={item.completed}
                          onCheckedChange={() => handleToggleChecklistItem(item.id)}
                          disabled={isMobileFieldsLocked}
                          className={cn(
                            showMobileHeader && 'h-5 w-5 rounded-md data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500 disabled:opacity-100 disabled:cursor-default'
                          )}
                        />
                        {editingChecklistId === item.id ? (
                          <div className="flex-1 flex items-center gap-2">
                            <Input
                              autoFocus
                              value={editingChecklistValue}
                              onChange={(e) => setEditingChecklistValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEditChecklist();
                                if (e.key === 'Escape') handleCancelEditChecklist();
                              }}
                              className="h-8"
                            />
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveEditChecklist}>
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCancelEditChecklist}>
                              <X className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className={cn('flex-1 text-sm', item.completed && 'line-through text-muted-foreground')}>
                              {item.text}
                            </span>
                            {!isMobileFieldsLocked && (
                              <div className={cn('flex items-center gap-1', showMobileHeader ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleStartEditChecklist(item)}
                                >
                                  <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleRemoveChecklistItem(item.id)}
                                >
                                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <Separator />

              {/* Attachments Section */}
              <section className="space-y-3">
                <h3 className={cn(
                  'text-sm font-medium text-muted-foreground flex items-center gap-2',
                  showMobileHeader && 'text-xs uppercase tracking-wider justify-between'
                )}>
                  <span className="flex items-center gap-2">
                    {!showMobileHeader && <Paperclip className="h-4 w-4" />}
                    Attachments
                  </span>
                  {showMobileHeader && attachments.length > 0 && <span>{attachments.length}</span>}
                </h3>

                <div className="space-y-2">
                  {attachments.map((attachment) => {
                    const FileIcon = getFileIcon(attachment.fileType);
                    const viewUrl = resolveFileUrl(attachment.url) ?? attachment.url;
                    const isImage = attachment.fileType.startsWith('image/') && !failedThumbnails.has(attachment.id);
                    return (
                      <div
                        key={attachment.id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 group cursor-pointer hover:bg-muted"
                        onClick={() => setPreviewingFile({ url: viewUrl, fileName: attachment.filename, mimeType: attachment.fileType })}
                      >
                        {isImage ? (
                          <img
                            src={viewUrl}
                            alt={attachment.filename}
                            className="h-8 w-8 rounded object-cover shrink-0 border"
                            onError={() => setFailedThumbnails(prev => new Set(prev).add(attachment.id))}
                          />
                        ) : (
                          <FileIcon className="h-8 w-8 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{attachment.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(attachment.fileSize)} • Uploaded by {attachment.uploadedBy.name}
                          </p>
                        </div>
                        <div className={cn('flex items-center gap-1', showMobileHeader ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              const a = document.createElement('a');
                              a.href = viewUrl;
                              a.download = attachment.filename;
                              a.click();
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {!isMobileFieldsLocked && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveAttachment(attachment.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Pending files (create mode only) */}
                  {mode === 'create' && pendingFiles.length > 0 && (
                    <div className="space-y-1">
                      {pendingFiles.map((f, i) => {
                        const previewUrl = pendingFileUrls[i];
                        const isImage = f.type.startsWith('image/');
                        return (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-muted/30 text-sm cursor-pointer hover:bg-muted/50"
                            onClick={() => setPreviewingFile({ url: previewUrl, fileName: f.name, mimeType: f.type })}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isImage && previewUrl ? (
                                <img
                                  src={previewUrl}
                                  alt={f.name}
                                  className="h-10 w-10 rounded object-cover shrink-0 border"
                                />
                              ) : (
                                <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                              )}
                              <span className="truncate">{f.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(f.size)}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingFiles(prev => prev.filter((_, idx) => idx !== i));
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!isMobileFieldsLocked && (
                    <div className="flex items-center justify-center w-full">
                      <label
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={cn(
                          "flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
                          isDragging ? "border-primary bg-primary/10" : "bg-muted/20 hover:bg-muted/40",
                          isUploading && "opacity-50 pointer-events-none"
                        )}>
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            {isUploading ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <Upload className="h-5 w-5" />
                            )}
                            <span className="text-sm font-medium">
                              {isUploading ? 'Uploading...' : 'Add Attachment'}
                            </span>
                          </div>
                          {!isUploading && <p className="text-xs text-muted-foreground mt-1">or drag and drop, or paste image</p>}
                        </div>
                        <input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.zip,.rar,video/*" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                      </label>
                    </div>
                  )}
                </div>
              </section>

              <Separator />

              {/* Video Links Section */}
              <section className="space-y-3">
                <h3 className={cn(
                  'text-sm font-medium text-muted-foreground flex items-center gap-2',
                  showMobileHeader && 'text-xs uppercase tracking-wider justify-between'
                )}>
                  <span className="flex items-center gap-2">
                    {!showMobileHeader && <Video className="h-4 w-4" />}
                    Videos
                  </span>
                  {showMobileHeader && videoLinks.length > 0 && <span>{videoLinks.length}</span>}
                </h3>

                <div className="space-y-2">
                  {!isMobileFieldsLocked && (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Paste video URL…"
                        value={videoLinkInput}
                        onChange={(e) => setVideoLinkInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddVideoLink(); } }}
                        className="text-sm"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddVideoLink}
                        disabled={!videoLinkInput.trim()}
                        className="shrink-0"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {videoLinks.map((vl) => {
                    const thumbnail = getVideoThumbnail(vl.url);
                    return (
                      <div
                        key={vl.id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 group cursor-pointer hover:bg-muted"
                        onClick={() => setPreviewingFile({ url: vl.url, fileName: vl.title || vl.url })}
                      >
                        <div className="relative h-10 w-16 rounded overflow-hidden bg-black/20 shrink-0 flex items-center justify-center">
                          {thumbnail ? (
                            <img src={thumbnail} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Video className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-black/50 rounded-full p-1">
                              <Play className="h-3 w-3 text-white fill-white" />
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{vl.title || vl.url}</p>
                          <p className="text-xs text-muted-foreground truncate">{vl.url}</p>
                        </div>
                        {!isMobileFieldsLocked && (
                          <div className={cn('flex items-center gap-1', showMobileHeader ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveVideoLink(vl.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Uploaded video files in pending mode */}
                  {mode === 'create' && pendingFiles.filter(f => f.type.startsWith('video/')).length > 0 && (
                    <div className="space-y-1">
                      {pendingFiles.filter(f => f.type.startsWith('video/')).map((f, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-muted/30 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">{f.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(f.size)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <Separator />

              {/* Dependencies Section */}
              <section className="space-y-4">
                <h3 className={cn(
                  'text-sm font-medium text-muted-foreground flex items-center gap-2',
                  showMobileHeader && 'text-xs uppercase tracking-wider'
                )}>
                  {!showMobileHeader && <Link2 className="h-4 w-4" />}
                  Dependencies
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Blocking To */}
                  <div className={cn('space-y-3', showMobileHeader && 'border rounded-xl p-3')}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-priority-high" />
                      <Label className="text-xs font-medium">Blocking To</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">Tasks that depend on this task</p>

                    <div className="space-y-2">
                      {!isMobileFieldsLocked && (
                        <div className="flex gap-2">
                          <Popover open={isBlockingTaskPopoverOpen} onOpenChange={setIsBlockingTaskPopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={isBlockingTaskPopoverOpen}
                                className="flex-1 justify-start font-normal text-muted-foreground"
                              >
                                Select task...
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-h-[180px] max-h-[var(--radix-popover-content-available-height)] overflow-hidden" align="start">
                              <Command>
                                <CommandInput placeholder="Search tasks..." />
                                <CommandList
                                  className="max-h-[calc(var(--radix-popover-content-available-height)_-_45px)] overflow-y-auto"
                                >
                                  <CommandEmpty>
                                    {availableTasksForBlocking.length === 0 ? "No available tasks" : "No results found."}
                                  </CommandEmpty>
                                  <CommandGroup>
                                    {availableTasksForBlocking.map((t) => (
                                      <CommandItem
                                        key={t.id}
                                        value={t.title}
                                        onSelect={() => {
                                          handleAddBlockingTask(t.id);
                                          setIsBlockingTaskPopoverOpen(false);
                                        }}
                                        className="cursor-pointer"
                                      >
                                        {t.title}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}

                      {showMobileHeader && blockingToTaskIds.length === 0 && (
                        <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-2">
                          This task isn't blocking anything.
                        </p>
                      )}
                      {blockingToTaskIds.map((taskId) => {
                        const depTask = getTaskById(taskId);
                        if (!depTask) return null;
                        return (
                          <div
                            key={taskId}
                            className="flex items-center justify-between p-2 bg-muted/50 rounded-lg group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={cn(
                                'w-2 h-2 rounded-full',
                                statusOptions.find(s => s.value === depTask.status)?.color || 'bg-muted-foreground/60'
                              )} />
                              <span className="text-sm truncate">{depTask.title}</span>
                            </div>
                            {!isMobileFieldsLocked && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                onClick={() => handleRemoveBlockingTask(taskId)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Blocked By */}
                  <div className={cn('space-y-3', showMobileHeader && 'border rounded-xl p-3')}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-status-blocked" />
                      <Label className="text-xs font-medium">Blocked By</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">Tasks that must complete first</p>

                    <div className="space-y-2">
                      {!isMobileFieldsLocked && (
                        <div className="flex gap-2">
                          <Popover open={isBlockedByTaskPopoverOpen} onOpenChange={setIsBlockedByTaskPopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={isBlockedByTaskPopoverOpen}
                                className="flex-1 justify-start font-normal text-muted-foreground"
                              >
                                Select task...
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-h-[180px] max-h-[var(--radix-popover-content-available-height)] overflow-hidden" align="start">
                              <Command>
                                <CommandInput placeholder="Search tasks..." />
                                <CommandList
                                  className="max-h-[calc(var(--radix-popover-content-available-height)_-_45px)] overflow-y-auto"
                                >
                                  <CommandEmpty>
                                    {availableTasksForBlockedBy.length === 0 ? "No available tasks" : "No results found."}
                                  </CommandEmpty>
                                  <CommandGroup>
                                    {availableTasksForBlockedBy.map((t) => (
                                      <CommandItem
                                        key={t.id}
                                        value={t.title}
                                        onSelect={() => {
                                          handleAddBlockedByTask(t.id);
                                          setIsBlockedByTaskPopoverOpen(false);
                                        }}
                                        className="cursor-pointer"
                                      >
                                        {t.title}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}

                      {showMobileHeader && editedTask.blockedBy.length === 0 && (
                        <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-2">
                          This task has no blockers.
                        </p>
                      )}
                      {editedTask.blockedBy.map((taskId) => {
                        const depTask = getTaskById(taskId);
                        if (!depTask) return null;
                        return (
                          <div
                            key={taskId}
                            className="flex items-center justify-between p-2 bg-muted/50 rounded-lg group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={cn(
                                'w-2 h-2 rounded-full',
                                statusOptions.find(s => s.value === depTask.status)?.color || 'bg-muted-foreground/60'
                              )} />
                              <span className="text-sm truncate">{depTask.title}</span>
                            </div>
                            {!isMobileFieldsLocked && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                onClick={() => handleRemoveBlockedByTask(taskId)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              <Separator />

              {/* Comments Section */}
              <section className="space-y-4">
                <h3 className={cn(
                  'text-sm font-medium flex items-center gap-2',
                  showMobileHeader && 'text-xs uppercase tracking-wider text-muted-foreground justify-between'
                )}>
                  <span className="flex items-center gap-2">
                    {!showMobileHeader && <MessageSquare className="h-4 w-4" />}
                    Comments
                  </span>
                  {showMobileHeader ? <span>{comments.length}</span> : `(${comments.length})`}
                </h3>

                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {comments.map((comment) => {
                    const isOwnComment = profile?.id === comment.author.id;
                    const isEditingThisComment = editingCommentId === comment.id;
                    return (
                      <div key={comment.id} className="flex gap-3 p-3 bg-muted/50 rounded-lg group">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {comment.author.initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{comment.author.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(comment.createdAt), 'MMM d, yyyy h:mm a')}
                            </span>
                            {isOwnComment && !isEditingThisComment && (
                              <div className="ml-auto flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  className="rounded p-0.5 text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
                                  onClick={() => handleStartEditComment(comment)}
                                  aria-label="Edit comment"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  className="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                                  onClick={() => handleDeleteComment(comment.id)}
                                  aria-label="Delete comment"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                          {isEditingThisComment ? (
                            <div className="space-y-2">
                              <Textarea
                                autoFocus
                                value={editingCommentValue}
                                onChange={(e) => setEditingCommentValue(e.target.value)}
                                className="min-h-[60px] text-sm"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    handleSaveEditComment();
                                  }
                                }}
                              />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={handleSaveEditComment} disabled={!editingCommentValue.trim()}>
                                  Save
                                </Button>
                                <Button size="sm" variant="outline" onClick={handleCancelEditComment}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground break-words">{comment.content}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
                        e.preventDefault();
                        handleAddComment();
                      }
                    }}
                    className="min-h-[80px]"
                  />
                  <Button className="h-auto" onClick={handleAddComment} disabled={!newComment.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </section>
            </div>
          </ScrollArea>
          {mode === 'create' && (
            <div className="p-4 border-t flex justify-end gap-2 bg-background z-10 w-full shrink-0">
              <Button variant="outline" onClick={attemptClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!canSubmitTask || isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Task
              </Button>
            </div>
          )}
          {mode === 'view' && showMobileHeader && isMobileEditMode && (
            <div className="px-4 py-3 border-t bg-background shrink-0">
              <Button
                className="w-full"
                onClick={handleUpdateTask}
                disabled={isSaving || !editedTask.title || !editedTask.dueDate || isBlockedWithoutDependencies || !canEditTask || !isFormDirty}
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Task
              </Button>
            </div>
          )}
          {mode === 'view' && !showMobileHeader && (
            <div className="p-4 border-t flex items-center justify-between gap-2 bg-background z-10 w-full">
              {/* Delete button on the bottom left — only the task creator or a project/organization Admin can delete */}
              {onDelete ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={!canDeleteTask}
                  title={canDeleteTask ? 'Delete this task' : deleteLockTitle}
                  className={cn(
                    'text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-2',
                    !canDeleteTask && 'cursor-not-allowed opacity-60'
                  )}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Task
                </Button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={attemptClose} disabled={isSaving}>
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateTask}
                  disabled={isSaving || !editedTask.title || !editedTask.dueDate || isBlockedWithoutDependencies || !canEditTask || !isFormDirty}
                  title={canEditTask ? undefined : (isFormDirty ? editLockTitle : 'No changes to save')}
                >
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Task
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
        <ConfirmationDialog
          open={!!tagPendingDelete}
          onOpenChange={(open) => { if (!open) setTagPendingDelete(null); }}
          onConfirm={async () => {
            if (!tagPendingDelete) return;
            const { id, name } = tagPendingDelete;
            setTagPendingDelete(null);
            try {
              await deleteTagMutation.mutateAsync(id);
              toast.success(`Tag "${name}" deleted`);
            } catch {
              /* useDeleteTag surfaces the server message */
            }
          }}
          title="Delete tag"
          description={`"${tagPendingDelete?.name ?? ''}" isn't used by any task or issue. Deleting removes it from this project's tag list.`}
          confirmText="Delete"
          variant="destructive"
        />
        <ConfirmationDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          onConfirm={handleDelete}
          title="Delete Task"
          description="Are you sure you want to delete this task? This action cannot be undone."
          confirmText="Delete"
          variant="destructive"
        />
        <ConfirmationDialog
          open={showUnsavedConfirm}
          onOpenChange={setShowUnsavedConfirm}
          onConfirm={handleCancel}
          title="Discard changes?"
          description="You have unsaved changes. Are you sure you want to discard them?"
          confirmText="Discard"
          cancelText="Keep Editing"
          variant="destructive"
          extraActionText={isMobile ? "Update Task" : undefined}
          onExtraAction={isMobile ? () => {
            if (!editedTask.title || !editedTask.dueDate || isBlockedWithoutDependencies || !canEditTask) {
              toast.error('Please fix required fields before updating.');
              return;
            }
            handleUpdateTask();
          } : undefined}
        />
      </Dialog>
      <FilePreviewDialog
        file={previewingFile}
        files={[
          ...attachments.map(a => ({ url: resolveFileUrl(a.url) ?? a.url, fileName: a.filename, mimeType: a.fileType })),
          ...pendingFiles.map((f, i) => ({ url: pendingFileUrls[i], fileName: f.name, mimeType: f.type })),
          ...videoLinks.map(v => ({ url: v.url, fileName: v.title || v.url })),
        ]}
        onClose={() => setPreviewingFile(null)}
      />
    </>
  );
}