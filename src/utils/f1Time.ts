/** Parses Jolpica/Ergast lap times, elapsed times, and numeric second gaps. */
export function parseF1TimeSeconds(value: string | null | undefined): number | null {
    if (!value) return null;
    const normalized = value.trim().replace(/^\+/, '');
    if (!normalized || !/^[0-9:.]+$/.test(normalized)) return null;

    const parts = normalized.split(':');
    if (parts.length > 3 || parts.some(part => part.length === 0)) return null;
    const secondsPart = Number(parts[parts.length - 1]);
    if (!Number.isFinite(secondsPart) || secondsPart < 0) return null;

    if (parts.length === 1) return secondsPart;

    const wholeParts = parts.slice(0, -1).map(Number);
    if (wholeParts.some(part => !Number.isSafeInteger(part) || part < 0)) return null;

    if (parts.length === 2) {
        if (secondsPart >= 60) return null;
        return wholeParts[0] * 60 + secondsPart;
    }

    if (wholeParts[1] >= 60 || secondsPart >= 60) return null;
    return wholeParts[0] * 3600 + wholeParts[1] * 60 + secondsPart;
}
