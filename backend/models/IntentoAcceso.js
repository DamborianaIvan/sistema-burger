import mongoose from 'mongoose';

// Ventanas compartidas por todas las instancias; no se guardan credenciales ni IP en claro.
const schema = new mongoose.Schema({
  _id: { type: String },
  cantidad: { type: Number, default: 0 },
  expira: { type: Date, required: true }
});
schema.index({ expira: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('IntentoAcceso', schema);

