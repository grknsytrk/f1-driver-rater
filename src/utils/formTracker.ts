import type { DriverFormPoint, DriverFormSeries } from './storage';

const FORM_RACE_LABELS: Record<string, string> = {
    'EMILIA-ROMAGNA': 'IMO',
    ITALY: 'ITA',
    LASVEGAS: 'LV',
    MIAMI: 'MIA',
    'UNITED STATES': 'USA',
};

export type FormChartPoint = DriverFormPoint & {
    roundLabel: string;
    [driverId: string]: string | number | null;
};

function getFormRaceLabel(point: DriverFormPoint): string {
    const normalizedName = point.raceName
        .replace(/ Grand Prix| GP/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    const compactName = normalizedName.replace(/[^A-Z0-9]/g, '');

    return FORM_RACE_LABELS[normalizedName]
        ?? FORM_RACE_LABELS[compactName]
        ?? (point.countryCode !== 'XX' ? point.countryCode : normalizedName.slice(0, 3));
}

export function reconcileFormDriverSelection(selectedIds: string[], availableIds: string[]): string[] {
    const available = new Set(availableIds);
    const retained = [...new Set(selectedIds)].filter(id => available.has(id));
    const next = retained.length > 0 ? retained : availableIds.slice(0, 1);

    if (next.length === selectedIds.length && next.every((id, index) => id === selectedIds[index])) {
        return selectedIds;
    }

    return next;
}

export function toggleFormDriverSelection(selectedIds: string[], driverId: string): string[] {
    if (selectedIds.includes(driverId)) {
        return selectedIds.length > 1 ? selectedIds.filter(id => id !== driverId) : selectedIds;
    }

    return [...selectedIds, driverId];
}

export function buildFormChartData(drivers: DriverFormSeries[]): FormChartPoint[] {
    const timeline = drivers[0]?.points;
    if (!timeline) return [];

    const ratingsByDriver = new Map(
        drivers.map(driver => [driver.driverId, new Map(driver.points.map(point => [point.round, point.rating]))]),
    );
    const usedLabels = new Set<string>();

    return timeline.map(point => {
        const baseLabel = getFormRaceLabel(point);
        const roundLabel = usedLabels.has(baseLabel) ? `${baseLabel}-${point.roundNumber}` : baseLabel;
        usedLabels.add(roundLabel);

        const datum: FormChartPoint = { ...point, roundLabel };
        for (const driver of drivers) {
            datum[driver.driverId] = ratingsByDriver.get(driver.driverId)?.get(point.round) ?? null;
        }

        return datum;
    });
}
