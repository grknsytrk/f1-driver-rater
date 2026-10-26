import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    COUNTRY_CODES,
    COUNTRY_CODE_ALIASES,
    FLAG_COMPONENTS,
    NATIONALITY_CODES,
    getFlagComponent,
} from './countryCodes';
import { CountryFlag } from './countryFlags';
import { getCountryCode } from './storage';
import { PodiumFlagBackdrop } from '../components/PodiumFlagBackdrop';

const SAMPLE_RACE_NAMES = [
    'Bahrain Grand Prix',
    'Saudi Arabian Grand Prix',
    'Australian Grand Prix',
    'Japanese Grand Prix',
    'Chinese Grand Prix',
    'Miami Grand Prix',
    'Emilia Romagna Grand Prix',
    'Monaco Grand Prix',
    'Canadian Grand Prix',
    'Spanish Grand Prix',
    'Barcelona Grand Prix',
    'Austrian Grand Prix',
    'British Grand Prix',
    'Hungarian Grand Prix',
    'Belgian Grand Prix',
    'Dutch Grand Prix',
    'Italian Grand Prix',
    'Azerbaijan Grand Prix',
    'Singapore Grand Prix',
    'United States Grand Prix',
    'Mexico City Grand Prix',
    'São Paulo Grand Prix',
    'Las Vegas Grand Prix',
    'Qatar Grand Prix',
    'Abu Dhabi Grand Prix',
];

describe('countryCodes and flag tree-shaking integrity', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    it('maps every COUNTRY_CODES and COUNTRY_CODE_ALIASES entry to a valid SVG flag component', () => {
        for (const [country, code] of Object.entries(COUNTRY_CODES)) {
            expect(getFlagComponent(code), `Missing flag component for country "${country}" (${code})`).toBeDefined();
            act(() => {
                root.render(<CountryFlag country={country} />);
            });
            expect(container.querySelector('svg'), `Expected <svg> for country "${country}"`).not.toBeNull();
        }

        for (const [alias, code] of Object.entries(COUNTRY_CODE_ALIASES)) {
            expect(getFlagComponent(code), `Missing flag component for alias "${alias}" (${code})`).toBeDefined();
            act(() => {
                root.render(<CountryFlag country={alias} />);
            });
            expect(container.querySelector('svg'), `Expected <svg> for alias "${alias}"`).not.toBeNull();
        }
    });

    it('maps every getCountryCode race name to a supported 2-letter flag component', () => {
        for (const raceName of SAMPLE_RACE_NAMES) {
            const code = getCountryCode(raceName);
            expect(code).not.toBe('XX');
            expect(getFlagComponent(code), `Missing flag component for race "${raceName}" (${code})`).toBeDefined();
            act(() => {
                root.render(<CountryFlag country={code} size="sm" />);
            });
            expect(container.querySelector('svg'), `Expected <svg> for race "${raceName}" (${code})`).not.toBeNull();
        }
    });

    it('maps every NATIONALITY_CODES entry to a valid SVG flag component for PodiumFlagBackdrop', () => {
        for (const [nationality, code] of Object.entries(NATIONALITY_CODES)) {
            expect(FLAG_COMPONENTS[code], `Missing flag component for nationality "${nationality}" (${code})`).toBeDefined();
            act(() => {
                root.render(<PodiumFlagBackdrop nationality={nationality} />);
            });
            const backdrop = container.querySelector('.podium-flag');
            expect(backdrop?.getAttribute('data-country')).toBe(code);
            expect(backdrop?.querySelector('svg')).not.toBeNull();
        }
    });
});
