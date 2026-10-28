import mongoose from 'mongoose';
import { ACCIONES_AUDITORIA, ENTIDADES_AUDITORIA } from '../constants/auditoria.js';

const AuditLogSchema = new mongoose.Schema({
  accion: {
    type: String,
    enum: Object.values(ACCIONES_AUDITORIA),
    required: true,
    index: true
  },
  entidad: {
    type: String,
    enum: Object.values(ENTIDADES_AUDITORIA),
    required: true,
    index: true
  },
  entidadId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true
  },
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null,
    index: true
  },
  usuarioNombreSnapshot: {
    type: String,
    trim: true,
    default: null
  },
  antes: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  despues: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  fecha: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  }
}, {
  timestamps: true
});

AuditLogSchema.index({ fecha: -1, accion: 1 });
AuditLogSchema.index({ entidad: 1, fecha: -1 });
AuditLogSchema.index({ accion: 1, fecha: -1 });
AuditLogSchema.index({ entidad: 1, entidadId: 1, fecha: -1 });

AuditLogSchema.index({ fecha: -1, _id: -1 });

export default mongoose.model('AuditLog', AuditLogSchema);


