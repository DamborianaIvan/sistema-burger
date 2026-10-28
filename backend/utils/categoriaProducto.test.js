import test from 'node:test';
import assert from 'node:assert/strict';
import {
  esNombreCategoriaProductoValido,
  normalizarNombreCategoriaProducto
} from './categoriaProducto.js';

test('normaliza nombres de categorías', () => {
  assert.equal(
    normalizarNombreCategoriaProducto('  pizzas   especiales  '),
    'PIZZAS ESPECIALES'
  );
});

test('acepta nombres de categoría entre 2 y 40 caracteres', () => {
  assert.equal(esNombreCategoriaProductoValido('PASTAS'), true);
  assert.equal(esNombreCategoriaProductoValido('A'), false);
  assert.equal(esNombreCategoriaProductoValido('X'.repeat(41)), false);
});

