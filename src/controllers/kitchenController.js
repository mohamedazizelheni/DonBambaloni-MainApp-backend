import Kitchen from '../models/Kitchen.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import { ShiftType } from '../utils/enums.js';
import { validationResult } from 'express-validator';

// Create a new kitchen (Admin only)
export const createKitchen = async (req, res, next) => {
    const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { name, address, operatingShifts, image } = req.body;

    const kitchen = new Kitchen({
      name,
      address,
      operatingShifts,
      image,
    });

    await kitchen.save();

    res.status(201).json({ message: 'Kitchen created successfully', kitchen });
  } catch (err) {
    next(err);
  }
};

// Get all kitchens with pagination and lean queries
export const getAllKitchens = async (req, res, next) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const kitchens = await Kitchen.find()
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const totalKitchens = await Kitchen.countDocuments();

    res.json({
      kitchens,
      totalKitchens,
      totalPages: Math.ceil(totalKitchens / limit),
      currentPage: page,
    });
  } catch (err) {
    next(err);
  }
};

// Get a specific kitchen
export const getKitchenById = async (req, res, next) => {
  try {
    const { kitchenId } = req.params;

    const kitchen = await Kitchen.findById(kitchenId)
      .lean()
      .exec();

    if (!kitchen) return res.status(404).json({ message: 'Kitchen not found' });

    res.json({ kitchen });
  } catch (err) {
    next(err);
  }
};

// Update a kitchen (Admin only)
export const updateKitchen = async (req, res, next) => {
  try {
    const { kitchenId } = req.params;
    const updates = req.body;

    const kitchen = await Kitchen.findByIdAndUpdate(kitchenId, updates, {
      new: true,
      lean: true,
    });

    if (!kitchen) return res.status(404).json({ message: 'Kitchen not found' });

    res.json({ message: 'Kitchen updated successfully', kitchen });
  } catch (err) {
    next(err);
  }
};

// Delete a kitchen (Admin only)
export const deleteKitchen = async (req, res, next) => {
  try {
    const { kitchenId } = req.params;

    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Remove kitchen reference from users
      await User.updateMany(
        { kitchenId },
        { $unset: { kitchenId: '' } },
        { session }
      );

      const kitchen = await Kitchen.findByIdAndDelete(kitchenId, { session });

      if (!kitchen) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Kitchen not found' });
      }

      await session.commitTransaction();
      session.endSession();

      res.json({ message: 'Kitchen deleted successfully' });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  } catch (err) {
    next(err);
  }
};

// Assign a user to a kitchen shift (Admin only)
export const assignUsersToKitchenShift = async (req, res, next) => {
  try {
    const { kitchenId } = req.params;
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

    const kitchen = await Kitchen.findById(kitchenId).exec();
    if (!kitchen) {
      return res.status(404).json({ message: 'Kitchen not found' });
    }

    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get current users assigned to this shift
      const currentUserIds = kitchen.teams.get(shiftType) || [];

      // Users to remove (currently assigned but not in new userIds)
      const usersToUnset = currentUserIds.filter(
        (id) => !userIds.includes(id.toString())
      );

      // Users to add (newly assigned)
      const usersToSet = userIds.filter(
        (id) => !currentUserIds.map((id) => id.toString()).includes(id)
      );

      // Remove kitchenId from users being unassigned
      if (usersToUnset.length > 0) {
        await User.updateMany(
          { _id: { $in: usersToUnset } },
          { $unset: { kitchenId: '' } },
          { session }
        );
      }

      // Set kitchenId for users being assigned
      if (usersToSet.length > 0) {
        await User.updateMany(
          { _id: { $in: usersToSet } },
          { kitchenId: kitchen._id },
          { session }
        );
      }

      // Update kitchen teams for the shift
      const updatedTeam = userIds.map((id) =>new mongoose.Types.ObjectId(id));
      kitchen.teams.set(shiftType, updatedTeam);

      await kitchen.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json({ message: 'Users assigned to kitchen shift successfully' });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  } catch (error) {
    next(error);
  }
};
