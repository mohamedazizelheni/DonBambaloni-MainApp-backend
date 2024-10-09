import mongoose from 'mongoose';
import { ShiftType } from '../utils/enums.js';


const KitchenSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    address: { type: String, required: true },
    operatingShifts: [{ type: String, enum: Object.values(ShiftType), required: true }],
    teams: {
      type: Map,
      of: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: {},
    },
    image: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Index for text search on name and address
KitchenSchema.index({ name: 'text', address: 'text' });

KitchenSchema.pre('save', function (next) {
    const validShiftTypes = Object.values(ShiftType);

    if (!this.teams) {
        this.teams = new Map();
      }
    for (let key of this.teams.keys()) {
      if (!validShiftTypes.includes(key)) {
        return next(new Error(`Invalid shift type: ${key}`));
      }
    }
    next();
  });
export default mongoose.model('Kitchen', KitchenSchema);
