import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import Usuario from '../models/Usuario.js';
import SesionRevocada from '../models/SesionRevocada.js';

// Este proceso prueba el perfil real de la hamburguesería; la regresión general
// usa test.env para seguir cubriendo el salón conservado.
process.env.ORDER_TYPES = 'DELIVERY,TAKEAWAY';
process.env.ENABLE_PREPIZZAS = 'false';
process.env.CORS_ORIGINS = 'http://localhost:5174';
process.env.JWT_SECRET = 'synthetic-test-secret-for-burger-order-modes';
const { default: app } = await import('../server.js');
const originalUsuario = Usuario.findById;
const originalRevocada = SesionRevocada.exists;
let server;
let base;
let rol = 'ADMIN';
const id = '507f1f77bcf86cd799439011';

before(async () => {
  Usuario.findById = async () => ({ _id: id, rol, nombre: 'Operador de prueba', activo: true, versionSesion: 0 });
  SesionRevocada.exists = async () => false;
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  Usuario.findById = originalUsuario;
  SesionRevocada.exists = originalRevocada;
  await new Promise(resolve => server.close(resolve));
});

const crear = (autenticado = true) => fetch(`${base}/api/pedidos`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(autenticado ? { Authorization: `Bearer ${jwt.sign({ id, sv: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' })}` } : {})
  },
  body: JSON.stringify({ tipoPedido: 'SALON', mesaId: id, productos: [{ productoId: id, cantidad: 1 }] })
});

test('la API rechaza salón aun si se fuerza el formulario y antes de acceder a MongoDB', async () => {
  for (const perfil of ['ADMIN', 'CAJERO']) {
    rol = perfil;
    const respuesta = await crear();
    assert.equal(respuesta.status, 409);
    assert.match(JSON.stringify(await respuesta.json()), /modalidad de atención no está habilitada/);
  }
});

test('la configuración comercial no evita autenticación ni permisos', async () => {
  assert.equal((await crear(false)).status, 401);
  for (const perfil of ['CHEF', 'DELIVERY']) {
    rol = perfil;
    assert.equal((await crear()).status, 403);
  }
});

test('el circuito deshabilitado no está disponible aunque se invoque directamente', async () => {
  assert.equal((await fetch(`${base}/api/prepizzas/resumen`)).status, 404);
  assert.equal((await fetch(`${base}/api/prepizzas/variedades`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'No permitido', precio: 100 })
  })).status, 404);
});

test('preflight autoriza el origen configurado y no abre CORS para otros puertos', async () => {
  for (const origin of ['http://localhost:5174', 'http://localhost:5173']) {
    const respuesta = await fetch(`${base}/api/auth/register`, {
      method: 'OPTIONS', headers: {
        Origin: origin, 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    assert.equal(respuesta.status, 204);
    assert.equal(respuesta.headers.get('access-control-allow-origin'),
      origin.endsWith(':5174') ? origin : null);
  }
});
