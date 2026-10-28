import { consultaPaginada } from "../../utils/consultaPaginada";
import { useEffect, useRef, useState } from "react";
import { DateRange } from "react-date-range";
import type { Range } from "react-date-range";
import dayjs from "dayjs";
import { es } from "date-fns/locale";
import { TextField, MenuItem, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, Alert } from "@mui/material";
import "dayjs/locale/es";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";
import "./ListaPedidos.css";
import InventoryIcon from "@mui/icons-material/Inventory";
import PrintIcon from "@mui/icons-material/Print";
import { getSession } from "../../auth/session";
import { hasPermission, PERMISSIONS } from "../../types/auth";
import { imprimirTicketVenta } from "../../utils/printTicket";
import {
  ESTADOS_PEDIDO,
  ETIQUETAS_ESTADO_PEDIDO,
  ETIQUETAS_METODO_PAGO,
  ETIQUETAS_TIPO_PEDIDO,
  METODOS_PAGO,
  type EstadoPedido,
  type Pedido,
  type MetodoPago,
  type TipoPedido,
  type ProductoPedido,
} from "../../types/pedido";

dayjs.locale("es");

const ListaPedidos = () => {
  const session = getSession();
  const token = session?.token;
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [mesas, setMesas] = useState<{ _id: string; numero: number }[]>([]);
  const [filtros, setFiltros] = useState({
    usuario: "",
    metodoPago: "" as MetodoPago | "",
    tipoPedido: "" as TipoPedido | "",
    fechas: {
      startDate: undefined,
      endDate: undefined,
      key: "selection",
    } as Range,
  });
  const [estadoPedido, setEstadoPedido] = useState<EstadoPedido | "">("");
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState<Pedido | null>(null);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [productosEdicion, setProductosEdicion] = useState<ProductoPedido[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [mensajeAccion, setMensajeAccion] = useState<string | null>(null);
  const [productosDisponibles, setProductosDisponibles] = useState<{ _id: string; nombre: string; categoria: string; precio: number; disponible: boolean }[]>([]);
  const [productoParaAgregar, setProductoParaAgregar] = useState("");
  const [paginaActual, setPaginaActual] = useState(1);
  const pedidosPorPagina = 20;
  const [totalPedidos, setTotalPedidos] = useState(0);
  const calendarioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fetchPedidos = async () => {
      try {
        const params = new URLSearchParams({ page: String(paginaActual), limit: String(pedidosPorPagina) });
        if (filtros.usuario.trim()) params.set("cliente", filtros.usuario.trim());
        if (filtros.metodoPago) params.set("metodoPago", filtros.metodoPago);
        if (filtros.tipoPedido) params.set("tipoPedido", filtros.tipoPedido);
        if (estadoPedido) params.set("estadoPedido", estadoPedido);
        if (filtros.fechas.startDate && filtros.fechas.endDate) {
          params.set("desde", dayjs(filtros.fechas.startDate).format("YYYY-MM-DD"));
          params.set("hasta", dayjs(filtros.fechas.endDate).format("YYYY-MM-DD"));
        }
        const { datos, total } = await consultaPaginada<Pedido[]>(`/api/pedidos?${params}`, token, controller.signal);
        setPedidos(datos);
        setTotalPedidos(total);
        if (paginaActual > 1 && (paginaActual - 1) * pedidosPorPagina >= total) setPaginaActual(Math.max(1, Math.ceil(total / pedidosPorPagina)));
      } catch (err) {
        if (!controller.signal.aborted) setMensajeAccion(err instanceof Error ? err.message : "Error obteniendo pedidos");
      }
    };

    const fetchMesas = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/mesas`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const data: { _id: string; numero: number }[] = await res.json();
        setMesas(data);
      } catch (err) {
        console.error("Error obteniendo mesas:", err);
      }
    };

    void fetchPedidos();
    void fetchMesas();
    const interval = setInterval(() => void fetchPedidos(), 10000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [token, paginaActual, filtros, estadoPedido]);

  useEffect(() => {
    const handleClickFuera = (e: MouseEvent) => {
      if (calendarioRef.current && !calendarioRef.current.contains(e.target as Node)) {
        setMostrarCalendario(false);
      }
    };
    if (mostrarCalendario) document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, [mostrarCalendario]);

  const imprimirVenta = async (pedido: Pedido) => {
    const token = session?.token;
    if (!token) return;

    try {
      await imprimirTicketVenta(pedido._id, token);
      setMensajeAccion(null);
    } catch (error) {
      setMensajeAccion(error instanceof Error ? error.message : "No se pudo imprimir el ticket.");
    }
  };

  const pedidosPaginados = pedidos;
  const totalPaginas = Math.max(1, Math.ceil(totalPedidos / pedidosPorPagina));

  const canEditOrders = session?.rol ? hasPermission(session.rol, PERMISSIONS.ORDERS_EDIT) : false;
  const canCancelOrders = session?.rol ? hasPermission(session.rol, PERMISSIONS.ORDERS_CANCEL) : false;
  const canChangeStatus = session?.rol ? hasPermission(session.rol, PERMISSIONS.ORDERS_CHANGE_STATUS) : false;
  const canPrintSale = session?.rol === "ADMIN" || session?.rol === "CAJERO";

  const cargarProductosDisponibles = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/productos`, {
        headers: { Authorization: `Bearer ${session?.token}` },
      });
      if (!res.ok) throw new Error();
      const payload = await res.json() as { _id: string; nombre: string; categoria: string; precio: number; disponible: boolean }[] | { productos?: { _id: string; nombre: string; categoria: string; precio: number; disponible: boolean }[] };
      const data = Array.isArray(payload) ? payload : payload.productos ?? [];
      setProductosDisponibles(data);
    } catch {
      setMensajeAccion("No se pudieron cargar los productos.");
    }
  };

  const agregarProductoEdicion = () => {
    if (!productoParaAgregar) return;
    const producto = productosDisponibles.find((item) => item._id === productoParaAgregar);
    if (!producto) return;
    if (productosEdicion.some((item) => item.productoId === producto._id)) {
      setMensajeAccion("El producto ya está en el pedido. Modificá su cantidad.");
      return;
    }
    setProductosEdicion((actuales) => [...actuales, { productoId: producto._id, nombreSnapshot: producto.nombre, cantidad: 1, precioUnitario: producto.precio, subtotal: producto.precio }]);
    setProductoParaAgregar("");
  };

  const abrirDetalle = async (id: string) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/pedidos/${id}`, { headers: { Authorization: `Bearer ${session?.token}` } });
      if (!res.ok) throw new Error();
      const pedido: Pedido = await res.json();
      setPedidoSeleccionado(pedido);
      setProductosEdicion(pedido.productos);
      setModoEdicion(false);
      setProductoParaAgregar("");
      setMensajeAccion(null);
    } catch {
      setMensajeAccion("No se pudo cargar el detalle del pedido.");
    }
  };

  const actualizarCantidad = (index: number, cantidad: number) => {
    setProductosEdicion((productos) => productos.map((producto, i) => i === index ? { ...producto, cantidad, subtotal: producto.precioUnitario * cantidad } : producto));
  };

  const quitarProducto = (index: number) => setProductosEdicion((productos) => productos.filter((_, i) => i !== index));

  const guardarEdicion = async () => {
    if (!pedidoSeleccionado || productosEdicion.length === 0) return;
    setGuardando(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/pedidos/${pedidoSeleccionado._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.token}` },
        body: JSON.stringify({
          nombreCliente: pedidoSeleccionado.nombreCliente,
          telefono: pedidoSeleccionado.telefono,
          direccion: pedidoSeleccionado.direccion,
          comentario: pedidoSeleccionado.comentario ?? "",
          productos: productosEdicion.map(({ productoId, cantidad }) => ({ productoId, cantidad })),
        }),
      });
      if (!res.ok) throw new Error();
      const actualizado = (await res.json()) as Pedido;
      setPedidoSeleccionado(actualizado);
      setProductosEdicion(actualizado.productos);
      setPedidos((actuales) => actuales.map((pedido) => pedido._id === actualizado._id ? actualizado : pedido));
      setModoEdicion(false);
      setMensajeAccion("Pedido actualizado correctamente.");
    } catch {
      setMensajeAccion("No se pudo actualizar el pedido.");
    } finally {
      setGuardando(false);
    }
  };

  const obtenerEstadosPermitidos = (pedido: Pedido): EstadoPedido[] => {
    const transiciones: Record<EstadoPedido, EstadoPedido[]> = {
      ABIERTO: ["CONFIRMADO"],
      CONFIRMADO: ["EN_COCINA"],
      EN_COCINA: ["LISTO"],
      LISTO: pedido.tipoPedido === "DELIVERY" ? ["EN_CAMINO"] : pedido.tipoPedido === "SALON" ? ["SERVIDO"] : ["ENTREGADO"],
      SERVIDO: [],
      EN_CAMINO: ["ENTREGADO"],
      ENTREGADO: [],
      CANCELADO: [],
    };
    return transiciones[pedido.estadoPedido];
  };

  const actualizarEstado = async (nuevoEstado: EstadoPedido) => {
    if (!pedidoSeleccionado) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/pedidos/${pedidoSeleccionado._id}/estado`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ estadoPedido: nuevoEstado }),
      });
      if (!res.ok) throw new Error();
      const actualizado = (await res.json()) as Pedido;
      setPedidoSeleccionado(actualizado);
      setPedidos((actuales) => actuales.map((pedido) => pedido._id === actualizado._id ? actualizado : pedido));
      setMensajeAccion("Estado actualizado correctamente.");
    } catch {
      setMensajeAccion("No se pudo actualizar el estado del pedido.");
    }
  };

  const cancelarPedido = async () => {
    if (!pedidoSeleccionado) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/pedidos/${pedidoSeleccionado._id}/cancelar`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session?.token}` },
      });
      if (!res.ok) throw new Error();
      const actualizado = (await res.json()) as Pedido;
      setPedidoSeleccionado(actualizado);
      setPedidos((actuales) => actuales.map((pedido) => pedido._id === actualizado._id ? actualizado : pedido));
      setMensajeAccion("Pedido cancelado correctamente.");
    } catch {
      setMensajeAccion("No se pudo cancelar el pedido.");
    }
  };

  const quitarFiltro = (tipo: keyof typeof filtros | "estadoPedido") => {
    if (tipo === "fechas") {
      setFiltros((f) => ({ ...f, fechas: { startDate: undefined, endDate: undefined, key: "selection" } }));
    } else if (tipo === "estadoPedido") {
      setEstadoPedido("");
    } else {
      setFiltros((f) => ({ ...f, [tipo]: "" }));
    }
    setPaginaActual(1);
  };

  const etiquetaEstadoVisual = (pedido: Pedido) =>
    pedido.cierre?.cerrado ? "Cerrado" : ETIQUETAS_ESTADO_PEDIDO[pedido.estadoPedido];

  const obtenerNombrePedido = (pedido: Pedido) => {
    if (pedido.nombreCliente) return pedido.nombreCliente;
    if (pedido.tipoPedido === "SALON" && pedido.mesaId) {
      const mesa = mesas.find((item) => item._id === pedido.mesaId);
      if (mesa) return `Mesa ${mesa.numero}`;
    }
    return "Cliente sin nombre";
  };

  const pedidosPorDia = pedidosPaginados.reduce((acc, pedido) => {
    const dia = dayjs(pedido.fechaPedido).format("dddd DD [de] MMMM");
    if (!acc[dia]) acc[dia] = [];
    acc[dia].push(pedido);
    return acc;
  }, {} as Record<string, Pedido[]>);

  return (
    <div className="contenedor-lista">
      <Typography variant="h4" mb={2}><InventoryIcon />HISTORIAL DE PEDIDOS</Typography>
      <div className="filtros">
        <TextField label="Buscar por cliente" variant="outlined" value={filtros.usuario} onChange={(e) => { setPaginaActual(1); setFiltros({ ...filtros, usuario: e.target.value }); }} size="small" />
        <TextField label="Método de pago" variant="outlined" select value={filtros.metodoPago} onChange={(e) => { setPaginaActual(1); setFiltros({ ...filtros, metodoPago: e.target.value as MetodoPago | "" }); }} size="small">
          <MenuItem value="">Todos</MenuItem>
          {METODOS_PAGO.map((mp) => <MenuItem key={mp} value={mp}>{ETIQUETAS_METODO_PAGO[mp]}</MenuItem>)}
        </TextField>
        <TextField label="Tipo de pedido" variant="outlined" select value={filtros.tipoPedido} onChange={(e) => { setPaginaActual(1); setFiltros({ ...filtros, tipoPedido: e.target.value as TipoPedido | "" }); }} size="small">
          <MenuItem value="">Todos</MenuItem>
          {(getSession()?.orderTypes ?? ["DELIVERY", "TAKEAWAY"]).map((tipo) => <MenuItem key={tipo} value={tipo}>{ETIQUETAS_TIPO_PEDIDO[tipo]}</MenuItem>)}
        </TextField>
        <TextField label="Estado" variant="outlined" select value={estadoPedido} onChange={(e) => { setPaginaActual(1); setEstadoPedido(e.target.value as EstadoPedido | ""); }} size="small">
          <MenuItem value="">Todos</MenuItem>
          {ESTADOS_PEDIDO.map((estado) => <MenuItem key={estado} value={estado}>{ETIQUETAS_ESTADO_PEDIDO[estado]}</MenuItem>)}
        </TextField>
        <button className="btn-fechas" onClick={() => setMostrarCalendario(!mostrarCalendario)}>📅 Seleccionar Fechas</button>
        <button className="btn-limpiar" onClick={() => { setPaginaActual(1); setFiltros({ usuario: "", metodoPago: "", tipoPedido: "", fechas: { startDate: undefined, endDate: undefined, key: "selection" } }); setEstadoPedido(""); }}>Limpiar filtros ❌</button>
      </div>

      {mostrarCalendario && <div ref={calendarioRef} className="popup-calendario"><DateRange editableDateInputs onChange={(item) => { setPaginaActual(1); setFiltros({ ...filtros, fechas: item.selection }); }} moveRangeOnFirstSelection={false} ranges={[filtros.fechas]} locale={es} maxDate={new Date()} /></div>}

      <div className="filtros-aplicados">
        {filtros.usuario && <span className="filtro-aplicado" onClick={() => quitarFiltro("usuario")}>Cliente: {filtros.usuario} ×</span>}
        {filtros.metodoPago && <span className="filtro-aplicado" onClick={() => quitarFiltro("metodoPago")}>Pago: {ETIQUETAS_METODO_PAGO[filtros.metodoPago]} ×</span>}
        {filtros.tipoPedido && <span className="filtro-aplicado" onClick={() => quitarFiltro("tipoPedido")}>Tipo: {ETIQUETAS_TIPO_PEDIDO[filtros.tipoPedido]} ×</span>}
        {estadoPedido && <span className="filtro-aplicado" onClick={() => quitarFiltro("estadoPedido")}>Estado: {ETIQUETAS_ESTADO_PEDIDO[estadoPedido]} ×</span>}
        {filtros.fechas.startDate && filtros.fechas.endDate && <span className="filtro-aplicado" onClick={() => quitarFiltro("fechas")}>Fechas: {dayjs(filtros.fechas.startDate).format("DD/MM/YYYY")} - {dayjs(filtros.fechas.endDate).format("DD/MM/YYYY")} ×</span>}
      </div>

      <div className="lista-pedidos">
        {Object.entries(pedidosPorDia).map(([dia, pedidosDia]) => <div key={dia}>
          <h3 className="fecha-header">{dia}</h3>
          {pedidosDia.map((pedido) => <div key={pedido._id} className={`pedido-item ${expandedId === pedido._id ? "expandido" : ""}`} onClick={() => setExpandedId((prev) => prev === pedido._id ? null : pedido._id)}>
            <div className="resumen">
              <strong>{obtenerNombrePedido(pedido)}</strong> - {etiquetaEstadoVisual(pedido)} - ${(pedido.totalFinal ?? pedido.total).toLocaleString("es-AR")}
              <br /><small>{dayjs(pedido.fechaPedido).format("HH:mm")} hs</small>
            </div>
            {expandedId === pedido._id && <div className="detalle">
              <Button size="small" variant="outlined" onClick={(event) => { event.stopPropagation(); void abrirDetalle(pedido._id); }}>Ver detalle</Button>
              {canPrintSale && pedido.estadoPago === "PAGADO" && pedido.estadoPedido !== "CANCELADO" && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PrintIcon />}
                  onClick={(event) => {
                    event.stopPropagation();
                    void imprimirVenta(pedido);
                  }}
                >
                  Ticket
                </Button>
              )}
              {canEditOrders && !pedido.cierre?.cerrado && pedido.estadoPedido === "ABIERTO" && <Button size="small" variant="outlined" onClick={(event) => { event.stopPropagation(); void abrirDetalle(pedido._id); }}>Editar</Button>}
              {canCancelOrders && !pedido.cierre?.cerrado && !["ENTREGADO", "CANCELADO"].includes(pedido.estadoPedido) && <Button size="small" color="error" variant="outlined" onClick={(event) => { event.stopPropagation(); void abrirDetalle(pedido._id); }}>Cancelar</Button>}
              <p>📞 Teléfono: {pedido.telefono || "-"}</p>
              <p>🚚 Tipo de pedido: {ETIQUETAS_TIPO_PEDIDO[pedido.tipoPedido]}</p>
              <p>💳 Estado de pago: {pedido.estadoPago}</p>
              <p>💳 Pagos: {pedido.pagos.some((pago) => pago.estado !== "ANULADO") ? pedido.pagos.filter((pago) => pago.estado !== "ANULADO").map((pago) => `${ETIQUETAS_METODO_PAGO[pago.metodo]} ${pago.monto.toLocaleString("es-AR")}`).join(" · ") : "Pendiente"}</p>
              {pedido.direccion && <p>🏠 Dirección: {pedido.direccion}</p>}
              {pedido.comentario && <p>💬 Comentario: {pedido.comentario}</p>}
              <ul>{pedido.productos.map((prod, i) => <li key={`${pedido._id}-${i}`}>{prod.cantidad} x {prod.nombreSnapshot} (${prod.precioUnitario.toLocaleString("es-AR")})</li>)}</ul>
            </div>}
          </div>)}
        </div>)}
      </div>

      <Dialog open={Boolean(pedidoSeleccionado)} onClose={() => setPedidoSeleccionado(null)} maxWidth="sm" fullWidth>
        <DialogTitle className="pedido-dialog-title">
          Pedido #{pedidoSeleccionado?._id.slice(-6)}
        </DialogTitle>
        <DialogContent className="pedido-dialog-content">
          {mensajeAccion && <Alert severity={mensajeAccion.includes("correctamente") ? "success" : "error"} sx={{ mb: 2 }}>{mensajeAccion}</Alert>}
          {pedidoSeleccionado && (
            <>
              <div className="pedido-meta">
                <div><span>Estado</span><strong>{etiquetaEstadoVisual(pedidoSeleccionado)}</strong></div>
                <div><span>Tipo</span><strong>{ETIQUETAS_TIPO_PEDIDO[pedidoSeleccionado.tipoPedido]}</strong></div>
                <div><span>{pedidoSeleccionado.tipoPedido === "SALON" && pedidoSeleccionado.mesaId ? "Mesa" : "Cliente"}</span><strong>{obtenerNombrePedido(pedidoSeleccionado)}</strong></div>
              </div>
              {canChangeStatus && !pedidoSeleccionado.cierre?.cerrado && !modoEdicion && obtenerEstadosPermitidos(pedidoSeleccionado).length > 0 && (
                <div className="pedido-estado-accion">
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Avanzar estado"
                    value=""
                    onChange={(event) => void actualizarEstado(event.target.value as EstadoPedido)}
                  >
                    {obtenerEstadosPermitidos(pedidoSeleccionado).map((estado) => (
                      <MenuItem key={estado} value={estado}>
                        {ETIQUETAS_ESTADO_PEDIDO[estado]}
                      </MenuItem>
                    ))}
                  </TextField>
                </div>
              )}
              <div className="pedido-info-secundaria">
                <span>Teléfono: {pedidoSeleccionado.telefono || "-"}</span>
                <span>Pago: {pedidoSeleccionado.estadoPago}</span>
                {pedidoSeleccionado.direccion && <span>Dirección: {pedidoSeleccionado.direccion}</span>}
              </div>
              {modoEdicion && pedidoSeleccionado.estadoPedido === "ABIERTO" ? (
                <>
                  <div className="agregar-producto">
                    <TextField select fullWidth size="small" label="Agregar producto" value={productoParaAgregar} onChange={(event) => setProductoParaAgregar(event.target.value)}>
                      <MenuItem value="">Seleccionar producto</MenuItem>
                      {productosDisponibles.filter((producto) => producto.disponible && !productosEdicion.some((item) => item.productoId === producto._id)).map((producto) => (
                        <MenuItem key={producto._id} value={producto._id}>{producto.nombre} — ${producto.precio.toLocaleString("es-AR")}</MenuItem>
                      ))}
                    </TextField>
                    <Button variant="outlined" onClick={agregarProductoEdicion} disabled={!productoParaAgregar}>Agregar</Button>
                  </div>
                  <div className="pedido-productos-lista">
                    {productosEdicion.map((producto, index) => (
                      <div className="pedido-producto" key={`${producto.productoId}-${index}`}>
                        <div className="pedido-producto-info">
                          <strong>{producto.nombreSnapshot}</strong>
                          <span>${producto.precioUnitario.toLocaleString("es-AR")} c/u</span>
                        </div>
                        <TextField type="number" size="small" label="Cantidad" value={producto.cantidad} inputProps={{ min: 1 }} onChange={(event) => actualizarCantidad(index, Math.max(1, Number(event.target.value)))} />
                        <span className="pedido-producto-subtotal">${(producto.precioUnitario * producto.cantidad).toLocaleString("es-AR")}</span>
                        <Button color="error" size="small" onClick={() => quitarProducto(index)}>Quitar</Button>
                      </div>
                    ))}
                  </div>
                  <div className="pedido-total">
                    <span>Total recalculado</span>
                    <strong>${productosEdicion.reduce((total, producto) => total + producto.precioUnitario * producto.cantidad, 0).toLocaleString("es-AR")}</strong>
                  </div>
                </>
              ) : (
                <div className="pedido-productos-lista">
                  {pedidoSeleccionado.productos.map((producto, index) => (
                    <div className="pedido-producto" key={`${producto.productoId}-${index}`}>
                      <div className="pedido-producto-info">
                        <strong>{producto.nombreSnapshot}</strong>
                        <span>{producto.cantidad} × ${producto.precioUnitario.toLocaleString("es-AR")}</span>
                      </div>
                      <span className="pedido-producto-subtotal">${producto.subtotal.toLocaleString("es-AR")}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions className="pedido-dialog-actions">
          {pedidoSeleccionado && canPrintSale && pedidoSeleccionado.estadoPago === "PAGADO" && pedidoSeleccionado.estadoPedido !== "CANCELADO" && !modoEdicion && (
            <Button startIcon={<PrintIcon />} onClick={() => void imprimirVenta(pedidoSeleccionado)}>
              Ticket
            </Button>
          )}
          {pedidoSeleccionado && canEditOrders && !pedidoSeleccionado.cierre?.cerrado && pedidoSeleccionado.estadoPedido === "ABIERTO" && !modoEdicion && <Button onClick={() => { setModoEdicion(true); void cargarProductosDisponibles(); }}>Editar</Button>}
          {pedidoSeleccionado && modoEdicion && <Button onClick={() => setModoEdicion(false)}>Cancelar edición</Button>}
          {pedidoSeleccionado && modoEdicion && <Button variant="contained" disabled={guardando || productosEdicion.length === 0} onClick={() => void guardarEdicion()}>Guardar cambios</Button>}
          {pedidoSeleccionado && canCancelOrders && !pedidoSeleccionado.cierre?.cerrado && !["ENTREGADO", "CANCELADO"].includes(pedidoSeleccionado.estadoPedido) && !modoEdicion && <Button color="error" onClick={() => void cancelarPedido()}>Cancelar pedido</Button>}
          <Button onClick={() => setPedidoSeleccionado(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {totalPaginas > 1 && <div className="paginacion"><button onClick={() => setPaginaActual((p) => Math.max(1, p - 1))} disabled={paginaActual === 1}>← Anterior</button><span>Página {paginaActual} de {totalPaginas}</span><button onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}>Siguiente →</button></div>}
    </div>
  );
};

export { ListaPedidos };


