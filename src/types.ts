export interface ImageData {
    type: 'file' | 'dir';
    name: string;
    relPath: string;
    mtime: number;
    size: number;
    sidecarPrompt: any | null;
    sampleImage?: string | null;
}

export interface FolderNode {
    name: string;
    relPath: string;
    children: FolderNode[];
    hasChildren: boolean;
}
