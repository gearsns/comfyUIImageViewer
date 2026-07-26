import * as mm from 'music-metadata-browser';
import { Buffer } from 'buffer';
import { getBaseFilename, splitFileName } from './file';

if (typeof globalThis.Buffer === 'undefined') {
    globalThis.Buffer = Buffer;
}

// JSON切り出し
function extractJsonField(text: string, marker: string): any | null {
    const idx = text.indexOf(marker);
    if (idx === -1) return null;

    const jsonStart = text.indexOf('{', idx);
    if (jsonStart === -1) return null;

    // 後方からのスキャンを一文字ずつではなく、最後の '}' の位置から探索して効率化
    const lastBracket = text.lastIndexOf('}');
    for (let i = lastBracket + 1; i > jsonStart; i--) {
        try {
            const candidate = text.substring(jsonStart, i);
            if (candidate.endsWith('}')) {
                return JSON.parse(candidate);
            }
        } catch {
            // パース失敗時は文字数を減らして再試行
        }
    }
    return null;
}

export async function getJsonPrompt(dirHandle: FileSystemDirectoryHandle, filename: string): Promise<any | null> {
    const ext = filename.toLocaleLowerCase().replace(/.*\./, '.');
    const jsonFileName = filename.replace(ext, '.json');

    try {
        const fileHandle = await dirHandle.getFileHandle(jsonFileName);
        if (!fileHandle) return null;
        const file = await fileHandle.getFile();
        const raw = await file.text();
        const json = JSON.parse(raw);
        if (typeof json["prompt"] === "string") {
            json["prompt"] = JSON.parse(json["prompt"]);
        }
        if (typeof json["parameters"] === "string") {
            json["parameters"] = JSON.parse(json["parameters"]);
        }
        return json;
    } catch {
        return null;
    }
}

// extractPngTextChunk は手元のバイナリ計算なので同期処理のままでOK
function extractPngTextChunk(view: DataView, bytes: Uint8Array, keyword: string): string | null {
    const keywordBytes = new TextEncoder().encode(keyword);
    // PNGは先頭8バイトがシグネチャ、その後は [4バイト長さ][4バイト型][データ][4バイトCRC] の繰り返し
    let offset = 8;

    while (offset < bytes.length - 8) {
        const length = view.getUint32(offset);
        const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
        // tEXt チャンク（テキストメタデータ）を見つけた場合
        if (type === 'tEXt') {
            const dataStart = offset + 8;
            const dataEnd = dataStart + length;

            let match = true;
            for (let i = 0; i < keywordBytes.length; i++) {
                if (bytes[dataStart + i] !== keywordBytes[i]) {
                    match = false;
                    break;
                }
            }
            // キーワードが一致し、その後にヌル文字（0x00）があるか確認
            if (match && bytes[dataStart + keywordBytes.length] === 0) {
                // ヌル文字の直後からチャンクの終わりまでが実際のテキスト（JSON）
                const textBytes = bytes.subarray(dataStart + keywordBytes.length + 1, dataEnd);
                return new TextDecoder().decode(textBytes);
            }
        }
        // 次のチャンクへ進む (長さ + 型4B + 長さ4B + CRC4B)
        offset += length + 12;
    }
    return null;
}

// PNGを取得し、ComfyUIのメタデータを安全にパースする
export async function getPngPrompt(dirHandle: FileSystemDirectoryHandle, filename: string): Promise<any | null> {
    const ext = filename.toLocaleLowerCase().replace(/.*\./, '.');
    const pngFileName = ext.toLowerCase() === '.png' ? filename : filename.replace(ext, '.png');

    try {
        const fileHandle = await dirHandle.getFileHandle(pngFileName);
        if (!fileHandle) return null;
        const file = await fileHandle.getFile();
        const arrayBuffer = await file.arrayBuffer();

        //const buffer = await file.bytes();
        //const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        const bytes = new Uint8Array(arrayBuffer);
        const view = new DataView(arrayBuffer);

        // 各テキストチャンクを安全に切り出し
        const promptRaw = extractPngTextChunk(view, bytes, 'prompt');
        const workflowRaw = extractPngTextChunk(view, bytes, 'workflow');
        const parametersRaw = extractPngTextChunk(view, bytes, 'parameters');

        return {
            prompt: promptRaw ? JSON.parse(promptRaw) : null,
            workflow: workflowRaw ? JSON.parse(workflowRaw) : null,
            // parametersはJSONではなくプレーンテキストの場合もあるためtry-catchで
            parameters: parametersRaw ? (() => {
                try { return JSON.parse(parametersRaw); } catch { return parametersRaw; }
            })() : null
        };
    } catch {
        return null;
    }
}

export async function getWebpPrompt(dirHandle: FileSystemDirectoryHandle, filename: string): Promise<any | null> {
    try {
        //console.log(filename)
        const fileHandle = await dirHandle.getFileHandle(filename);
        //console.log(fileHandle)
        if (!fileHandle) return null;
        const file = await fileHandle.getFile();
        const arrayBuffer = await file.arrayBuffer();

        const fullText = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer));

        return {
            prompt: extractJsonField(fullText, 'Prompt:'),
            workflow: extractJsonField(fullText, 'Workflow:')
        };
    } catch (e) {
        console.error("WebPのパースに失敗しました:", e);
        return null;
    }
}

export async function getMpPrompt(dirHandle: FileSystemDirectoryHandle, filename: string): Promise<any | null> {
    try {
        const fileHandle = await dirHandle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        const tags = await mm.parseBlob(file);

        let rawWorkflow: any = null;
        let rawPrompt: any = null;

        // native 内の全コンテナ（ID3v2, ISO-14496-12 など）から Workflow / Prompt を探す
        if (tags.native) {
            for (const tagArray of Object.values(tags.native)) {
                for (const tag of tagArray) {
                    const keyLower = tag.id.toLowerCase();
                    if (keyLower === 'txxx:workflow') rawWorkflow = tag.value;
                    if (keyLower === 'txxx:prompt') rawPrompt = tag.value;
                }
            }
        }

        // ルートや common にもフォールバックとしてチェック
        rawWorkflow = rawWorkflow || (tags as any).Workflow || (tags as any).workflow;
        rawPrompt = rawPrompt || (tags as any).Prompt || (tags as any).prompt;

        if (!rawWorkflow && !rawPrompt) return null;

        const parseData = (raw: any) => {
            if (typeof raw === 'string') {
                try { return JSON.parse(raw); } catch { return raw; }
            }
            return raw;
        };

        return {
            workflow: parseData(rawWorkflow),
            prompt: parseData(rawPrompt)
        };
    } catch (error) {
        console.error('getMpPrompt read error:', error);
        return null;
    }
}

export async function getMetaDeta(dirHandle: FileSystemDirectoryHandle, filename: string): Promise<any | null> {
    const baseName = getBaseFilename(filename);
    const { extension } = splitFileName(baseName);
    let metadata = await getJsonPrompt(dirHandle, baseName);
    if (!metadata && (extension === 'png')) {
        metadata = await getPngPrompt(dirHandle, baseName);
    }
    if (!metadata && (extension === 'webp')) {
        metadata = await getWebpPrompt(dirHandle, baseName);
    }
    if (!metadata && (extension === 'mp4' || extension === 'mp3')) {
        metadata = await getMpPrompt(dirHandle, baseName);
    }
    return metadata;
}
