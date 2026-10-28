import { ESTADOS_PAGO, METODOS_PAGO } from '../constants/pedido.js';
import { ESTADOS_REGISTRO_PAGO } from '../constants/caja.js';
import { ApiError } from './apiError.js';
import { numero } from './validaciones.js';

export const redondearMoneda = (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100;

export const calcularDescuento = (total, porcentaje) => {
  numero(total, 'total');
  const porcentajeNumero = numero(porcentaje, 'porcentaje', { max: 100 });
  if (!Number.isFinite(porcentajeNumero) || porcentajeNumero < 0 || porcentajeNumero > 100) {
    throw new ApiError(400, 'El descuento debe ser un porcentaje entre 0 y 100', {
      field: 'porcentaje'
    });
  }

  const monto = redondearMoneda(Number(total) * porcentajeNumero / 100);
  const totalFinal = redondearMoneda(Number(total) - monto);

  return {
    porcentaje: porcentajeNumero,
    monto,
    totalFinal
  };
};

export const validarPagosCobro = (pagos, totalFinal) => {
  numero(totalFinal, 'totalFinal');
  if (!Array.isArray(pagos) || pagos.length === 0 || pagos.length > 20) {
    throw new ApiError(400, 'Debe informar al menos un medio de pago', { field: 'pagos' });
  }

  const normalizados = pagos.map((pago, index) => {
    if (!Object.values(METODOS_PAGO).includes(pago?.metodo)) {
      throw new ApiError(400, 'Método de pago inválido', {
        field: `pagos[${index}].metodo`,
        allowedValues: Object.values(METODOS_PAGO)
      });
    }

    const monto = numero(pago?.monto, `pagos[${index}].monto`, { min: 0.01 });
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new ApiError(400, 'El monto del pago debe ser mayor a cero', {
        field: `pagos[${index}].monto`
      });
    }

    return {
      metodo: pago.metodo,
      monto: redondearMoneda(monto)
    };
  });

  const totalPagado = redondearMoneda(numero(
    normalizados.reduce((sum, pago) => sum + pago.monto, 0), 'totalPagado'
  ));

  if (totalPagado !== redondearMoneda(totalFinal)) {
    throw new ApiError(409, 'La suma de los pagos debe coincidir exactamente con el total final', {
      totalFinal: redondearMoneda(totalFinal),
      totalPagado,
      diferencia: redondearMoneda(totalFinal - totalPagado)
    });
  }

  return normalizados;
};

export const pagosActivos = (pedido) =>
  pedido.pagos.filter((pago) => (pago.estado ?? ESTADOS_REGISTRO_PAGO.ACTIVO) === ESTADOS_REGISTRO_PAGO.ACTIVO);

export const pedidoTienePagosRegistrados = (pedido) => pedido.pagos.length > 0;

export const marcarPagoAnulado = (pago, usuarioId, fecha) => {
  pago.estado = ESTADOS_REGISTRO_PAGO.ANULADO;
  pago.anuladoPor = usuarioId;
  pago.fechaAnulacion = fecha;
};

export const recalcularEstadoPagoTrasAnulacion = (pedido) => {
  pedido.estadoPago = pagosActivos(pedido).length === 0
    ? ESTADOS_PAGO.ANULADO
    : pedido.estadoPago;
};


