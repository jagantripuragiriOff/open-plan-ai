import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
import { Boxes, Camera, Check, ChevronsUpDown, Clock, ImagePlus, Pencil, Plus, ShoppingCart, Upload, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUpdatePart, usePartCatalogSearch } from '@/hooks/useParts';
import { useLocations } from '@/hooks/useLocations';
import { type ApiPartResponse, type BOMCategory, getCategoryMeta } from './bomData';
import { LocationHierarchyPicker, LockedLocationField, CategoryCombobox, type StockLocation, type StockRecord } from './inventoryData';
import { InventoryPartSheet } from './InventoryPartSheet';
import type { PlaceOrderInput } from './PlaceOrderDialog';

interface PickerPart {
  partId: string;
  pn: string;
  name: string;
  mpn?: string | null;
  location: string;
  onHand: number;
  leadTimeDays: number;
  /** Total quantity this part's project BOMs require — used to prefill the Quantity field. */
  demandQty: number;
  cat?: BOMCategory;
  projects: string[];
}

const adjustSchema = z.object({
  partId: z.string().min(1, 'Select a part'),
  location: z.string().min(1, 'Select a location'),
  category: z.string().min(1, 'Select a category'),
  stockStatus: z.enum(['in_stock', 'place_order']),
  orderStatus: z.enum(['planned', 'open']),
  direction: z.enum(['add', 'remove']),
  // 'set' — the row-level "Adjust quantity" flow: quantity is the absolute new on-hand
  // count. 'delta' (default) — "New transaction": quantity is added per direction.
  mode: z.enum(['delta', 'set']).default('delta'),
  quantity: z.coerce.number().int().min(0, 'Quantity must be 0 or more'),
  reasonCode: z.string().optional(),
  expectedDate: z.string().optional(),
  // Optional — left blank when the part's BOM revision defines no lead time. Only a typed
  // value is validated (must be a whole number ≥ 1); an empty field is allowed.
  leadTimeDays: z.union([
    z.literal(''),
    z.coerce.number().int().min(1, 'Lead time must be at least 1 day'),
  ]).optional(),
  note: z.string().max(500, 'Note must be less than 500 characters').optional(),
  supplierRef: z.string().max(300, 'Supplier / PO ref must be less than 300 characters').optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  orderNote: z.string().max(500, 'Notes must be less than 500 characters').optional(),
  purpose: z.string().max(500, 'Purpose must be less than 500 characters').optional(),
}).superRefine((data, ctx) => {
  // A 'delta' adjustment of 0 is a no-op; a 'set' to 0 (counted, found none) is valid.
  if (data.mode !== 'set' && data.quantity < 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quantity'], message: 'Quantity must be at least 1' });
  }
});

type AdjustFormData = z.infer<typeof adjustSchema>;

export interface AdjustQuantityInput {
  partId: string;
  pn?: string;
  name?: string;
  cat?: BOMCategory;
  location: StockLocation;
  locationNodeId?: string | null;
  direction: 'add' | 'remove';
  /** 'set' overwrites on-hand with `quantity`; 'delta' adds `quantity` per `direction`. */
  mode: 'delta' | 'set';
  quantity: number;
  reasonCode?: string;
  note?: string;
  description?: string;
  lotNumber?: string;
  serialNumber?: string;
  images?: File[];
  leadTimeDays?: number;
}

interface AdjustQuantityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  stock: StockRecord[];
  parts: ApiPartResponse[];
  onAdjust: (input: AdjustQuantityInput) => void;
  /** Handles the "place order" branch when the user reports the stock isn't on hand. */
  onPlaceOrder: (input: PlaceOrderInput) => void;
  /** Preselect a part (e.g. opened from that part's detail sheet) instead of starting on the picker. */
  initialPartId?: string;
  /** Project name(s) each part is used in, keyed by partId — helps disambiguate similarly-named parts in the picker. */
  partProjects?: Map<string, string[]>;
  /** Total BOM quantity-required per part, keyed by partId — prefills the Quantity field on part select. */
  partDemand?: Map<string, number>;
  /** partId → the part's canonical stock location. When the selected part already has one
   * (a prior order, or stock elsewhere), the location is locked to it — the first "New
   * transaction" is what establishes it; after that, Transfer is the only way to move it. */
  canonicalLocationByPartId?: Map<string, string>;
}

