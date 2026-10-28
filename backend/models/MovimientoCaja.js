import mongoose from 'mongoose';
import { TIPOS_MOVIMIENTO_CAJA } from '../constants/caja.js';
import { METODOS_PAGO } from '../constants/pedido.js';

const MovimientoCajaSchema = new mongoose.Schema({
  cajaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Caja',
    required: true,
    index: true
  },
  pedidoPrepizzaId: { type: mongoose.Schema.Types.ObjectId, ref: 'PedidoPrepizza', default: null, index: true },
  pedidoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pedido',
    default: null,
    index: true
  },
  tipo: {
    type: String,
    enum: Object.values(TIPOS_MOVIMIENTO_CAJA),
    required: true,
    index: true
  },
  metodo: {
    type: String,
    enum: Object.values(METODOS_PAGO),
    default: null
  },
  monto: {
    type: Number,
    required: true,
    min: 0
  },
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true
  },
  fecha: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  }
}, {
  timestamps: true
});

MovimientoCajaSchema.index({ cajaId: 1, fecha: 1, _id: 1 });


export default mongoose.model('MovimientoCaja', MovimientoCajaSchema);



