import User from '../models/User.js';
import AvailabilityHistory from '../models/AvailabilityHistory.js';
import SalaryRecord from '../models/SalaryRecord.js';
import UserHistory from '../models/UserHistory.js';
import mongoose from 'mongoose';
import { AvailabilityStatus, ActionType } from '../utils/enums.js';
import { validationResult } from 'express-validator';
import { sendAvailabilityNotification } from './notificationController.js';
import multer from 'multer';
import path from 'path';
import Shop from '../models/Shop.js';
import Kitchen from '../models/Kitchen.js';

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // the upload directory
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// Initialize upload middleware
const upload = multer({ storage });

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
export const updateUserProfile = [
  upload.single('image'), // Multer middleware to handle single file upload
  async (req, res, next) => {
    try 
    {
      const updates = req.body;

      // Handle password update
      if (updates.password) {
        const salt = await genSalt(10);
        updates.password = await hash(updates.password, salt);
      } else {
        delete updates.password;
      }

      // Handle image update
      if (req.file) {
        updates.image = req.file.path; // Store the file path in the database
      }

      const user = await User.findByIdAndUpdate(req.user.userId, updates, {
        new: true,
        select: '-password -__v',
        lean: true,
      });

      if (!user) return res.status(404).json({ message: 'User not found' });

      res.json({ message: 'Profile updated successfully' });
    } catch (err) {
      next(err);
    }
  },
];

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
      const availabilityRecord = new AvailabilityHistory({
        user: user._id,
        date: new Date(),
        status: user.computedIsAvailable ? AvailabilityStatus.AVAILABLE : AvailabilityStatus.UNAVAILABLE,
        reason: reason || 'Status updated by admin',
      });
      await availabilityRecord.save({ session });

      // Add entry to user history
      const userHistoryRecord = new UserHistory({
        user: user._id,
        action: ActionType.AVAILABILITY_UPDATED,
        details: {
          status: user.computedIsAvailable ? 'Available' : 'Unavailable',
          reason: reason || 'Status updated by admin',
        },
      });
      await userHistoryRecord.save({ session });

      user.availabilityHistory.push(availabilityRecord._id);
      user.history.push(userHistoryRecord._id);
      
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

// Fetch assigned and available users for a shop or kitchen
export const getAssignedAndAvailableUsers = async (req, res, next) => {
  try {
    const { entityId, entityType } = req.params;
    const isShop = entityType === 'shops';
    const isKitchen = entityType === 'kitchens';

    if (!isShop && !isKitchen) {
      return res.status(400).json({ message: 'Invalid entity type' });
    }

    // Fetch the entity with teams populated
    const entity = isShop
      ? await Shop.findById(entityId).lean()
      : await Kitchen.findById(entityId).lean();

    if (!entity) {
      return res.status(404).json({ message: `${entityType} not found` });
    }

    // Extract assigned user IDs by shift
    const assignedUsersByShift = {};
    const assignedUserIds = [];

    // Since teams is a Map, we need to handle it appropriately
    const teams = entity.teams || {};
    for (const shift of Object.keys(teams)) {
      const userIds = teams[shift] || [];
      assignedUsersByShift[shift] = userIds;
      assignedUserIds.push(...userIds);
    }

    // Fetch assigned users' details
    const assignedUsers = await User.find({ _id: { $in: assignedUserIds } })
    .select('_id username role')
      .lean();

    // Map user IDs to user details for quick lookup
    const userMap = {};
    assignedUsers.forEach((user) => {
      userMap[user._id.toString()] = user;
    });

    // Replace user IDs with user details in assignedUsersByShift
    for (const shift of Object.keys(assignedUsersByShift)) {
      assignedUsersByShift[shift] = assignedUsersByShift[shift].map((userId) => userMap[userId.toString()]);
    }

    // Fetch available users (excluding assigned users)
    const availableUsers = await User.find({
      role: { $nin: ['Admin', 'Driver'] }, // Exclude Admins and Drivers
      isAvailable: true,
      _id: { $nin: assignedUserIds },
    })
    .select('_id username role')
      .lean();

    // Return both assigned users by shift and available users
    res.status(200).json({
      assignedUsers: assignedUsersByShift,
      availableUsers,
    });
  } catch (error) {
    next(error);
  }
};
