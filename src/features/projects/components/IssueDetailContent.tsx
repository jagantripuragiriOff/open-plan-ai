import { useState, useEffect, useLayoutEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { format, parseISO, startOfDay } from 'date-fns';
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
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
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
import { cn, getDisplayId } from '@/lib/utils';
import { resolveFileUrl } from '@/utils/fileUrl';
import { renamePastedImageFile } from '@/utils/pastedFile';
import { FilePreviewDialog, FilePreviewTarget, getVideoThumbnail } from '@/components/FilePreviewDialog';
import {
    Calendar as CalendarIcon,
    MessageSquare,
    AlertTriangle,
    AlertCircle,
    Info,
    Bug,
    Truck,
    FileWarning,
    FlaskConical,
    Pencil,
    Link2,
    User,
    Tag,
    Send,
    X,
    Plus,
    CheckSquare,
    FileText,
    Trash2,
    Paperclip,
    Download,
    Copy,
    Image as ImageIcon,
    File,
    Check,
    Maximize2,
    Loader2,
    Upload,
    Video,
    Play,
    FolderKanban,
    LifeBuoy,
} from 'lucide-react';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Issue,
    IssueStatus,
    IssueSeverity,
    IssueCategory,
    Comment,
    ChecklistItem,
    Attachment,
    Task,
    TeamMember,
    VideoLink,
} from '@/types';
import { SlashBlockEditor, EditorBlock } from '@/components/ui/SlashBlockEditor';
import { blocksToPlainText, hasBlockContent, plainTextToBlocks } from '@/lib/descriptionBlocks';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ISSUE_SEVERITY_DISPLAY, ISSUE_SEVERITY_OPTIONS } from './issueSeverity';
import { formatModifiedFields } from './modifiedFields';
import { attachmentsService } from '@/services/attachments.service';
import { commentsService } from '@/services/comments.service';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectTags, useCreateTag, useDeleteTag } from '@/hooks/useProjectTags';
import { getFallbackTagColor } from '@/lib/tagColors';
import { useIssueColumns } from '@/hooks/useIssueColumns';
import { DEFAULT_ISSUE_COLUMNS } from '@/services/issueColumns.service';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { useIsMobile } from '@/hooks/use-mobile';

interface IssueDetailContentProps {
    issue: Issue | null;
    tasks?: Task[];
    teamMembers?: TeamMember[];
    onUpdate: (issue: Issue) => void;
    onDelete?: (issueId: string) => void;
    userProjectRole?: string;
    onExpand?: () => void; // Optional expanded view action
    isExpanded?: boolean;
    isDraft?: boolean;
    mode?: 'view' | 'create';
    onPendingFilesChange?: (files: File[]) => void;
    /** Shown as a read-only "Project" field when provided. Only pass this from contexts (like My Day) where the issue's project isn't already implied by the surrounding page. */
    projectName?: string;
    /** Project's short display-ID prefix — renders a "{projectCode}-I-{number}" pill next to the title when both this and the issue's number are available. */
    projectCode?: string;
    /**
     * Controls the mobile read-only/edit-mode gate. Omit to leave fields always editable
     * (e.g. the full-page IssuePage route, which has no "Edit" affordance of its own).
     * When provided (from IssueDetailModal's mobile "..." menu), fields stay locked until true.
     */
    isMobileEditMode?: boolean;
}

export interface IssueDetailContentHandle {
    commitPendingComments: () => Promise<void>;
}


