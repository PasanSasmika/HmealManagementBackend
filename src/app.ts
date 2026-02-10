import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/authRoutes';
import VisitorRouter from './routes/visitorRoutes';
import AuditRouter from './routes/auditRoutes';
import AnalyticsRouter from './routes/analyticsRoutes';
import bodyParser from 'body-parser'; // ✅ 1. Import body-parser
import Orgrouter from './routes/organizationRoutes';
const app: Application = express();

// --- Global Middleware ---
app.use(helmet()); 
app.use(cors({
  origin: "*", // Allow all origins (Mobile, Web, Kiosk)
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// ✅ 2. Handle Preflight Requests Manually (The Nuclear Option)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

app.use(bodyParser.text({ type: '*/*' }));
app.use('/api/auth', authRoutes);
app.use('/api/visitors', VisitorRouter);
app.use('/api/audit', AuditRouter);
app.use('/api/analytics', AnalyticsRouter);
app.use('/api/organization', Orgrouter);

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

// --- Global Error Handler ---
app.use((err: any, req: Request, res: Response, next: any) => {
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

export default app;