export interface ClusteringConfig {
    maxMembers: number;
    minSimilarity: number;
}

export type WorkerIncomingMessage =
    | { type: 'START_PROCESS'; payload: { dirHandle: FileSystemDirectoryHandle; config: ClusteringConfig } };

export type WorkerOutgoingMessage =
    | { type: 'STATUS'; payload: { message: string } }
    | { type: 'PROGRESS'; payload: { current: number; total: number; label: string } }
    | { type: 'COMPLETE'; payload: { groupCount: number; dbBuffer: Uint8Array } }
    | { type: 'ERROR'; payload: { error: string } };

export type ValidFiles = {
    relPath: string;
    feature: Float32Array;
    jsonText: string;
    prompt: string;
}

export type GroupInfo = {
    indices: number[];
    bestRefIdx: number;
    bestAvgSim: number;
};