const categoryOptions: { value: IssueCategory; label: string; icon: typeof Bug }[] = [
    { value: 'defect', label: 'Defect', icon: Bug },
    { value: 'risk', label: 'Risk', icon: AlertTriangle },
    { value: 'supplier', label: 'Supplier', icon: Truck },
    { value: 'compliance', label: 'Compliance', icon: FileWarning },
    { value: 'test-failure', label: 'Test Failure', icon: FlaskConical },
    { value: 'design-change', label: 'Design Change', icon: Pencil },
    { value: 'other', label: 'Other', icon: Info },
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

const serializeIssueForDirtyCheck = (issue: Issue): string => {
    const attachmentSnapshot = (issue.attachments || [])
        .map(a => ({ id: a.id, filename: a.filename, fileType: a.fileType, fileSize: a.fileSize, url: a.url }))
        .sort((a, b) => a.id.localeCompare(b.id));

    return JSON.stringify({
        title: issue.title || '',
        description: issue.description || '',
        descriptionBlocks: issue.descriptionBlocks || null,
        category: issue.category,
        categoryOther: issue.categoryOther || '',
        severity: issue.severity,
        status: issue.status,
        moduleId: issue.moduleId || null,
        dueDate: issue.dueDate || null,
        resolution: issue.resolution || '',
        assigneeIds: (issue.assignees || []).map(a => a.id).sort(),
        tags: [...(issue.tags || [])].sort(),
        blockedBy: [...(issue.blockedBy || [])].sort(),
        blocksTaskIds: [...(issue.blocksTaskIds || [])].sort(),
        checklist: issue.checklist || [],
        comments: issue.comments || [],
        videoLinks: issue.videoLinks || [],
        attachments: attachmentSnapshot,
    });
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Draft issues use a client-generated `issue-${Date.now()}` id until the create
// mutation resolves — guard against firing comment/attachment fetches with it.
const isUuid = (id: string) => UUID_REGEX.test(id);

export const IssueDetailContent = forwardRef<IssueDetailContentHandle, IssueDetailContentProps>(function IssueDetailContent({
    issue,
    tasks = [],
    teamMembers = [],
    onUpdate,
    onDelete,
    userProjectRole,
    onExpand,
    isExpanded = false,
    isDraft = false,
    mode = 'view',
    onPendingFilesChange,
    projectName,
    projectCode,
    isMobileEditMode,
}, ref) {
    const { user: profile } = useAuth();
    const isMobile = useIsMobile();
    const isMobileLayout = isMobile && mode !== 'create';
    // Locked only when a parent explicitly controls edit mode (the mobile modal's "..." menu)
    // and hasn't switched it on yet. Uncontrolled callers (e.g. IssuePage) stay always-editable.
    const isMobileFieldsLocked = isMobileLayout && isMobileEditMode === false;
    const [editedIssue, setEditedIssue] = useState<Issue | null>(issue);
    // Snapshot of the issue as it was when this dialog instance mounted — never
    // updated afterward — so we can tell whether the user actually changed
    // anything before firing an update + success toast on a no-op Save.
    const initialIssueSnapshotRef = useRef(issue ? serializeIssueForDirtyCheck(issue) : '');
    const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());
    const [newComment, setNewComment] = useState('');
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingCommentValue, setEditingCommentValue] = useState('');
    const [pendingNewCommentIds, setPendingNewCommentIds] = useState<Set<string>>(new Set());
    const [pendingEditedComments, setPendingEditedComments] = useState<Map<string, string>>(new Map());
    const [pendingDeletedCommentIds, setPendingDeletedCommentIds] = useState<Set<string>>(new Set());
    const [isAssigneePopoverOpen, setIsAssigneePopoverOpen] = useState(false);
    const [isBlockingTaskPopoverOpen, setIsBlockingTaskPopoverOpen] = useState(false);
    const [isBlockedByTaskPopoverOpen, setIsBlockedByTaskPopoverOpen] = useState(false);
    const [isAdvancedDescription, setIsAdvancedDescription] = useState(false);
    const [newChecklistItem, setNewChecklistItem] = useState('');
    const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
    const [editingChecklistValue, setEditingChecklistValue] = useState('');
    const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
    const [isDueDatePopoverOpen, setIsDueDatePopoverOpen] = useState(false);
    const [tagSearch, setTagSearch] = useState('');
    const tagSearchInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [previewingFile, setPreviewingFile] = useState<FilePreviewTarget | null>(null);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [pendingFileUrls, setPendingFileUrls] = useState<string[]>([]);
    const [videoLinkInput, setVideoLinkInput] = useState('');

    useEffect(() => {
        const urls = pendingFiles.map(f => URL.createObjectURL(f));
        setPendingFileUrls(urls);
        return () => { urls.forEach(url => URL.revokeObjectURL(url)); };
    }, [pendingFiles]);

    const projectId = issue?.projectId;
    const { canEditResource, canDeleteResource } = useProjectPermissions(projectId);
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
    const canEditIssueFields = canEditIssue && !isMobileFieldsLocked;
    const editLockTitle = 'You can only edit items you created or are assigned to';
    const deleteLockTitle = 'Only the issue reporter or a project/organization Admin can delete this issue';
    const { data: apiIssueColumns } = useIssueColumns(projectId);
    const statusOptions = (apiIssueColumns && apiIssueColumns.length > 0 ? apiIssueColumns : DEFAULT_ISSUE_COLUMNS)
        .filter((c) => !c.isSpecial || c.status !== 'wont-fix' ? true : true)
        .map((c) => ({ value: c.status, label: c.label, color: c.color }));

    const { data: projectTags = [] } = useProjectTags(projectId);
    const createTagMutation = useCreateTag(projectId);
    // A tag leaves the project registry only when nothing references it —
    // deleting one still attached would strip it from every task and issue
    // silently, so those are refused with a message naming what holds it.
    // The backend enforces the same rule.
    const deleteTagMutation = useDeleteTag(projectId);
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
    const tagColorMap = useMemo(() => {
        const map = new Map<string, string>();
        projectTags.forEach((t) => map.set(t.name.toLowerCase(), t.color));
        return map;
    }, [projectTags]);
    const getTagColor = (tag: string) => tagColorMap.get(tag.toLowerCase()) ?? getFallbackTagColor(tag);

    useEffect(() => {
        onPendingFilesChange?.(pendingFiles);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingFiles]);

    // useLayoutEffect (not useEffect) for both of the effects below — this
    // component instance is reused across different issues opened one after
    // another (only the `issue` prop changes), and the outer modal that seeds
    // it now also resets synchronously via useLayoutEffect. A regular
    // useEffect here runs after paint, so there'd still be a frame showing
    // the PREVIOUS issue's title/description/advanced-mode state before this
    // catches up — a visible flash when switching issues quickly.
    useLayoutEffect(() => {
        if (issue) {
            // Preserve loaded comments only when staying on the same issue —
            // they're fetched separately via API and would otherwise leak
            // stale comments into a newly opened/created issue.
            setEditedIssue(prev => ({
                ...issue,
                comments: prev && prev.id === issue.id ? (prev.comments ?? issue.comments ?? []) : (issue.comments ?? []),
            }));
        }
    }, [issue]);

    useLayoutEffect(() => {
        // Set advanced-description mode from the loaded issue's own data — on if
        // it has blocks, off otherwise. This component instance is reused across
        // different issues (only the `issue` prop changes), so without the
        // unconditional else branch, toggling it on for one issue would leak into
        // every issue opened afterward instead of reflecting each issue's own state.
        // Keyed on issue id (not the whole issue object) so this only runs when
        // switching issues, not on every keystroke while editing a draft.
        setIsAdvancedDescription(!!(issue?.descriptionBlocks && issue.descriptionBlocks.length > 0));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [issue?.id]);

    // Load comments from API whenever an existing issue is opened.
    useEffect(() => {
        if (mode === 'create' || !issue?.id || !isUuid(issue.id)) return;
        let cancelled = false;
        commentsService.getByEntity(issue.id, 'issue').then(dbComments => {
            if (cancelled) return;
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
            setEditedIssue(prev => (prev && prev.id === issue.id ? { ...prev, comments: mappedComments } : prev));
        }).catch(() => { });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [issue?.id, mode]);

    // The issue payload returned by the project/issue endpoints never embeds
    // attachments (they live behind a separate uploads endpoint), so fetch them
    // explicitly whenever an existing issue is opened.
    useEffect(() => {
        if (mode === 'create' || !issue?.id || !isUuid(issue.id)) return;
        let cancelled = false;
        attachmentsService.getByEntity(issue.id, 'issue').then(records => {
            if (cancelled) return;
            const mapped = records.map(r => {
                const uploader = teamMembers.find(m => m.id === (r.uploadedBy ?? r.uploaded_by));
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
            setEditedIssue(prev => (prev && prev.id === issue.id ? { ...prev, attachments: mapped } : prev));
        }).catch(() => { });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [issue?.id, mode]);

    const isIssueDirty = useMemo(
        () => !!editedIssue && initialIssueSnapshotRef.current !== '' && serializeIssueForDirtyCheck(editedIssue) !== initialIssueSnapshotRef.current,
        [editedIssue]
    );

    if (!editedIssue) return null;

    const handleFieldsChange = (patch: Partial<Issue>) => {
        setEditedIssue(prev => {
            if (!prev) return prev;
            const updated = { ...prev, ...patch };
            if (isDraft) {
                onUpdate(updated);
            }
            return updated;
        });
    };

    const handleFieldChange = <K extends keyof Issue>(field: K, value: Issue[K]) => {
        handleFieldsChange({ [field]: value } as Partial<Issue>);
    };

    // Advanced blocks are the source of truth while the toggle is on, but the
    // plain `description` is what every card, list and preview renders — so
    // mirror the flattened text across on every block edit. Without it an
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
            // Carry whatever is in the plain box into the editor instead of
            // dropping the user in front of an empty one.
            if (!hasBlockContent(editedIssue.descriptionBlocks as EditorBlock[] | undefined)) {
                const seeded = plainTextToBlocks(editedIssue.description);
                if (seeded.length > 0) {
                    handleFieldsChange({
                        descriptionBlocks: seeded,
                        description: blocksToPlainText(seeded),
                    });
                }
            }
        } else {
            // Going back to simple mode: keep the text, drop the blocks — a
            // record that still has blocks reopens in advanced mode.
            const flattened = blocksToPlainText(editedIssue.descriptionBlocks as EditorBlock[] | undefined);
            handleFieldsChange({
                description: flattened || editedIssue.description || '',
                descriptionBlocks: [],
            });
        }
        setIsAdvancedDescription(enabled);
    };

    const checklist = editedIssue.checklist || [];
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

    const attachments = editedIssue.attachments || [];
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

    const isDuplicateFile = (file: File, existing: { name: string; size: number }[]) =>
        existing.some(f => f.name === file.name && f.size === file.size);

    const dedupeIncomingFiles = (files: File[], existing: { name: string; size: number }[]) => {
        const unique: File[] = [];
        const seen = [...existing];
        let skipped = 0;
        for (const file of files) {
            if (isDuplicateFile(file, seen)) {
                skipped++;
                continue;
            }
            unique.push(file);
            seen.push({ name: file.name, size: file.size });
        }
        if (skipped > 0) {
            toast.warning(`Skipped ${skipped} duplicate file${skipped > 1 ? 's' : ''}`);
        }
        return unique;
    };

    const processFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        if (mode === 'create') {
            const newFiles = dedupeIncomingFiles(Array.from(files), pendingFiles);
            if (newFiles.length === 0) return;
            setPendingFiles(prev => [...prev, ...newFiles]);
            return;
        }
        const newFiles = dedupeIncomingFiles(
            Array.from(files),
            attachments.map(a => ({ name: a.filename, size: a.fileSize }))
        );
        if (newFiles.length === 0) return;
        setIsUploading(true);
        try {
            const results = await Promise.all(
                newFiles.map(file =>
                    attachmentsService.upload({
                        entityId: editedIssue.id,
                        entityType: 'issue',
                        projectId: editedIssue.projectId,
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
                        ? { id: profile.id, name: profile.name, email: profile.email, role: profile.role || 'member', initials: profile.initials ?? '' }
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

    const handleRemovePendingFile = (index: number) => {
        setPendingFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleRemoveAttachment = async (attachmentId: string) => {
        try {
            await attachmentsService.delete(attachmentId);
        } catch {
            // Already removed or never persisted server-side; fall through to local removal.
        }
        handleFieldChange('attachments', attachments.filter(a => a.id !== attachmentId));
    };

    const videoLinks: VideoLink[] = editedIssue.videoLinks || [];

    const handleAddVideoLink = () => {
        const url = videoLinkInput.trim();
        if (!url) return;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            toast.error('Please enter a valid URL starting with http:// or https://');
            return;
        }
        if (videoLinks.some(v => v.url === url)) {
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

    const comments = editedIssue.comments || [];

    const availableTasksForBlocking = tasks.filter(
        t => !editedIssue.blocksTaskIds?.includes(t.id)
    );

    const availableTasksForBlockedBy = tasks.filter(
        t => !editedIssue.blockedBy?.includes(t.id)
    );

    const handleAddBlockingTask = (taskId: string) => {
        const currentBlocks = editedIssue.blocksTaskIds || [];
        handleFieldChange('blocksTaskIds', [...currentBlocks, taskId]);
    };

    const handleRemoveBlockingTask = (taskId: string) => {
        const currentBlocks = editedIssue.blocksTaskIds || [];
        handleFieldChange('blocksTaskIds', currentBlocks.filter(id => id !== taskId));
    };

    const handleAddBlockedByTask = (taskId: string) => {
        const currentBlockedBy = editedIssue.blockedBy || [];
        handleFieldChange('blockedBy', [...currentBlockedBy, taskId]);
    };

    const handleRemoveBlockedByTask = (taskId: string) => {
        const currentBlockedBy = editedIssue.blockedBy || [];
        handleFieldChange('blockedBy', currentBlockedBy.filter(id => id !== taskId));
    };

    const getTaskById = (id: string) => tasks.find(t => t.id === id);

    // Comment add/edit/delete are staged locally only; they're persisted to the DB
    // via commitPendingComments(), which fires when the real "Update"/"Save" action runs.
    const handleAddComment = async () => {
        if (!newComment.trim()) return;
        const content = newComment.trim();
        setNewComment('');

        const newCommentId = `comment-${Date.now()}`;
        const newCommentObj: Comment = {
            id: newCommentId,
            content,
            author: profile
                ? { id: profile.id, name: profile.name || profile.email, initials: profile.initials || '?', avatar: profile.avatarUrl || undefined, email: profile.email, role: profile.role || 'member' }
                : { id: 'unknown', name: 'Unknown User', initials: '?', email: '', role: 'member' },
            createdAt: new Date().toISOString(),
        };
        handleFieldChange('comments', [...comments, newCommentObj]);
        if (mode !== 'create' && issue?.id && isUuid(issue.id)) {
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

        handleFieldChange('comments', comments.map(c => c.id === commentId ? { ...c, content } : c));
        if (mode !== 'create' && !pendingNewCommentIds.has(commentId)) {
            setPendingEditedComments(prev => new Map(prev).set(commentId, content));
        }
        setEditingCommentId(null);
        setEditingCommentValue('');
    };

    const handleDeleteComment = async (commentId: string) => {
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

        handleFieldChange('comments', comments.filter(c => c.id !== commentId));
    };

    const commitPendingComments = async () => {
        if (mode === 'create' || !issue?.id || !isUuid(issue.id)) return;

        for (const id of pendingDeletedCommentIds) {
            try {
                await commentsService.delete(id);
            } catch {
                toast.error('Failed to delete comment');
            }
        }
        for (const [id, content] of pendingEditedComments) {
            try {
                await commentsService.update(id, content);
            } catch {
                toast.error('Failed to update comment');
            }
        }
        for (const id of pendingNewCommentIds) {
            const comment = (editedIssue?.comments || []).find(c => c.id === id);
            if (!comment) continue;
            try {
                await commentsService.create({
                    content: comment.content,
                    entity_id: issue.id,
                    entity_type: 'issue',
                });
            } catch {
                toast.error('Failed to add comment');
            }
        }
        setPendingDeletedCommentIds(new Set());
        setPendingEditedComments(new Map());
        setPendingNewCommentIds(new Set());
    };

    useImperativeHandle(ref, () => ({ commitPendingComments }));

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header with Title and Metadata */}
            <div className={cn('flex flex-col gap-4', isMobileLayout && 'gap-3')}>
                {isMobileLayout && projectName && (
                    <p className="text-xs text-muted-foreground">
                        {projectName} <span className="mx-1">›</span> Board
                        {getDisplayId(projectCode, 'I', editedIssue?.number) && (
                            <span className="ml-2 font-mono font-semibold text-blue-500">
                                {getDisplayId(projectCode, 'I', editedIssue?.number)}
                            </span>
                        )}
                    </p>
                )}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                        {!isMobileLayout && (
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Issue Title <span className="text-destructive" aria-hidden="true">*</span></Label>
                        )}
                        <Input
                            value={editedIssue.title}
                            onChange={(e) => handleFieldChange('title', e.target.value)}
                            className={cn(
                                isMobileLayout
                                    ? 'text-xl font-bold h-auto py-1 px-0 border-0 shadow-none focus-visible:ring-0 rounded-none w-full disabled:opacity-100 disabled:cursor-default'
                                    : 'text-base font-semibold w-full',
                                isMobileLayout && !canEditIssue && 'opacity-60'
                            )}
                            placeholder="Issue title..."
                            aria-required="true"
                            disabled={!canEditIssueFields}
                            title={canEditIssueFields ? undefined : editLockTitle}
                        />
                    </div>
                </div>

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
                    onConfirm={() => {
                        onDelete?.(editedIssue.id);
                        setShowDeleteConfirm(false);
                    }}
                    title="Delete Issue"
                    description="Are you sure you want to delete this issue? This action cannot be undone."
                    confirmText="Delete"
                    variant="destructive"
                />

                <div className="flex flex-col gap-6">
                    {/* Assigned To — dedicated full-width row, avatar-only display */}
                    <div className="space-y-1.5">
                        <Label className={cn(
                            'text-xs text-muted-foreground flex items-center gap-1.5',
                            isMobileLayout && 'uppercase tracking-wider font-medium'
                        )}>
                            {!isMobileLayout && <User className="h-3 w-3" />}
                            Assigned To
                        </Label>
                        <Popover open={isAssigneePopoverOpen} onOpenChange={(open) => canEditIssueFields && setIsAssigneePopoverOpen(open)}>
                            <PopoverTrigger asChild>
                                <button
                                    disabled={!canEditIssueFields}
                                    title={canEditIssueFields ? undefined : editLockTitle}
                                    className={cn(
                                        'flex items-center gap-2 h-10 px-2 w-full text-left rounded-md hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                        !canEditIssue && 'cursor-not-allowed opacity-60 hover:bg-transparent'
                                    )}
                                >
                                    <TooltipProvider delayDuration={150}>
                                        <div className="flex items-center">
                                            {(editedIssue.assignees || []).slice(0, 6).map((assignee, index) => (
                                                <Tooltip key={assignee.id}>
                                                    <TooltipTrigger asChild>
                                                        <div
                                                            className="rounded-full ring-2 ring-background cursor-pointer"
                                                            style={{ zIndex: index, marginLeft: index === 0 ? 0 : '-8px' }}
                                                        >
                                                            <Avatar className="h-8 w-8">
                                                                <AvatarImage src={resolveFileUrl(assignee.avatar) ?? assignee.avatar} alt={assignee.name} />
                                                                <AvatarFallback className="text-xs font-semibold bg-primary/15 text-primary">
                                                                    {assignee.initials}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="text-xs">
                                                        {assignee.name}
                                                        {assignee.assignedBy && ` · assigned by ${assignee.assignedBy.name}`}
                                                    </TooltipContent>
                                                </Tooltip>
                                            ))}
                                            {(editedIssue.assignees || []).length > 6 && (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <div
                                                            className="h-8 w-8 rounded-full ring-2 ring-background bg-muted flex items-center justify-center cursor-pointer"
                                                            style={{ zIndex: 6, marginLeft: '-8px' }}
                                                        >
                                                            <span className="text-xs text-muted-foreground font-medium">+{(editedIssue.assignees || []).length - 6}</span>
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="text-xs">
                                                        {(editedIssue.assignees || []).slice(6).map(a => a.name).join(', ')}
                                                    </TooltipContent>
                                                </Tooltip>
                                            )}
                                        </div>
                                    </TooltipProvider>
                                    <div className="h-8 w-8 rounded-full border-2 border-dashed border-muted-foreground/40 hover:border-primary hover:text-primary transition-all flex items-center justify-center shrink-0">
                                        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                                    </div>
                                    {(editedIssue.assignees || []).length === 0 && (
                                        <span className="text-sm text-muted-foreground">Click to assign members...</span>
                                    )}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-[260px] min-h-[180px] max-h-[var(--radix-popover-content-available-height)] overflow-hidden" align="start">
                                <Command>
                                    <CommandInput placeholder="Search members..." />

                                    {(editedIssue.assignees || []).length > 0 && (
                                        <div className="p-2 border-b">
                                            <p className="text-xs font-medium text-muted-foreground px-2 mb-1">Assigned</p>
                                            {[...(editedIssue.assignees || [])].sort((a, b) => a.name.localeCompare(b.name)).map((assignee) => (
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
                                                        disabled={!canEditIssueFields}
                                                        title={canEditIssueFields ? undefined : editLockTitle}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleFieldChange('assignees', (editedIssue.assignees || []).filter(a => a.id !== assignee.id));
                                                        }}
                                                        className={cn(
                                                            'text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100',
                                                            !canEditIssueFields && 'cursor-not-allowed group-hover:opacity-60'
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
                                            {teamMembers.filter(m => !editedIssue.assignees?.some(a => a.id === m.id)).length === 0
                                                ? "All members assigned"
                                                : "No results found."}
                                        </CommandEmpty>
                                        {teamMembers.filter(m => !editedIssue.assignees?.some(a => a.id === m.id)).length > 0 && (
                                            <CommandGroup heading="Add members">
                                                {teamMembers
                                                    .filter(m => !editedIssue.assignees?.some(a => a.id === m.id))
                                                    .sort((a, b) => a.name.localeCompare(b.name))
                                                    .map((member) => (
                                                        <CommandItem
                                                            key={member.id}
                                                            value={member.name}
                                                            onSelect={() => {
                                                                handleFieldChange('assignees', [...(editedIssue.assignees || []), member]);
                                                            }}
                                                            className="cursor-pointer items-start"
                                                        >
                                                            <Avatar className="h-5 w-5 mr-2 mt-0.5 shrink-0">
                                                                <AvatarImage src={resolveFileUrl(member.avatar) ?? member.avatar} alt={member.name} />
                                                                <AvatarFallback className="text-[9px]">{member.initials}</AvatarFallback>
                                                            </Avatar>
                                                            <span className="min-w-0">{member.name}</span>
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
                    {isMobileLayout && (
                        <div className="space-y-1.5">
                            <Label className="block text-xs text-muted-foreground uppercase tracking-wider font-medium">Status</Label>
                            <Select
                                value={editedIssue.status}
                                onValueChange={(value) => handleFieldChange('status', value as IssueStatus)}
                                disabled={!canEditIssueFields}
                            >
                                <SelectTrigger
                                    className={cn(
                                        'h-auto w-auto border-0 p-0 shadow-none bg-transparent focus:ring-0 focus-visible:ring-0 [&>svg]:hidden disabled:opacity-100 disabled:cursor-default',
                                        !canEditIssue && 'opacity-60'
                                    )}
                                    title={canEditIssueFields ? undefined : editLockTitle}
                                >
                                    <SelectValue>
                                        <span
                                            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-white"
                                            style={{ backgroundColor: statusOptions.find(s => s.value === editedIssue.status)?.color ?? '#6b7280' }}
                                        >
                                            {statusOptions.find(s => s.value === editedIssue.status)?.label ?? editedIssue.status}
                                        </span>
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {statusOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: option.color }} />
                                                {option.label}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {isMobileLayout && (
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium -mb-2">Details</Label>
                    )}
                    <div className={cn(isMobileLayout && 'border rounded-xl p-4')}>
                        {/* Metadata Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start">
                            {/* Status */}
                            <div className="space-y-1.5">
                                <Label className={cn(
                                    'text-xs text-muted-foreground flex items-center gap-1.5',
                                    isMobileLayout && 'uppercase tracking-wider font-medium'
                                )}>
                                    {!isMobileLayout && <AlertCircle className="h-3 w-3" />}
                                    Bucket {!isMobileLayout && <span className="text-destructive" aria-hidden="true">*</span>}
                                </Label>
                                <Select
                                    value={editedIssue.status}
                                    onValueChange={(value) => handleFieldChange('status', value as IssueStatus)}
                                    disabled={!canEditIssueFields}
                                >
                                    <SelectTrigger
                                        className={cn(isMobileLayout ? 'h-auto w-auto border-0 p-0 shadow-none bg-transparent focus:ring-0 focus-visible:ring-0 [&>svg]:hidden disabled:opacity-100 disabled:cursor-default' : 'h-9', isMobileLayout && !canEditIssue && 'opacity-60')}
                                        aria-required="true"
                                        title={canEditIssueFields ? undefined : (statusOptions.find(s => s.value === editedIssue.status)?.label ?? editedIssue.status)}
                                    >
                                        <SelectValue>
                                            <div className={cn('flex items-center gap-2 min-w-0', isMobileLayout && 'font-bold text-sm text-foreground')}>
                                                <div
                                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: statusOptions.find(s => s.value === editedIssue.status)?.color ?? '#6b7280' }}
                                                />
                                                <span className="truncate">
                                                    {statusOptions.find(s => s.value === editedIssue.status)?.label ?? editedIssue.status}
                                                </span>
                                            </div>
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {statusOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: option.color }} />
                                                    {option.label}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Reported Date */}
                            <div className="space-y-1.5">
                                <Label className={cn(
                                    'text-xs text-muted-foreground flex items-center gap-1.5',
                                    isMobileLayout && 'uppercase tracking-wider font-medium'
                                )}>
                                    {!isMobileLayout && <CalendarIcon className="h-3 w-3" />}
                                    Reported
                                </Label>
                                <div className={cn(
                                    'text-sm flex items-center',
                                    isMobileLayout ? 'font-bold text-foreground' : 'py-2 px-3 h-9 border rounded-md bg-muted/20 text-muted-foreground'
                                )}>
                                    {format(new Date(editedIssue.reportedAt || (editedIssue as any).createdAt || new Date()), isMobileLayout ? 'MMM d' : 'PPP')}
                                </div>
                            </div>

                            {/* Due Date */}
                            <div className="space-y-1.5">
                                <Label className={cn(
                                    'text-xs text-muted-foreground flex items-center gap-1.5',
                                    isMobileLayout && 'uppercase tracking-wider font-medium'
                                )}>
                                    {!isMobileLayout && <CalendarIcon className="h-3 w-3" />}
                                    Due Date
                                </Label>
                                <Popover open={isDueDatePopoverOpen} onOpenChange={(open) => canEditIssueFields && setIsDueDatePopoverOpen(open)}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant={isMobileLayout ? 'ghost' : 'outline'}
                                            disabled={!canEditIssueFields}
                                            title={canEditIssueFields ? undefined : editLockTitle}
                                            className={cn(
                                                isMobileLayout
                                                    ? 'h-auto w-auto p-0 justify-start text-left font-bold text-sm text-foreground hover:bg-transparent disabled:opacity-100 disabled:pointer-events-none'
                                                    : 'w-full justify-start text-left font-normal h-9 px-3',
                                                !editedIssue.dueDate && 'text-muted-foreground',
                                                isMobileLayout && !canEditIssue && 'opacity-60'
                                            )}
                                        >
                                            {editedIssue.dueDate
                                                ? format(new Date(editedIssue.dueDate), isMobileLayout ? 'MMM d' : 'PPP')
                                                : 'Set date'}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 min-h-[300px] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={editedIssue.dueDate ? parseISO(editedIssue.dueDate) : undefined}
                                            onSelect={(date) => {
                                                if (date) {
                                                    // Use local date string YYYY-MM-DD to avoid timezone shifts
                                                    // Adjust for timezone offset to ensure we get the correct local YYYY-MM-DD
                                                    // or just use format from date-fns which uses local time
                                                    handleFieldChange('dueDate', format(date, 'yyyy-MM-dd'));
                                                } else {
                                                    handleFieldChange('dueDate', undefined);
                                                }
                                                setIsDueDatePopoverOpen(false);
                                            }}
                                            disabled={(date) => date < startOfDay(new Date())}
                                            initialFocus
                                            className="p-3 pointer-events-auto"
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Reported By */}
                            <div className="space-y-1.5">
                                <Label className={cn(
                                    'text-xs text-muted-foreground flex items-center gap-1.5',
                                    isMobileLayout && 'uppercase tracking-wider font-medium'
                                )}>
                                    {!isMobileLayout && <User className="h-3 w-3" />}
                                    Reported By
                                </Label>
                                <div className={cn(
                                    'flex items-center gap-2',
                                    isMobileLayout ? '' : 'h-9 px-3 rounded-md border border-input bg-muted/20'
                                )}>
                                    <Avatar className="h-5 w-5 shrink-0">
                                        <AvatarImage src={resolveFileUrl(editedIssue.reportedBy.avatar) ?? editedIssue.reportedBy.avatar} alt={editedIssue.reportedBy.name} />
                                        <AvatarFallback className="text-[9px]">
                                            {editedIssue.reportedBy.initials}
                                        </AvatarFallback>
                                    </Avatar>
                                    <TooltipProvider delayDuration={150}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className={cn('text-sm truncate min-w-0 flex-1', isMobileLayout && 'font-bold text-foreground')}>{editedIssue.reportedBy.name}</span>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="text-xs">
                                                {editedIssue.reportedBy.name}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            </div>

                            {/* Modified By */}
                            {editedIssue.updatedBy && (
                                <div className="space-y-1.5">
                                    <Label className={cn(
                                        'text-xs text-muted-foreground flex items-center gap-1.5',
                                        isMobileLayout && 'uppercase tracking-wider font-medium'
                                    )}>
                                        {!isMobileLayout && <Pencil className="h-3 w-3" />}
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
                                                {editedIssue.changeHistory && editedIssue.changeHistory.length > 0 ? (
                                                    editedIssue.changeHistory.map((entry, idx) => (
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
                                                        <p className="font-medium">{editedIssue.updatedBy.name}</p>
                                                        {editedIssue.updatedAt && (
                                                            <p className="text-muted-foreground">{format(parseISO(editedIssue.updatedAt), 'MMM d, yyyy • h:mm a')}</p>
                                                        )}
                                                    </div>
                                                )}
                                            </HoverCardContent>
                                        </HoverCard>
                                    </Label>
                                    <div className={cn(
                                        'flex items-center gap-2',
                                        isMobileLayout ? '' : 'h-9 px-3 rounded-md border border-input bg-muted/20'
                                    )}>
                                        <Avatar className="h-5 w-5 shrink-0">
                                            <AvatarFallback className="text-[9px]">
                                                {editedIssue.updatedBy.initials}
                                            </AvatarFallback>
                                        </Avatar>
                                        <TooltipProvider delayDuration={150}>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span className={cn('text-sm truncate min-w-0 flex-1', isMobileLayout && 'font-bold text-foreground')}>{editedIssue.updatedBy.name}</span>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="text-xs">
                                                    {editedIssue.updatedBy.name}
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                </div>
                            )}

                            {/* Project — only shown when explicitly provided (e.g. My Day, which aggregates issues across projects) */}
                            {projectName && (
                                <div className="space-y-1.5">
                                    <Label className={cn(
                                        'text-xs text-muted-foreground flex items-center gap-1.5',
                                        isMobileLayout && 'uppercase tracking-wider font-medium'
                                    )}>
                                        {!isMobileLayout && <FolderKanban className="h-3 w-3" />}
                                        Project
                                    </Label>
                                    <div className={cn(
                                        'flex items-center gap-2',
                                        isMobileLayout ? '' : 'h-9 px-3 rounded-md border border-input bg-muted/20'
                                    )}>
                                        <span className={cn('text-sm truncate', isMobileLayout && 'font-bold text-foreground')}>{projectName}</span>
                                    </div>
                                </div>
                            )}

                            {/* Priority */}
                            <div className="space-y-1.5">
                                <Label className={cn(
                                    'text-xs text-muted-foreground flex items-center gap-1.5',
                                    isMobileLayout && 'uppercase tracking-wider font-medium'
                                )}>
                                    {!isMobileLayout && <AlertTriangle className="h-3 w-3" />}
                                    Priority {!isMobileLayout && <span className="text-destructive" aria-hidden="true">*</span>}
                                </Label>
                                <Select
                                    value={editedIssue.severity}
                                    onValueChange={(value) => handleFieldChange('severity', value as IssueSeverity)}
                                    disabled={!canEditIssueFields}
                                >
                                    <SelectTrigger
                                        className={cn(isMobileLayout ? 'h-auto w-auto border-0 p-0 shadow-none bg-transparent focus:ring-0 focus-visible:ring-0 [&>svg]:hidden disabled:opacity-100 disabled:cursor-default' : 'h-9', isMobileLayout && !canEditIssue && 'opacity-60')}
                                        aria-required="true"
                                        title={canEditIssueFields ? undefined : editLockTitle}
                                    >
                                        <SelectValue>
                                            <Badge className={cn('text-xs gap-1', ISSUE_SEVERITY_DISPLAY[editedIssue.severity].color)}>
                                                {(() => {
                                                    const SeverityIcon = ISSUE_SEVERITY_DISPLAY[editedIssue.severity].icon;
                                                    return <SeverityIcon className="h-3 w-3" />;
                                                })()}
                                                {ISSUE_SEVERITY_DISPLAY[editedIssue.severity].label}
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

                            {/* Category */}
                            <div className="space-y-1.5">
                                <Label className={cn(
                                    'text-xs text-muted-foreground flex items-center gap-1.5',
                                    isMobileLayout && 'uppercase tracking-wider font-medium'
                                )}>
                                    {!isMobileLayout && <Tag className="h-3 w-3" />}
                                    Category {!isMobileLayout && <span className="text-destructive" aria-hidden="true">*</span>}
                                </Label>
                                <Select
                                    value={editedIssue.category}
                                    onValueChange={(value) => {
                                        handleFieldChange('category', value as IssueCategory);
                                        if (value !== 'other') handleFieldChange('categoryOther', undefined);
                                    }}
                                    disabled={!canEditIssueFields}
                                >
                                    <SelectTrigger
                                        className={cn(isMobileLayout ? 'h-auto w-auto border-0 p-0 shadow-none bg-transparent focus:ring-0 focus-visible:ring-0 [&>svg]:hidden disabled:opacity-100 disabled:cursor-default' : 'h-9', isMobileLayout && !canEditIssue && 'opacity-60')}
                                        aria-required="true"
                                        title={canEditIssueFields ? undefined : editLockTitle}
                                    >
                                        <SelectValue placeholder="All Categories">
                                            {(() => {
                                                const cat = categoryOptions.find(c => c.value === editedIssue.category);
                                                if (!cat) return undefined;
                                                const Icon = cat.icon;
                                                return (
                                                    <div className={cn('flex items-center gap-2', isMobileLayout && 'font-bold text-sm text-foreground')}>
                                                        {!isMobileLayout && <Icon className="h-4 w-4" />}
                                                        {cat.label}
                                                    </div>
                                                );
                                            })()}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categoryOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                <div className="flex items-center gap-2">
                                                    <option.icon className="h-4 w-4" />
                                                    {option.label}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {editedIssue.category === 'other' && (
                                    <Input
                                        value={editedIssue.categoryOther || ''}
                                        onChange={(e) => handleFieldChange('categoryOther', e.target.value)}
                                        placeholder="Describe the category…"
                                        disabled={!canEditIssueFields}
                                        className={cn(
                                            'h-9',
                                            !editedIssue.categoryOther?.trim() && 'border-destructive',
                                            isMobileLayout && 'disabled:opacity-100 disabled:cursor-default',
                                            isMobileLayout && !canEditIssue && 'opacity-60'
                                        )}
                                        aria-required="true"
                                    />
                                )}
                            </div>

                            {/* Tags (Span 2 columns) */}
                            <div className="space-y-1.5 md:col-span-2">
                                <Label className={cn(
                                    'text-xs text-muted-foreground flex items-center gap-1.5',
                                    isMobileLayout && 'uppercase tracking-wider font-medium'
                                )}>
                                    {!isMobileLayout && <Tag className="h-3 w-3" />}
                                    Tags
                                </Label>
                                <div
                                    className={cn(
                                        'min-h-9 flex w-full flex-wrap items-center gap-2 text-sm cursor-pointer transition-colors',
                                        isMobileLayout ? '' : 'rounded-md border border-input bg-transparent px-3 py-1.5 hover:border-primary/50'
                                    )}
                                    onClick={() => !isMobileFieldsLocked && setIsTagPopoverOpen(true)}
                                >
                                    {(editedIssue.tags || []).map((tag) => (
                                        <Badge
                                            key={tag}
                                            className="text-xs font-normal pl-2 pr-1 gap-1 text-white border-transparent hover:opacity-90"
                                            style={{ backgroundColor: getTagColor(tag) }}
                                        >
                                            {tag}
                                            {!isMobileFieldsLocked && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleFieldChange('tags', (editedIssue.tags || []).filter(t => t !== tag));
                                                    }}
                                                    className="hover:bg-black/10 rounded-full p-0.5 transition-colors"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            )}
                                        </Badge>
                                    ))}

                                    {!isMobileFieldsLocked && (
                                        // Stop clicks from bubbling to the container's onClick above —
                                        // PopoverContent is portaled in the DOM but stays a React-tree
                                        // descendant of that div, so without this, selecting a tag (or
                                        // re-clicking "+") would bubble up and force the popover back open
                                        // right after it closes.
                                        <div onClick={(e) => e.stopPropagation()}>
                                        <Popover
                                            open={isTagPopoverOpen}
                                            onOpenChange={(open) => {
                                                setIsTagPopoverOpen(open);
                                                if (!open) setTagSearch('');
                                            }}
                                        >
                                            <PopoverTrigger asChild>
                                                <button className="h-6 w-6 rounded-full border border-dashed text-muted-foreground hover:border-primary hover:text-primary flex items-center justify-center transition-colors">
                                                    <Plus className="h-3 w-3" />
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="p-0 w-[240px] flex flex-col min-h-[180px] max-h-[var(--radix-popover-content-available-height)] overflow-hidden" align="start">
                                                <Command>
                                                    <CommandInput
                                                        ref={tagSearchInputRef}
                                                        placeholder="Search tags..."
                                                        value={tagSearch}
                                                        onValueChange={setTagSearch}
                                                    />
                                                    <CommandList className="max-h-[180px] overflow-y-auto">
                                                        <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
                                                            No matching tags.
                                                        </CommandEmpty>
                                                        {projectTags
                                                            .filter(item => !(editedIssue.tags || []).some(t => t.toLowerCase() === item.name.toLowerCase()))
                                                            .map((item) => (
                                                                <CommandItem
                                                                    key={item.id}
                                                                    value={item.name}
                                                                    onSelect={() => {
                                                                        handleFieldChange('tags', [...(editedIssue.tags || []), item.name]);
                                                                        setIsTagPopoverOpen(false);
                                                                        setTagSearch('');
                                                                    }}
                                                                    className="cursor-pointer flex items-center gap-2 group/tag"
                                                                >
                                                                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                                                    <span className="flex-1 truncate">{item.name}</span>
                                                                    <button
                                                                        type="button"
                                                                        aria-label={`Delete tag ${item.name}`}
                                                                        title="Delete tag from this project"
                                                                        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover/tag:opacity-100"
                                                                        onClick={(e) => requestTagDelete(e, item.name)}
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </button>
                                                                </CommandItem>
                                                            ))}
                                                    </CommandList>
                                                </Command>
                                                {/* Persistent "Create new tag" footer — always visible */}
                                                <div className="border-t p-1.5">
                                                    <button
                                                        className={cn(
                                                            "w-full flex items-center gap-2 text-sm px-2 py-1.5 rounded transition-colors",
                                                            tagSearch.trim() &&
                                                                !projectTags.some(t => t.name.toLowerCase() === tagSearch.trim().toLowerCase())
                                                                ? "text-primary hover:bg-primary/10 cursor-pointer"
                                                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
                                                        )}
                                                        onClick={async () => {
                                                            const name = tagSearch.trim();
                                                            if (!name) {
                                                                tagSearchInputRef.current?.focus();
                                                                return;
                                                            }
                                                            if (projectTags.some(t => t.name.toLowerCase() === name.toLowerCase())) return;
                                                            setTagSearch('');
                                                            setIsTagPopoverOpen(false);
                                                            try {
                                                                const tag = await createTagMutation.mutateAsync({ name });
                                                                handleFieldChange('tags', [...(editedIssue.tags || []), tag.name]);
                                                            } catch {
                                                                handleFieldChange('tags', [...(editedIssue.tags || []), name]);
                                                            }
                                                        }}
                                                    >
                                                        <Plus className="h-3 w-3 shrink-0" />
                                                        {tagSearch.trim() &&
                                                            !projectTags.some(t => t.name.toLowerCase() === tagSearch.trim().toLowerCase())
                                                            ? <span>Create <strong>"{tagSearch.trim()}"</strong></span>
                                                            : <span>Create new tag…</span>
                                                        }
                                                    </button>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Support-portal submitter contact — shown only for issues raised via a public support link */}
                    {(() => {
                        const sub = (issue as any)?.externalSubmission as
                            | { name: string; email: string | null; phone: string | null; submittedAt: string }
                            | null
                            | undefined;
                        if (!sub) return null;
                        return (
                            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <LifeBuoy className="h-4 w-4 text-primary" />
                                    <span className="text-sm font-medium">Submitted via support portal</span>
                                </div>
                                <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                                    <span><span className="font-medium text-foreground">{sub.name}</span></span>
                                    {sub.email && (
                                        <a href={`mailto:${sub.email}`} className="text-primary hover:underline">{sub.email}</a>
                                    )}
                                    {sub.phone && (
                                        <a href={`tel:${sub.phone}`} className="text-primary hover:underline">{sub.phone}</a>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Description Editor (Full Width) */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className={cn('text-sm font-medium', isMobileLayout && 'text-xs uppercase tracking-wider text-muted-foreground')}>Description</Label>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="advanced-mode" className="text-xs text-muted-foreground cursor-pointer">Advanced Editor</Label>
                                <Switch
                                    id="advanced-mode"
                                    checked={isAdvancedDescription}
                                    onCheckedChange={handleAdvancedDescriptionToggle}
                                    disabled={!canEditIssueFields}
                                    className={cn(isMobileLayout && 'disabled:opacity-100 disabled:cursor-pointer', isMobileLayout && !canEditIssue && 'opacity-60')}
                                />
                            </div>
                        </div>

                        {isAdvancedDescription ? (
                            <div
                                className={cn('min-h-[200px] border rounded-md p-4 bg-background', !canEditIssue && 'opacity-60 cursor-not-allowed')}
                                title={canEditIssueFields ? undefined : editLockTitle}
                            >
                                <SlashBlockEditor
                                    key={editedIssue.id}
                                    readOnly={!canEditIssueFields}
                                    initialBlocks={editedIssue.descriptionBlocks}
                                    onChange={handleDescriptionBlocksChange}
                                />
                            </div>
                        ) : (
                            <LinkHighlightTextarea
                                value={editedIssue.description}
                                onChange={(e) => handleFieldChange('description', e.target.value)}
                                placeholder="Describe the issue in detail..."
                                className={cn(
                                    'min-h-[150px] resize-none',
                                    isMobileLayout && 'disabled:opacity-100 disabled:cursor-default',
                                    isMobileLayout && !canEditIssue && 'opacity-60'
                                )}
                                disabled={!canEditIssueFields}
                                title={canEditIssueFields ? undefined : editLockTitle}
                            />
                        )}
                    </div>

                    {/* Checklist (Full Width) */}
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className={cn(
                                'text-sm font-medium text-muted-foreground flex items-center gap-2',
                                isMobileLayout && 'text-xs uppercase tracking-wider'
                            )}>
                                {!isMobileLayout && <CheckSquare className="h-4 w-4" />}
                                Checklist
                                {checklist.length > 0 && (
                                    <span className="text-xs normal-case">({completedItems}/{checklist.length})</span>
                                )}
                            </h3>
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="issue-show-checklist-in-board-view"
                                    checked={showChecklistInBoardView}
                                    onCheckedChange={(checked) => handleToggleChecklistBoardViewForAll(checked === true)}
                                    disabled={checklist.length === 0}
                                />
                                <Label
                                    htmlFor="issue-show-checklist-in-board-view"
                                    className={cn(
                                        "text-sm font-normal",
                                        checklist.length === 0 ? "text-muted-foreground/60 cursor-not-allowed" : "cursor-pointer"
                                    )}
                                >
                                    Show in board view
                                </Label>
                            </div>
                        </div>

                        {checklist.length > 0 && (
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

                            <div className={cn(isMobileLayout && checklist.length > 0 && 'border rounded-xl divide-y')}>
                                {checklist.map((item) => (
                                    <div key={item.id} className={cn('flex items-start gap-3 group', isMobileLayout && 'px-3 py-2.5')}>
                                        <Checkbox
                                            checked={item.completed}
                                            onCheckedChange={() => handleToggleChecklistItem(item.id)}
                                            disabled={isMobileFieldsLocked}
                                            className={cn('mt-0.5', isMobileLayout && 'h-5 w-5 rounded-md data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500 disabled:opacity-100 disabled:cursor-default')}
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
                                                <span className={cn('flex-1 text-sm pt-0.5', item.completed && 'line-through text-muted-foreground')}>
                                                    {item.text}
                                                </span>
                                                {!isMobileFieldsLocked && (
                                                    <div className={cn('flex items-center gap-1 mt-0.5', isMobileLayout ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
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

                    {/* Attachments (Full Width) */}
                    <section className="space-y-3">
                        <h3 className={cn(
                            'text-sm font-medium text-muted-foreground flex items-center gap-2',
                            isMobileLayout && 'text-xs uppercase tracking-wider justify-between'
                        )}>
                            <span className="flex items-center gap-2">
                                {!isMobileLayout && <Paperclip className="h-4 w-4" />}
                                Attachments
                            </span>
                            {isMobileLayout && attachments.length > 0 && <span>{attachments.length}</span>}
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
                                        <div className={cn('flex items-center gap-1', isMobileLayout ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                title="Download"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    try {
                                                        const res = await fetch(viewUrl);
                                                        const blob = await res.blob();
                                                        const blobUrl = URL.createObjectURL(blob);
                                                        const a = document.createElement('a');
                                                        a.href = blobUrl;
                                                        a.download = attachment.filename;
                                                        a.click();
                                                        URL.revokeObjectURL(blobUrl);
                                                    } catch {
                                                        window.open(viewUrl, '_blank');
                                                    }
                                                }}
                                            >
                                                <Download className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                title={attachment.fileType.startsWith('image/') ? 'Copy image to clipboard' : 'Copy link to clipboard'}
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    try {
                                                        if (attachment.fileType.startsWith('image/')) {
                                                            const res = await fetch(viewUrl);
                                                            const blob = await res.blob();
                                                            const bitmap = await createImageBitmap(blob);
                                                            const canvas = document.createElement('canvas');
                                                            canvas.width = bitmap.width;
                                                            canvas.height = bitmap.height;
                                                            canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
                                                            const pngBlob = await new Promise<Blob>((res, rej) =>
                                                                canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png')
                                                            );
                                                            await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
                                                            toast.success('Image copied to clipboard');
                                                        } else {
                                                            await navigator.clipboard.writeText(viewUrl);
                                                            toast.success('Link copied to clipboard');
                                                        }
                                                    } catch {
                                                        toast.error('Failed to copy');
                                                    }
                                                }}
                                            >
                                                <Copy className="h-4 w-4" />
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
                                                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Pending files (create mode only, uploaded once the issue is created) */}
                            {mode === 'create' && pendingFiles.length > 0 && (
                                <div className="space-y-1">
                                    {pendingFiles.map((f, i) => {
                                        const previewUrl = pendingFileUrls[i];
                                        const isImage = f.type.startsWith('image/');
                                        return (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-muted/30 text-sm cursor-pointer hover:bg-muted"
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
                                                    onClick={(e) => { e.stopPropagation(); handleRemovePendingFile(i); }}
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
                                        <input type="file" className="hidden" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.zip,.rar,video/*" onChange={handleFileUpload} disabled={isUploading} />
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
                            isMobileLayout && 'text-xs uppercase tracking-wider justify-between'
                        )}>
                            <span className="flex items-center gap-2">
                                {!isMobileLayout && <Video className="h-4 w-4" />}
                                Videos
                            </span>
                            {isMobileLayout && videoLinks.length > 0 && <span>{videoLinks.length}</span>}
                        </h3>

                        <div className="space-y-2">
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
                                            <div className={cn('flex items-center gap-1', isMobileLayout ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveVideoLink(vl.id);
                                                    }}
                                                >
                                                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Pending video files (create mode) */}
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

                    {/* Dependencies (2 Columns) */}
                    <section className="space-y-4">
                        <h3 className={cn(
                            'text-sm font-medium text-muted-foreground flex items-center gap-2',
                            isMobileLayout && 'text-xs uppercase tracking-wider'
                        )}>
                            {!isMobileLayout && <Link2 className="h-4 w-4" />}
                            Dependencies
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Blocking To */}
                            <div className={cn('space-y-3', isMobileLayout && 'border rounded-xl p-3')}>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-priority-high" />
                                    <Label className="text-xs font-medium">Blocking To</Label>
                                </div>
                                <p className="text-xs text-muted-foreground">Tasks blocked by this issue</p>

                                <div className="space-y-2">
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
                                                        onWheel={(e) => { e.currentTarget.scrollTop += e.deltaY; }}
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

                                    {isMobileLayout && (editedIssue.blocksTaskIds || []).length === 0 && (
                                        <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-2">
                                            This issue isn't blocking anything.
                                        </p>
                                    )}
                                    {(editedIssue.blocksTaskIds || []).map((taskId) => {
                                        const depTask = getTaskById(taskId);
                                        const title = depTask ? depTask.title : `Task ${taskId}`;
                                        return (
                                            <div
                                                key={taskId}
                                                className="flex items-center justify-between p-2 bg-muted/50 rounded-lg group"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {depTask && (
                                                        <div className={cn(
                                                            'w-2 h-2 rounded-full',
                                                            statusOptions.find(s => s.value === depTask.status as any)?.color
                                                        )} />
                                                    )}
                                                    <span className="text-sm truncate">{title}</span>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={cn('h-6 w-6', isMobileLayout ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
                                                    onClick={() => handleRemoveBlockingTask(taskId)}
                                                >
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Blocked By */}
                            <div className={cn('space-y-3', isMobileLayout && 'border rounded-xl p-3')}>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-status-blocked" />
                                    <Label className="text-xs font-medium">Blocked By</Label>
                                </div>
                                <p className="text-xs text-muted-foreground">Tasks blocking this issue</p>

                                <div className="space-y-2">
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
                                                        onWheel={(e) => { e.currentTarget.scrollTop += e.deltaY; }}
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

                                    {isMobileLayout && (editedIssue.blockedBy || []).length === 0 && (
                                        <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-2">
                                            This issue has no blockers.
                                        </p>
                                    )}
                                    {(editedIssue.blockedBy || []).map((taskId) => {
                                        const depTask = getTaskById(taskId);
                                        const title = depTask ? depTask.title : `Task ${taskId}`;
                                        return (
                                            <div
                                                key={taskId}
                                                className="flex items-center justify-between p-2 bg-muted/50 rounded-lg group"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {depTask && (
                                                        <div className={cn(
                                                            'w-2 h-2 rounded-full',
                                                            statusOptions.find(s => s.value === depTask.status as any)?.color
                                                        )} />
                                                    )}
                                                    <span className="text-sm truncate">{title}</span>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={cn('h-6 w-6', isMobileLayout ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
                                                    onClick={() => handleRemoveBlockedByTask(taskId)}
                                                >
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Comments (Full Width) */}
                    <section className="space-y-4">
                        <h3 className={cn(
                            'text-sm font-medium flex items-center gap-2',
                            isMobileLayout && 'text-xs uppercase tracking-wider text-muted-foreground justify-between'
                        )}>
                            <span className="flex items-center gap-2">
                                {!isMobileLayout && <MessageSquare className="h-4 w-4" />}
                                Comments
                            </span>
                            {isMobileLayout ? <span>{comments.length}</span> : `(${comments.length})`}
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

                    {/* Action Bar */}
                    {!isDraft && (
                        <div className="pt-6 border-t flex items-center justify-between">
                            {/* Left side: delete button */}
                            <div className="flex items-center gap-4">
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
                                {!onDelete && (
                                    <div className="text-xs text-muted-foreground italic">
                                        {isSaving ? 'Saving changes...' : 'Last updated ' + format(new Date(), 'h:mm a')}
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3">
                                {onExpand && !isExpanded && (
                                    <Button variant="outline" onClick={onExpand}>
                                        <Maximize2 className="h-4 w-4 mr-2" />
                                        Full Page
                                    </Button>
                                )}
                                <Button
                                    onClick={async () => {
                                        setIsSaving(true);
                                        try {
                                            await onUpdate(editedIssue);
                                            await commitPendingComments();
                                            toast.success('Issue updated successfully');
                                        } catch (err) {
                                            toast.error('Failed to update issue');
                                        } finally {
                                            setIsSaving(false);
                                        }
                                    }}
                                    disabled={isSaving || isUploading || !isIssueDirty}
                                    className="min-w-[120px]"
                                >
                                    {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    Save Changes
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

            </div>
            <FilePreviewDialog
                file={previewingFile}
                files={[
                    ...attachments.map(a => ({ url: resolveFileUrl(a.url) ?? a.url, fileName: a.filename, mimeType: a.fileType })),
                    ...pendingFiles.map((f, i) => ({ url: pendingFileUrls[i], fileName: f.name, mimeType: f.type })),
                    ...videoLinks.map(v => ({ url: v.url, fileName: v.title || v.url })),
                ]}
                onClose={() => setPreviewingFile(null)}
            />
        </div >
    );
});
