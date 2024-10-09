import Shop from '../models/Shop.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import { ShiftType, AvailabilityStatus, ActionType } from '../utils/enums.js';
import { validationResult } from 'express-validator';
import { sendAvailabilityNotification } from './notificationController.js';
import UserHistory from '../models/UserHistory.js';
import AvailabilityHistory from '../models/AvailabilityHistory.js';
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

// Create a new shop (Admin only)
export const createShop = [  
  upload.single('image'), // Multer middleware to handle single file upload
  async (req, res, next) => {
   
  try {
    const { name, address, operatingShifts, image } = req.body;
// Ensure operatingShifts is an array, as FormData can sometimes send it as a string
const shiftsArray = Array.isArray(operatingShifts)
? operatingShifts
: [operatingShifts];
    const shop = new Shop({
      name,
      address,
      operatingShifts: shiftsArray,
      image: req.file ? req.file.path : undefined, // Only include image if it exists
    });

    await shop.save();

    res.status(201).json({ message: 'Shop created successfully', shop });
  } catch (err) {
    next(err);
  }
},];

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
    .populate({
      path: 'teams.Morning teams.Afternoon teams.Night', // Populate the team arrays for each shift
      model: 'User', // Reference the User model
      select: 'username role', // Select only necessary fields from User
    })
      .lean()
      .exec();

    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    res.json({ shop });
  } catch (err) {
    next(err);
  }
};


// Update a shop (Admin only)
export const updateShop = [
  upload.single('image'), // Handle image upload
  async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { shopId } = req.params;
      const updates = req.body;

      // Parse the operatingShifts in case it's sent as a single string
      if (updates.operatingShifts && !Array.isArray(updates.operatingShifts)) {
        updates.operatingShifts = [updates.operatingShifts];
      }

      // Find the current shop data before updating
      const currentShop = await Shop.findById(shopId).session(session);

      if (!currentShop) {
        await session.abortTransaction();
        return res.status(404).json({ message: 'Shop not found' });
      }

      // Detect removed shifts by comparing current operatingShifts with the updated ones
      const currentShifts = currentShop.operatingShifts || [];
      const updatedShifts = updates.operatingShifts || [];
      const removedShifts = currentShifts.filter(shift => !updatedShifts.includes(shift));

      // Handle image update if an image is uploaded
      if (req.file) {
        updates.image = req.file.path; // Store the file path in the updates
      }

      // Unassign users from removed shifts and update shop.teams
      if (removedShifts.length > 0) {
        for (const shift of removedShifts) {
          const teamForShift = currentShop.teams.get(shift) || [];
          if (teamForShift.length > 0) {
            // Unassign users from the removed shifts
            await Promise.all(teamForShift.map(userId => unassignUserFromShop(userId, shopId, shift, session)));
          }

          // Remove the shift from shop.teams
          currentShop.teams.delete(shift);
        }
      }

      // Update the shop's operating shifts and other details
      currentShop.name = updates.name || currentShop.name;
      currentShop.address = updates.address || currentShop.address;
      currentShop.operatingShifts = updatedShifts;
      if (updates.image) {
        currentShop.image = updates.image;
      }

      await currentShop.save({ session }); // Save the shop with updated teams and shifts

      await session.commitTransaction();
      session.endSession();

      res.json({ message: 'Shop updated successfully, and users unassigned from removed shifts if applicable.', shop: currentShop });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      next(err);
    }
  },
];



