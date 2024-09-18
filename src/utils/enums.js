export const Role = Object.freeze({
    ADMIN: 'Admin',
    CHEF: 'Chef',
    CASHIER: 'Cashier',
    CLEANER: 'Cleaner',
    TRAINEE_CHEF: 'TraineeChef',
    // Add other roles as needed
  });
  
  export const AvailabilityStatus = Object.freeze({
    AVAILABLE: 'Available',
    UNAVAILABLE: 'Unavailable',
  });
  
  export const ActionType = Object.freeze({
    ASSIGNED_TO_KITCHEN: 'AssignedToKitchen',
    ASSIGNED_TO_SHOP: 'AssignedToShop',
    AVAILABILITY_UPDATED: 'AvailabilityUpdated',
  });
  
  export const ShiftType = Object.freeze({
    MORNING: 'Morning',
    AFTERNOON: 'Afternoon',
    NIGHT: 'Night',
    BOTH: 'Both',
  });
  
  
  