/**
 * InventoryPartSheet — 4-step "Add New Part" wizard for the inventory flows
 * (Add stock on hand / Receive / Place order), mirroring the BOM "Add New Part"
 * sheet (BOMPartSheet) tab-for-tab: Details · Sourcing · Traceability · Documents.
 *
 * Unlike the BOM sheet this creates an org-catalog part only — there is no
 * project, BOM node, owner, or approval flow here. Requirement links and file
 * attachments live on a part's BOM line inside a project, so the Traceability
 * and Documents tabs show an informational state rather than editable pickers
 * (a pasted product-image URL is the one thing persisted, via `imageUrl`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCreatePart } from '@/hooks/useParts';
import { apiClient } from '@/services/api/client';
import { ENDPOINTS } from '@/services/api/endpoints';
import {
  Zap, Cpu, Package, Box, Monitor, Shield, Layers, Tag, Plus, X,
  ChevronLeft, ChevronRight, Save, AlertCircle, Loader2, GitBranch, ImageIcon, Link as LinkIcon,
} from 'lucide-react';
import {
  KNOWN_BOM_CATEGORIES, BOM_CAT_META, UOM_OPTIONS,
  type BOMCategory, type ApiPartResponse,
} from './bomData';

interface Props {
  open: boolean;
  onClose: () => void;
  orgId: string;
  /** Fires once the part is created in the org catalog. */
  onCreated: (part: ApiPartResponse) => void;
  /** Custom categories already in use in this org — offered alongside the presets. */
  extraCategories?: string[];
  /** Prefill the part number (e.g. the text already typed into the picker). */
  initialPartNumber?: string;
}

const TABS = ['details', 'sourcing', 'traceability', 'documents'] as const;
type TabId = typeof TABS[number];
const tabIndex = (t: TabId) => TABS.indexOf(t);
const STEP_LABEL: Record<TabId, string> = {
  details: 'Details', sourcing: 'Sourcing', traceability: 'Traceability', documents: 'Documents',
};

const DESC_MAX_LEN = 500;

const CATEGORIES = [...KNOWN_BOM_CATEGORIES];
const CAT_ICONS: Record<string, React.ElementType> = {
  assembly: Layers, power: Zap, control: Cpu, connector: Package,
  enclosure: Box, hmi: Monitor, safety: Shield,
};
const isKnownCategory = (cat: string) => (CATEGORIES as string[]).includes(cat);

type LeadTimeUnit = 'days' | 'weeks' | 'months';
const LEAD_TIME_UNITS: { id: LeadTimeUnit; label: string; toDays: number }[] = [
  { id: 'days', label: 'Days', toDays: 1 },
  { id: 'weeks', label: 'Weeks', toDays: 7 },
  { id: 'months', label: 'Months', toDays: 30 },
];

interface SupplierRow { distributor: string; price: string; calcFromSubparts: boolean }
interface FieldRow { label: string; value: string }

const emptyState = {
  pn: '', name: '', desc: '', category: 'assembly' as BOMCategory, rev: 'A', uom: 'EA',
  manufacturer: '', mpn: '', leadTime: '', leadTimeUnit: 'days' as LeadTimeUnit,
  imageUrl: '',
};

// ── Small form primitives (mirror BOMPartSheet's FL / FInput) ──────
const FL = ({ label, required, children, className }: {
  label: string; required?: boolean; children: React.ReactNode; className?: string;
}) => (
  <div className={cn('space-y-1.5', className)}>
    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}{required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
    {children}
  </div>
);

const FInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <Input {...props} className={cn('h-9 text-sm bg-muted border-border focus-visible:ring-1', props.className)} />
);

const Err = ({ msg }: { msg?: string }) =>
  msg ? <p className="text-[11px] text-destructive flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" />{msg}</p> : null;

