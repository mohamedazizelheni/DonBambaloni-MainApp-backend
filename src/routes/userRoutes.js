import express from 'express';
import { body, param, query } from 'express-validator';
import {
  getAllUsers,
  getUserProfile,
  updateUserProfile,
  deleteUser,
  updateUserAvailability,
} from '../controllers/userController.js';
import { authenticateToken } from '../middlewares/authenticate.js';
import { authorizeRole } from '../middlewares/authorize.js';

const router = express.Router();

/**
 * @route   GET /api/users
 * @desc    Get all users (Admin only)
 * @access  Private
 */
router.get(
  '/',
  authenticateToken,
  authorizeRole('Admin'),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1 }).withMessage('Limit must be a positive integer'),
    query('search').optional().isString().withMessage('Search must be a string'),
  ],
  getAllUsers
);

/**
 * @route   GET /api/users/profile
 * @desc    Get own profile
 * @access  Private
 */
router.get('/profile', authenticateToken, getUserProfile);

/**
 * @route   PUT /api/users/profile
 * @desc    Update own profile
 * @access  Private
 */
router.put(
  '/profile',
  authenticateToken,
  [
    body('email').optional().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('username').optional().trim().notEmpty().withMessage('Username cannot be empty'),
  ],
  updateUserProfile
);

/**
 * @route   DELETE /api/users/:userId
 * @desc    Delete a user (Admin only)
 * @access  Private
 */
router.delete(
  '/:userId',
  authenticateToken,
  authorizeRole('Admin'),
  [param('userId').isMongoId().withMessage('Invalid user ID')],
  deleteUser
);

/**
 * @route   PUT /api/users/:userId/availability
 * @desc    Update user availability (Admin only)
 * @access  Private
 */
router.put(
  '/:userId/availability',
  authenticateToken,
  authorizeRole('Admin'),
  [
    param('userId').isMongoId().withMessage('Invalid user ID'),
    body('isAvailable').isBoolean().withMessage('isAvailable must be a boolean'),
    body('reason').optional().trim().notEmpty().withMessage('Reason cannot be empty'),
  ],
  updateUserAvailability
);

export default router;
