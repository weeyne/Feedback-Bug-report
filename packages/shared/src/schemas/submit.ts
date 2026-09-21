import { z } from 'zod';
import {
  EMAIL_MAX_LENGTH,
  FEEDBACK_TYPES,
  MESSAGE_MAX_LENGTH,
  PUBLIC_KEY_PATTERN,
} from '../constants';
import { ClientMetadataSchema } from './metadata';

/** JSON sent in the `payload` field of `POST /api/v1/widget/submit`. */
export const SubmitPayloadSchema = z.object({
  projectKey: z.string().regex(PUBLIC_KEY_PATTERN),
  type: z.enum(FEEDBACK_TYPES),
  message: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
  email: z
    .union([z.email().max(EMAIL_MAX_LENGTH), z.literal('').transform(() => undefined)])
    .optional(),
  metadata: ClientMetadataSchema,
  /** Epoch ms when the modal was opened; submissions faster than 2s are treated as bots. */
  openedAt: z.number().int().positive(),
  /** Honeypot: real users never fill it. */
  website: z.string().max(200).default(''),
});
export type SubmitPayload = z.infer<typeof SubmitPayloadSchema>;
