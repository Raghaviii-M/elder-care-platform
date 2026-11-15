const { z } = require('zod');

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');

const medSchema = z.object({
  name: z.string().trim().min(1).max(100),
  dosage: z.string().trim().max(50),
  times: z
    .array(timeStr)
    .min(1)
    .max(8)
    .transform((a) => [...new Set(a)].sort()),
  instructions: z.string().trim().max(300).optional(),
  startDate: dateStr,
  endDate: dateStr.optional(),
});

const appointmentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  doctor: z.string().trim().max(100).optional(),
  location: z.string().trim().max(200).optional(),
  date: dateStr,
  time: timeStr,
  notes: z.string().trim().max(300).optional(),
});

const doseSchema = z.object({
  medicationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  time: timeStr,
  date: dateStr.optional(),
});

module.exports = { medSchema, appointmentSchema, doseSchema, dateStr, timeStr };