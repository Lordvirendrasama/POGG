// Asset Loader and Image Sprite Manager for High-Fidelity Graphics

class AssetManager {
  constructor() {
    this.images = {};
    this.loaded = false;
  }

  load() {
    const assets = {
      arenaBg: '/arena_bg.jpg',
      strikerCyan: '/striker_cyan.jpg',
      strikerMagenta: '/striker_magenta.jpg',
      puckCore: '/puck_core.jpg',
      puckKinetic: '/puck_kinetic.jpg',
      puckSolar: '/puck_solar.jpg',
      puckVoid: '/puck_void.jpg',
      puckMatrix: '/puck_matrix.jpg',
      vortexSingularity: '/vortex_singularity.jpg',
      titanShield: '/titan_shield.jpg',
    };

    const promises = Object.entries(assets).map(([key, src]) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          this.images[key] = img;
          resolve();
        };
        img.onerror = () => {
          console.warn(`Could not load asset: ${src}`);
          resolve(); // Resolve anyway so game doesn't crash if asset fails
        };
        img.src = src;
      });
    });

    return Promise.all(promises).then(() => {
      this.loaded = true;
    });
  }

  get(name) {
    return this.images[name];
  }
}

export const assets = new AssetManager();
