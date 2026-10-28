import { ETIQUETAS_METODO_PAGO, ETIQUETAS_TIPO_PEDIDO } from "../types/pedido";
import type { TicketVenta } from "../types/ticket";

const API_URL = import.meta.env.VITE_API_URL;

const escaparHtml = (valor: unknown) =>
  String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const moneda = (monto: number) =>
  monto.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });

const fechaHora = (fecha: string | null) =>
  fecha ? new Date(fecha).toLocaleString("es-AR") : "-";

const contexto = (ticket: TicketVenta) => {
  if (ticket.tipoPedido === "SALON" && ticket.contexto.mesa) {
    const { numero, nombre } = ticket.contexto.mesa;
    const nombreLimpio = nombre?.trim();
    const nombreGenerico = nombreLimpio && /^mesa\s+\d+$/i.test(nombreLimpio);
    return nombreLimpio && !nombreGenerico
      ? `Mesa ${numero} · ${nombreLimpio}`
      : `Mesa ${numero}`;
  }

  if (ticket.tipoPedido === "DELIVERY") {
    return [ticket.contexto.nombreCliente, ticket.contexto.direccion]
      .filter(Boolean)
      .join(" · ");
  }

  return ticket.contexto.nombreCliente || ETIQUETAS_TIPO_PEDIDO[ticket.tipoPedido];
};

const estilos = `
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #111;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.35;
  }
  .ticket { width: 72mm; margin: 0 auto; }
  h1, h2, p { margin: 0; }
  .center { text-align: center; }
  .muted { color: #444; }
  .separator { border-top: 1px dashed #111; margin: 8px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .item { margin: 5px 0; }
  .item-main { display: flex; justify-content: space-between; gap: 8px; }
  .total { font-size: 15px; font-weight: 800; }
  .strong { font-weight: 800; }
`;

const documento = (titulo: string, contenido: string) => `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escaparHtml(titulo)}</title>
  <style>${estilos}</style>
</head>
<body>
  <main class="ticket">
    ${contenido}
  </main>
  <script>
    window.addEventListener("load", () => {
      setTimeout(() => window.print(), 80);
    });
  </script>
</body>
</html>`;

const htmlVenta = (ticket: TicketVenta) => documento(
  `Ticket ${ticket.numeroPedido}`,
  `
    <div class="center">
      <h1>SISTEMA BURGER</h1>
      <h2>COMPROBANTE DE VENTA</h2>
      <p class="muted">NO FISCAL</p>
    </div>
    <div class="separator"></div>
    <p><span class="strong">Pedido:</span> #${escaparHtml(ticket.numeroPedido)}</p>
    <p><span class="strong">Fecha:</span> ${escaparHtml(fechaHora(ticket.fechaCierre || ticket.fechaPedido))}</p>
    <p><span class="strong">Tipo:</span> ${escaparHtml(ETIQUETAS_TIPO_PEDIDO[ticket.tipoPedido])}</p>
    <p><span class="strong">Cliente/Mesa:</span> ${escaparHtml(contexto(ticket))}</p>
    ${ticket.contexto.telefono ? `<p><span class="strong">Tel:</span> ${escaparHtml(ticket.contexto.telefono)}</p>` : ""}
    ${ticket.contexto.direccion ? `<p><span class="strong">Dirección:</span> ${escaparHtml(ticket.contexto.direccion)}</p>` : ""}
    <div class="separator"></div>
    ${ticket.productos.map((producto) => `
      <div class="item">
        <div class="item-main">
          <span>${escaparHtml(producto.cantidad)} × ${escaparHtml(producto.nombre)}</span>
          <span>${escaparHtml(moneda(producto.subtotal))}</span>
        </div>
        <div class="row muted">
          <span>${escaparHtml(moneda(producto.precioUnitario))} c/u</span>
          <span></span>
        </div>
      </div>
    `).join("")}
    <div class="separator"></div>
    <div class="row"><span>Subtotal</span><span>${escaparHtml(moneda(ticket.totalOriginal))}</span></div>
    ${ticket.descuento.monto > 0 ? `
      <div class="row">
        <span>Descuento ${escaparHtml(ticket.descuento.porcentaje)}%</span>
        <span>-${escaparHtml(moneda(ticket.descuento.monto))}</span>
      </div>
    ` : ""}
    <div class="row total"><span>TOTAL</span><span>${escaparHtml(moneda(ticket.totalFinal))}</span></div>
    <div class="separator"></div>
    <p class="strong">MEDIOS DE PAGO</p>
    ${ticket.pagos.length > 0
      ? ticket.pagos.map((pago) => `
        <div class="row">
          <span>${escaparHtml(ETIQUETAS_METODO_PAGO[pago.metodo])}</span>
          <span>${escaparHtml(moneda(pago.monto))}</span>
        </div>
      `).join("")
      : `<div class="row"><span>Sin saldo</span><span>${escaparHtml(moneda(0))}</span></div>`}
    ${ticket.comentario ? `
      <div class="separator"></div>
      <p class="muted">Comentario: ${escaparHtml(ticket.comentario)}</p>
    ` : ""}
    <div class="separator"></div>
    <p class="center">Gracias por elegir Sistema Burger</p>
  `
);

const cargarTicket = async (pedidoId: string, token: string): Promise<TicketVenta> => {
  const response = await fetch(`${API_URL}/api/pedidos/${pedidoId}/ticket/venta`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message ?? body?.message ?? "No se pudo generar el ticket");
  }

  return body as TicketVenta;
};

export const imprimirTicketVenta = async (pedidoId: string, token: string) => {
  const ventana = window.open("", "_blank", "width=440,height=760");
  if (!ventana) {
    throw new Error("El navegador bloqueó la ventana de impresión");
  }

  ventana.document.write("<p style='font-family:sans-serif'>Generando ticket...</p>");

  try {
    const ticket = await cargarTicket(pedidoId, token);
    ventana.document.open();
    ventana.document.write(htmlVenta(ticket));
    ventana.document.close();
  } catch (error) {
    ventana.close();
    throw error;
  }
};

