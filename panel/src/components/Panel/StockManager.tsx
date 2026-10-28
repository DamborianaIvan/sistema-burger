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
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { getSession } from "../../auth/session";
import {
  TIPOS_MOVIMIENTO_MANUAL,
  UNIDADES_INGREDIENTE,
  type Ingrediente,
  type MovimientoStock,
  type ProductoStock,
  type Receta,
  type TipoMovimientoManual,
  type UnidadIngrediente,
} from "../../types/stock";

const API_URL = import.meta.env.VITE_API_URL;

type TabStock = "ingredientes" | "recetas" | "movimientos";

interface IngredienteForm {
  nombre: string;
  unidad: UnidadIngrediente;
  stockMinimo: string;
  stockInicial: string;
}

interface ComponenteDraft {
  ingredienteId: string;
  cantidad: string;
}

const numero = (valor: number) =>
  valor.toLocaleString("es-AR", { maximumFractionDigits: 6 });

const nombreIngrediente = (valor: MovimientoStock["ingredienteId"]) =>
  typeof valor === "string" ? valor : valor.nombre;

const StockManager = () => {
  const session = getSession();
  const token = session?.token ?? "";
  const [tab, setTab] = useState<TabStock>("ingredientes");
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [alertas, setAlertas] = useState<Ingrediente[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalMovimientos, setTotalMovimientos] = useState(0);
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([]);
  const [productos, setProductos] = useState<ProductoStock[]>([]);
  const [mensaje, setMensaje] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);
  const [cargando, setCargando] = useState(false);

  const [ingredienteDialog, setIngredienteDialog] = useState(false);
  const [ingredienteEditando, setIngredienteEditando] = useState<Ingrediente | null>(null);
  const [ingredienteForm, setIngredienteForm] = useState<IngredienteForm>({
    nombre: "",
    unidad: "KG",
    stockMinimo: "0",
    stockInicial: "0",
  });

  const [movimientoDialog, setMovimientoDialog] = useState(false);
  const [ingredienteMovimiento, setIngredienteMovimiento] = useState<Ingrediente | null>(null);
  const [tipoMovimiento, setTipoMovimiento] = useState<TipoMovimientoManual>("ENTRADA");
  const [cantidadMovimiento, setCantidadMovimiento] = useState("");
  const [stockObjetivo, setStockObjetivo] = useState("");
  const [motivoMovimiento, setMotivoMovimiento] = useState("");

  const [recetaDialog, setRecetaDialog] = useState(false);
  const [productoRecetaId, setProductoRecetaId] = useState("");
  const [componentes, setComponentes] = useState<ComponenteDraft[]>([]);
  const [ingredienteRecetaId, setIngredienteRecetaId] = useState("");
  const [cantidadReceta, setCantidadReceta] = useState("");

  const api = useCallback(async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body?.error?.message ?? body?.message ?? "No se pudo completar la operación");
    }
    return body;
  }, [token]);

  const iniciarConsulta = useConsultaActual();
  const cargar = useCallback(async () => {
    const vigente = iniciarConsulta();
    if (!token) return;
    setCargando(true);
    try {
      const [ingredientesData, alertasData, recetasData, movimientosData, productosData] = await Promise.all([
        api("/api/stock/ingredientes"),
        api("/api/stock/alertas"),
        api("/api/stock/recetas"),
        consultaPaginada<MovimientoStock[]>(`/api/stock/movimientos?page=${pagina}&limit=50`, token),
        fetch(`${API_URL}/api/productos`, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => {
          if (!response.ok) throw new Error("No se pudieron cargar los productos");
          return response.json();
        }),
      ]);

      if (!vigente()) return;
      setIngredientes(ingredientesData);
      setAlertas(alertasData);
      setRecetas(recetasData);
      setMovimientos(movimientosData.datos);
      setTotalMovimientos(movimientosData.total);
      setProductos(Array.isArray(productosData) ? productosData : []);
      setMensaje(null);
    } catch (error) {
      if (!vigente()) return;
      setMensaje({
        tipo: "error",
        texto: error instanceof Error ? error.message : "No se pudo cargar stock",
      });
    } finally {
      if (vigente()) setCargando(false);
    }
  }, [api, token, pagina, iniciarConsulta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    try {
      await accion();
      setMensaje({ tipo: "success", texto: exito });
      await cargar();
      return true;
    } catch (error) {
      setMensaje({
        tipo: "error",
        texto: error instanceof Error ? error.message : "No se pudo completar la operación",
      });
      return false;
    }
  };

  const abrirNuevoIngrediente = () => {
    setIngredienteEditando(null);
    setIngredienteForm({
      nombre: "",
      unidad: "KG",
      stockMinimo: "0",
      stockInicial: "0",
    });
    setIngredienteDialog(true);
  };

  const abrirEditarIngrediente = (ingrediente: Ingrediente) => {
    setIngredienteEditando(ingrediente);
    setIngredienteForm({
      nombre: ingrediente.nombre,
      unidad: ingrediente.unidad,
      stockMinimo: String(ingrediente.stockMinimo),
      stockInicial: "0",
    });
    setIngredienteDialog(true);
  };

  const guardarIngrediente = async () => {
    const payload = {
      nombre: ingredienteForm.nombre,
      unidad: ingredienteForm.unidad,
      stockMinimo: Number(ingredienteForm.stockMinimo),
      ...(ingredienteEditando ? {} : { stockInicial: Number(ingredienteForm.stockInicial) }),
    };

    const ok = await ejecutar(
      () => api(
        ingredienteEditando
          ? `/api/stock/ingredientes/${ingredienteEditando._id}`
          : "/api/stock/ingredientes",
        {
          method: ingredienteEditando ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      ),
      ingredienteEditando ? "Ingrediente actualizado." : "Ingrediente creado.",
    );

    if (ok) setIngredienteDialog(false);
  };

  const cambiarEstadoIngrediente = (ingrediente: Ingrediente) =>
    ejecutar(
      () => api(`/api/stock/ingredientes/${ingrediente._id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !ingrediente.activo }),
      }),
      ingrediente.activo ? "Ingrediente desactivado." : "Ingrediente reactivado.",
    );

  const abrirMovimiento = (ingrediente: Ingrediente) => {
    setIngredienteMovimiento(ingrediente);
    setTipoMovimiento("ENTRADA");
    setCantidadMovimiento("");
    setStockObjetivo(String(ingrediente.stockActual));
    setMotivoMovimiento("");
    setMovimientoDialog(true);
  };

  const guardarMovimiento = async () => {
    if (!ingredienteMovimiento) return;

    const payload = tipoMovimiento === "AJUSTE"
      ? {
          tipo: tipoMovimiento,
          stockObjetivo: Number(stockObjetivo),
          motivo: motivoMovimiento,
        }
      : {
          tipo: tipoMovimiento,
          cantidad: Number(cantidadMovimiento),
          motivo: motivoMovimiento,
        };

    const ok = await ejecutar(
      () => api(`/api/stock/ingredientes/${ingredienteMovimiento._id}/movimientos`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
      "Movimiento registrado.",
    );

    if (ok) setMovimientoDialog(false);
  };

  const productoDeReceta = (receta: Receta) =>
    typeof receta.productoId === "string" ? null : receta.productoId;

  const abrirNuevaReceta = () => {
    setProductoRecetaId("");
    setComponentes([]);
    setIngredienteRecetaId("");
    setCantidadReceta("");
    setRecetaDialog(true);
  };

  const abrirEditarReceta = (receta: Receta) => {
    const producto = productoDeReceta(receta);
    if (!producto) return;

    setProductoRecetaId(producto._id);
    setComponentes(receta.componentes.map((componente) => ({
      ingredienteId: typeof componente.ingredienteId === "string"
        ? componente.ingredienteId
        : componente.ingredienteId._id,
      cantidad: String(componente.cantidad),
    })));
    setIngredienteRecetaId("");
    setCantidadReceta("");
    setRecetaDialog(true);
  };

  const agregarComponente = () => {
    if (!ingredienteRecetaId || !cantidadReceta || Number(cantidadReceta) <= 0) return;
    if (componentes.some((componente) => componente.ingredienteId === ingredienteRecetaId)) {
      setMensaje({ tipo: "error", texto: "Ese ingrediente ya está en la receta." });
      return;
    }

    setComponentes((actuales) => [
      ...actuales,
      { ingredienteId: ingredienteRecetaId, cantidad: cantidadReceta },
    ]);
    setIngredienteRecetaId("");
    setCantidadReceta("");
  };

  const guardarReceta = async () => {
    if (!productoRecetaId || componentes.length === 0) return;

    const ok = await ejecutar(
      () => api(`/api/stock/recetas/${productoRecetaId}`, {
        method: "PUT",
        body: JSON.stringify({
          componentes: componentes.map((componente) => ({
            ingredienteId: componente.ingredienteId,
            cantidad: Number(componente.cantidad),
          })),
        }),
      }),
      "Receta guardada.",
    );

    if (ok) setRecetaDialog(false);
  };

  const cambiarEstadoReceta = (receta: Receta) => {
    const producto = productoDeReceta(receta);
    if (!producto) return Promise.resolve(false);

    return ejecutar(
      () => api(`/api/stock/recetas/${producto._id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ activa: !receta.activa }),
      }),
      receta.activa ? "Receta desactivada." : "Receta activada.",
    );
  };

  const ingredientesActivos = useMemo(
    () => ingredientes.filter((ingrediente) => ingrediente.activo),
    [ingredientes],
  );

  return (
    <Box className="stock-page">
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2} mb={2}>
        <Box>
          <Typography variant="h4"><Inventory2Icon /> STOCK</Typography>
          <Typography color="text.secondary">
            Ingredientes, recetas, movimientos y alertas de inventario.
          </Typography>
        </Box>
        <Button variant="outlined" disabled={cargando} onClick={() => void cargar()}>
          Actualizar
        </Button>
      </Stack>

      {mensaje && <Alert severity={mensaje.tipo} sx={{ mb: 2 }}>{mensaje.texto}</Alert>}

      {alertas.length > 0 && (
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
          <strong>{alertas.length} ingrediente(s) con stock bajo.</strong>{" "}
          {alertas.map((item) => `${item.nombre}: ${numero(item.stockActual)} ${item.unidad}`).join(" · ")}
        </Alert>
      )}

      <Tabs value={tab} onChange={(_, value: TabStock) => setTab(value)} sx={{ mb: 3 }}>
        <Tab value="ingredientes" label="Ingredientes" />
        <Tab value="recetas" label="Recetas" />
        <Tab value="movimientos" label="Movimientos" />
      </Tabs>

      {tab === "ingredientes" && (
        <>
          <Button startIcon={<AddIcon />} variant="contained" onClick={abrirNuevoIngrediente} sx={{ mb: 2 }}>
            Nuevo ingrediente
          </Button>

          <Stack spacing={2}>
            {ingredientes.map((ingrediente) => (
              <Card key={ingrediente._id} variant="outlined">
                <CardContent>
                  <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="h6">{ingrediente.nombre}</Typography>
                        {!ingrediente.activo && <Chip size="small" label="Inactivo" />}
                        {ingrediente.stockBajo && ingrediente.activo && (
                          <Chip size="small" color="warning" label="Stock bajo" />
                        )}
                      </Stack>
                      <Typography color="text.secondary">
                        Mínimo: {numero(ingrediente.stockMinimo)} {ingrediente.unidad}
                      </Typography>
                    </Box>
                    <Box textAlign={{ md: "right" }}>
                      <Typography variant="h5" fontWeight={800}>
                        {numero(ingrediente.stockActual)} {ingrediente.unidad}
                      </Typography>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} mt={1}>
                        <Button size="small" variant="outlined" onClick={() => abrirEditarIngrediente(ingrediente)}>
                          Editar
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<SwapVertIcon />}
                          disabled={!ingrediente.activo}
                          onClick={() => abrirMovimiento(ingrediente)}
                        >
                          Movimiento
                        </Button>
                        <Button
                          size="small"
                          color={ingrediente.activo ? "warning" : "success"}
                          onClick={() => void cambiarEstadoIngrediente(ingrediente)}
                        >
                          {ingrediente.activo ? "Desactivar" : "Reactivar"}
                        </Button>
                      </Stack>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            ))}
            {ingredientes.length === 0 && (
              <Typography color="text.secondary">Todavía no hay ingredientes registrados.</Typography>
            )}
          </Stack>
        </>
      )}

      {tab === "recetas" && (
        <>
          <Button startIcon={<RestaurantMenuIcon />} variant="contained" onClick={abrirNuevaReceta} sx={{ mb: 2 }}>
            Nueva receta
          </Button>

          <Stack spacing={2}>
            {recetas.map((receta) => {
              const producto = productoDeReceta(receta);
              if (!producto) return null;
              return (
                <Card key={receta._id} variant="outlined">
                  <CardContent>
                    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="h6">{producto.nombre}</Typography>
                          <Chip size="small" label={producto.categoria} />
                          {!receta.activa && <Chip size="small" label="Receta inactiva" />}
                        </Stack>
                        <Box mt={1}>
                          {receta.componentes.map((componente, index) => {
                            const ingrediente = typeof componente.ingredienteId === "string"
                              ? null
                              : componente.ingredienteId;
                            return (
                              <Typography key={index} variant="body2">
                                {ingrediente?.nombre ?? "Ingrediente"}: {numero(componente.cantidad)} {ingrediente?.unidad ?? ""}
                              </Typography>
                            );
                          })}
                        </Box>
                      </Box>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <Button variant="outlined" onClick={() => abrirEditarReceta(receta)}>Editar</Button>
                        <Button
                          color={receta.activa ? "warning" : "success"}
                          onClick={() => void cambiarEstadoReceta(receta)}
                        >
                          {receta.activa ? "Desactivar" : "Activar"}
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
            {recetas.length === 0 && (
              <Typography color="text.secondary">Todavía no hay recetas configuradas.</Typography>
            )}
          </Stack>
        </>
      )}

      {tab === "movimientos" && (
        <Stack spacing={1.5}>
          <Paginador pagina={pagina} total={totalMovimientos} limite={50} cambiar={setPagina} ocupado={cargando} />
          {movimientos.map((movimiento) => (
            <Card key={movimiento._id} variant="outlined">
              <CardContent>
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1}>
                  <Box>
                    <Typography fontWeight={700}>
                      {nombreIngrediente(movimiento.ingredienteId)} · {movimiento.tipo}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(movimiento.fecha).toLocaleString("es-AR")}
                      {movimiento.motivo ? ` · ${movimiento.motivo}` : ""}
                    </Typography>
                  </Box>
                  <Typography>
                    {numero(movimiento.stockAnterior)} → {numero(movimiento.stockPosterior)}
                    {" "}({numero(movimiento.cantidad)})
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          ))}
          {movimientos.length === 0 && (
            <Typography color="text.secondary">Todavía no hay movimientos registrados.</Typography>
          )}
        </Stack>
      )}

      <Dialog open={ingredienteDialog} onClose={() => setIngredienteDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{ingredienteEditando ? "Editar ingrediente" : "Nuevo ingrediente"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Nombre"
              value={ingredienteForm.nombre}
              onChange={(event) => setIngredienteForm((actual) => ({ ...actual, nombre: event.target.value }))}
            />
            <TextField
              select
              label="Unidad"
              value={ingredienteForm.unidad}
              onChange={(event) => setIngredienteForm((actual) => ({
                ...actual,
                unidad: event.target.value as UnidadIngrediente,
              }))}
            >
              {UNIDADES_INGREDIENTE.map((unidad) => (
                <MenuItem key={unidad} value={unidad}>{unidad}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Stock mínimo"
              type="number"
              value={ingredienteForm.stockMinimo}
              onChange={(event) => setIngredienteForm((actual) => ({ ...actual, stockMinimo: event.target.value }))}
            />
            {!ingredienteEditando && (
              <TextField
                label="Stock inicial"
                type="number"
                value={ingredienteForm.stockInicial}
                onChange={(event) => setIngredienteForm((actual) => ({ ...actual, stockInicial: event.target.value }))}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIngredienteDialog(false)}>Cancelar</Button>
          <Button variant="contained" onClick={() => void guardarIngrediente()}>Guardar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={movimientoDialog} onClose={() => setMovimientoDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Movimiento · {ingredienteMovimiento?.nombre}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              select
              label="Tipo"
              value={tipoMovimiento}
              onChange={(event) => setTipoMovimiento(event.target.value as TipoMovimientoManual)}
            >
              {TIPOS_MOVIMIENTO_MANUAL.map((tipo) => (
                <MenuItem key={tipo} value={tipo}>{tipo}</MenuItem>
              ))}
            </TextField>
            {tipoMovimiento === "AJUSTE" ? (
              <TextField
                label="Stock objetivo"
                type="number"
                value={stockObjetivo}
                onChange={(event) => setStockObjetivo(event.target.value)}
              />
            ) : (
              <TextField
                label="Cantidad"
                type="number"
                value={cantidadMovimiento}
                onChange={(event) => setCantidadMovimiento(event.target.value)}
              />
            )}
            <TextField
              label={tipoMovimiento === "MERMA" || tipoMovimiento === "AJUSTE" ? "Motivo (obligatorio)" : "Motivo"}
              value={motivoMovimiento}
              onChange={(event) => setMotivoMovimiento(event.target.value)}
              multiline
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMovimientoDialog(false)}>Cancelar</Button>
          <Button variant="contained" onClick={() => void guardarMovimiento()}>Registrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={recetaDialog} onClose={() => setRecetaDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Receta</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              select
              label="Producto"
              value={productoRecetaId}
              onChange={(event) => {
                const id = event.target.value;
                setProductoRecetaId(id);
                const existente = recetas.find((receta) => {
                  const producto = productoDeReceta(receta);
                  return producto?._id === id;
                });
                setComponentes(existente?.componentes.map((componente) => ({
                  ingredienteId: typeof componente.ingredienteId === "string"
                    ? componente.ingredienteId
                    : componente.ingredienteId._id,
                  cantidad: String(componente.cantidad),
                })) ?? []);
              }}
            >
              {productos.map((producto) => (
                <MenuItem key={producto._id} value={producto._id}>
                  {producto.nombre} · {producto.categoria}
                </MenuItem>
              ))}
            </TextField>

            <Divider />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                select
                fullWidth
                label="Ingrediente"
                value={ingredienteRecetaId}
                onChange={(event) => setIngredienteRecetaId(event.target.value)}
              >
                {ingredientesActivos.map((ingrediente) => (
                  <MenuItem key={ingrediente._id} value={ingrediente._id}>
                    {ingrediente.nombre} ({ingrediente.unidad})
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Cantidad"
                type="number"
                value={cantidadReceta}
                onChange={(event) => setCantidadReceta(event.target.value)}
              />
              <Button variant="outlined" onClick={agregarComponente}>Agregar</Button>
            </Stack>

            {componentes.map((componente, index) => {
              const ingrediente = ingredientes.find((item) => item._id === componente.ingredienteId);
              return (
                <Stack key={componente.ingredienteId} direction="row" justifyContent="space-between" alignItems="center">
                  <Typography>
                    {ingrediente?.nombre ?? "Ingrediente"} · {componente.cantidad} {ingrediente?.unidad ?? ""}
                  </Typography>
                  <IconButton
                    color="error"
                    onClick={() => setComponentes((actuales) => actuales.filter((_, i) => i !== index))}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Stack>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecetaDialog(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!productoRecetaId || componentes.length === 0}
            onClick={() => void guardarReceta()}
          >
            Guardar receta
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StockManager;


