import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import Snackbar from "@mui/material/Snackbar";
import { Box, ButtonBase, Card, CardContent, Typography, Button, Divider, TextField, Alert, MenuItem, IconButton } from "@mui/material";
import RemoveIcon from "@mui/icons-material/Remove";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import "./NuevoPedido.css";
import { ETIQUETAS_TIPO_PEDIDO, type Pedido, type ProductoPedido, type TipoPedido } from "../../types/pedido";
import { getSession } from "../../auth/session";

interface Producto { _id: string; nombre: string; categoria: string; descripcion: string; precio: number; disponible: boolean; imagen: string; }
interface Mesa { _id: string; numero: number; nombre?: string; estado: string; }

const API_URL = import.meta.env.VITE_API_URL;
const NuevoPedido = () => {
  const tiposHabilitados = getSession()?.orderTypes ?? ["DELIVERY", "TAKEAWAY"];
  const salonHabilitado = tiposHabilitados.includes("SALON");
  const [searchParams] = useSearchParams();
  const mesaInicial = (salonHabilitado ? searchParams.get("mesaId") : null) ?? "";
  const [busqueda, setBusqueda] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [guardandoPedido, setGuardandoPedido] = useState(false);
  const [tipoPedido, setTipoPedido] = useState<TipoPedido>(tiposHabilitados[0]);
  const [nombreCliente, setNombreCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [comentario, setComentario] = useState("");
  const [mesaId, setMesaId] = useState<string>(mesaInicial);
  const [productosPedido, setProductosPedido] = useState<ProductoPedido[]>([]);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" | "info" | "warning" }>({ open: false, message: "", severity: "info" });
  const token = getSession()?.token || "";
  const axiosConfig = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const fetchProductos = useCallback(async () => {
    try { const res = await axios.get(`${API_URL}/api/productos`, axiosConfig); setProductos(res.data); }
    catch (error) { console.error("Error obteniendo productos", error); }
  }, [axiosConfig]);

  const fetchMesas = useCallback(async () => {
    try { const res = await axios.get(`${API_URL}/api/mesas`, axiosConfig); setMesas(res.data); }
    catch (error) { console.error("Error obteniendo mesas", error); }
  }, [axiosConfig]);

  useEffect(() => {
    void fetchProductos();
    if (salonHabilitado) void fetchMesas();
  }, [fetchMesas, fetchProductos, salonHabilitado]);

  useEffect(() => {
    if (mesaInicial) {
      setTipoPedido("SALON");
      setMesaId(mesaInicial);
    }
  }, [mesaInicial]);

  const categorias = [...new Set(productos.map(producto => producto.categoria))];
  const normalizarBusqueda = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR");
  const productosFiltrados = productos.filter(producto =>
    (categoriaActiva === null || producto.categoria === categoriaActiva)
    && normalizarBusqueda(`${producto.nombre} ${producto.categoria}`).includes(normalizarBusqueda(busqueda.trim()))
  );
  const productosPorCategoria = productosFiltrados.reduce((acc, producto) => {
    if (!acc[producto.categoria]) acc[producto.categoria] = [];
    acc[producto.categoria].push(producto);
    return acc;
  }, {} as Record<string, Producto[]>);
  const cantidadItems = productosPedido.reduce((acc, item) => acc + item.cantidad, 0);

  const total = productosPedido.reduce((acc, item) => acc + item.precioUnitario * item.cantidad, 0);

  const agregarProducto = (producto: Producto) => {
    setProductosPedido(prev => {
      const existente = prev.find(p => p.productoId === producto._id);
      if (existente) return prev.map(p => p.productoId === producto._id ? { ...p, cantidad: p.cantidad + 1, subtotal: (p.cantidad + 1) * p.precioUnitario } : p);
      return [...prev, { productoId: producto._id, nombreSnapshot: producto.nombre, cantidad: 1, precioUnitario: producto.precio, subtotal: producto.precio }];
    });
  };

  const aumentarCantidad = (productoId: string | null) => {
    setProductosPedido(prev => prev.map(item => item.productoId === productoId
      ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * item.precioUnitario }
      : item
    ));
  };

  const disminuirCantidad = (productoId: string | null) => {
    setProductosPedido(prev => prev.map(item => item.productoId === productoId
      ? { ...item, cantidad: item.cantidad - 1, subtotal: (item.cantidad - 1) * item.precioUnitario }
      : item
    ).filter(item => item.cantidad > 0));
  };

  const eliminarProducto = (productoId: string | null) => setProductosPedido(prev => prev.filter(item => item.productoId !== productoId));

  const crearPedido = async () => {
    if (productosPedido.length === 0) return setSnackbar({ open: true, message: "Debe agregar al menos un producto.", severity: "warning" });
    if (tipoPedido === "SALON" && !mesaId) return setSnackbar({ open: true, message: "Seleccione una mesa.", severity: "warning" });

    setGuardandoPedido(true);
    try {
      if (tipoPedido === "DELIVERY" && (!nombreCliente || !telefono || !direccion)) throw new Error("Complete todos los datos del cliente");
      if (tipoPedido === "TAKEAWAY" && (!nombreCliente || !telefono)) throw new Error("Complete todos los datos del cliente");

      const payload = {
        tipoPedido,
        nombreCliente,
        telefono,
        direccion,
        comentario,
        productos: productosPedido.map(({ productoId, cantidad }) => ({ productoId, cantidad })),
        mesaId: tipoPedido === "SALON" ? mesaId : null,
      };

      const response = await axios.post<Pedido>(`${API_URL}/api/pedidos`, payload, axiosConfig);
      setSnackbar({ open: true, message: `Pedido #${response.data._id.slice(-6)} creado y enviado a cocina.`, severity: "success" });
      limpiarFormulario();
    } catch (error) {
      const message = error instanceof Error && !axios.isAxiosError(error) ? error.message : (axios.isAxiosError(error) ? error.response?.data?.error?.message || error.response?.data?.message : undefined);
      setSnackbar({ open: true, message: message || "Error al crear el pedido", severity: "error" });
    } finally {
      setGuardandoPedido(false);
    }
  };

  const limpiarFormulario = () => {
    setProductosPedido([]); setMesaId(""); setNombreCliente(""); setTelefono(""); setDireccion(""); setComentario(""); setTipoPedido(tiposHabilitados[0]);
  };

  const formatCurrency = (value: number) => value.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

  return (
    <Box className="nuevoPedido-container">
      <Box className="nuevoPedido-header">
        <Typography variant="h4" component="span">NUEVO PEDIDO</Typography>
        <Typography color="text.secondary" sx={{ mt: .25 }}>Armá el pedido y crealo.</Typography>
      </Box>

      <Box className="nuevoPedido-workspace">
        <Card className="catalogo-card">
          <CardContent>
            <Box className="catalogo-header">
              <Typography variant="h6" component="h2">Productos</Typography>
              <Button href="#resumen-nuevo-pedido" size="small">Ver pedido ({cantidadItems})</Button>
            </Box>
            <TextField
              id="buscar-productos"
              fullWidth size="small" type="search" label="Buscar producto"
              value={busqueda} onChange={event => setBusqueda(event.target.value)}
            />
            <Box className="catalogo-categorias" role="group" aria-label="Filtrar por categoría">
              <Button size="small" variant={categoriaActiva === null ? "contained" : "outlined"} aria-pressed={categoriaActiva === null} onClick={() => setCategoriaActiva(null)}>Todas</Button>
              {categorias.map(categoria => (
                <Button key={categoria} size="small" variant={categoriaActiva === categoria ? "contained" : "outlined"} aria-pressed={categoriaActiva === categoria} onClick={() => setCategoriaActiva(categoria)}>{categoria}</Button>
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" role="status">
              {productosFiltrados.length} {productosFiltrados.length === 1 ? "producto" : "productos"}
            </Typography>
            <Box className="catalogo-resultados" tabIndex={0} role="region" aria-label="Catálogo de productos">
              {Object.entries(productosPorCategoria).map(([categoria, items]) => (
                <Box key={categoria} className="catalogo-grupo">
                  <Typography variant="subtitle2" component="h3">{categoria}</Typography>
                  <Box className="catalogo-grid">
                    {items.map(producto => (
                      <ButtonBase
                        key={producto._id} className="producto-card" disabled={!producto.disponible}
                        onClick={() => agregarProducto(producto)} aria-label={`Agregar ${producto.nombre}`}
                      >
                        <span className="producto-nombre">{producto.nombre}</span>
                        <span className="precio">{formatCurrency(producto.precio)}</span>
                        {!producto.disponible && <span className="producto-no-disponible">No disponible</span>}
                      </ButtonBase>
                    ))}
                  </Box>
                </Box>
              ))}
              {productosFiltrados.length === 0 && (
                <Typography className="catalogo-vacio" color="text.secondary">No hay productos para esta búsqueda. Probá otra categoría o nombre.</Typography>
              )}
            </Box>
          </CardContent>
        </Card>

        <Card className="resumen-card" id="resumen-nuevo-pedido">
          <CardContent>
            <Typography variant="h6" component="h2">Configuración del pedido</Typography>
            <Box className="configuracion-pedido">
              <TextField size="small" select label="Tipo de pedido" value={tipoPedido} onChange={(e) => setTipoPedido(e.target.value as TipoPedido)}>
                {tiposHabilitados.map(tipo => <MenuItem key={tipo} value={tipo}>{ETIQUETAS_TIPO_PEDIDO[tipo]}</MenuItem>)}
              </TextField>
              {tipoPedido === "SALON" && (
                <TextField size="small" select label="Mesa" value={mesaId} onChange={(e) => setMesaId(e.target.value)}>
                  {mesas.filter(mesa => mesa.estado === "LIBRE" || mesa._id === mesaId).map(mesa => (
                    <MenuItem key={mesa._id} value={mesa._id}>{mesa.nombre || `Mesa ${mesa.numero}`}</MenuItem>
                  ))}
                </TextField>
              )}
              {tipoPedido !== "SALON" && (
                <>
                  <TextField size="small" label="Teléfono" value={telefono} onChange={e => setTelefono(e.target.value)} />
                  <TextField className="pedido-campo-completo" size="small" label="Nombre del cliente" value={nombreCliente} onChange={e => setNombreCliente(e.target.value)} />
                </>
              )}
              {tipoPedido === "DELIVERY" && (
                <TextField className="pedido-campo-completo" size="small" label="Dirección" value={direccion} onChange={e => setDireccion(e.target.value)} />
              )}
              {tipoPedido !== "SALON" && (
                <TextField className="pedido-campo-completo" size="small" multiline minRows={1} maxRows={3} label="Comentario" value={comentario} onChange={e => setComentario(e.target.value)} />
              )}
            </Box>
            <Divider />
            <Box className="detalle-pedido">
              <Box className="detalle-pedido-header">
                <Typography variant="subtitle1" fontWeight={700}>Detalle del pedido</Typography>
                <Typography variant="body2" color="text.secondary" role="status">{cantidadItems} {cantidadItems === 1 ? "item" : "items"}</Typography>
              </Box>
              <Box className="detalle-pedido-lista" tabIndex={0} role="region" aria-label="Productos seleccionados">
                {productosPedido.length === 0 ? (
                  <Typography className="detalle-pedido-vacio" variant="body2" color="text.secondary">Seleccioná productos del catálogo para comenzar.</Typography>
                ) : productosPedido.map(item => (
                  <Box key={item.productoId} className="pedido-item">
                    <Box className="pedido-item-info">
                      <Typography variant="body2" fontWeight={700}>{item.nombreSnapshot}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.cantidad} × {formatCurrency(item.precioUnitario)}</Typography>
                    </Box>
                    <Typography className="pedido-item-subtotal" variant="body2" fontWeight={700}>{formatCurrency(item.precioUnitario * item.cantidad)}</Typography>
                    <Box className="pedido-item-cantidad">
                      <IconButton size="small" aria-label={`Disminuir ${item.nombreSnapshot}`} onClick={() => disminuirCantidad(item.productoId)}><RemoveIcon fontSize="small" /></IconButton>
                      <Typography variant="body2" fontWeight={700}>{item.cantidad}</Typography>
                      <IconButton size="small" aria-label={`Aumentar ${item.nombreSnapshot}`} onClick={() => aumentarCantidad(item.productoId)}><AddIcon fontSize="small" /></IconButton>
                      <IconButton size="small" color="error" aria-label={`Eliminar ${item.nombreSnapshot}`} onClick={() => eliminarProducto(item.productoId)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
            <Box className="pedido-cierre">
              <Box className="total-box">
                <Typography variant="body2">Total</Typography>
                <Typography variant="h5" fontWeight={700}>{formatCurrency(total)}</Typography>
              </Box>
              <Button className="guardar-btn" variant="contained" onClick={crearPedido} disabled={guardandoPedido}>
                {guardandoPedido ? "Creando…" : "Crear pedido"}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default NuevoPedido;


