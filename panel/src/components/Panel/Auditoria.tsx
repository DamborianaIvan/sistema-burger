import { useConsultaActual } from "../../utils/useConsultaActual";
import { Paginador } from "./Paginador";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { getSession } from "../../auth/session";
import "./Auditoria.css";

const API_URL = import.meta.env.VITE_API_URL;

type EntidadAuditoria = "PEDIDO" | "CAJA" | "STOCK" | "USUARIO" | "PRODUCTO";

interface AuditLog {
  _id: string;
  accion: string;
  entidad: EntidadAuditoria;
  entidadId?: string | null;
  usuarioId?: {
    _id: string;
    nombre: string;
    nombreUsuario: string;
    rol: string;
  } | null;
  usuarioNombreSnapshot?: string | null;
  antes?: Record<string, unknown> | null;
  despues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  fecha: string;
}

const ENTIDADES: Array<{ value: EntidadAuditoria; label: string }> = [
  { value: "PEDIDO", label: "Pedidos" },
  { value: "CAJA", label: "Caja" },
  { value: "STOCK", label: "Stock" },
  { value: "USUARIO", label: "Usuarios" },
  { value: "PRODUCTO", label: "Productos" },
];

const ETIQUETAS_ENTIDAD: Record<EntidadAuditoria, string> = {
  PEDIDO: "Pedido",
  CAJA: "Caja",
  STOCK: "Stock",
  USUARIO: "Usuario",
  PRODUCTO: "Producto",
};

const ETIQUETAS_ACCION: Record<string, string> = {

  PEDIDO_ESTADO_CAMBIADO: "Cambio de estado del pedido",
  PEDIDO_CANCELADO: "Pedido cancelado",
  PEDIDO_COBRADO: "Cobro registrado",
  PEDIDO_COBRO_ANULADO: "Cobro anulado",
  PEDIDO_CERRADO: "Pedido cerrado",
  PEDIDO_DESCUENTO_APLICADO: "Descuento aplicado",
  CAJA_ABIERTA: "Caja abierta",
  CAJA_CERRADA: "Caja cerrada",
  STOCK_MOVIMIENTO_MANUAL: "Movimiento manual de stock",
  USUARIO_CREADO: "Usuario creado",
  USUARIO_ACTUALIZADO: "Usuario actualizado",
  USUARIO_ESTADO_CAMBIADO: "Estado de usuario modificado",
  USUARIO_PASSWORD_CAMBIADO: "Contraseña de usuario modificada",
  PRODUCTO_CREADO: "Producto creado",
  PRODUCTO_ACTUALIZADO: "Producto actualizado",
  PRODUCTO_DISPONIBILIDAD_CAMBIADA: "Disponibilidad de producto modificada",
  PRODUCTO_ELIMINADO: "Producto eliminado",
  CATEGORIA_PRODUCTO_CREADA: "Categoría de producto creada",
  CATEGORIA_PRODUCTO_ELIMINADA: "Categoría de producto eliminada",
};

const ETIQUETAS_CAMPO: Record<string, string> = {
  estadoPedido: "Estado del pedido",
  estadoPago: "Estado de pago",
  tipoPedido: "Tipo de pedido",
  porcentaje: "Descuento",
  monto: "Importe",
  total: "Total",
  totalFinal: "Total final",
  pagos: "Pagos",
  pagosAnulados: "Pagos anulados",
  cajaId: "Caja",
  cerrado: "Pedido cerrado",
  fecha: "Fecha",
  fechaApertura: "Fecha de apertura",
  fechaCierre: "Fecha de cierre",
  montoInicial: "Monto inicial",
  totalesPorMetodo: "Totales por medio de pago",
  efectivoEsperado: "Efectivo esperado",
  efectivoDeclarado: "Efectivo declarado",
  diferencia: "Diferencia",
  stock: "Stock",
  ingrediente: "Ingrediente",
  unidad: "Unidad",
  tipo: "Tipo de movimiento",
  cantidad: "Cantidad",
  motivo: "Motivo",
  nombre: "Nombre",
  nombreUsuario: "Nombre de usuario",
  usuarioAfectado: "Usuario afectado",
  email: "Email",
  rol: "Rol",
  activo: "Activo",
  categoria: "Categoría",
  descripcion: "Descripción",
  precio: "Precio",
  imagen: "Imagen",
  disponible: "Disponible",
};

