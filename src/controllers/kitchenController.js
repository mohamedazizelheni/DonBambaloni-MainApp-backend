import Kitchen from '../models/Kitchen.js';
import User from '../models/User.js';
import AvailabilityHistory from '../models/AvailabilityHistory.js';
import UserHistory from '../models/UserHistory.js';
import mongoose from 'mongoose';
import { ShiftType, AvailabilityStatus, ActionType } from '../utils/enums.js';
import { validationResult } from 'express-validator';
import { sendAvailabilityNotification } from './notificationController.js';
import multer from 'multer';
import path from 'path';

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // the upload directory
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname)); // Add file extension
  },
});

// Initialize upload middleware
const upload = multer({ storage });

// Create a new kitchen (Admin only)
export const createKitchen = [
  upload.single('image'), // Multer middleware to handle single file upload
  async (req, res, next) => {
    
    // Validate the request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, address, operatingShifts } = req.body;

      // Ensure operatingShifts is an array, as FormData can sometimes send it as a string
      const shiftsArray = Array.isArray(operatingShifts)
        ? operatingShifts
        : [operatingShifts];

      // Create the new kitchen object, including image if provided
      const kitchen = new Kitchen({
        name,
        address,
        operatingShifts: shiftsArray,
        image: req.file ? req.file.path : undefined, // Only include image if it exists
      });

      // Save the kitchen to the database
      await kitchen.save();

      // Send response
      res.status(201).json({ message: 'Kitchen created successfully', kitchen });
    } catch (err) {
      next(err); // Pass the error to the next middleware
    }
  },
];


// Get all kitchens with pagination and lean queries
export const getAllKitchens = async (req, res, next) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const kitchens = await Kitchen.find({ isDeleted: false })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const totalKitchens = await Kitchen.countDocuments({ isDeleted: false });

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
    .populate({
      path: 'teams.Morning teams.Afternoon teams.Night',
      model: 'User', 
      select: 'username role', 
    })
      .lean()
      .exec();

    if (!kitchen) return res.status(404).json({ message: 'Kitchen not found' });

    res.json({ kitchen });
  } catch (err) {
    next(err);
  }
};

// Update a kitchen (Admin only)
export const updateKitchen = [
  upload.single('image'), // Handle image upload
  async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { kitchenId } = req.params;
      const updates = req.body;

      // Parse the operatingShifts in case it's sent as a single string
      if (updates.operatingShifts && !Array.isArray(updates.operatingShifts)) {
        updates.operatingShifts = [updates.operatingShifts];
      }

      // Find the current kitchen data before updating
      const currentKitchen = await Kitchen.findById(kitchenId).session(session);

      if (!currentKitchen) {
        await session.abortTransaction();
        return res.status(404).json({ message: 'Kitchen not found' });
      }

      // Detect removed shifts by comparing current operatingShifts with the updated ones
      const currentShifts = currentKitchen.operatingShifts || [];
      const updatedShifts = updates.operatingShifts || [];
      const removedShifts = currentShifts.filter(shift => !updatedShifts.includes(shift));

      // Handle image update if an image is uploaded
      if (req.file) {
        updates.image = req.file.path; // Store the file path in the updates
      }

      // Unassign users from removed shifts and update KITCHEN.teams
      if (removedShifts.length > 0) {
        for (const shift of removedShifts) {
          const teamForShift = currentKitchen.teams.get(shift) || [];
          if (teamForShift.length > 0) {
            // Unassign users from the removed shifts
            await Promise.all(teamForShift.map(userId => unassignUserFromKitchen(userId, kitchenId, shift, session)));
          }

          // Remove the shift from kitchen.teams
          currentKitchen.teams.delete(shift);
        }
      }

      // Update the kitchen's operating shifts and other details
      currentKitchen.name = updates.name || currentKitchen.name;
      currentKitchen.address = updates.address || currentKitchen.address;
      currentKitchen.operatingShifts = updatedShifts;
      if (updates.image) {
        currentKitchen.image = updates.image;
      }

      await currentKitchen.save({ session }); // Save the kitchen with updated teams and shifts

      await session.commitTransaction();
      session.endSession();

      res.json({ message: 'kitchen updated successfully, and users unassigned from removed shifts if applicable.', kitchen: currentKitchen });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      next(err);
    }
  },
];

//for delete 
const unassignUsersFromKitchenBatch = async (usersAssigned, kitchen, session) => {
  const userUpdates = usersAssigned.map(async (user) => {
    user.kitchenId = undefined;
    // Recalculate isAvailable based on the computedIsAvailable logic
    const updatedIsAvailable = user.computedIsAvailable;

    // Create availability history entry
    const availabilityHistory = new AvailabilityHistory({
      user: user._id,
      date: new Date(),
      status: updatedIsAvailable ? AvailabilityStatus.AVAILABLE : AvailabilityStatus.UNAVAILABLE,
      reason: 'Unassigned due to kitchen deletion',
    });
    await availabilityHistory.save({ session });

    // Create user history entry
    const userHistory = new UserHistory({
      user: user._id,
      action: ActionType.UNASSIGNED_FROM_KITCHEN,
      details: { kitchenId: kitchen._id, reason: 'Kitchen deleted' },
    });
    await userHistory.save({ session });

    return {
      updateOne: {
        filter: { _id: user._id },
        update: {
          $unset: { kitchenId: '' },
          $set: {
            isAvailable: updatedIsAvailable,  // Update isAvailable based on recalculated value
          },
          $push: {
            availabilityHistory: availabilityHistory._id,  // Add ObjectId
            history: userHistory._id,  // Add ObjectId
          },
        },
      },
    };
  });

  // Perform bulk update of users
  if (userUpdates.length > 0) {
    await User.bulkWrite(await Promise.all(userUpdates), { session });
  }

  // Send notifications to users about being unassigned
  for (const user of usersAssigned) {
    await sendAvailabilityNotification(
      user,
      true, // Now marked as available
      'Unassigned due to KITCHEN deletion',
      'Assignment',
      session
    );
  }
};

