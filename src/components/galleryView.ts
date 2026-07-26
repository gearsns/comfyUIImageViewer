import { AppState } from '../state';
import { fetchImages, fetchPrompt, searchImages } from '../api';
import { formatBytes, formatDuration } from '../utils';
import { openFullscreen } from './fullscreenView';
import { initAddressBar, updateAddressBarPath } from './addressBar';

const grid = document.getElementById('grid') as HTMLDivElement;
const galleryInfo = document.getElementById('gallery-info') as HTMLDivElement;
const previewImg = document.getElementById('preview-img') as HTMLImageElement;
const previewVideo = document.getElementById('preview-video') as HTMLVideoElement;
const promptDisplay = document.getElementById('prompt-display') as HTMLDivElement;
const previeName = document.getElementById('preview-name') as HTMLSpanElement;
const metaResolution = document.getElementById('meta-resolution') as HTMLSpanElement;
const metaFilesize = document.getElementById('meta-filesize') as HTMLSpanElement;
const previewContainer = document.getElementById('preview-container');
const galleryContainer = document.getElementById('gallery-container') as HTMLHeadingElement;

let currentFolder = "";
const scrollPosList: Record<string, number> = {};

export async function loadImages(folderPath: string) {
    galleryInfo.classList.toggle("is-hidden", true);
    scrollPosList[currentFolder] = galleryContainer.scrollTop;
    grid.innerHTML = '<p>読み込み中...</p>';
    try {
        currentFolder = folderPath;

        updateAddressBarPath(folderPath);

        const images = await fetchImages(folderPath);
        AppState.setImages(images);

        if (images.length === 0) {
            grid.innerHTML = '<p>このフォルダに画像はありません</p>';
            return;
        }
        renderGrid();
        galleryContainer.scrollTop = scrollPosList[folderPath] ?? 0;
    } catch (error) {
        grid.innerHTML = '<p class="error">画像の取得に失敗しました</p>';
    }
}

function renderGrid() {
    grid.innerHTML = '';
    AppState.currentImagesList.forEach(img => {
        const item = document.createElement('div');
        item.className = 'thumb-item';
        const imageUrl = img.relPath;

        if (img.type === 'dir') {
            item.classList.add("folder");
            if (img.sampleImage) {
                if (img.sampleImage.endsWith(".mp3")) {
                    item.innerHTML = `
                        <div class="audio">♪</div>
                        <div class="thumb-name">${img.name}</div>
                    `;
                } else if (img.sampleImage.endsWith(".mp4")) {
                    item.innerHTML = `
                        <video src="${img.sampleImage}" alt="${img.sampleImage}"
                            muted loop preload="metadata"
                        ></video>
                        <div class="thumb-name">${img.name}</div>
                    `;
                } else {
                    item.innerHTML = `
                        <img src="${img.sampleImage}" alt="${img.sampleImage}" loading="lazy" />
                        <div class="thumb-name">${img.name}</div>
                    `;
                }
            } else {
                item.innerHTML = `
                    <div class="no-image">📁</div>
                    <div class="thumb-name">${img.name}</div>
                `;
            }
            item.addEventListener('dblclick', () => loadImages(img.relPath));
        } else {
            if (img.name.endsWith(".mp3")) {
                item.innerHTML = `
                    <div class="audio">♪</div>
                    <div class="thumb-name">${img.name}</div>
                `;
                item.addEventListener('click', () => selectImage(img.name, imageUrl, img.relPath));
            } else if (img.name.endsWith(".mp4")) {
                item.innerHTML = `
                <video src="${imageUrl}" alt="${img.name}"
                muted loop preload="metadata"
                ></video>
                <div class="thumb-name">${img.name}</div>
                `;
                item.addEventListener('click', () => selectImage(img.name, imageUrl, img.relPath));
            } else {
                item.innerHTML = `
                    <img src="${imageUrl}" alt="${img.name}" loading="lazy" />
                    <div class="thumb-name">${img.name}</div>
                `;
                const handleSelect = () => {
                    if (previewContainer?.classList.contains('collapsed')) {
                        openFullscreen(imageUrl, img.name);
                    } else {
                        selectImage(img.name, imageUrl, img.relPath);
                    }
                };

                item.addEventListener('click', handleSelect);
                item.addEventListener('dblclick', () => openFullscreen(imageUrl, img.name));
            }
        }
        grid.appendChild(item);
    });
}

export async function selectImage(name: string, url: string, relPath: string) {
    const previewContainer = document.getElementById('preview-container');
    previewContainer?.classList.add('has-selection');

    const cachedData = AppState.imageCache[name];
    metaResolution.textContent = ``;

    if (name.endsWith(".mp3") || name.endsWith(".mp4")) {
        previewContainer?.classList.remove('image');
        previewContainer?.classList.add('video');
        previewVideo.src = url;
        previewImg.onload = () => { };
        previewVideo.onloadedmetadata = () => {
            if (previewVideo.videoWidth === 0) {
                metaResolution.textContent = `${formatDuration(previewVideo.duration)}`;
            } else {
                metaResolution.textContent = `${previewVideo.videoWidth} × ${previewVideo.videoHeight} ${formatDuration(previewVideo.duration)}`;
            }
        };
    } else {
        previewContainer?.classList.remove('video');
        previewContainer?.classList.add('image');
        previewImg.src = url;

        promptDisplay.textContent = 'プロンプトを確認中...';
        AppState.updateIndexByName(name);

        previewVideo.onloadedmetadata = () => { };
        previewImg.onload = () => {
            metaResolution.textContent = `${previewImg.naturalWidth} × ${previewImg.naturalHeight}`;
        };
    }
    metaFilesize.textContent = cachedData?.size ? formatBytes(cachedData.size) : '-';
    previeName.textContent = name;

    if (cachedData?.sidecarPrompt) {
        promptDisplay.textContent = JSON.stringify(cachedData.sidecarPrompt, null, 2);
        return;
    }

    try {
        promptDisplay.textContent = '同名JSONなし。画像の内部メタデータを解析中...';
        const metadata = await fetchPrompt(relPath);
        promptDisplay.textContent = metadata
            ? JSON.stringify(metadata, null, 2)
            : 'ComfyUIのプロンプトデータが見つかりませんでした。';
    } catch (err) {
        promptDisplay.textContent = 'メタデータの解析に失敗しました。';
    }
}

// プレビュー画像クリックでフルスクリーンのトリガー
previewImg.addEventListener('click', () => {
    if (previewImg.src && AppState.currentImageIndex !== -1) {
        const targetImage = AppState.currentImagesList[AppState.currentImageIndex];
        openFullscreen(previewImg.src, targetImage.name);
    }
});

export async function search(query: string) {
    scrollPosList[currentFolder] = galleryContainer.scrollTop;
    grid.innerHTML = '<p>読み込み中...</p>';
    try {
        currentFolder = query;

        updateAddressBarPath(query);

        const images = await searchImages(query);
        AppState.setImages(images);

        if (images.length === 0) {
            grid.innerHTML = '<p>この検索結果に画像はありません</p>';
            return;
        }
        renderGrid();
        galleryContainer.scrollTop = scrollPosList[query] ?? 0;
    } catch (error) {
        grid.innerHTML = '<p class="error">画像の取得に失敗しました</p>';
    }
}

initAddressBar(loadImages, search);
