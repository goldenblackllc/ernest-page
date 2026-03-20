/**
 * Country dial codes for OTP phone authentication.
 * Used by CountryCodeSelect and timezone-based auto-detection.
 */

export interface CountryCode {
    code: string;   // ISO 3166-1 alpha-2
    dial: string;   // E.164 prefix
    flag: string;   // Emoji flag
    name: string;   // English display name
}

export const COUNTRY_CODES: CountryCode[] = [
    { code: 'US', dial: '+1', flag: '🇺🇸', name: 'United States' },
    { code: 'CA', dial: '+1', flag: '🇨🇦', name: 'Canada' },
    { code: 'GB', dial: '+44', flag: '🇬🇧', name: 'United Kingdom' },
    { code: 'IE', dial: '+353', flag: '🇮🇪', name: 'Ireland' },
    { code: 'AU', dial: '+61', flag: '🇦🇺', name: 'Australia' },
    { code: 'NZ', dial: '+64', flag: '🇳🇿', name: 'New Zealand' },
    // Latin America
    { code: 'MX', dial: '+52', flag: '🇲🇽', name: 'Mexico' },
    { code: 'BR', dial: '+55', flag: '🇧🇷', name: 'Brazil' },
    { code: 'AR', dial: '+54', flag: '🇦🇷', name: 'Argentina' },
    { code: 'CO', dial: '+57', flag: '🇨🇴', name: 'Colombia' },
    { code: 'CL', dial: '+56', flag: '🇨🇱', name: 'Chile' },
    { code: 'PE', dial: '+51', flag: '🇵🇪', name: 'Peru' },
    { code: 'EC', dial: '+593', flag: '🇪🇨', name: 'Ecuador' },
    { code: 'VE', dial: '+58', flag: '🇻🇪', name: 'Venezuela' },
    { code: 'UY', dial: '+598', flag: '🇺🇾', name: 'Uruguay' },
    { code: 'PY', dial: '+595', flag: '🇵🇾', name: 'Paraguay' },
    { code: 'BO', dial: '+591', flag: '🇧🇴', name: 'Bolivia' },
    { code: 'CR', dial: '+506', flag: '🇨🇷', name: 'Costa Rica' },
    { code: 'PA', dial: '+507', flag: '🇵🇦', name: 'Panama' },
    { code: 'DO', dial: '+1', flag: '🇩🇴', name: 'Dominican Republic' },
    { code: 'PR', dial: '+1', flag: '🇵🇷', name: 'Puerto Rico' },
    { code: 'GT', dial: '+502', flag: '🇬🇹', name: 'Guatemala' },
    { code: 'HN', dial: '+504', flag: '🇭🇳', name: 'Honduras' },
    { code: 'SV', dial: '+503', flag: '🇸🇻', name: 'El Salvador' },
    { code: 'NI', dial: '+505', flag: '🇳🇮', name: 'Nicaragua' },
    { code: 'CU', dial: '+53', flag: '🇨🇺', name: 'Cuba' },
    // Europe
    { code: 'DE', dial: '+49', flag: '🇩🇪', name: 'Germany' },
    { code: 'FR', dial: '+33', flag: '🇫🇷', name: 'France' },
    { code: 'ES', dial: '+34', flag: '🇪🇸', name: 'Spain' },
    { code: 'IT', dial: '+39', flag: '🇮🇹', name: 'Italy' },
    { code: 'PT', dial: '+351', flag: '🇵🇹', name: 'Portugal' },
    { code: 'NL', dial: '+31', flag: '🇳🇱', name: 'Netherlands' },
    { code: 'BE', dial: '+32', flag: '🇧🇪', name: 'Belgium' },
    { code: 'CH', dial: '+41', flag: '🇨🇭', name: 'Switzerland' },
    { code: 'AT', dial: '+43', flag: '🇦🇹', name: 'Austria' },
    { code: 'SE', dial: '+46', flag: '🇸🇪', name: 'Sweden' },
    { code: 'NO', dial: '+47', flag: '🇳🇴', name: 'Norway' },
    { code: 'DK', dial: '+45', flag: '🇩🇰', name: 'Denmark' },
    { code: 'FI', dial: '+358', flag: '🇫🇮', name: 'Finland' },
    { code: 'PL', dial: '+48', flag: '🇵🇱', name: 'Poland' },
    { code: 'CZ', dial: '+420', flag: '🇨🇿', name: 'Czechia' },
    { code: 'RO', dial: '+40', flag: '🇷🇴', name: 'Romania' },
    { code: 'HU', dial: '+36', flag: '🇭🇺', name: 'Hungary' },
    { code: 'GR', dial: '+30', flag: '🇬🇷', name: 'Greece' },
    { code: 'HR', dial: '+385', flag: '🇭🇷', name: 'Croatia' },
    { code: 'SK', dial: '+421', flag: '🇸🇰', name: 'Slovakia' },
    { code: 'BG', dial: '+359', flag: '🇧🇬', name: 'Bulgaria' },
    { code: 'RS', dial: '+381', flag: '🇷🇸', name: 'Serbia' },
    { code: 'UA', dial: '+380', flag: '🇺🇦', name: 'Ukraine' },
    { code: 'RU', dial: '+7', flag: '🇷🇺', name: 'Russia' },
    { code: 'TR', dial: '+90', flag: '🇹🇷', name: 'Turkey' },
    // Asia
    { code: 'IN', dial: '+91', flag: '🇮🇳', name: 'India' },
    { code: 'JP', dial: '+81', flag: '🇯🇵', name: 'Japan' },
    { code: 'KR', dial: '+82', flag: '🇰🇷', name: 'South Korea' },
    { code: 'CN', dial: '+86', flag: '🇨🇳', name: 'China' },
    { code: 'HK', dial: '+852', flag: '🇭🇰', name: 'Hong Kong' },
    { code: 'TW', dial: '+886', flag: '🇹🇼', name: 'Taiwan' },
    { code: 'SG', dial: '+65', flag: '🇸🇬', name: 'Singapore' },
    { code: 'MY', dial: '+60', flag: '🇲🇾', name: 'Malaysia' },
    { code: 'TH', dial: '+66', flag: '🇹🇭', name: 'Thailand' },
    { code: 'VN', dial: '+84', flag: '🇻🇳', name: 'Vietnam' },
    { code: 'PH', dial: '+63', flag: '🇵🇭', name: 'Philippines' },
    { code: 'ID', dial: '+62', flag: '🇮🇩', name: 'Indonesia' },
    { code: 'PK', dial: '+92', flag: '🇵🇰', name: 'Pakistan' },
    { code: 'BD', dial: '+880', flag: '🇧🇩', name: 'Bangladesh' },
    { code: 'LK', dial: '+94', flag: '🇱🇰', name: 'Sri Lanka' },
    // Middle East
    { code: 'AE', dial: '+971', flag: '🇦🇪', name: 'UAE' },
    { code: 'SA', dial: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
    { code: 'IL', dial: '+972', flag: '🇮🇱', name: 'Israel' },
    { code: 'QA', dial: '+974', flag: '🇶🇦', name: 'Qatar' },
    { code: 'KW', dial: '+965', flag: '🇰🇼', name: 'Kuwait' },
    { code: 'BH', dial: '+973', flag: '🇧🇭', name: 'Bahrain' },
    { code: 'OM', dial: '+968', flag: '🇴🇲', name: 'Oman' },
    { code: 'JO', dial: '+962', flag: '🇯🇴', name: 'Jordan' },
    { code: 'LB', dial: '+961', flag: '🇱🇧', name: 'Lebanon' },
    // Africa
    { code: 'ZA', dial: '+27', flag: '🇿🇦', name: 'South Africa' },
    { code: 'NG', dial: '+234', flag: '🇳🇬', name: 'Nigeria' },
    { code: 'KE', dial: '+254', flag: '🇰🇪', name: 'Kenya' },
    { code: 'GH', dial: '+233', flag: '🇬🇭', name: 'Ghana' },
    { code: 'EG', dial: '+20', flag: '🇪🇬', name: 'Egypt' },
    { code: 'MA', dial: '+212', flag: '🇲🇦', name: 'Morocco' },
    { code: 'TZ', dial: '+255', flag: '🇹🇿', name: 'Tanzania' },
    { code: 'ET', dial: '+251', flag: '🇪🇹', name: 'Ethiopia' },
    { code: 'UG', dial: '+256', flag: '🇺🇬', name: 'Uganda' },
    { code: 'SN', dial: '+221', flag: '🇸🇳', name: 'Senegal' },
    { code: 'CI', dial: '+225', flag: '🇨🇮', name: "Côte d'Ivoire" },
    { code: 'CM', dial: '+237', flag: '🇨🇲', name: 'Cameroon' },
];

/**
 * Timezone → country code mapping for auto-detection.
 * Falls back to 'US' if timezone not recognized.
 */
export const TIMEZONE_TO_COUNTRY: Record<string, string> = {
    // Americas
    'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
    'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
    'Pacific/Honolulu': 'US', 'America/Detroit': 'US', 'America/Indiana/Indianapolis': 'US',
    'America/Boise': 'US', 'America/Juneau': 'US', 'America/Adak': 'US',
    'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
    'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/St_Johns': 'CA',
    'America/Mexico_City': 'MX', 'America/Cancun': 'MX', 'America/Tijuana': 'MX',
    'America/Monterrey': 'MX', 'America/Merida': 'MX', 'America/Chihuahua': 'MX',
    'America/Sao_Paulo': 'BR', 'America/Fortaleza': 'BR', 'America/Manaus': 'BR',
    'America/Recife': 'BR', 'America/Bahia': 'BR', 'America/Belem': 'BR',
    'America/Argentina/Buenos_Aires': 'AR', 'America/Buenos_Aires': 'AR',
    'America/Bogota': 'CO',
    'America/Lima': 'PE',
    'America/Santiago': 'CL',
    'America/Guayaquil': 'EC',
    'America/Caracas': 'VE',
    'America/Montevideo': 'UY',
    'America/Asuncion': 'PY',
    'America/La_Paz': 'BO',
    'America/Costa_Rica': 'CR',
    'America/Panama': 'PA',
    'America/Santo_Domingo': 'DO',
    'America/Puerto_Rico': 'PR',
    'America/Guatemala': 'GT',
    'America/Tegucigalpa': 'HN',
    'America/El_Salvador': 'SV',
    'America/Managua': 'NI',
    'America/Havana': 'CU',
    // Europe
    'Europe/London': 'GB', 'Europe/Dublin': 'IE',
    'Europe/Berlin': 'DE', 'Europe/Munich': 'DE',
    'Europe/Paris': 'FR',
    'Europe/Madrid': 'ES',
    'Europe/Rome': 'IT',
    'Europe/Lisbon': 'PT',
    'Europe/Amsterdam': 'NL',
    'Europe/Brussels': 'BE',
    'Europe/Zurich': 'CH',
    'Europe/Vienna': 'AT',
    'Europe/Stockholm': 'SE',
    'Europe/Oslo': 'NO',
    'Europe/Copenhagen': 'DK',
    'Europe/Helsinki': 'FI',
    'Europe/Warsaw': 'PL',
    'Europe/Prague': 'CZ',
    'Europe/Bucharest': 'RO',
    'Europe/Budapest': 'HU',
    'Europe/Athens': 'GR',
    'Europe/Zagreb': 'HR',
    'Europe/Bratislava': 'SK',
    'Europe/Sofia': 'BG',
    'Europe/Belgrade': 'RS',
    'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA',
    'Europe/Moscow': 'RU',
    'Europe/Istanbul': 'TR',
    // Asia
    'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Mumbai': 'IN',
    'Asia/Tokyo': 'JP',
    'Asia/Seoul': 'KR',
    'Asia/Shanghai': 'CN', 'Asia/Chongqing': 'CN',
    'Asia/Hong_Kong': 'HK',
    'Asia/Taipei': 'TW',
    'Asia/Singapore': 'SG',
    'Asia/Kuala_Lumpur': 'MY',
    'Asia/Bangkok': 'TH',
    'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN',
    'Asia/Manila': 'PH',
    'Asia/Jakarta': 'ID',
    'Asia/Karachi': 'PK',
    'Asia/Dhaka': 'BD',
    'Asia/Colombo': 'LK',
    // Middle East
    'Asia/Dubai': 'AE',
    'Asia/Riyadh': 'SA',
    'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL',
    'Asia/Qatar': 'QA',
    'Asia/Kuwait': 'KW',
    'Asia/Bahrain': 'BH',
    'Asia/Muscat': 'OM',
    'Asia/Amman': 'JO',
    'Asia/Beirut': 'LB',
    // Oceania
    'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Perth': 'AU',
    'Australia/Brisbane': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Hobart': 'AU',
    'Pacific/Auckland': 'NZ',
    // Africa
    'Africa/Johannesburg': 'ZA',
    'Africa/Lagos': 'NG',
    'Africa/Nairobi': 'KE',
    'Africa/Accra': 'GH',
    'Africa/Cairo': 'EG',
    'Africa/Casablanca': 'MA',
    'Africa/Dar_es_Salaam': 'TZ',
    'Africa/Addis_Ababa': 'ET',
    'Africa/Kampala': 'UG',
    'Africa/Dakar': 'SN',
    'Africa/Abidjan': 'CI',
    'Africa/Douala': 'CM',
};

/**
 * Detect the user's country code from their browser timezone.
 * Returns the ISO country code or 'US' as fallback.
 */
export function detectCountryFromTimezone(): string {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        return TIMEZONE_TO_COUNTRY[tz] || 'US';
    } catch {
        return 'US';
    }
}

/**
 * Get the dial code for a given ISO country code.
 */
export function getDialCodeForCountry(countryCode: string): string {
    const country = COUNTRY_CODES.find(c => c.code === countryCode);
    return country?.dial || '+1';
}
