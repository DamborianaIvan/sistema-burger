import mongoose from 'mongoose';
import { FORMAS_MESA, PLANO_MESAS } from '../constants/mesa.js';

const LayoutMesaSchema = new mongoose.Schema({
  x: {
    type: Number,
    default: 0,
    min: 0,
    max: PLANO_MESAS.ANCHO
  },
  y: {
    type: Number,
    default: 0,
    min: 0,
    max: PLANO_MESAS.ALTO
  },
  ancho: {
    type: Number,
    default: 140,
    min: PLANO_MESAS.MESA_ANCHO_MIN,
    max: PLANO_MESAS.MESA_ANCHO_MAX
  },
  alto: {
    type: Number,
    default: 110,
    min: PLANO_MESAS.MESA_ALTO_MIN,
    max: PLANO_MESAS.MESA_ALTO_MAX
  },
  rotacion: {
    type: Number,
    default: 0,
    min: 0,
    max: 359
  },
  forma: {
    type: String,
    enum: Object.values(FORMAS_MESA),
    default: FORMAS_MESA.RECTANGULAR
  }
}, { _id: false });

const MesaSchema = new mongoose.Schema({
  numero: {
    type: Number,
    required: true,
    unique: true
  },

  nombre: {
    type: String,
    default: null
  },

  capacidad: {
    type: Number,
    default: 4
  },

  estado: {
    type: String,
    enum: [
      'LIBRE',
      'OCUPADA'
    ],
    default: 'LIBRE'
  },

  activa: {
    type: Boolean,
    default: true
  },

  observaciones: {
    type: String,
    default: ''
  },

  layout: {
    type: LayoutMesaSchema,
    default: () => ({})
  }

}, {
  timestamps: true
});

export default mongoose.model('Mesa', MesaSchema);

