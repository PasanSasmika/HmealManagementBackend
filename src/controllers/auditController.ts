import { Request, Response } from 'express';
import AuditLog from '../models/AuditLog';

export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const logs = await AuditLog.find()
      .populate('performedBy', 'firstName lastName role')
      .populate('targetUser', 'firstName lastName mobileNumber')
      .sort({ createdAt: -1 }); // Newest first

    res.status(200).json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};