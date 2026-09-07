import { useMemo, useState } from 'react';
import { ClipboardCheck, AlertTriangle, Flag, ChevronRight, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  availableOf, formatShortDate, type Build, type StockRecord, type CoverageStatus,
} from './inventoryData';

interface Alert {
  id: string;
  icon: 'shortage' | 'milestone';
  title: string;
  severity: 'HIGH' | 'MEDIUM';
  description: string;
  buildId: string;
}

function buildAlerts(builds: Build[]): Alert[] {
  const alerts: Alert[] = [];
  for (const b of builds) {
    if (b.shortLines.length === 0) continue;
    alerts.push({
      id: `short-${b.id}`,
      icon: 'shortage',
      title: `${b.name} is short ${b.shortLines.length} line${b.shortLines.length === 1 ? '' : 's'}`,
      severity: 'HIGH',
      description: b.longestLead
        ? `Longest lead: ${b.longestLead.name} (${b.longestLead.pn}). Projected ready ${formatShortDate(b.projectedDate)}.`
        : `Projected ready ${formatShortDate(b.projectedDate)}.`,
      buildId: b.id,
    });
    // Only a real, user-set target date makes "past target" meaningful — skip this
    // alert entirely for builds with no target or no linked milestone.
    if (b.linkedMilestone && b.targetDate && b.daysLate > 0) {
      alerts.push({
        id: `milestone-${b.id}`,
        icon: 'milestone',
        title: `Milestone at risk — ${b.linkedMilestone}`,
        severity: 'HIGH',
        description: `${b.name} projected ready ${formatShortDate(b.projectedDate)}, ${b.daysLate} days past target ${formatShortDate(b.targetDate)}.`,
        buildId: b.id,
      });
    }
  }
  return alerts;
}

interface AlertsPanelProps {
  builds: Build[];
  stock: StockRecord[];
  coverageOf: (r: StockRecord) => CoverageStatus;
  onSelectPart: (partId: string) => void;
  onSelectBuild: (buildId: string) => void;
  onViewBuilds: () => void;
}

