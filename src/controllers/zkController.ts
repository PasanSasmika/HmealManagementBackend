import { Request, Response } from 'express';
import User from '../models/User';
import jwt from 'jsonwebtoken';



const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// 1. HANDSHAKE
export const handleHandshake = async (req: Request, res: Response) => {
  console.log("ZKT Handshake:", req.query);
  res.send("GET OPTION FROM: " + req.query.SN + "\nATTLOGStamp=None\nOPERLOGStamp=None\nATTPHOTOStamp=None\nErrorDelay=30\nDelay=10\nTransTimes=00:00;14:05\nTransInterval=1\nTransFlag=1111000000\nTimeZone=6\nRealtime=1\nEncrypt=0");
};

// 2. RECEIVE LOGS (Smart Filter)
export const handleAttendanceLog = async (req: Request, res: Response, io: any) => {
  try {
    const { table } = req.query; // Check what type of data this is
    const logData = req.body.toString(); 

    // --- CASE A: CONFIGURATION / INFO (Ignore) ---
    if (table === 'options' || table === 'OPERLOG') {
      // console.log(`ZKT System Log [${table}]:`, logData.substring(0, 50) + "...");
      res.send("OK"); // Just say OK so the device stops sending it
      return;
    }

    // --- CASE B: ATTENDANCE LOG (The Real Scan!) ---
    if (table === 'ATTLOG') {
      console.log("👉 FINGERPRINT SCAN RECEIVED:", logData);

      // ZKTeco can send multiple logs in one request, separated by newlines
      const lines = logData.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue; // Skip empty lines

        // Format: ID  Date  State  Verification
        // Example: 3	2026-02-07 09:42:19	0	1
        const parts = line.split('\t');
        const zkUserId = parts[0]; 

        if (zkUserId) {
          console.log(`✅ Processing User ID: ${zkUserId}`);

          // 1. Find User in DB
          const user = await User.findOne({ bioId: zkUserId });

          if (user) {
            // 2. Generate Token
            const token = jwt.sign(
              { id: user._id, role: user.role },
              JWT_SECRET as string,
              { expiresIn: '1d' }
            );

            // 3. Emit to Kiosk Room
            const deviceSN = req.query.SN || "default_device";
            
            io.to(`room_${deviceSN}`).emit('kiosk_login', {
              success: true,
              token: token,
              user: {
                id: user._id,
                name: `${user.firstName} ${user.lastName}`,
                role: user.role
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

    // Default catch-all
    res.send("OK");

  } catch (error) {
    console.error("ZKT Error:", error);
    res.status(500).send("ERROR");
  }
};

// 3. KEEP ALIVE
export const handleGetRequest = (req: Request, res: Response) => {
  res.send("OK");
};