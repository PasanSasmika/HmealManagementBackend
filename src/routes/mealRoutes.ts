import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import { Role } from '../models/User';
import { 
  bookMeals, 
  getPaymentStatus, 
  getTodayMeals, 
  issueMeal, 
  processPayment, 
  requestMeal, 
  respondToRequest, 
  verifyMealOTP
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

// 5. Employee verifies the OTP shown on their screen
  MealRouter.post(
    '/verify-otp',
    protect,
    authorize(Role.EMPLOYEE),
    verifyMealOTP // No 'io' needed here unless you want to alert the canteen dashboard
  );

    MealRouter.post(
    '/process-payment',
    protect,
    authorize(Role.EMPLOYEE, Role.CANTEEN), // Both can trigger this depending on your flow
    processPayment
  );

  MealRouter.get(
    '/payment-status/:bookingId',
    protect,
    authorize(Role.CANTEEN, Role.ADMIN),
    getPaymentStatus
  );

  // Canteen: Final button click to issue the meal
  MealRouter.post(
    '/issue',
    protect,
    authorize(Role.CANTEEN),
    (req, res) => issueMeal(req, res, io)
  );



  return MealRouter;


};



export default MealRouter;