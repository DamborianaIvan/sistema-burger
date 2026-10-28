import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularConsumosPedido, redondearCantidadStock } from './stock.js';

test('calcularConsumosPedido multiplica receta por cantidad vendida y agrupa ingredientes', () => {
  const consumos = calcularConsumosPedido(
    [
      { productoId: 'producto-a', cantidad: 2 },
      { productoId: 'producto-b', cantidad: 1 }
    ],
    [
      {
        productoId: 'producto-a',
        activa: true,
        componentes: [
          { ingredienteId: 'harina', cantidad: 0.25 },
          { ingredienteId: 'queso', cantidad: 0.15 }
        ]
      },
      {
        productoId: 'producto-b',
        activa: true,
        componentes: [
          { ingredienteId: 'queso', cantidad: 0.1 }
        ]
      }
    ]
  );

  assert.deepEqual(consumos, [
    { ingredienteId: 'harina', cantidad: 0.5 },
    { ingredienteId: 'queso', cantidad: 0.4 }
  ]);
});

test('calcularConsumosPedido ignora productos sin receta y recetas inactivas', () => {
  const consumos = calcularConsumosPedido(
    [
      { productoId: 'producto-a', cantidad: 1 },
      { productoId: 'producto-b', cantidad: 1 }
    ],
    [
      {
        productoId: 'producto-a',
        activa: false,
        componentes: [{ ingredienteId: 'harina', cantidad: 1 }]
      }
    ]
  );

  assert.deepEqual(consumos, []);
});

test('redondearCantidadStock limita el ruido de coma flotante', () => {
  assert.equal(redondearCantidadStock(0.1 + 0.2), 0.3);
});

