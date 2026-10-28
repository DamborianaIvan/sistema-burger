import express from 'express';
import mongoose from 'mongoose';
import { protect, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { ROLES_VALUES, ROLES } from '../constants/roles.js';
import Usuario from '../models/Usuario.js';
import { ApiError } from '../utils/apiError.js';
import { datosUsuario, validarPassword } from '../utils/validaciones.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { administrarUsuarios } from '../services/administracionUsuariosService.js';
import { ACCIONES_AUDITORIA, ENTIDADES_AUDITORIA } from '../constants/auditoria.js';

const router = express.Router();

const usuarioPublico = (usuario) => ({
  _id: usuario._id,
  nombre: usuario.nombre,
  nombreUsuario: usuario.nombreUsuario,
  email: usuario.email,
  rol: usuario.rol,
  activo: usuario.activo,
  fechaCreacion: usuario.fechaCreacion
});

const validarRol = (rol) => {
  if (!ROLES_VALUES.includes(rol)) {
    throw new ApiError(400, 'rol inválido', {
      field: 'rol',
      allowedValues: ROLES_VALUES
    });
  }
};

router.use(protect, requirePermission(PERMISSIONS.USERS_MANAGE));

router.get('/', asyncHandler(async (req, res) => {
  const usuarios = await Usuario.find().sort({ fechaCreacion: -1 });
  return res.json(usuarios.map(usuarioPublico));
}));

router.post('/', asyncHandler(async (req, res) => {
  const resultado = await administrarUsuarios(req.usuario, async (session) => {
    const { password, rol } = req.body;
    const { nombre, nombreUsuario, email } = datosUsuario(req.body);

    if (!nombre || !nombreUsuario || !email || !password || !rol) {
      throw new ApiError(400, 'nombre, nombreUsuario, email, password y rol son obligatorios', {
        fields: ['nombre', 'nombreUsuario', 'email', 'password', 'rol']
      });
    }

    validarRol(rol);
    validarPassword(password);

    const [usuario] = await Usuario.create([{
      nombre,
      nombreUsuario,
      email,
      password,
      rol,
      activo: true
    }], { session });

    await registrarAuditoria({
      accion: ACCIONES_AUDITORIA.USUARIO_CREADO,
      entidad: ENTIDADES_AUDITORIA.USUARIO,
      entidadId: usuario._id,
      usuario: req.usuario,
      despues: usuarioPublico(usuario)
    }, { session });

    return usuarioPublico(usuario);
  });
  return res.status(201).json(resultado);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const resultado = await administrarUsuarios(req.usuario, async (session) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, 'Identificador de usuario inválido');
    }

    const usuario = await Usuario.findById(req.params.id).session(session);
    if (!usuario) throw new ApiError(404, 'Usuario no encontrado');

    const antes = usuarioPublico(usuario);
    const { rol } = req.body;
    const { nombre, nombreUsuario, email } = datosUsuario(req.body, true);

    if (rol !== undefined) {
      validarRol(rol);

      if (usuario._id.toString() === req.usuario.id && rol !== usuario.rol) {
        throw new ApiError(403, 'No puede cambiar su propio rol');
      }

      if (usuario.rol === ROLES.ADMIN && rol !== ROLES.ADMIN && usuario.activo) {
        const adminsActivos = await Usuario.countDocuments({
          rol: ROLES.ADMIN,
          activo: true,
          _id: { $ne: usuario._id }
        }).session(session);

        if (adminsActivos === 0) {
          throw new ApiError(409, 'Debe existir al menos un administrador activo');
        }
      }

      usuario.rol = rol;
    }

    if (nombre !== undefined) usuario.nombre = nombre;
    if (nombreUsuario !== undefined) usuario.nombreUsuario = nombreUsuario;
    if (email !== undefined) usuario.email = email;

    await usuario.save({ session });

    await registrarAuditoria({
      accion: ACCIONES_AUDITORIA.USUARIO_ACTUALIZADO,
      entidad: ENTIDADES_AUDITORIA.USUARIO,
      entidadId: usuario._id,
      usuario: req.usuario,
      antes,
      despues: usuarioPublico(usuario)
    }, { session });

    return usuarioPublico(usuario);
  });
  return res.status(200).json(resultado);
}));

router.patch('/:id/estado', asyncHandler(async (req, res) => {
  const resultado = await administrarUsuarios(req.usuario, async (session) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, 'Identificador de usuario inválido');
    }

    const { activo } = req.body;
    if (typeof activo !== 'boolean') {
      throw new ApiError(400, 'activo debe ser booleano', { field: 'activo' });
    }

    const usuario = await Usuario.findById(req.params.id).session(session);
    if (!usuario) throw new ApiError(404, 'Usuario no encontrado');

    const estadoAnterior = usuario.activo;

    if (usuario._id.toString() === req.usuario.id && !activo) {
      throw new ApiError(403, 'No puede desactivar su propio usuario');
    }

    if (usuario.activo && !activo && usuario.rol === ROLES.ADMIN) {
      const adminsActivos = await Usuario.countDocuments({
        rol: ROLES.ADMIN,
        activo: true,
        _id: { $ne: usuario._id }
      }).session(session);

      if (adminsActivos === 0) {
        throw new ApiError(409, 'Debe existir al menos un administrador activo');
      }
    }

    usuario.activo = activo;
    await usuario.save({ session });

    await registrarAuditoria({
      accion: ACCIONES_AUDITORIA.USUARIO_ESTADO_CAMBIADO,
      entidad: ENTIDADES_AUDITORIA.USUARIO,
      entidadId: usuario._id,
      usuario: req.usuario,
      antes: { activo: estadoAnterior },
      despues: { activo: usuario.activo }
    }, { session });

    return usuarioPublico(usuario);
  });
  return res.status(200).json(resultado);
}));

router.patch('/:id/password', asyncHandler(async (req, res) => {
  const resultado = await administrarUsuarios(req.usuario, async (session) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, 'Identificador de usuario inválido');
    }

    const { password } = req.body;
    validarPassword(password);

    const usuario = await Usuario.findById(req.params.id).session(session);
    if (!usuario) throw new ApiError(404, 'Usuario no encontrado');

    usuario.password = password;
    await usuario.save({ session });

    await registrarAuditoria({
      accion: ACCIONES_AUDITORIA.USUARIO_PASSWORD_CAMBIADO,
      entidad: ENTIDADES_AUDITORIA.USUARIO,
      entidadId: usuario._id,
      usuario: req.usuario,
      metadata: {
        usuarioAfectado: usuario.nombreUsuario
      }
    }, { session });

    return { message: 'Contraseña actualizada correctamente' };
  });
  return res.status(200).json(resultado);
}));

export default router;


