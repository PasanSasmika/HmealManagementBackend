import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import { Role } from '../models/User';
import { 
  bookMeals, 
  getTodayMeals, 
  requestMeal, 
  respondToRequest 
} from '@/controllers/mealController';

/**
 * We export a function that accepts the Socket.io instance.
 * This allows the controllers to emit real-time events.
 */
const MealRouter = (io: any) => {
  const MealRouter = Router();

  // 1. Book meals for the next 7 days (Employee Only)
  MealRouter.post(
    '/book', 
    protect, 
    authorize(Role.EMPLOYEE), 
    bookMeals
  );

  // 2. Fetch today's bookings for the "Meal Request" page (Employee Only)
  MealRouter.get(
    '/today', 
    protect, 
    authorize(Role.EMPLOYEE), 
    getTodayMeals
  );

  // 3. Request a specific meal (Real-time Popup to Canteen)
  MealRouter.post(
    '/request',
    protect,
    authorize(Role.EMPLOYEE),
    (req, res) => requestMeal(req, res, io)
  );

  // 4. Canteen responds to the popup (Accept/Reject + OTP Generation)
  MealRouter.post(
    '/respond',
    protect,
    authorize(Role.CANTEEN),
    (req, res) => respondToRequest(req, res, io)
  );

  return MealRouter;
};

export default MealRouter;