// routes/shops.js

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
  assignUserToShopShift,
} from '../controllers/shopController.js';
import { ShiftType } from '../utils/enums.js';

const router = express.Router();

// POST /api/shops - Create a new shop (Admin only)
router.post(
  '/',
  authenticateToken,
  authorizeRole('Admin'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('address').trim().notEmpty().withMessage('Address is required'),
    body('operatingShifts')
      .isArray({ min: 1 })
      .withMessage('At least one operating shift is required'),
    body('operatingShifts.*')
      .isIn(Object.values(ShiftType))
      .withMessage('Invalid shift type'),
    // Additional validations as needed
  ],
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
    // Additional validations as needed
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

// POST /api/shops/:shopId/assign-user - Assign user to shop shift (Admin only)
router.post(
  '/:shopId/assign-user',
  authenticateToken,
  authorizeRole('Admin'),
  [
    param('shopId').isMongoId().withMessage('Invalid shop ID'),
    body('userId').isMongoId().withMessage('Invalid user ID'),
    body('shiftType')
      .isIn(Object.values(ShiftType))
      .withMessage('Invalid shift type'),
  ],
  assignUserToShopShift
);

export default router;
