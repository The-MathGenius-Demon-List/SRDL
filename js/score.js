/**
 * Numbers of decimal digits to round to
 */
const scale = 3;

/**
 * Calculate a level's full-completion points from its AREDL rank.
 * These scores will be sorted and assigned in SDL order.
 */
export function aredlCompletionPoints(aredlRank, hardestRank, easiestRank) {
    if (![aredlRank, hardestRank, easiestRank].every(Number.isFinite)) {
        console.error("Missing or invalid AREDL rank.");
        return 0;
    }

    const span = Math.max(1, easiestRank - hardestRank);
    const difficulty = Math.min(
        1,
        Math.max(0, (easiestRank - aredlRank) / span),
    );

    return Math.max(round(1 + 999 * Math.pow(difficulty, 4)), 0);
}

/**
 * Calculate points for a full completion or a progress record.
 */
export function score(basePoints, percent, minPercent) {
    if (percent < minPercent) return 0;

    if (!Number.isFinite(basePoints)) {
        console.error("Missing or invalid base points.");
        return 0;
    }

    if (percent === 100) {
        return Math.max(round(basePoints), 0);
    }

    const progressRatio = (percent - minPercent) / (100 - minPercent);
    const pointsRatio = 0.10 + progressRatio * 0.40;

    return Math.max(round(basePoints * pointsRatio), 0);
}

/**
 * Round a number to the defined scale.
 */
export function round(num) {
    if (!("" + num).includes("e")) {
        return +(Math.round(num + "e+" + scale) + "e-" + scale);
    } else {
        const arr = ("" + num).split("e");
        const sig = +arr[1] + scale > 0 ? "+" : "";
        return +(
            Math.round(+arr[0] + "e" + sig + (+arr[1] + scale)) +
            "e-" +
            scale
        );
    }
}
