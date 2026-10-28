import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import Usuario from '../models/Usuario.js';

// Los tests no deben depender de un .env local para firmar el JWT de prueba.
process.env.JWT_SECRET = 'test-secret-for-auth-middleware-32-chars-min';

const { config } = await import('../config.js');
const { protect, restrictTo } = await import('./auth.js');

const executeMiddleware = async (middleware, req) => {
  let nextError;
  let nextCalled = false;

  await middleware(req, {}, (error) => {
    nextCalled = true;
    nextError = error;
  });

  return { nextCalled, nextError };
};

test('protect rechaza requests sin token', async () => {
  const result = await executeMiddleware(protect, { headers: {} });

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError.statusCode, 401);
  assert.equal(result.nextError.details.reason, 'MISSING_TOKEN');
});

test('protect rechaza tokens inválidos', async () => {
  const result = await executeMiddleware(protect, {
    headers: { authorization: 'Bearer token-invalido' }
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError.statusCode, 401);
  assert.equal(result.nextError.details.reason, 'INVALID_TOKEN');
});

test('protect rechaza un JWT válido cuando el usuario no existe', async () => {
  const findByIdOriginal = Usuario.findById;
  Usuario.findById = async () => null;

  try {
    const token = jwt.sign({ id: '000000000000000000000000', rol: 'ADMIN' }, config.jwtSecret, {
      expiresIn: '1h'
    });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const result = await executeMiddleware(protect, req);

    assert.equal(result.nextCalled, true);
    assert.equal(result.nextError.statusCode, 401);
    assert.equal(result.nextError.details.reason, 'INACTIVE_USER');
  } finally {
    Usuario.findById = findByIdOriginal;
  }
});

test('restrictTo rechaza un rol no autorizado', async () => {
  const result = await executeMiddleware(restrictTo('ADMIN'), {
    usuario: { rol: 'CHEF' }
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError.statusCode, 403);
  assert.equal(result.nextError.details.reason, 'INSUFFICIENT_ROLE');
});

test('restrictTo permite un rol autorizado', async () => {
  const result = await executeMiddleware(restrictTo('ADMIN', 'CAJERO'), {
    usuario: { rol: 'CAJERO' }
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
});

test('una falla de la base no se presenta como token inválido ni confirma un logout', async () => {
  const original = Usuario.findById;
  Usuario.findById = async () => { throw new Error('Base no disponible'); };
  try {
    const token = jwt.sign({ id: '000000000000000000000000', rol: 'ADMIN' }, config.jwtSecret, { expiresIn: '1h' });
    const result = await executeMiddleware(protect, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(result.nextError.statusCode, 503);
  } finally { Usuario.findById = original; }
});


