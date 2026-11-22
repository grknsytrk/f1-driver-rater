import { describe, expect, it } from 'vitest';
import type { ConstructorStanding, DriverStanding } from '../api/f1Api';
import type { AverageRating } from '../types';
import { buildOverperformanceDataset } from './overperformance';

const SAMPLE_CONSTRUCTORS: ConstructorStanding[] = [
    { constructorId: 'mclaren', constructorName: 'McLaren', position: 1, points: 600, wins: 6 },
    { constructorId: 'ferrari', constructorName: 'Ferrari', position: 2, points: 400, wins: 3 },
    { constructorId: 'williams', constructorName: 'Williams', position: 7, points: 80, wins: 0 },
    { constructorId: 'sauber', constructorName: 'Sauber', position: 10, points: 20, wins: 0 },
];

const SAMPLE_DRIVER_STANDINGS: DriverStanding[] = [
    {
        position: '1',
        positionText: '1',
        points: '320',
        wins: '4',
        Driver: { driverId: 'norris', code: 'NOR', givenName: 'Lando', familyName: 'Norris', url: '' },
        Constructors: [{ constructorId: 'mclaren', name: 'McLaren', url: '' }],
    },
    {
        position: '2',
        positionText: '2',
        points: '280',
        wins: '2',
        Driver: { driverId: 'piastri', code: 'PIA', givenName: 'Oscar', familyName: 'Piastri', url: '' },
        Constructors: [{ constructorId: 'mclaren', name: 'McLaren', url: '' }],
    },
    {
        position: '4',
        positionText: '4',
        points: '190',
        wins: '1',
        Driver: { driverId: 'hamilton', code: 'HAM', givenName: 'Lewis', familyName: 'Hamilton', url: '' },
        Constructors: [{ constructorId: 'ferrari', name: 'Ferrari', url: '' }],
    },
    {
        position: '11',
        positionText: '11',
        points: '48',
        wins: '0',
        Driver: { driverId: 'albon', code: 'ALB', givenName: 'Alexander', familyName: 'Albon', url: '' },
        Constructors: [{ constructorId: 'williams', name: 'Williams', url: '' }],
    },
    {
        position: '18',
        positionText: '18',
        points: '8',
        wins: '0',
        Driver: { driverId: 'bortoleto', code: 'BOR', givenName: 'Gabriel', familyName: 'Bortoleto', url: '' },
        Constructors: [{ constructorId: 'sauber', name: 'Sauber', url: '' }],
    },
];

const SAMPLE_AVERAGES: AverageRating[] = [
    { driverId: 'norris', driverName: 'Lando Norris', constructorId: 'mclaren', constructorName: 'McLaren', averageRating: 8.6, totalRaces: 12, ratings: [] },
    { driverId: 'piastri', driverName: 'Oscar Piastri', constructorId: 'mclaren', constructorName: 'McLaren', averageRating: 8.1, totalRaces: 12, ratings: [] },
    { driverId: 'hamilton', driverName: 'Lewis Hamilton', constructorId: 'ferrari', constructorName: 'Ferrari', averageRating: 6.2, totalRaces: 12, ratings: [] },
    { driverId: 'albon', driverName: 'Alexander Albon', constructorId: 'williams', constructorName: 'Williams', averageRating: 8.4, totalRaces: 12, ratings: [] },
    { driverId: 'bortoleto', driverName: 'Gabriel Bortoleto', constructorId: 'sauber', constructorName: 'Sauber', averageRating: 6.9, totalRaces: 12, ratings: [] },
];

