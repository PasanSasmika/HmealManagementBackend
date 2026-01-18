import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import { Role } from '../models/User';
import { bookMeals, getTodayMeals } from '@/models/mealController';

const Mealrouter = Router();

// Only users with the 'employee' role can book meals
Mealrouter.post(
  '/book', 
  protect, 
  authorize(Role.EMPLOYEE), 
  bookMeals
);

Mealrouter.get(
  '/today', 
  protect, 
  authorize(Role.EMPLOYEE), 
  getTodayMeals
);

export default Mealrouter;