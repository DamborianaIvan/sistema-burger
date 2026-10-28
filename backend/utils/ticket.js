import { ESTADOS_REGISTRO_PAGO } from '../constants/caja.js';
import { redondearMoneda } from './finanzasPedido.js';

const obtenerId = (valor) => {
  if (!valor) return null;
  if (typeof valor === 'object' && valor._id) return String(valor._id);
  return String(valor);
};

const obtenerNumeroPedido = (pedido) =>
  String(pedido._id ?? '').slice(-6).toUpperCase();

const obtenerMesa = (mesaId) => {
  if (!mesaId || typeof mesaId !== 'object') return null;
  if (typeof mesaId.numero !== 'number') return null;

  return {
    id: obtenerId(mesaId),
    numero: mesaId.numero,
    nombre: mesaId.nombre ?? null
  };
};

const crearContexto = (pedido) => ({
  mesa: obtenerMesa(pedido.mesaId),
  nombreCliente: pedido.nombreCliente ?? null,
  telefono: pedido.telefono ?? null,
  direccion: pedido.direccion ?? null
});

export const agruparPagosActivos = (pagos = []) => {
  const acumulados = new Map();

  for (const pago of pagos) {
    const estado = pago.estado ?? ESTADOS_REGISTRO_PAGO.ACTIVO;
    if (estado !== ESTADOS_REGISTRO_PAGO.ACTIVO) continue;

    const montoActual = acumulados.get(pago.metodo) ?? 0;
    acumulados.set(
      pago.metodo,
      redondearMoneda(montoActual + Number(pago.monto ?? 0))
    );
  }

  return Array.from(acumulados, ([metodo, monto]) => ({ metodo, monto }));
};

export const crearTicketVenta = (pedido) => ({
  tipo: 'VENTA',
  version: 1,
  pedidoId: obtenerId(pedido._id),
  numeroPedido: obtenerNumeroPedido(pedido),
  fechaPedido: pedido.fechaPedido,
  fechaCierre: pedido.cierre?.fecha ?? null,
  tipoPedido: pedido.tipoPedido,
  contexto: crearContexto(pedido),
  productos: pedido.productos.map((producto) => ({
    nombre: producto.nombreSnapshot,
    cantidad: producto.cantidad,
    precioUnitario: redondearMoneda(producto.precioUnitario),
    subtotal: redondearMoneda(producto.subtotal)
  })),
  totalOriginal: redondearMoneda(pedido.total),
  descuento: {
    porcentaje: Number(pedido.descuento?.porcentaje ?? 0),
    monto: redondearMoneda(pedido.descuento?.monto ?? 0)
  },
  totalFinal: redondearMoneda(pedido.totalFinal ?? pedido.total),
  pagos: agruparPagosActivos(pedido.pagos),
  comentario: pedido.comentario ?? ''
});

