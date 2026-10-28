import mongoose from "mongoose";
import { registrarAuditoria } from "./auditoriaService.js";
import {
  VariedadPrepizza,
  ComercioPrepizza,
  PedidoPrepizza,
  MovimientoPrepizza,
} from "../models/Prepizza.js";
import Ingrediente from "../models/Ingrediente.js";
import MovimientoStock from "../models/MovimientoStock.js";
import Caja from "../models/Caja.js";
import MovimientoCaja from "../models/MovimientoCaja.js";
import { ESTADOS_CAJA, TIPOS_MOVIMIENTO_CAJA } from "../constants/caja.js";
import { METODOS_PAGO } from "../constants/pedido.js";
import { ApiError } from "../utils/apiError.js";
import { redondearCantidadStock } from "../utils/stock.js";
import {
  clavePrepizza,
  numeroPrepizza,
  textoPrepizza,
  centavos,
  proximoContacto,
} from "../utils/prepizzas.js";

export const transaccionPrepizza = async (fn) => {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => fn(session));
  } finally {
    await session.endSession();
  }
};
export const buscarPrepizza = async (Model, id, session) => {
  if (!mongoose.isValidObjectId(id))
    throw new ApiError(400, "Identificador inválido");
  const doc = await Model.findById(id).session(session ?? null);
  if (!doc) throw new ApiError(404, "Registro no encontrado");
  return doc;
};
export const validarComponentes = async (componentes) => {
  if (!Array.isArray(componentes) || componentes.length > 100)
    throw new ApiError(400, "Receta inválida");
  const ids = componentes.map((c) => c?.ingredienteId);
  if (
    ids.some((id) => !mongoose.isValidObjectId(id)) ||
    new Set(ids.map(String)).size !== ids.length
  )
    throw new ApiError(400, "Ingredientes inválidos o repetidos");
  const resultado = componentes.map((c) => ({
    ingredienteId: c.ingredienteId,
    cantidad: numeroPrepizza(c.cantidad, { minimo: 0.000001 }),
  }));
  if (
    (await Ingrediente.countDocuments({ _id: { $in: ids }, activo: true })) !==
    ids.length
  )
    throw new ApiError(
      409,
      "La receta contiene ingredientes inexistentes o inactivos",
    );
  return resultado;
};

export const moverStockPrepizza = (datos, usuarioId) =>
  transaccionPrepizza(async (session) => {
    const claveOperacion = clavePrepizza(datos.claveOperacion);
    const previo = await MovimientoPrepizza.findOne({ claveOperacion }).session(
      session,
    );
    if (previo) return previo;
    const variedad = await buscarPrepizza(
      VariedadPrepizza,
      datos.variedadId,
      session,
    );
    if (!variedad.activa) throw new ApiError(409, "La variedad está inactiva");
    const cantidad = numeroPrepizza(datos.cantidad, {
      entero: true,
      minimo: 1,
      maximo: 1000000,
    });
    if (!["PRODUCCION", "BAJA"].includes(datos.tipo))
      throw new ApiError(400, "Movimiento inválido");
    const motivo = textoPrepizza(
      datos.motivo ?? "",
      500,
      datos.tipo === "BAJA",
    );
    if (typeof datos.consumirIngredientes !== "boolean")
      throw new ApiError(400, "Indicá si se deben consumir ingredientes");
    const stockAnterior = variedad.stockActual;
    const stockPosterior =
      stockAnterior + (datos.tipo === "PRODUCCION" ? cantidad : -cantidad);
    if (stockPosterior < 0)
      throw new ApiError(409, "No hay suficientes prepizzas disponibles");
    const consumos = [];
    if (datos.tipo === "PRODUCCION" && datos.consumirIngredientes) {
      if (!variedad.componentes.length)
        throw new ApiError(
          409,
          "Configurá una receta antes de consumir ingredientes",
        );
      for (const componente of variedad.componentes) {
        const consumo = redondearCantidadStock(componente.cantidad * cantidad);
        if (consumo <= 0)
          throw new ApiError(400, "La cantidad de receta es demasiado pequeña");
        const ingrediente = await Ingrediente.findOneAndUpdate(
          {
            _id: componente.ingredienteId,
            activo: true,
            stockActual: { $gte: consumo },
          },
          { $inc: { stockActual: -consumo } },
          { new: true, session },
        );
        if (!ingrediente)
          throw new ApiError(
            409,
            "Un ingrediente está inactivo o no tiene stock suficiente",
          );
        consumos.push({ ingredienteId: ingrediente._id, cantidad: consumo });
        await MovimientoStock.create(
          [
            {
              ingredienteId: ingrediente._id,
              tipo: "CONSUMO",
              cantidad: consumo,
              stockAnterior: redondearCantidadStock(
                ingrediente.stockActual + consumo,
              ),
              stockPosterior: redondearCantidadStock(ingrediente.stockActual),
              motivo: `Producción de ${cantidad} prepizzas: ${variedad.nombre}`,
              usuarioId,
              produccionPrepizzaClave: claveOperacion,
            },
          ],
          { session },
        );
      }
    }
    variedad.stockActual = stockPosterior;
    await variedad.save({ session });
    const [movimiento] = await MovimientoPrepizza.create(
      [
        {
          claveOperacion,
          variedadId: variedad._id,
          nombre: variedad.nombre,
          tipo: datos.tipo,
          cantidad,
          stockAnterior,
          stockPosterior,
          motivo,
          consumos,
          usuarioId,
        },
      ],
      { session },
    );
    return movimiento;
  });

