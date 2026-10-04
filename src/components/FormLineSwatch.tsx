interface FormLineSwatchProps {
    color: string;
    dash?: string;
    height: number;
}

/** Center complete dash segments so short vertical swatches never end in a clipped fragment. */
export function FormLineSwatch({ color, dash, height }: FormLineSwatchProps) {
    const pattern = dash?.split(/\s+/).map(Number);
    const validPattern = pattern?.length && pattern.length % 2 === 0 && pattern.every(length => Number.isFinite(length) && length > 0);

    if (!validPattern) {
        return (
            <svg width="4" height={height} shapeRendering="crispEdges" className="shrink-0" aria-hidden="true">
                <rect width="4" height={height} fill={color} />
            </svg>
        );
    }

    const scale = height < 40 && pattern[0] >= 6 ? 0.75 : 1;
    const lengths = pattern.map(length => Math.max(2, Math.round(length * scale)));
    const segments: { y: number; height: number }[] = [];
    let nextY = 0;
    let index = 0;

    while (nextY + lengths[index] <= height - 4) {
        const segmentHeight = lengths[index];
        segments.push({ y: nextY, height: segmentHeight });
        nextY += segmentHeight + lengths[(index + 1) % lengths.length];
        index = (index + 2) % lengths.length;
    }

    const occupiedHeight = segments.at(-1)!.y + segments.at(-1)!.height;
    const topSpace = Math.floor((height - occupiedHeight) / 2);

    return (
        <svg width="4" height={height} shapeRendering="crispEdges" className="shrink-0" aria-hidden="true">
            {segments.map(({ y, height: segmentHeight }) => (
                <rect key={y} y={y + topSpace} width="4" height={segmentHeight} fill={color} />
            ))}
        </svg>
    );
}
