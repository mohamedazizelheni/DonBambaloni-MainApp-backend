export const Role = Object.freeze({
    ADMIN: 'Admin',
    CHEF: 'Chef',
    CASHIER: 'Cashier',
    CLEANER: 'Cleaner',
    TRAINEE_CHEF: 'TraineeChef',
    DRIVER: 'Driver',
  });
  
  export const AvailabilityStatus = Object.freeze({
    AVAILABLE: 'Available',
    UNAVAILABLE: 'Unavailable',
  });
  
  export const ActionType = Object.freeze({
    ASSIGNED_TO_KITCHEN: 'AssignedToKitchen',
    UNASSIGNED_FROM_KITCHEN: 'UnassignedFromKitchen',
    ASSIGNED_TO_SHOP: 'AssignedToShop',
    UNASSIGNED_FROM_SHOP: 'UnassignedFromShop',
    AVAILABILITY_UPDATED: 'AvailabilityUpdated',
  });
  
  
  export const ShiftType = Object.freeze({
    MORNING: 'Morning',
    AFTERNOON: 'Afternoon',
    NIGHT: 'Night',
    BOTH: 'Both',
  });
  
  
  