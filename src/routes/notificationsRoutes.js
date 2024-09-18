import express from 'express';
import { body, param, query } from 'express-validator';
import {
  getNotifications,
  markAsRead,
  createNotification,
} from '../controllers/notificationController.js';
import { authenticateToken } from '../middlewares/authenticate.js';
import { authorizeRole } from '../middlewares/authorize.js';

const router = express.Router();

/**
 * @route   GET /api/notifications
 * @desc    Get notifications for the authenticated user
 * @access  Private
 */
router.get(
  '/',
  authenticateToken,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1 }).withMessage('Limit must be a positive integer'),
  ],
  getNotifications
);

/**
 * @route   PUT /api/notifications/:notificationId/read
 * @desc    Mark a notification as read
 * @access  Private
 */
router.put(
  '/:notificationId/read',
  authenticateToken,
  [param('notificationId').isMongoId().withMessage('Invalid notification ID')],
  markAsRead
);

/**
 * @route   POST /api/notifications
 * @desc    Create a notification (Admin only)
 * @access  Private
 */
router.post(
  '/',
  authenticateToken,
  authorizeRole('Admin'),
  [
    body('userId').isMongoId().withMessage('Invalid user ID'),
    body('message').trim().notEmpty().withMessage('Message is required'),
  ],
  createNotification
);

export default router;
