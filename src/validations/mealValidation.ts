import { z } from 'zod';
import { MealType } from '../models/MealBooking';

export const mealBookingSchema = z.object({
  // Expecting an array of bookings to match your UI (multi-select)
  bookings: z.array(z.object({
    date: z.string().datetime(), // Expects ISO String
    mealType: z.nativeEnum(MealType)
  })).min(1)
});