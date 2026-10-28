import express from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import Usuario from '../models/Usuario.js';
import { ROLES } from '../constants/roles.js';
import { ApiError } from '../utils/apiError.js';
import { texto, datosUsuario, validarPassword } from '../utils/validaciones.js';
import { limitarLoginIp, limitarLoginCuenta, limitarRegistro, descontarAccesoExitoso } from '../middleware/loginLimiter.js';
import Bootstrap from '../models/Bootstrap.js';
import SesionRevocada from '../models/SesionRevocada.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { protect } from '../middleware/auth.js';
import { transaccion } from '../utils/transaccion.js';

const router = express.Router();

// Bootstrap público: solo permite crear el primer administrador.
router.post('/register', limitarRegistro, async (req, res, next) => {
  try {
    const datos = datosUsuario(req.body);
    const password = validarPassword(req.body.password);
    await transaccion(async (session) => {
      if (await Usuario.exists({}).session(session)) {
        throw new ApiError(403, 'El registro público está cerrado');
      }
      try {
        await Bootstrap.create([{ _id: 'administrador-inicial' }], { session });
      } catch (error) {
        if (error.code === 11000) throw new ApiError(403, 'El registro público está cerrado');
        throw error;
      }
      const [nuevo] = await Usuario.create([{ ...datos, password, rol: ROLES.ADMIN }], { session });
      await registrarAuditoria({
        accion: 'USUARIO_CREADO', entidad: 'USUARIO', entidadId: nuevo._id,
        usuario: { id: String(nuevo._id), nombre: nuevo.nombre },
        despues: { nombre: nuevo.nombre, nombreUsuario: nuevo.nombreUsuario, email: nuevo.email, rol: nuevo.rol, activo: nuevo.activo },
        metadata: { origen: 'INSTALACION' }
      }, { session });
    });
    return res.status(201).json({ message: 'Usuario administrador creado con éxito' });
  } catch (error) {
    return next(error);
  }
});

const validarLogin = (req, res, next) => {
  try {
    req.body.nombreUsuario = texto(req.body.nombreUsuario, 'nombreUsuario', { min: 1, max: 80 });
    // El mínimo de ocho se aplica al crear/cambiar contraseñas, no al validar una existente.
    texto(req.body.password, 'password', { min: 1, max: 1024, trim: false });
    return next();
  } catch (error) {
    return next(error);
  }
};

// Login
router.post('/login', limitarLoginIp, validarLogin, limitarLoginCuenta, async (req, res, next) => {
  try {
    const { nombreUsuario, password } = req.body;

    if (!nombreUsuario || !password) {
      throw new ApiError(400, 'nombreUsuario y password son obligatorios', {
        fields: ['nombreUsuario', 'password']
      });
    }

    const usuario = await Usuario.findOne({ nombreUsuario }).select('+password');
    if (!usuario || !usuario.activo) {
      throw new ApiError(401, 'Usuario o contraseña incorrectos');
    }

    const isMatch = await usuario.matchPassword(password);
    if (!isMatch) {
      throw new ApiError(401, 'Usuario o contraseña incorrectos');
    }

    await descontarAccesoExitoso(req.intentoAccesoId);

    const token = jwt.sign(
      { id: usuario._id, rol: usuario.rol, sv: usuario.versionSesion ?? 0 },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn, algorithm: 'HS256', jwtid: randomUUID() }
    );

    return res.json({
      token,
      rol: usuario.rol,
      nombre: usuario.nombre,
      id: usuario._id,
      orderTypes: config.orderTypes
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', protect, async (req, res, next) => {
  try {
    await SesionRevocada.updateOne({ _id: req.sesion.hash }, {
      $setOnInsert: { expira: req.sesion.expira }
    }, { upsert: true });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

export default router;

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Autenticación de usuarios
 */
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Crear el primer usuario administrador
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *               - nombreUsuario
 *               - password
 *               - email
 *             properties:
 *               nombre:
 *                 type: string
 *               nombreUsuario:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Usuario administrador creado correctamente
 *       400:
 *         description: Datos requeridos ausentes
 *       403:
 *         description: El registro público está cerrado
 */
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombreUsuario
 *               - password
 *             properties:
 *               nombreUsuario:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login exitoso con token JWT
 *       400:
 *         description: Datos requeridos ausentes
 *       401:
 *         description: Credenciales incorrectas
 */