describe('buildOverperformanceDataset', () => {
    it('identifies car-adjusted overperformers and underperformers with linear OLS baseline', () => {
        const dataset = buildOverperformanceDataset({
            averages: SAMPLE_AVERAGES,
            driverStandings: SAMPLE_DRIVER_STANDINGS,
            constructorStandings: SAMPLE_CONSTRUCTORS,
            axisMode: 'car',
            scaleMode: 'linear',
            minimumRatedRaces: 6,
        });

        expect(dataset.points).toHaveLength(5);
        expect(dataset.trend).not.toBeNull();
        expect(dataset.xDomain).toEqual([0, 700]);

        const albon = dataset.points.find(pt => pt.driverId === 'albon')!;
        const hamilton = dataset.points.find(pt => pt.driverId === 'hamilton')!;
        expect(albon.carPoints).toBe(80);
        expect(albon.xPlot).toBe(80);
        expect(albon.driverPoints).toBe(48);
        expect(albon.delta).toBeGreaterThan(0.5);
        expect(hamilton.delta).toBeLessThan(-0.5);

        expect(dataset.topOverperformers[0]?.driverId).toBe('albon');
        expect(dataset.topUnderperformers[0]?.driverId).toBe('hamilton');
    });

    it('uses sqrt spread scale by default to declutter midfield points while keeping real point ticks', () => {
        const dataset = buildOverperformanceDataset({
            averages: SAMPLE_AVERAGES,
            driverStandings: SAMPLE_DRIVER_STANDINGS,
            constructorStandings: SAMPLE_CONSTRUCTORS,
            axisMode: 'car',
            minimumRatedRaces: 6,
        });

        const albon = dataset.points.find(pt => pt.driverId === 'albon')!;
        const norris = dataset.points.find(pt => pt.driverId === 'norris')!;
        expect(albon.xValue).toBe(80);
        expect(albon.xPlot).toBeCloseTo(Math.sqrt(80), 4);
        expect(norris.xPlot).toBeCloseTo(Math.sqrt(600), 4);
        expect(dataset.xTicks?.length).toBeGreaterThanOrEqual(4);
        expect(dataset.xTicks?.[0]).toBe(0);
    });

    it('zooms domain onto midfield or leaders while preserving full-grid delta values', () => {
        const fullGrid = buildOverperformanceDataset({
            averages: SAMPLE_AVERAGES,
            driverStandings: SAMPLE_DRIVER_STANDINGS,
            constructorStandings: SAMPLE_CONSTRUCTORS,
            axisMode: 'car',
            scaleMode: 'spread',
            gridFilter: 'all',
            minimumRatedRaces: 6,
        });

        const midfieldZoom = buildOverperformanceDataset({
            averages: SAMPLE_AVERAGES,
            driverStandings: SAMPLE_DRIVER_STANDINGS,
            constructorStandings: SAMPLE_CONSTRUCTORS,
            axisMode: 'car',
            scaleMode: 'spread',
            gridFilter: 'midfield',
            minimumRatedRaces: 6,
        });

        expect(midfieldZoom.points.map(pt => pt.driverId).sort()).toEqual(['albon', 'bortoleto']);
        expect(midfieldZoom.xDomain[1]).toBeLessThan(fullGrid.xDomain[1]);

        const fullAlbon = fullGrid.points.find(pt => pt.driverId === 'albon')!;
        const zoomedAlbon = midfieldZoom.points.find(pt => pt.driverId === 'albon')!;
        expect(zoomedAlbon.delta).toBeCloseTo(fullAlbon.delta, 5);

        const leadersZoom = buildOverperformanceDataset({
            averages: SAMPLE_AVERAGES,
            driverStandings: SAMPLE_DRIVER_STANDINGS,
            constructorStandings: SAMPLE_CONSTRUCTORS,
            axisMode: 'car',
            scaleMode: 'linear',
            gridFilter: 'leaders',
            minimumRatedRaces: 6,
        });

        expect(leadersZoom.points.map(pt => pt.driverId).sort()).toEqual(['hamilton', 'norris', 'piastri']);
        expect(leadersZoom.xDomain[0]).toBeGreaterThan(200);
    });

    it('switches X-axis values cleanly to WDC driver points and keeps trendline within bounds', () => {
        const dataset = buildOverperformanceDataset({
            averages: SAMPLE_AVERAGES,
            driverStandings: SAMPLE_DRIVER_STANDINGS,
            constructorStandings: SAMPLE_CONSTRUCTORS,
            axisMode: 'driver',
            scaleMode: 'linear',
            minimumRatedRaces: 6,
        });

        const norris = dataset.points.find(pt => pt.driverId === 'norris')!;
        const piastri = dataset.points.find(pt => pt.driverId === 'piastri')!;
        expect(norris.xValue).toBe(320);
        expect(piastri.xValue).toBe(280);
        expect(dataset.xDomain[1]).toBe(350);

        const seg = dataset.trend!.segment;
        expect(seg[0].x).toBeGreaterThanOrEqual(dataset.xDomain[0]);
        expect(seg[1].x).toBeLessThanOrEqual(dataset.xDomain[1]);
        expect(seg[0].y).toBeGreaterThanOrEqual(dataset.yDomain[0]);
        expect(seg[0].y).toBeLessThanOrEqual(dataset.yDomain[1]);
    });

    it('assigns non-colliding label placements to teammates with equal constructor points', () => {
        const dataset = buildOverperformanceDataset({
            averages: [
                { driverId: 'norris', driverName: 'Lando Norris', constructorId: 'mclaren', constructorName: 'McLaren', averageRating: 8.5, totalRaces: 10, ratings: [] },
                { driverId: 'piastri', driverName: 'Oscar Piastri', constructorId: 'mclaren', constructorName: 'McLaren', averageRating: 8.4, totalRaces: 10, ratings: [] },
                { driverId: 'albon', driverName: 'Alexander Albon', constructorId: 'williams', constructorName: 'Williams', averageRating: 7.5, totalRaces: 10, ratings: [] },
            ],
            driverStandings: SAMPLE_DRIVER_STANDINGS,
            constructorStandings: SAMPLE_CONSTRUCTORS,
            axisMode: 'car',
        });

        const norris = dataset.points.find(pt => pt.driverId === 'norris')!;
        const piastri = dataset.points.find(pt => pt.driverId === 'piastri')!;
        expect(norris.labelPlacement).not.toBe(piastri.labelPlacement);
    });

    it('hides unqualified cameo drivers when includeUnqualified is false and tracks unqualifiedCount', () => {
        const withCameo = [
            ...SAMPLE_AVERAGES,
            { driverId: 'hirakawa', driverName: 'Ryo Hirakawa', constructorId: 'sauber', constructorName: 'Sauber', averageRating: 7.8, totalRaces: 1, ratings: [] },
        ];

        const filtered = buildOverperformanceDataset({
            averages: withCameo,
            driverStandings: SAMPLE_DRIVER_STANDINGS,
            constructorStandings: SAMPLE_CONSTRUCTORS,
            axisMode: 'car',
            includeUnqualified: false,
            minimumRatedRaces: 6,
        });

        expect(filtered.unqualifiedCount).toBe(1);
        expect(filtered.totalDriverCount).toBe(6);
        expect(filtered.points.some(pt => pt.driverId === 'hirakawa')).toBe(false);
    });
});
