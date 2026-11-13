
import mongoose from 'mongoose';

const violationSchema = new mongoose.Schema({
  violationId: {
    type: String,
    required: true,
    unique: true
  },

  studentId: {
    type: String,
    default: null
  },

  type: {
    type: String,
    default: 'Littering'
  },

  location: {
    type: String,
    default: 'College Campus'
  },

  confidence: {
    type: Number,
    default: 0
  },

  evidenceImage: {
    type: String,
    default: ''
  },

  // Distinguish test records from real records
  isTest: {
    type: Boolean,
    default: false,
    index: true
  },

  testLabel: {
    type: String,
    default: null
  },

  status: {
    type: String,
    enum: ['Pending Review', 'Reviewed', 'Approved', 'Rejected', 'Paid'],
    default: 'Pending Review'
  },

  fineAmount: {
    type: Number,
    default: 100,
    min: 0
  },

  paymentStatus: {
    type: String,
    enum: ['Unpaid', 'Paid'],
    default: 'Unpaid'
  },

  paidAt: {
    type: Date,
    default: null
  }

}, {
  timestamps: true
});

export default mongoose.model('Violation', violationSchema);
