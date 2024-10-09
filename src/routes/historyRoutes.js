import express from 'express';
import { getSalaryHistory, getAvailabilityHistory, getActionHistory } from '../controllers/historyController.js';
import { authenticateToken } from '../middlewares/authenticate.js';

const router = express.Router();

// Route to fetch salary history with pagination
router.get('/salary-history', authenticateToken, getSalaryHistory);

// Route to fetch availability history with pagination
router.get('/availability-history', authenticateToken, getAvailabilityHistory);

// Route to fetch user action history with pagination
router.get('/action-history', authenticateToken, getActionHistory);

export default router;
