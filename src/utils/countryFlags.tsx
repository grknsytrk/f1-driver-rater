import * as Flags from 'country-flag-icons/react/3x2';
import { COUNTRY_CODES, COUNTRY_CODE_ALIASES } from './countryCodes';

interface CountryFlagProps {
    country: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}

export function CountryFlag({ country, className = '', size = 'md' }: CountryFlagProps) {
    const normalizedInput = country.trim();
    const isCountryCode = normalizedInput.length === 2 && normalizedInput === normalizedInput.toUpperCase();

    let countryCode: keyof typeof Flags | undefined;
    if (isCountryCode) {
        countryCode = COUNTRY_CODE_ALIASES[normalizedInput] ?? (normalizedInput as keyof typeof Flags);
    } else {
        countryCode = COUNTRY_CODES[normalizedInput];
    }

    const sizeClasses = {
        sm: 'w-5 h-3.5',
        md: 'w-8 h-6',
        lg: 'w-10 h-7',
    };

    if (!countryCode) {
        return (
            <div className={`${sizeClasses[size]} bg-[var(--bg-darker)] border border-[var(--border-color)] flex items-center justify-center ${className}`}>
                <span className="text-[8px] text-[var(--text-muted)]">?</span>
            </div>
        );
    }

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
