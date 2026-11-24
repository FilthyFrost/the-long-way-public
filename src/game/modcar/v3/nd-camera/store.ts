/**
 * The prints' pictures (docs/ND/PLAN.md): each one a JPEG of 547 x 512 (Nomad Drive's size; quality 0.75, its own),
 * kept in the browser's IndexedDB under the key the print carries (ItemState.photo.key) — the save holds only the
 * key, as Nomad Drive keeps its prints' images in files beside its save — and as a texture once it is wanted. A
 * picture just taken is a texture at once, from the canvas it was cut into; it is written to the store meanwhile.
 */
import * as THREE from 'three';

const DB = 'nd-photos';
const STORE = 'photos';

export class PhotoStore {
  private db: Promise<IDBDatabase | null> | null = null;
  private readonly tex = new Map<string, THREE.Texture>();
  private readonly asked = new Set<string>();
  /** pictures written (the harness) */
  written = 0;

  private open(): Promise<IDBDatabase | null> {
    if (this.db) return this.db;
    this.db = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.db;
  }

  /** a new picture from a canvas: its texture now, its JPEG into the store */
  add(key: string, canvas: HTMLCanvasElement): THREE.Texture {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    this.tex.set(key, t);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        void this.open().then((db) => {
          if (!db) return;
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(blob, key);
          tx.oncomplete = () => void this.written++;
        });
      },
      'image/jpeg',
      0.75,
    );
    return t;
  }

  /** a print's picture, null while it is being read (or when there is none: a print from another browser) */
  texture(key: string): THREE.Texture | null {
    const t = this.tex.get(key);
    if (t || !key || this.asked.has(key)) return t ?? null;
    this.asked.add(key);
    void this.open().then((db) => {
      if (!db) return;
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => {
        const blob = r.result as Blob | undefined;
        if (!blob) return;
        // (turned as a canvas texture is: flipY does nothing for a bitmap)
        void createImageBitmap(blob, { imageOrientation: 'flipY' }).then((bmp) => {
          const tx = new THREE.Texture(bmp);
          tx.colorSpace = THREE.SRGBColorSpace;
          tx.flipY = false;
          tx.needsUpdate = true;
          this.tex.set(key, tx);
        });
      };
    });
    return null;
  }

  dispose(): void {
    for (const t of this.tex.values()) t.dispose();
    this.tex.clear();
  }
}

/**
 * A print's picture: the texture developing (uDev 0 … 1) from a cold grey blue through a pale, bluish ghost of the
 * picture to its full colour, as an instant print does. Unlit: it reads in the shade (Nomad Drive's prints glow a
 * little, 1.5, for the same reason).
 */
export function pictureMaterial(): THREE.MeshBasicMaterial & { userData: { dev: { value: number } } } {
  const dev = { value: 0 };
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  m.userData.dev = dev;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDev = dev;
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform float uDev;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `
        vec3 rtUndev = vec3(0.30, 0.36, 0.45);
        #ifdef USE_MAP
          vec3 rtPic = texture2D( map, vMapUv ).rgb;
          float rtK = smoothstep(0.0, 0.8, uDev);
          float rtSat = smoothstep(0.3, 1.0, uDev);
          float rtL = dot(rtPic, vec3(0.299, 0.587, 0.114));
          vec3 rtNow = mix(vec3(rtL) * vec3(0.82, 0.9, 1.08), rtPic, rtSat);
          rtNow = mix(rtNow, rtNow * rtNow * 1.6, 0.15 * (1.0 - rtSat));
          diffuseColor.rgb *= mix(rtUndev, rtNow, rtK);
        #else
          diffuseColor.rgb *= rtUndev;
        #endif
        `,
      );
  };
  m.customProgramCacheKey = () => 'nd-print';
  return m as THREE.MeshBasicMaterial & { userData: { dev: { value: number } } };
}
