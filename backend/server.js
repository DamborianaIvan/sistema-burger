import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import swaggerUi from 'swagger-ui-express';
import { pathToFileURL } from 'node:url';
import { config, validateConfig } from './config.js';
import { openapiDefinition } from './docs/openapi.js';
import { paths } from './docs/paths.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { requestLogger } from './middleware/requestLogger.js';
import { requestBody } from './middleware/requestBody.js';
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import productosRoutes from './routes/productos.js';
import categoriasProductoRoutes from './routes/categoriasProducto.js';
import pedidosRoutes from './routes/pedidos.js';
import mesasRoutes from './routes/mesas.js';
import usuariosRoutes from './routes/usuarios.js';
import cajaRoutes from './routes/caja.js';
import stockRoutes from './routes/stock.js';
import reportesRoutes from './routes/reportes.js';
import auditoriaRoutes from './routes/auditoria.js';

const swaggerDocs = { ...openapiDefinition, paths };
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

app.use(securityHeaders);
app.use(requestLogger);

app.use(cors({
  origin: config.corsOrigins,
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Limit', 'X-Has-More']
}));
// No se necesitan cuerpos comprimidos: rechazarlos antes de descomprimir.
app.use(express.json({ limit: '1mb', inflate: false, strict: true }));
app.use(requestBody);

// La documentación interactiva se usa solo en desarrollo y pruebas.
if (config.nodeEnv !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
}
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/categorias-producto', categoriasProductoRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/mesas', mesasRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use(notFound);
app.use(errorHandler);

export const startServer = async () => {
  validateConfig();
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB conectado');

  try {
    return await new Promise((resolve, reject) => {
      const server = app.listen(config.port);
      server.once('error', reject);
      server.once('listening', () => {
        server.off('error', reject);
        console.log(`Sistema Burger: API en puerto ${config.port} (PID ${process.pid})`);
        console.log(`Orígenes CORS: ${config.corsOrigins.join(', ')}`);
        resolve(server);
      });
    });
  } catch (error) {
    await mongoose.disconnect();
    throw error;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exitCode = 1;
  });
}

export default app;



