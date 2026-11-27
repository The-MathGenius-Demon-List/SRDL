/**
 * Numbers of decimal digits to round to
 */
const scale = 3;

/**
 * Calculate the score awarded when having a certain percentage on a list level
 * @param {Number} rank Position on the list (starting at 1)
 * @param {Number} totalLevels Total number of levels on the list (N)
 * @param {Number} percent Percentage of completion
 * @param {Number} minPercent Minimum percentage required
 * @returns {Number}
 */
export function score(aredlRank, hardestRank, easiestRank, percent, minPercent) {
    if (percent < minPercent) return 0;

    if (![aredlRank, hardestRank, easiestRank].every(Number.isFinite)) {
        console.error("Missing or invalid AREDL rank.");
        return 0;
    }

    const span = Math.max(1, easiestRank - hardestRank);
    const difficulty = Math.min(
        1,
        Math.max(0, (easiestRank - aredlRank) / span),
    );

    const baseScore = 1 + 999 * Math.pow(difficulty, 4);

    if (percent === 100) {
        return Math.max(round(baseScore), 0);
    }

    const progressRatio = (percent - minPercent) / (100 - minPercent);
    const pointsRatio = 0.10 + progressRatio * 0.40;

    return Math.max(round(baseScore * pointsRatio), 0);
}

/**
 * Rounds a number to the defined scale
 */
export function round(num) {
    if (!('' + num).includes('e')) {
        return +(Math.round(num + 'e+' + scale) + 'e-' + scale);
    } else {
        var arr = ('' + num).split('e');
        var sig = +arr[1] + scale > 0 ? '+' : '';
        return +(Math.round(+arr[0] + 'e' + sig + (+arr[1] + scale)) + 'e-' + scale);
    }
}
