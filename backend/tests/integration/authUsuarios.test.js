import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import Usuario from '../../models/Usuario.js';
import {
  INTEGRATION_ENABLED,
  authorization,
  conectarBaseDePrueba,
  crearUsuario,
  desconectarBaseDePrueba,
  detenerServidorDePrueba,
  iniciarServidorDePrueba,
  limpiarUsuarios,
  loginComo,
  requestJson
} from './testSetup.js';

describe('integración: autenticación y gestión de usuarios', { skip: !INTEGRATION_ENABLED }, () => {
  before(async () => {
    await conectarBaseDePrueba();
    await iniciarServidorDePrueba();
  });

  beforeEach(async () => {
    await limpiarUsuarios();
  });

  after(async () => {
    await detenerServidorDePrueba();
    await desconectarBaseDePrueba();
  });

  test('register crea el primer usuario como ADMIN', async () => {
    const { response, body } = await requestJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        nombre: 'Admin Inicial',
        nombreUsuario: 'admin-inicial',
        email: 'admin-inicial@example.com',
        password: 'password-admin-123'
      })
    });

    assert.equal(response.status, 201);
    assert.equal(body.message, 'Usuario administrador creado con éxito');

    const usuario = await Usuario.findOne({ nombreUsuario: 'admin-inicial' }).select('+password');
    assert.equal(usuario.rol, 'ADMIN');
    assert.equal(usuario.activo, true);
    assert.notEqual(usuario.password, 'password-admin-123');
    assert.equal(await bcrypt.compare('password-admin-123', usuario.password), true);
  });

  test('register queda cerrado después de crear el primer usuario', async () => {
    await crearUsuario();

    const { response, body } = await requestJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        nombre: 'Segundo Usuario',
        nombreUsuario: 'segundo',
        email: 'segundo@example.com',
        password: 'password-123'
      })
    });

    assert.equal(response.status, 403);
    assert.equal(body.error.message, 'El registro público está cerrado');
  });

  test('protect rechaza un JWT válido cuando el usuario no existe', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const { config } = await import('../../config.js');
    const token = jwt.sign({ id: '000000000000000000000000', rol: 'ADMIN' }, config.jwtSecret, {
      expiresIn: '1h'
    });

    const { response, body } = await requestJson('/api/usuarios', {
      headers: authorization(token)
    });

    assert.equal(response.status, 401);
    assert.equal(body.error.details.reason, 'INACTIVE_USER');
  });

  test('login devuelve JWT para un usuario activo', async () => {
    await crearUsuario();

    const body = await loginComo('admin-test', 'password-admin-123');

    assert.equal(typeof body.token, 'string');
    assert.ok(body.token.length > 20);
    assert.equal(body.rol, 'ADMIN');
    assert.equal(body.nombre, 'Administrador Test');
  });

  test('login rechaza credenciales incorrectas', async () => {
    await crearUsuario();

    const { response, body } = await requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        nombreUsuario: 'admin-test',
        password: 'password-incorrecta'
      })
    });

    assert.equal(response.status, 401);
    assert.equal(body.error.message, 'Usuario o contraseña incorrectos');
  });

  test('login rechaza usuarios inactivos', async () => {
    await crearUsuario({ activo: false });

    const { response, body } = await requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        nombreUsuario: 'admin-test',
        password: 'password-admin-123'
      })
    });

    assert.equal(response.status, 401);
    assert.equal(body.error.message, 'Usuario o contraseña incorrectos');
  });

  test('ADMIN puede crear un usuario CAJERO y la respuesta no expone password', async () => {
    await crearUsuario();
    const admin = await loginComo('admin-test', 'password-admin-123');

    const { response, body } = await requestJson('/api/usuarios', {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({
        nombre: 'Cajero Test',
        nombreUsuario: 'cajero-test',
        email: 'cajero-test@example.com',
        password: 'password-cajero-123',
        rol: 'CAJERO'
      })
    });

    assert.equal(response.status, 201);
    assert.equal(body.rol, 'CAJERO');
    assert.equal(body.activo, true);
    assert.equal(body.password, undefined);

    const cajero = await Usuario.findOne({ nombreUsuario: 'cajero-test' }).select('+password');
    assert.equal(cajero.rol, 'CAJERO');
    assert.equal(await bcrypt.compare('password-cajero-123', cajero.password), true);
  });

  test('CAJERO no puede gestionar usuarios', async () => {
    await crearUsuario({ nombreUsuario: 'admin-test', email: 'admin-test@example.com' });
    await Usuario.create({
      nombre: 'Cajero Test',
      nombreUsuario: 'cajero-test',
      email: 'cajero-test@example.com',
      password: 'password-cajero-123',
      rol: 'CAJERO'
    });

    const cajero = await loginComo('cajero-test', 'password-cajero-123');

    const { response, body } = await requestJson('/api/usuarios', {
      method: 'POST',
      headers: authorization(cajero.token),
      body: JSON.stringify({
        nombre: 'Otro Usuario',
        nombreUsuario: 'otro-usuario',
        email: 'otro-usuario@example.com',
        password: 'password-otro-123',
        rol: 'CAJERO'
      })
    });

    assert.equal(response.status, 403);
    assert.equal(body.error.details.reason, 'INSUFFICIENT_PERMISSION');
  });

  test('ADMIN puede cambiar el rol de otro usuario', async () => {
    await crearUsuario();
    const cajero = await Usuario.create({
      nombre: 'Cajero Test',
      nombreUsuario: 'cajero-test',
      email: 'cajero-test@example.com',
      password: 'password-cajero-123',
      rol: 'CAJERO'
    });
    const admin = await loginComo('admin-test', 'password-admin-123');

    const { response, body } = await requestJson(`/api/usuarios/${cajero._id}`, {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({ rol: 'CHEF' })
    });

    assert.equal(response.status, 200);
    assert.equal(body.rol, 'CHEF');
  });

  test('ADMIN no puede cambiar su propio rol', async () => {
    const adminUsuario = await crearUsuario();
    const admin = await loginComo('admin-test', 'password-admin-123');

    const { response, body } = await requestJson(`/api/usuarios/${adminUsuario._id}`, {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({ rol: 'CAJERO' })
    });

    assert.equal(response.status, 403);
    assert.equal(body.error.message, 'No puede cambiar su propio rol');
  });

  test('ADMIN no puede desactivarse a sí mismo', async () => {
    const adminUsuario = await crearUsuario();
    const admin = await loginComo('admin-test', 'password-admin-123');

    const { response, body } = await requestJson(`/api/usuarios/${adminUsuario._id}/estado`, {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({ activo: false })
    });

    assert.equal(response.status, 403);
    assert.equal(body.error.message, 'No puede desactivar su propio usuario');
  });

  test('no permite dejar el sistema sin un ADMIN activo', async () => {
    const adminUsuario = await crearUsuario();
    const otroAdmin = await Usuario.create({
      nombre: 'Segundo Admin',
      nombreUsuario: 'admin-dos',
      email: 'admin-dos@example.com',
      password: 'password-admin-456',
      rol: 'ADMIN'
    });
    const admin = await loginComo('admin-test', 'password-admin-123');

    const primera = await requestJson(`/api/usuarios/${otroAdmin._id}/estado`, {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({ activo: false })
    });
    assert.equal(primera.response.status, 200);
    assert.equal(
      await Usuario.countDocuments({ rol: 'ADMIN', activo: true }),
      1
    );

    const segunda = await requestJson(`/api/usuarios/${adminUsuario._id}/estado`, {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({ activo: false })
    });

    assert.equal(segunda.response.status, 403);
    assert.equal(segunda.body.error.message, 'No puede desactivar su propio usuario');
    assert.equal(
      await Usuario.countDocuments({ rol: 'ADMIN', activo: true }),
      1
    );
  });

  test('usuario desactivado deja de poder iniciar sesión', async () => {
    await crearUsuario();
    const cajero = await Usuario.create({
      nombre: 'Cajero Test',
      nombreUsuario: 'cajero-test',
      email: 'cajero-test@example.com',
      password: 'password-cajero-123',
      rol: 'CAJERO'
    });
    const admin = await loginComo('admin-test', 'password-admin-123');

    const desactivacion = await requestJson(`/api/usuarios/${cajero._id}/estado`, {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({ activo: false })
    });
    assert.equal(desactivacion.response.status, 200);

    const login = await requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        nombreUsuario: 'cajero-test',
        password: 'password-cajero-123'
      })
    });

    assert.equal(login.response.status, 401);
  });

  test('ADMIN puede cambiar la contraseña de otro usuario', async () => {
    await crearUsuario();
    const cajero = await Usuario.create({
      nombre: 'Cajero Test',
      nombreUsuario: 'cajero-test',
      email: 'cajero-test@example.com',
      password: 'password-cajero-123',
      rol: 'CAJERO'
    });
    const admin = await loginComo('admin-test', 'password-admin-123');

    const cambio = await requestJson(`/api/usuarios/${cajero._id}/password`, {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({ password: 'password-nueva-123' })
    });
    assert.equal(cambio.response.status, 200);

    const loginAnterior = await requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        nombreUsuario: 'cajero-test',
        password: 'password-cajero-123'
      })
    });
    assert.equal(loginAnterior.response.status, 401);

    const loginNuevo = await requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        nombreUsuario: 'cajero-test',
        password: 'password-nueva-123'
      })
    });
    assert.equal(loginNuevo.response.status, 200);
  });

  test('crear usuario rechaza rol inválido y contraseña corta', async () => {
    await crearUsuario();
    const admin = await loginComo('admin-test', 'password-admin-123');

    const rolInvalido = await requestJson('/api/usuarios', {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({
        nombre: 'Usuario Test',
        nombreUsuario: 'usuario-invalido',
        email: 'usuario-invalido@example.com',
        password: 'password-123',
        rol: 'SUPERADMIN'
      })
    });

    assert.equal(rolInvalido.response.status, 400);
    assert.equal(rolInvalido.body.error.details.field, 'rol');

    const passwordCorta = await requestJson('/api/usuarios', {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({
        nombre: 'Usuario Test',
        nombreUsuario: 'usuario-corto',
        email: 'usuario-corto@example.com',
        password: '1234567',
        rol: 'CAJERO'
      })
    });

    assert.equal(passwordCorta.response.status, 400);
    assert.equal(passwordCorta.body.error.details.field, 'password');
  });

  test('crear usuario rechaza username o email duplicados', async () => {
    await crearUsuario();
    const admin = await loginComo('admin-test', 'password-admin-123');

    const usernameDuplicado = await requestJson('/api/usuarios', {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({
        nombre: 'Otro Usuario',
        nombreUsuario: 'admin-test',
        email: 'otro@example.com',
        password: 'password-otro-123',
        rol: 'CAJERO'
      })
    });

    assert.equal(usernameDuplicado.response.status, 409);
    assert.equal(usernameDuplicado.body.error.code, 'DUPLICATE_RESOURCE');

    const emailDuplicado = await requestJson('/api/usuarios', {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({
        nombre: 'Otro Usuario',
        nombreUsuario: 'otro-usuario',
        email: 'admin-test@example.com',
        password: 'password-otro-123',
        rol: 'CAJERO'
      })
    });

    assert.equal(emailDuplicado.response.status, 409);
    assert.equal(emailDuplicado.body.error.code, 'DUPLICATE_RESOURCE');
  });
});

