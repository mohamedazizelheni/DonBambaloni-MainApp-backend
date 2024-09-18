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
export const assignUserToKitchenShift = async (req, res, next) => {
  try {
    const { kitchenId } = req.params;
    const { userId, shiftType } = req.body;

    // Validate shift type
    if (!Object.values(ShiftType).includes(shiftType)) {
      return res.status(400).json({ message: 'Invalid shift type' });
    }

    const [user, kitchen] = await Promise.all([
      User.findById(userId).exec(),
      Kitchen.findById(kitchenId).exec(),
    ]);

    if (!user || !kitchen) {
      return res.status(404).json({ message: 'User or Kitchen not found' });
    }

    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Assign user to kitchen
      user.kitchenId = kitchen._id;
      await user.save({ session });

      // Update kitchen teams
      const currentTeam = kitchen.teams.get(shiftType) || [];
      if (!currentTeam.includes(user._id)) {
        currentTeam.push(user._id);
        kitchen.teams.set(shiftType, currentTeam);
        await kitchen.save({ session });
      }

      await session.commitTransaction();
      session.endSession();

      res.json({ message: 'User assigned to kitchen shift successfully' });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  } catch (error) {
    next(error);
  }
};
