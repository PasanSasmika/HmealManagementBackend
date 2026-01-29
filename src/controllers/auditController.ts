import { Request, Response } from 'express';
import AuditLog from '../models/AuditLog';

export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    // Fetch logs, newest first
    const logs = await AuditLog.find()
      .populate('performedBy', 'firstName lastName role subRole') // Who did it
      .populate('targetUser', 'firstName lastName role')   // Who was it done to
      .sort({ createdAt: -1 })
      .limit(100); // Limit to last 100 actions for performance

    res.status(200).json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};