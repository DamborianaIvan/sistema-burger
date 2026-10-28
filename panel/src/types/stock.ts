export const UNIDADES_INGREDIENTE = ["G", "KG", "ML", "L", "UNIDAD"] as const;
export type UnidadIngrediente = (typeof UNIDADES_INGREDIENTE)[number];

export const TIPOS_MOVIMIENTO_MANUAL = ["ENTRADA", "SALIDA", "AJUSTE", "MERMA"] as const;
export type TipoMovimientoManual = (typeof TIPOS_MOVIMIENTO_MANUAL)[number];

export interface Ingrediente {
  _id: string;
  nombre: string;
  unidad: UnidadIngrediente;
  stockActual: number;
  stockMinimo: number;
  activo: boolean;
  stockBajo?: boolean;
}

export interface ProductoStock {
  _id: string;
  nombre: string;
  categoria: string;
  disponible: boolean;
}

export interface ComponenteReceta {
  ingredienteId: string | Ingrediente;
  cantidad: number;
}

export interface Receta {
  _id: string;
  productoId: string | ProductoStock;
  componentes: ComponenteReceta[];
  activa: boolean;
}

export interface MovimientoStock {
  _id: string;
  ingredienteId: string | Pick<Ingrediente, "_id" | "nombre" | "unidad">;
  tipo: TipoMovimientoManual | "CONSUMO";
  cantidad: number;
  stockAnterior: number;
  stockPosterior: number;
  motivo: string;
  fecha: string;
  pedidoId?: string | null;
  usuarioId?: string | { _id: string; nombre: string } | null;
}

