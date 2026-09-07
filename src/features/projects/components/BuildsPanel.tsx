import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle, Truck, Flag, ArrowRight, ClipboardCheck, Plus, Search, ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAllocateBuild, useKitBuild, useGenerateShortageOrders } from '@/hooks/useInventory';
import { HoverZoomImage, PartThumb } from './BOMShared';
import { CoveragePill, formatShortDate, type Build } from './inventoryData';
import { NewBuildDialog, type NewBuildInput } from './NewBuildDialog';
import { GenerateShortageOrdersDialog } from './GenerateShortageOrdersDialog';

// Fixed accent per build phase — purely visual grouping, matches the design system's build type chips.
const BUILD_TYPE_TINT: Record<string, string> = { EVT: '#7C3AED', DVT: '#2563EB', PVT: '#16A34A' };

interface BuildsPanelProps {
  orgId: string;
  builds: Build[];
  onSelectPart: (partId: string) => void;
  openBuildId?: string | null;
  onOpenBuildHandled?: () => void;
  onAddBuild: (input: NewBuildInput) => void;
  projects: { id: string; name: string }[];
}

export function BuildsPanel({ orgId, builds, onSelectPart, openBuildId, onOpenBuildHandled, onAddBuild, projects }: BuildsPanelProps) {
  const isMobile = useIsMobile();
  const [selectedBuildId, setSelectedBuildId] = useState(builds[0]?.id);
  const [mobileSearch, setMobileSearch] = useState('');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [newBuildOpen, setNewBuildOpen] = useState(false);
  const [shortageDialogOpen, setShortageDialogOpen] = useState(false);
  const selectedBuild = builds.find(b => b.id === selectedBuildId) ?? builds[0];

  const allocateMutation = useAllocateBuild(orgId);
  const kitMutation = useKitBuild(orgId);
  const shortageOrderMutation = useGenerateShortageOrders(orgId);

  const canKit = !!selectedBuild && selectedBuild.status === 'allocated';
  const isKitted = selectedBuild?.status === 'kitted';
  // Nothing left to reserve once every line's allocated qty already meets its required qty —
  // disable the button instead of letting it be clicked as a no-op.
  const hasOutstandingDemand = !!selectedBuild?.lines.some((l) => l.required - l.allocated > 0);
  const handleAutoAllocate = () => { if (selectedBuild) allocateMutation.mutate(selectedBuild.id); };
  const handleMarkKitted = () => { if (selectedBuild) kitMutation.mutate(selectedBuild.id); };
  // Opens the checklist dialog instead of ordering everything blind — the user picks which
  // shorted part(s) to actually send to procurement right now.
  const handleGenerateShortage = () => setShortageDialogOpen(true);
  // A part that already has a pending order gets its quantity topped up instead of a
  // duplicate order; a part with no pending order gets a new one.
  const handleConfirmShortageOrders = (partIds: string[]) => {
    if (!selectedBuild) return;
    shortageOrderMutation.mutate({ buildId: selectedBuild.id, partIds }, {
      onSuccess: (result) => {
        setShortageDialogOpen(false);
        const created = result.lines.filter((l) => l.action === 'created').length;
        const updated = result.lines.filter((l) => l.action === 'updated').length;
        const parts = [
          created > 0 && `${created} new order${created === 1 ? '' : 's'}`,
          updated > 0 && `${updated} existing order${updated === 1 ? '' : 's'} topped up`,
        ].filter(Boolean).join(', ');
        toast.success(`Ordered ${result.lines.length} shorted part(s) — ${parts}`);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to generate shortage orders'),
    });
  };

  // Alerts tab hands off a build to open here — jump to it and, on mobile, pop the detail dialog.
  useEffect(() => {
    if (!openBuildId) return;
    setSelectedBuildId(openBuildId);
    if (isMobile) setMobileDetailOpen(true);
    onOpenBuildHandled?.();
  }, [openBuildId, isMobile, onOpenBuildHandled]);

  if (!selectedBuild) {
    return (
      <>
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No builds yet.</p>
            <Button size="sm" onClick={() => setNewBuildOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> New build
            </Button>
          </CardContent>
        </Card>
        <NewBuildDialog isOpen={newBuildOpen} onClose={() => setNewBuildOpen(false)} onAddBuild={onAddBuild} projects={projects} />
      </>
    );
  }

  if (isMobile) {
    const filteredBuilds = builds.filter(b =>
      `${b.name} ${b.type}`.toLowerCase().includes(mobileSearch.toLowerCase())
    );
    const openMobileDetail = (id: string) => { setSelectedBuildId(id); setMobileDetailOpen(true); };

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search builds..."
              value={mobileSearch}
              onChange={(e) => setMobileSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" onClick={() => setNewBuildOpen(true)} title="New build">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {filteredBuilds.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No builds match your search.</div>
        ) : (
          <div className="space-y-2">
            {filteredBuilds.map((b) => {
              const isShort = b.shortLines.length > 0;
              return (
                <button
                  key={b.id}
                  onClick={() => openMobileDetail(b.id)}
                  className="w-full text-left rounded-xl border border-border bg-card p-3.5 active:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: isShort ? '#DC2626' : '#16A34A' }} />
                      <span className="text-sm font-bold text-foreground truncate">{b.name}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-semibold shrink-0"
                      style={{ color: BUILD_TYPE_TINT[b.type] ?? undefined, borderColor: `${BUILD_TYPE_TINT[b.type] ?? '#64748B'}40`, background: `${BUILD_TYPE_TINT[b.type] ?? '#64748B'}14` }}
                    >
                      {b.type}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mb-1.5">
                    {b.units} units · {b.bomRev} · {formatShortDate(b.targetDate)}
                  </div>
                  {isShort ? (
                    <div className="flex items-center gap-1 text-xs font-medium text-destructive">
                      <Flag className="h-3 w-3" /> {b.daysLate}d past target
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs font-medium" style={{ color: '#16A34A' }}>
                      <CheckCircle className="h-3 w-3" /> Complete
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <Dialog open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
          <DialogContent hideClose className="p-0 inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-[100dvh] max-w-none max-h-none rounded-none border-0 overflow-y-auto overflow-x-hidden data-[state=open]:!slide-in-from-left-0 data-[state=open]:!slide-in-from-top-0 data-[state=closed]:!slide-out-to-left-0 data-[state=closed]:!slide-out-to-top-0">
            <DialogTitle className="sr-only">{selectedBuild.name}</DialogTitle>
            <div className="sticky -top-4 z-20 flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-background">
              <button
                type="button"
                onClick={() => setMobileDetailOpen(false)}
                className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 text-foreground active:bg-muted/70 transition-colors"
                aria-label="Back"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h1 className="text-[15px] font-bold text-foreground truncate">{selectedBuild.name}</h1>
            </div>
            <div className="min-w-0 p-4 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{selectedBuild.type}</Badge>
                {selectedBuild.shortLines.length === 0 && (
                  <Badge className="gap-1 border-transparent" style={{ background: 'rgba(22,163,74,0.1)', color: '#16A34A' }}>
                    <CheckCircle className="h-3 w-3" /> Clear to build
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                BOM {selectedBuild.bomRev} · {selectedBuild.units} units · scrap {selectedBuild.scrapPct}%
                {selectedBuild.linkedMilestone && (
                  <>
                    {' '}· linked to <span className="font-medium text-foreground">{selectedBuild.linkedMilestone}</span>
                  </>
                )}
                {selectedBuild.assignee && (
                  <>
                    {' '}· Assigned to <span className="font-medium text-foreground">{selectedBuild.assignee.name}</span>
                  </>
                )}
              </p>

              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Target</div>
                  <div className="text-base font-bold">{formatShortDate(selectedBuild.targetDate)}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="text-right">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Projected</div>
                  <div className="text-base font-bold" style={{ color: selectedBuild.daysLate > 0 ? '#DC2626' : '#16A34A' }}>
                    {formatShortDate(selectedBuild.projectedDate)}
                  </div>
                </div>
              </div>

              {selectedBuild.shortLines.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2 text-sm">
                  <Flag className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p>
                    Shortage lead time pushes the projected ready date{' '}
                    <span className="font-semibold text-destructive">{selectedBuild.daysLate} days</span> past target
                    {selectedBuild.linkedMilestone ? (
                      <>
                        {' '}— milestone <span className="font-semibold">{selectedBuild.linkedMilestone}</span> is flagged at-risk on the schedule.
                      </>
                    ) : ' on the schedule.'}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  className="h-auto min-w-0 justify-start whitespace-normal py-2.5 text-left"
                  disabled={isKitted || !hasOutstandingDemand || allocateMutation.isPending}
                  onClick={handleAutoAllocate}
                >
                  <ClipboardCheck className="h-4 w-4 mr-2 shrink-0" />
                  {allocateMutation.isPending ? 'Allocating…' : 'Auto-allocate available'}
                </Button>
                <Button
                  className="h-auto min-w-0 justify-start whitespace-normal py-2.5 text-left"
                  variant="outline"
                  disabled={selectedBuild.shortLines.length === 0}
                  onClick={handleGenerateShortage}
                >
                  <Truck className="h-4 w-4 mr-2 shrink-0" /> Generate shortage → Procurement
                </Button>
                <Button
                  className="h-auto min-w-0 justify-start whitespace-normal py-2.5 text-left"
                  variant="outline"
                  disabled={!canKit || kitMutation.isPending}
                  onClick={handleMarkKitted}
                >
                  <CheckCircle className="h-4 w-4 mr-2 shrink-0" />
                  {isKitted ? 'Kitted' : kitMutation.isPending ? 'Marking…' : 'Mark kitted'}
                </Button>
              </div>

              <div className="space-y-2">
                {selectedBuild.lines.map((l) => {
                  // Same outstanding-vs-total logic as the desktop table — see comment there.
                  const outstanding = Math.max(0, l.required - l.allocated);
                  const shortfall =
                    outstanding > l.available + l.onOrder ? l.available + l.onOrder - outstanding : 0;
                  return (
                    <button
                      key={l.partId}
                      onClick={() => onSelectPart(l.partId)}
                      className="w-full text-left rounded-lg border p-3 active:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0 mb-2">
                        <HoverZoomImage imageUrl={l.imageUrl} enabled={!!l.imageUrl}>
                          <PartThumb cat={l.cat} size={28} radius={7} imageUrl={l.imageUrl} />
                        </HoverZoomImage>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-primary truncate">{l.pn}</div>
                          <div className="text-xs text-muted-foreground truncate">{l.name}</div>
                        </div>
                        <CoveragePill status={l.status} />
                      </div>
                      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border text-center">
                        <div>
                          <div className="text-sm font-semibold">{outstanding}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Req</div>
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{l.available}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Avail</div>
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{l.allocated}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Alloc</div>
                        </div>
                        <div>
                          <div className={cn('text-sm font-semibold', shortfall < 0 && 'text-destructive')}>
                            {shortfall < 0 ? shortfall : '—'}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Short</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <NewBuildDialog isOpen={newBuildOpen} onClose={() => setNewBuildOpen(false)} onAddBuild={onAddBuild} projects={projects} />
        <GenerateShortageOrdersDialog
          isOpen={shortageDialogOpen}
          onClose={() => setShortageDialogOpen(false)}
          buildName={selectedBuild.name}
          lines={selectedBuild.shortLines}
          onConfirm={handleConfirmShortageOrders}
          isSubmitting={shortageOrderMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* Builds list panel — stays put while the detail column scrolls past it */}
      <div className="w-full lg:w-72 shrink-0 rounded-xl border border-border bg-card p-3 lg:sticky lg:top-6">
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">Builds</h3>
          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setNewBuildOpen(true)} title="New build">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          {builds.map((b) => {
            const isShort = b.shortLines.length > 0;
            const active = b.id === selectedBuild.id;
            return (
              <button
                key={b.id}
                onClick={() => setSelectedBuildId(b.id)}
                className={cn(
                  'w-full text-left rounded-lg border p-3 transition-colors',
                  active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: isShort ? '#DC2626' : '#16A34A' }} />
                    <span className="text-sm font-bold text-foreground truncate">{b.name}</span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-semibold shrink-0"
                    style={{ color: BUILD_TYPE_TINT[b.type] ?? undefined, borderColor: `${BUILD_TYPE_TINT[b.type] ?? '#64748B'}40`, background: `${BUILD_TYPE_TINT[b.type] ?? '#64748B'}14` }}
                  >
                    {b.type}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mb-1.5">
                  {b.units} units · {b.bomRev} · {formatShortDate(b.targetDate)}
                </div>
                {isShort ? (
                  <div className="flex items-center gap-1 text-xs font-medium text-destructive">
                    <Flag className="h-3 w-3" /> {b.daysLate}d past target
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs font-medium" style={{ color: '#16A34A' }}>
                    <CheckCircle className="h-3 w-3" /> Complete
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 space-y-4 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold">{selectedBuild.name}</h2>
              <Badge variant="outline">{selectedBuild.type}</Badge>
              {selectedBuild.shortLines.length === 0 && (
                <Badge className="gap-1 border-transparent" style={{ background: 'rgba(22,163,74,0.1)', color: '#16A34A' }}>
                  <CheckCircle className="h-3 w-3" /> Clear to build
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              BOM {selectedBuild.bomRev} · {selectedBuild.units} units · scrap {selectedBuild.scrapPct}%
              {selectedBuild.linkedMilestone && (
                <>
                  {' '}· linked to <span className="font-medium text-foreground">{selectedBuild.linkedMilestone}</span>
                </>
              )}
              {selectedBuild.assignee && (
                <>
                  {' '}· Assigned to <span className="font-medium text-foreground">{selectedBuild.assignee.name}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap rounded-lg border p-3 shrink-0">
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Target build date</div>
              <div className="text-lg font-bold">{formatShortDate(selectedBuild.targetDate)}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Projected ready</div>
              <div className="text-lg font-bold" style={{ color: selectedBuild.daysLate > 0 ? '#DC2626' : '#16A34A' }}>
                {formatShortDate(selectedBuild.projectedDate)}
              </div>
              {selectedBuild.daysLate > 0 && (
                <div className="text-xs text-destructive">{selectedBuild.daysLate} days late</div>
              )}
            </div>
          </div>
        </div>

        {selectedBuild.shortLines.length > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2 text-sm">
            <Flag className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p>
              Shortage lead time pushes the projected ready date{' '}
              <span className="font-semibold text-destructive">{selectedBuild.daysLate} days</span> past target
              {selectedBuild.linkedMilestone ? (
                <>
                  {' '}— milestone <span className="font-semibold">{selectedBuild.linkedMilestone}</span> is flagged at-risk on the schedule.
                </>
              ) : ' on the schedule.'}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button disabled={isKitted || !hasOutstandingDemand || allocateMutation.isPending} onClick={handleAutoAllocate}>
            <ClipboardCheck className="h-4 w-4 mr-2" />
            {allocateMutation.isPending ? 'Allocating…' : 'Auto-allocate available'}
          </Button>
          <Button variant="outline" disabled={selectedBuild.shortLines.length === 0} onClick={handleGenerateShortage}>
            <Truck className="h-4 w-4 mr-2" /> Generate shortage → Procurement
          </Button>
          <Button variant="outline" disabled={!canKit || kitMutation.isPending} onClick={handleMarkKitted}>
            <CheckCircle className="h-4 w-4 mr-2" />
            {isKitted ? 'Kitted' : kitMutation.isPending ? 'Marking…' : 'Mark kitted'}
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden overflow-x-auto">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="px-3 py-2 w-[220px]">BOM Line</TableHead>
                <TableHead className="px-3 py-2 w-[90px] text-right whitespace-nowrap">Qty/Unit</TableHead>
                <TableHead className="px-3 py-2 w-[90px] text-right whitespace-nowrap">Required</TableHead>
                <TableHead className="px-3 py-2 w-[90px] text-right whitespace-nowrap">Available</TableHead>
                <TableHead className="px-3 py-2 w-[90px] text-right whitespace-nowrap">Allocated</TableHead>
                <TableHead className="px-3 py-2 w-[90px] text-right whitespace-nowrap">On Order</TableHead>
                <TableHead className="px-3 py-2 w-[90px] text-right whitespace-nowrap">Shortfall</TableHead>
                <TableHead className="px-3 py-2 w-[110px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedBuild.lines.map((l) => {
                // "Required" shown here is the outstanding amount still to allocate — total
                // BOM demand minus what's already been reserved for this build — so it counts
                // down as Auto-allocate reserves stock, instead of staying pinned at the total.
                const outstanding = Math.max(0, l.required - l.allocated);
                const shortfall =
                  outstanding > l.available + l.onOrder ? l.available + l.onOrder - outstanding : 0;
                return (
                  <TableRow key={l.partId} className="cursor-pointer" onClick={() => onSelectPart(l.partId)}>
                    <TableCell className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <HoverZoomImage imageUrl={l.imageUrl} enabled={!!l.imageUrl}>
                          <PartThumb cat={l.cat} size={28} radius={7} imageUrl={l.imageUrl} />
                        </HoverZoomImage>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-primary truncate">{l.pn}</div>
                          <div className="text-xs text-muted-foreground truncate">{l.name}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right">{l.qtyPerUnit} {l.uom}</TableCell>
                    <TableCell className="px-3 py-2 text-right font-semibold">{outstanding}</TableCell>
                    <TableCell className="px-3 py-2 text-right">{l.available}</TableCell>
                    <TableCell className="px-3 py-2 text-right">{l.allocated}</TableCell>
                    <TableCell className="px-3 py-2 text-right">{l.onOrder || '—'}</TableCell>
                    <TableCell className={cn('px-3 py-2 text-right', shortfall < 0 && 'text-destructive font-semibold')}>
                      {shortfall < 0 ? shortfall : '—'}
                    </TableCell>
                    <TableCell className="px-3 py-2"><CoveragePill status={l.status} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
      <NewBuildDialog isOpen={newBuildOpen} onClose={() => setNewBuildOpen(false)} onAddBuild={onAddBuild} projects={projects} />
      <GenerateShortageOrdersDialog
        isOpen={shortageDialogOpen}
        onClose={() => setShortageDialogOpen(false)}
        buildName={selectedBuild.name}
        lines={selectedBuild.shortLines}
        onConfirm={handleConfirmShortageOrders}
        isSubmitting={shortageOrderMutation.isPending}
      />
    </div>
  );
}
