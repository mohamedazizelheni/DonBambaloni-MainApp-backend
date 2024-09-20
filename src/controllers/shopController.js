// controllers/shopController.js

import Shop from '../models/Shop.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import { ShiftType, AvailabilityStatus, ActionType } from '../utils/enums.js';
import { validationResult } from 'express-validator';
import { sendAvailabilityNotification } from './notificationController.js';

// Create a new shop (Admin only)
export const createShop = async (req, res, next) => {
    const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { name, address, operatingShifts, image } = req.body;

    const shop = new Shop({
      name,
      address,
      operatingShifts,
      image,
    });

    await shop.save();

    res.status(201).json({ message: 'Shop created successfully', shop });
  } catch (err) {
    next(err);
  }
};

// Get all shops with pagination and lean queries
export const getAllShops = async (req, res, next) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const shops = await Shop.find()
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const totalShops = await Shop.countDocuments();

    res.json({
      shops,
      totalShops,
      totalPages: Math.ceil(totalShops / limit),
      currentPage: page,
    });
  } catch (err) {
    next(err);
  }
};

// Get a specific shop
export const getShopById = async (req, res, next) => {
  try {
    const { shopId } = req.params;

    const shop = await Shop.findById(shopId)
      .lean()
      .exec();

    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    res.json({ shop });
  } catch (err) {
    next(err);
  }
};

// Update a shop (Admin only)
export const updateShop = async (req, res, next) => {
  try {
    const { shopId } = req.params;
    const updates = req.body;

    const shop = await Shop.findByIdAndUpdate(shopId, updates, {
      new: true,
      lean: true,
    });

    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    res.json({ message: 'Shop updated successfully', shop });
  } catch (err) {
    next(err);
  }
};

// Delete a shop (Admin only)
export const deleteShop = async (req, res, next) => {
  try {
    const { shopId } = req.params;

    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Remove shop reference from users
      await User.updateMany(
        { shopId },
        { $unset: { shopId: '' } },
        { session }
      );

      const shop = await Shop.findByIdAndDelete(shopId, { session });

      if (!shop) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Shop not found' });
      }

      await session.commitTransaction();
      session.endSession();

      res.json({ message: 'Shop deleted successfully' });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  } catch (err) {
    next(err);
  }
};

// Assign a users to a shop shift (Admin only)

export const assignUsersToShopShift = async (req, res, next) => {
  try {
    const { shopId } = req.params;
    const { userIds, shiftType } = req.body;

    // Validate request data
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Validate shift type
    if (!Object.values(ShiftType).includes(shiftType)) {
      return res.status(400).json({ message: 'Invalid shift type' });
    }

    // Ensure userIds is an array
    if (!Array.isArray(userIds)) {
      return res.status(400).json({ message: 'userIds must be an array' });
    }

    const shop = await Shop.findById(shopId).exec();
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
 // Fetch all users to be assigned and check their availability
 const users = await User.find({ _id: { $in: userIds } })
 .session(session)
 .exec();

// Identify users not found
const foundUserIds = users.map((user) => user._id.toString());
const notFoundUserIds = userIds.filter((id) => !foundUserIds.includes(id));

if (notFoundUserIds.length > 0) {
 await session.abortTransaction();
 session.endSession();
 return res.status(404).json({
   message: `Users not found: ${notFoundUserIds.join(', ')}`,
 });
}

// Identify unavailable users
const unavailableUsers = users.filter(
 (user) => !user.computedIsAvailable
);

if (unavailableUsers.length > 0) {
 // Option 1: Prevent assignment and inform admin
 await session.abortTransaction();
 session.endSession();
 return res.status(400).json({
   message: 'Some users are unavailable and cannot be assigned.',
   unavailableUsers: unavailableUsers.map((user) => ({
     userId: user._id,
     username: user.username,
     email: user.email,
   })),
 });
}
      // Get current users assigned to this shift
      const currentUserIds = shop.teams.get(shiftType) || [];

      // Users to remove (currently assigned but not in new userIds)
      const usersToUnset = currentUserIds.filter(
        (id) => !userIds.includes(id.toString())
      );

      // Users to add (newly assigned)
      const usersToSet = userIds.filter(
        (id) => !currentUserIds.map((id) => id.toString()).includes(id)
      );

      // Remove shopId and update availability for users being unassigned
      if (usersToUnset.length > 0) {
        const usersUnassigned = await User.find({ _id: { $in: usersToUnset } }).session(session).exec();

        for (const user of usersUnassigned) {
          user.shopId = undefined;
          user.availabilityHistory.push({
            date: new Date(),
            status: user.computedIsAvailable ? AvailabilityStatus.AVAILABLE : AvailabilityStatus.UNAVAILABLE,
            reason: 'Unassigned from shop shift',
          });
          user.history.push({
            action: ActionType.UNASSIGNED_FROM_SHOP,
            details: { shopId: shop._id },
          });
          await user.save({ session });

          // Send notification
          await sendAvailabilityNotification(user,false, 'Unassigned from shop shift', 'Assignment', session);
        }
      }

      // Assign shopId and update availability for users being assigned
      if (usersToSet.length > 0) {
        const usersAssigned = await User.find({ _id: { $in: usersToSet } }).session(session).exec();

        for (const user of usersAssigned) {
          user.shopId = shop._id;
          user.availabilityHistory.push({
            date: new Date(),
            status: AvailabilityStatus.UNAVAILABLE,
            reason: 'Assigned to shop shift',
          });
          user.history.push({
            action: ActionType.ASSIGNED_TO_SHOP,
            details: { shopId: shop._id },
          });
          await user.save({ session });

          // Send notification
          await sendAvailabilityNotification(user, true, 'Assigned to shop shift', 'Assignment', session);
        }
      }

      // Update shop teams for the shift
      const updatedTeam = userIds.map((id) =>new mongoose.Types.ObjectId(id));
      shop.teams.set(shiftType, updatedTeam);

      await shop.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json({ message: 'Users assigned to shop shift successfully' });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  } catch (error) {
    next(error);
  }
};

