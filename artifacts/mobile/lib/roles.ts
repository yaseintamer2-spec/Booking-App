type VerifiedEmailAddress = {
  emailAddress: string;
  verification?: { status: string | null } | null;
};

export const OWNER_EMAIL = 'yaseintamer2@gmail.com';

export function hasVerifiedOwnerEmail(addresses?: readonly VerifiedEmailAddress[] | null) {
  return Boolean(addresses?.some((address) =>
    address.verification?.status === 'verified' &&
    address.emailAddress.trim().toLowerCase() === OWNER_EMAIL,
  ));
}
