import mongoose from 'mongoose';
import { AvailabilityStatus } from '../utils/enums.js';

const AvailabilityHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
  date: { type: Date, required: true },
  status: { type: String, enum: Object.values(AvailabilityStatus), required: true },
  reason: { type: String },
});

AvailabilityHistorySchema.index({ user: 1 });

export default mongoose.model('AvailabilityHistory', AvailabilityHistorySchema);
