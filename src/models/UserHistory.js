import mongoose from 'mongoose';
import { ActionType } from '../utils/enums.js';

const UserHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
  timestamp: { type: Date, default: Date.now },
  action: { type: String, enum: Object.values(ActionType), required: true },
  details: { type: mongoose.Schema.Types.Mixed },
});

export default mongoose.model('UserHistory', UserHistorySchema);
