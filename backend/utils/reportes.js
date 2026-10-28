import { REPORTES } from '../constants/reportes.js';
import { ApiError } from './apiError.js';
import { redondearMoneda } from './finanzasPedido.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const parseFecha = (valor, field) => {
  if (typeof valor !== 'string' || !DATE_RE.test(valor)) {
    throw new ApiError(400, `${field} debe usar formato YYYY-MM-DD`, { field });
  }

  const [year, month, day] = valor.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new ApiError(400, `${field} no es una fecha válida`, { field });
  }

  return { year, month, day };
};

const fechaUtcDesdePartes = ({ year, month, day }, diasExtra = 0) => {
  const base = new Date(Date.UTC(year, month - 1, day + diasExtra));
  const yyyy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00${REPORTES.OFFSET}`);
};

export const resolverRangoReportes = (desde, hasta) => {
  const inicioPartes = parseFecha(desde, 'desde');
  const finPartes = parseFecha(hasta, 'hasta');

  const inicio = fechaUtcDesdePartes(inicioPartes);
  const finExclusivo = fechaUtcDesdePartes(finPartes, 1);

  if (finExclusivo <= inicio) {
    throw new ApiError(400, 'hasta debe ser igual o posterior a desde');
  }

  const dias = Math.round((finExclusivo.getTime() - inicio.getTime()) / 86_400_000);
  if (dias > REPORTES.MAX_DIAS_RANGO) {
    throw new ApiError(400, `El rango máximo permitido es de ${REPORTES.MAX_DIAS_RANGO} días`);
  }

  return {
    desde,
    hasta,
    inicio,
    finExclusivo,
    zonaHoraria: REPORTES.ZONA_HORARIA,
    dias
  };
};

export const prorratearImporteNeto = (subtotal, totalBruto, totalNeto) => {
  const bruto = Number(totalBruto);
  if (!Number.isFinite(bruto) || bruto <= 0) return 0;
  return redondearMoneda((Number(subtotal) / bruto) * Number(totalNeto));
};