const unassignUsersFromShopBatch = async (usersAssigned, shop, session) => {
  const userUpdates = usersAssigned.map(async (user) => {
    user.shopId = undefined;
    // Recalculate isAvailable based on the computedIsAvailable logic
    const updatedIsAvailable = user.computedIsAvailable;

    // Create availability history entry
    const availabilityHistory = new AvailabilityHistory({
      user: user._id,
      date: new Date(),
      status: updatedIsAvailable ? AvailabilityStatus.AVAILABLE : AvailabilityStatus.UNAVAILABLE,
      reason: 'Unassigned due to shop deletion',
    });
    await availabilityHistory.save({ session });

    // Create user history entry
    const userHistory = new UserHistory({
      user: user._id,
      action: ActionType.UNASSIGNED_FROM_SHOP,
      details: { shopId: shop._id, reason: 'Shop deleted' },
    });
    await userHistory.save({ session });

    return {
      updateOne: {
        filter: { _id: user._id },
        update: {
          $unset: { shopId: '' }, // Unassign shop
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
      'Unassigned due to shop deletion',
      'Assignment',
      session
    );
  }
};


// Delete a shop (Admin only)
export const deleteShop = async (req, res, next) => {
  const { shopId } = req.params;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const shop = await Shop.findById(shopId).session(session);

    if (!shop) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Find users assigned to this shop
    const usersAssigned = await User.find({ shopId }).session(session).exec();

    // Unassign users from the shop and update their availability and history
    await unassignUsersFromShopBatch(usersAssigned, shop, session);

    // Remove the users from the teams in the shop's teams field
    shop.teams.forEach((team, shiftType) => {
      shop.teams.set(shiftType, team.filter((userId) => !usersAssigned.some((u) => u._id.equals(userId))));
    });

    // Soft delete the shop
    shop.isDeleted = true;
    await shop.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Shop soft deleted successfully and users unassigned from shop and teams' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};
// Restore a soft-deleted Shop
export const restoreShop = async (req, res, next) => {
  try {
    const { shopId } = req.params;

    const shop = await Shop.findByIdAndUpdate(
      shopId,
      { isDeleted: false },
      { new: true }
    );

    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    res.json({ message: 'Shop restored successfully', shop });
  } catch (err) {
    next(err);
  }
};

// Assign users to a shop shift (Admin only)
export const assignUsersToShopShift = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { shopId } = req.params;
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

    const shop = await Shop.findById(shopId).session(session);
    if (!shop || shop.isDeleted) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Shop not found or has been deleted' });
    }

    // Fetch all users and split into assign/unassign
    const currentUserIds = shop.teams.get(shiftType)?.map((id) => id.toString()) || [];

    const usersToUnset = currentUserIds.filter((id) => !userIds.includes(id));
    const usersToSet = userIds.filter((id) => !currentUserIds.includes(id));

    // Unassign and assign users in parallel
    const [unassignResults, assignResults] = await Promise.all([
      Promise.all(usersToUnset.map((userId) => unassignUserFromShop(userId, shopId, shiftType, session))),
      Promise.all(usersToSet.map((userId) => assignUserToShop(userId, shopId, session))),
    ]);

    shop.teams.set(shiftType, userIds.map((id) => new mongoose.Types.ObjectId(id)));
    await shop.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Notify users asynchronously
    unassignResults.forEach((user) => sendAvailabilityNotification(user, true, 'Unassigned from shop shift', 'Unassignment'));
    assignResults.forEach((user) => sendAvailabilityNotification(user, true, 'Assigned to shop shift', 'Assignment'));

    res.json({ message: 'Users assigned to shop shift successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};


// Helper function to unassign a user from a specific shift of the shop
const unassignUserFromShop = async (userId, shopId, shiftType, session) => {
  // Update user document
  const user = await User.findById(userId).session(session);
  
  // Check if the user is still assigned to any other shifts in the shop
  const shop = await Shop.findById(shopId).session(session);
  const isUserAssignedToOtherShifts = Array.from(shop.teams.keys()).some((shift) => {
    return shift !== shiftType && shop.teams.get(shift)?.includes(userId);
  });

  // Only unassign the user completely if they are not assigned to any other shifts in the shop
  if (!isUserAssignedToOtherShifts) {
    user.shopId = undefined; // Remove the shop assignment only if they are not assigned to other shifts
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
      action: ActionType.UNASSIGNED_FROM_SHOP,
      details: { shopId: shopId, shiftType, reason: `Unassigned from ${shiftType} shift` },
    }).save({ session }),
  ]);

  // Save the user changes
  await user.save({ session });

  return user;
};


// Helper function to assign a user to the shop
const assignUserToShop = async (userId, shopId, session) => {
  // Update user document
  const user = await User.findById(userId).session(session);
  user.shopId = shopId;
  const updatedIsAvailable = user.computedIsAvailable;

  // Create availability history and user history
  const [availabilityHistory, userHistory] = await Promise.all([
    new AvailabilityHistory({
      user: user._id,
      date: new Date(),
      status: updatedIsAvailable ? AvailabilityStatus.AVAILABLE : AvailabilityStatus.UNAVAILABLE,
      reason: 'Assigned to shop shift',
    }).save({ session }),
    new UserHistory({
      user: user._id,
      action: ActionType.ASSIGNED_TO_SHOP,
      details: { shopId: shopId, reason: 'Assigned to shop shift' },
    }).save({ session }),
  ]);

  // Save user
  await user.save({ session });

  return user;
};