export const crearPedidoPrepizza = (datos, usuarioId) =>
  transaccionPrepizza(async (session) => {
    const claveOperacion = clavePrepizza(datos.claveOperacion);
    const previo = await PedidoPrepizza.findOne({ claveOperacion }).session(
      session,
    );
    if (previo) return previo;
    const comercio = await buscarPrepizza(
      ComercioPrepizza,
      datos.comercioId,
      session,
    );
    if (!comercio.activo) throw new ApiError(409, "El comercio está inactivo");
    if (
      !Array.isArray(datos.items) ||
      !datos.items.length ||
      datos.items.length > 100
    )
      throw new ApiError(400, "Agregá entre 1 y 100 variedades");
    if (
      new Set(datos.items.map((i) => String(i?.variedadId))).size !==
      datos.items.length
    )
      throw new ApiError(400, "No repitas variedades");
    const items = [];
    let totalCentavos = 0;
    for (const item of datos.items) {
      const variedad = await buscarPrepizza(
        VariedadPrepizza,
        item?.variedadId,
        session,
      );
      if (!variedad.activa)
        throw new ApiError(409, "Una variedad está inactiva");
      const cantidad = numeroPrepizza(item.cantidad, {
        entero: true,
        minimo: 1,
        maximo: 1000000,
      });
      const precio = centavos(item.precioUnitario ?? variedad.precio);
      const subtotal = cantidad * precio;
      totalCentavos += subtotal;
      if (!Number.isSafeInteger(totalCentavos) || totalCentavos > 10000000000)
        throw new ApiError(400, "El total del pedido es demasiado grande");
      items.push({
        variedadId: variedad._id,
        nombre: variedad.nombre,
        cantidad,
        precioUnitario: precio / 100,
        subtotal: subtotal / 100,
      });
    }
    const [pedido] = await PedidoPrepizza.create(
      [
        {
          claveOperacion,
          comercioId: comercio._id,
          comercioNombre: comercio.nombre,
          items,
          total: totalCentavos / 100,
          observaciones: textoPrepizza(datos.observaciones ?? ""),
          usuarioId,
        },
      ],
      { session },
    );
    return pedido;
  });

