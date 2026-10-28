import { useConsultaActual } from "../../utils/useConsultaActual";
import { Paginador } from "./Paginador";
import { consultaPaginada } from "../../utils/consultaPaginada";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import { Link } from "react-router-dom";
import PrintIcon from "@mui/icons-material/Print";
import { getSession } from "../../auth/session";
import { imprimirTicketVenta } from "../../utils/printTicket";
import {
  ETIQUETAS_ESTADO_PEDIDO,
  ETIQUETAS_METODO_PAGO,
  ETIQUETAS_TIPO_PEDIDO,
  METODOS_PAGO,
  type MetodoPago,
  type Pedido,
} from "../../types/pedido";

interface CajaActual {
  _id: string;
  estado: "ABIERTA" | "CERRADA";
  montoInicial: number;
  fechaApertura: string;
  totalesPorMetodo: Record<MetodoPago, number>;
  efectivoEsperado?: number | null;
  efectivoDeclarado?: number | null;
  diferencia?: number | null;
}

type PagosDraft = Record<string, Partial<Record<MetodoPago, string>>>;

const moneda = (monto: number) =>
  monto.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

const Caja = () => {
  const session = getSession();
  const token = session?.token;
  const [caja, setCaja] = useState<CajaActual | null>(null);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [mesas, setMesas] = useState<{ _id: string; numero: number; nombre?: string | null }[]>([]);
  const [montoInicial, setMontoInicial] = useState("");
  const [efectivoDeclarado, setEfectivoDeclarado] = useState("");
  const [descuentos, setDescuentos] = useState<Record<string, string>>({});
  const [pagosDraft, setPagosDraft] = useState<PagosDraft>({});
  const [mensaje, setMensaje] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);
  const [procesando, setProcesando] = useState(false);

  const api = useCallback(async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(
        body?.error?.message ?? body?.message ?? "No se pudo completar la operación",
      );
    }
    return body;
  }, [token]);

  const iniciarConsulta = useConsultaActual();
  const refrescar = useCallback(async () => {
    const vigente = iniciarConsulta();
    if (!token) return;
    try {
      const [cajaActual, pedidosActuales, mesasActuales] = await Promise.all([
        api("/api/caja/actual"),
        consultaPaginada<Pedido[]>(`/api/pedidos?activos=true&page=${pagina}&limit=50`, token),
        api("/api/mesas"),
      ]);
      if (!vigente()) return;
      setCaja(cajaActual);
      setPedidos(pedidosActuales.datos);
      setTotal(pedidosActuales.total);
      if (pagina > 1 && (pagina - 1) * 50 >= pedidosActuales.total) setPagina(Math.max(1, Math.ceil(pedidosActuales.total / 50)));
      setMesas(mesasActuales);
    } catch (error) {
      if (!vigente()) return;
      setMensaje({ tipo: "error", texto: error instanceof Error ? error.message : "Error cargando caja" });
    }
  }, [api, token, pagina, iniciarConsulta]);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  const pedidosActivos = useMemo(
    () => pedidos.filter((pedido) => pedido.estadoPedido !== "CANCELADO" && !pedido.cierre?.cerrado),
    [pedidos],
  );

  const obtenerIdentificacionPedido = (pedido: Pedido) => {
    if (pedido.tipoPedido === "SALON" && pedido.mesaId) {
      const mesa = mesas.find((item) => item._id === pedido.mesaId);
      if (mesa) {
        const nombre = mesa.nombre?.trim();
        const nombreGenerico = nombre && /^mesa\s+\d+$/i.test(nombre);
        return nombre && !nombreGenerico
          ? `Mesa ${mesa.numero} · ${nombre}`
          : `Mesa ${mesa.numero}`;
      }
      return "Mesa";
    }

    return pedido.nombreCliente || "Sin nombre";
  };

  const obtenerMotivoBloqueoCierre = (pedido: Pedido) => {
    if (pedido.estadoPago !== "PAGADO") {
      return "Falta registrar el cobro completo.";
    }

    if (pedido.tipoPedido === "SALON") {
      if (pedido.estadoPedido === "SERVIDO") return null;
      if (pedido.estadoPedido === "ENTREGADO") {
        return "Este pedido de salón tiene un estado histórico inconsistente (ENTREGADO). No puede cerrarse automáticamente.";
      }
      if (pedido.estadoPedido === "LISTO") {
        return "Debe marcarse como SERVIDO antes de cerrar.";
      }
      if (pedido.estadoPedido === "EN_COCINA") {
        return "Todavía está EN COCINA. Debe pasar a LISTO y luego SERVIDO.";
      }
      return `Debe completar el flujo de salón hasta SERVIDO. Estado actual: ${ETIQUETAS_ESTADO_PEDIDO[pedido.estadoPedido]}.`;
    }

    if (pedido.estadoPedido === "ENTREGADO") return null;

    if (pedido.tipoPedido === "TAKEAWAY" && pedido.estadoPedido === "LISTO") {
      return "Debe marcarse como ENTREGADO antes de cerrar.";
    }

    if (pedido.tipoPedido === "DELIVERY") {
      if (pedido.estadoPedido === "LISTO") {
        return "Debe pasar a EN CAMINO y luego ENTREGADO antes de cerrar.";
      }
      if (pedido.estadoPedido === "EN_CAMINO") {
        return "Debe marcarse como ENTREGADO antes de cerrar.";
      }
    }

    return `Debe completar el flujo operativo hasta ENTREGADO. Estado actual: ${ETIQUETAS_ESTADO_PEDIDO[pedido.estadoPedido]}.`;
  };

  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    setProcesando(true);
    setMensaje(null);
    try {
      await accion();
      setMensaje({ tipo: "success", texto: exito });
      await refrescar();
    } catch (error) {
      setMensaje({ tipo: "error", texto: error instanceof Error ? error.message : "No se pudo completar la operación" });
    } finally {
      setProcesando(false);
    }
  };

  const abrirCaja = () => ejecutar(
    () => api("/api/caja/abrir", {
      method: "POST",
      body: JSON.stringify({ montoInicial: Number(montoInicial) }),
    }),
    "Caja abierta correctamente.",
  );

  const cerrarCaja = () => ejecutar(
    () => api("/api/caja/cerrar", {
      method: "POST",
      body: JSON.stringify({ efectivoDeclarado: Number(efectivoDeclarado) }),
    }),
    "Caja cerrada correctamente.",
  );

  const aplicarDescuento = (pedido: Pedido) => ejecutar(
    () => api(`/api/pedidos/${pedido._id}/descuento`, {
      method: "PATCH",
      body: JSON.stringify({ porcentaje: Number(descuentos[pedido._id] ?? 0) }),
    }),
    "Descuento actualizado.",
  );

  const cambiarPago = (pedidoId: string, metodo: MetodoPago, value: string) => {
    setPagosDraft((actual) => ({
      ...actual,
      [pedidoId]: {
        ...(actual[pedidoId] ?? {}),
        [metodo]: value,
      },
    }));
  };

  const pagosDelPedido = (pedido: Pedido) =>
    METODOS_PAGO
      .map((metodo) => ({
        metodo,
        monto: Number(pagosDraft[pedido._id]?.[metodo] ?? 0),
      }))
      .filter((pago) => pago.monto > 0);

  const cobrar = (pedido: Pedido) => ejecutar(
    () => api(`/api/pedidos/${pedido._id}/cobrar`, {
      method: "POST",
      body: JSON.stringify({ pagos: pagosDelPedido(pedido) }),
    }),
    "Cobro registrado correctamente.",
  );

  const anularCobro = (pedido: Pedido) => ejecutar(
    () => api(`/api/pedidos/${pedido._id}/anular-cobro`, { method: "POST" }),
    "Cobro anulado. El historial se conserva.",
  );

  const cerrarPedido = (pedido: Pedido) => ejecutar(
    () => api(`/api/pedidos/${pedido._id}/cerrar`, { method: "POST" }),
    "Pedido cerrado correctamente.",
  );

  const imprimirVenta = async (pedido: Pedido) => {
    if (!token) return;
    try {
      await imprimirTicketVenta(pedido._id, token);
      setMensaje(null);
    } catch (error) {
      setMensaje({
        tipo: "error",
        texto: error instanceof Error ? error.message : "No se pudo imprimir el ticket.",
      });
    }
  };

  if (!caja) {
    return (
      <Box className="caja-page" sx={{ maxWidth: 720 }}>
        <Typography variant="h4" mb={3}><PointOfSaleIcon /> CAJA</Typography>
        {mensaje && <Alert severity={mensaje.tipo} sx={{ mb: 2 }}>{mensaje.texto}</Alert>}
        <Card>
          <CardContent>
            <Typography variant="h6" mb={2}>Apertura de caja</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Monto inicial"
                type="number"
                value={montoInicial}
                onChange={(event) => setMontoInicial(event.target.value)}
                inputProps={{ min: 0, step: "0.01" }}
                fullWidth
              />
              <Button
                variant="contained"
                disabled={procesando || montoInicial === "" || Number(montoInicial) < 0}
                onClick={abrirCaja}
              >
                Abrir caja
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box className="caja-page">
      <Typography variant="h4" mb={3}><PointOfSaleIcon /> CAJA</Typography>
      {mensaje && <Alert severity={mensaje.tipo} sx={{ mb: 2 }}>{mensaje.texto}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6">Caja abierta</Typography>
          <Typography>Monto inicial: {moneda(caja.montoInicial)}</Typography>
          <Typography variant="body2" color="text.secondary">
            Apertura: {new Date(caja.fechaApertura).toLocaleString("es-AR")}
          </Typography>

          <Divider sx={{ my: 2 }} />
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} useFlexGap flexWrap="wrap">
            {METODOS_PAGO.map((metodo) => (
              <Box key={metodo}>
                <Typography variant="caption">{ETIQUETAS_METODO_PAGO[metodo]}</Typography>
                <Typography fontWeight={700}>{moneda(caja.totalesPorMetodo?.[metodo] ?? 0)}</Typography>
              </Box>
            ))}
          </Stack>

          <Divider sx={{ my: 2 }} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Efectivo declarado al cierre"
              type="number"
              value={efectivoDeclarado}
              onChange={(event) => setEfectivoDeclarado(event.target.value)}
              inputProps={{ min: 0, step: "0.01" }}
            />
            <Button
              color="warning"
              variant="contained"
              disabled={procesando || efectivoDeclarado === "" || Number(efectivoDeclarado) < 0}
              onClick={cerrarCaja}
            >
              Cerrar caja
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Typography variant="h5" mb={2}>Pedidos por cobrar / cerrar</Typography>

      <Paginador pagina={pagina} total={total} limite={50} cambiar={setPagina} ocupado={procesando} />
      <Stack spacing={2}>
        {pedidosActivos.map((pedido) => {
          const totalFinal = pedido.totalFinal ?? pedido.total;
          const sumaIngresada = pagosDelPedido(pedido).reduce((sum, pago) => sum + pago.monto, 0);
          const restante = Math.round((totalFinal - sumaIngresada) * 100) / 100;
          const motivoBloqueoCierre = obtenerMotivoBloqueoCierre(pedido);
          const puedeCerrar = motivoBloqueoCierre === null;

          return (
            <Card key={pedido._id}>
              <CardContent>
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
                  <Box>
                    <Typography variant="h6">
                      Pedido #{pedido._id.slice(-6)} · {ETIQUETAS_TIPO_PEDIDO[pedido.tipoPedido]}
                    </Typography>
                    <Typography variant="body2">
                      {obtenerIdentificacionPedido(pedido)} · {pedido.estadoPedido} · Pago: {pedido.estadoPago}
                    </Typography>
                  </Box>
                  <Box textAlign={{ md: "right" }}>
                    <Typography>Original: {moneda(pedido.total)}</Typography>
                    <Typography>
                      Descuento: {pedido.descuento?.porcentaje ?? 0}% ({moneda(pedido.descuento?.monto ?? 0)})
                    </Typography>
                    <Typography fontWeight={800}>Total: {moneda(totalFinal)}</Typography>
                  </Box>
                </Stack>

                <Divider sx={{ my: 2 }} />

                {pedido.pagos.length === 0 && (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mb={2}>
                    <TextField
                      label="Descuento %"
                      type="number"
                      value={descuentos[pedido._id] ?? String(pedido.descuento?.porcentaje ?? 0)}
                      onChange={(event) => setDescuentos((actual) => ({
                        ...actual,
                        [pedido._id]: event.target.value,
                      }))}
                      inputProps={{ min: 0, max: 100, step: "0.01" }}
                    />
                    <Button variant="outlined" disabled={procesando} onClick={() => aplicarDescuento(pedido)}>
                      Aplicar descuento
                    </Button>
                  </Stack>
                )}

                {pedido.estadoPago !== "PAGADO" && totalFinal > 0 && (
                  <>
                    <Typography fontWeight={700} mb={1}>Composición del cobro</Typography>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                      {METODOS_PAGO.map((metodo) => (
                        <TextField
                          key={metodo}
                          label={ETIQUETAS_METODO_PAGO[metodo]}
                          type="number"
                          value={pagosDraft[pedido._id]?.[metodo] ?? ""}
                          onChange={(event) => cambiarPago(pedido._id, metodo, event.target.value)}
                          inputProps={{ min: 0, step: "0.01" }}
                          fullWidth
                        />
                      ))}
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} mt={2} spacing={1}>
                      <Typography color={restante === 0 ? "success.main" : "text.secondary"}>
                        Ingresado: {moneda(sumaIngresada)} · Restante: {moneda(restante)}
                      </Typography>
                      <Button
                        variant="contained"
                        disabled={procesando || restante !== 0 || pagosDelPedido(pedido).length === 0}
                        onClick={() => cobrar(pedido)}
                      >
                        Confirmar cobro
                      </Button>
                    </Stack>
                  </>
                )}

                {pedido.estadoPago === "PAGADO" && (
                  <>
                    <Typography fontWeight={700}>
                      {pedido.pagos.length === 0 ? "Pedido sin saldo por descuento" : "Cobro registrado"}
                    </Typography>
                    {pedido.pagos.length > 0 && (
                      <Typography variant="body2" mb={2}>
                        {pedido.pagos
                          .filter((pago) => pago.estado !== "ANULADO")
                          .map((pago) => `${ETIQUETAS_METODO_PAGO[pago.metodo]} ${moneda(pago.monto)}`)
                          .join(" · ")}
                      </Typography>
                    )}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <Button
                        variant="outlined"
                        startIcon={<PrintIcon />}
                        disabled={procesando}
                        onClick={() => void imprimirVenta(pedido)}
                      >
                        Imprimir ticket
                      </Button>
                      {pedido.pagos.some((pago) => pago.estado !== "ANULADO") && (
                        <Button
                          color="error"
                          variant="outlined"
                          disabled={procesando}
                          onClick={() => anularCobro(pedido)}
                        >
                          Anular cobro
                        </Button>
                      )}
                      <Button
                        variant="contained"
                        disabled={procesando || !puedeCerrar}
                        onClick={() => cerrarPedido(pedido)}
                      >
                        Cerrar pedido
                      </Button>
                    </Stack>
                    {!puedeCerrar && motivoBloqueoCierre && (
                      <Alert severity="info" sx={{ mt: 1 }}>
                        {motivoBloqueoCierre}
                        {pedido.estadoPago === "PAGADO" && (
                          <Button
                            component={Link}
                            to="/panel/pedidos"
                            size="small"
                            sx={{ ml: 1 }}
                          >
                            Ir a Pedidos
                          </Button>
                        )}
                      </Alert>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}

        {pedidosActivos.length === 0 && (
          <Typography color="text.secondary">No hay pedidos pendientes de cobro o cierre.</Typography>
        )}
      </Stack>
    </Box>
  );
};

export default Caja;


