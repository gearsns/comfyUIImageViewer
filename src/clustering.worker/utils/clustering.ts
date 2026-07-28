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

    // 3. i のループ（0 〜 n-1）をコア数に応じて均等に分割
    const chunkSize = Math.ceil(n / numThreads);

    for (let t = 0; t < numThreads; t++) {
        const startI = t * chunkSize;
        const endI = Math.min((t + 1) * chunkSize, n);
        if (startI >= n) break;

        const worker = new Worker(new URL('../similarity.worker.ts', import.meta.url), {
            type: 'module'
        });

        const promise = new Promise<{ i: number; j: number; sim: number }[]>((resolve) => {
            worker.onmessage = (e) => {
                resolve(e.data);
                worker.terminate(); // 計算完了後に Worker を破棄
            };
        });

        // Worker ごとにバッファを複製して転送（Transferable Objects で転送）
        const bufferCopy = matrix.buffer.slice(0);

        worker.postMessage({
            startI,
            endI,
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

    // ==========================================
    // ステップ2: 類似度が高い順に、未選択の要素同士でペアを形成
    // ==========================================
    onStatus?.("類似度が高い順にグループ分け中...");
    const used = new Array<boolean>(n).fill(false); // 既に使用されたインデックスを追跡
    const initialPairs: Pair[] = [];

    for (const pair of pairs) {
        if (!used[pair.i] && !used[pair.j]) {
            used[pair.i] = true;
            used[pair.j] = true;
            initialPairs.push(pair);
        }
    }

    // 各要素が現在どのグループに属しているかを高速に追跡するための配列
    // 初期状態: 各要素は自分だけのグループ (グループID = 0 〜 n-1)
    const groupOf: number[] = new Array(n);
    const groupMembers: number[][] = [];

    // ペアから初期グループを作成
    for (const pair of initialPairs) {
        const groupId = groupMembers.length;
        groupMembers.push([pair.i, pair.j]);
        groupOf[pair.i] = groupId;
        groupOf[pair.j] = groupId;
    }

    // ペアにならなかったあまりの要素を1人グループとして初期化
    for (let i = 0; i < n; i++) {
        if (!used[i]) {
            const groupId = groupMembers.length;
            groupMembers.push([i]);
            groupOf[i] = groupId;
        }
    }

    // ==========================================
    // ステップ3: グループ同士の類似度が高い順にマージ
    // (maxMembersを超えたら処理終了)
    // ==========================================

    for (const pair of pairs) {
        const g1 = groupOf[pair.i];
        const g2 = groupOf[pair.j];

        // すでに同じグループにいる場合はスキップ
        if (g1 === g2) continue;

        const members1 = groupMembers[g1];
        const members2 = groupMembers[g2];

        // どちらかのグループが解体（空）になっている場合はスキップ
        if (!members1 || !members2) continue;

        // マージ後の人数が maxMembers を超える場合はスキップ
        if (members1.length + members2.length > maxMembers) continue;

        // --- マージ実行 ---
        // g2 のメンバーを g1 に統合
        for (const member of members2) {
            groupOf[member] = g1; // 所属グループを更新
            members1.push(member);
        }

        // g2 は空にして削除扱いにする
        groupMembers[g2] = [];
    }

    return groupMembers.filter(g => g.length > 0);
}