/** Max images that can be attached to a "New transaction" / order. */
const MAX_IMAGES = 10;

export function AdjustQuantityDialog({ isOpen, onClose, orgId, stock, parts, onAdjust, onPlaceOrder, initialPartId, partProjects, partDemand, canonicalLocationByPartId }: AdjustQuantityDialogProps) {
  const isMobile = useIsMobile();
  const [selectedRecord, setSelectedRecord] = useState<PickerPart | null>(null);
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showAddPart, setShowAddPart] = useState(false);
  // Only surface the "select a part" hint after the user has actually tried to submit —
  // showing it permanently on an untouched form is just noise.
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [createdPart, setCreatedPart] = useState<{ id: string; partNumber: string; name: string; category: BOMCategory } | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  // Mirror of imagePreviewUrls for the unmount cleanup — an effect with [] deps
  // can't read current state otherwise.
  const imagePreviewUrlsRef = useRef<string[]>([]);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Guards against a double-click / double Enter posting the transaction twice: the async
  // form validation lets a second submit slip in before the dialog's close re-renders.
  // Reset in resetAndClose() so a reopened dialog can submit again.
  const isSubmittingRef = useRef(false);

  const updatePart = useUpdatePart();
  const { data: locations = [] } = useLocations(orgId);

  const stockPartIds = useMemo(() => new Set(stock.map(r => r.partId)), [stock]);

  // The org's part catalog is capped at MAX_PAGE_SIZE (100, alphabetical) in `parts` — once an
  // org has more parts than that, a part sorting past the cap is invisible to the picker below
  // unless it's found through a live server search instead. Empty query falls back to `parts`.
  const { query: partSearch, setQuery: setPartSearch, results: searchedParts } = usePartCatalogSearch(orgId, parts);

  // Include every part, not just parts that already have a stock row — a part only referenced
  // from a BOM (never received) still needs to be selectable when starting a new transaction.
  // (The picker list below hides already-stocked parts; this full list still backs the
  // "Adjust quantity" entry opened from a part's row via initialPartId.)
  const pickerParts = useMemo<PickerPart[]>(() => {
    // A part stocked in several locations has one stock row per location. The picker
    // chooses a *part*, not a stock row, so collapse them to one entry — otherwise the
    // list carries duplicate partIds, which breaks the `key={r.partId}` list reconciliation
    // (stale rows survive the search filter) and shows the same part multiple times.
    // Keep the location holding the most on-hand as the representative row.
    const byPart = new Map<string, PickerPart>();
    for (const r of stock) {
      const existing = byPart.get(r.partId);
      if (!existing || r.onHand > existing.onHand) {
        byPart.set(r.partId, { partId: r.partId, pn: r.pn, name: r.name, mpn: r.mpn, location: r.location, onHand: r.onHand, leadTimeDays: r.leadTimeDays, demandQty: partDemand?.get(r.partId) ?? 0, cat: r.cat, projects: partProjects?.get(r.partId) ?? [] });
      }
    }
    const fromStock: PickerPart[] = Array.from(byPart.values());
    const fromPartsOnly: PickerPart[] = searchedParts
      .filter(p => !stockPartIds.has(p.id))
      .map(p => ({ partId: p.id, pn: p.partNumber, name: p.name, mpn: p.mpn, location: '', onHand: 0, leadTimeDays: p.latestRevision?.leadTimeDays ?? 0, demandQty: partDemand?.get(p.id) ?? 0, cat: p.category, projects: partProjects?.get(p.id) ?? [] }));
    return [...fromStock, ...fromPartsOnly];
  }, [stock, searchedParts, partProjects, partDemand, stockPartIds]);

  // The picker only offers parts not yet in inventory — a part that already has a stock row
  // is adjusted from its own row ("Adjust quantity"), not re-added through "New transaction".
  // Already scoped to the live search above, so no further text filtering is needed here.
  const filteredPickerParts = useMemo(
    () => pickerParts.filter(r => !stockPartIds.has(r.partId)),
    [pickerParts, stockPartIds]
  );

  // When a search turns up nothing, tell the user *why* if it's because the match is an
  // already-stocked part we deliberately hide, rather than a generic "No parts found".
  const searchMatchesStockedPart = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    if (!q) return false;
    return pickerParts.some(r =>
      stockPartIds.has(r.partId) &&
      (r.pn.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.mpn ?? '').toLowerCase().includes(q))
    );
  }, [pickerParts, stockPartIds, partSearch]);

  // Custom categories already in use (created via "Add new part") — mirrors InventoryView's
  // allCategories so they're selectable here too, not just filterable on the inventory page.
  const extraCategories = useMemo(
    () => Array.from(new Set(parts.map(p => p.category))),
    [parts]
  );

  const form = useForm<AdjustFormData>({
    resolver: zodResolver(adjustSchema),
    defaultValues: {
      partId: '',
      location: '',
      category: '',
      stockStatus: 'in_stock',
      orderStatus: 'open',
      direction: 'add',
      mode: initialPartId ? 'set' : 'delta',
      quantity: 1,
      reasonCode: '',
      expectedDate: '',
      leadTimeDays: '',
      note: '',
      supplierRef: '',
      description: '',
      orderNote: '',
      purpose: '',
    },
  });

  const stockStatus = form.watch('stockStatus');
  const orderStatus = form.watch('orderStatus');

  // In the "New transaction" flow, once a part has a canonical location (a prior order, or
  // stock somewhere) the location is pinned there — the first-ever transaction for a
  // brand-new part is what sets it. The row-level "Adjust quantity" (initialPartId) acts on
  // an existing stock row, so it keeps that row's own location and isn't pinned here.
  const lockedPartId = selectedRecord?.partId ?? createdPart?.id;
  const lockedLocation = !initialPartId && lockedPartId
    ? canonicalLocationByPartId?.get(lockedPartId)
    : undefined;

  useEffect(() => {
    if (lockedLocation) form.setValue('location', lockedLocation, { shouldValidate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedLocation]);

  useEffect(() => {
    if (!isOpen) return;

    if (initialPartId) {
      const match = pickerParts.find(r => r.partId === initialPartId);
      if (match) {
        setSelectedRecord(match);
        form.setValue('partId', match.partId, { shouldValidate: true });
        form.setValue('location', match.location, { shouldValidate: true });
        form.setValue('category', match.cat ?? '', { shouldValidate: true });
        form.setValue('mode', 'set', { shouldValidate: true });
        // Prefill with the current on-hand count so an unchanged submit is a no-op —
        // the user edits it to whatever the true count is.
        form.setValue('quantity', match.onHand, { shouldValidate: true });
      }
      return;
    }

    const currentPartId = form.getValues('partId');
    if (!currentPartId) return;
    const match = pickerParts.find(r => r.partId === currentPartId);
    if (!match) return;

    setSelectedRecord(match);
    form.setValue('location', match.location, { shouldValidate: true });
    form.setValue('category', match.cat ?? '', { shouldValidate: true });
    // Prefill from the part's BOM lead time; leave blank when the BOM defines none.
    form.setValue('leadTimeDays', match.leadTimeDays > 0 ? match.leadTimeDays : '', { shouldValidate: true });
    form.setValue('quantity', match.demandQty > 0 ? match.demandQty : 1, { shouldValidate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialPartId, pickerParts]);

  // The "Add new part" wizard (InventoryPartSheet) tracks its own unsaved-changes
  // confirmation, so it doesn't feed this dialog's dirty check.
  const isFormDirty = form.formState.isDirty || images.length > 0;

  const applyImageFiles = (files: File[]) => {
    const valid = files.filter((f) => f.type.startsWith('image/'));
    if (valid.length < files.length) {
      toast.error(valid.length === 0 ? 'Please select an image file' : 'Some files were skipped — only images can be attached');
    }
    if (valid.length === 0) return;
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${MAX_IMAGES} images`);
      return;
    }
    const accepted = valid.slice(0, remaining);
    if (accepted.length < valid.length) {
      toast.error(`Only ${MAX_IMAGES} images can be attached — some were skipped`);
    }
    setImages((prev) => [...prev, ...accepted]);
    setImagePreviewUrls((prev) => {
      const next = [...prev, ...accepted.map((f) => URL.createObjectURL(f))];
      imagePreviewUrlsRef.current = next;
      return next;
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    applyImageFiles(files);
  };

  const handleImageDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingImage(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    applyImageFiles(files);
  };

  const handleCloseCamera = () => {
    setCameraStream((prev) => {
      prev?.getTracks().forEach((track) => track.stop());
      return null;
    });
  };

  const handleOpenCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error(
        window.isSecureContext
          ? 'This browser does not support camera capture — use "Browse files" instead.'
          : 'Camera capture needs a secure (HTTPS) connection — use "Browse files" instead.',
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setCameraStream(stream);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      const message =
        name === 'NotAllowedError'
          ? 'Camera permission was blocked. Allow camera access for this site in your browser settings, then try again.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'No camera was found on this device — use "Browse files" instead.'
            : name === 'NotReadableError'
              ? 'The camera is already in use by another app or tab. Close it and try again.'
              : 'Camera access was denied or unavailable';
      toast.error(message);
    }
  };

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      applyImageFiles([new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })]);
      handleCloseCamera();
    }, 'image/jpeg', 0.92);
  };

  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // The camera light must turn off the moment the dialog closes, not just when the user
  // explicitly cancels the preview — otherwise the stream keeps running in the background.
  useEffect(() => {
    if (!isOpen) handleCloseCamera();
  }, [isOpen]);

  useEffect(() => {
    return () => {
      handleCloseCamera();
    };
  }, []);

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviewUrls((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed);
      const next = prev.filter((_, i) => i !== index);
      imagePreviewUrlsRef.current = next;
      return next;
    });
  };

  const clearImages = () => {
    setImages([]);
    setImagePreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      imagePreviewUrlsRef.current = [];
      return [];
    });
  };

  useEffect(() => {
    return () => {
      imagePreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const resetAndClose = () => {
    form.reset();
    setSelectedRecord(null);
    setShowAddPart(false);
    setTriedSubmit(false);
    setCreatedPart(null);
    clearImages();
    handleCloseCamera();
    isSubmittingRef.current = false;
    onClose();
  };

  const attemptClose = () => {
    if (isFormDirty) {
      setShowDiscardConfirm(true);
    } else {
      resetAndClose();
    }
  };

  // The "Add new part" wizard reports the created catalog part back here; select it
  // into the form just like picking an existing part.
  const handlePartCreated = (created: ApiPartResponse) => {
    setSelectedRecord(null);
    setCreatedPart({ id: created.id, partNumber: created.partNumber, name: created.name, category: created.category });
    form.setValue('partId', created.id, { shouldDirty: true, shouldValidate: true });
    form.setValue('category', created.category, { shouldDirty: true, shouldValidate: true });
    setShowAddPart(false);
  };

  const handleSubmit = async (data: AdjustFormData) => {
    // A rapid second click resolves its own validation pass before resetAndClose() unmounts
    // the form — without this guard both passes reach onAdjust and the delta is posted twice.
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const part = selectedRecord
      ? { partId: selectedRecord.partId, pn: selectedRecord.pn, name: selectedRecord.name, cat: selectedRecord.cat }
      : createdPart
        ? { partId: createdPart.id, pn: createdPart.partNumber, name: createdPart.name, cat: createdPart.category }
        : null;

    if (!part) {
      toast.error('Select a part to adjust');
      isSubmittingRef.current = false;
      return;
    }

    // Category defaults from the selected part but is editable here — if the user changed it,
    // that's a recategorization of the part itself (there's no per-transaction category column).
    if (selectedRecord && data.category && data.category !== part.cat) {
      try {
        await updatePart.mutateAsync({ partId: part.partId, dto: { category: data.category as BOMCategory } });
      } catch {
        toast.error("Transaction saved, but couldn't update the part's category");
      }
    }
    const cat = (data.category || part.cat) as BOMCategory | undefined;
    const location = lockedLocation ?? data.location;
    const locationNodeId = locations.find((l) => l.path === location)?.id ?? null;
    // Blank lead time (BOM defined none, user left it empty) is passed through as undefined.
    const leadTimeDays = typeof data.leadTimeDays === 'number' ? data.leadTimeDays : undefined;

    if (data.stockStatus === 'place_order') {
      onPlaceOrder({
        partId: part.partId,
        pn: part.pn,
        name: part.name,
        cat: cat as BOMCategory,
        quantity: data.quantity,
        expectedDate: data.expectedDate?.trim() || undefined,
        leadTime: leadTimeDays,
        location,
        locationNodeId,
        supplierRef: data.supplierRef?.trim() || undefined,
        note: data.orderNote?.trim() || undefined,
        description: data.description?.trim() || undefined,
        purpose: data.purpose?.trim() || undefined,
        status: data.orderStatus,
      });
    } else {
      onAdjust({
        partId: part.partId,
        ...(selectedRecord ? {} : { pn: part.pn, name: part.name, cat }),
        location: location as StockLocation,
        locationNodeId,
        direction: data.direction,
        // Row-level "Adjust quantity" sets the absolute on-hand count; "New transaction" adds a delta.
        mode: initialPartId ? 'set' : 'delta',
        quantity: data.quantity,
        reasonCode: data.reasonCode?.trim() || undefined,
        note: data.note?.trim() || undefined,
        description: data.description?.trim() || undefined,
        // Lead time and images are only collected in the "New transaction" flow —
        // the row-level "Adjust quantity" dialog omits both fields.
        images: initialPartId || images.length === 0 ? undefined : images,
        leadTimeDays: initialPartId ? undefined : leadTimeDays,
      });
    }
    resetAndClose();
  };

  // Required fields (Reason code / Expected date) can sit below the fold in a scrolled dialog —
  // without this, a blocked submit looks like the button did nothing.
  const handleInvalid = (errors: FieldErrors<AdjustFormData>) => {
    setTriedSubmit(true);
    // Surface every failing field, not just Object.values(errors)[0] — with more than one
    // error the arbitrary "first" one (schema order) often names a field the user isn't
    // looking at, contradicting the inline messages (e.g. toast says Note, the red text
    // under the cursor says Description).
    const messages = Array.from(new Set(
      Object.values(errors)
        .map(e => (e && typeof e.message === 'string' ? e.message : null))
        .filter((m): m is string => !!m)
    ));
    if (messages.length === 0) {
      toast.error('Fill in all required fields before submitting');
    } else if (messages.length === 1) {
      toast.error(messages[0]);
    } else {
      toast.error('Fix the highlighted fields', { description: messages.join('\n') });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && attemptClose()}>
      <DialogContent
        hideClose
        className={cn(
          'p-0 flex flex-col gap-0 overflow-hidden',
          isMobile
            ? 'inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-[100dvh] max-w-none max-h-none rounded-none border-0 data-[state=open]:!slide-in-from-left-0 data-[state=open]:!slide-in-from-top-0 data-[state=closed]:!slide-out-to-left-0 data-[state=closed]:!slide-out-to-top-0'
            : initialPartId
              ? 'max-w-lg max-h-[90vh]'
              : 'max-w-3xl max-h-[90vh]'
        )}
      >
        <DialogHeader className="px-4 sm:px-6 py-4 pr-10 border-b shrink-0 flex-row items-start gap-3 space-y-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {stockStatus === 'place_order'
              ? (orderStatus === 'planned' ? <Clock className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />)
              : <Pencil className="h-4 w-4" />}
          </div>
          <div className="text-left flex-1 min-w-0">
            <DialogTitle>
              {initialPartId
                ? 'Adjust quantity'
                : stockStatus === 'place_order'
                  ? (orderStatus === 'planned' ? 'Plan a future order' : 'Place a purchase order')
                  : 'Add stock on hand'}
            </DialogTitle>
            <DialogDescription>
              {stockStatus === 'place_order'
                ? (orderStatus === 'planned' ? 'Note parts you plan to order later' : 'Order parts from a supplier and track them')
                : initialPartId
                  ? 'Set the correct on-hand count for this part'
                  : 'Record parts you already have in inventory'}
            </DialogDescription>
          </div>
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit, handleInvalid)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <div
                className={cn(
                  'p-4 sm:p-6',
                  initialPartId
                    ? 'space-y-5'
                    : 'grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5 items-start'
                )}
              >
                {!initialPartId && (
                <FormField
                  control={form.control}
                  name="partId"
                  render={() => (
                    <FormItem>
                      <div className="flex h-5 items-center justify-between gap-2">
                        <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Part <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                        <button
                          type="button"
                          className="flex shrink-0 items-center gap-1 text-xs font-medium leading-none text-primary hover:text-primary/80"
                          onClick={() => setShowAddPart(true)}
                        >
                          <Plus className="h-3 w-3" />
                          Add new part
                        </button>
                      </div>

                      <Popover
                          open={partPickerOpen}
                          onOpenChange={(open) => {
                            setPartPickerOpen(open);
                            if (!open) setPartSearch('');
                          }}
                        >
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                type="button"
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  'w-full justify-between font-normal',
                                  !selectedRecord && !createdPart && 'text-muted-foreground'
                                )}
                              >
                                <span className="min-w-0 truncate">
                                  {selectedRecord
                                    ? `${selectedRecord.pn} — ${selectedRecord.name}`
                                    : createdPart
                                      ? `${createdPart.partNumber} — ${createdPart.name}`
                                      : 'Select a part...'}
                                </span>
                                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[420px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput
                                placeholder="Search parts..."
                                value={partSearch}
                                onValueChange={setPartSearch}
                              />
                              <CommandList>
                                {filteredPickerParts.length === 0 && (
                                  <div className="py-6 px-4 text-center text-sm text-muted-foreground">
                                    {searchMatchesStockedPart
                                      ? 'That part is already in inventory — adjust its quantity from its row on the Stock tab.'
                                      : 'No parts found.'}
                                  </div>
                                )}
                                <CommandGroup>
                                  {filteredPickerParts.map((r) => (
                                    <CommandItem
                                      key={r.partId}
                                      value={`${r.pn} ${r.name}`}
                                      onSelect={() => {
                                        setSelectedRecord(r);
                                        setCreatedPart(null);
                                        form.setValue('partId', r.partId, { shouldDirty: true, shouldValidate: true });
                                        form.setValue('location', r.location, { shouldDirty: true, shouldValidate: true });
                                        form.setValue('category', r.cat ?? '', { shouldDirty: true, shouldValidate: true });
                                        form.setValue('leadTimeDays', r.leadTimeDays > 0 ? r.leadTimeDays : '', { shouldDirty: true, shouldValidate: true });
                                        form.setValue('quantity', r.demandQty > 0 ? r.demandQty : 1, { shouldDirty: true, shouldValidate: true });
                                        setPartPickerOpen(false);
                                        setPartSearch('');
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          'mr-2 h-4 w-4',
                                          selectedRecord?.partId === r.partId ? 'opacity-100' : 'opacity-0'
                                        )}
                                      />
                                      <div className="flex flex-col min-w-0 gap-0.5">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span className="text-sm truncate">{r.pn} — {r.name}</span>
                                          {r.projects.length > 0 && (
                                            <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary truncate max-w-[120px]">
                                              {r.projects.join(', ')}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 min-w-0">
                                          {r.cat && (
                                            <span className="flex items-center gap-1 shrink-0">
                                              <span
                                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                                style={{ background: getCategoryMeta(r.cat).tint }}
                                              />
                                              <span className="text-xs text-muted-foreground">{getCategoryMeta(r.cat).label}</span>
                                            </span>
                                          )}
                                          <span className="text-xs text-muted-foreground truncate">
                                            {r.cat && '· '}{r.location ? `${r.location} · On hand ${r.onHand}` : 'Not yet stocked'}
                                          </span>
                                        </div>
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
                )}

                {!initialPartId && (
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex h-5 items-center">
                          <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                        </div>
                        <FormControl>
                          <CategoryCombobox value={field.value} onChange={field.onChange} placeholder="Select a category..." extraCategories={extraCategories} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {!initialPartId && (
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Description
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Optional description..."
                          className="min-h-[70px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                )}

                {!initialPartId && (
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Location <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                      {lockedLocation ? (
                        <LockedLocationField location={lockedLocation} />
                      ) : (
                        <FormControl>
                          <LocationHierarchyPicker value={field.value} onChange={field.onChange} orgId={orgId} />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                )}

                {!initialPartId && (
                <FormField
                  control={form.control}
                  name="stockStatus"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2 space-y-1.5">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Do you have this part?</FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {stockStatus === 'place_order'
                              ? "You don't have it yet — this creates a purchase order to track."
                              : 'You already have this part — it gets added to inventory now.'}
                          </p>
                        </div>
                        <FormControl>
                          <ToggleGroup
                            type="single"
                            value={field.value}
                            onValueChange={(v) => v && field.onChange(v)}
                            className="grid w-full shrink-0 grid-cols-2 gap-1 sm:w-[20rem]"
                          >
                            <ToggleGroupItem
                              value="in_stock"
                              variant="outline"
                              className="h-8 w-full gap-1.5 px-2 text-xs border-input data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                            >
                              <Boxes className="h-3.5 w-3.5" /> Have it on hand
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="place_order"
                              variant="outline"
                              className="h-8 w-full gap-1.5 px-2 text-xs border-input data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                            >
                              <ShoppingCart className="h-3.5 w-3.5" /> Need to order it
                            </ToggleGroupItem>
                          </ToggleGroup>
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                )}

                {!initialPartId && stockStatus === 'place_order' && (
                <FormField
                  control={form.control}
                  name="orderStatus"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2 space-y-1.5">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Has it been ordered yet?</FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {orderStatus === 'planned'
                              ? "Not sent to a supplier yet — won't count as incoming stock."
                              : 'Sent to a supplier — counts as incoming stock.'}
                          </p>
                        </div>
                        <FormControl>
                          <ToggleGroup
                            type="single"
                            value={field.value}
                            onValueChange={(v) => v && field.onChange(v)}
                            className="grid w-full shrink-0 grid-cols-2 gap-1 sm:w-[20rem]"
                          >
                            <ToggleGroupItem
                              value="open"
                              variant="outline"
                              className="h-8 w-full gap-1.5 px-2 text-xs border-input data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                            >
                              <ShoppingCart className="h-3.5 w-3.5" /> Order placed
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="planned"
                              variant="outline"
                              className="h-8 w-full gap-1.5 px-2 text-xs border-input data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                            >
                              <Clock className="h-3.5 w-3.5" /> Not ordered yet
                            </ToggleGroupItem>
                          </ToggleGroup>
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                )}

                {stockStatus === 'in_stock' ? (
                  <>
                    <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={form.control}
                        name="quantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              {initialPartId ? 'New on-hand count' : 'Quantity on hand'} <span className="text-destructive" aria-hidden="true">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input type="number" min={initialPartId ? 0 : 1} {...field} />
                            </FormControl>
                            {initialPartId && (
                              <p className="text-xs text-muted-foreground">
                                The corrected on-hand quantity for this location — this replaces the current count, it isn&apos;t added to it.
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {!initialPartId && (
                    <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={form.control}
                        name="leadTimeDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lead time (days)</FormLabel>
                            <FormControl>
                              <Input type="number" min={1} step={1} placeholder="e.g. 7" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    )}
                  </>
                ) : (
                  <>
                    <FormField
                      control={form.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quantity to order <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                          <FormControl>
                            <Input type="number" min={1} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="expectedDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Expected delivery date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="leadTimeDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lead time (days)</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} step={1} placeholder="e.g. 7" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {stockStatus === 'place_order' ? (
                  <FormField
                    control={form.control}
                    name="supplierRef"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Supplier or PO number
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. PO-1234, or Acme Corp" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="note"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Note
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Optional note..."
                            className="min-h-[70px] resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {stockStatus === 'place_order' && (
                  <FormField
                    control={form.control}
                    name="purpose"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Reason for ordering
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="What is this order for?"
                            className="min-h-[70px] resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {stockStatus === 'place_order' && (
                  <FormField
                    control={form.control}
                    name="orderNote"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Additional notes
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Anything else worth recording..."
                            className="min-h-[70px] resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {!initialPartId && (
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Images
                  </Label>
                  {cameraStream ? (
                    <div className="space-y-2">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full max-w-xs rounded-md border bg-black aspect-video object-cover"
                      />
                      <div className="flex items-center gap-2">
                        <Button type="button" size="sm" onClick={handleCapturePhoto}>
                          <Camera className="h-3.5 w-3.5 mr-1.5" />
                          Capture
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={handleCloseCamera}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {imagePreviewUrls.length > 0 ? (
                        <>
                        <div
                          onDragOver={(e) => { e.preventDefault(); setIsDraggingImage(true); }}
                          onDragLeave={() => setIsDraggingImage(false)}
                          onDrop={handleImageDrop}
                          className="flex flex-wrap gap-3"
                        >
                          {imagePreviewUrls.map((url, i) => (
                            <div key={url} className="relative w-fit">
                              <img
                                src={url}
                                alt={`Attached ${i + 1}`}
                                className="h-24 w-24 rounded-md object-cover border"
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow"
                                onClick={() => handleRemoveImage(i)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                          {imagePreviewUrls.length < MAX_IMAGES && (
                            <label
                              className={cn(
                                'flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed cursor-pointer text-muted-foreground transition-colors hover:bg-muted/40',
                                isDraggingImage ? 'border-primary bg-primary/5' : 'border-input'
                              )}
                            >
                              <Plus className="h-5 w-5" />
                              <span className="text-[11px] font-medium">Add</span>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={handleImageSelect}
                              />
                            </label>
                          )}
                          {isMobile && imagePreviewUrls.length < MAX_IMAGES && (
                            <button
                              type="button"
                              onClick={handleOpenCamera}
                              className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input cursor-pointer text-muted-foreground transition-colors hover:bg-muted/40"
                            >
                              <Camera className="h-5 w-5" />
                              <span className="text-[11px] font-medium">Take photo</span>
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {imagePreviewUrls.length} / {MAX_IMAGES} images
                        </p>
                        </>
                      ) : (
                        <div
                          onDragOver={(e) => { e.preventDefault(); setIsDraggingImage(true); }}
                          onDragLeave={() => setIsDraggingImage(false)}
                          onDrop={handleImageDrop}
                          className={cn(
                            'flex flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center transition-colors px-4 py-6',
                            isDraggingImage ? 'border-primary bg-primary/5' : 'border-input'
                          )}
                        >
                          <ImagePlus className="h-5 w-5 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Drag &amp; drop images here</p>
                          <div className="flex items-center gap-2 mt-1">
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors">
                              <Upload className="h-3.5 w-3.5" />
                              Browse files
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={handleImageSelect}
                              />
                            </label>
                            {isMobile && (
                              <button
                                type="button"
                                onClick={handleOpenCamera}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
                              >
                                <Camera className="h-3.5 w-3.5" />
                                Take photo
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 space-x-0 sm:space-x-0 px-4 sm:px-6 py-4 border-t shrink-0">
              {triedSubmit && !initialPartId && !selectedRecord && !createdPart && (
                <p className="text-xs text-destructive text-right">Select a part above before submitting.</p>
              )}
              <div className="flex flex-row justify-end gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={attemptClose}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={form.formState.isSubmitting}>
                  {stockStatus === 'place_order'
                    ? (orderStatus === 'planned' ? 'Save planned order' : 'Place order')
                    : initialPartId ? 'Save adjustment' : 'Add to inventory'}
                </Button>
              </div>
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

      <InventoryPartSheet
        open={showAddPart}
        onClose={() => setShowAddPart(false)}
        orgId={orgId}
        extraCategories={extraCategories}
        onCreated={handlePartCreated}
      />
    </Dialog>
  );
}
