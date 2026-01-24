import { Request, Response } from 'express';
import MealBooking, { MealType } from '../models/MealBooking';
import { mealBookingSchema } from '../validations/mealValidation';
import User from '@/models/User';
import MealPrice from '@/models/MealPrice';

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
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // ✅ Select extra fields: status, verifiedAt, paymentType, otp
    const bookings = await MealBooking.find({
      userId,
      date: today
    }).select('mealType bookedAt status verifiedAt paymentType otp');

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
      data: bookings
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const requestMeal = async (req: any, res: Response, io: any): Promise<void> => {
  try {
    const { mealType } = req.body; 
    const userId = req.user.id;

    // 1. FIX: Get Current Time in Sri Lanka (Asia/Colombo)
    // Render uses UTC, so we must convert it.
    const serverTime = new Date();
    const lkTimeStr = serverTime.toLocaleString("en-US", { timeZone: "Asia/Colombo" });
    const lkNow = new Date(lkTimeStr);
    
    const currentHour = lkNow.getHours(); // This will now give 10 (if it's 10 AM in SL)

    // 2. Time Window Validation
    const windows: any = {
      breakfast: { start: 7, end: 11 },
      lunch: { start: 12, end: 17 },
      dinner: { start: 18, end: 22 }
    };

    const window = windows[mealType];
    if (currentHour < window.start || currentHour >= window.end) {
      res.status(400).json({ message: `It is not ${mealType} time yet. (Hour: ${currentHour})` });
      return;
    }

    // 3. FIX: Get "Today" based on Sri Lanka date, normalized to UTC Midnight for DB
    // (We match how we stored it in bookMeals)
    const today = new Date(Date.UTC(lkNow.getFullYear(), lkNow.getMonth(), lkNow.getDate()));

    const booking = await MealBooking.findOne({ userId, date: today, mealType });

    if (!booking) {
      res.status(404).json({ message: "No booking found for this meal today." });
      return;
    }

    // 4. Update status to requested
    booking.status = 'requested';
    await booking.save();

    // 5. Notify Canteen via Socket
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
    const { bookingId, action } = req.body; 
    const booking = await MealBooking.findById(bookingId);
    
    if (!booking) {
      res.status(404).json({ message: "Request not found." });
      return;
    }

    if (action === 'accept') {
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      booking.otp = otp;
      // ❌ REMOVED: booking.status = 'served'; 
      // Status remains 'requested' until Issue Meal step
      await booking.save();

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


export const verifyMealOTP = async (req: any, res: Response): Promise<void> => {
  try {
    const { bookingId, otp } = req.body;
    const userId = req.user.id;

    const booking = await MealBooking.findOne({ _id: bookingId, userId });

    if (!booking) {
       res.status(404).json({ success: false, message: "Booking not found." });
       return;
    }

    // Check if already collected (fully served)
    if (booking.status === 'served') { 
       res.status(400).json({ success: false, message: "This meal has already been collected." });
       return;
    }

    if (booking.otp !== otp) {
       res.status(401).json({ success: false, message: "Invalid OTP. Please try again." });
       return;
    }

    // ❌ REMOVED: booking.status = 'served';
    booking.verifiedAt = new Date();
    booking.otp = undefined; 
    
    await booking.save();

    res.status(200).json({ 
      success: true, 
      message: "OTP Verified! You may now proceed to payment selection.",
      navigateTo: "PaymentSelection"
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const processPayment = async (req: any, res: Response, io: any): Promise<void> => {
  try {
    const { bookingId, paymentType, amountPaid } = req.body;

    const booking = await MealBooking.findById(bookingId).populate('userId');
    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    // 1. FETCH DYNAMIC PRICES
    const priceDoc = await MealPrice.findOne();
    let currentMealPrice = 0;

    if (priceDoc) {
      if (booking.mealType === 'breakfast') currentMealPrice = priceDoc.breakfast;
      else if (booking.mealType === 'lunch') currentMealPrice = priceDoc.lunch;
      else if (booking.mealType === 'dinner') currentMealPrice = priceDoc.dinner;
    }

    const user: any = booking.userId;
    let finalAmountPaid = 0;
    let balance = 0;

    // 2. Business Logic
    if (user.subRole === 'intern') {
      booking.paymentType = 'free';
      booking.totalPrice = 0;
    } 
    else if (user.subRole === 'permanent') {
      booking.paymentType = 'pay_now';
      booking.totalPrice = currentMealPrice; 
      finalAmountPaid = currentMealPrice;
    } 
    else if (user.subRole === 'casual' || user.subRole === 'manpower') {
      booking.paymentType = paymentType;
      booking.totalPrice = currentMealPrice; 
      
      if (paymentType === 'pay_later') {
        finalAmountPaid = amountPaid || 0;
        balance = currentMealPrice - finalAmountPaid;
      } else {
        finalAmountPaid = currentMealPrice;
      }
    }

    booking.amountPaid = finalAmountPaid;
    booking.balance = balance;
    // ❌ REMOVED: booking.status = 'served'; (Wait for Canteen Issue)
    
    await booking.save();

    // 3. Notify Canteen
    io.to('canteen_room').emit('payment_confirmed', {
      bookingId: booking._id,
      employeeName: `${user.firstName} ${user.lastName}`,
      mealType: booking.mealType,
      paymentType: booking.paymentType,
      totalPrice: booking.totalPrice,
      amountPaid: booking.amountPaid,
      balance: booking.balance
    });

    res.status(200).json({ 
      success: true, 
      message: "Payment processed. Waiting for canteen to issue meal.",
      details: {
        total: booking.totalPrice,
        paid: booking.amountPaid,
        balance: booking.balance
      }
    });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


export const getPaymentStatus = async (req: any, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.params;

    const booking = await MealBooking.findById(bookingId)
      .populate('userId', 'firstName lastName subRole mobileNumber');

    if (!booking) {
      res.status(404).json({ success: false, message: "Booking not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        employeeName: `${(booking.userId as any).firstName} ${(booking.userId as any).lastName}`,
        subRole: (booking.userId as any).subRole,
        paymentType: booking.paymentType, // 'pay_now', 'pay_later', 'free'
        totalPrice: booking.totalPrice,
        amountPaid: booking.amountPaid,
        balance: booking.balance,
        status: booking.status
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const issueMeal = async (req: any, res: Response, io: any): Promise<void> => {
  try {
    const { bookingId } = req.body;

    const booking = await MealBooking.findById(bookingId);
    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    // ✅ THIS IS WHERE WE MARK IT COMPLETE
    booking.status = 'served'; 
    
    await booking.save();

    // Notify employee
    io.to(booking.userId.toString()).emit('meal_issued', { 
      message: "Your meal has been issued. Enjoy!" 
    });

    res.status(200).json({ success: true, message: "Meal issued successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const rejectIssue = async (req: any, res: Response, io: any): Promise<void> => {
  try {
    const { bookingId } = req.body;
    const booking = await MealBooking.findById(bookingId);
    
    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    // Reset fields to allow re-requesting
    booking.status = 'booked';
    booking.otp = undefined;
    booking.verifiedAt = undefined;
    booking.paymentType = undefined;
    booking.totalPrice = 0;
    booking.amountPaid = 0;
    booking.balance = 0;

    await booking.save();

    // Notify employee that issue was rejected (Reset UI)
    io.to(booking.userId.toString()).emit('meal_issue_rejected', { 
      message: "Meal issue rejected by canteen. You can request again." 
    });

    res.status(200).json({ success: true, message: "Meal issue rejected. Reset to booked." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}

export const getUpcomingBookings = async (req: any, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    
    // Get range: Today to Today + 7 days
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    const nextWeek = new Date(today);
    nextWeek.setUTCDate(today.getUTCDate() + 7);

    const bookings = await MealBooking.find({
      userId,
      date: { $gte: today, $lte: nextWeek }
    }).select('date mealType status');

    res.status(200).json({ 
      success: true, 
      data: bookings 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const cancelMeal = async (req: any, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.body;
    const userId = req.user.id;

    const booking = await MealBooking.findOne({ _id: bookingId, userId });

    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    // --- TIME VALIDATION LOGIC ---
    // Rule: Cancel allowed only before "Previous Day" at specific times.
    
    // 1. Get the Meal Date
    const mealDate = new Date(booking.date);
    
    // 2. Set Base Deadline: Previous Day (Day - 1)
    const deadline = new Date(mealDate);
    deadline.setUTCDate(mealDate.getUTCDate() - 1); 

    // 3. Set Specific Deadline Time based on Meal Type (UTC Conversion)
    // SL Time is UTC + 5:30
    if (booking.mealType === 'breakfast') {
      // 10:00 AM SL = 04:30 AM UTC
      deadline.setUTCHours(4, 30, 0, 0); 
    } 
    else if (booking.mealType === 'lunch') {
      // 02:00 PM SL (14:00) = 08:30 AM UTC
      deadline.setUTCHours(8, 30, 0, 0);
    } 
    else if (booking.mealType === 'dinner') {
      // 06:00 PM SL (18:00) = 12:30 PM UTC
      deadline.setUTCHours(12, 30, 0, 0);
    }

    // 4. Compare with Current Server Time (UTC)
    const now = new Date();

    if (now > deadline) {
      res.status(400).json({ 
        message: `Cancellation Failed. ${booking.mealType} must be cancelled before the previous day's cutoff.` 
      });
      return;
    }

    // --- PROCEED TO CANCEL ---
    await MealBooking.deleteOne({ _id: bookingId });

    res.status(200).json({ 
      success: true, 
      message: "Meal cancelled successfully." 
    });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};