const CAMPOS_OCULTOS = new Set([
  "_id",
  "__v",
  "createdAt",
  "updatedAt",
  "fechaCreacion",
]);

const CAMPOS_MONEDA = new Set([
  "monto",
  "total",
  "totalFinal",
  "montoInicial",
  "efectivoEsperado",
  "efectivoDeclarado",
  "diferencia",
  "precio",
]);

const CAMPOS_FECHA = new Set([
  "fecha",
  "fechaApertura",
  "fechaCierre",
]);

const ETIQUETAS_VALOR: Record<string, string> = {
  ABIERTO: "Abierto",
  CONFIRMADO: "Confirmado",
  EN_COCINA: "En cocina",
  LISTO: "Listo",
  SERVIDO: "Servido",
  EN_CAMINO: "En camino",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
  PENDIENTE: "Pendiente",
  PAGADO: "Pagado",
  ANULADO: "Anulado",
  SALON: "Salón",
  DELIVERY: "Delivery",
  TAKEAWAY: "Takeaway",
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  ADMIN: "Administrador",
  CAJERO: "Cajero",
  CHEF: "Cocina",
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Ajuste",
  MERMA: "Merma",
  CONSUMO: "Consumo",
  HAMBURGUESAS: "Hamburguesas",
  ACOMPANAMIENTOS: "Acompañamientos",
  BEBIDAS: "Bebidas",
  POSTRES: "Postres",
  ADICIONALES: "Adicionales",
};

const moneda = (valor: number) =>
  Number(valor).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  });

const numero = (valor: number) =>
  Number(valor).toLocaleString("es-AR", { maximumFractionDigits: 3 });

const etiquetaCampo = (campo: string) =>
  ETIQUETAS_CAMPO[campo]
  ?? campo
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (letra) => letra.toUpperCase());

const etiquetaValor = (valor: string) => {
  if (ETIQUETAS_VALOR[valor]) return ETIQUETAS_VALOR[valor];

  if (/^[A-Z0-9_]+$/.test(valor)) {
    return valor
      .toLowerCase()
      .split("_")
      .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
      .join(" ");
  }

  return valor;
};

const formatearFecha = (valor: unknown) => {
  const fecha = new Date(String(valor));
  return Number.isNaN(fecha.getTime())
    ? String(valor)
    : fecha.toLocaleString("es-AR");
};

const formatearObjeto = (valor: Record<string, unknown>) =>
  Object.entries(valor)
    .filter(([campo]) => !CAMPOS_OCULTOS.has(campo))
    .map(([campo, contenido]) => `${etiquetaCampo(campo)}: ${formatearValor(campo, contenido)}`)
    .join(" · ");

