import express from 'express';
import { body } from 'express-validator';
import { register, login, logout, getMe, refreshToken } from '../controllers/authController.js';
import { authenticateToken } from '../middlewares/authenticate.js';

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('email')
      .trim()
      .isEmail()
      .withMessage('Valid email is required')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('role').notEmpty().withMessage('Role is required'),
    body('salary').isNumeric().withMessage('Salary must be a number'),
  ],
  register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  login
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', authenticateToken, logout);


/**
 * @route   GET /api/auth/me
 * @desc    Get authenticated user's profile
 * @access  Private
 */
router.get('/me', authenticateToken, getMe);
router.post('/refresh-token', refreshToken);

export default router;
