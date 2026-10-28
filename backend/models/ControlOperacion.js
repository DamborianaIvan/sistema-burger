import mongoose from 'mongoose';

const schema = new mongoose.Schema({ _id: { type: String }, revision: { type: Number, default: 0 } });
export default mongoose.model('ControlOperacion', schema);

