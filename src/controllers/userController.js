import User from '../models/User.js';
import mongoose from 'mongoose';
import { AvailabilityStatus, ActionType } from '../utils/enums.js';
import { validationResult } from 'express-validator';
import { sendAvailabilityNotification } from './notificationController.js';

// Get all users (Admin only) with pagination and lean queries
export const getAllUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const search = req.query.search || '';
    const role = req.query.role || '';
    const availability = req.query.availability || '';
    const minSalary = parseFloat(req.query.minSalary) || 0;
    const maxSalary = parseFloat(req.query.maxSalary) || Number.MAX_SAFE_INTEGER;

    // Build query with search term, role, availability, and salary range
    const query = {
      ...(search && {
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      }),
      ...(role && { role }),
      ...(availability && { isAvailable: availability === 'Available' }),
      salary: { $gte: minSalary, $lte: maxSalary },
    };

    const users = await User.find(query)
      .select('-password -__v')
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const totalUsers = await User.countDocuments(query);

    res.json({
      users,
      totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: page,
    });
  } catch (err) {
    next(err);
  }
};

// Get user profile
export const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-password -__v')
      .lean()
      .exec();

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ user });
  } catch (err) {
    next(err);
  }
};

// Update user profile
export const updateUserProfile = async (req, res, next) => {
  try {
    const updates = req.body;
    delete updates.password; // Prevent password updates here

    const user = await User.findByIdAndUpdate(req.user.userId, updates, {
      new: true,
      select: '-password -__v',
      lean: true,
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'Profile updated successfully', user });
  } catch (err) {
    next(err);
  }
};

// Delete user (Admin only)
export const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Remove user from any kitchens or shops
      await Promise.all([
        User.updateOne(
          { _id: userId },
          { $unset: { kitchenId: '', shopId: '' } },
          { session }
        ),
        // Additional cleanup if necessary
      ]);

      const user = await User.findByIdAndDelete(userId, { session }).exec();

      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'User not found' });
      }

      await session.commitTransaction();
      session.endSession();

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  } catch (err) {
    next(err);
  }
};

// Update user availability (Admin only)
export const updateUserAvailability = async (req, res, next) => {
  try {
    // Validate request data
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    const { isAvailable, reason } = req.body;

    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find the user
      const user = await User.findById(userId).session(session);
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'User not found' });
      }

      // Update availability status
      user.manualAvailability = isAvailable ? null : AvailabilityStatus.UNAVAILABLE;

      // Add entry to availabilityHistory
      user.availabilityHistory.push({
        date: new Date(),
        status: user.computedIsAvailable ? AvailabilityStatus.AVAILABLE : AvailabilityStatus.UNAVAILABLE,
        reason: reason || 'Status updated by admin',
      });

      // Add entry to history
      user.history.push({
        action: ActionType.AVAILABILITY_UPDATED,
        details: {
          status: user.computedIsAvailable ? 'Available' : 'Unavailable',
          reason: reason || 'Status updated by admin',
        },
      });

      await user.save({ session });

      // Handle rescheduling or reassignment if applicable
      if (!user.computedIsAvailable) {
        // User is now unavailable
        // Remove user from any assigned shifts in kitchens or shops
        await handleUserUnavailability(user, session);
      }

      // Send notifications to affected parties
      await sendAvailabilityNotification(user, user.computedIsAvailable, reason, 'ManualUpdate', session);

      await session.commitTransaction();
      session.endSession();

      res.json({ message: 'User availability updated successfully' });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  } catch (error) {
    next(error);
  }
};

// Helper function to handle user unavailability
async function handleUserUnavailability(user, session) {
  // Remove user from kitchen teams
  if (user.kitchenId) {
    const Kitchen = (await import('../models/Kitchen.js')).default;
    const kitchen = await Kitchen.findById(user.kitchenId).session(session);
    if (kitchen) {
      for (const [shiftType, team] of kitchen.teams) {
        const index = team.indexOf(user._id);
        if (index !== -1) {
          team.splice(index, 1);
          kitchen.teams.set(shiftType, team);
        }
      }
      await kitchen.save({ session });
    }
    user.kitchenId = undefined;
  }

  // Remove user from shop teams
  if (user.shopId) {
    const Shop = (await import('../models/Shop.js')).default;
    const shop = await Shop.findById(user.shopId).session(session);
    if (shop) {
      for (const [shiftType, team] of shop.teams) {
        const index = team.indexOf(user._id);
        if (index !== -1) {
          team.splice(index, 1);
          shop.teams.set(shiftType, team);
        }
      }
      await shop.save({ session });
    }
    user.shopId = undefined;
  }

  // Update user document
  await user.save({ session });
}
