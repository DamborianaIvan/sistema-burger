import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { validarPassword } from '../utils/validaciones.js';
import { ROLES_VALUES, ROLES } from '../constants/roles.js';

const UsuarioSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true
  },
  nombreUsuario: {
    type: String,
    required: true,
    maxlength: 80,
    trim: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 254,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    unique: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  rol: {
    type: String,
    enum: ROLES_VALUES,
    default: ROLES.ADMIN
  },
  activo: {
    type: Boolean,
    default: true
  },
  versionSesion: { type: Number, default: 0, min: 0 },
  fechaCreacion: {
    type: Date,
    default: Date.now
  }
}, { optimisticConcurrency: true });

UsuarioSchema.pre('validate', function (next) {
  if (!this.isModified('password')) return next();
  try { validarPassword(this.password); return next(); } catch (error) { return next(error); }
});

UsuarioSchema.pre('save', async function (next) {
  if (!this.isNew && ['password', 'rol', 'activo'].some((campo) => this.isModified(campo))) {
    this.versionSesion = (this.versionSesion ?? 0) + 1;
  }
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UsuarioSchema.methods.matchPassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

export default mongoose.model('Usuario', UsuarioSchema);


