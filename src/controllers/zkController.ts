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
          console.log(`🔍 Checking User Bio ID: ${zkUserId}`);
          const user = await User.findOne({ bioId: zkUserId });

          if (user) {
            const deviceSN = req.query.SN || "default_device";

            // ⛔ CRITICAL: SUSPENSION CHECK
            if (user.isSuspended) {
                const now = new Date();
                const start = user.suspensionStart ? new Date(user.suspensionStart) : null;
                const end = user.suspensionEnd ? new Date(user.suspensionEnd) : null;

                // Case A: User is currently suspended
                if (start && end && now >= start && now <= end) {
                    console.log(`⛔ BLOCKED: Suspended User ${user.username} tried to login via Fingerprint.`);
                    
                    // Emit Error to Kiosk Screen
                    io.to(`room_${deviceSN}`).emit('kiosk_error', {
                        message: `ACCOUNT SUSPENDED UNTIL ${end.toLocaleDateString()}`
                    });
                    
                    continue; // Skip token generation
                }

                // Case B: Suspension Expired (Auto-Reactivate)
                if (end && now > end) {
                    console.log(`✅ Suspension Expired for ${user.username}. Reactivating account.`);
                    user.isSuspended = false;
                    user.suspensionStart = undefined;
                    user.suspensionEnd = undefined;
                    await user.save();
                }
            }

            // ✅ LOGIN SUCCESS
            const token = jwt.sign(
              { id: user._id, role: user.role },
              JWT_SECRET as string,
              { expiresIn: '1d' }
            );
            
            io.to(`room_${deviceSN}`).emit('kiosk_login', {
              success: true,
              token: token,
              user: {
                id: user._id,
                name: `${user.firstName} ${user.lastName}`,
                role: user.role,
                subRole: user.subRole 
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