import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDB } from './db/sqlite.js';
import apiRoutes from './routes/api.js';
import { initSocket } from './socket.js';
import { BotManager } from './bot/botManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

// Middleware
app.use(cors());
app.use(express.json());

// Initialize SQLite database
await initDB();

// Initialize Socket.IO
initSocket(io);

// Initialize Bot Manager (singleton)
export const botManager = new BotManager(io);

// API Routes
app.use('/api', apiRoutes);

// Serve static files in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;

function startServer() {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });

  httpServer.on('error', async (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Port ${PORT} in use, killing old process...`);
      const { execSync } = await import('child_process');
      try {
        execSync(`lsof -ti:${PORT} | xargs -r kill -9`, { stdio: 'ignore' });
      } catch {}
      setTimeout(() => startServer(), 1000);
    } else {
      throw err;
    }
  });
}

startServer();

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n⏹️ ${signal} received, shutting down...`);
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
  // Force exit after 3 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.log('⚠️ Forcing exit');
    process.exit(1);
  }, 3000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
