export interface Variedad {
  _id: string;
  nombre: string;
  precio: number;
  stockActual: number;
  activa: boolean;
  componentes: { ingredienteId: string; cantidad: number }[];
}
export interface Comercio {
  _id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  activo: boolean;
  diasSeguimiento: number;
  ultimaEntrega: string | null;
  proximoSeguimiento: string | null;
  requiereContacto: boolean;
  saldo: number;
  contactos: { _id: string; fecha: string; nota: string }[];
}
export interface Pedido {
  _id: string;
  comercioId: string;
  comercioNombre: string;
  createdAt: string;
  estado: string;
  estadoCobro: string;
  fechaEntrega: string | null;
  total: number;
  cobrado: number;
  saldo: number;
  observaciones: string;
  motivoCancelacion?: string;
  items: {
    variedadId: string;
    nombre: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
  }[];
  cobros: { _id: string; monto: number; metodo: string; fecha: string }[];
}
export interface Movimiento {
  _id: string;
  nombre: string;
  tipo: string;
  cantidad: number;
  stockPosterior: number;
  motivo: string;
  fecha: string;
  usuarioId: { nombre: string } | null;
  consumos: unknown[];
}
export interface ResumenPrepizzas {
  variedades: Variedad[];
  comercios: Comercio[];
  pedidos: Pedido[];
  movimientos: Movimiento[];
}
export interface ReportePrepizzas {
  vendido: number;
  cobrado: number;
  pendiente: number;
  unidadesEntregadas: number;
  cantidadPedidos: number;
  producido: number;
  bajas: number;
  porMetodoPago: Record<string, number>;
  porComercio: {
    comercioId: string;
    nombre: string;
    unidades: number;
    vendido: number;
    cobrado: number;
    pendiente: number;
  }[];
}

