import type { GroupInfo, ValidFiles } from "../types";

// コサイン類似度
// 事前にベクトルを正規化しておけば、以後は内積だけで済む（sqrt/割り算が消える）
export function normalizeVector(v: Float32Array): Float32Array {
    let norm = 0;
    for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm) || 1e-10;
    const out = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
    return out;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
    }
    return dot;
}

async function computeAllPairsParallel(
    normFeatures: Float32Array[],
    indices: number[]
): Promise<{ i: number; j: number; sim: number }[]> {
    const n = indices.length;
    if (n === 0) return [];

    // 次元数（ベクトルの長さ）を取得
    const dim = normFeatures[0].length;

    // 1. Float32Array[] から 1つの連続した Float32Array にデータを詰める
    // （CPUキャッシュ効率の最大化と Worker への転送のため）
    const matrix = new Float32Array(n * dim);
    for (let i = 0; i < n; i++) {
        const feat = normFeatures[indices[i]];
        // TypedArray の .set() を使うと高速にコピーできます
        matrix.set(feat, i * dim);
    }

    // 2. 利用可能な CPU コア数を取得（取得できない場合は 4 スレッド）
    const numThreads = navigator.hardwareConcurrency || 4;
    const promises: Promise<{ i: number; j: number; sim: number }[]>[] = [];

    for (let t = 0; t < numThreads; t++) {
        const worker = new Worker(new URL('../similarity.worker.ts', import.meta.url), {
            type: 'module'
        });

        const promise = new Promise<{ i: number; j: number; sim: number }[]>((resolve) => {
            worker.onmessage = (e) => {
                resolve(e.data);
                worker.terminate();// 計算完了後に Worker を破棄
            };
        });

        // Worker ごとにバッファを複製して転送（Transferable Objects で転送）
        const bufferCopy = matrix.buffer.slice(0);

        worker.postMessage({
            workerIndex: t,
            numThreads,
            n,
            dim,
            matrixBuffer: bufferCopy
        }, [bufferCopy]);

        promises.push(promise);
    }

    // 4. 全 Worker の計算完了を待って配列をフラット化
    const results = await Promise.all(promises);
    return results.flat();
}

// ボトムアップ（凝集型）グループ分け
export async function clusterFromHighSimilarity(
    indices: number[],
    normFeatures: Float32Array[],
    maxMembers: number,
    onStatus?: (message: string) => void
): Promise<number[][]> {
    const n = indices.length;
    if (n === 0) return [];
    if (n <= maxMembers) return [indices];

    onStatus?.("ペアの類似度を計算中...");

    type Pair = { i: number; j: number; sim: number };
    const pairs: Pair[] = await computeAllPairsParallel(normFeatures, indices);

    // 類似度が高い順（1.0 に近い順）に並べ替え
    onStatus?.("ペアの類似度を並べ替え...");
    pairs.sort((a, b) => b.sim - a.sim);

    // O(1) ルックアップ用の類似度 Map を構築 (i * n + j キー)
    const simMap = new Map<number, number>();
    for (const p of pairs) {
        simMap.set(p.i * n + p.j, p.sim);
    }
    const getSim = (i: number, j: number): number => {
        const min = i < j ? i : j;
        const max = i < j ? j : i;
        return simMap.get(min * n + max) ?? 0;
    };
    // 類似度が高い順に、未選択の要素同士でペアを形成
    onStatus?.("類似度が高い順にグループ分け中...");
    const used = new Array<boolean>(n).fill(false); // 既に使用されたインデックスを追跡
    // 各要素が現在どのグループに属しているかを高速に追跡するための配列
    // 初期状態: 各要素は自分だけのグループ (グループID = 0 〜 n-1)
    const groupOf: number[] = new Array(n);
    const groupMembers: number[][] = [];

    for (const pair of pairs) {
        if (pair.sim < 0.85) {
            break;
        }
        if (!used[pair.i] && !used[pair.j]) {
            used[pair.i] = true;
            used[pair.j] = true;
            // ペアから初期グループを作成
            const groupId = groupMembers.length;
            groupMembers.push([pair.i, pair.j]);
            groupOf[pair.i] = groupId;
            groupOf[pair.j] = groupId;
        }
    }

    // ペアにならなかったあまりの要素を1人グループとして初期化
    for (let i = 0; i < n; i++) {
        if (!used[i]) {
            const groupId = groupMembers.length;
            groupMembers.push([i]);
            groupOf[i] = groupId;
        }
    }

    // ステップ3: グループ同士の類似度が高い順にマージ
    onStatus?.("類似度が高い順にグループをマージ中...");

    for (const pair of pairs) {
        if (pair.sim <= 0.8) continue;
        const g1 = groupOf[pair.i];
        const g2 = groupOf[pair.j];

        // すでに同じグループにいる場合はスキップ
        if (g1 === g2) continue;

        const members1 = groupMembers[g1];
        const members2 = groupMembers[g2];

        // どちらかのグループが解体（空）になっている場合はスキップ
        if (!members1 || members1.length === 0 || !members2 || members2.length === 0) continue;

        const topI = members1[0];
        const topJ = members2[0];

        // O(1) で類似度を取得（二重ループを完全排除）
        const sim1 = getSim(topI, pair.j);
        const sim2 = getSim(topJ, pair.i);
        const sim = Math.max(sim1, sim2);

        if (sim <= 0.8) continue;

        // --- マージ実行 ---
        // g2 のメンバーを g1 に統合
        for (const member of members2) {
            groupOf[member] = g1; // 所属グループを更新
            members1.push(member);
        }

        // g2 は空にして削除扱いにする
        groupMembers[g2] = [];
    }

    onStatus?.("メンバーが少ないグループをマージ中...");

    for (const pair of pairs) {
        const g1 = groupOf[pair.i];
        const g2 = groupOf[pair.j];

        // すでに同じグループにいる場合はスキップ
        if (g1 === g2) continue;

        const members1 = groupMembers[g1];
        const members2 = groupMembers[g2];

        // どちらかのグループが解体（空）になっている場合はスキップ
        if (!members1 || members1.length === 0 || !members2 || members2.length === 0) continue;

        if (members1.length + members2.length > 20) continue;

        // --- マージ実行 ---
        // g2 のメンバーを g1 に統合
        for (const member of members2) {
            groupOf[member] = g1; // 所属グループを更新
            members1.push(member);
        }

        // g2 は空にして削除扱いにする
        groupMembers[g2] = [];
    }

    // 規定数（maxMembers）を超えるグループの分割
    const finalGroups = [];
    for (const members of groupMembers) {
        if (members.length <= 0) {
            continue;
        }
        if (members.length < maxMembers) {
            finalGroups.push(members);
            continue;
        }
        const total = members.length;
        const k = Math.ceil(total / maxMembers);
        const baseSize = Math.floor(total / k);
        const remainder = total % k;
        // 先頭メンバー(代表)に対する類似度が高い順にソートする
        const repIdx = members[0];
        const tmpMembers = [...members].sort((a, b) => {
            const simA = cosineSimilarity(normFeatures[repIdx], normFeatures[a]);
            const simB = cosineSimilarity(normFeatures[repIdx], normFeatures[b]);
            return simB - simA;
        });
        let index = 0;
        for (let i = 0; i < k; i++) {
            // 余りがあるグループには +1 人配分して均等化する
            const currentSize = baseSize + (i < remainder ? 1 : 0);

            const subGroup = tmpMembers.slice(index, index + currentSize);
            finalGroups.push(subGroup);

            index += currentSize;
        }
    }

    return finalGroups.filter(g => g.length > 0);
}

