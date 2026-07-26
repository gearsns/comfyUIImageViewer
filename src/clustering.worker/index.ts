import * as Comlink from 'comlink';
import { pipeline, env } from '@huggingface/transformers';
import { type ClusteringConfig } from './types';
import { loadResultDb, loadTmpDb, saveResultDb, saveTmpDb } from './utils/sqlite';
import { scanImageFiles } from './utils/file-system';
import { clusterFromHighSimilarity, cosineSimilarity, normalizeVector } from './utils/clustering';
import { store } from '../store';
import { getMetaDeta } from '../utils/metadataParser';

env.allowLocalModels = false;

const SAVE_INTERVAL_MS = 10000;
// 特徴ベクトルの保存次元数（キャッシュ・非キャッシュ両方で必ずこの長さに揃える）
const FEATURE_DIM = 384;

// 進捗通知用コールバックの型定義
export type ProgressCallback = (data: { current: number; total: number; label: string }) => void;
export type StatusCallback = (message: string) => void;

// 💡 Float32 から Float16 (Uint16Array) への簡易変換関数
function float32ToFloat16(f32Array: Float32Array): Uint16Array {
    const f16Array = new Uint16Array(f32Array.length);
    const buffer = new ArrayBuffer(2);
    const view = new DataView(buffer);

    for (let i = 0; i < f32Array.length; i++) {
        view.setFloat16(0, f32Array[i], true);
        f16Array[i] = view.getUint16(0, true);
    }
    return f16Array;
}

// 💡 Uint16Array (Float16) から Float32Array への復元関数
function float16ToFloat32(f16Array: Uint16Array): Float32Array {
    const f32Array = new Float32Array(f16Array.length);
    for (let i = 0; i < f16Array.length; i++) {
        const buffer = new ArrayBuffer(2);
        const view = new DataView(buffer);
        view.setUint16(0, f16Array[i], true);
        f32Array[i] = view.getFloat16(0, true);
    }
    return f32Array;
}

