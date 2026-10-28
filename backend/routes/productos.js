import express from 'express';
import { protect, requirePermission, restrictTo } from '../middleware/auth.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { ROLES } from '../constants/roles.js';
import Producto from '../models/Producto.js';
import Pedido from '../models/Pedido.js';
import Receta from '../models/Receta.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { categoriaProductoExiste } from '../services/categoriaProductoService.js';
import { ACCIONES_AUDITORIA, ENTIDADES_AUDITORIA } from '../constants/auditoria.js';
import { normalizarNombreCategoriaProducto } from '../utils/categoriaProducto.js';
import { productoRequiereArchivo, datosProducto, escaparRegex } from '../utils/producto.js';

const router = express.Router();
router.use(protect, restrictTo(ROLES.ADMIN, ROLES.CAJERO));

const snapshotProducto = (producto) => ({
  nombre: producto.nombre,
  categoria: producto.categoria,
  descripcion: producto.descripcion ?? '',
  precio: producto.precio,
  imagen: producto.imagen ?? '',
  disponible: producto.disponible
});

// Crear producto: requiere products:manage.
router.post('/', requirePermission(PERMISSIONS.PRODUCTS_MANAGE), async (req, res, next) => {
  try {
    const { categoria } = req.body;
    const { nombre, descripcion, precio, imagen, disponible } = datosProducto(req.body);

    if (!categoria || !nombre || precio === undefined) {
      return res.status(400).json({ message: 'Categoria, nombre y precio son obligatorios' });
    }

    const categoriaNormalizada = normalizarNombreCategoriaProducto(categoria);
    if (!(await categoriaProductoExiste(categoriaNormalizada))) {
      return res.status(400).json({ message: 'Categoria invalida' });
    }

    const nombreLimpio = nombre.trim();
    if (nombreLimpio.length < 3) {
      return res.status(400).json({ message: 'El nombre debe tener al menos 3 caracteres' });
    }
    if (nombreLimpio.length > 80) {
      return res.status(400).json({ message: 'El nombre es demasiado largo' });
    }

    const productoExistente = await Producto.findOne({
      nombre: { $regex: new RegExp(`^${escaparRegex(nombreLimpio)}$`, 'i') }
    });

    if (productoExistente) {
      return res.status(409).json({ message: 'Ya existe un producto con ese nombre' });
    }

    const nuevoProducto = new Producto({
      categoria: categoriaNormalizada,
      nombre: nombreLimpio,
      descripcion,
      precio: Number(precio),
      imagen,
      disponible
    });

    await nuevoProducto.save();

    await registrarAuditoria({
      accion: ACCIONES_AUDITORIA.PRODUCTO_CREADO,
      entidad: ENTIDADES_AUDITORIA.PRODUCTO,
      entidadId: nuevoProducto._id,
      usuario: req.usuario,
      despues: snapshotProducto(nuevoProducto)
    });

    res.status(201).json({ message: 'Producto creado correctamente', producto: nuevoProducto });
  } catch (error) {
    return next(error);
  }
});

// Obtener productos: acceso operativo autenticado.
router.get('/', async (req, res, next) => {
  try {
    const productos = await Producto.find({ activo: { $ne: false } }).sort({ categoria: 1, nombre: 1 });
    res.json(productos);
  } catch (error) {
    return next(error);
  }
});

// Obtener producto por ID: acceso operativo autenticado.
router.get('/:id', async (req, res, next) => {
  try {
    const producto = await Producto.findOne({
      _id: req.params.id,
      activo: { $ne: false }
    });
    if (!producto) return res.status(404).json({ message: 'Producto no encontrado' });
    res.json(producto);
  } catch (error) {
    return next(error);
  }
});

