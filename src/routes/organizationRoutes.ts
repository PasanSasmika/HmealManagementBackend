import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import { Role } from '../models/User';
import { 
  getOrganizations, addCompany, deleteCompany, addDivision, removeDivision 
} from '../controllers/organizationController';

const Orgrouter = Router();

// Allow Admin & HR to view
Orgrouter.get('/', protect, authorize(Role.ADMIN, Role.HRMANAGER), getOrganizations);

// Only Admin can Manage Structure
Orgrouter.post('/company', protect, authorize(Role.ADMIN), addCompany);
Orgrouter.delete('/company/:id', protect, authorize(Role.ADMIN), deleteCompany);

Orgrouter.post('/division/:id', protect, authorize(Role.ADMIN), addDivision);
Orgrouter.post('/division/:id/remove', protect, authorize(Role.ADMIN), removeDivision);

export default Orgrouter;