import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { cn } from '@/lib/utils';
import { Layers, Lock, User, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useProjectMembers } from '@/hooks/useProjectTeam';
import { useProjectMilestones } from '@/hooks/useMilestones';
import { resolveFileUrl } from '@/utils/fileUrl';
import type { TeamMember } from '@/types';
import type { BuildDef } from './inventoryData';

const BUILD_TYPES = ['EVT', 'DVT', 'PVT', 'Custom'] as const;

/** Sentinel <SelectItem> value for "no linked milestone" — shadcn Select disallows an empty-string value. */
const NO_MILESTONE = '__none__';

const buildSchema = z.object({
  name: z.string().min(1, 'Name is required').max(60, 'Name must be less than 60 characters'),
  type: z.string().min(1, 'Select a build type'),
  units: z.coerce.number().int().min(1, 'Units must be at least 1'),
  bomRev: z.string().min(1, 'BOM revision is required'),
  scrapPct: z.coerce.number().min(0).max(100),
  milestone: z.string().max(60, 'Milestone must be less than 60 characters').optional(),
  targetDate: z.string().optional(),
  projectId: z.string().min(1, 'Select a project'),
  assigneeId: z.string().min(1, 'Select an assignee'),
});

type BuildFormData = z.infer<typeof buildSchema>;

export type NewBuildInput = Omit<BuildDef, 'id' | 'assignee' | 'milestone'> & { projectId: string; assigneeId: string; milestone?: string };

interface NewBuildDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBuild: (input: NewBuildInput) => void;
  projects: { id: string; name: string }[];
  /** When set, the project field is locked to this id instead of being selectable — used when the dialog is opened from within a single project's context (e.g. its BOM page). */
  lockedProjectId?: string;
}

