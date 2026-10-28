import mongoose from 'mongoose';
import { TIPOS_MOVIMIENTO_STOCK } from '../constants/stock.js';

const MovimientoStockSchema = new mongoose.Schema({
  ingredienteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ingrediente',
    required: true,
    index: true
  },
  tipo: {
    type: String,
    enum: Object.values(TIPOS_MOVIMIENTO_STOCK),
    required: true,
    index: true
  },
  cantidad: {
    type: Number,
    required: true,
    min: 0.000001
  },
  stockAnterior: {
    type: Number,
    required: true
  },
  stockPosterior: {
    type: Number,
    required: true
  },
  motivo: {
    type: String,
    trim: true,
    default: ''
  },
  produccionPrepizzaClave: { type: String, default: null, index: true },
  pedidoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pedido',
    default: null,
    index: true
  },
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  },
  fecha: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

MovimientoStockSchema.index({ ingredienteId: 1, fecha: -1 });
MovimientoStockSchema.index(
  { pedidoId: 1, ingredienteId: 1, tipo: 1 },
  {
    unique: true,
    partialFilterExpression: {
      pedidoId: { $type: 'objectId' },
      tipo: TIPOS_MOVIMIENTO_STOCK.CONSUMO
    }
  }
);

MovimientoStockSchema.index({ fecha: -1, _id: -1 });

export default mongoose.model('MovimientoStock', MovimientoStockSchema);



