import { once } from 'node:events';
import mongoose from 'mongoose';
import app from '../../server.js';
import Usuario from '../../models/Usuario.js';
import Pedido from '../../models/Pedido.js';
import Producto from '../../models/Producto.js';
import Mesa from '../../models/Mesa.js';
import Caja from '../../models/Caja.js';
import MovimientoCaja from '../../models/MovimientoCaja.js';
import Ingrediente from '../../models/Ingrediente.js';
import Receta from '../../models/Receta.js';
import MovimientoStock from '../../models/MovimientoStock.js';
import { VariedadPrepizza, ComercioPrepizza, PedidoPrepizza, MovimientoPrepizza } from '../../models/Prepizza.js';
import AuditLog from '../../models/AuditLog.js';
import IntentoAcceso from '../../models/IntentoAcceso.js';
import Bootstrap from '../../models/Bootstrap.js';
import SesionRevocada from '../../models/SesionRevocada.js';
import ControlOperacion from '../../models/ControlOperacion.js';

export const TEST_MONGODB_URI = process.env.MONGODB_TEST_URI;
export const INTEGRATION_ENABLED = Boolean(TEST_MONGODB_URI);

let server;
export let baseUrl;

export const limpiarUsuarios = async () => {
  await Usuario.deleteMany({});
  await IntentoAcceso.deleteMany({});
  await Bootstrap.deleteMany({});
  await SesionRevocada.deleteMany({});
  await ControlOperacion.deleteMany({});
};

export const crearUsuario = async (datos = {}) => {
  return Usuario.create({
    nombre: 'Administrador Test',
    nombreUsuario: 'admin-test',
    email: 'admin-test@example.com',
    password: 'password-admin-123',
    rol: 'ADMIN',
    ...datos
  });
};

export const iniciarServidorDePrueba = async () => {
  server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
};

export const detenerServidorDePrueba = async () => {
  if (server) {
    server.close();
    await once(server, 'close');
    server = undefined;
  }
};

export const conectarBaseDePrueba = async () => {
  if (!TEST_MONGODB_URI) return;
  await mongoose.connect(TEST_MONGODB_URI);
};

export const desconectarBaseDePrueba = async () => {
  await mongoose.disconnect();
};

export const requestJson = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });

  const body = await response.json();
  return { response, body };
};

export const loginComo = async (nombreUsuario, password) => {
  const { response, body } = await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ nombreUsuario, password })
  });

  if (!response.ok) {
    throw new Error(`No se pudo iniciar sesión: ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
};

export const authorization = (token) => ({
  authorization: `Bearer ${token}`
});

export const limpiarPedidos = async () => {
  await Promise.all([
    VariedadPrepizza.deleteMany({}), ComercioPrepizza.deleteMany({}), PedidoPrepizza.deleteMany({}), MovimientoPrepizza.deleteMany({}),
    Pedido.deleteMany({}),
    Producto.deleteMany({}),
    Mesa.deleteMany({}),
    MovimientoCaja.deleteMany({}),
    Caja.deleteMany({}),
    MovimientoStock.deleteMany({}),
    AuditLog.deleteMany({}),
    Receta.deleteMany({}),
    Ingrediente.deleteMany({})
  ]);
};

export const crearProducto = async (datos = {}) => {
  return Producto.create({
    categoria: 'HAMBURGUESAS',
    nombre: 'Pizza Test',
    descripcion: 'Producto de prueba',
    precio: 1000,
    disponible: true,
    ...datos
  });
};

export const crearMesa = async (datos = {}) => {
  return Mesa.create({
    numero: 1,
    nombre: 'Mesa Test',
    capacidad: 4,
    estado: 'LIBRE',
    activa: true,
    ...datos
  });
};



