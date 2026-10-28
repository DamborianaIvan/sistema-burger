import { PedidoPrepizza, MovimientoPrepizza } from "../models/Prepizza.js";

// Ventas por fecha de entrega; cobros por fecha del pago. La deuda es el saldo
// de todas las operaciones registradas hasta el fin del período, incluso anticipos.
export const generarReportePrepizzas = async ({ inicio, finExclusivo }) => {
  const pedidos = await PedidoPrepizza.find({
    createdAt: { $lt: finExclusivo },
  }).lean();
  const movimientos = await MovimientoPrepizza.find({
    fecha: { $gte: inicio, $lt: finExclusivo },
  }).lean();
  const dentro = (fecha) =>
    fecha && new Date(fecha) >= inicio && new Date(fecha) < finExclusivo;
  let vendido = 0,
    cobrado = 0,
    pendiente = 0,
    unidadesEntregadas = 0,
    cantidadPedidos = 0;
  const porComercio = new Map();
  const porMetodo = {};
  for (const p of pedidos) {
    // Una cancelación posterior al período no altera retrospectivamente la deuda.
    if (
      p.estado === "CANCELADO" &&
      (!p.fechaCancelacion || new Date(p.fechaCancelacion) < finExclusivo)
    )
      continue;
    const fila = porComercio.get(String(p.comercioId)) ?? {
      comercioId: String(p.comercioId),
      nombre: p.comercioNombre,
      unidades: 0,
      vendido: 0,
      cobrado: 0,
      pendiente: 0,
    };
    let pagadoHastaFin = 0;
    for (const c of p.cobros) {
      if (new Date(c.fecha) < finExclusivo)
        pagadoHastaFin += Math.round(c.monto * 100);
      if (dentro(c.fecha)) {
        const valor = Math.round(c.monto * 100);
        cobrado += valor;
        fila.cobrado += valor;
        porMetodo[c.metodo] = (porMetodo[c.metodo] ?? 0) + valor;
      }
    }
    const saldo = Math.round(p.total * 100) - pagadoHastaFin;
    pendiente += saldo;
    fila.pendiente += saldo;
    if (dentro(p.fechaEntrega)) {
      const unidades = p.items.reduce((s, i) => s + i.cantidad, 0);
      unidadesEntregadas += unidades;
      fila.unidades += unidades;
      cantidadPedidos++;
      const valor = Math.round(p.total * 100);
      vendido += valor;
      fila.vendido += valor;
    }
    porComercio.set(String(p.comercioId), fila);
  }
  const producido = movimientos
    .filter((m) => m.tipo === "PRODUCCION")
    .reduce((s, m) => s + m.cantidad, 0);
  const bajas = movimientos
    .filter((m) => m.tipo === "BAJA")
    .reduce((s, m) => s + m.cantidad, 0);
  const consumos = new Map();
  for (const m of movimientos)
    for (const c of m.consumos ?? [])
      consumos.set(
        String(c.ingredienteId),
        (consumos.get(String(c.ingredienteId)) ?? 0) + c.cantidad,
      );
  return {
    vendido: vendido / 100,
    cobrado: cobrado / 100,
    pendiente: pendiente / 100,
    unidadesEntregadas,
    cantidadPedidos,
    producido,
    bajas,
    porMetodoPago: Object.fromEntries(
      Object.entries(porMetodo).map(([k, v]) => [k, v / 100]),
    ),
    porComercio: [...porComercio.values()].map((c) => ({
      ...c,
      vendido: c.vendido / 100,
      cobrado: c.cobrado / 100,
      pendiente: c.pendiente / 100,
    })),
    consumos: [...consumos].map(([ingredienteId, cantidad]) => ({
      ingredienteId,
      cantidad,
    })),
  };
};

