import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import { Role } from '../models/User';
import { getAuditLogs } from '../controllers/auditController';

const AuditRouter = Router();

// Only Admin and HR can view logs
AuditRouter.get('/', protect, authorize(Role.ADMIN, Role.HRMANAGER), getAuditLogs);

export default AuditRouter;