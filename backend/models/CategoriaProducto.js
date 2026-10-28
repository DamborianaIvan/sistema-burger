import mongoose from 'mongoose';
import { normalizarNombreCategoriaProducto } from '../utils/categoriaProducto.js';

const CategoriaProductoSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 40,
    set: normalizarNombreCategoriaProducto
  },

  esPredeterminada: {
    type: Boolean,
    default: false
  },

  fechaCreacion: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('CategoriaProducto', CategoriaProductoSchema);

