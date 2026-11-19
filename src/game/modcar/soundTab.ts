/**
 * The developer's tab 声音 (docs/V3/nodes/M4-audio.md): whether the sound archive is there and what of it has come
 * in, what has played from it, the country's beds and how loud each is now, what the radio is playing, what the
 * feet fall on; buttons to hear a footfall, a door, a thing picked up and a roll of thunder, and to switch the
 * archive off and on (the game's own synthesized sounds alone, to compare).
 *
 * Made of the panel's own pieces (kernel/devTabs.ts DevPane).
 */
import type { DevTab } from './kernel/devTabs';

export interface SoundStatus {
  /** the archive answered, and is in use */
  live: boolean;
  on: boolean;
  cues: number;
  decoded: number;
  failed: number;
  played: Record<string, number>;
  /** each bed: its gain, whether it plays, how loud it is heard (dB before the master) */
  beds: Record<string, { gain: number; playing: boolean; db: number }>;
  radio: { mode: string; station: number; song: string; at: number; paused: boolean } | null;
  station: string;
  /** sitting in a vehicle (no footfalls) */
  seated: boolean;
  footing: string;
  thunders: number;
}

export interface SoundTabHost {
  status(): SoundStatus;
  /** play a test sound: a footfall on what is underfoot, a car door, a thing picked up, thunder */
  test(what: 'step' | 'door' | 'pickup' | 'thunder'): void;
  /** the archive in use or not */
  setArchive(on: boolean): void;
}

/** what the feet fall on, and the beds, in words */
const FOOTING: Record<string, string> = { dirt: '泥土地', gravel: '碎石', snow: '雪地', carpet: '地毯', wood: '木地板', concrete: '路面、水泥地', metal: '铁板' };
const BED: Record<string, string> = {
  'bed:day': '白天（绿地）',
  'bed:night': '夜里（绿地）',
  'bed:day_desert': '白天（旱地）',
  'bed:night_desert': '夜里（旱地）',
  'bed:day_alpine': '白天（高寒）',
  'bed:night_alpine': '夜里（高寒）',
  'bed:wind_light': '微风',
  'bed:wind_heavy': '大风',
  'bed:blizzard': '暴风雪',
  'bed:rain_light': '小雨',
  'bed:rain_heavy': '大雨',
};

export function soundTab(host: SoundTabHost): DevTab {
  let box: HTMLElement | null = null;
  return {
    id: 'sound',
    title: '声音',
    order: 40,
    sub: '音频档案',
    hint: '档案里的录音替换游戏里的声音：读不到档案时用原来的合成声音。',
    build(p) {
      p.heading('音频档案');
      box = p.box('…');
      p.heading('试听');
      p.buttons(
        [
          { label: '脚步', tip: '在脚下的地面上走一步', click: () => host.test('step') },
          { label: '车门', tip: '关一下车门', click: () => host.test('door') },
          { label: '拿东西', tip: '拿起一样中等重的东西', click: () => host.test('pickup') },
          { label: '打雷', tip: '一道闪电之后的雷声', click: () => host.test('thunder') },
        ],
        2,
      );
      p.buttons(
        [
          { label: '用档案录音', go: true, tip: '游戏里的声音用档案里的录音', click: () => host.setArchive(true) },
          { label: '只用合成声音', tip: '关掉档案，听原来的合成声音（对比用）', click: () => host.setArchive(false) },
        ],
        2,
      );
      p.note('风、雨、白天黑夜的环境声跟着天气和时间走：在「天气」「时间」里调。');
    },
    tick() {
      if (!box) return;
      const s = host.status();
      const lines: string[] = [];
      lines.push(s.live ? (s.on ? `档案：在用 · ${s.cues} 种声音 · 已载入 ${s.decoded} 个录音${s.failed ? ` · ${s.failed} 个读不到` : ''}` : '档案：读到了，但现在关着（只用合成声音）') : '档案：没读到（用合成声音）');
      lines.push(`脚下：${s.seated ? '（坐在车里）' : (FOOTING[s.footing] ?? s.footing)}`);
      const r = s.radio;
      lines.push(r && r.mode !== 'off' ? `收音机：${s.station || '—'}${r.mode === 'archive' ? ` · ${Math.floor(r.at / 60)}:${String(Math.floor(r.at % 60)).padStart(2, '0')}${r.paused ? '（缓冲中）' : ''}` : '（合成的歌）'}` : '收音机：关着');
      const beds = Object.entries(s.beds)
        .filter(([, b]) => b.playing && b.db > -80)
        .sort((a, b) => b[1].db - a[1].db)
        .map(([k, b]) => `${BED[k] ?? k} ${b.db.toFixed(0)} dB`);
      lines.push(`环境声：${beds.length ? beds.join(' · ') : '—'}`);
      lines.push(`雷声：${s.thunders} 次`);
      const top = Object.entries(s.played)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, n]) => `${k}×${n}`);
      lines.push(`放过：${top.length ? top.join('  ') : '—'}`);
      box.innerHTML = lines.map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>');
    },
  };
}
