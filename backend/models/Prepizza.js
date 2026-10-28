import mongoose from "mongoose";
import { METODOS_PAGO } from "../constants/pedido.js";

const ref = (model, required = true) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref: model,
  required,
});
const texto = (max = 200) => ({
  type: String,
  trim: true,
  maxlength: max,
  default: "",
});
const componente = new mongoose.Schema(
  {
    ingredienteId: ref("Ingrediente"),
    cantidad: { type: Number, min: 0.000001, required: true },
  },
  { _id: false },
);
const variedadSchema = new mongoose.Schema(
  {
    nombre: { ...texto(80), required: true, unique: true },
    precio: { type: Number, min: 0, required: true },
    stockActual: { type: Number, min: 0, default: 0 },
    activa: { type: Boolean, default: true },
    componentes: { type: [componente], default: [] },
  },
  { timestamps: true },
);
const contactoSchema = new mongoose.Schema({
  fecha: { type: Date, default: Date.now },
  nota: texto(500),
  usuarioId: ref("Usuario"),
});
const comercioSchema = new mongoose.Schema(
  {
    nombre: { ...texto(100), required: true, unique: true },
    direccion: texto(),
    telefono: texto(60),
    activo: { type: Boolean, default: true },
    diasSeguimiento: { type: Number, min: 1, max: 365, default: 5 },
    ultimaEntrega: { type: Date, default: null },
    proximoSeguimiento: { type: Date, default: null },
    contactos: { type: [contactoSchema], default: [] },
  },
  { timestamps: true },
);
const itemSchema = new mongoose.Schema(
  {
    variedadId: ref("VariedadPrepizza"),
    nombre: { ...texto(80), required: true },
    cantidad: { type: Number, min: 1, required: true },
    precioUnitario: { type: Number, min: 0, required: true },
    subtotal: { type: Number, min: 0, required: true },
  },
  { _id: false },
);
const cobroSchema = new mongoose.Schema({
  claveOperacion: { type: String, required: true },
  monto: { type: Number, min: 0.01, required: true },
  metodo: { type: String, enum: Object.values(METODOS_PAGO), required: true },
  fecha: { type: Date, default: Date.now },
  usuarioId: ref("Usuario"),
  cajaId: ref("Caja"),
});
const pedidoSchema = new mongoose.Schema(
  {
    claveOperacion: { type: String, required: true, unique: true },
    comercioId: ref("ComercioPrepizza"),
    comercioNombre: { ...texto(100), required: true },
    items: { type: [itemSchema], required: true },
    total: { type: Number, min: 0, required: true },
    cobrado: { type: Number, min: 0, default: 0 },
    cobros: { type: [cobroSchema], default: [] },
    estado: {
      type: String,
      enum: ["PENDIENTE", "ENTREGADO", "CANCELADO"],
      default: "PENDIENTE",
    },
    fechaEntrega: { type: Date, default: null },
    entregadoPor: ref("Usuario", false),
    canceladoPor: ref("Usuario", false),
    fechaCancelacion: { type: Date, default: null },
    motivoCancelacion: texto(500),
    observaciones: texto(500),
    usuarioId: ref("Usuario"),
  },
  { timestamps: true },
);
pedidoSchema.index({ createdAt: -1, _id: -1 });
pedidoSchema.index({ comercioId: 1, createdAt: -1, _id: -1 });
pedidoSchema.index({ fechaEntrega: -1, estado: 1 });
pedidoSchema.index({ "cobros.fecha": -1 });
const movimientoSchema = new mongoose.Schema({
  claveOperacion: { type: String, required: true, unique: true },
  variedadId: ref("VariedadPrepizza"),
  nombre: { ...texto(80), required: true },
  tipo: {
    type: String,
    enum: ["PRODUCCION", "BAJA", "ENTREGA"],
    required: true,
  },
  cantidad: { type: Number, min: 1, required: true },
  stockAnterior: { type: Number, required: true },
  stockPosterior: { type: Number, min: 0, required: true },
  motivo: texto(500),
  pedidoId: ref("PedidoPrepizza", false),
  usuarioId: ref("Usuario"),
  consumos: { type: [componente], default: [] },
  fecha: { type: Date, default: Date.now, index: true },
});
export const VariedadPrepizza = mongoose.model(
  "VariedadPrepizza",
  variedadSchema,
);
export const ComercioPrepizza = mongoose.model(
  "ComercioPrepizza",
  comercioSchema,
);
export const PedidoPrepizza = mongoose.model("PedidoPrepizza", pedidoSchema);
export const MovimientoPrepizza = mongoose.model(
  "MovimientoPrepizza",
  movimientoSchema,
);


