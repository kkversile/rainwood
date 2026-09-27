import { FolioChargeCategory, StaffDepartment } from '@prisma/client';

// Temporary rule: date overlap plus CONFIRMED/MODIFIED is the safest status signal
// available until the PMS exposes EXPECTED/CHECKED_IN/CHECKED_OUT lifecycle state.
// This does not prove that the guest physically checked in.
export const STAFF_OPERATIONAL_STATUSES = ['CONFIRMED', 'MODIFIED'] as const;

const rules: Record<StaffDepartment, readonly FolioChargeCategory[]> = {
  FOOD_BEVERAGE: ['FOOD_AND_BEVERAGE', 'ROOM_SERVICE', 'MINIBAR', 'OTHER'],
  HOUSEKEEPING: [],
  ROOM_SERVICE: ['FOOD_AND_BEVERAGE', 'ROOM_SERVICE', 'MINIBAR', 'OTHER'],
  FRONT_OFFICE: ['EXTRA_BED', 'TRANSPORT', 'ACTIVITY', 'SPA', 'EARLY_CHECKIN', 'LATE_CHECKOUT', 'ROOM_UPGRADE', 'OTHER'],
  OTHER: ['OTHER'],
};

export function allowedStaffFolioCategories(department?: StaffDepartment | null) {
  return department ? rules[department] : [];
}