const formatearValor = (campo: string, valor: unknown): string => {
  if (valor === null || valor === undefined || valor === "") return "Sin dato";

  if (typeof valor === "boolean") return valor ? "Sí" : "No";

  if (campo === "porcentaje" && typeof valor === "number") {
    return `${numero(valor)}%`;
  }

  if (CAMPOS_MONEDA.has(campo) && typeof valor === "number") {
    return moneda(valor);
  }

  if (CAMPOS_FECHA.has(campo)) {
    return formatearFecha(valor);
  }

  if (campo === "totalesPorMetodo" && typeof valor === "object" && !Array.isArray(valor)) {
    return Object.entries(valor as Record<string, unknown>)
      .map(([metodo, importe]) => `${etiquetaValor(metodo)}: ${moneda(Number(importe ?? 0))}`)
      .join(" · ");
  }

  if ((campo === "pagos" || campo === "pagosAnulados") && Array.isArray(valor)) {
    return valor
      .map((pago) => {
        if (!pago || typeof pago !== "object") return String(pago);
        const data = pago as Record<string, unknown>;
        return `${etiquetaValor(String(data.metodo ?? "Pago"))}: ${moneda(Number(data.monto ?? 0))}`;
      })
      .join(" · ");
  }

  if (Array.isArray(valor)) {
    if (valor.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
      return valor.map((item) => etiquetaValor(String(item))).join(", ");
    }

    return valor
      .map((item, index) => {
        if (!item || typeof item !== "object") return `${index + 1}. ${String(item)}`;
        return `${index + 1}. ${formatearObjeto(item as Record<string, unknown>)}`;
      })
      .join(" | ");
  }

  if (typeof valor === "object") {
    return formatearObjeto(valor as Record<string, unknown>);
  }

  if (typeof valor === "number") return numero(valor);

  return etiquetaValor(String(valor));
};

const obtenerFilas = (datos?: Record<string, unknown> | null) => {
  if (!datos) return [];

  return Object.entries(datos)
    .filter(([campo]) => !CAMPOS_OCULTOS.has(campo))
    .map(([campo, valor]) => ({
      campo,
      etiqueta: etiquetaCampo(campo),
      valor: formatearValor(campo, valor),
    }));
};

const obtenerCambios = (
  antes?: Record<string, unknown> | null,
  despues?: Record<string, unknown> | null,
) => {
  if (!antes || !despues) return [];

  const campos = Array.from(new Set([
    ...Object.keys(antes),
    ...Object.keys(despues),
  ]));

  return campos
    .filter((campo) => !CAMPOS_OCULTOS.has(campo))
    .filter((campo) => JSON.stringify(antes[campo]) !== JSON.stringify(despues[campo]))
    .map((campo) => ({
      campo,
      etiqueta: etiquetaCampo(campo),
      antes: formatearValor(campo, antes[campo]),
      despues: formatearValor(campo, despues[campo]),
    }));
};

const DetalleFilas = ({
  titulo,
  datos,
}: {
  titulo: string;
  datos?: Record<string, unknown> | null;
}) => {
  const filas = obtenerFilas(datos);
  if (filas.length === 0) return null;

  return (
    <section className="auditoria-detalle-seccion">
      <h4>{titulo}</h4>
      <div className="auditoria-detalle-filas">
        {filas.map((fila) => (
          <div className="auditoria-detalle-fila" key={fila.campo}>
            <span>{fila.etiqueta}</span>
            <strong>{fila.valor}</strong>
          </div>
        ))}
      </div>
    </section>
  );
};

