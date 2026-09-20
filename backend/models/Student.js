import mongoose from 'mongoose';
const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  department: { type: String, default: 'CSE' },
  semester: { type: Number, default: 7 },
  email: { type: String, required: true, trim: true },
  phone: { type: String, default: '' },
  faceDescriptor: { type: [Number], default: [] }
}, { timestamps: true });
export default mongoose.model('Student', studentSchema);
