
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables FIRST
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Import environment-dependent modules AFTER dotenv
const { default: connectDB } = await import('./config/db.js');
const { default: studentRoutes } = await import('./routes/students.js');
const { default: violationRoutes } = await import('./routes/violations.js');
const { default: authRoutes } = await import('./routes/auth.js');
const { default: authMiddleware } = await import('./middleware/auth.js');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.use(
    '/uploads',
    authMiddleware,
    express.static(path.join(__dirname, '../uploads'))
);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'GreenEye',
    message: 'Backend is running'
  });
});

// Public login route
app.use('/api/auth', authRoutes);

// Protected API routes
app.use('/api/students', authMiddleware, studentRoutes);
app.use('/api/violations', authMiddleware, violationRoutes);

app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

async function start() {
  if (process.env.MONGODB_URI) {
    await connectDB();
  } else {
    console.log('MONGODB_URI not set — running without database connection.');
  }

  app.listen(PORT, () => {
    console.log(`GreenEye running at http://localhost:${PORT}`);
  });
}

start();
