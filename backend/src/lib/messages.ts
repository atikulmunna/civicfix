/**
 * Resident-facing messages the API sends (F5): each one has a stable key
 * beside its English text, so the web app can word it in the reader's
 * language. The English here is exactly what the API has always sent.
 *
 * Placeholders use ICU syntax (`{name}` or `{name, number}`), the same as the
 * web app's catalogs, so a catalog's English can be compared with this file.
 * Admin-only errors keep plain English text and no key.
 */

export const MESSAGES = {
  'common.notFound': 'Not found.',
  'common.authRequired': 'Authentication required.',
  'common.tokenInvalid': 'Invalid or expired access token.',
  'common.forbidden': 'You do not have permission to perform this action.',
  'common.duplicate': 'This resource already exists.',
  'common.missingReference': 'A referenced resource does not exist.',
  'common.invalidId': 'Invalid identifier.',
  'common.invalidRequest': 'Invalid request data.',
  'common.rateLimited': 'Too many requests. Please try again later.',
  'common.internal': 'Internal server error.',
  'common.unavailable': 'Database unavailable.',
  'upload.type': 'Only JPEG, PNG, or WebP images are allowed.',
  'upload.unreadable': 'The image could not be read. Please upload a valid photo.',
  'upload.tooManyPixels': 'Image dimensions are too large (max {megapixels, number} megapixels).',
  'upload.tooLarge': 'Each image must be at most {bytes, number} bytes.',
  'auth.emailTaken': 'An account with this email already exists.',
  'auth.badCredentials': 'Invalid email or password.',
  'auth.deactivated': 'This account has been deactivated.',
  'auth.signInAgain': 'Please sign in again.',
  'auth.wrongCurrentPassword': 'Your current password is incorrect.',
  'auth.samePassword': 'Choose a password different from your current one.',
  'auth.sessionInvalid': 'Invalid or expired session. Please log in again.',
  'auth.noRefreshToken': 'No refresh token provided.',
  'auth.userNotFound': 'User not found.',
  'auth.passwordTooShort': 'Password must be at least {min, number} characters.',
  'auth.passwordCommon': 'Password is too common; choose a stronger one.',
  'report.imageRequired': 'At least one image is required.',
  'report.categoryMissing': 'The selected category does not exist.',
  'report.notFound': 'Report not found.',
  'report.notOwner': 'You can only modify your own reports.',
  'report.locked': 'A report can only be edited or deleted while it is still under submission.',
  'comment.empty': 'Comment cannot be empty.',
  'comment.notFound': 'Comment not found.',
  'comment.notOwner': 'You can only delete your own comments.',
  'fixCheck.photoRequired': 'Add a photo of how it looks now.',
  'fixCheck.notResolved': 'Only a resolved report has a fix to check.',
  'fixCheck.notResident':
    'Fixes are checked by residents, not by admins or the department that made them.',
  'fixCheck.already': 'You have already checked this fix.',
  'notification.notFound': 'Notification not found.',
  'field.nameRequired': 'Name is required.',
  'field.email': 'A valid email is required.',
  'field.category': 'A valid category is required.',
  'field.passwordRequired': 'Password is required.',
  'field.currentPasswordRequired': 'Current password is required.',
  'field.newPasswordRequired': 'New password is required.',
  'field.titleTooShort': 'Title must be at least {min, number} characters.',
  'field.descriptionTooShort': 'Description must be at least {min, number} characters.',
  'field.noChanges': 'No fields to update.',
} as const;

export type MessageKey = keyof typeof MESSAGES;

/**
 * Every key, for the contract's enum. Object.keys loses the literal types,
 * but MESSAGES is the only source of these keys, so the cast is exact.
 */
export const MESSAGE_KEYS = Object.keys(MESSAGES) as [MessageKey, ...MessageKey[]];

export type MessageParams = Record<string, string | number>;

/** A message ready to send: its key, its values, and its English text. */
export interface ServerMessage {
  key: MessageKey;
  params?: MessageParams;
  text: string;
}

const PLACEHOLDER = /\{(\w+)(?:, number)?\}/g;

/** Messages by their English text, so a Zod issue's message finds its key again. */
const byText = new Map<string, ServerMessage>();
for (const key of MESSAGE_KEYS) {
  const text = MESSAGES[key];
  if (!text.includes('{')) byText.set(text, { key, text });
}

/** The message for `key`, its placeholders filled from `params`. */
export function message(key: MessageKey, params?: MessageParams): ServerMessage {
  const text = MESSAGES[key].replace(PLACEHOLDER, (whole, name: string) => {
    const value = params?.[name];
    return value === undefined ? whole : String(value);
  });
  const found: ServerMessage = params ? { key, params, text } : { key, text };
  if (!byText.has(text)) byText.set(text, found);
  return found;
}

/** The English text of a message, for a Zod schema's error; parseInput keys it again. */
export function zodMessage(key: MessageKey, params?: MessageParams): string {
  return message(key, params).text;
}

/** The message whose English is exactly `text`, if the API knows it. */
export function keyOf(text: string): ServerMessage | undefined {
  return byText.get(text);
}
