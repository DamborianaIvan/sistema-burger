import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: { type: String },
  expira: { type: Date, required: true }
});
schema.index({ expira: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('SesionRevocada', schema);

