import mongoose from 'mongoose';
import { UNIDADES_INGREDIENTE } from '../constants/stock.js';

const IngredienteSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  unidad: {
    type: String,
    enum: Object.values(UNIDADES_INGREDIENTE),
    required: true
  },
  stockActual: {
    type: Number,
    default: 0
  },
  stockMinimo: {
    type: Number,
    default: 0,
    min: 0
  },
  activo: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

IngredienteSchema.index({ activo: -1, nombre: 1 });

export default mongoose.model('Ingrediente', IngredienteSchema);

