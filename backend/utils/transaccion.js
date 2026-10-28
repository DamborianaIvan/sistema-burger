import mongoose from 'mongoose';

export const transaccion = async (fn) => {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => fn(session), {
      readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }
    });
  } finally {
    await session.endSession();
  }
};

