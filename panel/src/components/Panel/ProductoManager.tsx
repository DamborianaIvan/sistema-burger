import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import CircularProgress from "@mui/material/CircularProgress";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";

import "./ProductoManager.css";
import { Typography } from "@mui/material";
import { getSession } from "../../auth/session";

interface Producto {
  _id: string;
  nombre: string;
  categoria: string;
  descripcion: string;
  precio: number;
  disponible: boolean;
  imagen: string;
}

interface ProductoForm {
  nombre: string;
  categoria: string;
  descripcion: string;
  precio: number | undefined;
  disponible: boolean;
  imagen: string;
}

interface CategoriaProducto {
  _id: string;
  nombre: string;
  esPredeterminada: boolean;
}

const API_URL = import.meta.env.VITE_API_URL;

const CATEGORIAS_BASE = [
  "HAMBURGUESAS",
  "ACOMPANAMIENTOS",
  "BEBIDAS",
  "POSTRES",
  "ADICIONALES"
];

const ProductoManager = () => {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCategorias, setLoadingCategorias] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<{ nombre?: string; categoria?: string }>({});
  const [openDialog, setOpenDialog] = useState(false);
  const [openCategorias, setOpenCategorias] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Producto | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [busqueda, setBusqueda] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("TODAS");
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" | "info" }>({
    open: false,
    message: "",
    severity: "info",
  });

  const [formData, setFormData] = useState<ProductoForm>({
    nombre: "",
    categoria: "",
    descripcion: "",
    precio: undefined,
    disponible: true,
    imagen: "",
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const token = getSession()?.token || "";

  const axiosConfig = useMemo(() => ({
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }), [token]);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/api/productos`, axiosConfig);
      const data = Array.isArray(res.data) ? res.data : res.data.productos;
      setProductos(Array.isArray(data) ? data : []);
    } catch {
      setError("Error al obtener productos");
      setProductos([]);
    } finally {
      setLoading(false);
    }
  }, [axiosConfig]);

  const fetchCategorias = useCallback(async () => {
    setLoadingCategorias(true);
    try {
      const res = await axios.get(`${API_URL}/api/categorias-producto`, axiosConfig);
      setCategorias(Array.isArray(res.data) ? res.data : []);
    } catch {
      setCategorias([]);
      setSnackbar({
        open: true,
        message: "No se pudieron cargar las categorías personalizadas",
        severity: "error",
      });
    } finally {
      setLoadingCategorias(false);
    }
  }, [axiosConfig]);

  useEffect(() => {
    void fetchProductos();
    void fetchCategorias();
  }, [fetchProductos, fetchCategorias]);

  const categoriasDisponibles = useMemo(() => {
    if (categorias.length > 0) {
      return categorias.map((categoria) => categoria.nombre);
    }

    return CATEGORIAS_BASE;
  }, [categorias]);

  const productosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase("es");

    return productos.filter((producto) => {
      const coincideCategoria =
        categoriaFiltro === "TODAS" || producto.categoria === categoriaFiltro;
      const coincideBusqueda =
        !termino ||
        producto.nombre.toLocaleLowerCase("es").includes(termino) ||
        producto.descripcion?.toLocaleLowerCase("es").includes(termino);

      return coincideCategoria && coincideBusqueda;
    });
  }, [productos, busqueda, categoriaFiltro]);

  const productosAgrupados = useMemo(() => {
    const grupos = new Map<string, Producto[]>();

    productosFiltrados.forEach((producto) => {
      const categoria = producto.categoria || "SIN CATEGORÍA";
      const grupo = grupos.get(categoria) ?? [];
      grupo.push(producto);
      grupos.set(categoria, grupo);
    });

    return Array.from(grupos.entries()).sort(([categoriaA], [categoriaB]) => {
      const indiceA = categoriasDisponibles.indexOf(categoriaA);
      const indiceB = categoriasDisponibles.indexOf(categoriaB);

      if (indiceA === -1 && indiceB === -1) {
        return categoriaA.localeCompare(categoriaB, "es");
      }
      if (indiceA === -1) return 1;
      if (indiceB === -1) return -1;
      return indiceA - indiceB;
    });
  }, [productosFiltrados, categoriasDisponibles]);

  const cantidadPorCategoria = useMemo(() => {
    const cantidades = new Map<string, number>();

    productos.forEach((producto) => {
      cantidades.set(
        producto.categoria,
        (cantidades.get(producto.categoria) ?? 0) + 1
      );
    });

    return cantidades;
  }, [productos]);

  const handleOpenDialog = (producto?: Producto) => {
    setFormErrors({});
    if (producto) {
      setEditingProduct(producto);
      setFormData({ ...producto });
      setImagePreview(producto.imagen);
    } else {
      setEditingProduct(null);
      setFormData({
        nombre: "",
        categoria: "",
        descripcion: "",
        precio: undefined,
        disponible: true,
        imagen: "",
      });
      setImagePreview(null);
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingProduct(null);
    setFormErrors({});
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === "precio" ? Number(value) : value,
    }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setFormData(prev => ({ ...prev, imagen: reader.result as string }));
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    const errors: { nombre?: string; categoria?: string } = {};

    if (!formData.nombre.trim()) errors.nombre = "El nombre es obligatorio";
    if (formData.nombre.trim().length < 3) errors.nombre = "El nombre debe tener al menos 3 caracteres";
    if (!formData.categoria.trim()) errors.categoria = "La categoría es obligatoria";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      if (editingProduct) {
        await axios.put(`${API_URL}/api/productos/${editingProduct._id}`, formData, axiosConfig);
        setSnackbar({ open: true, message: "Producto actualizado correctamente", severity: "success" });
      } else {
        await axios.post(`${API_URL}/api/productos`, formData, axiosConfig);
        setSnackbar({ open: true, message: "Producto creado correctamente", severity: "success" });
      }
      handleCloseDialog();
      void fetchProductos();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.error?.message ?? error.response?.data?.message)
        : undefined;
      setSnackbar({
        open: true,
        message: message || "Error al guardar el producto",
        severity: "error"
      });
    }
  };

  const handleCrearCategoria = async () => {
    const nombre = nuevaCategoria.trim();
    if (nombre.length < 2) {
      setSnackbar({
        open: true,
        message: "La categoría debe tener al menos 2 caracteres",
        severity: "error",
      });
      return;
    }

    try {
      await axios.post(
        `${API_URL}/api/categorias-producto`,
        { nombre },
        axiosConfig
      );
      setNuevaCategoria("");
      await fetchCategorias();
      setSnackbar({
        open: true,
        message: "Categoría creada correctamente",
        severity: "success",
      });
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.error?.message ?? error.response?.data?.message)
        : undefined;
      setSnackbar({
        open: true,
        message: message || "Error al crear la categoría",
        severity: "error",
      });
    }
  };

  const handleEliminarCategoria = async (categoria: CategoriaProducto) => {
    try {
      await axios.delete(
        `${API_URL}/api/categorias-producto/${categoria._id}`,
        axiosConfig
      );

      if (categoriaFiltro === categoria.nombre) {
        setCategoriaFiltro("TODAS");
      }

      await fetchCategorias();
      setSnackbar({
        open: true,
        message: "Categoría eliminada correctamente",
        severity: "success",
      });
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.error?.message ?? error.response?.data?.message)
        : undefined;
      setSnackbar({
        open: true,
        message: message || "Error al eliminar la categoría",
        severity: "error",
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleteDialog.id) return;
    try {
      await axios.delete(`${API_URL}/api/productos/${deleteDialog.id}`, axiosConfig);
      setSnackbar({ open: true, message: "Producto eliminado correctamente", severity: "success" });
      void fetchProductos();
    } catch {
      setSnackbar({ open: true, message: "Error al eliminar el producto", severity: "error" });
    } finally {
      setDeleteDialog({ open: false, id: null });
    }
  };

  const formatPrecio = (precio: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
    }).format(precio);

  return (
    <div className="producto-manager">
      <div className="header">
        <div className="producto-heading">
          <Typography variant="h4">
            <Inventory2OutlinedIcon />
            PRODUCTOS
          </Typography>
          <p>Administrá precios, disponibilidad y categorías desde un solo lugar.</p>
        </div>

        <div className="producto-header-actions">
          <Button
            startIcon={<CategoryOutlinedIcon />}
            variant="outlined"
            onClick={() => setOpenCategorias(true)}
          >
            Categorías
          </Button>
          <Button
            startIcon={<AddCircleIcon />}
            variant="contained"
            color="primary"
            onClick={() => handleOpenDialog()}
          >
            Nuevo producto
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="loading"><CircularProgress /></div>
      ) : error ? (
        <p className="error">{error}</p>
      ) : productos.length > 0 ? (
        <>
          <div className="productos-toolbar">
            <TextField
              className="productos-buscador"
              label="Buscar productos"
              placeholder="Nombre o descripción"
              size="small"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
            />

            <TextField
              className="productos-filtro"
              select
              label="Categoría"
              size="small"
              value={categoriaFiltro}
              onChange={(event) => setCategoriaFiltro(event.target.value)}
            >
              <MenuItem value="TODAS">Todas las categorías</MenuItem>
              {categoriasDisponibles.map((categoria) => (
                <MenuItem key={categoria} value={categoria}>
                  {categoria}
                </MenuItem>
              ))}
            </TextField>
          </div>

          {productosFiltrados.length > 0 ? (
            <div className="productos-secciones">
              {productosAgrupados.map(([categoria, productosCategoria]) => (
                <section className="producto-grupo" key={categoria}>
                  <div className="producto-grupo-header">
                    <h2>{categoria}</h2>
                    <span>
                      {productosCategoria.length} {productosCategoria.length === 1 ? "producto" : "productos"}
                    </span>
                  </div>

                  <div className="producto-tabla">
                    <div className="producto-row producto-row-header" aria-hidden="true">
                      <span>Producto</span>
                      <span>Precio</span>
                      <span>Estado</span>
                      <span>Acciones</span>
                    </div>

                    {productosCategoria.map((producto) => (
                      <div className="producto-row" key={producto._id}>
                        <div className="producto-info">
                          <strong>{producto.nombre}</strong>
                          <small>{producto.descripcion || "Sin descripción"}</small>
                        </div>

                        <div className="producto-precio">
                          {formatPrecio(producto.precio)}
                        </div>

                        <div className="producto-estado-cell">
                          <span className={`estado-producto ${producto.disponible ? "disponible" : "no-disponible"}`}>
                            {producto.disponible ? "Disponible" : "No disponible"}
                          </span>
                        </div>

                        <div className="acciones">
                          <IconButton
                            aria-label={`Editar ${producto.nombre}`}
                            onClick={() => handleOpenDialog(producto)}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            aria-label={`Eliminar ${producto.nombre}`}
                            onClick={() => setDeleteDialog({ open: true, id: producto._id })}
                          >
                            <DeleteIcon color="error" />
                          </IconButton>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="producto-empty">
              No encontramos productos con los filtros seleccionados.
            </div>
          )}
        </>
      ) : (
        <div className="producto-empty">
          No hay productos para mostrar.
        </div>
      )}

      <Dialog open={openDialog} onClose={handleCloseDialog}>
        <DialogTitle>{editingProduct ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
        <DialogContent className="form-dialog">
          <TextField
            label="Nombre"
            name="nombre"
            fullWidth
            value={formData.nombre}
            onChange={handleChange}
            placeholder="Ej: Hamburguesa clásica"
            error={!!formErrors.nombre}
            helperText={formErrors.nombre}
          />
          <TextField
            select
            label="Categoría"
            name="categoria"
            fullWidth
            value={formData.categoria}
            onChange={handleChange}
            error={!!formErrors.categoria}
            helperText={formErrors.categoria}
          >
            {categoriasDisponibles.map((categoria) => (
              <MenuItem
                key={categoria}
                value={categoria}
              >
                {categoria}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Descripción"
            name="descripcion"
            fullWidth
            multiline
            value={formData.descripcion}
            onChange={handleChange}
            placeholder="Ej: Tomate, mozzarella y albahaca"
          />
          <TextField
            label="Precio (ARS)"
            name="precio"
            type="number"
            fullWidth
            value={formData.precio ?? ""}
            onChange={handleChange}
            placeholder="Ej: 12000"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={formData.disponible}
                onChange={(e) => setFormData(prev => ({ ...prev, disponible: e.target.checked }))}
              />
            }
            label="Producto disponible"
          />
          <input type="file" accept="image/*" onChange={handleImageUpload} />
          {imagePreview && <img src={imagePreview} className="preview" alt="Vista previa del producto" />}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button onClick={handleSubmit} variant="contained" color="primary">
            {editingProduct ? "Actualizar" : "Crear"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openCategorias}
        onClose={() => setOpenCategorias(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Gestionar categorías</DialogTitle>
        <DialogContent className="categorias-dialog">
          <p className="categorias-help">
            Creá categorías nuevas para organizar productos sin modificar el sistema.
          </p>

          <div className="categoria-crear">
            <TextField
              label="Nueva categoría"
              placeholder="Ej: PASTAS"
              fullWidth
              size="small"
              value={nuevaCategoria}
              onChange={(event) => setNuevaCategoria(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCrearCategoria();
                }
              }}
              inputProps={{ maxLength: 40 }}
            />
            <Button
              variant="contained"
              onClick={() => void handleCrearCategoria()}
              disabled={loadingCategorias || nuevaCategoria.trim().length < 2}
            >
              Agregar
            </Button>
          </div>

          {loadingCategorias ? (
            <div className="categorias-loading"><CircularProgress size={26} /></div>
          ) : (
            <div className="categorias-lista">
              {categorias.map((categoria) => {
                const cantidad = cantidadPorCategoria.get(categoria.nombre) ?? 0;

                return (
                  <div className="categoria-item" key={categoria._id}>
                    <div>
                      <strong>{categoria.nombre}</strong>
                      <small>
                        {categoria.esPredeterminada
                          ? "Categoría base"
                          : cantidad === 0
                            ? "Sin productos"
                            : `${cantidad} ${cantidad === 1 ? "producto" : "productos"}`}
                      </small>
                    </div>

                    {!categoria.esPredeterminada && (
                      <IconButton
                        aria-label={`Eliminar categoría ${categoria.nombre}`}
                        disabled={cantidad > 0}
                        onClick={() => void handleEliminarCategoria(categoria)}
                        title={cantidad > 0 ? "Mové o eliminá sus productos antes de borrar la categoría" : "Eliminar categoría"}
                      >
                        <DeleteIcon color={cantidad > 0 ? "disabled" : "error"} />
                      </IconButton>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCategorias(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, id: null })}>
        <DialogTitle>Confirmar eliminación</DialogTitle>
        <DialogContent>¿Estás seguro que querés eliminar este producto?</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, id: null })}>Cancelar</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">Eliminar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default ProductoManager;