export const entregarPedidoPrepizza = (id, usuarioId) =>
  transaccionPrepizza(async (session) => {
    const pedido = await buscarPrepizza(PedidoPrepizza, id, session);
    if (pedido.estado === "ENTREGADO") return pedido;
    if (pedido.estado !== "PENDIENTE")
      throw new ApiError(409, "El pedido no está pendiente");
    const comercio = await buscarPrepizza(
      ComercioPrepizza,
      pedido.comercioId,
      session,
    );
    if (!comercio.activo) throw new ApiError(409, "El comercio está inactivo");
    for (const item of pedido.items) {
      const variedad = await VariedadPrepizza.findOneAndUpdate(
        {
          _id: item.variedadId,
          activa: true,
          stockActual: { $gte: item.cantidad },
        },
        { $inc: { stockActual: -item.cantidad } },
        { new: true, session },
      );
      if (!variedad)
        throw new ApiError(
          409,
          `Stock insuficiente o variedad inactiva: ${item.nombre}`,
        );
      await MovimientoPrepizza.create(
        [
          {
            claveOperacion: `entrega:${pedido._id}:${item.variedadId}`,
            variedadId: item.variedadId,
            nombre: item.nombre,
            tipo: "ENTREGA",
            cantidad: item.cantidad,
            stockAnterior: variedad.stockActual + item.cantidad,
            stockPosterior: variedad.stockActual,
            pedidoId: pedido._id,
            motivo: `Entrega a ${pedido.comercioNombre}`,
            usuarioId,
          },
        ],
        { session },
      );
    }
    pedido.estado = "ENTREGADO";
    pedido.fechaEntrega = new Date();
    pedido.entregadoPor = usuarioId;
    await pedido.save({ session });
    comercio.ultimaEntrega = pedido.fechaEntrega;
    comercio.proximoSeguimiento = proximoContacto(
      pedido.fechaEntrega,
      comercio.diasSeguimiento,
    );
    await comercio.save({ session });
    return pedido;
  });

export const cobrarPedidoPrepizza = (id, datos, usuarioId, actor = { id: usuarioId }) =>
  transaccionPrepizza(async (session) => {
    const pedido = await buscarPrepizza(PedidoPrepizza, id, session);
    const claveOperacion = clavePrepizza(datos.claveOperacion);
    if (pedido.cobros.some((c) => c.claveOperacion === claveOperacion))
      return pedido;
    if (pedido.estado === "CANCELADO")
      throw new ApiError(409, "El pedido está cancelado");
    const monto = centavos(datos.monto);
    if (monto <= 0 || monto > Math.round((pedido.total - pedido.cobrado) * 100))
      throw new ApiError(
        409,
        "El cobro debe ser positivo y no superar el saldo pendiente",
      );
    if (!Object.values(METODOS_PAGO).includes(datos.metodo))
      throw new ApiError(400, "Método de pago inválido");
    const caja = await Caja.findOneAndUpdate(
      { estado: ESTADOS_CAJA.ABIERTA },
      { $inc: { [`totalesPorMetodo.${datos.metodo}`]: monto / 100 } },
      { new: true, session },
    );
    if (!caja)
      throw new ApiError(409, "Abrí la caja antes de registrar un cobro");
    const fecha = new Date();
    pedido.cobros.push({
      claveOperacion,
      monto: monto / 100,
      metodo: datos.metodo,
      cajaId: caja._id,
      usuarioId,
      fecha,
    });
    pedido.cobrado = (Math.round(pedido.cobrado * 100) + monto) / 100;
    await pedido.save({ session });
    await MovimientoCaja.create(
      [
        {
          cajaId: caja._id,
          pedidoPrepizzaId: pedido._id,
          tipo: TIPOS_MOVIMIENTO_CAJA.PAGO,
          metodo: datos.metodo,
          monto: monto / 100,
          usuarioId,
          fecha,
        },
      ],
      { session },
    );
    await registrarAuditoria({
      accion: "PREPIZZA_COBRO_REGISTRADO", entidad: "PREPIZZA", entidadId: pedido._id,
      usuario: actor, metadata: { comercio: pedido.comercioNombre, monto: monto / 100, metodo: datos.metodo }
    }, { session });
    return pedido;
  });

export const cancelarPedidoPrepizza = (id, motivo, usuarioId) =>
  transaccionPrepizza(async (session) => {
    const pedido = await buscarPrepizza(PedidoPrepizza, id, session);
    if (pedido.estado !== "PENDIENTE" || pedido.cobrado > 0)
      throw new ApiError(
        409,
        "Solo se pueden cancelar pedidos pendientes sin cobros",
      );
    pedido.estado = "CANCELADO";
    pedido.motivoCancelacion = textoPrepizza(motivo, 500, true);
    pedido.canceladoPor = usuarioId;
    pedido.fechaCancelacion = new Date();
    await pedido.save({ session });
    return pedido;
  });


