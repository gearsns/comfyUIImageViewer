import type { ImageData, FolderNode } from './types';
import * as Comlink from 'comlink';
import type { WorkerApi } from './worker';
import MyWorker from './worker/index?worker';
import { sessionId } from './store';

const worker = new MyWorker();
const api = Comlink.wrap<WorkerApi>(worker);

export async function fetchImages(folderPath: string): Promise<ImageData[]> {
    return api.images(sessionId, folderPath);
}

export async function fetchFolderTree(): Promise<FolderNode[]> {
    return api.folders(sessionId);
}

export async function fetchSubFolderTree(folderPath: string): Promise<FolderNode[]> {
    return api.folders(sessionId, folderPath);
}

export async function fetchPrompt(name: string): Promise<any> {
    return api.prompt(sessionId, name);
}

export async function searchImages(query: string): Promise<ImageData[]> {
    return api.images(sessionId, null, query);
}
