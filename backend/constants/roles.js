export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  CAJERO: 'CAJERO',
  CHEF: 'CHEF',
  DELIVERY: 'DELIVERY'
});

export const ROLES_VALUES = Object.freeze(Object.values(ROLES));

export const isValidRole = (role) => ROLES_VALUES.includes(role);

