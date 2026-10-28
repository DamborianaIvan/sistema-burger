import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import mongoose from 'mongoose';

test('un puerto ocupado falla al arrancar y no anuncia una API iniciada', async () => {
  const ocupado = net.createServer().listen(0);
  await once(ocupado, 'listening');
  process.env.PORT = String(ocupado.address().port);
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/no-se-conecta';
  process.env.JWT_SECRET = 'synthetic-secret-for-startup-error-test';
  const { startServer } = await import('../server.js');
  const connect = mongoose.connect;
  const disconnect = mongoose.disconnect;
  const log = console.log;
  const mensajes = [];
  let desconectado = false;
  mongoose.connect = async () => {};
  mongoose.disconnect = async () => { desconectado = true; };
  console.log = mensaje => mensajes.push(mensaje);
  try {
    await assert.rejects(startServer(), { code: 'EADDRINUSE' });
    assert.equal(desconectado, true);
    assert.equal(mensajes.some(m => m.includes('API en puerto')), false);
  } finally {
    mongoose.connect = connect;
    mongoose.disconnect = disconnect;
    console.log = log;
    await new Promise(resolve => ocupado.close(resolve));
  }
});
