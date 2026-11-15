/**
 * The chalkboard on the workshop's back wall (docs/MODCAR.md §9: "黑板上的清单"): the first build's
 * checklist written in chalk, each step ticked off as it is done, a little drawing of the car beside it.
 * The DOM checklist says the same; this is the same list as part of the room. Drawn on a canvas, lit as
 * the room is (surfaceMaterial with a colour map).
 */
import * as THREE from 'three';
import { surfaceMaterial } from '../render/materials';

const W = 1024;
const H = 640;

export class Chalkboard {
  readonly mesh: THREE.Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly tex: THREE.CanvasTexture;
  private readonly mat: THREE.ShaderMaterial;
  private key = '';

  constructor(at: { x: number; y: number; z: number; w: number; h: number }) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = surfaceMaterial({ color: 0xffffff, map: this.tex, spec: 0 });
    const g = new THREE.PlaneGeometry(at.w - 0.02, at.h - 0.02);
    // (a plane faces +z; the board faces +x, into the room)
    g.rotateY(Math.PI / 2);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'garage:chalkboard';
    this.mesh.position.set(at.x + 0.003, at.y, at.z);
    this.draw('让「方糖」跑起来', []);
  }

  /** write the list again if it changed */
  show(title: string, steps: { text: string; done: boolean }[]): void {
    const key = title + steps.map((s) => `${s.text}${s.done ? 1 : 0}`).join('|');
    if (key === this.key) return;
    this.key = key;
    this.draw(title, steps);
  }

  private draw(title: string, steps: { text: string; done: boolean }[]): void {
    const c = this.canvas.getContext('2d')!;
    // the board: slate green, smudged with old chalk
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#2b3a33';
    c.fillRect(0, 0, W, H);
    let s = 7;
    const rnd = (): number => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < 26; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const r = 40 + rnd() * 160;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(210,220,210,${0.05 + rnd() * 0.06})`);
      g.addColorStop(1, 'rgba(210,220,210,0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    // an old sum half wiped away in a corner
    c.font = '34px KaiTi, STKaiti, "Microsoft YaHei", sans-serif';
    c.fillStyle = 'rgba(230,235,225,0.12)';
    c.fillText('45 L × 2 = 90', W - 300, H - 40);
    const chalk = (txt: string, x: number, y: number, size: number, colour: string, strike = false): number => {
      c.font = `${size}px KaiTi, STKaiti, "Microsoft YaHei", sans-serif`;
      for (let k = 0; k < 3; k++) {
        c.fillStyle = colour;
        c.globalAlpha = k === 0 ? 0.9 : 0.25;
        c.fillText(txt, x + (k === 1 ? 1.2 : k === 2 ? -0.8 : 0), y + (k === 2 ? 1 : 0));
      }
      c.globalAlpha = 1;
      const w = c.measureText(txt).width;
      if (strike) {
        c.strokeStyle = 'rgba(240,240,232,0.75)';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(x - 4, y - size * 0.32);
        c.lineTo(x + w + 6, y - size * 0.36 + 3);
        c.stroke();
      }
      return w;
    };
    chalk(`今天的活儿：${title}`, 48, 84, 50, '#f6efc8');
    c.strokeStyle = 'rgba(246,239,200,0.7)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(48, 100);
    c.quadraticCurveTo(300, 108, 600, 98);
    c.stroke();
    steps.forEach((st, i) => {
      const y = 158 + i * 56;
      // a box, ticked when done
      c.strokeStyle = 'rgba(240,240,232,0.85)';
      c.lineWidth = 3;
      c.strokeRect(56, y - 30, 30, 30);
      if (st.done) {
        c.strokeStyle = '#f3c35a';
        c.lineWidth = 6;
        c.beginPath();
        c.moveTo(58, y - 16);
        c.lineTo(70, y - 2);
        c.lineTo(96, y - 40);
        c.stroke();
      }
      chalk(st.text, 108, y, 38, st.done ? 'rgba(220,226,214,0.6)' : '#f2f1e8', st.done);
    });
    // a drawing of the little car, and an arrow to the door
    c.strokeStyle = 'rgba(240,240,232,0.85)';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(700, 430);
    c.lineTo(700, 392);
    c.lineTo(745, 388);
    c.lineTo(778, 350);
    c.lineTo(870, 350);
    c.lineTo(905, 388);
    c.lineTo(960, 394);
    c.lineTo(962, 430);
    c.closePath();
    c.stroke();
    for (const wx of [745, 912]) {
      c.beginPath();
      c.arc(wx, 432, 24, 0, Math.PI * 2);
      c.stroke();
    }
    c.font = '32px KaiTi, STKaiti, "Microsoft YaHei", sans-serif';
    c.fillStyle = '#f6efc8';
    c.fillText('方糖', 795, 412);
    c.strokeStyle = 'rgba(243,195,90,0.8)';
    c.beginPath();
    c.moveTo(980, 300);
    c.quadraticCurveTo(1000, 250, 960, 210);
    c.moveTo(960, 210);
    c.lineTo(984, 214);
    c.moveTo(960, 210);
    c.lineTo(962, 236);
    c.stroke();
    // chalk grain: tiny bites out of everything written
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = `rgba(0,0,0,${0.12 + rnd() * 0.25})`;
      c.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    c.globalCompositeOperation = 'destination-over';
    c.fillStyle = '#2b3a33';
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
