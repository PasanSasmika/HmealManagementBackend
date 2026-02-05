import { Router } from 'express';
import { register, login, registerBulk, getAllUsers, updateUser, deleteUser, setPin, resetPassword } from '../controllers/authController';
import { authorize, protect } from '@/middleware/authMiddleware';
import { Role } from '@/models/User';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/login', login);

router.post('/register', protect, authorize(Role.ADMIN, Role.HRMANAGER), register);
router.post('/set-pin', setPin); 
router.put('/reset-password/:id', protect, authorize(Role.ADMIN, Role.HRMANAGER), resetPassword);
router.post('/register-bulk',protect, authorize(Role.ADMIN, Role.HRMANAGER),upload.single('file'), registerBulk);

router.get('/', protect, authorize(Role.ADMIN, Role.HRMANAGER, Role.CANTEEN), getAllUsers);
router.put('/:id', protect, authorize(Role.ADMIN, Role.HRMANAGER), updateUser);
router.delete('/:id', protect, authorize(Role.ADMIN, Role.HRMANAGER), deleteUser);
export default router;