import mongoose from 'mongoose';

const SalaryRecordSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: 'Pending' }, // Paid, Pending
  notes: { type: String },
});

export default mongoose.model('SalaryRecord', SalaryRecordSchema);
