import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import { Role } from '../models/User';
import {  getDailyBookingReport, getDashboardStats, getEmployeeFinancialReport } from '../controllers/analyticsController';

const AnalyticsRouter = Router();

AnalyticsRouter.get(
  '/dashboard', 
  protect, 
  authorize(Role.ADMIN, Role.HRMANAGER), 
  getDashboardStats
);


AnalyticsRouter.get(
  '/financials', 
  protect, 
  authorize(Role.ADMIN, Role.HRMANAGER), 
  getEmployeeFinancialReport
);

AnalyticsRouter.get(
  '/daily-report',
  protect,
  authorize(Role.ADMIN, Role.HRMANAGER, Role.CANTEEN),
  getDailyBookingReport
);
export default AnalyticsRouter;