export function AlertsPanel({ builds, stock, coverageOf, onSelectPart, onSelectBuild, onViewBuilds }: AlertsPanelProps) {
  const isMobile = useIsMobile();
  const [mobileSearch, setMobileSearch] = useState('');
  const shortBuilds = builds.filter(b => b.shortLines.length > 0);
  const buildsForStatus = isMobile ? builds : shortBuilds;

  const belowCoverageAll = useMemo(() => {
    return stock
      .map(r => ({ record: r, status: coverageOf(r), available: availableOf(r) }))
      .filter(row => row.status === 'short' || row.status === 'conflict')
      .sort((a, b) => a.available - b.available);
  }, [stock, coverageOf]);

  const alertsAll = useMemo(() => buildAlerts(builds), [builds]);

  const q = mobileSearch.trim().toLowerCase();
  const alerts = isMobile && q
    ? alertsAll.filter(a => `${a.title} ${a.description}`.toLowerCase().includes(q))
    : alertsAll;
  const buildsForStatusFiltered = isMobile && q
    ? buildsForStatus.filter(b => `${b.name} ${b.type}`.toLowerCase().includes(q))
    : buildsForStatus;
  const belowCoverage = isMobile && q
    ? belowCoverageAll.filter(({ record }) => `${record.pn} ${record.name}`.toLowerCase().includes(q))
    : belowCoverageAll;

  return (
    <div className="space-y-4">
      {isMobile && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search alerts..."
            value={mobileSearch}
            onChange={(e) => setMobileSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      <div className="space-y-3">
        {!isMobile && (
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
            ALERTS <span className="ml-1 text-muted-foreground">{alertsAll.length}</span>
          </h3>
        )}
        {alerts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">No active alerts.</CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <button
                key={a.id}
                onClick={() => onSelectBuild(a.buildId)}
                className="w-full rounded-lg border border-l-4 p-3 sm:p-4 flex items-start gap-3 text-left hover:bg-muted/30 transition-colors"
                style={{ borderLeftColor: '#DC2626' }}
              >
                {a.icon === 'shortage' ? (
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                ) : (
                  <Flag className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{a.title}</span>
                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0">{a.severity}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {isMobile ? (
        <div className="space-y-5">
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Builds by clear-to-build status
            </h3>
            {buildsForStatusFiltered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {q ? 'No builds match your search.' : 'All builds are clear to build.'}
              </p>
            ) : (
              <div className="space-y-2">
                {buildsForStatusFiltered.map((b) => {
                  const isShort = b.shortLines.length > 0;
                  return (
                    <button
                      key={b.id}
                      onClick={() => onSelectBuild(b.id)}
                      className="w-full rounded-xl border border-border bg-card p-3 flex items-center justify-between gap-3 text-left active:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ background: isShort ? '#DC2626' : '#16A34A' }} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {b.name} <span className="text-muted-foreground font-normal">· {b.type}</span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {b.readyCount} ready · {b.onOrderCount} on order · {b.shortLines.length} short
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isShort ? (
                          <>
                            {b.daysLate > 0 && (
                              <Badge variant="outline" className="text-[10px] font-normal gap-1">
                                <Flag className="h-2.5 w-2.5" />{b.daysLate}d
                              </Badge>
                            )}
                            <Badge variant="destructive" className="text-[10px]">Short</Badge>
                          </>
                        ) : (
                          <Badge className="text-[10px] border-transparent" style={{ background: 'rgba(22,163,74,0.1)', color: '#16A34A' }}>Ready</Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Parts below coverage</h3>
              <span className="text-xs text-muted-foreground">{belowCoverage.length}</span>
            </div>
            {belowCoverage.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nothing below coverage.</p>
            ) : (
              <div className="space-y-2">
                {belowCoverage.map(({ record, status, available }) => (
                  <button
                    key={record.id}
                    onClick={() => onSelectPart(record.partId)}
                    className="w-full flex items-center justify-between gap-2 text-left rounded-xl border border-border bg-card p-3 active:bg-muted/50 transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: status === 'conflict' ? '#DC2626' : '#D97706' }} />
                      <span className="text-sm font-medium truncate">{record.name}</span>
                    </span>
                    <span className="text-lg font-bold text-destructive shrink-0">{available}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardCheck className="h-4 w-4 text-primary" /> Builds by Clear-to-Build status
              </h3>
              <button
                onClick={onViewBuilds}
                className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline shrink-0"
              >
                View all <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {shortBuilds.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">All builds are clear to build.</p>
            ) : (
              <div className="space-y-2">
                {shortBuilds.map((b) => (
                  <div key={b.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ background: '#DC2626' }} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {b.name} <span className="text-muted-foreground font-normal">· {b.type}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {b.readyCount} ready · {b.onOrderCount} on order · {b.shortLines.length} short
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {b.daysLate > 0 && (
                        <Badge variant="outline" className="text-[10px] font-normal gap-1">
                          <Flag className="h-2.5 w-2.5" />{b.daysLate}d
                        </Badge>
                      )}
                      <Badge variant="destructive" className="text-[10px]">Short</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Parts below coverage
              </h3>
              <span className="text-sm text-muted-foreground">{belowCoverage.length}</span>
            </div>
            {belowCoverage.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nothing below coverage.</p>
            ) : (
              <div className="space-y-2">
                {belowCoverage.slice(0, 6).map(({ record, status, available }) => (
                  <button
                    key={record.id}
                    onClick={() => onSelectPart(record.partId)}
                    className="w-full flex items-center justify-between gap-2 text-left rounded-md px-1 py-1 hover:bg-muted/50 transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: status === 'conflict' ? '#DC2626' : '#D97706' }} />
                      <span className="text-sm font-medium text-primary shrink-0">{record.pn}</span>
                      <span className="text-sm text-muted-foreground truncate">{record.name}</span>
                    </span>
                    <span className="text-sm font-semibold text-destructive shrink-0">{available}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}
