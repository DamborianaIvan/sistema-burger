import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS, PERMISSIONS_BY_ROLE, hasPermission, isValidPermission } from './permissions.js';
import { ROLES } from './roles.js';

test('todos los roles tienen una matriz de permisos definida', () => {
  for (const role of Object.values(ROLES)) {
    assert.ok(Array.isArray(PERMISSIONS_BY_ROLE[role]));
  }
});

test('ADMIN tiene todos los permisos definidos', () => {
  assert.deepEqual(
    PERMISSIONS_BY_ROLE[ROLES.ADMIN],
    Object.values(PERMISSIONS)
  );
});

test('CAJERO tiene permisos operativos de pedidos, caja y reportes', () => {
  assert.equal(hasPermission(ROLES.CAJERO, PERMISSIONS.ORDERS_CREATE), true);
  assert.equal(hasPermission(ROLES.CAJERO, PERMISSIONS.ORDERS_EDIT), true);
  assert.equal(hasPermission(ROLES.CAJERO, PERMISSIONS.ORDERS_CANCEL), true);
  assert.equal(hasPermission(ROLES.CAJERO, PERMISSIONS.ORDERS_CHANGE_STATUS), true);
  assert.equal(hasPermission(ROLES.CAJERO, PERMISSIONS.CASH_OPEN), true);
  assert.equal(hasPermission(ROLES.CAJERO, PERMISSIONS.CASH_CLOSE), true);
  assert.equal(hasPermission(ROLES.CAJERO, PERMISSIONS.REPORTS_VIEW), true);
  assert.equal(hasPermission(ROLES.CAJERO, PERMISSIONS.PRODUCTS_MANAGE), false);
});

test('CHEF solo tiene cambio de estado de pedidos', () => {
  assert.equal(hasPermission(ROLES.CHEF, PERMISSIONS.ORDERS_CHANGE_STATUS), true);
  assert.equal(hasPermission(ROLES.CHEF, PERMISSIONS.ORDERS_CREATE), false);
  assert.equal(hasPermission(ROLES.CHEF, PERMISSIONS.CASH_OPEN), false);
  assert.equal(hasPermission(ROLES.CHEF, PERMISSIONS.REPORTS_VIEW), false);
});

test('DELIVERY no recibe permisos genericos del panel', () => {
  assert.deepEqual(PERMISSIONS_BY_ROLE[ROLES.DELIVERY], []);
  assert.equal(hasPermission(ROLES.DELIVERY, PERMISSIONS.ORDERS_CHANGE_STATUS), false);
  assert.equal(hasPermission(ROLES.DELIVERY, PERMISSIONS.ORDERS_CREATE), false);
  assert.equal(hasPermission(ROLES.DELIVERY, PERMISSIONS.CASH_OPEN), false);
  assert.equal(hasPermission(ROLES.DELIVERY, PERMISSIONS.REPORTS_VIEW), false);
});

test('isValidPermission distingue permisos configurados de valores desconocidos', () => {
  assert.equal(isValidPermission(PERMISSIONS.ORDERS_CREATE), true);
  assert.equal(isValidPermission('orders:unknown'), false);
});

