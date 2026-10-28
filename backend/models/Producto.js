import mongoose from 'mongoose';
import { normalizarNombreCategoriaProducto } from '../utils/categoriaProducto.js';

const ProductoSchema = new mongoose.Schema({
  categoria: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 40,
    set: normalizarNombreCategoriaProducto
  },

  nombre: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 80,
    unique: true
  },

  descripcion: {
    type: String,
    maxlength: 2000,
    trim: true
  },

  precio: {
    type: Number,
    required: true,
    min: 0,
    max: 100000000,
    validate: Number.isFinite
  },

  imagen: {
    type: String,
    trim: true
  },

  disponible: {
    type: Boolean,
    default: true
  },

  activo: {
    type: Boolean,
    default: true,
    index: true
  },

  fechaCreacion: {
    type: Date,
    default: Date.now
  }
});

ProductoSchema.index({ categoria: 1, nombre: 1 });

export default mongoose.model('Producto', ProductoSchema);


