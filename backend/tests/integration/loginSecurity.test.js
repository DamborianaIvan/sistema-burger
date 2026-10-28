import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import IntentoAcceso from '../../models/IntentoAcceso.js';
import Usuario from '../../models/Usuario.js';
import {
  INTEGRATION_ENABLED, conectarBaseDePrueba, crearUsuario, desconectarBaseDePrueba,
  detenerServidorDePrueba, iniciarServidorDePrueba, limpiarUsuarios, requestJson
} from './testSetup.js';

describe('integración: protección del acceso', { skip: !INTEGRATION_ENABLED }, () => {
  before(async () => { await conectarBaseDePrueba(); await IntentoAcceso.init(); await iniciarServidorDePrueba(); });
  beforeEach(limpiarUsuarios);
  after(async () => { await detenerServidorDePrueba(); await desconectarBaseDePrueba(); });
  const login = (nombreUsuario = 'admin-test', password = 'incorrecta') => requestJson('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ nombreUsuario, password })
  });

  test('rechaza operadores NoSQL y credenciales de tipos inválidos', async () => {
    await crearUsuario();
    for (const usuario of [{ $ne: null }, ['admin-test'], true, 12, ' ']) {
      assert.equal((await login(usuario, 'password-admin-123')).response.status, 400);
    }
    for (const password of [{ $ne: null }, true, [], 'x'.repeat(1025)]) {
      assert.equal((await login('admin-test', password)).response.status, 400);
    }
  });

  test('limita intentos por cuenta y devuelve Retry-After sin bloquear otras cuentas', async () => {
    await crearUsuario();
    for (let i = 0; i < 10; i++) assert.equal((await login()).response.status, 401);
    const bloqueado = await login('admin-test', 'password-admin-123');
    assert.equal(bloqueado.response.status, 429);
    assert.ok(Number(bloqueado.response.headers.get('retry-after')) > 0);
    assert.equal((await login('otra-cuenta')).response.status, 401);
    // Simula un nuevo proceso: el bloqueo no depende de memoria de la aplicación.
    assert.equal((await login()).response.status, 429);
  });

  test('los accesos exitosos no agotan el cupo de fallos por cuenta', async () => {
    await crearUsuario();
    for (let i = 0; i < 12; i++) assert.equal((await login('admin-test', 'password-admin-123')).response.status, 200);
    const cuentas = await IntentoAcceso.find({ _id: /^cuenta:/ });
    assert.ok(cuentas.every((c) => c.cantidad === 0));
  });

  test('la IP limita intentos aunque se cambie el nombre de usuario o X-Forwarded-For', async () => {
    const datos = { method: 'POST', body: '{}' };
    // Se precarga el contador, sin cien rondas de HTTP innecesarias.
    assert.equal((await requestJson('/api/auth/login', datos)).response.status, 400);
    await IntentoAcceso.updateMany({ _id: /^login-ip:/ }, { $set: { cantidad: 100 } });
    const r = await requestJson('/api/auth/login', { ...datos, headers: { 'x-forwarded-for': '8.8.8.8' } });
    assert.equal(r.response.status, 429);
  });

  test('el registro inicial valida password y email y solo admite un administrador concurrente', async () => {
    const datos = { nombre: 'Admin', nombreUsuario: 'primero', email: 'primero@test.com', password: 'password-123' };
    const registrar = (body) => requestJson('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
    assert.equal((await registrar({ ...datos, password: 'a' })).response.status, 400);
    assert.equal((await registrar({ ...datos, email: 'invalido' })).response.status, 400);
    const resultados = await Promise.all([
      registrar(datos), registrar({ ...datos, nombreUsuario: 'segundo', email: 'segundo@test.com' })
    ]);
    assert.deepEqual(resultados.map((r) => r.response.status).sort(), [201, 403]);
    assert.equal(await Usuario.countDocuments({}), 1);
  });
});

