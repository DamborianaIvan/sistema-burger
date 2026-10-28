import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { TIPOS_PEDIDO } from '../constants/pedido.js';
import { ApiError } from './apiError.js';
import {
  calcularTotalPedido,
  normalizarProductosEdicionPedido,
  normalizarProductosPedido,
  validarDatosClientePedido
} from './pedido.js';

const productoId = new mongoose.Types.ObjectId();

const productoDisponible = {
  _id: productoId,
  nombre: 'Pizza Margherita',
  categoria: 'HAMBURGUESAS',
  precio: 8500,
  disponible: true
};

test('delivery requiere nombre, teléfono y dirección', () => {
  assert.doesNotThrow(() => validarDatosClientePedido({
    tipoPedido: TIPOS_PEDIDO.DELIVERY,
    nombreCliente: 'Ana',
    telefono: '123456',
    direccion: 'Calle 123'
  }));

  assert.throws(
    () => validarDatosClientePedido({
      tipoPedido: TIPOS_PEDIDO.DELIVERY,
      nombreCliente: 'Ana',
      telefono: '',
      direccion: 'Calle 123'
    }),
    (error) => error instanceof ApiError && error.statusCode === 400
  );
});

test('takeaway requiere nombre y teléfono', () => {
  assert.doesNotThrow(() => validarDatosClientePedido({
    tipoPedido: TIPOS_PEDIDO.TAKEAWAY,
    nombreCliente: 'Ana',
    telefono: '123456'
  }));

  assert.throws(
    () => validarDatosClientePedido({
      tipoPedido: TIPOS_PEDIDO.TAKEAWAY,
      nombreCliente: 'Ana',
      telefono: ' '
    }),
    (error) => error instanceof ApiError && error.statusCode === 400
  );
});

test('salón no exige datos de cliente', () => {
  assert.doesNotThrow(() => validarDatosClientePedido({
    tipoPedido: TIPOS_PEDIDO.SALON
  }));
});

test('normaliza productos usando precio y nombre del producto persistido', () => {
  const resultado = normalizarProductosPedido(
    [{ productoId: productoId.toString(), cantidad: 2, precio: 1 }],
    [productoDisponible]
  );

  assert.deepEqual(resultado[0], {
    productoId,
    nombreSnapshot: 'Pizza Margherita',
    categoriaSnapshot: 'HAMBURGUESAS',
    cantidad: 2,
    precioUnitario: 8500,
    subtotal: 17000
  });
  assert.equal(calcularTotalPedido(resultado), 17000);
});

test('rechaza producto inexistente o no disponible', () => {
  const inexistente = new mongoose.Types.ObjectId();

  assert.throws(
    () => normalizarProductosPedido(
      [{ productoId: inexistente.toString(), cantidad: 1 }],
      [productoDisponible]
    ),
    (error) => error instanceof ApiError && error.statusCode === 404
  );

  assert.throws(
    () => normalizarProductosPedido(
      [{ productoId: productoId.toString(), cantidad: 1 }],
      [{ ...productoDisponible, disponible: false }]
    ),
    (error) => error instanceof ApiError && error.statusCode === 409
  );
});

test('rechaza cantidades no enteras o menores a uno', () => {
  assert.throws(
    () => normalizarProductosPedido(
      [{ productoId: productoId.toString(), cantidad: 1.5 }],
      [productoDisponible]
    ),
    (error) => error instanceof ApiError && error.statusCode === 400
  );

  assert.throws(
    () => normalizarProductosPedido(
      [{ productoId: productoId.toString(), cantidad: 0 }],
      [productoDisponible]
    ),
    (error) => error instanceof ApiError && error.statusCode === 400
  );
});


test('edición conserva snapshot y precio histórico de productos existentes', () => {
  const pedido = {
    productos: [{
      productoId,
      nombreSnapshot: 'Pizza Margherita',
      categoriaSnapshot: 'HAMBURGUESAS',
      cantidad: 1,
      precioUnitario: 8000,
      subtotal: 8000
    }]
  };

  const resultado = normalizarProductosEdicionPedido(
    [{ productoId: productoId.toString(), cantidad: 3 }],
    pedido,
    [{ ...productoDisponible, precio: 9500, nombre: 'Pizza Margherita XL' }]
  );

  assert.deepEqual(resultado[0], {
    productoId,
    nombreSnapshot: 'Pizza Margherita',
    categoriaSnapshot: 'HAMBURGUESAS',
    cantidad: 3,
    precioUnitario: 8000,
    subtotal: 24000
  });
});

test('edición toma snapshot y precio actuales al agregar un producto nuevo', () => {
  const nuevoProductoId = new mongoose.Types.ObjectId();
  const nuevoProducto = {
    _id: nuevoProductoId,
    nombre: 'Empanada',
    categoria: 'ACOMPANAMIENTOS',
    precio: 2200,
    disponible: true
  };

  const resultado = normalizarProductosEdicionPedido(
    [{ productoId: nuevoProductoId.toString(), cantidad: 2 }],
    { productos: [] },
    [nuevoProducto]
  );

  assert.deepEqual(resultado[0], {
    productoId: nuevoProductoId,
    nombreSnapshot: 'Empanada',
    categoriaSnapshot: 'ACOMPANAMIENTOS',
    cantidad: 2,
    precioUnitario: 2200,
    subtotal: 4400
  });
});

test('edición rechaza productos repetidos y cantidades inválidas', () => {
  const items = [
    { productoId: productoId.toString(), cantidad: 1 },
    { productoId: productoId.toString(), cantidad: 2 }
  ];

  assert.throws(
    () => normalizarProductosEdicionPedido(items, { productos: [] }, [productoDisponible]),
    (error) => error instanceof ApiError && error.statusCode === 400
  );

  assert.throws(
    () => normalizarProductosEdicionPedido(
      [{ productoId: productoId.toString(), cantidad: 0 }],
      { productos: [] },
      [productoDisponible]
    ),
    (error) => error instanceof ApiError && error.statusCode === 400
  );
});

test('rechaza cantidades extremas, booleanos, objetos y totales que exceden el máximo', () => {
  for (const cantidad of [1e308, Number.MAX_SAFE_INTEGER, true, {}, null, '', ' ', 1000001]) {
    assert.throws(() => normalizarProductosPedido([{ productoId: String(productoId), cantidad }], [productoDisponible]));
  }
  assert.throws(() => calcularTotalPedido([{ subtotal: Infinity }]));
  assert.throws(() => calcularTotalPedido([{ subtotal: 100000001 }]));
  assert.equal(calcularTotalPedido([{ subtotal: 0.1 }, { subtotal: 0.2 }]), 0.3);
});

test('creación rechaza productos duplicados, listas excesivas y textos fuera de límite', () => {
  const item = { productoId: String(productoId), cantidad: 1 };
  assert.throws(() => normalizarProductosPedido([item, item], [productoDisponible]));
  assert.throws(() => normalizarProductosPedido(Array(101).fill(item), [productoDisponible]));
  assert.throws(() => validarDatosClientePedido({ tipoPedido: 'SALON', nombreCliente: {} }));
  assert.throws(() => validarDatosClientePedido({ tipoPedido: 'SALON', comentario: 'x'.repeat(1001) }));
});


