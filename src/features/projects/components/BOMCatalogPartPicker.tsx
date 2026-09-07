/**
 * BOMCatalogPartPicker — the screen shown after "Add Manually" in the BOM
 * Add Part flow. Pick an existing org-catalog part (quick add — it drops
 * straight into the BOM as a Draft line, editable in the row), or fall
 * through to the full new-part wizard via "Create a new part instead".
 *
 * A part may live in many projects and appear at several places in one BOM,
 * but never twice directly under the same parent — those rows are shown
 * disabled here (`disabledPartIds`), not hidden.
 */
import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Command, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Check, Loader2, Plus, PackageSearch } from 'lucide-react';
import { usePartCatalogSearch, useOrgParts } from '@/hooks/useParts';
import { getCategoryMeta, type ApiPartResponse } from './bomData';

interface Props {
  open: boolean;
  onClose: () => void;
  orgId: string;
  /** partIds already directly under the target parent — shown disabled, can't be re-added there. */
  disabledPartIds: Set<string>;
  /** Label for a disabled row (e.g. "Already a top-level part"). */
  disabledReason?: string;
  /** Quick-add the chosen catalog part to the BOM. */
  onSelect: (part: ApiPartResponse) => void | Promise<void>;
  /** Drop into the full new-part wizard instead. */
  onCreateNew: () => void;
}

export function BOMCatalogPartPicker({
  open, onClose, orgId, disabledPartIds, disabledReason = 'Already added here', onSelect, onCreateNew,
}: Props) {
  const { data: initial, isLoading } = useOrgParts(orgId, { limit: 100 });
  const fallback = useMemo(() => initial?.data ?? [], [initial]);
  const { query, setQuery, results, isSearching } = usePartCatalogSearch(orgId, fallback);
  const [addingId, setAddingId] = useState<string | null>(null);

  const parts = useMemo(() => {
    // Addable parts first, disabled (already-here) parts last; each alphabetical.
    return [...results].sort((a, b) => {
      const ai = disabledPartIds.has(a.id) ? 1 : 0;
      const bi = disabledPartIds.has(b.id) ? 1 : 0;
      if (ai !== bi) return ai - bi;
      return a.partNumber.localeCompare(b.partNumber);
    });
  }, [results, disabledPartIds]);

  const handleSelect = async (part: ApiPartResponse) => {
    if (addingId || disabledPartIds.has(part.id)) return;
    setAddingId(part.id);
    try {
      await onSelect(part);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-base font-semibold">Add a part</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Pick an existing part from your catalog, or create a new one.
          </DialogDescription>
        </DialogHeader>

        <Command shouldFilter={false} className="rounded-none">
          <CommandInput placeholder="Search parts by number, name or MPN…" value={query} onValueChange={setQuery} />
          <CommandList className="max-h-[46vh]">
            {(isLoading || isSearching) && parts.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading parts…
              </div>
            ) : parts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 px-6 text-center">
                <PackageSearch className="w-6 h-6 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {query.trim() ? 'No matching parts in your catalog.' : 'Your catalog has no parts yet.'}
                </p>
              </div>
            ) : (
              <CommandGroup>
                {parts.map(part => {
                  const meta = getCategoryMeta(part.category);
                  const disabled = disabledPartIds.has(part.id);
                  return (
                    <CommandItem
                      key={part.id}
                      value={`${part.partNumber} ${part.name} ${part.mpn ?? ''}`}
                      disabled={disabled}
                      onSelect={() => handleSelect(part)}
                      className={cn(!disabled && 'cursor-pointer', disabled && 'opacity-50')}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="flex flex-col min-w-0 gap-0.5 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm truncate">{part.partNumber} — {part.name}</span>
                            {disabled && (
                              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {disabledReason}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="flex items-center gap-1 shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.tint }} />
                              <span className="text-xs text-muted-foreground">{meta.label}</span>
                            </span>
                            <span className="text-xs text-muted-foreground truncate">
                              · {part.manufacturer || 'No manufacturer'}{part.mpn ? ` · ${part.mpn}` : ''}
                            </span>
                          </div>
                        </div>
                        {disabled
                          ? <Check className="w-4 h-4 shrink-0 text-muted-foreground" />
                          : addingId === part.id
                            ? <Loader2 className="w-4 h-4 animate-spin shrink-0 text-muted-foreground" />
                            : <Plus className="w-4 h-4 shrink-0 text-muted-foreground" />}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>

        <DialogFooter className="px-4 py-3 border-t border-border sm:justify-between gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={!!addingId}>Cancel</Button>
          <Button size="sm" className="gap-1.5" onClick={onCreateNew} disabled={!!addingId}>
            <Plus className="w-4 h-4" /> Create a new part instead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
