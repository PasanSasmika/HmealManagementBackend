import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import { Role } from '../models/User';
import { bookMeals } from '@/models/mealController';

const Mealrouter = Router();

// Only users with the 'employee' role can book meals
Mealrouter.post(
  '/book', 
  protect, 
  authorize(Role.EMPLOYEE), 
  bookMeals
);

export default Mealrouter;