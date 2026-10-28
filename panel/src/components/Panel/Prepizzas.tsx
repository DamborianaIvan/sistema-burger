import { useConsultaActual } from "../../utils/useConsultaActual";
import { Paginador } from "./Paginador";
import { consultaPaginada } from "../../utils/consultaPaginada";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { getSession } from "../../auth/session";
import { hasPermission, PERMISSIONS } from "../../types/auth";
import {
  ETIQUETAS_METODO_PAGO,
  METODOS_PAGO,
  type MetodoPago,
} from "../../types/pedido";
import type {
  Comercio,
  Pedido,
  ResumenPrepizzas,
  Variedad,
} from "../../types/prepizzas";
import "./Prepizzas.css";
const API_URL = import.meta.env.VITE_API_URL ?? "";
const dinero = (n: number) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const fecha = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Sin registros";
const vacio: ResumenPrepizzas = {
  variedades: [],
  comercios: [],
  pedidos: [],
  movimientos: [],
};
type Modal =
  | "variedad"
  | "comercio"
  | "movimiento"
  | "pedido"
  | "cobro"
  | "contacto"
  | "entregar"
  | "cancelar"
  | null;
interface Ingrediente {
  _id: string;
  nombre: string;
  unidad: string;
  activo: boolean;
}
interface Linea {
  variedadId: string;
  cantidad: string;
  precioUnitario: string;
}
export default function Prepizzas() {
  const session = getSession();
  const token = session?.token ?? "";
  const permitido =
    !!session && hasPermission(session.rol, PERMISSIONS.PREPIZZAS_OPERATE);
  const administrar =
    !!session && hasPermission(session.rol, PERMISSIONS.STOCK_ADJUST);
  const [datos, setDatos] = useState(vacio);
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [tab, setTab] = useState("stock");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [errorModal, setErrorModal] = useState("");
  const [exito, setExito] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [editando, setEditando] = useState<Variedad | Comercio | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [historialId, setHistorialId] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [totalPedidos, setTotalPedidos] = useState(0);
  const [filtroComercio, setFiltroComercio] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [receta, setReceta] = useState<
    { ingredienteId: string; cantidad: string }[]
  >([]);
  const [consumir, setConsumir] = useState(false);
  const [clave, setClave] = useState("");
  const api = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message ?? "No se pudo completar la operación",
        );
      return body;
    },
    [token],
  );
  const iniciarConsulta = useConsultaActual();
  const cargar = useCallback(async () => {
    const vigente = iniciarConsulta();
    setCargando(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(pagina), limit: '50' });
      if (filtroComercio) params.set('comercioId', filtroComercio);
      if (filtroEstado) params.set('estado', filtroEstado);
      const { datos: resumen, total } = await consultaPaginada<typeof datos>(`/api/prepizzas/resumen?${params}`, token);
      if (!vigente()) return;
      setDatos(resumen);
      setTotalPedidos(total);
      if (pagina > 1 && (pagina - 1) * 50 >= total) setPagina(Math.max(1, Math.ceil(total / 50)));
      if (administrar)
        setIngredientes(
          (await api("/api/stock/ingredientes")).filter(
            (i: Ingrediente) => i.activo,
          ),
        );
    } catch (e) {
      if (!vigente()) return;
      setError(
        e instanceof Error ? e.message : "No se pudieron cargar los datos",
      );
    } finally {
      if (vigente()) setCargando(false);
    }
  }, [api, administrar, pagina, filtroComercio, filtroEstado, token, iniciarConsulta]);
  useEffect(() => {
    if (permitido) void cargar();
  }, [cargar, permitido]);
  const campo = (nombre: string, valor: string) =>
    setForm((f) => ({ ...f, [nombre]: valor }));
  const abrir = (tipo: Modal, registro?: Variedad | Comercio, p?: Pedido) => {
    setEditando(registro ?? null);
    setPedido(p ?? null);
    setErrorModal("");
    setClave(crypto.randomUUID());
    setConsumir(false);
    setForm({
      nombre: registro?.nombre ?? "",
      precio: registro && "precio" in registro ? String(registro.precio) : "0",
      direccion: registro && "direccion" in registro ? registro.direccion : "",
      telefono: registro && "telefono" in registro ? registro.telefono : "",
      diasSeguimiento:
        registro && "diasSeguimiento" in registro
          ? String(registro.diasSeguimiento)
          : "5",
      diasHastaContacto:
        registro && "diasSeguimiento" in registro
          ? String(registro.diasSeguimiento)
          : "5",
      comercioId: datos.comercios.some(c => c._id === filtroComercio && c.activo) ? filtroComercio : "",
      variedadId: "",
      cantidad: "",
      monto: p ? String(p.saldo) : "",
      metodo: METODOS_PAGO[0],
      tipo: "PRODUCCION",
      motivo: "",
      observaciones: "",
      nota: "",
    });
    setLineas([{ variedadId: "", cantidad: "1", precioUnitario: "" }]);
    setReceta(
      registro && "componentes" in registro
        ? registro.componentes.map((c) => ({
            ingredienteId: c.ingredienteId,
            cantidad: String(c.cantidad),
          }))
        : [],
    );
    setModal(tipo);
  };
  const ejecutar = (path: string, body: unknown, method = "POST") =>
    api(`/api/prepizzas${path}`, { method, body: JSON.stringify(body) });
  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    setErrorModal("");
    setExito("");
    try {
      if (modal === "variedad")
        await ejecutar(
          `/variedades${editando ? `/${editando._id}` : ""}`,
          { nombre: form.nombre, precio: form.precio, componentes: receta },
          editando ? "PATCH" : "POST",
        );
      if (modal === "comercio")
        await ejecutar(
          `/comercios${editando ? `/${editando._id}` : ""}`,
          {
            nombre: form.nombre,
            direccion: form.direccion,
            telefono: form.telefono,
            diasSeguimiento: form.diasSeguimiento,
          },
          editando ? "PATCH" : "POST",
        );
      if (modal === "movimiento")
        await ejecutar("/movimientos", {
          ...form,
          claveOperacion: clave,
          consumirIngredientes: consumir,
        });
      if (modal === "pedido")
        await ejecutar("/pedidos", {
          comercioId: form.comercioId,
          observaciones: form.observaciones,
          items: lineas,
          claveOperacion: clave,
        });
      if (modal === "cobro" && pedido)
        await ejecutar(`/pedidos/${pedido._id}/cobros`, {
          monto: form.monto,
          metodo: form.metodo,
          claveOperacion: clave,
        });
      if (modal === "contacto" && editando)
        await ejecutar(`/comercios/${editando._id}/contactos`, {
          nota: form.nota,
          diasHastaContacto: form.diasHastaContacto,
        });
      if (modal === "entregar" && pedido)
        await ejecutar(`/pedidos/${pedido._id}/entregar`, {});
      if (modal === "cancelar" && pedido)
        await ejecutar(`/pedidos/${pedido._id}/cancelar`, {
          motivo: form.motivo,
        });
      setModal(null);
      setExito("Operación registrada correctamente.");
      await cargar();
    } catch (e) {
      setErrorModal(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };
  const cambiarEstado = async (registro: Variedad | Comercio) => {
    setGuardando(true);
    setError("");
    try {
      const variedad = "activa" in registro;
      await ejecutar(
        `/${variedad ? "variedades" : "comercios"}/${registro._id}`,
        variedad ? { activa: !registro.activa } : { activo: !registro.activo },
        "PATCH",
      );
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado");
    } finally {
      setGuardando(false);
    }
  };
  const input = (
    key: string,
    label: string,
    type = "text",
    required = true,
    min?: number,
    max?: number,
  ) => (
    <TextField
      key={key}
      label={label}
      type={type}
      value={form[key] ?? ""}
      required={required}
      onChange={(e) => campo(key, e.target.value)}
      fullWidth
      slotProps={{
        htmlInput: {
          min,
          max,
          step:
            type === "number"
              ? ["precio", "monto"].includes(key)
                ? "0.01"
                : "1"
              : undefined,
        },
      }}
    />
  );
  const activos = datos.variedades.filter((v) => v.activa);
  const alertas = datos.comercios.filter((c) => c.requiereContacto);
  const pedidos = datos.pedidos;
  const detalle = datos.pedidos.find((p) => p._id === detalleId);
  const comercioHistorial = datos.comercios.find((c) => c._id === historialId);
  if (!permitido)
    return (
      <Alert severity="warning">
        No tenés permisos para acceder a Prepizzas.
      </Alert>
    );
  return (
    <Box className="prepizzas-page">
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        gap={2}
        flexWrap="wrap"
      >
        <Box>
          <Typography variant="h4" fontWeight={800}>
            Prepizzas
          </Typography>
          <Typography color="text.secondary">
            Producción, comercios y entregas en un solo lugar.
          </Typography>
        </Box>
        <Button onClick={() => void cargar()} disabled={cargando || guardando}>
          Actualizar
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {exito && (
        <Alert severity="success" onClose={() => setExito("")}>
          {exito}
        </Alert>
      )}
      <div className="prepizzas-metricas">
        {[
          [
            "Disponibles en el negocio",
            datos.variedades.filter(v => v.activa).reduce((s, v) => s + v.stockActual, 0),
          ],
          ["Comercios activos", datos.comercios.filter((c) => c.activo).length],
          [
            "Saldo pendiente total",
            dinero(datos.comercios.reduce((s, c) => s + c.saldo, 0)),
          ],
        ].map(([label, valor]) => (
          <Card key={label}>
            <CardContent>
              <Typography color="text.secondary">{label}</Typography>
              <Typography variant="h4">{valor}</Typography>
            </CardContent>
          </Card>
        ))}
      </div>
      {alertas.length > 0 && (
        <Alert
          severity="info"
          action={
            <Button onClick={() => setTab("comercios")}>Ver comercios</Button>
          }
        >
          Hay {alertas.length} comercio(s) para consultar por reposición.
        </Alert>
      )}
      <Tabs
        value={tab}
        onChange={(_, v: string) => setTab(v)}
        variant="scrollable"
        allowScrollButtonsMobile
        aria-label="Secciones de prepizzas"
      >
        <Tab value="stock" label="Stock" />
        <Tab value="comercios" label="Comercios" />
        <Tab value="pedidos" label="Pedidos y entregas" />
      </Tabs>
      {cargando ? (
        <Box py={4} textAlign="center">
          <CircularProgress aria-label="Cargando prepizzas" />
        </Box>
      ) : (
        <>
          {tab === "stock" && (
            <>
              <Stack direction="row" gap={1} flexWrap="wrap">
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  Stock de prepizzas elaboradas
                </Typography>
                {administrar && (
                  <>
                    <Button onClick={() => abrir("variedad")}>
                      Nueva variedad
                    </Button>
                    <Button
                      variant="contained"
                      disabled={!activos.length || guardando}
                      onClick={() => abrir("movimiento")}
                    >
                      Registrar producción / baja
                    </Button>
                  </>
                )}
              </Stack>
              {!datos.variedades.length && (
                <Alert severity="info">
                  Todavía no hay variedades. Agregá la primera para comenzar.
                </Alert>
              )}
              <div className="prepizzas-cards">
                {datos.variedades.map((v) => (
                  <Card key={v._id}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="h6">{v.nombre}</Typography>
                        <Chip
                          size="small"
                          label={v.activa ? "Activa" : "Inactiva"}
                        />
                      </Stack>
                      <Typography variant="h3" mt={2}>
                        {v.stockActual}
                        <Typography component="span" ml={1}>
                          unidades
                        </Typography>
                      </Typography>
                      <Typography color="text.secondary">
                        Precio sugerido: {dinero(v.precio)}
                      </Typography>
                      <Typography color="text.secondary">
                        {v.componentes.length
                          ? `Receta: ${v.componentes.length} ingredientes por unidad`
                          : "Sin receta configurada"}
                      </Typography>
                      {administrar && (
                        <Stack direction="row" mt={2}>
                          <Button
                            disabled={guardando}
                            onClick={() => abrir("variedad", v)}
                          >
                            Editar y receta
                          </Button>
                          <Button
                            disabled={guardando}
                            onClick={() => void cambiarEstado(v)}
                          >
                            {v.activa ? "Desactivar" : "Activar"}
                          </Button>
                        </Stack>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Typography variant="h6">Últimos movimientos</Typography>
              <Typography variant="body2" color="text.secondary">
                Hasta 200 movimientos recientes. Los ingredientes se descuentan
                al producir.
              </Typography>
              <div className="prepizzas-tabla">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Variedad</th>
                      <th>Movimiento</th>
                      <th>Unidades</th>
                      <th>Stock posterior</th>
                      <th>Responsable / motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.movimientos.map((m) => (
                      <tr key={m._id}>
                        <td>{fecha(m.fecha)}</td>
                        <td>{m.nombre}</td>
                        <td>
                          {m.tipo}
                          {m.consumos.length > 0 && (
                            <small>Con consumo de ingredientes</small>
                          )}
                        </td>
                        <td>{m.cantidad}</td>
                        <td>{m.stockPosterior}</td>
                        <td>
                          {m.usuarioId?.nombre ?? "Usuario"}
                          <small>{m.motivo}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!datos.movimientos.length && (
                  <p>No hay movimientos registrados.</p>
                )}
              </div>
            </>
          )}
          {tab === "comercios" && (
            <>
              <Stack direction="row" gap={2} flexWrap="wrap">
                <TextField
                  label="Buscar comercio"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  sx={{ flexGrow: 1 }}
                />
                <Button variant="contained" onClick={() => abrir("comercio")}>
                  Agregar comercio
                </Button>
              </Stack>
              {!datos.comercios.length && (
                <Alert severity="info">
                  Agregá los comercios a los que entregás prepizzas.
                </Alert>
              )}
              <div className="prepizzas-cards">
                {datos.comercios
                  .filter((c) =>
                    c.nombre
                      .toLocaleLowerCase()
                      .includes(busqueda.toLocaleLowerCase()),
                  )
                  .map((c) => (
                    <Card key={c._id}>
                      <CardContent>
                        <Stack
                          direction="row"
                          gap={1}
                          justifyContent="space-between"
                        >
                          <Typography variant="h6">{c.nombre}</Typography>
                          <Chip
                            size="small"
                            label={c.activo ? "Activo" : "Inactivo"}
                          />
                        </Stack>
                        <Typography>
                          {c.direccion || "Sin dirección"}
                        </Typography>
                        <Typography>{c.telefono || "Sin teléfono"}</Typography>
                        <Typography mt={2}>
                          Última entrega: {fecha(c.ultimaEntrega)}
                        </Typography>
                        <Typography color="text.secondary">
                          Seguimiento cada {c.diasSeguimiento} días · Próximo:{" "}
                          {fecha(c.proximoSeguimiento)}
                        </Typography>
                        {c.requiereContacto && (
                          <Alert severity="warning" sx={{ mt: 1 }}>
                            Consultar si necesita reposición.
                          </Alert>
                        )}
                        <Typography fontWeight={700} mt={1}>
                          Pendiente: {dinero(c.saldo)}
                        </Typography>
                        <Stack direction="row" flexWrap="wrap" mt={1}>
                          <Button
                            onClick={() => {
                              setFiltroComercio(c._id);
                              setPagina(1);
                              setTab("pedidos");
                            }}
                          >
                            Ver pedidos
                          </Button>
                          <Button onClick={() => setHistorialId(c._id)}>
                            Contactos
                          </Button>
                          <Button onClick={() => abrir("comercio", c)}>
                            Editar
                          </Button>
                          {c.activo && (
                            <Button onClick={() => abrir("contacto", c)}>
                              Marcar contactado
                            </Button>
                          )}
                          <Button
                            disabled={guardando}
                            onClick={() => void cambiarEstado(c)}
                          >
                            {c.activo ? "Desactivar" : "Activar"}
                          </Button>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </>
          )}
          {tab === "pedidos" && (
            <>
              <Stack direction="row" gap={2} flexWrap="wrap">
                <TextField
                  select
                  label="Comercio"
                  value={filtroComercio}
                  onChange={(e) => { setFiltroComercio(e.target.value); setPagina(1); }}
                  sx={{ minWidth: 220 }}
                >
                  <MenuItem value="">Todos</MenuItem>
                  {datos.comercios.map((c) => (
                    <MenuItem key={c._id} value={c._id}>
                      {c.nombre}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Estado"
                  value={filtroEstado}
                  onChange={(e) => { setFiltroEstado(e.target.value); setPagina(1); }}
                  sx={{ minWidth: 190 }}
                >
                  <MenuItem value="">Todos</MenuItem>
                  <MenuItem value="PENDIENTE">Por entregar</MenuItem>
                  <MenuItem value="ENTREGADO">Entregados</MenuItem>
                  <MenuItem value="DEUDA">Con saldo pendiente</MenuItem>
                  <MenuItem value="CANCELADO">Cancelados</MenuItem>
                </TextField>
                <Button
                  variant="contained"
                  disabled={
                    !activos.length || !datos.comercios.some((c) => c.activo)
                  }
                  onClick={() => abrir("pedido")}
                >
                  Nuevo pedido
                </Button>
              </Stack>
              <div className="prepizzas-tabla">
                <table>
                  <thead>
                    <tr>
                      <th>Pedido / fecha</th>
                      <th>Comercio</th>
                      <th>Entrega</th>
                      <th>Total</th>
                      <th>Cobrado</th>
                      <th>Pendiente</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidos.map((p) => (
                      <tr key={p._id}>
                        <td>
                          #{p._id.slice(-6)}
                          <small>{fecha(p.createdAt)}</small>
                        </td>
                        <td>{p.comercioNombre}</td>
                        <td>
                          <Chip
                            size="small"
                            label={p.estado}
                            color={
                              p.estado === "ENTREGADO" ? "success" : "default"
                            }
                          />
                          <small>
                            {p.fechaEntrega && fecha(p.fechaEntrega)}
                          </small>
                        </td>
                        <td>{dinero(p.total)}</td>
                        <td>
                          {dinero(p.cobrado)}
                          <small>{p.estadoCobro}</small>
                        </td>
                        <td>
                          {p.estado === "CANCELADO" ? "—" : dinero(p.saldo)}
                        </td>
                        <td>
                          <Stack direction="row" flexWrap="wrap">
                            <Button onClick={() => setDetalleId(p._id)}>
                              Detalle
                            </Button>
                            {p.estado === "PENDIENTE" && (
                              <Button
                                onClick={() => abrir("entregar", undefined, p)}
                              >
                                Entregar
                              </Button>
                            )}
                            {p.estado !== "CANCELADO" && p.saldo > 0 && (
                              <Button
                                onClick={() => abrir("cobro", undefined, p)}
                              >
                                Cobrar
                              </Button>
                            )}
                            {p.estado === "PENDIENTE" && p.cobrado === 0 && (
                              <Button
                                color="error"
                                onClick={() => abrir("cancelar", undefined, p)}
                              >
                                Cancelar
                              </Button>
                            )}
                          </Stack>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Paginador pagina={pagina} total={totalPedidos} limite={50} cambiar={setPagina} ocupado={cargando || guardando} />
                {!pedidos.length && <p>No hay pedidos con estos filtros.</p>}
              </div>
            </>
          )}
        </>
      )}
      <Dialog
        open={modal !== null}
        onClose={() => {
          if (!guardando) setModal(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <DialogTitle>
            {
              {
                variedad: editando
                  ? "Editar variedad y receta"
                  : "Nueva variedad",
                comercio: editando ? "Editar comercio" : "Nuevo comercio",
                movimiento: "Registrar producción o baja",
                pedido: "Nuevo pedido",
                cobro: "Registrar cobro",
                contacto: "Registrar contacto",
                entregar: "Confirmar entrega",
                cancelar: "Cancelar pedido",
              }[modal ?? "variedad"]
            }
          </DialogTitle>
          <DialogContent>
            <Stack gap={2} pt={1}>
              {errorModal && <Alert severity="error">{errorModal}</Alert>}
              {modal === "variedad" && (
                <>
                  {input("nombre", "Nombre")}
                  {input(
                    "precio",
                    "Precio sugerido por unidad",
                    "number",
                    true,
                    0,
                  )}
                  <Typography fontWeight={700}>
                    Receta por una prepizza (opcional)
                  </Typography>
                  <Typography variant="body2">
                    Usá la unidad de cada ingrediente. Ejemplo: 0,2 si la harina
                    está en KG.
                  </Typography>
                  {receta.map((c, i) => (
                    <Stack key={i} direction="row" gap={1}>
                      <TextField
                        select
                        label="Ingrediente"
                        required
                        value={c.ingredienteId}
                        onChange={(e) =>
                          setReceta((r) =>
                            r.map((x, n) =>
                              n === i
                                ? { ...x, ingredienteId: e.target.value }
                                : x,
                            ),
                          )
                        }
                        fullWidth
                      >
                        {ingredientes.map((ing) => (
                          <MenuItem key={ing._id} value={ing._id}>
                            {ing.nombre} ({ing.unidad})
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        label="Cantidad"
                        required
                        type="number"
                        value={c.cantidad}
                        onChange={(e) =>
                          setReceta((r) =>
                            r.map((x, n) =>
                              n === i ? { ...x, cantidad: e.target.value } : x,
                            ),
                          )
                        }
                        slotProps={{
                          htmlInput: { min: 0.000001, step: "any" },
                        }}
                      />
                      <Button
                        aria-label={`Quitar ingrediente ${i + 1}`}
                        onClick={() =>
                          setReceta((r) => r.filter((_, n) => n !== i))
                        }
                      >
                        Quitar
                      </Button>
                    </Stack>
                  ))}
                  <Button
                    onClick={() =>
                      setReceta((r) => [
                        ...r,
                        { ingredienteId: "", cantidad: "" },
                      ])
                    }
                  >
                    Agregar ingrediente
                  </Button>
                </>
              )}
              {modal === "comercio" && (
                <>
                  {input("nombre", "Nombre del comercio")}
                  {input("direccion", "Dirección", "text", false)}
                  {input("telefono", "Teléfono", "text", false)}
                  {input(
                    "diasSeguimiento",
                    "Días entre seguimientos",
                    "number",
                    true,
                    1,
                    365,
                  )}
                </>
              )}
              {modal === "movimiento" && (
                <>
                  <TextField
                    select
                    label="Variedad"
                    required
                    value={form.variedadId}
                    onChange={(e) => campo("variedadId", e.target.value)}
                  >
                    {activos.map((v) => (
                      <MenuItem key={v._id} value={v._id}>
                        {v.nombre} · {v.stockActual} disponibles
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Movimiento"
                    value={form.tipo}
                    onChange={(e) => {
                      campo("tipo", e.target.value);
                      setConsumir(false);
                    }}
                  >
                    <MenuItem value="PRODUCCION">
                      Producción / ingreso de stock
                    </MenuItem>
                    <MenuItem value="BAJA">
                      Baja por pérdida o vencimiento
                    </MenuItem>
                  </TextField>
                  {input("cantidad", "Unidades", "number", true, 1, 1000000)}
                  {input(
                    "motivo",
                    "Motivo / observación",
                    "text",
                    form.tipo === "BAJA",
                  )}
                  {form.tipo === "PRODUCCION" && (
                    <>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={consumir}
                            onChange={(e) => setConsumir(e.target.checked)}
                          />
                        }
                        label="Descontar ingredientes según receta"
                      />
                      <Alert severity="info">
                        Para cargar stock ya elaborado, dejá la opción
                        desmarcada. Los ingredientes no se vuelven a descontar
                        al entregar.
                      </Alert>
                    </>
                  )}
                </>
              )}
              {modal === "pedido" && (
                <>
                  <TextField
                    select
                    label="Comercio"
                    value={form.comercioId}
                    required
                    onChange={(e) => campo("comercioId", e.target.value)}
                  >
                    {datos.comercios
                      .filter((c) => c.activo)
                      .map((c) => (
                        <MenuItem key={c._id} value={c._id}>
                          {c.nombre}
                        </MenuItem>
                      ))}
                  </TextField>
                  {lineas.map((l, i) => (
                    <Box key={i} className="prepizzas-linea">
                      <TextField
                        select
                        label="Variedad"
                        required
                        value={l.variedadId}
                        onChange={(e) => {
                          const v = activos.find(
                            (v) => v._id === e.target.value,
                          );
                          setLineas((ls) =>
                            ls.map((x, n) =>
                              n === i
                                ? {
                                    ...x,
                                    variedadId: e.target.value,
                                    precioUnitario: String(v?.precio ?? 0),
                                  }
                                : x,
                            ),
                          );
                        }}
                        fullWidth
                      >
                        {activos.map((v) => (
                          <MenuItem key={v._id} value={v._id}>
                            {v.nombre} · stock {v.stockActual}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Stack direction="row" gap={1} mt={1}>
                        <TextField
                          label="Unidades"
                          required
                          type="number"
                          value={l.cantidad}
                          slotProps={{
                            htmlInput: { min: 1, max: 1000000, step: 1 },
                          }}
                          onChange={(e) =>
                            setLineas((ls) =>
                              ls.map((x, n) =>
                                n === i
                                  ? { ...x, cantidad: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                        <TextField
                          label="Precio unitario"
                          required
                          type="number"
                          value={l.precioUnitario}
                          slotProps={{ htmlInput: { min: 0, step: "0.01" } }}
                          onChange={(e) =>
                            setLineas((ls) =>
                              ls.map((x, n) =>
                                n === i
                                  ? { ...x, precioUnitario: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                        <Button
                          disabled={lineas.length === 1}
                          onClick={() =>
                            setLineas((ls) => ls.filter((_, n) => n !== i))
                          }
                        >
                          Quitar
                        </Button>
                      </Stack>
                    </Box>
                  ))}
                  <Button
                    onClick={() =>
                      setLineas((ls) => [
                        ...ls,
                        { variedadId: "", cantidad: "1", precioUnitario: "" },
                      ])
                    }
                  >
                    Agregar variedad
                  </Button>
                  <Typography variant="h6">
                    Total:{" "}
                    {dinero(
                      lineas.reduce(
                        (s, l) =>
                          s +
                          Math.round(Number(l.precioUnitario) * 100) *
                            Number(l.cantidad),
                        0,
                      ) / 100,
                    )}
                  </Typography>
                  {input("observaciones", "Observaciones", "text", false)}
                  <Alert severity="info">
                    El stock se descuenta al entregar. El pedido no reserva
                    unidades. El precio acordado queda guardado.
                  </Alert>
                </>
              )}
              {modal === "cobro" && (
                <>
                  <Typography>
                    {pedido?.comercioNombre} · Saldo:{" "}
                    {dinero(pedido?.saldo ?? 0)}
                  </Typography>
                  {input(
                    "monto",
                    "Importe a cobrar",
                    "number",
                    true,
                    0.01,
                    pedido?.saldo,
                  )}
                  <TextField
                    select
                    label="Método de pago"
                    value={form.metodo}
                    onChange={(e) => campo("metodo", e.target.value)}
                  >
                    {Object.values(METODOS_PAGO).map((m) => (
                      <MenuItem key={m} value={m}>
                        {ETIQUETAS_METODO_PAGO[m]}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Alert severity="info">
                    Se registrará en la caja abierta. Podés cobrar una parte
                    ahora y el resto después.
                  </Alert>
                </>
              )}
              {modal === "contacto" && (
                <>
                  <Typography>{editando?.nombre}</Typography>
                  {input("nota", "Resultado de la consulta", "text", false)}
                  {input(
                    "diasHastaContacto",
                    "Volver a consultar en (días)",
                    "number",
                    true,
                    1,
                    365,
                  )}
                </>
              )}
              {modal === "entregar" && (
                <>
                  <Typography>
                    Confirmar entrega a {pedido?.comercioNombre}.
                  </Typography>
                  {pedido?.items.map((i) => (
                    <Typography key={i.variedadId}>
                      {i.cantidad} × {i.nombre}
                    </Typography>
                  ))}
                  <Alert severity="info">
                    Se descontarán las unidades del stock de el negocio y se
                    programará el seguimiento del comercio.
                  </Alert>
                </>
              )}
              {modal === "cancelar" && (
                <>
                  <Alert severity="warning">
                    El pedido quedará cancelado y conservará su historial.
                  </Alert>
                  {input("motivo", "Motivo de cancelación")}
                </>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button disabled={guardando} onClick={() => setModal(null)}>
              Volver
            </Button>
            <Button type="submit" variant="contained" disabled={guardando}>
              {guardando ? "Guardando…" : "Confirmar"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
      <Dialog
        open={!!detalle}
        onClose={() => setDetalleId(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Pedido #{detalle?._id.slice(-6)} · {detalle?.comercioNombre}
        </DialogTitle>
        <DialogContent>
          <Stack gap={1}>
            {detalle?.items.map((i) => (
              <Typography key={i.variedadId}>
                {i.cantidad} × {i.nombre} · {dinero(i.precioUnitario)} ={" "}
                {dinero(i.subtotal)}
              </Typography>
            ))}
            <Typography fontWeight={700}>
              Total: {dinero(detalle?.total ?? 0)} · Pendiente:{" "}
              {dinero(
                detalle?.estado === "CANCELADO" ? 0 : (detalle?.saldo ?? 0),
              )}
            </Typography>
            <Typography>Entrega: {fecha(detalle?.fechaEntrega)}</Typography>
            <Typography>{detalle?.observaciones}</Typography>
            {detalle?.motivoCancelacion && (
              <Alert severity="warning">
                Cancelado: {detalle.motivoCancelacion}
              </Alert>
            )}
            <Typography variant="h6" mt={2}>
              Historial de cobros
            </Typography>
            {detalle?.cobros.map((c) => (
              <Typography key={c._id}>
                {fecha(c.fecha)} ·{" "}
                {ETIQUETAS_METODO_PAGO[c.metodo as MetodoPago]} ·{" "}
                {dinero(c.monto)}
              </Typography>
            ))}
            {!detalle?.cobros.length && (
              <Typography color="text.secondary">
                Sin cobros registrados.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetalleId(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!comercioHistorial}
        onClose={() => setHistorialId(null)}
        fullWidth
      >
        <DialogTitle>Contactos · {comercioHistorial?.nombre}</DialogTitle>
        <DialogContent>
          {comercioHistorial?.contactos
            .slice()
            .reverse()
            .map((c) => (
              <Box key={c._id} mb={2}>
                <Typography fontWeight={700}>{fecha(c.fecha)}</Typography>
                <Typography>
                  {c.nota || "Contacto registrado sin observaciones."}
                </Typography>
              </Box>
            ))}
          {!comercioHistorial?.contactos.length && (
            <Typography>Sin contactos registrados.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistorialId(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}


