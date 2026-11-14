
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import connectDB from '../config/db.js';
import Admin from '../models/Admin.js';

async function createAdmin() {
  try {
    const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
    }

    if (ADMIN_PASSWORD.length < 12) {
      throw new Error('Admin password must be at least 12 characters.');
    }

    await connectDB();

    const email = ADMIN_EMAIL.trim().toLowerCase();

    const existingAdmin = await Admin.findOne({ email });

    if (existingAdmin) {
      console.log('Admin account already exists.');
      return;
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    await Admin.create({
      email,
      password: hashedPassword,
      role: 'admin'
    });

    console.log('Admin account created successfully.');
  } catch (error) {
    console.error('Admin setup failed:', error.message);
    process.exitCode = 1;
  } finally {
    const mongoose = await import('mongoose');
    await mongoose.default.disconnect();
  }
}

createAdmin();
