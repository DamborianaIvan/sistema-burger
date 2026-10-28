import type { MetodoPago, TipoPedido } from "./pedido";

export interface TicketContexto {
  mesa: {
    id: string | null;
    numero: number;
    nombre: string | null;
  } | null;
  nombreCliente: string | null;
  telefono: string | null;
  direccion: string | null;
}

export interface TicketProductoVenta {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface TicketVenta {
  tipo: "VENTA";
  version: number;
  pedidoId: string | null;
  numeroPedido: string;
  fechaPedido: string;
  fechaCierre: string | null;
  tipoPedido: TipoPedido;
  contexto: TicketContexto;
  productos: TicketProductoVenta[];
  totalOriginal: number;
  descuento: {
    porcentaje: number;
    monto: number;
  };
  totalFinal: number;
  pagos: {
    metodo: MetodoPago;
    monto: number;
  }[];
  comentario: string;
}

