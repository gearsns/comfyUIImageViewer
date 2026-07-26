// Worker内で受信するメッセージの型
type WorkerInput = {
    startI: number;
    endI: number;
    n: number;
    dim: number;
    matrixBuffer: ArrayBuffer; // 共有用データ
};

self.onmessage = (e: MessageEvent<WorkerInput>) => {
    const THRESHOLD = 0.7;
    const { startI, endI, n, dim, matrixBuffer } = e.data;
    const matrix = new Float32Array(matrixBuffer);

    const pairs: { i: number; j: number; sim: number }[] = [];

    // 自分の担当範囲 (startI 〜 endI) だけ計算
    for (let i = startI; i < endI; i++) {
        const offsetI = i * dim;
        for (let j = i + 1; j < n; j++) {
            const offsetJ = j * dim;
            let sim = 0;
            for (let d = 0; d < dim; d++) {
                sim += matrix[offsetI + d] * matrix[offsetJ + d];
            }
            if (sim >= THRESHOLD) {
                pairs.push({ i, j, sim });
            }
        }
    }

    // 結果を返却
    self.postMessage(pairs);
};
