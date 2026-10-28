import express from 'express';
import { protect, requirePermission, restrictTo } from '../middleware/auth.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { ROLES } from '../constants/roles.js';
import CategoriaProducto from '../models/CategoriaProducto.js';
import Producto from '../models/Producto.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { asegurarCategoriasProductoBase } from '../services/categoriaProductoService.js';
import {
  esNombreCategoriaProductoValido,
  normalizarNombreCategoriaProducto
} from '../utils/categoriaProducto.js';
import { ACCIONES_AUDITORIA, ENTIDADES_AUDITORIA } from '../constants/auditoria.js';

const router = express.Router();
router.use(protect, restrictTo(ROLES.ADMIN, ROLES.CAJERO));

router.get('/', async (_req, res) => {
  try {
    await asegurarCategoriasProductoBase();

    const categorias = await CategoriaProducto.find({})
      .sort({ esPredeterminada: -1, nombre: 1 });

    res.json(categorias);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener categorías' });
  }
});

router.post(
  '/',
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    try {
      const nombre = normalizarNombreCategoriaProducto(req.body?.nombre);

      if (!esNombreCategoriaProductoValido(nombre)) {
        return res.status(400).json({
          message: 'La categoría debe tener entre 2 y 40 caracteres'
        });
      }

      await asegurarCategoriasProductoBase();

      const existente = await CategoriaProducto.findOne({ nombre });
      if (existente) {
        return res.status(409).json({ message: 'La categoría ya existe' });
      }

      const categoria = await CategoriaProducto.create({
        nombre,
        esPredeterminada: false
      });

      await registrarAuditoria({
        accion: ACCIONES_AUDITORIA.CATEGORIA_PRODUCTO_CREADA,
        entidad: ENTIDADES_AUDITORIA.PRODUCTO,
        entidadId: categoria._id,
        usuario: req.usuario,
        despues: { categoria: categoria.nombre }
      });

      res.status(201).json(categoria);
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ message: 'La categoría ya existe' });
      }

      console.error(error);
      res.status(500).json({ message: 'Error al crear la categoría' });
    }
  }
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    try {
      const categoria = await CategoriaProducto.findById(req.params.id);

      if (!categoria) {
        return res.status(404).json({ message: 'Categoría no encontrada' });
      }

      if (categoria.esPredeterminada) {
        return res.status(409).json({
          message: 'Las categorías base no se pueden eliminar'
        });
      }

      const tieneProductos = await Producto.exists({
        categoria: categoria.nombre,
        activo: { $ne: false }
      });

      if (tieneProductos) {
        return res.status(409).json({
          message: 'No se puede eliminar una categoría que tiene productos activos'
        });
      }

      await CategoriaProducto.findByIdAndDelete(categoria._id);

      await registrarAuditoria({
        accion: ACCIONES_AUDITORIA.CATEGORIA_PRODUCTO_ELIMINADA,
        entidad: ENTIDADES_AUDITORIA.PRODUCTO,
        entidadId: categoria._id,
        usuario: req.usuario,
        antes: { categoria: categoria.nombre }
      });

      res.json({ message: 'Categoría eliminada correctamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error al eliminar la categoría' });
    }
  }
);

export default router;


