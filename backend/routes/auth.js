
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';

const router = express.Router();

// Admin Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required.'
      });
    }

    const admin = await Admin.findOne({
      email: email.trim().toLowerCase()
    }).select('+password');

    if (!admin) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    const token = jwt.sign(
      {
        id: admin._id.toString(),
        role: admin.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      message: 'Login successful.',
      token,
      admin: {
        email: admin.email,
        role: admin.role
      }
    });

  } catch (error) {
    console.error('Login error:', error.message);

    res.status(500).json({
      message: 'Server error during login.'
    });
  }
});

export default router;
