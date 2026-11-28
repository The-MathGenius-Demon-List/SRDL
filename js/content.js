import { aredlCompletionPoints, round, score } from "./score.js";

/**
 * Path to directory containing `_list.json` and all levels
 */
const dir = "/data";

export async function fetchList() {
    try {
        const [listResult, rankMapResult] = await Promise.all([
            fetch(`${dir}/_list.json`),
            fetch(`${dir}/_aredl_ranks.json`),
        ]);

        const [list, rankMap] = await Promise.all([
            listResult.json(),
            rankMapResult.json(),
        ]);

        const loadedLevels = await Promise.all(
            list.map(async (path, rank) => {
                try {
                    const levelResult = await fetch(`${dir}/${path}.json`);
                    const level = await levelResult.json();
                    const rankInfo = rankMap[path];

                    if (!Number.isFinite(rankInfo?.rank)) {
                        throw new Error(`Missing AREDL rank for ${path}`);
                    }

                    return [
                        {
                            ...level,
                            path,
                            aredlRank: rankInfo.rank,
                            records: level.records.sort(
                                (a, b) => b.percent - a.percent,
                            ),
                        },
                        null,
                    ];
                } catch {
                    console.error(
                        `Failed to load level #${rank + 1} ${path}, or its AREDL rank.`,
                    );
                    return [null, path];
                }
            }),
        );

        // Find the hardest and easiest AREDL ranks currently mapped to SDL levels.
        const ranks = loadedLevels
            .filter(([level]) => level)
            .map(([level]) => level.aredlRank);

        if (ranks.length === 0) {
            return loadedLevels;
        }

        const hardestRank = Math.min(...ranks);
        const easiestRank = Math.max(...ranks);

        // Calculate the existing AREDL-based point values for every loaded level.
// Then assign those values from highest to lowest in SDL list order.
const pointsBySdlPosition = loadedLevels
    .filter(([level]) => level)
    .map(([level]) =>
        aredlCompletionPoints(
            level.aredlRank,
            hardestRank,
            easiestRank,
        ),
    )
    .sort((a, b) => b - a);

// Calculate the existing AREDL-based point values for every loaded level.
// Then assign those values from highest to lowest in SDL list order.
const pointsBySdlPosition = loadedLevels
    .filter(([level]) => level)
    .map(([level]) =>
        aredlCompletionPoints(
            level.aredlRank,
            hardestRank,
            easiestRank,
        ),
    )
    .sort((a, b) => b - a);

const totalLevels = pointsBySdlPosition.length;
const transitionStartRank = 200;
const transitionEndRank = 282;
const anchorPoints = pointsBySdlPosition[transitionEndRank - 1];
const remainingLevels = totalLevels - transitionEndRank;

let pointIndex = 0;

return loadedLevels.map(([level, error]) => {
    if (!level) {
        return [null, error];
    }

    // Use the existing AREDL-based points through #200.
    const rank = pointIndex + 1;
    const currentPoints = pointsBySdlPosition[pointIndex++];
    let basePoints = currentPoints;

    if (rank > transitionStartRank && remainingLevels > 0) {
        // Extend the eased curve from its #282 anchor to 1 point
        // at the bottom of the current SDL list.
        const easedPoints =
            1 +
            (anchorPoints - 1) *
                Math.pow(
                    (totalLevels - rank) / remainingLevels,
                    2.5,
                );

        if (rank <= transitionEndRank) {
            // Smoothly blend from the current curve to the eased curve.
            const t =
                (rank - transitionStartRank) /
                (transitionEndRank - transitionStartRank);
            const smooth = t * t * (3 - 2 * t);

            basePoints =
                currentPoints +
                smooth * (easedPoints - currentPoints);
        } else {
            // Continue the eased curve below #282.
            basePoints = easedPoints;
        }
    }

    return [
        {
            ...level,
            basePoints: round(basePoints),
        },
        error,
    ];
});
    } catch {
        console.error("Failed to load list or AREDL rank map.");
        return null;
    }
}

export async function fetchEditors() {
    try {
        const editorsResults = await fetch(`${dir}/_editors.json`);
        const editors = await editorsResults.json();
        return editors;
    } catch {
        return null;
    }
}

export async function fetchLeaderboard() {
    const list = await fetchList();

    const scoreMap = {};
    const errs = [];

    list.forEach(([level, err], rank) => {
        if (err) {
            errs.push(err);
            return;
        }

        // Verification
        const verifier =
            Object.keys(scoreMap).find(
                (user) => user.toLowerCase() === level.verifier.toLowerCase(),
            ) || level.verifier;

        scoreMap[verifier] ??= {
            verified: [],
            completed: [],
            progressed: [],
        };

        const { verified } = scoreMap[verifier];

        verified.push({
            rank: rank + 1,
            level: level.name,
            score: score(
                level.basePoints,
                100,
                level.percentToQualify,
            ),
            link: level.verification,
        });

        // Records
        level.records.forEach((record) => {
            const user =
                Object.keys(scoreMap).find(
                    (name) => name.toLowerCase() === record.user.toLowerCase(),
                ) || record.user;

            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
            };

            const { completed, progressed } = scoreMap[user];

            if (record.percent === 100) {
                completed.push({
                    rank: rank + 1,
                    level: level.name,
                    score: score(
                        level.basePoints,
                        100,
                        level.percentToQualify,
                    ),
                    link: record.link,
                });
                return;
            }

            progressed.push({
                rank: rank + 1,
                level: level.name,
                percent: record.percent,
                score: score(
                    level.basePoints,
                    record.percent,
                    level.percentToQualify,
                ),
                link: record.link,
            });
        });
    });

    // Add each player's points together, applying the gradual achievement multiplier.
    const fullValueCount = 20;
    const retentionPer20 = 0.7;
    const minimumFullCompletionPoints = 0.1;

    const res = Object.entries(scoreMap).map(([user, scores]) => {
        const fullCompletions = new Set([
            ...scores.verified,
            ...scores.completed,
        ]);

        const achievements = [
            ...scores.verified,
            ...scores.completed,
            ...scores.progressed,
        ].sort((a, b) => b.score - a.score);

        achievements.forEach((achievement, index) => {
            const position = index + 1;
            const multiplier =
                position <= fullValueCount
                    ? 1
                    : Math.pow(
                          retentionPer20,
                          (position - fullValueCount) / 20,
                      );

            const weightedScore = achievement.score * multiplier;
            const isFullCompletion = fullCompletions.has(achievement);

            achievement.score = round(
                isFullCompletion && achievement.score > 0
                    ? Math.max(weightedScore, minimumFullCompletionPoints)
                    : weightedScore,
            );
        });

        const total = achievements.reduce(
            (previous, achievement) => previous + achievement.score,
            0,
        );

        return {
            user,
            total: round(total),
            ...scores,
        };
    });

    // Sort from highest total to lowest.
    return [res.sort((a, b) => b.total - a.total), errs];
}
