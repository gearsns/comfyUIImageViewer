import { AppState } from '../state';
import { selectImage } from './galleryView';

const fullscreenOverlay = document.getElementById('fullscreen-overlay') as HTMLDivElement;
const fullscreenImg = document.getElementById('fullscreen-img') as HTMLImageElement;
const closeFullscreenBtn = document.getElementById('close-fullscreen-btn') as HTMLDivElement;
const prevBtn = document.getElementById('prev-btn') as HTMLDivElement;
const nextBtn = document.getElementById('next-btn') as HTMLDivElement;

let isOriginalSize = false;

export function openFullscreen(url: string, name: string) {
    AppState.updateIndexByName(name);
    fullscreenImg.src = url;
    fullscreenOverlay.style.display = 'block';
    resetToFitSize();
    updateNavButtons();
}

function closeFullscreen() {
    fullscreenOverlay.style.display = 'none';
    fullscreenImg.src = '';
    isOriginalSize = false;
}

function toggleOriginalSize(toOriginal: boolean) {
    isOriginalSize = toOriginal;
    fullscreenImg.classList.toggle('is-original', toOriginal);
}

function resetToFitSize() {
    toggleOriginalSize(false);
}

function setToOriginalSize() {
    toggleOriginalSize(true);
}

function switchImage(index: number) {
    if (index < 0 || index >= AppState.currentImagesList.length) return;

    AppState.currentImageIndex = index;
    const targetImage = AppState.currentImagesList[index];
    const imageUrl = targetImage.relPath;

    fullscreenImg.src = imageUrl;
    resetToFitSize();
    updateNavButtons();
    selectImage(targetImage.name, imageUrl, targetImage.relPath);
}

function updateNavButtons() {
    prevBtn.style.display = AppState.currentImageIndex <= 0 ? 'none' : 'block';
    nextBtn.style.display = AppState.currentImageIndex >= AppState.currentImagesList.length - 1 ? 'none' : 'block';
}

// イベントバインド
fullscreenImg.addEventListener('click', (e) => {
    e.stopPropagation();
    isOriginalSize ? resetToFitSize() : setToOriginalSize();
});

fullscreenOverlay.addEventListener('click', closeFullscreen);
closeFullscreenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeFullscreen();
});

prevBtn.addEventListener('click', (e) => { e.stopPropagation(); switchImage(AppState.currentImageIndex - 1); });
nextBtn.addEventListener('click', (e) => { e.stopPropagation(); switchImage(AppState.currentImageIndex + 1); });

window.addEventListener('keydown', (e) => {
    if (fullscreenOverlay.style.display !== 'block') return;
    if (e.key === 'ArrowLeft' || e.key === 'Left') switchImage(AppState.currentImageIndex - 1);
    if (e.key === 'ArrowRight' || e.key === 'Right') switchImage(AppState.currentImageIndex + 1);
    if (e.key === 'Escape') closeFullscreen();
});

fullscreenImg.addEventListener('dragstart', (e) => e.preventDefault());
