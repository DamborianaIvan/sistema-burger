import { ApiError } from "./apiError.js";

export const textoPrepizza = (valor, max = 500, obligatorio = false) => {
  if (
    typeof valor !== "string" ||
    valor.trim().length > max ||
    (obligatorio && !valor.trim())
  ) {
    throw new ApiError(400, "Texto inválido o demasiado largo");
  }
  return valor.trim();
};
export const numeroPrepizza = (
  valor,
  { entero = false, minimo = 0, maximo = 100000000 } = {},
) => {
  if (
    !["number", "string"].includes(typeof valor) ||
    valor === "" ||
    String(valor).trim() === ""
  )
    throw new ApiError(400, "Ingresá un número válido");
  const n = Number(valor);
  if (
    !Number.isFinite(n) ||
    n < minimo ||
    n > maximo ||
    (entero && !Number.isSafeInteger(n))
  )
    throw new ApiError(400, "Cantidad o importe fuera del rango permitido");
  return n;
};
export const clavePrepizza = (valor) => textoPrepizza(valor, 100, true);
export const centavos = (valor) => Math.round(numeroPrepizza(valor) * 100);
export const estadoCobroPrepizza = (pedido) =>
  pedido.cobrado >= pedido.total
    ? "PAGADO"
    : pedido.cobrado > 0
      ? "PARCIAL"
      : "PENDIENTE";
export const proximoContacto = (fecha, dias) =>
  new Date(new Date(fecha).getTime() + dias * 86400000);
export const seguimientoPendiente = (comercio, ahora = new Date()) =>
  Boolean(
    comercio.activo &&
    comercio.proximoSeguimiento &&
    new Date(comercio.proximoSeguimiento) <= ahora,
  );
export const serializarPedidoPrepizza = (pedido) => {
  const p = pedido.toObject ? pedido.toObject() : pedido;
  return {
    ...p,
    saldo: Math.round((p.total - p.cobrado) * 100) / 100,
    estadoCobro: estadoCobroPrepizza(p),
  };
};