const Auditoria = () => {
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [entidad, setEntidad] = useState<EntidadAuditoria | "">("");
  const [limit, setLimit] = useState(100);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const iniciarConsulta = useConsultaActual();
  const cargar = useCallback(async () => {
    const vigente = iniciarConsulta();
    const token = getSession()?.token;
    if (!token) return;

    try {
      setCargando(true);
      setError(null);

      const params = new URLSearchParams({ limit: String(limit), page: String(pagina) });
      if (entidad) params.set("entidad", entidad);

      const response = await fetch(`${API_URL}/api/auditoria?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error?.message ?? body?.message ?? "No se pudo cargar la auditoría.");
      }

      if (!vigente()) return;
      setLogs(Array.isArray(body) ? body : []);
      setTotal(Number(response.headers.get("X-Total-Count") ?? 0));
    } catch (requestError) {
      if (!vigente()) return;
      setError(requestError instanceof Error ? requestError.message : "No se pudo cargar la auditoría.");
    } finally {
      if (vigente()) setCargando(false);
    }
  }, [entidad, limit, pagina, iniciarConsulta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <Box className="auditoria-page">
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2} mb={2}>
        <Box>
          <Typography variant="h4" className="auditoria-title">
            <HistoryOutlinedIcon /> AUDITORÍA
          </Typography>
          <Typography color="text.secondary">
            Historial de operaciones críticas realizadas dentro del sistema.
          </Typography>
        </Box>

        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void cargar()} disabled={cargando}>
          Actualizar
        </Button>
      </Stack>

      <Card variant="outlined" className="auditoria-filtros">
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Entidad</InputLabel>
              <Select
                value={entidad}
                label="Entidad"
                onChange={(event) => { setEntidad(event.target.value as EntidadAuditoria | ""); setPagina(1); }}
              >
                <MenuItem value="">Todas</MenuItem>
                {ENTIDADES.map((item) => (
                  <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Cantidad</InputLabel>
              <Select
                value={limit}
                label="Cantidad"
                onChange={(event) => { setLimit(Number(event.target.value)); setPagina(1); }}
              >
                <MenuItem value={50}>50 por página</MenuItem>
                <MenuItem value={100}>100 por página</MenuItem>
                <MenuItem value={200}>200 por página</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      <Paginador pagina={pagina} total={total} limite={limit} cambiar={setPagina} ocupado={cargando} />
      {cargando ? (
        <Box className="auditoria-loading"><CircularProgress /></Box>
      ) : logs.length === 0 ? (
        <Typography color="text.secondary" sx={{ mt: 3 }}>
          No hay eventos de auditoría para mostrar.
        </Typography>
      ) : (
        <div className="auditoria-lista">
          {logs.map((log) => {
            const cambios = obtenerCambios(log.antes, log.despues);
            const usuario = log.usuarioId?.nombre
              ?? log.usuarioNombreSnapshot
              ?? "Sistema";
            const tieneDetalle = cambios.length > 0
              || obtenerFilas(log.antes).length > 0
              || obtenerFilas(log.despues).length > 0
              || obtenerFilas(log.metadata).length > 0;

            return (
              <Card key={log._id} variant="outlined" className="auditoria-item">
                <CardContent>
                  <div className="auditoria-item-header">
                    <div>
                      <strong>{ETIQUETAS_ACCION[log.accion] ?? etiquetaValor(log.accion)}</strong>
                      <span>{ETIQUETAS_ENTIDAD[log.entidad] ?? "Registro histórico"}</span>
                    </div>
                    <time>{new Date(log.fecha).toLocaleString("es-AR")}</time>
                  </div>

                  <div className="auditoria-meta">
                    <span>Usuario: <strong>{usuario}</strong></span>
                    {log.usuarioId?.rol && <span>Rol: {etiquetaValor(log.usuarioId.rol)}</span>}
                    {log.entidadId && <span>Referencia: {log.entidadId.slice(-8)}</span>}
                  </div>

                  {tieneDetalle && (
                    <details className="auditoria-detalle">
                      <summary>Ver detalle</summary>

                      {cambios.length > 0 ? (
                        <section className="auditoria-detalle-seccion">
                          <h4>Cambios realizados</h4>
                          <div className="auditoria-cambios">
                            {cambios.map((cambio) => (
                              <div className="auditoria-cambio" key={cambio.campo}>
                                <span className="auditoria-cambio-etiqueta">{cambio.etiqueta}</span>
                                <div className="auditoria-cambio-valores">
                                  <span className="auditoria-valor-anterior">{cambio.antes}</span>
                                  <ArrowForwardRoundedIcon fontSize="small" />
                                  <strong>{cambio.despues}</strong>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : (
                        <>
                          <DetalleFilas
                            titulo={log.antes && !log.despues ? "Información anterior" : "Antes"}
                            datos={log.antes}
                          />
                          <DetalleFilas
                            titulo={log.despues && !log.antes ? "Información registrada" : "Después"}
                            datos={log.despues}
                          />
                        </>
                      )}

                      <DetalleFilas titulo="Información adicional" datos={log.metadata} />
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </Box>
  );
};

export default Auditoria;