// Actualizar producto: requiere products:manage.
router.put('/:id', requirePermission(PERMISSIONS.PRODUCTS_MANAGE), async (req, res, next) => {
  try {
    const { categoria } = req.body;
    const datos = datosProducto(req.body, true);

    const productoAnterior = await Producto.findById(req.params.id);
    if (!productoAnterior) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    const antes = snapshotProducto(productoAnterior);

    const categoriaNormalizada = categoria === undefined
      ? undefined
      : normalizarNombreCategoriaProducto(categoria);

    if (categoriaNormalizada !== undefined && !(await categoriaProductoExiste(categoriaNormalizada))) {
      return res.status(400).json({ message: 'Categoria invalida' });
    }

    const productoActualizado = await Producto.findByIdAndUpdate(
      req.params.id,
      {
        categoria: categoriaNormalizada,
        ...datos
      },
      { new: true, runValidators: true }
    );

    await registrarAuditoria({
      accion: ACCIONES_AUDITORIA.PRODUCTO_ACTUALIZADO,
      entidad: ENTIDADES_AUDITORIA.PRODUCTO,
      entidadId: productoActualizado._id,
      usuario: req.usuario,
      antes,
      despues: snapshotProducto(productoActualizado)
    });

    res.json({ message: 'Producto actualizado correctamente', producto: productoActualizado });
  } catch (error) {
    return next(error);
  }
});

// Eliminar producto: requiere products:manage.
router.delete('/:id', requirePermission(PERMISSIONS.PRODUCTS_MANAGE), async (req, res, next) => {
  try {
    const producto = await Producto.findOne({
      _id: req.params.id,
      activo: { $ne: false }
    });
    if (!producto) return res.status(404).json({ message: 'Producto no encontrado' });

    const [tienePedidos, tieneReceta] = await Promise.all([
      Pedido.exists({ 'productos.productoId': producto._id }),
      Receta.exists({ productoId: producto._id })
    ]);

    const requiereHistorial = productoRequiereArchivo({ tienePedidos, tieneReceta });
    const snapshotAnterior = snapshotProducto(producto);

    if (requiereHistorial) {
      producto.activo = false;
      producto.disponible = false;
      await producto.save();

      await registrarAuditoria({
        accion: ACCIONES_AUDITORIA.PRODUCTO_ELIMINADO,
        entidad: ENTIDADES_AUDITORIA.PRODUCTO,
        entidadId: producto._id,
        usuario: req.usuario,
        antes: snapshotAnterior,
        despues: { activo: false, disponible: false },
        metadata: { modo: 'ARCHIVADO' }
      });

      return res.json({
        message: 'Producto retirado del catálogo. Se conservó su historial.',
        modo: 'ARCHIVADO'
      });
    }

    await Producto.findByIdAndDelete(producto._id);

    await registrarAuditoria({
      accion: ACCIONES_AUDITORIA.PRODUCTO_ELIMINADO,
      entidad: ENTIDADES_AUDITORIA.PRODUCTO,
      entidadId: producto._id,
      usuario: req.usuario,
      antes: snapshotAnterior,
      metadata: { modo: 'ELIMINADO' }
    });

    return res.json({
      message: 'Producto eliminado correctamente',
      modo: 'ELIMINADO'
    });
  } catch (error) {
    return next(error);
  }
});

// Cambiar disponibilidad: requiere products:manage.
router.patch('/:id/disponible', requirePermission(PERMISSIONS.PRODUCTS_MANAGE), async (req, res, next) => {
  try {
    const { disponible } = req.body;
    if (typeof disponible !== 'boolean') {
      return res.status(400).json({ message: 'Se espera el campo "disponible" como booleano' });
    }

    const productoAnterior = await Producto.findById(req.params.id);
    if (!productoAnterior) return res.status(404).json({ message: 'Producto no encontrado' });
    const disponibleAnterior = productoAnterior.disponible;

    productoAnterior.disponible = disponible;
    await productoAnterior.save();

    await registrarAuditoria({
      accion: ACCIONES_AUDITORIA.PRODUCTO_DISPONIBILIDAD_CAMBIADA,
      entidad: ENTIDADES_AUDITORIA.PRODUCTO,
      entidadId: productoAnterior._id,
      usuario: req.usuario,
      antes: { disponible: disponibleAnterior },
      despues: { disponible: productoAnterior.disponible },
      metadata: { nombre: productoAnterior.nombre }
    });

    res.json({ message: 'Disponibilidad actualizada', producto: productoAnterior });
  } catch (error) {
    return next(error);
  }
});

export default router;


