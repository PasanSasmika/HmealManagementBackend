import { Request, Response } from 'express';
import User from '../models/User';
import jwt from 'jsonwebtoken';
import { Router } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// 1. HANDSHAKE
export const handleHandshake = async (req: Request, res: Response) => {
  console.log("ZKT Handshake:", req.query);
  res.send("GET OPTION FROM: " + req.query.SN + "\nATTLOGStamp=None\nOPERLOGStamp=None\nATTPHOTOStamp=None\nErrorDelay=30\nDelay=10\nTransTimes=00:00;14:05\nTransInterval=1\nTransFlag=1111000000\nTimeZone=6\nRealtime=1\nEncrypt=0");
};

// 2. RECEIVE LOGS
export const handleAttendanceLog = async (req: Request, res: Response, io: any) => {
  try {
    const { table } = req.query;
    const logData = req.body.toString(); 

    if (table === 'options' || table === 'OPERLOG') {
      res.send("OK");
      return;
    }

    if (table === 'ATTLOG') {
      console.log("👉 FINGERPRINT SCAN RECEIVED:", logData);
      const lines = logData.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split('\t');
        const zkUserId = parts[0]; 

        if (zkUserId) {
          console.log(`✅ Processing User ID: ${zkUserId}`);
          const user = await User.findOne({ bioId: zkUserId });

          if (user) {
            const token = jwt.sign(
              { id: user._id, role: user.role },
              JWT_SECRET as string,
              { expiresIn: '1d' }
            );

            const deviceSN = req.query.SN || "default_device";
            
            // ✅ CRITICAL FIX: Sending 'subRole' so Web Interface shows "Pay Later" button
            io.to(`room_${deviceSN}`).emit('kiosk_login', {
              success: true,
              token: token,
              user: {
                id: user._id,
                name: `${user.firstName} ${user.lastName}`,
                role: user.role,
                subRole: user.subRole // <--- THIS WAS MISSING
              }
            });

            console.log(`🚀 Login Signal Sent: ${user.firstName} -> room_${deviceSN}`);
          } else {
            console.log(`❌ User not found for Bio ID: ${zkUserId}`);
          }
        }
      }
      res.send("OK");
      return;
    }
    res.send("OK");
  } catch (error) {
    console.error("ZKT Error:", error);
    res.status(500).send("ERROR");
  }
};

export const handleGetRequest = (req: Request, res: Response) => {
  res.send("OK");
};

const zkRouter = (io: any) => {
  const zkrouter = Router();
  zkrouter.get('/cdata', handleHandshake);
  zkrouter.post('/cdata', (req, res) => handleAttendanceLog(req, res, io));
  zkrouter.get('/getrequest', handleGetRequest);
  return zkrouter;
};

export default zkRouter;