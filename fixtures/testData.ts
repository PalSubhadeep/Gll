/**
 * All test data (accounts, institution names, expected content) is sourced
 * from environment variables so nothing sensitive or environment-specific
 * lives in source control, and so the same spec files can run against
 * different accounts/institutions just by swapping .env values.
 *
 * `required()` fails fast with a clear message at startup if a var is
 * missing, instead of failing deep inside a test with a confusing
 * "cannot read property of undefined".
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. Check your .env file against env.example.txt.`,
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Email-share flow (gll_share_viaMail.spec.ts)
// ---------------------------------------------------------------------------

export const TEST_ACCOUNT = {
  username: required('STUDENT_USERNAME'),
  password: required('STUDENT_PASSWORD'),
};

export const SHARE_RECIPIENT_EMAIL = required('SHARE_RECIPIENT_EMAIL');

export const EXPECTED_EMAIL = {
  studentName: required('EXPECTED_STUDENT_NAME'),
  institution: required('EXPECTED_INSTITUTION_NAME'),
  senderContactEmail: required('EXPECTED_SENDER_CONTACT_EMAIL'),
  subjectContains: 'has shared a transcript with you',
  fromContains: 'noreply@glcredentials.com',
};

// ---------------------------------------------------------------------------
// Institution-share flow (gll_share_viaInstitution.spec.ts)
// ---------------------------------------------------------------------------

export const INSTITUTION_SHARE = {
  senderAccount: {
    username: required('INSTITUTION_SENDER_USERNAME'),
    password: required('INSTITUTION_SENDER_PASSWORD'),
  },
  searchQuery: required('SHARE_INSTITUTION_SEARCH_QUERY'),
  institutionName: required('SHARE_INSTITUTION_NAME'),
  // Truncated username as it appears on the account menu button
  accountMenuLabel: required('INSTITUTION_SENDER_MENU_LABEL'),
};

export const INSTITUTION_RECIPIENT_ACCOUNT = {
  username: required('INSTITUTION_RECIPIENT_USERNAME'),
  password: required('INSTITUTION_RECIPIENT_PASSWORD'),
};

export const EXPECTED_ACKNOWLEDGED_CREDENTIAL = {
  studentName: required('EXPECTED_ACKNOWLEDGED_STUDENT_NAME'),
  senderEmail: required('EXPECTED_ACKNOWLEDGED_SENDER_EMAIL'),
};

// ---------------------------------------------------------------------------
// Scheduled-share flow (gll_scheduledShare.spec.ts)
// ---------------------------------------------------------------------------

function optionalInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got: "${value}"`);
  }
  return parsed;
}

export const SCHEDULED_SHARE = {
  senderAccount: {
    username: required('SCHEDULED_SENDER_USERNAME'),
    password: required('SCHEDULED_SENDER_PASSWORD'),
  },
  accountMenuLabel: required('SCHEDULED_SENDER_MENU_LABEL'),
  searchQuery: required('SCHEDULE_SHARE_INSTITUTION_SEARCH_QUERY'),
  institutionName: required('SCHEDULE_SHARE_INSTITUTION_NAME'),
  // How many minutes from "now" (test run time) to schedule the share for.
  // Dynamic via env instead of a hardcoded constant -- change SCHEDULE_OFFSET_MINUTES
  // in .env to test different delays without touching code.
  offsetMinutes: optionalInt('SCHEDULE_OFFSET_MINUTES', 10),
};

export const EXPECTED_SCHEDULED_CREDENTIAL = {
  studentName: required('EXPECTED_SCHEDULED_STUDENT_NAME'),
  senderEmail: required('EXPECTED_SCHEDULED_SENDER_EMAIL'),
};
