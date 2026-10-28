import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import Usuario from '../../models/Usuario.js';
import SesionRevocada from '../../models/SesionRevocada.js';
import {
  INTEGRATION_ENABLED, conectarBaseDePrueba, crearUsuario, desconectarBaseDePrueba,
  detenerServidorDePrueba, iniciarServidorDePrueba, limpiarUsuarios, loginComo,
  requestJson, authorization, baseUrl
} from './testSetup.js';

describe('integración: revocación de sesiones', { skip: !INTEGRATION_ENABLED }, () => {
  let admin;
  let usuario;
  before(async () => { await conectarBaseDePrueba(); await iniciarServidorDePrueba(); });
  beforeEach(async () => {
    await limpiarUsuarios();
    await crearUsuario();
    usuario = await crearUsuario({ nombreUsuario: 'cajero', email: 'cajero@test.com', rol: 'CAJERO' });
    admin = await loginComo('admin-test', 'password-admin-123');
  });
  after(async () => { await detenerServidorDePrueba(); await desconectarBaseDePrueba(); });
  const consultar = (token) => requestJson('/api/caja/actual', { headers: authorization(token) });
  const cambiar = (ruta, datos) => requestJson(`/api/usuarios/${usuario._id}${ruta}`, {
    method: 'PATCH', headers: authorization(admin.token), body: JSON.stringify(datos)
  });

  test('cambiar password revoca tokens previos y permite iniciar sesión con la nueva contraseña', async () => {
    const previo = await loginComo('cajero', 'password-admin-123');
    assert.equal((await consultar(previo.token)).response.status, 200);
    assert.equal((await cambiar('/password', { password: 'password-nueva-123' })).response.status, 200);
    assert.equal((await consultar(previo.token)).response.status, 401);
    const nuevo = await loginComo('cajero', 'password-nueva-123');
    assert.equal((await consultar(nuevo.token)).response.status, 200);
  });

  test('desactivar y reactivar un usuario no reactiva sus tokens anteriores', async () => {
    const previo = await loginComo('cajero', 'password-admin-123');
    await cambiar('/estado', { activo: false });
    await cambiar('/estado', { activo: true });
    assert.equal((await consultar(previo.token)).response.status, 401);
    const nuevo = await loginComo('cajero', 'password-admin-123');
    assert.equal((await consultar(nuevo.token)).response.status, 200);
  });

  test('cerrar sesión revoca solo ese token y no otra sesión iniciada en el mismo segundo', async () => {
    const primera = await loginComo('cajero', 'password-admin-123');
    const segunda = await loginComo('cajero', 'password-admin-123');
    assert.notEqual(primera.token, segunda.token);
    const r = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: authorization(primera.token) });
    assert.equal(r.status, 204);
    assert.equal((await consultar(primera.token)).response.status, 401);
    assert.equal((await consultar(segunda.token)).response.status, 200);
    const revocada = await SesionRevocada.findOne().lean();
    assert.equal(revocada._id.length, 64);
    assert.equal(revocada._id.includes(primera.token), false);
    assert.equal(revocada.expira.getTime(), jwt.decode(primera.token).exp * 1000);
  });

  test('los tokens anteriores al despliegue se invalidan cuando cambia la contraseña', async () => {
    const anterior = jwt.sign({ id: String(usuario._id), rol: 'CAJERO' }, config.jwtSecret, { expiresIn: '1h' });
    assert.equal((await consultar(anterior)).response.status, 200);
    await cambiar('/password', { password: 'password-nueva-123' });
    assert.equal((await consultar(anterior)).response.status, 401);
  });

  test('cambiar el rol exige una nueva sesión y no permite reutilizar el token al restaurar el rol', async () => {
    const anterior = await loginComo('cajero', 'password-admin-123');
    await cambiar('', { rol: 'CHEF' });
    await cambiar('', { rol: 'CAJERO' });
    assert.equal((await consultar(anterior.token)).response.status, 401);
    assert.equal((await Usuario.findById(usuario._id)).versionSesion, 2);
  });
});

