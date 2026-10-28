import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

const getDatabaseStatus = () => {
  if (mongoose.connection.readyState === 1) return 'connected';
  if (mongoose.connection.readyState === 2) return 'connecting';
  return 'disconnected';
};

router.get('/', (req, res) => {
  const database = getDatabaseStatus();
  const healthy = database === 'connected';

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded'
  });
});

export default router;


