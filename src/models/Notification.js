import mongoose from 'mongoose';


const NotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now, index: true },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Compound index to efficiently query unread notifications for a user
NotificationSchema.index({ userId: 1, isRead: 1 });

export default mongoose.model('Notification', NotificationSchema);
