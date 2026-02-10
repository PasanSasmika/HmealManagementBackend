import { Request, Response } from 'express';
import MealBooking, { MealType } from '../models/MealBooking';
import { mealBookingSchema } from '../validations/mealValidation';
import User from '@/models/User';
import MealPrice from '@/models/MealPrice';
import AuditLog from '@/models/AuditLog';

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
      } /////////////////////////////////////////////////////////////////////////////////////////////// Uncomment last

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
      lunch: { start: 12, end: 16 },
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
      await booking.save();

      io.to(booking.userId.toString()).emit('meal_accepted', { otp , bookingId: booking._id });
    } else {
      booking.status = 'rejected';
      await booking.save();
      io.to(booking.userId.toString()).emit('meal_rejected', { message: "Request denied." });
    }

    // ✅ FIX: Tell ALL Canteen devices to remove this request
    io.to('canteen_room').emit('remove_from_requests', { bookingId });

    res.status(200).json({ success: true });
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
    if (!booking) { res.status(404).json({ message: "Booking not found" }); return; }

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
        // If coming from Web Kiosk "Pay Now", this might be 0. 
        // We trust the Canteen to enter the real physical cash in `issueMeal` later.
        finalAmountPaid = amountPaid !== undefined ? amountPaid : currentMealPrice; 
      }
    }

    booking.amountPaid = finalAmountPaid;
    booking.balance = balance;
    await booking.save();

    // ✅ Notify Canteen with Loan Amount
    io.to('canteen_room').emit('payment_confirmed', {
      bookingId: booking._id,
      employeeName: `${user.firstName} ${user.lastName}`,
      mealType: booking.mealType,
      paymentType: booking.paymentType,
      totalPrice: booking.totalPrice,
      amountPaid: booking.amountPaid,
      balance: booking.balance,
      loanAmount: user.loanAmount // <--- ADDED: Canteen needs this for Pay Now excess logic
    });

    res.status(200).json({ 
      success: true, 
      message: "Payment processed. Waiting for canteen to issue meal.",
      details: { total: booking.totalPrice, paid: booking.amountPaid, balance: booking.balance }
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
    const { bookingId, collectedAmount, settleLoan } = req.body; 
    
    const booking = await MealBooking.findById(bookingId);
    if (!booking) { 
        res.status(404).json({ message: "Booking not found" }); 
        return; 
    }

    const shouldSettle = settleLoan === true || String(settleLoan) === 'true';

    if (collectedAmount !== undefined && collectedAmount !== null) {
        const amount = parseFloat(collectedAmount);
        const totalPrice = booking.totalPrice || 0;
        
        booking.amountPaid = amount;
        
        // --- EXCESS & LOAN LOGIC ---
        if (amount >= totalPrice) {
            booking.balance = 0; // Current meal is fully paid
            
            // Calculate Excess Cash
            let excess = amount - totalPrice;

            if (excess > 0 && shouldSettle) {
                // ✅ 1. Find all OLD unpaid bookings (Waterfall)
                const unpaidBookings = await MealBooking.find({
                    userId: booking.userId,
                    balance: { $gt: 0 },
                    _id: { $ne: booking._id } // Exclude current booking
                }).sort({ date: 1 }); // Oldest first

                let totalDeducted = 0;

                // ✅ 2. Loop and Pay Off Old Debts
                for (const pastBooking of unpaidBookings) {
                    if (excess <= 0) break;

                    const debt = pastBooking.balance || 0;
                    let payment = 0;

                    if (excess >= debt) {
                        // Pay off fully
                        payment = debt;
                        pastBooking.balance = 0;
                        pastBooking.amountPaid = (pastBooking.amountPaid || 0) + payment;
                    } else {
                        // Pay off partially
                        payment = excess;
                        pastBooking.balance = debt - excess;
                        pastBooking.amountPaid = (pastBooking.amountPaid || 0) + payment;
                    }

                    excess -= payment;
                    totalDeducted += payment;
                    await pastBooking.save();
                }

                // ✅ 3. Update User & Audit Log
                if (totalDeducted > 0) {
                    const user = await User.findById(booking.userId);
                    if (user) {
                        const oldLoan = user.loanAmount;
                        user.loanAmount -= totalDeducted;
                        if(user.loanAmount < 0) user.loanAmount = 0; // Safety check
                        await user.save();

                        await AuditLog.create({
                            action: "LOAN_REPAYMENT",
                            performedBy: req.user?.id || booking.userId,
                            targetUser: booking.userId,
                            details: `Meal Excess Repayment. Paid: ${amount}, Meal: ${totalPrice}, Total Deducted: ${totalDeducted}`,
                            metadata: { previousLoan: oldLoan, newLoan: user.loanAmount }
                        });
                    }
                }
            }

        } else {
            // Partial payment for THIS meal (User paid less than price)
            booking.balance = totalPrice - amount;
            
            // If they created NEW debt, update User loan immediately
            // (Optional, but keeps sync faster)
            await User.findByIdAndUpdate(booking.userId, { 
                $inc: { loanAmount: booking.balance } 
            });
        }
    }

    // 4. Mark Served
    booking.status = 'served'; 
    await booking.save();

    // 5. Notifications
    io.to(booking.userId.toString()).emit('meal_issued', { message: "Enjoy your meal!" });
    io.to('canteen_room').emit('remove_from_queue', { bookingId });

    // Force Wallet Refresh on Mobile
    io.to(booking.userId.toString()).emit('wallet_updated');

    res.status(200).json({ success: true, message: "Meal issued." });

  } catch (error: any) {
    console.error("Issue Meal Error:", error);
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

    booking.status = 'booked';
    // ... reset other fields ...
    await booking.save();

    io.to(booking.userId.toString()).emit('meal_issue_rejected', { message: "Issue rejected." });

    // ✅ FIX: Tell ALL Canteen devices to remove this from the Queue
    io.to('canteen_room').emit('remove_from_queue', { bookingId });

    res.status(200).json({ success: true });
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




export const adminGetEmployeeBookings = async (req: any, res: Response): Promise<void> => {
  try {
    const { userId } = req.params; // Target Employee ID
    
    // Fetch future & recent past bookings (e.g., last 7 days + future)
    const today = new Date();
    const pastDate = new Date(today);
    pastDate.setDate(today.getDate() - 7);

    const bookings = await MealBooking.find({
      userId: userId,
      date: { $gte: pastDate }
    }).sort({ date: 1 });

    res.status(200).json({ success: true, data: bookings });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ NEW: Admin/HR/Canteen books for an employee (No Time Lock Restrictions)
export const adminBookMeal = async (req: any, res: Response): Promise<void> => {
  try {
    const { userId, date, mealType } = req.body; // date format: "YYYY-MM-DD" or ISO
    const adminId = req.user.id; 

    // 1. Basic Validation
    if (!userId || !date || !mealType) {
      res.status(400).json({ message: "User ID, Date, and Meal Type are required." });
      return;
    }

    // 2. FIX: Manual String Parsing to Force Exact Date
    // We assume input 'date' contains "YYYY-MM-DD". We strip everything else.
    // This prevents the server from converting "2026-01-26" to "2026-01-25 19:00 (EST)" etc.
    const dateString = new Date(date).toISOString().split('T')[0]; // Safe normalize to string first
    const [year, month, day] = dateString.split('-').map(Number);

    // Create Date strictly at UTC Midnight (00:00:00Z)
    // Note: Month is 0-indexed in JS (0=Jan, 1=Feb)
    const bookingDate = new Date(Date.UTC(year, month - 1, day));

    // 3. Check for duplicates
    const existing = await MealBooking.findOne({ userId, date: bookingDate, mealType });
    if (existing) {
      res.status(400).json({ message: "Employee already has a booking for this meal." });
      return;
    }

    // 4. Create Booking
    const newBooking = new MealBooking({
      userId,
      date: bookingDate,
      mealType,
      bookedAt: new Date(),
      status: 'booked'
    });

    await newBooking.save();

    await AuditLog.create({
      action: "ADMIN_BOOK_MEAL",
      performedBy: adminId, // The Admin/HR who clicked the button
      targetUser: userId,   // The Employee who got the meal
      details: `Manual booking added for ${date} (${mealType})`,
      metadata: { date, mealType }
    });

    res.status(201).json({ success: true, message: "Meal booked successfully for employee." });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ NEW: Admin/HR/Canteen cancels for an employee (No Time Lock Restrictions)
export const adminCancelMeal = async (req: any, res: Response): Promise<void> => {
  try {
    const { bookingId, reason } = req.body;
    const adminId = req.user.id; // The Admin/Canteen user performing the action

    // 1. Find the booking first (Don't delete yet!)
    const booking = await MealBooking.findById(bookingId);

    if (!booking) {
      res.status(404).json({ message: "Booking not found." });
      return;
    }

    // 2. ✅ SAVE TO AUDIT LOG (Permanent Record)
    await AuditLog.create({
      action: "MEAL_CANCELLED",
      performedBy: adminId as any, 
      targetUser: booking.userId as any, 
      details: reason || "No reason provided", 
      metadata: {
        bookingDate: booking.date,
        mealType: booking.mealType,
        bookedAt: booking.bookedAt
      }
    });

    // 3. Now delete the booking
    await MealBooking.findByIdAndDelete(bookingId);

    res.status(200).json({ success: true, message: "Booking cancelled and reason recorded." });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


export const getMealHistory = async (req: any, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    // Fetch meals that are strictly 'served'
    // Sort by Date descending (Newest first)
    const history = await MealBooking.find({
      userId,
      status: 'served' 
    })
    .select('date mealType paymentType totalPrice amountPaid balance verifiedAt')
    .sort({ date: -1 });

    res.status(200).json({ 
      success: true, 
      data: history 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};