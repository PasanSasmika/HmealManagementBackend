import { Request, Response } from 'express';
import MealPrice from '../models/MealPrice';

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

// POST: Update or Create prices (Admin/HR Only)
export const updateMealPrices = async (req: any, res: Response) => {
  try {
    const { breakfast, lunch, dinner } = req.body;
    const userId = req.user.id;

    // Find existing document or create new one
    let prices = await MealPrice.findOne();

    if (!prices) {
      prices = new MealPrice({ 
        breakfast, 
        lunch, 
        dinner, 
        updatedBy: userId 
      });
    } else {
      prices.breakfast = breakfast;
      prices.lunch = lunch;
      prices.dinner = dinner;
      prices.updatedBy = userId;
    }

    await prices.save();

    res.status(200).json({ 
      success: true, 
      message: "Meal prices updated successfully", 
      data: prices 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};