import { METODOS_PAGO } from './pedido.js';

export const ESTADOS_CAJA = Object.freeze({
  ABIERTA: 'ABIERTA',
  CERRADA: 'CERRADA'
});

export const TIPOS_MOVIMIENTO_CAJA = Object.freeze({
  APERTURA: 'APERTURA',
  PAGO: 'PAGO',
  ANULACION_PAGO: 'ANULACION_PAGO'
});

export const ESTADOS_REGISTRO_PAGO = Object.freeze({
  ACTIVO: 'ACTIVO',
  ANULADO: 'ANULADO'
});

export const crearTotalesPorMetodoVacios = () => ({
  [METODOS_PAGO.EFECTIVO]: 0,
  [METODOS_PAGO.TRANSFERENCIA]: 0,
  [METODOS_PAGO.DEBITO]: 0,
  [METODOS_PAGO.CREDITO]: 0
});

