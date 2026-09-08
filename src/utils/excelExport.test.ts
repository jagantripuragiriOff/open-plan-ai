import { describe, it, expect } from 'vitest';
import { parseBomCsv } from './excelExport';

const HEADER =
  'Part Number,Part Name,Description,Category,Quantity,Unit,Status,Manufacturer,Distributor,MPN,Price,Lead Time (Days),Revision,Owner,Level,Requirements';

describe('parseBomCsv', () => {
  it('maps every column to the right field, including Level', () => {
    const csv = [
      HEADER,
      'HHBS,Hbbsjs,A hall sensor board,power,2,EA,approved,Acme Inc,Digi-Key,MPN-1,97.00,42,B,Rajesh Birlangi,0,PWR-001',
    ].join('\n');

    const [row] = parseBomCsv(csv);

    expect(row).toEqual({
      partNumber: 'HHBS',
      name: 'Hbbsjs',
      description: 'A hall sensor board',
      category: 'power',
      quantity: 2,
      unit: 'EA',
      status: 'approved',
      manufacturer: 'Acme Inc',
      distributor: 'Digi-Key',
      mpn: 'MPN-1',
      price: 97,
      leadTime: 42,
      revision: 'B',
      owner: 'Rajesh Birlangi',
      level: '0',
      requirements: 'PWR-001',
    });
  });

  it('handles quoted fields containing commas', () => {
    const csv = [
      HEADER,
      '"CMP-03, rev2","Rajesh, Jr.","Cap, 10uF","power",1,EA,approved,"Wurth, Elektronik",,,"314.66",,C,Sai Varanasi,2,none',
    ].join('\n');

    const [row] = parseBomCsv(csv);

    expect(row.partNumber).toBe('CMP-03, rev2');
    expect(row.name).toBe('Rajesh, Jr.');
    expect(row.description).toBe('Cap, 10uF');
    expect(row.manufacturer).toBe('Wurth, Elektronik');
    expect(row.price).toBe(314.66);
    expect(row.leadTime).toBeNull();
    expect(row.level).toBe('2');
  });

  it('skips blank lines and rows with no part number', () => {
    const csv = [HEADER, '', ',,,,,,,,,,,,,,,', 'P1,Name,,misc,1,EA,draft,,,,,,,,1,none'].join('\n');
    expect(parseBomCsv(csv)).toHaveLength(1);
  });
});