export async function cluster(
    validFiles: ValidFiles[],
    maxMembers: number,
    onStatus?: (message: string) => void
): Promise<[GroupInfo[], Float32Array<ArrayBufferLike>[]]> {
    const features = validFiles.map((v) => v.feature);
    const normFeatures = features.map(normalizeVector);
    const allIndices = validFiles.map((_, idx) => idx);

    // 階層クラスタリング＋細分化
    const groups = await clusterFromHighSimilarity(
        allIndices,
        normFeatures,
        maxMembers,
        onStatus
    )
    // 各グループの「代表画像（中心画像）」を決定
    // (DB保存時のロジックと完全に統一)
    type GroupInfo = {
        indices: number[];
        bestRefIdx: number;
        bestAvgSim: number;
    };

    const groupInfos: GroupInfo[] = groups.map((indices) => {
        if (indices.length <= 1) {
            return { indices, bestRefIdx: indices[0], bestAvgSim: 1.0 };
        }

        let bestRefIdx = indices[0];
        let bestAvgSim = -1;

        for (const i of indices) {
            let simSum = 0;
            for (const j of indices) {
                simSum += cosineSimilarity(normFeatures[i], normFeatures[j]);
            }
            const avgSim = simSum / indices.length;
            if (avgSim > bestAvgSim) {
                bestAvgSim = avgSim;
                bestRefIdx = i;
            }
        }

        return { indices, bestRefIdx, bestAvgSim };
    });

    // 代表画像同士の類似度でグループをソート
    // メンバーが2名以上のグループのみ抽出
    const validGroupInfos = groupInfos.filter(g => g.indices.length > 1);

    if (validGroupInfos.length > 0) {
        // 最もメンバー数の多いグループ（＝基準グループ）の代表画像を絶対基準(Anchor)にする
        // ※枚数が同じ場合は平均類似度が高い方を優先
        const primaryGroup = validGroupInfos.reduce((prev, curr) => {
            if (curr.indices.length !== prev.indices.length) {
                return curr.indices.length > prev.indices.length ? curr : prev;
            }
            return curr.bestAvgSim > prev.bestAvgSim ? curr : prev;
        });

        const mainAnchorIdx = primaryGroup.bestRefIdx; // ★絶対基準となる代表画像のインデックス

        // メイン代表画像との類似度が高い順にグループを並べ替え
        groupInfos.sort((a, b) => {
            // 1人グループ（孤立画像）は一番後ろにする
            if (a.indices.length <= 1 && b.indices.length > 1) return 1;
            if (a.indices.length > 1 && b.indices.length <= 1) return -1;
            if (a.indices.length <= 1 && b.indices.length <= 1) return 0;

            // ★各グループの代表画像と、メイン代表画像との類似度で比較
            const simA = cosineSimilarity(normFeatures[mainAnchorIdx], normFeatures[a.bestRefIdx]);
            const simB = cosineSimilarity(normFeatures[mainAnchorIdx], normFeatures[b.bestRefIdx]);

            return simB - simA; // 降順（メイン代表に似ているグループ順）
        });
    }
    return [groupInfos, normFeatures];
}
