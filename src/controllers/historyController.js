import AvailabilityHistory from "../models/AvailabilityHistory.js";
import UserHistory from "../models/UserHistory.js";
import SalaryRecord from "../models/SalaryRecord.js";

// Fetch salary history with pagination
export const getSalaryHistory = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const skip = (page - 1) * limit;
  
      const salaryHistory = await SalaryRecord.find({ user: req.user.userId })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();
  
      const totalRecords = await SalaryRecord.countDocuments({ user: req.user.userId });
  
      res.json({
        salaryHistory,
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
      });
    } catch (err) {
      next(err);
    }
  };
  
  // Fetch availability history with pagination
  export const getAvailabilityHistory = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const skip = (page - 1) * limit;
  
      const availabilityHistory = await AvailabilityHistory.find({ user: req.user.userId })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();
  
      const totalRecords = await AvailabilityHistory.countDocuments({ user: req.user.userId });
  
      res.json({
        availabilityHistory,
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
      });
    } catch (err) {
      next(err);
    }
  };
  
  // Fetch user action history with pagination
  export const getActionHistory = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const skip = (page - 1) * limit;
  
      const actionHistory = await UserHistory.find({ user: req.user.userId })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();
  
      const totalRecords = await UserHistory.countDocuments({ user: req.user.userId });
  
      res.json({
        actionHistory,
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
      });
    } catch (err) {
      next(err);
    }
  };
  