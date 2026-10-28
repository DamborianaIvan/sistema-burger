import type { MetodoPago, TipoPedido } from "./pedido";

export interface ReporteProducto {
  productoId: string | null;
  nombre: string;
  cantidad: number;
  importe: number;
}

export interface ReporteCategoria {
  categoria: string;
  cantidad: number;
  importe: number;
}

export interface ReporteTipoPedido {
  cantidad: number;
  importe: number;
}

export interface ReporteCajaSesion {
  id: string;
  fechaApertura: string;
  fechaCierre: string;
  montoInicial: number;
  totalesPorMetodo: Record<MetodoPago, number>;
  efectivoEsperado: number | null;
  efectivoDeclarado: number | null;
  diferencia: number | null;
}

export interface ReporteStockIngrediente {
  ingredienteId: string;
  nombre: string;
  unidad: string;
  ENTRADA: number;
  SALIDA: number;
  AJUSTE: number;
  MERMA: number;
  CONSUMO: number;
}

export interface ReporteAlertaStock {
  ingredienteId: string;
  nombre: string;
  unidad: string;
  stockActual: number;
  stockMinimo: number;
}

export interface ResumenReportes {
  periodo: {
    desde: string;
    hasta: string;
    dias: number;
    zonaHoraria: string;
  };
  ventas: {
    cantidad: number;
    ingresos: number;
    totalBruto: number;
    descuentos: number;
    ticketPromedio: number;
    unidadesVendidas: number;
    porTipo: Record<TipoPedido, ReporteTipoPedido>;
    porMetodoPago: Record<MetodoPago, number>;
    serieDiaria: Array<{ fecha: string; cantidad: number; ingresos: number }>;
    productos: ReporteProducto[];
    categorias: ReporteCategoria[];
  };
  caja: {
    cantidadCierres: number;
    totalesPorMetodo: Record<MetodoPago, number>;
    diferenciaAcumulada: number;
    sesiones: ReporteCajaSesion[];
  };
  stock: {
    movimientos: number;
    porIngrediente: ReporteStockIngrediente[];
    alertas: ReporteAlertaStock[];
  };
}


