import ControlOperacion from '../models/ControlOperacion.js';
import Usuario from '../models/Usuario.js';
import { transaccion } from '../utils/transaccion.js';
import { ApiError } from '../utils/apiError.js';
import { ROLES } from '../constants/roles.js';

export const administrarUsuarios = (actor, fn) => transaccion(async (session) => {
  // Serializa los cambios de personal para no desactivar los últimos administradores a la vez.
  await ControlOperacion.updateOne({ _id: 'usuarios' }, { $inc: { revision: 1 } }, { upsert: true, session });
  const actual = await Usuario.findById(actor.id).session(session);
  if (!actual?.activo || actual.rol !== ROLES.ADMIN) throw new ApiError(403, 'No tiene permisos para gestionar usuarios');
  return fn(session);
});