export function NewBuildDialog({ isOpen, onClose, onAddBuild, projects, lockedProjectId }: NewBuildDialogProps) {
  const isMobile = useIsMobile();
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [assignee, setAssignee] = useState<TeamMember | null>(null);
  const [isAssigneePopoverOpen, setIsAssigneePopoverOpen] = useState(false);
  const lockedProjectName = projects.find(p => p.id === lockedProjectId)?.name ?? lockedProjectId ?? '';

  const form = useForm<BuildFormData>({
    resolver: zodResolver(buildSchema),
    defaultValues: {
      name: '',
      type: '',
      units: 1,
      bomRev: '',
      scrapPct: 0,
      milestone: '',
      targetDate: '',
      projectId: lockedProjectId ?? projects[0]?.id ?? '',
      assigneeId: '',
    },
  });

  // Assignee choices are scoped to whichever project is currently selected in the form —
  // a build's assignee must be a member of that build's own project.
  const selectedProjectId = form.watch('projectId') || lockedProjectId;
  const { data: projectMembers = [] } = useProjectMembers(selectedProjectId);
  const { data: milestones = [] } = useProjectMilestones(selectedProjectId ?? '');

  const pickAssignee = (member: TeamMember | null) => {
    setAssignee(member);
    form.setValue('assigneeId', member?.id ?? '', { shouldValidate: form.formState.isSubmitted });
  };

  // Clear a previously picked assignee if the project changes and they're no longer a
  // member of the newly selected project.
  useEffect(() => {
    if (assignee && !projectMembers.some(m => m.id === assignee.id)) {
      pickAssignee(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, projectMembers]);

  // Same for a picked milestone — it belongs to a single project.
  useEffect(() => {
    const current = form.getValues('milestone');
    if (current && !milestones.some(m => m.name === current)) {
      form.setValue('milestone', '', { shouldValidate: form.formState.isSubmitted });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, milestones]);

  const isFormDirty = form.formState.isDirty || assignee !== null;

  const resetAndClose = () => {
    form.reset();
    setAssignee(null);
    onClose();
  };

  const attemptClose = () => {
    if (isFormDirty) {
      setShowDiscardConfirm(true);
    } else {
      resetAndClose();
    }
  };

  const handleSubmit = (data: BuildFormData) => {
    onAddBuild({
      name: data.name.trim(),
      type: data.type,
      units: data.units,
      bomRev: data.bomRev.trim(),
      scrapPct: data.scrapPct,
      milestone: data.milestone?.trim() || undefined,
      targetDate: data.targetDate ? new Date(data.targetDate).toISOString() : undefined,
      projectId: data.projectId,
      assigneeId: data.assigneeId,
    });
    resetAndClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && attemptClose()}>
      <DialogContent
        hideClose
        className={cn(
          'p-0 flex flex-col gap-0 overflow-hidden',
          isMobile
            ? 'inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-[100dvh] max-w-none max-h-none rounded-none border-0 data-[state=open]:!slide-in-from-left-0 data-[state=open]:!slide-in-from-top-0 data-[state=closed]:!slide-out-to-left-0 data-[state=closed]:!slide-out-to-top-0'
            : 'max-w-3xl max-h-[90vh]'
        )}
      >
        <DialogHeader className="px-4 sm:px-6 py-4 pr-10 border-b shrink-0 flex-row items-start gap-3 space-y-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="h-4 w-4" />
          </div>
          <div className="text-left flex-1 min-w-0">
            <DialogTitle>New build</DialogTitle>
            <DialogDescription>Nets this phase's demand against current stock and orders</DialogDescription>
          </div>
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5 items-start">
                {lockedProjectId ? (
                  <FormItem className="sm:col-span-2">
                    <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</FormLabel>
                    <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted text-sm text-foreground">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{lockedProjectName}</span>
                    </div>
                  </FormItem>
                ) : (
                  <FormField
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select project..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {projects.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Build name <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. MP1 Build" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:col-span-2">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {BUILD_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="units"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Units <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:col-span-2">
                  <FormField
                    control={form.control}
                    name="bomRev"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">BOM revision <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="Rev C" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="scrapPct"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Scrap %</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} max={100} step="0.5" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="targetDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Target build date <span className="normal-case font-normal">optional</span></FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="milestone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Linked milestone <span className="normal-case font-normal">optional</span></FormLabel>
                      <Select
                        value={field.value || NO_MILESTONE}
                        onValueChange={(v) => field.onChange(v === NO_MILESTONE ? '' : v)}
                        disabled={milestones.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={milestones.length === 0 ? 'No milestones' : 'Select milestone...'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NO_MILESTONE}>None</SelectItem>
                          {milestones.map((m) => (
                            <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="assigneeId"
                  render={() => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assigned to <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                      <Popover open={isAssigneePopoverOpen} onOpenChange={setIsAssigneePopoverOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-start text-left font-normal"
                            >
                              {assignee ? (
                                <span className="flex items-center gap-2">
                                  <Avatar className="h-5 w-5">
                                    <AvatarImage src={resolveFileUrl(assignee.avatar) ?? assignee.avatar} alt={assignee.name} />
                                    <AvatarFallback className="text-[10px]">{assignee.initials}</AvatarFallback>
                                  </Avatar>
                                  {assignee.name}
                                </span>
                              ) : (
                                <span className="flex items-center gap-2 text-muted-foreground">
                                  <User className="h-4 w-4" />
                                  Select a member...
                                </span>
                              )}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-[260px]" align="start">
                          <Command>
                            <CommandInput placeholder="Search members..." />
                            <CommandList>
                              <CommandEmpty>No members found.</CommandEmpty>
                              <CommandGroup>
                                {projectMembers
                                  .slice()
                                  .sort((a, b) => a.name.localeCompare(b.name))
                                  .map(member => (
                                    <CommandItem
                                      key={member.id}
                                      value={`${member.id} ${member.name}`}
                                      onSelect={() => {
                                        pickAssignee(member);
                                        setIsAssigneePopoverOpen(false);
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
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="flex-row justify-end gap-2 space-x-0 sm:space-x-0 px-4 sm:px-6 py-4 border-t shrink-0">
              <Button type="button" variant="outline" className="flex-1" onClick={attemptClose}>Cancel</Button>
              <Button type="submit" className="flex-1">Create build</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      <ConfirmationDialog
        open={showDiscardConfirm}
        onOpenChange={setShowDiscardConfirm}
        onConfirm={resetAndClose}
        title="Discard changes?"
        description="You have unsaved changes. Are you sure you want to discard them?"
        confirmText="Discard"
        cancelText="Keep Editing"
        variant="destructive"
      />
    </Dialog>
  );
}
