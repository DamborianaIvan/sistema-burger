import test from 'node:test';
import assert from 'node:assert/strict';
import { datosUsuario, numero, validarPassword } from './validaciones.js';

test('las contraseñas nuevas no se truncan silenciosamente en bcrypt', () => {
  assert.equal(validarPassword('a'.repeat(72)).length, 72);
  assert.throws(() => validarPassword('a'.repeat(73)));
  assert.throws(() => validarPassword('á'.repeat(37)));
  assert.throws(() => validarPassword('1234567'));
});

test('identidades y números rechazan objetos, booleanos y textos inválidos', () => {
  assert.throws(() => datosUsuario({ nombre: 'Nombre', nombreUsuario: { $ne: null }, email: 'a@b.com' }));
  assert.throws(() => datosUsuario({ nombre: 'Nombre', nombreUsuario: 'usuario', email: 'sin-email' }));
  for (const valor of [null, true, [], {}, '', ' ', '0x10', Infinity]) assert.throws(() => numero(valor, 'importe'));
  assert.equal(numero('12.50', 'importe'), 12.5);
});

