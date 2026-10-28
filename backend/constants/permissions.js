import { ROLES } from './roles.js';

export const PERMISSIONS = Object.freeze({
  ORDERS_CREATE: 'orders:create',
  ORDERS_EDIT: 'orders:edit',
  ORDERS_CANCEL: 'orders:cancel',
  ORDERS_CHANGE_STATUS: 'orders:change_status',
  CASH_OPEN: 'cash:open',
  CASH_CLOSE: 'cash:close',
  CASH_CHARGE: 'cash:charge',
  PREPIZZAS_OPERATE: 'prepizzas:operate',
  STOCK_ADJUST: 'stock:adjust',
  PRODUCTS_MANAGE: 'products:manage',
  REPORTS_VIEW: 'reports:view',
  USERS_MANAGE: 'users:manage'
});

export const PERMISSIONS_VALUES = Object.freeze(Object.values(PERMISSIONS));

export const PERMISSIONS_BY_ROLE = Object.freeze({
  [ROLES.ADMIN]: Object.freeze([...PERMISSIONS_VALUES]),
  [ROLES.CAJERO]: Object.freeze([
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_EDIT,
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.ORDERS_CHANGE_STATUS,
    PERMISSIONS.CASH_OPEN,
    PERMISSIONS.CASH_CLOSE,
    PERMISSIONS.CASH_CHARGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.PREPIZZAS_OPERATE
  ]),
  [ROLES.CHEF]: Object.freeze([
    PERMISSIONS.ORDERS_CHANGE_STATUS
  ]),
  [ROLES.DELIVERY]: Object.freeze([])
});

export const hasPermission = (role, permission) =>
  Boolean(PERMISSIONS_BY_ROLE[role]?.includes(permission));

export const isValidPermission = (permission) =>
  PERMISSIONS_VALUES.includes(permission);


