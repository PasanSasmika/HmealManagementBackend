import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import { Role } from '../models/User';
import { addVisitorBooking, cancelVisitorBooking, getVisitorBookings, issueVisitorMeal } from '../controllers/visitorController';

const VisitorRouter = Router();

// Allowed Roles: Admin, HR, Canteen
const ALLOWED_ROLES = [Role.ADMIN, Role.HRMANAGER, Role.CANTEEN];
const MANAGER_ROLES = [Role.ADMIN, Role.HRMANAGER];
// 1. Add Visitor
VisitorRouter.post('/add', protect, authorize(...ALLOWED_ROLES), addVisitorBooking);

// 2. Get Visitors (Query param: ?date=YYYY-MM-DD)
VisitorRouter.get('/', protect, authorize(...ALLOWED_ROLES), getVisitorBookings);

// 3. Issue Meal
VisitorRouter.put('/issue/:id', protect, authorize(...ALLOWED_ROLES), issueVisitorMeal);

VisitorRouter.delete('/:id', protect, authorize(...MANAGER_ROLES), cancelVisitorBooking);
export default VisitorRouter;