import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS } from '../constants/permissions.js';
import { ROLES } from '../constants/roles.js';
import { requirePermission } from './auth.js';

const executeMiddleware = async (middleware, req) => {
  let nextError;
  let nextCalled = false;

  await middleware(req, {}, (error) => {
    nextCalled = true;
    nextError = error;
  });

  return { nextCalled, nextError };
};

test('requirePermission rechaza una request sin contexto de autenticación', async () => {
  const result = await executeMiddleware(
    requirePermission(PERMISSIONS.ORDERS_CREATE),
    {}
  );

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError.statusCode, 401);
  assert.equal(result.nextError.details.reason, 'MISSING_AUTH_CONTEXT');
});

test('requirePermission rechaza un permiso desconocido de configuración', async () => {
  const result = await executeMiddleware(
    requirePermission('orders:unknown'),
    { usuario: { rol: ROLES.ADMIN } }
  );

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError.statusCode, 500);
  assert.equal(result.nextError.details.reason, 'INVALID_PERMISSION');
});

test('requirePermission rechaza un rol sin el permiso requerido', async () => {
  const result = await executeMiddleware(
    requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
    { usuario: { rol: ROLES.CAJERO } }
  );

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError.statusCode, 403);
  assert.equal(result.nextError.details.reason, 'INSUFFICIENT_PERMISSION');
  assert.equal(result.nextError.details.permission, PERMISSIONS.PRODUCTS_MANAGE);
});

test('requirePermission permite un rol con el permiso requerido', async () => {
  const result = await executeMiddleware(
    requirePermission(PERMISSIONS.ORDERS_CREATE),
    { usuario: { rol: ROLES.CAJERO } }
  );

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
});

