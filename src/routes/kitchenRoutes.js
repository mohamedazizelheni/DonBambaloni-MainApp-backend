import express from 'express';
import { body, param, query } from 'express-validator';
import {
  createKitchen,
  getAllKitchens,
  getKitchenById,
  updateKitchen,
  deleteKitchen,
  assignUsersToKitchenShift,
} from '../controllers/kitchenController.js';
import { authenticateToken } from '../middlewares/authenticate.js';
import { authorizeRole } from '../middlewares/authorize.js';
import { ShiftType } from '../utils/enums.js';

const router = express.Router();

/**
 * @route   POST /api/kitchens
 * @desc    Create a new kitchen (Admin only)
 * @access  Private
 */
router.post(
  '/',
  authenticateToken,
  authorizeRole('Admin'),
  createKitchen
);

/**
 * @route   GET /api/kitchens
 * @desc    Get all kitchens
 * @access  Private
 */
router.get(
  '/',
  authenticateToken,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1 }).withMessage('Limit must be a positive integer'),
  ],
  getAllKitchens
);

/**
 * @route   GET /api/kitchens/:kitchenId
 * @desc    Get a specific kitchen
 * @access  Private
 */
router.get(
  '/:kitchenId',
  authenticateToken,
  [param('kitchenId').isMongoId().withMessage('Invalid kitchen ID')],
  getKitchenById
);

/**
 * @route   PUT /api/kitchens/:kitchenId
 * @desc    Update a kitchen (Admin only)
 * @access  Private
 */
router.put(
  '/:kitchenId',
  authenticateToken,
  authorizeRole('Admin'),
  [
    param('kitchenId').isMongoId().withMessage('Invalid kitchen ID'),
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
  updateKitchen
);

/**
 * @route   DELETE /api/kitchens/:kitchenId
 * @desc    Delete a kitchen (Admin only)
 * @access  Private
 */
router.delete(
  '/:kitchenId',
  authenticateToken,
  authorizeRole('Admin'),
  [param('kitchenId').isMongoId().withMessage('Invalid kitchen ID')],
  deleteKitchen
);

/**
 * @route   POST /api/kitchens/:kitchenId/assign-users
 * @desc    Assign multiple users to a kitchen shift (Admin only)
 * @access  Private
 */
router.post(
  '/:kitchenId/assign-users',
  authenticateToken,
  authorizeRole('Admin'),
  [
    param('kitchenId').isMongoId().withMessage('Invalid kitchen ID'),
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
  assignUsersToKitchenShift
);

export default router;
