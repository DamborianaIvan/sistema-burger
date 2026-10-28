export const ROLES = {
  ADMIN: 'ADMIN',
  CAJERO: 'CAJERO',
  CHEF: 'CHEF',
  DELIVERY: 'DELIVERY',
} as const;

export type Rol = (typeof ROLES)[keyof typeof ROLES];

export const ROLES_VALUES = Object.values(ROLES) as Rol[];

export const ETIQUETAS_ROL: Record<Rol, string> = {
  ADMIN: 'Administrador',
  CAJERO: 'Cajero',
  CHEF: 'Cocina',
  DELIVERY: 'Delivery',
};

export const PERMISSIONS = {
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
  USERS_MANAGE: 'users:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSIONS_BY_ROLE: Record<Rol, readonly Permission[]> = {
  ADMIN: [
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_EDIT,
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.ORDERS_CHANGE_STATUS,
    PERMISSIONS.CASH_OPEN,
    PERMISSIONS.CASH_CLOSE,
    PERMISSIONS.CASH_CHARGE,
    PERMISSIONS.STOCK_ADJUST,
    PERMISSIONS.PRODUCTS_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.PREPIZZAS_OPERATE,
    PERMISSIONS.USERS_MANAGE,
  ],
  CAJERO: [
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_EDIT,
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.ORDERS_CHANGE_STATUS,
    PERMISSIONS.CASH_OPEN,
    PERMISSIONS.CASH_CLOSE,
    PERMISSIONS.CASH_CHARGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.PREPIZZAS_OPERATE,
  ],
  CHEF: [
    PERMISSIONS.ORDERS_CHANGE_STATUS,
  ],
  DELIVERY: [],
};

export const isValidRol = (rol: unknown): rol is Rol =>
  typeof rol === 'string' && ROLES_VALUES.includes(rol as Rol);

export const hasPermission = (rol: Rol, permission: Permission): boolean =>
  PERMISSIONS_BY_ROLE[rol].includes(permission);


