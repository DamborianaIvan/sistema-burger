import test from 'node:test';
import assert from 'node:assert/strict';
import { pedidoOperativo } from './pedidoOperativo.js';

const pedido = {
  _id: 'pedido-1', tipoPedido: 'SALON', estadoPedido: 'EN_COCINA',
  fechaPedido: '2026-10-28T12:00:00Z', comentario: 'Sin sal',
  mesaId: { _id: 'mesa-1', numero: 3, nombre: 'Patio' },
  nombreCliente: 'Cliente', telefono: '123', direccion: 'Domicilio',
  total: 2000, pagos: [{ monto: 2000 }], estadoPago: 'PAGADO', usuarioId: 'usuario-1',
  productos: [{ productoId: 'producto-1', nombreSnapshot: 'Muzzarella', categoriaSnapshot: 'Pizzas', cantidad: 2, precioUnitario: 1000, subtotal: 2000 }],
};

test('CHEF recibe la categoría del producto sin datos financieros ni del cliente', () => {
  const resultado = pedidoOperativo({ toObject: () => pedido }, 'CHEF');
  assert.deepEqual(resultado.productos, [{ productoId: 'producto-1', nombreSnapshot: 'Muzzarella', categoriaSnapshot: 'Pizzas', cantidad: 2 }]);
  assert.deepEqual(resultado.mesaId, pedido.mesaId);
  for (const campo of ['total', 'pagos', 'estadoPago', 'usuarioId', 'nombreCliente', 'telefono', 'direccion']) {
    assert.equal(Object.hasOwn(resultado, campo), false, campo);
  }
});

test('CHEF conserva pedidos antiguos que no tienen categoría', () => {
  const resultado = pedidoOperativo({ ...pedido, productos: [{ nombreSnapshot: 'Pizza', cantidad: 1 }] }, 'CHEF');
  assert.equal(resultado.productos[0].categoriaSnapshot, null);
  assert.equal(resultado.productos[0].nombreSnapshot, 'Pizza');
});

test('DELIVERY conserva su respuesta de entrega sin nuevos campos ni precios', () => {
  const resultado = pedidoOperativo(pedido, 'DELIVERY');
  assert.deepEqual(resultado.productos, [{ productoId: 'producto-1', nombreSnapshot: 'Muzzarella', cantidad: 2 }]);
  assert.equal(resultado.direccion, pedido.direccion);
  assert.equal(resultado.total, undefined);
});

test('ADMIN y CAJERO conservan el pedido completo', () => {
  for (const rol of ['ADMIN', 'CAJERO']) assert.equal(pedidoOperativo(pedido, rol), pedido);
});

