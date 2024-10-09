import express from 'express';
import { authenticateToken } from '../middlewares/authenticate.js';
import { authorizeRole } from '../middlewares/authorize.js';
import { body, param } from 'express-validator';

import {
  createShop,
  getAllShops,
  getShopById,
  updateShop,
  deleteShop,
  assignUsersToShopShift,
  restoreShop,
} from '../controllers/shopController.js';
import { ShiftType } from '../utils/enums.js';

const router = express.Router();

// POST /api/shops - Create a new shop (Admin only)
router.post(
  '/',
  authenticateToken,
  authorizeRole('Admin'),
 
  createShop
);

// GET /api/shops - Get all shops
router.get('/', authenticateToken, getAllShops);

// GET /api/shops/:shopId - Get a specific shop
router.get(
  '/:shopId',
  authenticateToken,
  [param('shopId').isMongoId().withMessage('Invalid shop ID')],
  getShopById
);

// PUT /api/shops/:shopId - Update a shop (Admin only)
router.put(
  '/:shopId',
  authenticateToken,
  authorizeRole('Admin'),
  [
    param('shopId').isMongoId().withMessage('Invalid shop ID'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('address').optional().trim().notEmpty().withMessage('Address cannot be empty'),
    body('operatingShifts')
      .optional()
      .isArray()
      .withMessage('Operating shifts must be an array'),
    body('operatingShifts.*')
      .optional()
      .isIn(Object.values(ShiftType))
      .withMessage('Invalid shift type'),
  ],
  updateShop
);

// DELETE /api/shops/:shopId - Delete a shop (Admin only)
router.delete(
  '/:shopId',
  authenticateToken,
  authorizeRole('Admin'),
  [param('shopId').isMongoId().withMessage('Invalid shop ID')],
  deleteShop
);

/**
 * @route   POST /api/shops/:shopId/assign-users
 * @desc    Assign multiple users to a shop shift (Admin only)
 * @access  Private
 */
router.post(
  '/:shopId/assign-users',
  authenticateToken,
  authorizeRole('Admin'),
  [
    param('shopId').isMongoId().withMessage('Invalid shop ID'),
    body('userIds')
      .isArray()
      .withMessage('userIds must be an array'),
    body('userIds.*')
      .optional()
      .isMongoId()
      .withMessage('Invalid user ID in userIds'),
    body('shiftType')
      .isIn(Object.values(ShiftType))
      .withMessage('Invalid shift type'),
  ],
  assignUsersToShopShift
);

router.put('/:shopId/restore-shop', authenticateToken, restoreShop);


export default router;
