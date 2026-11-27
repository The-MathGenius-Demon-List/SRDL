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

        // Attach the same rank range to each successfully loaded level.
        return loadedLevels.map(([level, error]) => [
            level ? { ...level, hardestRank, easiestRank } : null,
            error,
        ]);
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
                level.aredlRank,
                level.hardestRank,
                level.easiestRank,
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
                        level.aredlRank,
                        level.hardestRank,
                        level.easiestRank,
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
                    level.aredlRank,
                    level.hardestRank,
                    level.easiestRank,
                    record.percent,
                    level.percentToQualify,
                ),
                link: record.link,
            });
        });
    });

    // Add each player's points together.
    const res = Object.entries(scoreMap).map(([user, scores]) => {
        const { verified, completed, progressed } = scores;
        const total = [verified, completed, progressed]
            .flat()
            .reduce((previous, current) => previous + current.score, 0);

        return {
            user,
            total: round(total),
            ...scores,
        };
    });

    // Sort from highest total to lowest.
    return [res.sort((a, b) => b.total - a.total), errs];
}
