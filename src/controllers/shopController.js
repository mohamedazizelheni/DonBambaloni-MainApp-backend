// controllers/shopController.js

import Shop from '../models/Shop.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import { ShiftType } from '../utils/enums.js';
import { validationResult } from 'express-validator';

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

// Assign a user to a shop shift (Admin only)
export const assignUserToShopShift = async (req, res, next) => {
  try {
    const { shopId } = req.params;
    const { userId, shiftType } = req.body;

    // Validate shift type
    if (!Object.values(ShiftType).includes(shiftType)) {
      return res.status(400).json({ message: 'Invalid shift type' });
    }

    const [user, shop] = await Promise.all([
      User.findById(userId).exec(),
      Shop.findById(shopId).exec(),
    ]);

    if (!user || !shop) {
      return res.status(404).json({ message: 'User or Shop not found' });
    }

    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Assign user to shop
      user.shopId = shop._id;
      await user.save({ session });

      // Update shop teams
      const currentTeam = shop.teams.get(shiftType) || [];
      if (!currentTeam.includes(user._id)) {
        currentTeam.push(user._id);
        shop.teams.set(shiftType, currentTeam);
        await shop.save({ session });
      }

      await session.commitTransaction();
      session.endSession();

      res.json({ message: 'User assigned to shop shift successfully' });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  } catch (error) {
    next(error);
  }
};
