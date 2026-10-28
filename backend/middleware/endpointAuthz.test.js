import test from 'node:test';
import assert from 'node:assert/strict';
import { requirePermission } from './auth.js';
import { ROLES } from '../constants/roles.js';
import { PERMISSIONS, hasPermission } from '../constants/permissions.js';

const authorizationError = async (middleware, role) => {
  let error;
  await middleware(
    { usuario: { rol: role } },
    {},
    (nextError) => { error = nextError; }
  );
  return error;
};

const endpointPolicies = {
  pedidosCreate: requirePermission(PERMISSIONS.ORDERS_CREATE),
  pedidosChangeStatus: requirePermission(PERMISSIONS.ORDERS_CHANGE_STATUS),
  productosManage: requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  stockAdjust: requirePermission(PERMISSIONS.STOCK_ADJUST)
};

test('pedidos: crear respeta orders:create', async () => {
  assert.equal(await authorizationError(endpointPolicies.pedidosCreate, ROLES.ADMIN), undefined);
  assert.equal(await authorizationError(endpointPolicies.pedidosCreate, ROLES.CAJERO), undefined);

  for (const role of [ROLES.CHEF, ROLES.DELIVERY]) {
    const error = await authorizationError(endpointPolicies.pedidosCreate, role);
    assert.equal(error.statusCode, 403);
    assert.equal(error.details.reason, 'INSUFFICIENT_PERMISSION');
  }
});

test('pedidos: cambio de estado generico respeta orders:change_status', async () => {
  for (const role of [ROLES.ADMIN, ROLES.CAJERO, ROLES.CHEF]) {
    assert.equal(await authorizationError(endpointPolicies.pedidosChangeStatus, role), undefined);
  }

  const deliveryError = await authorizationError(
    endpointPolicies.pedidosChangeStatus,
    ROLES.DELIVERY
  );
  assert.equal(deliveryError.statusCode, 403);
  assert.equal(deliveryError.details.reason, 'INSUFFICIENT_PERMISSION');
});

test('productos: administración respeta products:manage', async () => {
  assert.equal(await authorizationError(endpointPolicies.productosManage, ROLES.ADMIN), undefined);

  for (const role of [ROLES.CAJERO, ROLES.CHEF, ROLES.DELIVERY]) {
    const error = await authorizationError(endpointPolicies.productosManage, role);
    assert.equal(error.statusCode, 403);
    assert.equal(error.details.reason, 'INSUFFICIENT_PERMISSION');
  }
});

test('stock: ajuste respeta stock:adjust', async () => {
  assert.equal(await authorizationError(endpointPolicies.stockAdjust, ROLES.ADMIN), undefined);

  for (const role of [ROLES.CAJERO, ROLES.CHEF, ROLES.DELIVERY]) {
    const error = await authorizationError(endpointPolicies.stockAdjust, role);
    assert.equal(error.statusCode, 403);
    assert.equal(error.details.reason, 'INSUFFICIENT_PERMISSION');
  }
});

test('matriz de permisos: solo los roles definidos reciben cada permiso', () => {
  assert.equal(hasPermission(ROLES.ADMIN, PERMISSIONS.PRODUCTS_MANAGE), true);
  assert.equal(hasPermission(ROLES.CAJERO, PERMISSIONS.PRODUCTS_MANAGE), false);
  assert.equal(hasPermission(ROLES.CHEF, PERMISSIONS.ORDERS_CHANGE_STATUS), true);
  assert.equal(hasPermission(ROLES.DELIVERY, PERMISSIONS.ORDERS_CHANGE_STATUS), false);
});

