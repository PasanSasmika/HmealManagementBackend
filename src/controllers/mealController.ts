import { Request, Response } from 'express';
import MealBooking, { MealType } from '../models/MealBooking';
import { mealBookingSchema } from '../validations/mealValidation';
import User from '@/models/User';

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

export const getTodayMeals = async (req: any, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    // 1. Get Today's Date normalized to UTC Midnight
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // 2. Find all bookings for this user for today
    const bookings = await MealBooking.find({
      userId,
      date: today
    }).select('mealType bookedAt');

    if (bookings.length === 0) {
      res.status(200).json({
        success: true,
        hasBookings: false,
        message: "You haven't booked any meals for today.",
        data: []
      });
      return;
    }

    res.status(200).json({
      success: true,
      hasBookings: true,
      message: "Today's bookings retrieved.",
      data: bookings // Returns array: e.g., [{mealType: 'breakfast'}, {mealType: 'lunch'}]
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const requestMeal = async (req: any, res: Response, io: any): Promise<void> => {
  try {
    const { mealType } = req.body; // e.g., 'breakfast'
    const userId = req.user.id;
    const now = new Date();
    const currentHour = now.getHours();

    // 1. Time Window Validation
    const windows: any = {
      breakfast: { start: 7, end: 11 },
      lunch: { start: 12, end: 16 },
      dinner: { start: 18, end: 22 }
    };

    const window = windows[mealType];
    if (currentHour < window.start || currentHour >= window.end) {
      res.status(400).json({ message: `It is not ${mealType} time yet.` });
      return;
    }

    // 2. Check if booking exists for today
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const booking = await MealBooking.findOne({ userId, date: today, mealType });

    if (!booking) {
      res.status(404).json({ message: "No booking found for this meal today." });
      return;
    }

    // 3. Update status to requested
    booking.status = 'requested';
    await booking.save();

    // 4. Notify Canteen via Socket
    const user = await User.findById(userId);
    io.to('canteen_room').emit('new_meal_request', {
      bookingId: booking._id,
      employeeName: `${user?.firstName} ${user?.lastName}`,
      mealType: mealType
    });

    res.status(200).json({ success: true, message: "Request sent to canteen." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


export const respondToRequest = async (req: any, res: Response, io: any): Promise<void> => {
  try {
    const { bookingId, action } = req.body; // action: 'accept' or 'reject'

    const booking = await MealBooking.findById(bookingId);
    if (!booking) {
      res.status(404).json({ message: "Request not found." });
      return;
    }

    if (action === 'accept') {
      // Generate a simple 4-digit OTP
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      booking.otp = otp;
      booking.status = 'served'; // Mark as served once OTP is generated
      await booking.save();

      // Send OTP to specific Employee via their unique Socket ID or Room
      io.to(booking.userId.toString()).emit('meal_accepted', { otp });
      
      res.status(200).json({ success: true, otp });
    } else {
      booking.status = 'rejected';
      await booking.save();
      io.to(booking.userId.toString()).emit('meal_rejected', { message: "Request denied by canteen." });
      res.status(200).json({ success: true, message: "Request rejected." });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};