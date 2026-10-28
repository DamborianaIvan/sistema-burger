import 'dotenv/config';
import { parseOrderTypes } from './utils/modalidades.js';
import { parseFeatureFlag } from './utils/featureFlags.js';

const DEFAULT_PORT = 5001;
const DEFAULT_BASE_URL = 'http://localhost:5001';
const DEFAULT_JWT_EXPIRES_IN = '1d';

const parsePort = (value) => {
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_PORT;
};

const parseCorsOrigins = (value) => {
  if (!value) return ['http://localhost:5174', 'http://127.0.0.1:5174'];

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  orderTypes: Object.freeze(parseOrderTypes(process.env.ORDER_TYPES)),
  prepizzasEnabled: parseFeatureFlag(process.env.ENABLE_PREPIZZAS),
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : false,
  baseUrl: process.env.BASE_URL || DEFAULT_BASE_URL,
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN,
  jwtSecret: process.env.JWT_SECRET,
  mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI,
  port: parsePort(process.env.PORT)
});

export const validateConfig = () => {
  if (config.trustProxy !== false && (!Number.isInteger(config.trustProxy) || config.trustProxy < 0 || config.trustProxy > 5)) {
    throw new Error('TRUST_PROXY debe indicar entre 0 y 5 saltos de proxy confiables');
  }
  const missing = [
    ['MONGODB_URI (o MONGO_URI)', config.mongoUri],
    ['JWT_SECRET', config.jwtSecret]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno requeridas: ${missing.join(', ')}`);
  }

  if (config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
  }

  if (config.corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS debe contener al menos un origen válido');
  }
};


