/** Guest-service posting follows the same department boundaries as the staff stay API. */
export const canUseStaffServiceOrders = (department?: string | null) => department === 'FOOD_BEVERAGE' || department === 'ROOM_SERVICE';
