import mongoose from 'mongoose';

const ComponenteRecetaSchema = new mongoose.Schema({
  ingredienteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ingrediente',
    required: true
  },
  cantidad: {
    type: Number,
    required: true,
    min: 0.000001
  }
}, { _id: false });

const RecetaSchema = new mongoose.Schema({
  productoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Producto',
    required: true,
    unique: true
  },
  componentes: {
    type: [ComponenteRecetaSchema],
    default: []
  },
  activa: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

export default mongoose.model('Receta', RecetaSchema);

