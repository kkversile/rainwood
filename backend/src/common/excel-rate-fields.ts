export type ImportedRateFields = { single?: number; double?: number; triple?: number; quad?: number; extraAdultAmount?: number; childAmount?: number };

export function mapImportedRateFields(fields: ImportedRateFields) {
  const occupancyPrices = Object.fromEntries(Object.entries(fields).filter(([key, value]) => ['single', 'double', 'triple', 'quad'].includes(key) && value !== undefined)) as Record<string, number>;
  return { occupancyPrices: Object.keys(occupancyPrices).length ? occupancyPrices : null, extraAdultAmount: fields.extraAdultAmount, childAmount: fields.childAmount };
}
