import { ESTADOS_PEDIDO, TIPOS_PEDIDO } from './pedido.js';

const { ABIERTO, CONFIRMADO, EN_COCINA, LISTO, SERVIDO, EN_CAMINO, ENTREGADO, CANCELADO } = ESTADOS_PEDIDO;
const { SALON, DELIVERY, TAKEAWAY } = TIPOS_PEDIDO;

export const TRANSICIONES_PEDIDO = Object.freeze({
  [ABIERTO]: Object.freeze([CONFIRMADO, CANCELADO]),
  [CONFIRMADO]: Object.freeze([EN_COCINA, CANCELADO]),
  [EN_COCINA]: Object.freeze([LISTO, CANCELADO]),
  [LISTO]: Object.freeze([CANCELADO]),
  [SERVIDO]: Object.freeze([]),
  [EN_CAMINO]: Object.freeze([ENTREGADO, CANCELADO]),
  [ENTREGADO]: Object.freeze([]),
  [CANCELADO]: Object.freeze([]),
});

const TRANSICION_DESDE_LISTO_POR_TIPO = Object.freeze({
  [SALON]: Object.freeze([SERVIDO]),
  [DELIVERY]: Object.freeze([EN_CAMINO]),
  [TAKEAWAY]: Object.freeze([ENTREGADO]),
});

export const puedeTransicionarPedido = (estadoActual, estadoNuevo, tipoPedido) => {
  if (estadoActual === LISTO) {
    if (estadoNuevo === CANCELADO) {
      return true;
    }

    return TRANSICION_DESDE_LISTO_POR_TIPO[tipoPedido]?.includes(estadoNuevo) ?? false;
  }

  return TRANSICIONES_PEDIDO[estadoActual]?.includes(estadoNuevo) ?? false;
};

