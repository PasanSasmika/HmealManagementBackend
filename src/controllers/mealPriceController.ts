import { Request, Response } from 'express';
import MealPrice from '../models/MealPrice';
import AuditLog from '@/models/AuditLog';

// GET: Fetch current prices
export const getMealPrices = async (req: Request, res: Response) => {
  try {
    let prices = await MealPrice.findOne();
    
    // Default values if no prices set yet
    if (!prices) {
      return res.status(200).json({ 
        success: true, 
        data: { breakfast: 0, lunch: 0, dinner: 0 } 
      });
    }

    res.status(200).json({ success: true, data: prices });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const updateMealPrices = async (req: any, res: Response): Promise<void> => {
  try {
    const { breakfast, lunch, dinner } = req.body;
    const adminId = req.user.id;

    // 1. Get Old Prices first
    let priceDoc = await MealPrice.findOne();
    const oldPrices = priceDoc ? { ...priceDoc.toObject() } : { breakfast: 0, lunch: 0, dinner: 0 };

    if (!priceDoc) {
      priceDoc = new MealPrice({ breakfast, lunch, dinner });
    } else {
      priceDoc.breakfast = breakfast;
      priceDoc.lunch = lunch;
      priceDoc.dinner = dinner;
    }
    await priceDoc.save();

    // 2. ✅ LOG THE CHANGE
    await AuditLog.create({
      action: "UPDATE_PRICES",
      performedBy: adminId,
      details: `Updated meal prices.`,
      metadata: {
        old: { B: oldPrices.breakfast, L: oldPrices.lunch, D: oldPrices.dinner },
        new: { B: breakfast, L: lunch, D: dinner }
      }
    });

    res.status(200).json({ success: true, message: "Prices updated and logged." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};