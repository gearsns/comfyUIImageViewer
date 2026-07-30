// Worker内で受信するメッセージの型
type WorkerInput = {
    workerIndex: number;
    numThreads: number;
    n: number;
    dim: number;
    matrixBuffer: ArrayBuffer; // 共有用データ
};

self.onmessage = (e: MessageEvent<WorkerInput>) => {
    const THRESHOLD = 0.7;
    const { workerIndex, numThreads, n, dim, matrixBuffer } = e.data;
    const matrix = new Float32Array(matrixBuffer);

    const pairs: { i: number; j: number; sim: number }[] = [];

    // ラウンドロビン方式で計算量を各Workerに均等分配
    for (let i = workerIndex; i < n; i += numThreads) {
        const offsetI = i * dim;
        for (let j = i + 1; j < n; j++) {
            const offsetJ = j * dim;
            let sim = 0;
            let d = 0;

            // 4要素ずつのループアンローリングで高速化
            for (; d <= dim - 4; d += 4) {
                sim += matrix[offsetI + d] * matrix[offsetJ + d]
                    + matrix[offsetI + d + 1] * matrix[offsetJ + d + 1]
                    + matrix[offsetI + d + 2] * matrix[offsetJ + d + 2]
                    + matrix[offsetI + d + 3] * matrix[offsetJ + d + 3];
            }
            // 端数の処理
            for (; d < dim; d++) {
                sim += matrix[offsetI + d] * matrix[offsetJ + d];
            }

            if (sim >= THRESHOLD) {
                pairs.push({ i, j, sim });
            }
        }
    }

    self.postMessage(pairs);
};
