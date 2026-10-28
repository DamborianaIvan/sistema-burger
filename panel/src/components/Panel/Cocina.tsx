import { useConsultaActual } from "../../utils/useConsultaActual";
import { Paginador } from "./Paginador";
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Chip, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import { getSession } from "../../auth/session";
import { ETIQUETAS_TIPO_PEDIDO, type Pedido, type TipoPedido } from "../../types/pedido";
import { ProductosPedido } from "./ProductosPedido";
import "./Cocina.css";

const API_URL = import.meta.env.VITE_API_URL;
const POLLING_MS = 5000;

interface MesaCocina {
  _id: string;
  numero: number;
  nombre?: string;
}

interface PedidoCocina extends Omit<Pedido, "mesaId"> {
  mesaId: string | MesaCocina | null;
}

const esMesaCocina = (mesa: PedidoCocina["mesaId"]): mesa is MesaCocina =>
  typeof mesa === "object" && mesa !== null;

const formatHora = (fecha: string) =>
  new Date(fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

const Cocina = () => {
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [pedidos, setPedidos] = useState<PedidoCocina[]>([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState("");

  const session = getSession();
  const isChef = session?.rol === "CHEF";
  const token = session?.token || "";
  const axiosConfig = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  const iniciarConsulta = useConsultaActual();
  const cargarPedidos = useCallback(async (silencioso = false) => {
    const vigente = iniciarConsulta();
    if (!silencioso) setCargando(true);

    try {
      const response = await axios.get<PedidoCocina[]>(
        `${API_URL}/api/pedidos/cocina?page=${pagina}&limit=50`,
        axiosConfig
      );
      if (!vigente()) return;
      setPedidos(response.data);
      const cantidad = Number(response.headers["x-total-count"] ?? 0);
      setTotal(cantidad);
      if (pagina > 1 && (pagina - 1) * 50 >= cantidad) setPagina(Math.max(1, Math.ceil(cantidad / 50)));
      setError("");
    } catch (requestError) {
      if (!vigente()) return;
      console.error("Error obteniendo pedidos de cocina", requestError);
      if (!silencioso) setError("No se pudieron cargar los pedidos de cocina.");
    } finally {
      if (vigente() && !silencioso) setCargando(false);
    }
  }, [axiosConfig, pagina, iniciarConsulta]);

  useEffect(() => {
    void cargarPedidos();

    const intervalId = window.setInterval(() => {
      void cargarPedidos(true);
    }, POLLING_MS);

    return () => window.clearInterval(intervalId);
  }, [cargarPedidos]);

  const marcarComoListo = async (pedidoId: string) => {
    setActualizando(true);

    try {
      await axios.patch(`${API_URL}/api/pedidos/${pedidoId}/listo`, {}, axiosConfig);
      await cargarPedidos(true);
      setError("");
    } catch (requestError) {
      console.error("Error marcando pedido como listo", requestError);
      setError("No se pudo marcar el pedido como listo. Actualizá la vista e intentá nuevamente.");
    } finally {
      setActualizando(false);
    }
  };

  const renderContexto = (pedido: PedidoCocina) => {
    if (pedido.tipoPedido === "SALON") {
      if (esMesaCocina(pedido.mesaId)) {
        return `Mesa ${pedido.mesaId.numero}`;
      }
      return "Salón";
    }

    if (isChef) return ETIQUETAS_TIPO_PEDIDO[pedido.tipoPedido];

    if (pedido.tipoPedido === "DELIVERY") {
      return [pedido.nombreCliente, pedido.direccion].filter(Boolean).join(" · ")
        || ETIQUETAS_TIPO_PEDIDO[pedido.tipoPedido as TipoPedido];
    }

    return pedido.nombreCliente || ETIQUETAS_TIPO_PEDIDO[pedido.tipoPedido as TipoPedido];
  };

  return (
    <Box className="cocina-container">
      <Box className="cocina-header">
        <Box>
          <Typography variant="h4">COCINA</Typography>
          <Typography color="text.secondary">
            Pedidos pendientes de preparación. Se actualiza automáticamente.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => void cargarPedidos()}
          disabled={cargando || actualizando}
        >
          Actualizar
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paginador pagina={pagina} total={total} limite={50} cambiar={setPagina} ocupado={cargando} />
      {cargando ? (
        <Box className="cocina-estado">
          <CircularProgress />
          <Typography color="text.secondary">Cargando pedidos...</Typography>
        </Box>
      ) : pedidos.length === 0 ? (
        <Box className="cocina-estado">
          <CheckCircleOutlineIcon fontSize="large" />
          <Typography variant="h6">No hay pedidos pendientes</Typography>
          <Typography color="text.secondary">
            Los nuevos pedidos aparecerán automáticamente.
          </Typography>
        </Box>
      ) : (
        <Box className="cocina-grid">
          {pedidos.map((pedido) => (
            <Card key={pedido._id} className="cocina-card pedido-lectura">
              <CardContent>
                <Box className="cocina-card-header">
                  <Box>
                    <Typography variant="h6" component="h2">
                      Pedido #{pedido._id.slice(-6)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" component="time" dateTime={pedido.fechaPedido}>
                      Ingresó a las {formatHora(pedido.fechaPedido)}
                    </Typography>
                  </Box>
                  <Chip label={ETIQUETAS_TIPO_PEDIDO[pedido.tipoPedido]} size="small" />
                </Box>

                <Typography className="cocina-contexto" variant="subtitle1">
                  {renderContexto(pedido)}
                </Typography>

                <ProductosPedido productos={pedido.productos} />

                {pedido.comentario && (
                  <Box className="pedido-nota">
                    <span className="pedido-nota-titulo">Indicaciones de preparación</span>
                    <span className="pedido-nota-texto">{pedido.comentario}</span>
                  </Box>
                )}

                <Button
                  fullWidth
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleOutlineIcon />}
                  onClick={() => void marcarComoListo(pedido._id)}
                  disabled={actualizando}
                >
                  Marcar como listo
                </Button>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default Cocina;



