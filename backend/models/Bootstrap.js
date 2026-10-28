import mongoose from 'mongoose';

// El identificador fijo serializa el alta inicial incluso con varios procesos.
const schema = new mongoose.Schema({ _id: { type: String } });
export default mongoose.model('Bootstrap', schema);

