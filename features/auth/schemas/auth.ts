// features/auth/schemas/auth.ts
import * as z from 'zod';

export const loginSchema = z.object({
    email: z.email().min(1, {message: 'Email is required'}),
    password: z.string().min(1, {message: 'Password is required'}),
    code: z.string().optional(),
});

export const resetSchema = z.object({
    email: z.email().min(1, {message: 'Email is required'}),
});

export const registerSchema = z
    .object({
        email: z.email().min(1, {message: 'Email is required'}),
        password: z
            .string()
            .min(8, {message: 'Password must be at least 8 characters long'})
            .regex(/[A-Z]/, {
                message: 'Password must contain at least one uppercase letter',
            })
            .regex(/[a-z]/, {
                message: 'Password must contain at least one lowercase letter',
            })
            .regex(/[0-9]/, {message: 'Password must contain at least one number'})
            .regex(/[^A-Za-z0-9]/, {
                message: 'Password must contain at least one special character',
            }),
        confirmPassword: z.string().min(1, {message: 'Please confirm your password'}),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords don't match",
        path: ['confirmPassword'],
    });

export const newPasswordSchema = z
    .object({
        password: z
            .string()
            .min(8, {message: 'Password must be at least 8 characters long'})
            .regex(/[A-Z]/, {
                message: 'Password must contain at least one uppercase letter',
            })
            .regex(/[a-z]/, {
                message: 'Password must contain at least one lowercase letter',
            })
            .regex(/[0-9]/, {message: 'Password must contain at least one number'})
            .regex(/[^A-Za-z0-9]/, {
                message: 'Password must contain at least one special character',
            }),
        confirmPassword: z.string().min(1, {message: 'Please confirm your password'}),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords don't match",
        path: ['confirmPassword'],
    });

export const settingsSchema = z.object({
    name: z.string().optional(),
});
