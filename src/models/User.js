import mongoose from 'mongoose';
import { genSalt, hash, compare } from 'bcrypt';
import { Role, AvailabilityStatus, ActionType } from '../utils/enums.js';


const SalaryRecordSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: 'Pending' }, // e.g., Paid, Pending
  notes: { type: String },
});

const AvailabilityHistorySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  status: { type: String, enum: Object.values(AvailabilityStatus), required: true },
  reason: { type: String },
});

const UserHistorySchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  action: { type: String, enum: Object.values(ActionType), required: true },
  details: { type: mongoose.Schema.Types.Mixed },
});

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, index: true },
    email: { type: String, required: true, unique: true, trim: true, index: true },
    password: { type: String, required: true },
    role: { type: String, enum: Object.values(Role), required: true, index: true },
    image: { type: String },
    isAvailable: { type: Boolean, default: true, index: true },
    manualAvailability: { type: String, enum: Object.values(AvailabilityStatus), default: null },
    visaStatus: { type: String },
    visaExpiryDate: { type: Date, index: true },
    nationality: { type: String },
    sex: { type: String },
    salary: { type: Number },
    salaryHistory: [SalaryRecordSchema],
    availabilityHistory: [AvailabilityHistorySchema],
    history: [UserHistorySchema],
    kitchenId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kitchen', index: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', index: true },
  },
  { timestamps: true }
);

// Password hashing middleware
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await genSalt(10);
    this.password = await hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method to compare password during login
UserSchema.methods.comparePassword = function (candidatePassword) {
  return compare(candidatePassword, this.password);
};

// Virtual property to compute overall availability
UserSchema.virtual('computedIsAvailable').get(function () {
  // If manualAvailability is set to 'Unavailable', the user is unavailable
  if (this.manualAvailability === AvailabilityStatus.UNAVAILABLE) {
    return false;
  }
  // If the user is assigned to a kitchen or shop, they are unavailable
  if (this.kitchenId || this.shopId) {
    return false;
  }
  // Otherwise, the user is available
  return true;
});

// Update isAvailable before saving
UserSchema.pre('save', function (next) {
  this.isAvailable = this.computedIsAvailable;
  next();
});


// Text index for search functionality
UserSchema.index({ username: 'text', email: 'text', nationality: 'text' });

export default mongoose.model('User', UserSchema);
