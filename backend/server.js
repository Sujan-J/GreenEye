import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import studentRoutes from './routes/students.js';
import violationRoutes from './routes/violations.js';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'GreenEye', message: 'Backend is running' }));
app.use('/api/students', studentRoutes);
app.use('/api/violations', violationRoutes);

app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/{*splat}', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

async function start() {
  if (process.env.MONGODB_URI) await connectDB();
  else console.log('MONGODB_URI not set — running without database connection.');
  app.listen(PORT, () => console.log(`GreenEye running at http://localhost:${PORT}`));
}
start();
