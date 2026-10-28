import { useConsultaActual } from "../../utils/useConsultaActual";
import { Paginador } from "./Paginador";
import { consultaPaginada } from "../../utils/consultaPaginada";
import { useCallback, useEffect, useState } from "react";
import { TextField, MenuItem, Box, Typography, Button } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import InventoryIcon from "@mui/icons-material/Inventory";
import { Link } from "react-router-dom";
import { getSession } from "../../auth/session";
import { hasPermission, PERMISSIONS } from "../../types/auth";
import { ProductosPedido } from "./ProductosPedido";
import "./Dashboard.css";

import { ETIQUETAS_ESTADO_PEDIDO, ETIQUETAS_TIPO_PEDIDO, type EstadoPedido, type Pedido } from "../../types/pedido";

interface Mesa {
  _id: string;
  numero: number;
  nombre?: string | null;
}
export const Dashboard = () => {
 const [resumen, setResumen] = useState({
    totalMes: 0,
    pedidosAbiertos: 0,
    pedidosDia: 0,
    salonActivos: 0,
    deliveryActivos: 0,
    takeawayActivos: 0
  });
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const session = getSession();
  const token = session?.token;
  const rol = session?.rol ?? null;
  const salonHabilitado = session?.orderTypes?.includes("SALON") ?? false;
  const canCreateOrders = rol ? hasPermission(rol, PERMISSIONS.ORDERS_CREATE) : false;
  const canChangeStatus = rol ? hasPermission(rol, PERMISSIONS.ORDERS_CHANGE_STATUS) : false;
  const canCancelOrders = rol ? hasPermission(rol, PERMISSIONS.ORDERS_CANCEL) : false;
  const [snackbar, setSnackbar] = useState<{ mensaje: string; tipo: "ok" | "error" } | null>(null);
  const [mostrarDashboardCards, setMostrarDashboardCards] = useState(true);

  const iniciarConsulta = useConsultaActual();
  const obtenerPedidos = useCallback(async () => {
    const vigente = iniciarConsulta();
    try {
      const { datos, total } = await consultaPaginada<{ resumen: typeof resumen; pedidos: Pedido[] }>(`/api/pedidos/resumen?page=${pagina}&limit=20`, token);
      if (!vigente()) return;
      setResumen(datos.resumen);
      setPedidos(datos.pedidos);
      setTotal(total);
      if (pagina > 1 && (pagina - 1) * 20 >= total) setPagina(Math.max(1, Math.ceil(total / 20)));
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/mesas`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setMesas(await res.json());
    } catch {
      if (!vigente()) return;
      setSnackbar({ mensaje: "Error cargando pedidos", tipo: "error" });
    }
  }, [token, pagina, iniciarConsulta]);

  useEffect(() => {
    obtenerPedidos();
    const intervalo = setInterval(obtenerPedidos, 65000);
    return () => clearInterval(intervalo);
  }, [obtenerPedidos]);

  const actualizarEstado = async (id: string, nuevoEstado: EstadoPedido) => {
    const token = session?.token;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/pedidos/${id}/estado`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ estadoPedido: nuevoEstado }),
      });

      if (res.ok) {
        const actualizado = await res.json();
        await obtenerPedidos();
        setPedidos((prev) =>
          prev.map((p) => (p._id === id ? actualizado : p))
        );
        setSnackbar({ mensaje: "✅ Estado actualizado correctamente.", tipo: "ok" });
      } else {
        setSnackbar({ mensaje: "❌ Error al actualizar estado.", tipo: "error" });
      }
    } catch {
      setSnackbar({ mensaje: "❌ Error al actualizar estado.", tipo: "error" });
    }

    setTimeout(() => setSnackbar(null), 3000);
  };

  const cancelarPedido = async (id: string) => {
    const token = session?.token;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/pedidos/${id}/cancelar`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        setSnackbar({ mensaje: "❌ No se pudo cancelar el pedido.", tipo: "error" });
        return;
      }

      await obtenerPedidos();
      setSnackbar({ mensaje: "✅ Pedido cancelado correctamente.", tipo: "ok" });
    } catch {
      setSnackbar({ mensaje: "❌ Error al cancelar el pedido.", tipo: "error" });
    }

    setTimeout(() => setSnackbar(null), 3000);
  };

  const obtenerEstadosPermitidos = (pedido: Pedido): EstadoPedido[] => {
    const transiciones: Record<EstadoPedido, EstadoPedido[]> = {
      ABIERTO: ["CONFIRMADO"], CONFIRMADO: ["EN_COCINA"],
      EN_COCINA: ["LISTO"], LISTO: pedido.tipoPedido === "DELIVERY" ? ["EN_CAMINO"] : pedido.tipoPedido === "SALON" ? ["SERVIDO"] : ["ENTREGADO"],
      SERVIDO: [], EN_CAMINO: ["ENTREGADO", "CANCELADO"], ENTREGADO: [], CANCELADO: [],
    };
    return transiciones[pedido.estadoPedido];
  };

  const formatoPesos = (monto: number) =>
    monto.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
    });

  const obtenerEtiquetaMesa = (pedido: Pedido) => {
    const mesa = mesas.find((item) => item._id === pedido.mesaId);
    return mesa?.nombre || (mesa ? `Mesa ${mesa.numero}` : "Mesa sin asignar");
  };

  return (
    <div className="dashboard-page">
           
      <Box
        className="dashboard-header"
        onClick={() => setMostrarDashboardCards(!mostrarDashboardCards)}
        sx={{
          display: "flex",
          alignItems: "flex-start",
          cursor: "pointer",
          userSelect: "none",
          gap: 1,
          mb: 2,
        }}
      >
        <span style={{ fontSize: "1.2rem" }}>{mostrarDashboardCards ? "▼" : "►"}</span>
        <DashboardIcon />
        <Typography variant="h4" component="span">
          DASHBOARD
        </Typography>
         {canCreateOrders && <Link to="/panel/nuevo-pedido">
                  <button type="button" className="login-button">
                    NUEVO PEDIDO
                  </button>
                </Link>}
      </Box>


      {mostrarDashboardCards && (
        <div className="dashboard-cards">

          <div className="card">
            <div className="card-label">
              Abiertos
            </div>
            <div className="card-number highlight-orange">
              {resumen.pedidosAbiertos}
            </div>
          </div>

          {salonHabilitado && (          <div className="card">
            <div className="card-label">
              Salón activos
            </div>
            <div className="card-number">
              {resumen.salonActivos}
            </div>
          </div>)}

          <div className="card">
            <div className="card-label">
              Delivery activos
            </div>
            <div className="card-number">
              {resumen.deliveryActivos}
            </div>
          </div>

          <div className="card">
            <div className="card-label">
              Takeaway activos
            </div>
            <div className="card-number">
              {resumen.takeawayActivos}
            </div>
          </div>

          <div className="card">
            <div className="card-label">
              Pedidos del día
            </div>
            <div className="card-number">
              {resumen.pedidosDia}
            </div>
          </div>

          <div className="card">
            <div className="card-label">
              Pedidos del mes
            </div>
            <div className="card-number highlight-blue">
              {resumen.totalMes}
            </div>
          </div>

        </div>
      )}

      {snackbar && (
        <div className={`snackbar ${snackbar.tipo === "ok" ? "snackbar-ok" : "snackbar-error"}`}>
          {snackbar.mensaje}
        </div>
      )}


  <div className="pedidos-section">
        <Typography variant="h4" mb={1}>
          <InventoryIcon /> PEDIDOS PARA HOY
        </Typography> 
      </div>
      
   
      <Paginador pagina={pagina} total={total} limite={20} cambiar={setPagina} />
      <div className="pedidos-cards">
        {pedidos.map((pedido) => (
          <div className="pedido-card pedido-lectura" key={pedido._id} data-estado={pedido.estadoPedido}>
            <div className="pedido-card-encabezado">
              <span className="pedido-card-id">Pedido #{pedido._id.slice(-6)}</span>
              <span className="pedido-card-tipo">{ETIQUETAS_TIPO_PEDIDO[pedido.tipoPedido]}</span>
            </div>
            <h3 className="pedido-card-contexto">
              {pedido.tipoPedido === "SALON" ? obtenerEtiquetaMesa(pedido) : pedido.nombreCliente || "Sin nombre"}
            </h3>
            <div className="pedido-card-seguimiento">
              <span className="pedido-card-estado">{ETIQUETAS_ESTADO_PEDIDO[pedido.estadoPedido]}</span>
              <time dateTime={pedido.fechaPedido}>
                {new Date(pedido.fechaPedido).toLocaleString("es-AR", {
                  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                })}
              </time>
            </div>
            <ProductosPedido productos={pedido.productos} />
            {((pedido.tipoPedido !== "SALON" && pedido.telefono) || (pedido.tipoPedido === "DELIVERY" && pedido.direccion) || pedido.comentario) && (
              <details className="pedido-card-detalles">
                <summary>{pedido.tipoPedido === "SALON" ? "Ver comentario" : "Ver datos y comentario"}</summary>
                <div className="pedido-card-detalles-contenido">
                  {pedido.tipoPedido !== "SALON" && (
                    <dl className="pedido-card-datos">
                      {pedido.telefono && <div><dt>Teléfono</dt><dd>{pedido.telefono}</dd></div>}
                      {pedido.tipoPedido === "DELIVERY" && pedido.direccion && (
                        <div><dt>Dirección</dt><dd>{pedido.direccion}</dd></div>
                      )}
                    </dl>
                  )}
                  {pedido.comentario && (
                    <div className="pedido-nota">
                      <span className="pedido-nota-titulo">Comentario</span>
                      <span className="pedido-nota-texto">{pedido.comentario}</span>
                    </div>
                  )}
                </div>
              </details>
            )}
            <div className="pedido-card-cobro">
              <div>
                <span className="pedido-card-etiqueta">Total</span>
                <strong className="pedido-card-total">{formatoPesos(pedido.totalFinal ?? pedido.total)}</strong>
              </div>
              <span className="pedido-card-pago">
                Pago: {pedido.estadoPago === "PAGADO" ? "Pagado" : pedido.estadoPago === "ANULADO" ? "Anulado" : "Pendiente"}
              </span>
            </div>
            <div className="pedido-card-acciones">
              {/* Select para delivery */}
              {canChangeStatus && rol === "DELIVERY" && obtenerEstadosPermitidos(pedido).length > 0 &&
                (pedido.estadoPedido === "LISTO" || pedido.estadoPedido === "EN_CAMINO") && (
                  <TextField
                    select
                    label="Estado"
                    value=""
                    onChange={(e) => actualizarEstado(pedido._id, e.target.value as EstadoPedido)}
                    size="small"
                    fullWidth
                    variant="outlined"
                    style={{ marginTop: "0.5rem" }}
                  >
                    {pedido.estadoPedido === "LISTO" &&
                      [
                        <MenuItem key="en-camino" value="EN_CAMINO">En camino</MenuItem>,
                        <MenuItem key="entregado" value="ENTREGADO">Entregado</MenuItem>,
                      ]
                    }
                    {pedido.estadoPedido === "EN_CAMINO" && (
                      <MenuItem key="entregado" value="ENTREGADO">Entregado</MenuItem>
                    )}
                  </TextField>
                )}

              {canCancelOrders && obtenerEstadosPermitidos(pedido).length > 0 && (
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  aria-label="Cancelar pedido"
                  onClick={() => void cancelarPedido(pedido._id)}
                  sx={{ marginTop: "0.5rem" }}
                >
                  Cancelar
                </Button>
              )}

              {/* Select para admin */}
              {rol === "ADMIN" && obtenerEstadosPermitidos(pedido).length > 0 && (
                <TextField
                  select
                  label="Estado"
                  value=""
                  onChange={(e) => actualizarEstado(pedido._id, e.target.value as EstadoPedido)}
                  size="small"
                  fullWidth
                  variant="outlined"
                  style={{ marginTop: "0.5rem" }}
                >
                 {
                  obtenerEstadosPermitidos(pedido).map(
                    estado => (
                      <MenuItem
                        key={estado}
                        value={estado}
                      >
                        {
                          ETIQUETAS_ESTADO_PEDIDO[estado]
                        }
                      </MenuItem>
                    )
                  )
  }
                </TextField>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};



