import mongoose from 'mongoose';
import { ESTADOS_CAJA } from '../constants/caja.js';
import { METODOS_PAGO } from '../constants/pedido.js';

const TotalesPorMetodoSchema = new mongoose.Schema({
  [METODOS_PAGO.EFECTIVO]: { type: Number, default: 0, min: 0 },
  [METODOS_PAGO.TRANSFERENCIA]: { type: Number, default: 0, min: 0 },
  [METODOS_PAGO.DEBITO]: { type: Number, default: 0, min: 0 },
  [METODOS_PAGO.CREDITO]: { type: Number, default: 0, min: 0 }
}, { _id: false });

const CajaSchema = new mongoose.Schema({
  estado: {
    type: String,
    enum: Object.values(ESTADOS_CAJA),
    default: ESTADOS_CAJA.ABIERTA,
    required: true
  },
  montoInicial: {
    type: Number,
    required: true,
    min: 0
  },
  fechaApertura: {
    type: Date,
    default: Date.now,
    required: true
  },
  abiertaPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true
  },
  fechaCierre: {
    type: Date,
    default: null
  },
  cerradaPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  },
  totalesPorMetodo: {
    type: TotalesPorMetodoSchema,
    default: () => ({})
  },
  efectivoEsperado: {
    type: Number,
    default: null,
    min: 0
  },
  efectivoDeclarado: {
    type: Number,
    default: null,
    min: 0
  },
  diferencia: {
    type: Number,
    default: null
  }
}, {
  timestamps: true
});

CajaSchema.index({ fechaCierre: -1 });

CajaSchema.index(
  { estado: 1 },
  {
    unique: true,
    partialFilterExpression: { estado: ESTADOS_CAJA.ABIERTA }
  }
);

export default mongoose.model('Caja', CajaSchema);

