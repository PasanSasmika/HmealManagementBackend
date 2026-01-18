import { Router } from 'express';
import { register, login, registerBulk } from '../controllers/authController';
import { authorize, protect } from '@/middleware/authMiddleware';
import { Role } from '@/models/User';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/login', login);

router.post('/register', protect, authorize(Role.ADMIN, Role.HRMANAGER), register);

router.post('/register-bulk',protect, authorize(Role.ADMIN, Role.HRMANAGER),upload.single('file'), registerBulk);

export default router;