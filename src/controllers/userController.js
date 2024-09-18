import User from '../models/User.js';
import mongoose from 'mongoose';

// Get all users (Admin only) with pagination and lean queries
export const getAllUsers = async (req, res, next) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Query users with projection and lean
    const users = await User.find()
      .select('-password -__v')
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    // Get total count for pagination
    const totalUsers = await User.countDocuments();

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
