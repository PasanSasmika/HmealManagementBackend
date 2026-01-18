import { Request, Response } from 'express';
import MealBooking, { MealType } from '../models/MealBooking';
import { mealBookingSchema } from '../validations/mealValidation';

export const bookMeals = async (req: any, res: Response): Promise<void> => {
  try {
    // 1. Validate the structure of the incoming array
    const { bookings } = mealBookingSchema.parse(req.body);
    const userId = req.user.id;

    // 2. Setup Date Boundaries (Today vs Today + 7)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // Ground today to midnight UTC
    
    const maxDate = new Date(today);
    maxDate.setUTCDate(today.getUTCDate() + 7);

    // 3. Prepare data for Bulk Write
    const operations = bookings.map((b: any) => {
      const bookingDate = new Date(b.date);
      bookingDate.setUTCHours(0, 0, 0, 0); // Force midnight UTC for consistency

      // 4. Strict Date Validation
      if (bookingDate < today || bookingDate > maxDate) {
        throw new Error(`Date ${b.date.split('T')[0]} is out of the allowed 7-day range.`);
      }

      return {
        updateOne: {
          filter: { userId, date: bookingDate, mealType: b.mealType },
          update: { 
            $set: { 
              userId, 
              date: bookingDate, 
              mealType: b.mealType,
              bookedAt: new Date() 
            } 
          },
          upsert: true 
        }
      };
    });

    await MealBooking.bulkWrite(operations);

    res.status(200).json({ 
      success: true, 
      message: `Successfully processed ${operations.length} meal selections.` 
    });
  } catch (error: any) {
  // If it's a Zod error, it has an 'issues' array
  if (error.issues) {
    res.status(400).json({ 
      success: false, 
      message: "Validation Error",
      errors: error.issues.map((i: any) => ({
        field: i.path.join('.'),
        message: i.message
      }))
    });
    return;
  }

  res.status(400).json({ 
    success: false, 
    message: error.message || "Meal booking failed" 
  });
}
};