import express from 'express';
import mongoose from 'mongoose';
import { protect, restrictTo } from '../middleware/auth.js';
import { ROLES } from '../constants/roles.js';
import Mesa from '../models/Mesa.js';
import Pedido from '../models/Pedido.js';
import { FORMAS_MESA, PLANO_MESAS } from '../constants/mesa.js';

const router = express.Router();
const ROLES_GESTION_MESAS = [ROLES.ADMIN, ROLES.CAJERO];

router.get('/', protect, restrictTo(ROLES.ADMIN, ROLES.CAJERO), async (req, res) => {
  try {
    const mesas = await Mesa.find({ activa: { $ne: false } }).sort({ numero: 1 });
    res.json(mesas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error obteniendo mesas' });
  }
});


// Persistir el plano completo: solo ADMIN.
router.patch('/layout', protect, restrictTo(ROLES.ADMIN), async (req, res) => {
  try {
    const items = req.body?.mesas;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Se requiere al menos una mesa para guardar el plano' });
    }

    const ids = items.map((item) => item?.id);
    if (ids.some((id) => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ message: 'El plano contiene IDs de mesa inválidos' });
    }

    if (new Set(ids.map(String)).size !== ids.length) {
      return res.status(400).json({ message: 'El plano no puede repetir mesas' });
    }

    const mesasExistentes = await Mesa.find({ _id: { $in: ids } }).select('_id');
    if (mesasExistentes.length !== ids.length) {
      return res.status(404).json({ message: 'Una o más mesas del plano no existen' });
    }

    const normalizados = [];

    for (const item of items) {
      const layout = item?.layout ?? {};
      const x = Number(layout.x);
      const y = Number(layout.y);
      const ancho = Number(layout.ancho);
      const alto = Number(layout.alto);
      const rotacion = Number(layout.rotacion);
      const forma = layout.forma;

      const numerosValidos = [x, y, ancho, alto, rotacion].every(Number.isFinite);
      if (!numerosValidos) {
        return res.status(400).json({ message: 'El layout contiene valores numéricos inválidos' });
      }

      if (
        ancho < PLANO_MESAS.MESA_ANCHO_MIN ||
        ancho > PLANO_MESAS.MESA_ANCHO_MAX ||
        alto < PLANO_MESAS.MESA_ALTO_MIN ||
        alto > PLANO_MESAS.MESA_ALTO_MAX
      ) {
        return res.status(400).json({ message: 'El tamaño de una mesa está fuera de los límites permitidos' });
      }

      if (x < 0 || y < 0 || x + ancho > PLANO_MESAS.ANCHO || y + alto > PLANO_MESAS.ALTO) {
        return res.status(400).json({ message: 'Una mesa queda fuera de los límites del plano' });
      }

      if (rotacion < 0 || rotacion >= 360) {
        return res.status(400).json({ message: 'La rotación debe estar entre 0 y 359 grados' });
      }

      if (!Object.values(FORMAS_MESA).includes(forma)) {
        return res.status(400).json({ message: 'Forma de mesa inválida' });
      }

      normalizados.push({
        id: item.id,
        layout: { x, y, ancho, alto, rotacion, forma }
      });
    }

    await Mesa.bulkWrite(normalizados.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { layout: item.layout } }
      }
    })));

    const mesas = await Mesa.find({ _id: { $in: ids } }).sort({ numero: 1 });
    return res.json({ message: 'Plano actualizado correctamente', mesas });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error guardando el plano de mesas' });
  }
});

router.get('/:id', protect, restrictTo(ROLES.ADMIN, ROLES.CAJERO), async (req, res) => {
  try {
    const mesa = await Mesa.findById(req.params.id);
    if (!mesa) return res.status(404).json({ message: 'Mesa no encontrada' });
    res.json(mesa);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error obteniendo mesa' });
  }
});