// Delete a kitchen (Admin only)
export const deleteKitchen = async (req, res, next) => {
  const { kitchenId } = req.params;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const kitchen = await Kitchen.findById(kitchenId).session(session);

    if (!kitchen) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Kitchen not found' });
    }

    // Find users assigned to this kitchen
    const usersAssigned = await User.find({ kitchenId }).session(session).exec();

    // Unassign users and update availability
    await unassignUsersFromKitchenBatch(usersAssigned, kitchen, session);

    // Remove the users from the teams in the kitchen's teams field
    kitchen.teams.forEach((team, shiftType) => {
      kitchen.teams.set(shiftType, team.filter((userId) => !usersAssigned.some((u) => u._id.equals(userId))));
    });

    // Soft delete the kitchen
    kitchen.isDeleted = true;
    await kitchen.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Kitchen soft deleted successfully and users unassigned from kitchen and teams' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};


// Restore a soft-deleted kitchen
export const restoreKitchen = async (req, res, next) => {
  try {
    const { kitchenId } = req.params;

    const kitchen = await Kitchen.findByIdAndUpdate(
      kitchenId,
      { isDeleted: false },
      { new: true }
    );

    if (!kitchen) return res.status(404).json({ message: 'Kitchen not found' });

    res.json({ message: 'Kitchen restored successfully', kitchen });
  } catch (err) {
    next(err);
  }
};


// Assign users to a kitchen shift (Admin only)
export const assignUsersToKitchenShift = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { kitchenId } = req.params;
    const { userIds, shiftType } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ errors: errors.array() });
    }

    if (!Object.values(ShiftType).includes(shiftType)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid shift type' });
    }

    const kitchen = await Kitchen.findById(kitchenId).session(session);
    if (!kitchen || kitchen.isDeleted) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Kitchen not found or has been deleted' });
    }

    // Fetch all users and split into assign/unassign
    const currentUserIds = kitchen.teams.get(shiftType)?.map((id) => id.toString()) || [];

    const usersToUnset = currentUserIds.filter((id) => !userIds.includes(id));
    const usersToSet = userIds.filter((id) => !currentUserIds.includes(id));

    // Unassign and assign users in parallel
    const [unassignResults, assignResults] = await Promise.all([
      Promise.all(usersToUnset.map((userId) => unassignUserFromKitchen(userId, kitchenId,shiftType, session))),
      Promise.all(usersToSet.map((userId) => assignUserToKitchen(userId, kitchenId, session))),
    ]);

    kitchen.teams.set(shiftType, userIds.map((id) => new mongoose.Types.ObjectId(id)));
    await kitchen.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Notify users asynchronously
    unassignResults.forEach((user) => sendAvailabilityNotification(user, true, 'Unassigned from kitchen shift', 'Unassignment'));
    assignResults.forEach((user) => sendAvailabilityNotification(user, true, 'Assigned to kitchen shift', 'Assignment'));

    res.json({ message: 'Users assigned to kitchen shift successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};


// Helper function to unassign a user from the kitchen
const unassignUserFromKitchen = async (userId, kitchenId, shiftType, session) => {
  // Update user document
  const user = await User.findById(userId).session(session);
  
  // Check if the user is still assigned to any other shifts in the kitchen
  const kitchen = await Kitchen.findById(kitchenId).session(session);
  const isUserAssignedToOtherShifts = Array.from(kitchen.teams.keys()).some((shift) => {
    return shift !== shiftType && kitchen.teams.get(shift)?.includes(userId);
  });

  // Only unassign the user completely if they are not assigned to any other shifts in the kitchen
  if (!isUserAssignedToOtherShifts) {
    user.kitchenId = undefined; // Remove the kitchen assignment only if they are not assigned to other shifts
  }

  const updatedIsAvailable = user.computedIsAvailable;

  // Create availability history and user history
  const [availabilityHistory, userHistory] = await Promise.all([
    new AvailabilityHistory({
      user: user._id,
      date: new Date(),
      status: updatedIsAvailable ? AvailabilityStatus.AVAILABLE : AvailabilityStatus.UNAVAILABLE,
      reason: `Unassigned from ${shiftType} shift`,
    }).save({ session }),
    new UserHistory({
      user: user._id,
      action: ActionType.UNASSIGNED_FROM_KITCHEN,
      details: { kitchenId: kitchenId, shiftType, reason: `Unassigned from ${shiftType} shift` },
    }).save({ session }),
  ]);

  // Save the user changes
  await user.save({ session });

  return user;
};

// Helper function to assign a user to the kitchen
const assignUserToKitchen = async (userId, kitchenId, session) => {
  // Update user document
  const user = await User.findById(userId).session(session);
  user.kitchenId = kitchenId;
  const updatedIsAvailable = user.computedIsAvailable;

  // Create availability history and user history
  const [availabilityHistory, userHistory] = await Promise.all([
    new AvailabilityHistory({
      user: user._id,
      date: new Date(),
      status: updatedIsAvailable ? AvailabilityStatus.AVAILABLE : AvailabilityStatus.UNAVAILABLE,
      reason: 'Assigned to kitchen shift',
    }).save({ session }),
    new UserHistory({
      user: user._id,
      action: ActionType.ASSIGNED_TO_KITCHEN,
      details: { kitchenId: kitchenId, reason: 'Assigned to kitchen shift' },
    }).save({ session }),
  ]);

  // Save user
  await user.save({ session });

  return user;
};



