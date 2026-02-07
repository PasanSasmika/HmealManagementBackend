import { Router } from 'express';
import { handleHandshake, handleAttendanceLog, handleGetRequest } from '../controllers/zkController';

const zkRouter = (io: any) => {
  const zkrouter = Router();

  // ZKTeco uses the same URL for Handshake (GET) and Logs (POST)
  zkrouter.get('/cdata', handleHandshake);
  zkrouter.post('/cdata', (req, res) => handleAttendanceLog(req, res, io));
  
  // Keep-alive check
  zkrouter.get('/getrequest', handleGetRequest);

  return zkrouter;
};

export default zkRouter;