// List of disposable/temporary email domains to block
const disposableEmailDomains = [
  // Popular temporary email services
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'temp-mail.org',
  'throwaway.email', 'maildrop.cc', 'tempmail.com', 'getnada.com',
  'fakeinbox.com', 'sharklasers.com', 'yopmail.com', 'mintemail.com',
  'trashmail.com', 'trash-mail.com', 'dispostable.com', 'mailnesia.com',
  'tempinbox.com', 'mohmal.com', 'spamgourmet.com', 'mytemp.email',
  'emailondeck.com', 'tempr.email', 'mailexpire.com', 'guerrillamailblock.com',
  
  // More disposable domains
  'fakemailgenerator.com', 'throwawaymail.com', 'tempail.com', 'disposablemail.com',
  'mailcatch.com', 'mailsac.com', 'trbvm.com', 'spam4.me',
  'mailtothis.com', 'boun.cr', 'spamex.com', 'incognitomail.org',
  'anonymbox.com', 'mailforspam.com', 'emailtemporanea.com', 'emailondeck.com',
  
  // Additional common ones
  'mailtemp.net', 'tmails.net', 'tempsky.com', 'inboxkitten.com',
  'emailfake.com', 'tempmailaddress.com', 'mailmoat.com', 'spambox.us',
  'spambox.info', 'mailscrap.com', 'mailpoof.com', 'burnermail.io',
  
  // Recently popular
  'temp-mail.io', 'temporary-mail.net', 'disposable-email.ml', 'fakemail.net',
  'tempinbox.xyz', 'emailtemporal.org', 'mohmal.im', 'crazymailing.com',
  'mailzi.ru', 'turoid.com', 'eelmail.com', 'mailseal.de',
  
  // Additional variations
  'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz', 'guerrillamail.de',
  'sharklasers.com', 'spam4.me', 'grr.la', 'guerrillamail.info',
  'pokemail.net', 'spam.la', 'trbvm.com', 'mailhazard.com',
  
  // More to block
  'emailondeck.com', 'spamfree24.org', 'spamfree24.de', 'spamfree24.eu',
  'spamfree.eu', 'kasmail.com', 'tradermail.info', 'vkcode.ru',
  'mailhub.com', 'onewaymail.com', 'deadaddress.com', 'mytrashmail.com',
  'spamhole.com', 'safersignup.de', 'no-spam.ws', 'jetable.org',
  
  // TempMail variations
  'tempmail.io', 'tempmail.net', 'tempmail.org', 'tempmail.co',
  'temp-mail.org', 'temp-mail.io', 'temp-mail.net', '10minutemail.net',
  '20minutemail.com', '30minutemail.com', 'email-temp.com', 'email-fake.com',
  
  // Others
  'throwam.com', 'putthisinyourspamdatabase.com', 'spamthisplease.com',
  'sendspamhere.com', 'chogmail.com', 'drdrb.net', 'mail-temporaire.fr',
  'yuurok.com', 'spamthis.co.uk', 'brefmail.com', 'hatespam.org'
];

/**
 * Validates if an email is from a legitimate domain (not disposable/temporary)
 * @param {string} email - The email address to validate
 * @returns {Object} { isValid: boolean, error: string | null }
 */
export function validateEmail(email) {
  if (!email) {
    return { isValid: false, error: 'Email is required' };
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Invalid email format' };
  }

  // Extract domain from email
  const domain = email.toLowerCase().split('@')[1];

  // Check if domain is in the disposable list
  if (disposableEmailDomains.includes(domain)) {
    return { 
      isValid: false, 
      error: 'Disposable email addresses are not allowed. Please use a legitimate email address.' 
    };
  }

  // Additional checks for suspicious patterns
  // Block emails with multiple dots before @ (often used by spammers)
  const localPart = email.split('@')[0];
  if ((localPart.match(/\./g) || []).length > 3) {
    return { 
      isValid: false, 
      error: 'This email format is not allowed. Please use a legitimate email address.' 
    };
  }

  // Block very short domains (less than 4 chars, e.g., xx.xx)
  if (domain.length < 6) {
    return { 
      isValid: false, 
      error: 'Please use an email from a legitimate domain.' 
    };
  }

  return { isValid: true, error: null };
}

/**
 * Check if email is from a well-known legitimate provider
 * @param {string} email - The email address to check
 * @returns {boolean} true if from a known legitimate provider
 */
export function isFromLegitimateProvider(email) {
  const legitimateDomains = [
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
    'protonmail.com', 'mail.com', 'aol.com', 'zoho.com', 'gmx.com',
    'live.com', 'msn.com', 'yandex.com', 'fastmail.com', 'tutanota.com'
  ];

  const domain = email.toLowerCase().split('@')[1];
  return legitimateDomains.includes(domain);
}

/**
 * Validates if a Google account email is legitimate
 * This runs after successful Google Sign-In
 * @param {string} email - The Google account email
 * @returns {Object} { isValid: boolean, error: string | null }
 */
export function validateGoogleEmail(email) {
  // Google accounts are pre-verified by Google
  // But we still check for disposable domains in case someone
  // created a Google account with a forwarding address
  
  const validation = validateEmail(email);
  
  if (!validation.isValid) {
    return validation;
  }

  // Additional check: Google emails should be gmail.com or a custom domain
  // If it's a custom domain, we accept it as Google has verified it
  const domain = email.toLowerCase().split('@')[1];
  
  // Check if it's a known disposable domain
  if (disposableEmailDomains.includes(domain)) {
    return {
      isValid: false,
      error: 'This email address is not allowed. Please sign in with a legitimate Google account.'
    };
  }

  return { isValid: true, error: null };
}

export default validateEmail;

