import { describe, it, expect } from 'vitest';
import { buildFromDef, formatShortDate, type BuildDef, type BuildBomLine } from './inventoryData';

const shortLine: BuildBomLine = {
  partId: 'p1',
  pn: 'CMP-PROP-001',
  name: 'Polycarbonate Propeller Blades',
  cat: 'MECH',
  qtyPerUnit: 5,
  uom: 'EA',
  onHand: 0,
  allocated: 0,
  onOrder: 0,
  quarantineQty: 0,
  leadTimeDays: 21,
  required: 5,
  shortage: 5,
};

const baseDef: BuildDef = {
  id: 'build-1',
  projectId: 'proj-1',
  name: 'Build 1',
  type: 'EVT',
  units: 1,
  bomRev: 'BOM A',
  scrapPct: 0,
  milestone: 'Build 1 Complete',
  status: 'planned',
  assignee: null,
};

describe('buildFromDef', () => {
  it('does not fabricate a target date or lateness when the def has none', () => {
    const build = buildFromDef(baseDef, [shortLine]);
    expect(build.targetDate).toBeNull();
    expect(build.daysLate).toBe(0);
    expect(build.shortLines).toHaveLength(1);
  });

  it('projects ready = today + the longest-lead shorted line lead time', () => {
    const build = buildFromDef(baseDef, [shortLine]);
    const projected = new Date(build.projectedDate);
    const expected = new Date();
    expected.setDate(expected.getDate() + 21);
    // same calendar day (allow for the ms between the two `new Date()` calls)
    expect(projected.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
  });

  it('computes daysLate from a real target date once it is set', () => {
    const target = new Date();
    target.setDate(target.getDate() + 5); // projected (+21d) lands 16 days past this
    const build = buildFromDef({ ...baseDef, targetDate: target.toISOString() }, [shortLine]);
    expect(build.targetDate).toBe(target.toISOString());
    expect(build.daysLate).toBe(16);
  });

  it('formats projected ready with a year only when it is not the current year', () => {
    const thisYear = new Date().getFullYear();
    expect(formatShortDate(`${thisYear}-03-08T00:00:00.000Z`)).not.toMatch(/\d{4}/);
    expect(formatShortDate(`${thisYear + 2}-03-08T00:00:00.000Z`)).toMatch(new RegExp(String(thisYear + 2)));
  });

  it('keeps daysLate at 0 when a target is set but nothing is short', () => {
    const target = new Date();
    target.setDate(target.getDate() - 30); // target in the past, but build is clear
    const covered: BuildBomLine = { ...shortLine, onHand: 5, shortage: 0 };
    const build = buildFromDef({ ...baseDef, targetDate: target.toISOString() }, [covered]);
    expect(build.shortLines).toHaveLength(0);
    expect(build.daysLate).toBe(0);
  });

  it('holds quarantined on-hand out of a build line\'s available stock', () => {
    // 24 on hand but all of it quarantined (e.g. sitting in the "Quarantine" location) —
    // the line must read short, not ready, matching the part-detail page.
    const quarantined: BuildBomLine = {
      ...shortLine, qtyPerUnit: 1, required: 1, shortage: 1,
      onHand: 24, quarantineQty: 24,
    };
    const build = buildFromDef(baseDef, [quarantined]);
    expect(build.lines[0].available).toBe(0);
    expect(build.lines[0].status).toBe('short');
    expect(build.shortLines).toHaveLength(1);
  });
});