export function InventoryPartSheet({ open, onClose, orgId, onCreated, extraCategories = [], initialPartNumber }: Props) {
  const isMobile = useIsMobile();
  const createPart = useCreatePart(orgId);

  const [pn, setPn] = useState(emptyState.pn);
  const [name, setName] = useState(emptyState.name);
  const [desc, setDesc] = useState(emptyState.desc);
  const [category, setCategory] = useState<BOMCategory>(emptyState.category);
  const [rev, setRev] = useState(emptyState.rev);
  const [uom, setUom] = useState(emptyState.uom);
  const [manufacturer, setManufacturer] = useState(emptyState.manufacturer);
  const [mpn, setMpn] = useState(emptyState.mpn);
  const [leadTime, setLeadTime] = useState(emptyState.leadTime);
  const [leadTimeUnit, setLeadTimeUnit] = useState<LeadTimeUnit>(emptyState.leadTimeUnit);
  const [imageUrl, setImageUrl] = useState(emptyState.imageUrl);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([{ distributor: '', price: '', calcFromSubparts: false }]);
  const [customFields, setCustomFields] = useState<FieldRow[]>([]);

  const [activeTab, setActiveTab] = useState<TabId>('details');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checkingPn, setCheckingPn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const savingRef = useRef(false);

  const customCategoryOptions = useMemo(
    () => Array.from(new Set(extraCategories.filter(c => c && !isKnownCategory(c)))),
    [extraCategories],
  );

  // Reset every field when the sheet (re)opens so stale input never lingers.
  useEffect(() => {
    if (!open) return;
    setPn((initialPartNumber ?? '').toUpperCase());
    setName(emptyState.name);
    setDesc(emptyState.desc);
    setCategory(emptyState.category);
    setRev(emptyState.rev);
    setUom(emptyState.uom);
    setManufacturer(emptyState.manufacturer);
    setMpn(emptyState.mpn);
    setLeadTime(emptyState.leadTime);
    setLeadTimeUnit(emptyState.leadTimeUnit);
    setImageUrl(emptyState.imageUrl);
    setSuppliers([{ distributor: '', price: '', calcFromSubparts: false }]);
    setCustomFields([]);
    setActiveTab('details');
    setErrors({});
    setCheckingPn(false);
    setSaving(false);
    savingRef.current = false;
    setConfirmClose(false);
  }, [open, initialPartNumber]);

  const isDirty =
    pn.trim() !== (initialPartNumber ?? '').trim().toUpperCase() ||
    name.trim() !== '' || desc.trim() !== '' || category !== emptyState.category ||
    rev !== 'A' || uom !== 'EA' || manufacturer.trim() !== '' || mpn.trim() !== '' ||
    leadTime.trim() !== '' || imageUrl.trim() !== '' ||
    suppliers.some(s => s.distributor.trim() !== '' || s.price.trim() !== '' || s.calcFromSubparts) ||
    customFields.length > 0;

  const requestClose = () => {
    if (saving) return;
    if (isDirty) { setConfirmClose(true); return; }
    onClose();
  };

  // Clear a field error as soon as the field becomes valid.
  useEffect(() => {
    setErrors(prev => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      const clear = (k: string, ok: boolean) => { if (ok && k in next) { delete next[k]; changed = true; } };
      clear('pn', !!pn.trim());
      clear('name', !!name.trim());
      clear('category', !!category.trim());
      clear('leadTime', !leadTime.trim() || !isNaN(parseFloat(leadTime)));
      suppliers.forEach((s, i) => {
        clear(`sup_price_${i}`, s.calcFromSubparts || !s.price.trim() || !isNaN(parseFloat(s.price)));
      });
      return changed ? next : prev;
    });
  }, [pn, name, category, leadTime, suppliers]);

  const validateTab = (tab: TabId): boolean => {
    const e: Record<string, string> = {};
    if (tab === 'details') {
      if (!pn.trim()) e.pn = 'Part number is required';
      if (!name.trim()) e.name = 'Part name is required';
      if (desc.length > DESC_MAX_LEN) e.desc = `Description must be ${DESC_MAX_LEN} characters or less`;
      if (!category.trim()) e.category = 'Category is required';
    }
    if (tab === 'sourcing') {
      if (leadTime.trim() && isNaN(parseFloat(leadTime))) e.leadTime = 'Lead time must be a number';
      suppliers.forEach((s, i) => {
        if (!s.calcFromSubparts && s.price.trim() && isNaN(parseFloat(s.price))) e[`sup_price_${i}`] = 'Unit price must be a number';
      });
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = async () => {
    if (!validateTab(activeTab)) return;
    if (activeTab === 'details') {
      setCheckingPn(true);
      try {
        const res = await apiClient.get<{ exists: boolean }>(
          ENDPOINTS.PARTS.CHECK(orgId),
          { params: { partNumber: pn.trim().toUpperCase() } },
        );
        if (res.exists) {
          setErrors(e => ({ ...e, pn: `Part number '${pn.trim().toUpperCase()}' already exists` }));
          return;
        }
      } catch {
        setErrors(e => ({ ...e, pn: 'Could not verify the part number — try again' }));
        return;
      } finally {
        setCheckingPn(false);
      }
    }
    setActiveTab(TABS[tabIndex(activeTab) + 1]);
  };

  const handleBack = () => { setErrors({}); setActiveTab(TABS[Math.max(0, tabIndex(activeTab) - 1)]); };

  const handleSave = async () => {
    if (savingRef.current) return;
    // Re-run every step's validation — the user can reach Documents without
    // visiting Sourcing.
    if (!validateTab('details')) { setActiveTab('details'); return; }
    if (!validateTab('sourcing')) { setActiveTab('sourcing'); return; }

    savingRef.current = true;
    setSaving(true);
    try {
      const leadDays = leadTime.trim()
        ? Math.round(parseFloat(leadTime) * (LEAD_TIME_UNITS.find(u => u.id === leadTimeUnit)?.toDays ?? 1))
        : 0;
      const filledSuppliers = suppliers
        .filter(s => s.distributor.trim())
        .map(s => ({ distributor: s.distributor.trim(), price: s.calcFromSubparts ? '0' : s.price.trim(), calcFromSubparts: s.calcFromSubparts }));
      const primaryPrice = filledSuppliers[0] && !filledSuppliers[0].calcFromSubparts
        ? parseFloat(filledSuppliers[0].price) || 0
        : 0;
      const fields = customFields.filter(f => f.label.trim()).map(f => ({ label: f.label.trim(), value: f.value.trim() }));

      const created = await createPart.mutateAsync({
        partNumber: pn.trim().toUpperCase(),
        name: name.trim(),
        description: desc.trim() || name.trim(),
        category: (category.trim().toLowerCase()) as BOMCategory,
        manufacturer: manufacturer.trim() || undefined,
        mpn: mpn.trim() || undefined,
        unit: uom || 'EA',
        imageUrl: imageUrl.trim() || undefined,
        initialRev: rev.trim() || undefined,
        initialPrice: primaryPrice > 0 ? primaryPrice : undefined,
        initialLeadTimeDays: leadDays > 0 ? leadDays : undefined,
        initialSuppliers: filledSuppliers.length ? filledSuppliers : undefined,
        customFields: fields.length ? fields : undefined,
      });
      toast.success(`Part ${created.partNumber} created`);
      onCreated(created);
      onClose();
    } catch (err) {
      const reason = err instanceof Error && err.message ? err.message : 'Failed to create part';
      toast.error(reason);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const step = tabIndex(activeTab);
  const isLast = activeTab === 'documents';

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) requestClose(); }}>
        <DialogContent
          className={cn(
            'p-0 gap-0 flex flex-col overflow-hidden',
            isMobile
              ? 'inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-[100dvh] max-w-none max-h-none rounded-none border-0'
              : 'max-w-[1000px] w-[92vw]',
          )}
          style={isMobile ? undefined : { maxHeight: '90vh', minHeight: '70vh' }}
        >
          <DialogHeader className="px-5 sm:px-7 py-4 sm:py-5 border-b border-border shrink-0 text-left">
            <DialogTitle className="text-base sm:text-lg font-semibold">Add New Part</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Fill in the details to add a new part to your organization&apos;s catalog.
            </DialogDescription>
          </DialogHeader>

          {/* Progress */}
          <div className="shrink-0 px-5 sm:px-7 pt-3 pb-1">
            <div className="flex gap-1.5">
              {TABS.map((t, i) => (
                <div key={t} className={cn('h-1 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-muted')} />
              ))}
            </div>
            <div className="mt-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Step {step + 1} of {TABS.length} — {STEP_LABEL[activeTab]}
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabId)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <TabsList className="mx-5 sm:mx-7 mt-3 mb-0 shrink-0 bg-muted/50 h-9 w-auto self-start gap-0.5 overflow-x-auto">
              {TABS.map(t => (
                <TabsTrigger key={t} value={t} className="text-xs px-3 sm:px-4">{STEP_LABEL[t]}</TabsTrigger>
              ))}
            </TabsList>

            {/* ── DETAILS ── */}
            <TabsContent value="details" className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 mt-0 data-[state=inactive]:hidden">
              <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                <div className="space-y-5">
                  <FL label="Part Number" required>
                    <FInput value={pn} onChange={e => setPn(e.target.value.toUpperCase())}
                      placeholder="e.g. EV-PWR-020" className="font-mono uppercase" />
                    <Err msg={errors.pn} />
                  </FL>
                  <FL label="Part Name" required>
                    <FInput value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Power Module" />
                    <Err msg={errors.name} />
                  </FL>
                  <FL label="Description">
                    <Textarea value={desc} onChange={e => setDesc(e.target.value.slice(0, DESC_MAX_LEN))}
                      placeholder="Brief technical description of the part"
                      className="text-sm bg-muted border-border resize-none" rows={4} maxLength={DESC_MAX_LEN} />
                    <div className="flex items-center justify-between mt-1">
                      <Err msg={errors.desc} />
                      <span className={cn('text-[11px]', desc.length >= DESC_MAX_LEN ? 'text-destructive' : 'text-muted-foreground')}>{desc.length}/{DESC_MAX_LEN}</span>
                    </div>
                  </FL>
                </div>
                <div className="space-y-5">
                  <FL label="Initial Revision">
                    <div className="flex items-center gap-3">
                      <FInput value={rev} onChange={e => setRev(e.target.value.toUpperCase().slice(0, 3))} placeholder="A" className="w-24 font-mono" />
                      <span className="text-xs text-muted-foreground">Starting revision (typically &quot;A&quot;)</span>
                    </div>
                  </FL>
                  <FL label="Unit of Measure (UOM)" required>
                    <div className="flex flex-wrap gap-1.5">
                      {UOM_OPTIONS.map(u => (
                        <button key={u} type="button" onClick={() => setUom(u)}
                          className={cn('px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                            uom === u ? 'bg-primary/10 text-primary border-primary/30' : 'bg-card text-muted-foreground border-border hover:bg-muted')}>
                          {u}
                        </button>
                      ))}
                    </div>
                  </FL>
                </div>

                <FL label="Category" required className="sm:col-span-2">
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                    {CATEGORIES.map(cat => {
                      const m = BOM_CAT_META[cat];
                      const Icon = CAT_ICONS[cat] ?? Tag;
                      const active = category === cat;
                      return (
                        <button key={cat} type="button" onClick={() => setCategory(cat)}
                          className={cn(
                            'flex flex-col items-center gap-2 py-3 px-2 rounded-xl border text-center transition-all',
                            active ? 'border-primary/60 bg-primary/5 shadow-sm' : 'border-border hover:bg-muted/50 hover:border-muted-foreground/30',
                          )}>
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${m.tint}20` }}>
                            <Icon style={{ color: m.tint, width: 18, height: 18 }} />
                          </div>
                          <span className={cn('text-[11px] font-medium leading-tight', active ? 'text-primary' : 'text-muted-foreground')}>
                            {m.label.split(' ')[0]}
                          </span>
                        </button>
                      );
                    })}
                    <button type="button" onClick={() => setCategory('')}
                      className={cn(
                        'flex flex-col items-center gap-2 py-3 px-2 rounded-xl border text-center transition-all',
                        !isKnownCategory(category) ? 'border-primary/60 bg-primary/5 shadow-sm' : 'border-border hover:bg-muted/50 hover:border-muted-foreground/30',
                      )}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted">
                        <Tag className="text-muted-foreground" style={{ width: 18, height: 18 }} />
                      </div>
                      <span className={cn('text-[11px] font-medium leading-tight', !isKnownCategory(category) ? 'text-primary' : 'text-muted-foreground')}>
                        Other
                      </span>
                    </button>
                  </div>
                  {!isKnownCategory(category) && (
                    <div className="mt-2 space-y-2">
                      <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-0.5">
                        Custom category name<span className="text-destructive ml-0.5">*</span>
                      </label>
                      <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="Enter a custom category"
                        className={cn('h-9', errors.category && 'border-destructive focus-visible:ring-destructive')} maxLength={50} autoFocus />
                      {customCategoryOptions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {customCategoryOptions.map(c => (
                            <button key={c} type="button" onClick={() => setCategory(c)}
                              className="px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-card text-muted-foreground hover:bg-muted transition-colors">
                              {c}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <Err msg={errors.category} />
                </FL>
              </div>
            </TabsContent>

            {/* ── SOURCING ── */}
            <TabsContent value="sourcing" className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 mt-0 data-[state=inactive]:hidden">
              <div className="space-y-5">
                <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                  <FL label="Manufacturer">
                    <FInput value={manufacturer} onChange={e => setManufacturer(e.target.value)} placeholder="e.g. Texas Instruments" />
                  </FL>
                  <FL label="Manufacturer PN (MPN)">
                    <FInput value={mpn} onChange={e => setMpn(e.target.value)} placeholder="e.g. TI-A4B2C" className="font-mono" />
                  </FL>
                  <FL label="Lead Time">
                    <div className="flex gap-1.5">
                      <FInput value={leadTime} onChange={e => setLeadTime(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                        type="text" placeholder="8" className="flex-1" maxLength={6} />
                      <div className="flex gap-1 shrink-0">
                        {LEAD_TIME_UNITS.map(u => (
                          <button key={u.id} type="button" onClick={() => setLeadTimeUnit(u.id)}
                            className={cn('px-2.5 h-9 rounded-md text-xs font-medium border transition-colors',
                              leadTimeUnit === u.id ? 'bg-primary/10 text-primary border-primary/30' : 'bg-card text-muted-foreground border-border hover:bg-muted')}>
                            {u.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Err msg={errors.leadTime} />
                  </FL>
                </div>

                <div className="space-y-3">
                  {suppliers.map((sup, i) => (
                    <div key={i} className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Supplier {i + 1}</span>
                        {suppliers.length > 1 && (
                          <button type="button" onClick={() => setSuppliers(s => s.filter((_, idx) => idx !== i))}
                            className="text-muted-foreground hover:text-destructive transition-colors" title="Remove supplier">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                        <FL label="Supplier / Distributor">
                          <FInput value={sup.distributor}
                            onChange={e => setSuppliers(s => s.map((x, idx) => idx === i ? { ...x, distributor: e.target.value } : x))}
                            placeholder="e.g. Digi-Key" />
                        </FL>
                        <FL label="Unit Price">
                          <FInput value={sup.calcFromSubparts ? '0.00' : sup.price}
                            onChange={e => {
                              let val = e.target.value.replace(/[^0-9.]/g, '');
                              const parts = val.split('.');
                              if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                              setSuppliers(s => s.map((x, idx) => idx === i ? { ...x, price: val } : x));
                            }}
                            disabled={sup.calcFromSubparts} type="text" placeholder="0.00" maxLength={15} />
                          <Err msg={errors[`sup_price_${i}`]} />
                          <div className="flex items-center gap-2 mt-1.5">
                            <Checkbox id={`inv_calc_${i}`} checked={sup.calcFromSubparts}
                              onCheckedChange={c => setSuppliers(s => s.map((x, idx) => idx === i ? { ...x, calcFromSubparts: !!c } : x))} />
                            <label htmlFor={`inv_calc_${i}`} className="text-[11px] font-medium leading-none text-muted-foreground cursor-pointer select-none">
                              Calculate from sub-parts
                            </label>
                          </div>
                        </FL>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => setSuppliers(s => [...s, { distributor: '', price: '', calcFromSubparts: false }])}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Add Supplier
                  </button>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Additional Fields</span>
                  {customFields.map((field, i) => (
                    <div key={i} className="grid gap-x-4 sm:grid-cols-2">
                      <FL label="Field Label">
                        <FInput value={field.label}
                          onChange={e => setCustomFields(f => f.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                          placeholder="e.g. RoHS" />
                      </FL>
                      <FL label="Value">
                        <div className="flex items-center gap-1.5">
                          <FInput value={field.value}
                            onChange={e => setCustomFields(f => f.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x))}
                            placeholder="e.g. Compliant" className="flex-1" />
                          <button type="button" onClick={() => setCustomFields(f => f.filter((_, idx) => idx !== i))}
                            className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </FL>
                    </div>
                  ))}
                  <button type="button" onClick={() => setCustomFields(f => [...f, { label: '', value: '' }])}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Add Field
                  </button>
                </div>
              </div>
            </TabsContent>

            {/* ── TRACEABILITY (informational — needs a project BOM) ── */}
            <TabsContent value="traceability" className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 mt-0 data-[state=inactive]:hidden">
              <div className="max-w-xl space-y-3">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Requirements Links</Label>
                <div className="flex flex-col items-center justify-center gap-2 h-40 rounded-xl border-2 border-dashed border-border bg-muted/20 text-center px-6">
                  <GitBranch className="w-6 h-6 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Requirement links are managed on the part&apos;s BOM line.
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    Add this part to a project&apos;s Bill of Materials, then open it from the BOM to link the system requirements it satisfies.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* ── DOCUMENTS (image URL persists; files live on the BOM line) ── */}
            <TabsContent value="documents" className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 mt-0 data-[state=inactive]:hidden">
              <div className="max-w-xl space-y-6">
                <FL label="Product Photo URL">
                  <div className="flex items-center gap-2">
                    <span className="w-9 h-9 rounded-md border border-border bg-muted flex items-center justify-center shrink-0">
                      {imageUrl.trim()
                        ? <ImageIcon className="w-4 h-4 text-primary" />
                        : <LinkIcon className="w-4 h-4 text-muted-foreground" />}
                    </span>
                    <FInput value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                      placeholder="https://example.com/photo.jpg" className="flex-1" />
                  </div>
                  {imageUrl.trim() && (
                    <img src={imageUrl} alt="preview" className="mt-2 h-32 rounded-lg border border-border object-contain bg-muted/30"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">A pasted image URL is saved with the part.</p>
                </FL>

                <div>
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Technical Files</Label>
                  <div className="mt-2 flex flex-col items-center justify-center gap-2 h-36 rounded-xl border-2 border-dashed border-border bg-muted/20 text-center px-6">
                    <p className="text-sm text-muted-foreground">Datasheets, 3D models and footprints attach on the part&apos;s BOM line.</p>
                    <p className="text-xs text-muted-foreground/70">Open the part from a project&apos;s Bill of Materials to upload technical files.</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* ── Footer ── */}
          <div className="px-5 sm:px-7 py-4 border-t border-border flex items-center justify-between gap-4 shrink-0 bg-card">
            <div className="text-xs text-muted-foreground hidden sm:block">
              {isLast ? 'New part will be added to your catalog' : `Step ${step + 1} of ${TABS.length}`}
            </div>
            <div className="flex gap-2 shrink-0 w-full sm:w-auto">
              <Button variant="outline" className="flex-1 sm:flex-none px-5" onClick={requestClose} disabled={saving}>Cancel</Button>
              {step > 0 && (
                <Button variant="outline" className="gap-1.5 px-4" onClick={handleBack} disabled={saving}>
                  <ChevronLeft className="w-4 h-4" /> Back
                </Button>
              )}
              {!isLast ? (
                <Button className="flex-1 sm:flex-none gap-1.5 px-5" onClick={handleNext} disabled={checkingPn}>
                  {checkingPn ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</> : <>Next <ChevronRight className="w-4 h-4" /></>}
                </Button>
              ) : (
                <Button className="flex-1 sm:flex-none gap-2 px-6" onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4" />
                  {saving ? 'Creating…' : 'Add Part'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        onConfirm={onClose}
        title="Discard new part?"
        description="You have unsaved details for this part. Closing now will discard them."
        confirmText="Discard"
        cancelText="Keep Editing"
        variant="destructive"
      />
    </>
  );
}
