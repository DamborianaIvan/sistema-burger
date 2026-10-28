import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparPagosActivos, crearTicketVenta } from './ticket.js';

const pedidoBase = {
  _id: '68d0abc123def4567890abcd',
  fechaPedido: new Date('2026-09-21T20:00:00.000Z'),
  tipoPedido: 'SALON',
  mesaId: {
    _id: '68d0abc123def4567890abce',
    numero: 4,
    nombre: 'Ventana'
  },
  nombreCliente: null,
  telefono: null,
  direccion: null,
  productos: [
    {
      nombreSnapshot: 'Pizza Muzzarella',
      cantidad: 2,
      precioUnitario: 10000,
      subtotal: 20000
    }
  ],
  total: 20000,
  totalFinal: 18000,
  descuento: {
    porcentaje: 10,
    monto: 2000
  },
  pagos: [
    { metodo: 'EFECTIVO', monto: 8000, estado: 'ACTIVO' },
    { metodo: 'DEBITO', monto: 10000, estado: 'ACTIVO' },
    { metodo: 'EFECTIVO', monto: 5000, estado: 'ANULADO' }
  ],
  estadoPago: 'PAGADO',
  comentario: 'Sin aceitunas',
  cierre: {
    cerrado: true,
    fecha: new Date('2026-09-21T21:00:00.000Z')
  }
};

test('agruparPagosActivos ignora anulados y agrupa por método', () => {
  assert.deepEqual(agruparPagosActivos([
    { metodo: 'EFECTIVO', monto: 5000, estado: 'ACTIVO' },
    { metodo: 'EFECTIVO', monto: 3000, estado: 'ACTIVO' },
    { metodo: 'DEBITO', monto: 10000, estado: 'ACTIVO' },
    { metodo: 'EFECTIVO', monto: 2000, estado: 'ANULADO' }
  ]), [
    { metodo: 'EFECTIVO', monto: 8000 },
    { metodo: 'DEBITO', monto: 10000 }
  ]);
});

test('crearTicketVenta conserva snapshots, descuento y pagos activos', () => {
  const ticket = crearTicketVenta(pedidoBase);

  assert.equal(ticket.tipo, 'VENTA');
  assert.equal(ticket.numeroPedido, '90ABCD');
  assert.deepEqual(ticket.contexto.mesa, {
    id: '68d0abc123def4567890abce',
    numero: 4,
    nombre: 'Ventana'
  });
  assert.deepEqual(ticket.productos[0], {
    nombre: 'Pizza Muzzarella',
    cantidad: 2,
    precioUnitario: 10000,
    subtotal: 20000
  });
  assert.equal(ticket.totalOriginal, 20000);
  assert.deepEqual(ticket.descuento, { porcentaje: 10, monto: 2000 });
  assert.equal(ticket.totalFinal, 18000);
  assert.deepEqual(ticket.pagos, [
    { metodo: 'EFECTIVO', monto: 8000 },
    { metodo: 'DEBITO', monto: 10000 }
  ]);
});


