import Notification from '../models/Notification.js';
import mongoose from 'mongoose';

// Get notifications for the authenticated user with pagination
export const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ userId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const totalNotifications = await Notification.countDocuments({ userId });

    res.json({
      notifications,
      totalNotifications,
      totalPages: Math.ceil(totalNotifications / limit),
      currentPage: page,
    });
  } catch (err) {
    next(err);
  }
};

// Mark a notification as read
export const markAsRead = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.userId;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true },
      { new: true, lean: true }
    ).exec();

    if (!notification)
      return res.status(404).json({ message: 'Notification not found' });

    res.json({ message: 'Notification marked as read', notification });
  } catch (err) {
    next(err);
  }
};

// Create a notification (Admin only)
export const createNotification = async (req, res, next) => {
  try {
    const { userId, message } = req.body;

    const notification = new Notification({
      userId,
      message,
    });

    await notification.save();

    res
      .status(201)
      .json({ message: 'Notification created successfully', notification });
  } catch (err) {
    next(err);
  }
};

export async function sendAvailabilityNotification(user, isAvailable, reason, actionType, session) {
  let actionDescription = '';

  switch (actionType) {
    case 'Assignment':
      actionDescription = `You have been ${isAvailable ? 'assigned to' : 'unassigned from'} a ${
        user.kitchenId ? 'kitchen' : user.shopId ? 'shop' : 'role'
      }.`;
      break;
    case 'ManualUpdate':
      actionDescription = `Your availability has been ${isAvailable ? 'updated to Available' : 'updated to Unavailable'}.`;
      break;
    default:
      actionDescription = `Your availability status has been updated.`;
  }

  const notificationMessage = `${actionDescription} Reason: ${reason || 'No specific reason provided.'}`;

  const notification = new Notification({
    userId: user._id,
    message: notificationMessage,
  });

  await notification.save({ session });
}