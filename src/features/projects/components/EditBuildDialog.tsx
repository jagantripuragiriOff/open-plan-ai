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
import { Layers, User, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useProjectMembers } from '@/hooks/useProjectTeam';
import { resolveFileUrl } from '@/utils/fileUrl';
import type { TeamMember } from '@/types';
import type { Build } from './inventoryData';
import type { UpdateBuildDto } from '@/services/inventory.service';

const BUILD_TYPES = ['EVT', 'DVT', 'PVT', 'Custom'] as const;

const buildSchema = z.object({
  name: z.string().min(1, 'Name is required').max(60, 'Name must be less than 60 characters'),
  type: z.string().min(1, 'Select a build type'),
  units: z.coerce.number().int().min(1, 'Units must be at least 1'),
  bomRev: z.string().min(1, 'BOM revision is required'),
  scrapPct: z.coerce.number().min(0).max(100),
  milestone: z.string().max(60, 'Milestone must be less than 60 characters').optional(),
  targetDate: z.string().optional(),
  assigneeId: z.string().min(1, 'Select an assignee'),
});

type BuildFormData = z.infer<typeof buildSchema>;

interface EditBuildDialogProps {
  isOpen: boolean;
  onClose: () => void;
  build: Build;
  onSave: (dto: UpdateBuildDto) => void;
  isSaving?: boolean;
}

/** `2026-09-07T…Z` → `2026-09-07` for a native <input type="date">. */
function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function EditBuildDialog({ isOpen, onClose, build, onSave, isSaving }: EditBuildDialogProps) {
  const isMobile = useIsMobile();
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [assignee, setAssignee] = useState<TeamMember | null>(null);
  const [isAssigneePopoverOpen, setIsAssigneePopoverOpen] = useState(false);

  const { data: projectMembers = [] } = useProjectMembers(build.projectId);

  const defaults: BuildFormData = {
    name: build.name,
    type: build.type,
    units: build.units,
    bomRev: build.bomRev,
    scrapPct: build.scrapPct,
    milestone: build.linkedMilestone ?? '',
    targetDate: toDateInput(build.targetDate),
    assigneeId: build.assignee?.id ?? '',
  };

  const form = useForm<BuildFormData>({
    resolver: zodResolver(buildSchema),
    defaultValues: defaults,
  });

  // Re-seed the form whenever a different build is opened, or the dialog is reopened.
  useEffect(() => {
    if (isOpen) {
      form.reset(defaults);
      setAssignee(build.assignee ? (projectMembers.find(m => m.id === build.assignee!.id) ?? null) : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, build.id, projectMembers.length]);

  const pickAssignee = (member: TeamMember | null) => {
    setAssignee(member);
    form.setValue('assigneeId', member?.id ?? '', { shouldValidate: form.formState.isSubmitted, shouldDirty: true });
  };

  const isFormDirty = form.formState.isDirty;

  const resetAndClose = () => {
    form.reset(defaults);
    onClose();
  };

  const attemptClose = () => {
    if (isFormDirty && !isSaving) setShowDiscardConfirm(true);
    else resetAndClose();
  };

  const handleSubmit = (data: BuildFormData) => {
    // Send only what actually changed — and use `null` (not undefined) to clear
    // milestone / target date so the backend distinguishes "clear" from "unchanged".
    const dto: UpdateBuildDto = {};
    if (data.name.trim() !== build.name) dto.name = data.name.trim();
    if (data.type !== build.type) dto.type = data.type;
    if (data.units !== build.units) dto.units = data.units;
    if (data.bomRev.trim() !== build.bomRev) dto.bomRev = data.bomRev.trim();
    if (data.scrapPct !== build.scrapPct) dto.scrapPct = data.scrapPct;

    const nextMilestone = data.milestone?.trim() || '';
    if (nextMilestone !== (build.linkedMilestone ?? '')) dto.milestone = nextMilestone || null;

    const nextTarget = data.targetDate || '';
    if (nextTarget !== toDateInput(build.targetDate)) {
      dto.targetDate = nextTarget ? new Date(nextTarget).toISOString() : null;
    }

    if (data.assigneeId !== (build.assignee?.id ?? '')) dto.assigneeId = data.assigneeId;

    if (Object.keys(dto).length === 0) {
      resetAndClose();
      return;
    }
    onSave(dto);
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
            <DialogTitle>Edit build</DialogTitle>
            <DialogDescription>Target date drives the projected-ready vs. target comparison</DialogDescription>
          </div>
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5 items-start">
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
                      <FormControl>
                        <Input placeholder="e.g. MP1 Complete" {...field} />
                      </FormControl>
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
              <Button type="button" variant="outline" className="flex-1" onClick={attemptClose} disabled={isSaving}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save changes'}</Button>
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
