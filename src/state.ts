import type { ImageData } from './types';

export const AppState = {
  currentFolder: '/',
  currentImagesList: [] as ImageData[],
  currentImageIndex: -1,
  imageCache: {} as Record<string, ImageData>,

  setImages(images: ImageData[]) {
    this.currentImagesList = images;
    this.imageCache = {};
    images.forEach(img => {
      this.imageCache[img.name] = img;
    });
  },

  updateIndexByName(name: string) {
    this.currentImageIndex = this.currentImagesList.findIndex(img => img.name === name);
  }
};
