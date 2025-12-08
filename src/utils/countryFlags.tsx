import * as Flags from 'country-flag-icons/react/3x2';

// F1 Race locations to ISO 3166-1 alpha-2 country codes
export const COUNTRY_CODES: Record<string, keyof typeof Flags> = {
    // Current F1 Calendar Countries
    'Bahrain': 'BH',
    'Saudi Arabia': 'SA',
    'Australia': 'AU',
    'Japan': 'JP',
    'China': 'CN',
    'USA': 'US',
    'Italy': 'IT',
    'Monaco': 'MC',
    'Canada': 'CA',
    'Spain': 'ES',
    'Austria': 'AT',
    'UK': 'GB',
    'Hungary': 'HU',
    'Belgium': 'BE',
    'Netherlands': 'NL',
    'Azerbaijan': 'AZ',
    'Singapore': 'SG',
    'Mexico': 'MX',
    'Brazil': 'BR',
    'Qatar': 'QA',
    'UAE': 'AE',
    // City-based races (use country code)
    'Las Vegas': 'US',
    'Miami': 'US',
    // Historical races
    'France': 'FR',
    'Germany': 'DE',
    'Russia': 'RU',
    'Portugal': 'PT',
    'Turkey': 'TR',
    'South Africa': 'ZA',
    'India': 'IN',
    'Korea': 'KR',
    'Malaysia': 'MY',
};

interface CountryFlagProps {
    country: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}

export function CountryFlag({ country, className = '', size = 'md' }: CountryFlagProps) {
    const countryCode = COUNTRY_CODES[country];

    const sizeClasses = {
        sm: 'w-5 h-3.5',
        md: 'w-8 h-6',
        lg: 'w-10 h-7',
    };

    if (!countryCode) {
        // Fallback for unknown countries
        return (
            <div className={`${sizeClasses[size]} bg-[var(--bg-darker)] border border-[var(--border-color)] flex items-center justify-center ${className}`}>
                <span className="text-[8px] text-[var(--text-muted)]">?</span>
            </div>
        );
    }

    // Get the flag component dynamically
    const FlagComponent = Flags[countryCode];

    if (!FlagComponent) {
        return (
            <div className={`${sizeClasses[size]} bg-[var(--bg-darker)] border border-[var(--border-color)] flex items-center justify-center ${className}`}>
                <span className="text-[8px] text-[var(--text-muted)]">{countryCode}</span>
            </div>
        );
    }

    return (
        <div className={`${sizeClasses[size]} overflow-hidden rounded-sm shadow-md border border-white/10 flex-shrink-0 ${className}`}>
            <FlagComponent
                title={country}
                className="w-full h-full object-cover"
            />
        </div>
    );
}