const api = {
    async deleteModel(modelId: string) {
        const cache = await caches.open('transformers-cache');
        const requests = await cache.keys();
        for (const req of requests) {
            if (req.url.includes(modelId)) {
                await cache.delete(req);
            }
        }
    },
    async processDirectory(
        id: string,
        config: ClusteringConfig,
        onStatus?: StatusCallback,
        onProgress?: ProgressCallback
    ) {
        const item = await store.session.get(id);
        if (!item?.dir) {
            return;
        }
        const dirHandle: FileSystemDirectoryHandle = item.dir;
        onStatus?.('データベース初期化中...');
        const tmpDb = await loadTmpDb(dirHandle);

        onStatus?.('フォルダ内画像をスキャン中...');
        const scannedFiles = await scanImageFiles(dirHandle);
        const diskPathSet = new Set(scannedFiles.map((f) => f.relativePath));
        // DBにあってディスクから消えた画像をクリーンアップ
        const stmtCleanup = tmpDb.prepare(
            "SELECT file_path FROM files_metadata WHERE media_type = 'image'"
        );
        const toDelete: string[] = [];
        while (stmtCleanup.step()) {
            const row = stmtCleanup.getAsObject();
            const path = row.file_path as string;
            if (!diskPathSet.has(path)) {
                toDelete.push(path);
            }
        }
        stmtCleanup.free();
        for (const delPath of toDelete) {
            tmpDb.run("DELETE FROM files_metadata WHERE file_path = ?", [delPath]);
            tmpDb.run("DELETE FROM features_image_cache WHERE file_path = ?", [delPath]);
        }

        const validFiles: {
            relPath: string;
            feature: Float32Array;
            jsonText: string;
            prompt: string;
        }[] = [];

        onStatus?.('DINOv2 モデルをロード中...');
        // DINOv2 ONNXモデルのロード
        const extractor = await pipeline('image-feature-extraction', 'onnx-community/dinov2-small', {
            device: 'webgpu',
            dtype: 'fp32',
        });
        // 画像特徴量の解析・キャッシュ登録
        let isTmpDBModify = false;
        let lastSaveTime = performance.now();
        for (let i = 0; i < scannedFiles.length; i++) {
            const item = scannedFiles[i];

            // キャッシュに存在し、ファイルサイズ・更新日時が一致するか確認
            const stmt = tmpDb.prepare(`
                SELECT m.file_path, c.feature_blob, c.json_text, c.prompt 
                FROM files_metadata m
                JOIN features_image_cache c ON m.file_path = c.file_path
                WHERE m.file_path = ? AND m.file_size = ? AND m.mtime = ?
            `);
            stmt.bind([item.relativePath, item.file.size, item.file.lastModified]);

            if (stmt.step()) {
                // キャッシュヒット！
                const row = stmt.getAsObject();
                const blob = row.feature_blob as Uint8Array;
                const f16Array = new Uint16Array(blob.buffer, blob.byteOffset, blob.byteLength / 2);
                const featArray = float16ToFloat32(f16Array); // Float32 に復元して計算に使用
                validFiles.push({
                    relPath: item.relativePath,
                    feature: featArray,
                    jsonText: (row.json_text as string) || '',
                    prompt: (row.prompt as string) || '',
                });
                stmt.free();
                continue;
            }
            stmt.free();
            onProgress?.({ current: i + 1, total: scannedFiles.length, label: item.relativePath });

            const metadata = await getMetaDeta(item.dirHandle, item.file.name);
            const jsonText = JSON.stringify(metadata) ?? "";
            const prompt = (metadata ? JSON.stringify(metadata["prompt"]) : "") ?? "";

            // 画像のロードとDINOv2特徴量抽出
            console.time('Inference');
            const imageUrl = URL.createObjectURL(item.file);
            const output = await extractor(imageUrl);
            URL.revokeObjectURL(imageUrl);
            console.timeEnd('Inference');

            const featArray = normalizeVector(Float32Array.from(output.data.slice(0, FEATURE_DIM)));
            const f16Array = float32ToFloat16(featArray);  // 半精度化 (サイズ半分)
            const blobUint8 = new Uint8Array(f16Array.buffer);

            if (!isTmpDBModify) {
                isTmpDBModify = true;
            }
            // キャッシュに保存
            tmpDb.run(
                `INSERT OR REPLACE INTO files_metadata (file_path, media_type, file_size, mtime) VALUES (?, 'image', ?, ?)`,
                [item.relativePath, item.file.size, item.file.lastModified]
            );
            tmpDb.run(
                `INSERT OR REPLACE INTO features_image_cache (file_path, feature_blob, json_text, prompt) VALUES (?, ?, ?, ?)`,
                [item.relativePath, blobUint8, jsonText, prompt]
            );
            validFiles.push({
                relPath: item.relativePath,
                feature: featArray,
                jsonText: jsonText,
                prompt: prompt,
            });
            if ((i % 100) === 0) {
                const now = performance.now();
                if (now - lastSaveTime >= SAVE_INTERVAL_MS) {
                    await saveTmpDb(dirHandle, tmpDb);
                    lastSaveTime = performance.now();
                }
            }
        }

        // 変更されたキャッシュDB (similar_images_tmp.db) を保存
        if (isTmpDBModify) {
            onStatus?.('キャッシュDBを保存中...');
            await saveTmpDb(dirHandle, tmpDb);
        }
        tmpDb.close();
        onStatus?.('類似度グループ分け計算中...');
        const features = validFiles.map((v) => v.feature);
        const normFeatures = features.map(normalizeVector);
        const allIndices = validFiles.map((_, idx) => idx);

        // 階層クラスタリング＋細分化
        const groups = await clusterFromHighSimilarity(
            allIndices,
            normFeatures,
            config.maxMembers,
            onStatus
        )

        // 結果のDB格納
        onStatus?.('DB格納中...');
        const resultDb = await loadResultDb(dirHandle);
        // 前回の 'image' の判定結果のみクリア（他メディア結果を消さないため）
        resultDb.run("DELETE FROM similar_groups WHERE media_type = 'image'");
        resultDb.run("BEGIN TRANSACTION");
        let groupId = 1;
        try {
            for (const indices of groups) {
                if (indices.length <= 1) {
                    for (const idx of indices) {
                        const item = validFiles[idx];
                        resultDb.run(
                            `INSERT INTO similar_groups (group_id, media_type, file_path, is_reference, similarity, json_text, prompt) VALUES (?, 'image', ?, ?, ?, ?, ?)`,
                            [-1, item.relPath, 0, 0, item.jsonText, item.prompt]
                        );
                    }
                    continue;
                }
                // グループ内の代表画像（中心画像）の決定
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

                // レコード作成
                for (const idx of indices) {
                    const item = validFiles[idx];
                    const isRef = idx === bestRefIdx ? 1 : 0;
                    const simVal = cosineSimilarity(normFeatures[bestRefIdx], normFeatures[idx]);

                    resultDb.run(
                        `INSERT INTO similar_groups (group_id, media_type, file_path, is_reference, similarity, json_text, prompt) VALUES (?, 'image', ?, ?, ?, ?, ?)`,
                        [groupId, item.relPath, isRef, simVal, item.jsonText, item.prompt]
                    );
                }
                groupId++;
            }
            resultDb.run("COMMIT");
        } catch (e) {
            resultDb.run("ROLLBACK");
            throw e;
        }
        // 結果DB (similar_images.db) を保存
        onStatus?.('データベースをファイルに保存中...');
        await saveResultDb(dirHandle, resultDb);
        resultDb.close();

        onStatus?.('保存完了！');
        return { groupCount: groupId - 1 };
    },
}

export type ImageScanWorkerApi = typeof api;
Comlink.expose(api);
