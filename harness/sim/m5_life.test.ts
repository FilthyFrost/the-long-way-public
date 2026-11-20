import { localMonth, sceneMonth, sceneMonthAt } from '../../src/core/world/sceneSeason';
import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { WeatherState } from '../../src/core/env/weather';
import { ECO_PROFILES } from '../../src/core/world/data/ecoProfiles';
import { World } from '../../src/core/world/terrain';
import { profileFor, animals, inSeason, suits, cellHash, anchor, ringCell, CELL_COUNT, GROUP_LIMIT, type Habitat } from '../../src/core/v3/life/rules';
import { Life } from '../../src/game/modcar/v3/life/system';
import type { GameContext } from '../../src/game/modcar/kernel/context';
import { ALLOCATES, heapGrowth } from './v3/heap';

describe('wayside life',()=>{
  it('takes its names from the actual profile, including across hemispheres',()=>{
    const weather=new WeatherState();
    for(const p of ECO_PROFILES) {
      expect(profileFor(p.id)).toBe(p);
      for(const name of Object.keys(animals)) {
        const present=p.birds.some(b=>b.name===name)||p.insects.some(i=>i.name===name);
        if(!present) expect(inSeason(p,name,6,14,weather)).toBe(false);
      }
    }
    expect(inSeason(profileFor('cape-fynbos')!,'粉蝶类',3,14,weather)).toBe(false);
    expect(inSeason(profileFor('cape-fynbos')!,'粉蝶类',11,14,weather)).toBe(true);
    expect(profileFor('unknown')).toBeUndefined();
    expect(sceneMonth('maple')).toBe(10);
    expect(sceneMonth('alpine')).toBe(1);
    expect(localMonth('maple','alpine',2/3)).toBe(12);
    expect(sceneMonthAt('alpine','maple',1/3)).toBe(12);
    expect(sceneMonthAt('wetland','lakes',0.83)).toBe(1);
    expect(sceneMonth('unknown')).toBe(6);
  });
  it('requires a warm summer night and a damp site for Appalachian fireflies',()=>{
    const w=new WeatherState(),p=profileFor('appalachian')!;
    expect(inSeason(p,'萤火虫',7,21,w)).toBe(true);
    expect(inSeason(p,'萤火虫',7,14,w)).toBe(false);
    expect(inSeason(p,'萤火虫',12,21,w)).toBe(false);
    expect(inSeason(p,'红眼莺雀',7,21,w)).toBe(false);
    w.temp=8;
    expect(inSeason(p,'萤火虫',7,21,w)).toBe(false);
    const h={moisture:.2,field:true,wet:false} as Habitat;
    expect(suits(animals['萤火虫'],h)).toBe(false);
    h.moisture=.7;expect(suits(animals['萤火虫'],h)).toBe(true);
  });
  it('suppresses flight in downpours and storms, permits no snowy-pass night fauna',()=>{
    const w=new WeatherState(),p=profileFor('central-alps')!;
    for(const a of [...p.birds,...p.insects]) expect(inSeason(p,a.name,6,23,w)).toBe(false);
    w.rain=.8; expect(inSeason(p,'黄嘴山鸦',6,12,w)).toBe(false);
    w.rain=0;w.kind='storm';expect(inSeason(p,'黄嘴山鸦',6,12,w)).toBe(false);
    w.kind='clear';expect(inSeason(p,'黄嘴山鸦',6,12,w)).toBe(true);
  });
  it('distinguishes salt water, fresh water, a shallow bank and a flowering patch',()=>{
    const h={wet:true,kind:3,depth:2,nearWater:0,flowers:false} as Habitat;
    expect(suits(animals['银鸥'],h)).toBe(true);
    expect(suits(animals['蜻蜓'],h)).toBe(false);
    h.kind=1;
    expect(suits(animals['蜻蜓'],h)).toBe(true);
    expect(suits(animals['白鹭'],h)).toBe(false);
    h.depth=.2; expect(suits(animals['白鹭'],h)).toBe(true);
    expect(suits(animals['熊蜂'],h)).toBe(false);
    h.wet=false;h.flowers=true; expect(suits(animals['熊蜂'],h)).toBe(true);
  });
  it('recycles only the far column of a moving ring and reproduces every anchor on return',()=>{
    const places=(center:number)=>Array.from({length:5},(_,r)=>ringCell(center,r));
    for(const c of [-100,-3,-1,0,1,4,106]) {
      const a=places(c),b=places(c+1);
      expect(new Set(a).size).toBe(5);
      expect(Math.min(...a)).toBe(c-2);
      expect(a.filter((x,i)=>x===b[i])).toHaveLength(4);
      const sample=()=>a.map(x=>anchor(x,32,cellHash(x,10,127,0)));
      const first=sample();places(c+100); expect(sample()).toEqual(first);
      expect(cellHash(c,10,127,0)).not.toBe(cellHash(c,10,127,1));
    }
  });
  it('keeps a bounded live pool with no steady-state allocation in the driving update',()=>{
    const sys=new Life(),camera=new T.PerspectiveCamera();
    const w=new World(7,{worldVersion:2,startBiome:'plains'}), scene=new T.Scene();
    const ctx={world:w,core:{scene,camera,origin:{x:0,y:0,z:0}},env:{sky:{daylight:1},state:new WeatherState()},
      clock:{hour:14,day:0},player:{walker:{x:0,z:0}},loose:{list:[]}} as unknown as GameContext;
    camera.position.set(600,4,20);sys.init(ctx);
    for(let x=3;x<=6;x++)for(let z=-2;z<=2;z++)w.eco!.tile(x,z);
    const frame=()=>sys.lateUpdate(1/60,ctx);
    for(let i=0;i<120;i++) frame();
    expect(sys.count).toBeGreaterThan(0);
    expect(sys.count).toBeLessThanOrEqual(2*CELL_COUNT*GROUP_LIMIT);
    expect(heapGrowth(frame)).toBeLessThan(ALLOCATES/4);
    ctx.env.state.kind='storm';frame();
    expect(sys.count).toBe(0); expect(sys.paint.root.visible).toBe(false);
    sys.dispose();expect(scene.children.length).toBe(0);
  });
});