// Crear mesa: ADMIN o CAJERO. El panel de layout expone esta acción solo a ADMIN.
router.post('/', protect, restrictTo(...ROLES_GESTION_MESAS), async (req, res) => {
  try {
    const { numero, nombre, capacidad = 4, observaciones } = req.body;
    const numeroNormalizado = Number(numero);
    const capacidadNormalizada = Number(capacidad);

    if (!Number.isInteger(numeroNormalizado) || numeroNormalizado <= 0) {
      return res.status(400).json({ message: 'El número de mesa debe ser un entero mayor a cero' });
    }

    if (!Number.isInteger(capacidadNormalizada) || capacidadNormalizada <= 0) {
      return res.status(400).json({ message: 'La capacidad debe ser un entero mayor a cero' });
    }

    const existeMesa = await Mesa.findOne({ numero: numeroNormalizado });
    if (existeMesa) {
      return res.status(409).json({ message: 'Ya existe una mesa con ese número' });
    }

    const mesa = new Mesa({
      numero: numeroNormalizado,
      nombre: typeof nombre === 'string' && nombre.trim() ? nombre.trim() : `Mesa ${numeroNormalizado}`,
      capacidad: capacidadNormalizada,
      observaciones: typeof observaciones === 'string' ? observaciones.trim() : ''
    });

    await mesa.save();
    return res.status(201).json(mesa);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Ya existe una mesa con ese número' });
    }

    console.error(error);
    return res.status(500).json({ message: 'Error creando mesa' });
  }
});

// Editar datos de mesa: ADMIN o CAJERO.
router.put('/:id', protect, restrictTo(...ROLES_GESTION_MESAS), async (req, res) => {
  try {
    const mesa = await Mesa.findById(req.params.id);
    if (!mesa) return res.status(404).json({ message: 'Mesa no encontrada' });

    mesa.numero = req.body.numero ?? mesa.numero;
    mesa.nombre = req.body.nombre ?? mesa.nombre;
    mesa.capacidad = req.body.capacidad ?? mesa.capacidad;
    mesa.estado = req.body.estado ?? mesa.estado;
    mesa.observaciones = req.body.observaciones ?? mesa.observaciones;

    await mesa.save();
    res.json(mesa);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error actualizando mesa' });
  }
});

// Cambiar estado de mesa: ADMIN o CAJERO.
router.patch('/:id/estado', protect, restrictTo(...ROLES_GESTION_MESAS), async (req, res) => {
  try {
    const { estado } = req.body;
    const mesa = await Mesa.findById(req.params.id);
    if (!mesa) return res.status(404).json({ message: 'Mesa no encontrada' });

    mesa.estado = estado;
    await mesa.save();
    res.json({ message: 'Estado actualizado correctamente', mesa });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error actualizando estado' });
  }
});

// Retirar mesa del salón: solo ADMIN.
// Si posee historial, se archiva en lugar de borrarse para conservar referencias de pedidos.
router.delete('/:id', protect, restrictTo(ROLES.ADMIN), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'ID de mesa inválido' });
    }

    const mesa = await Mesa.findById(req.params.id);
    if (!mesa || mesa.activa === false) {
      return res.status(404).json({ message: 'Mesa no encontrada' });
    }

    if (mesa.estado === 'OCUPADA') {
      return res.status(409).json({ message: 'No se puede eliminar una mesa ocupada' });
    }

    const pedidoActivo = await Pedido.exists({
      mesaId: mesa._id,
      'cierre.cerrado': { $ne: true },
      estadoPedido: { $ne: 'CANCELADO' }
    });

    if (pedidoActivo) {
      return res.status(409).json({ message: 'No se puede eliminar una mesa con un pedido activo' });
    }

    const tieneHistorial = await Pedido.exists({ mesaId: mesa._id });

    if (tieneHistorial) {
      mesa.activa = false;
      mesa.estado = 'LIBRE';
      await mesa.save();

      return res.json({
        message: 'Mesa retirada del salón. Se conservó su historial de pedidos.',
        modo: 'ARCHIVADA'
      });
    }

    await Mesa.findByIdAndDelete(mesa._id);
    return res.json({
      message: 'Mesa eliminada correctamente',
      modo: 'ELIMINADA'
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error eliminando mesa' });
  }
});

export default router;


