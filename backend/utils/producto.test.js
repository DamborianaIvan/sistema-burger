import test from 'node:test';
import assert from 'node:assert/strict';
import { datosProducto, escaparRegex } from './producto.js';
import { productoRequiereArchivo } from './producto.js';

test('alta y edición de productos aplican los mismos límites de precio y tipos', () => {
  for (const precio of [null, true, '', ' ', {}, Infinity, 'Infinity', 1e308, -1, 0]) {
    assert.throws(() => datosProducto({ nombre: 'Pizza', precio }));
    assert.throws(() => datosProducto({ precio }, true));
  }
  assert.throws(() => datosProducto({ nombre: 'Pizza', precio: 100, disponible: 'false' }));
  assert.deepEqual(datosProducto({ precio: '123.45' }, true), { precio: 123.45 });
});

test('los nombres con caracteres de regex se buscan literalmente', () => {
  const nombre = 'Pizza (especial)+ [grande]';
  const regex = new RegExp(`^${escaparRegex(nombre)}$`, 'i');
  assert.equal(regex.test(nombre), true);
  assert.equal(regex.test('Pizza especial grande'), false);
});

test('producto con pedidos históricos requiere archivo', () => {
  assert.equal(productoRequiereArchivo({ tienePedidos: true, tieneReceta: false }), true);
});

test('producto con receta requiere archivo', () => {
  assert.equal(productoRequiereArchivo({ tienePedidos: false, tieneReceta: true }), true);
});

test('producto sin referencias puede eliminarse físicamente', () => {
  assert.equal(productoRequiereArchivo({ tienePedidos: false, tieneReceta: false }), false);
});


