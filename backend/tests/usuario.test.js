import test from 'node:test';
import assert from 'node:assert/strict';
import Usuario from '../models/Usuario.js';
import { ROLES } from '../constants/roles.js';

test('Usuario defaults to an active account', () => {
  const usuario = new Usuario({
    nombre: 'Usuario Test',
    nombreUsuario: 'usuario-test',
    email: 'usuario-test@example.com',
    password: 'password-test',
    rol: ROLES.CAJERO
  });

  assert.equal(usuario.activo, true);
  assert.equal(usuario.rol, ROLES.CAJERO);
});

