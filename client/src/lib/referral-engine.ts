export function generateReferralCode(uid: string): string {
  return 'VOLT-' + uid.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
}

export function buildReferralLink(referralCode: string): string {
  return `${window.location.origin}/?ref=${referralCode}`;
}

export async function shareReferralLink(referralCode: string): Promise<'shared' | 'copied'> {
  const link = buildReferralLink(referralCode);
  const text = `Join me on EVPlugFinder! Use my code ${referralCode} to get started. ${link}`;
  
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Join EVPlugFinder', text });
      return 'shared';
    } catch (e) {
      // User might have cancelled the share, or it failed.
      // Fallback to copy just in case, or we could just ignore.
    }
  }
  
  await navigator.clipboard.writeText(text);
  return 'copied';
}
