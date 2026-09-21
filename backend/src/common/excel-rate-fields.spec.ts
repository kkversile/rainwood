import { mapImportedRateFields } from './excel-rate-fields';

describe('Excel rate field mapping', () => {
  it('keeps guest charges in scalar fields and only occupancy rates in JSON', () => {
    expect(mapImportedRateFields({ single: 3000, double: 3500, extraAdultAmount: 800, childAmount: 500 })).toEqual({ occupancyPrices: { single: 3000, double: 3500 }, extraAdultAmount: 800, childAmount: 500 });
  });
  it('returns null occupancy JSON when all occupancy cells are blank', () => {
    expect(mapImportedRateFields({ extraAdultAmount: 800 }).occupancyPrices).toBeNull();
  });
});
