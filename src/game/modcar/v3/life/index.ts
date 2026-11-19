import { animals } from '../../../../core/v3/life/rules';
import type { GameModule } from '../../kernel/modules';
import { Life } from './system';

const life=new Life();
let status:HTMLElement;
let choices:HTMLSelectElement;
let last='';
export default {
  id:'life',systems:[life],
  devTabs:[{
    id:'life', title:'生灵',sub:'附近的鸟和昆虫',
    build(pane) {
      status=pane.box();
      choices=document.createElement('select');
      choices.setAttribute('aria-label','本地物种');
      pane.body.append(choices);
      pane.buttons([
        {label:'召来所选物种',click:()=>life.show(choices.value)},
        {label:'恢复自然分布',click:()=>life.show()},
      ]);
      pane.note('召来时仍要有适合的天气、月份和栖息地。站在花丛、水边或林缘观察。');
      last='';
    },
    tick() {
      const p=life.region;
      if(!status) return;
      if(last!==p?.id) {
        choices.replaceChildren();
        if(p) for(const entry of [...p.birds,...p.insects]) {
          if(!animals[entry.name]) continue;
          const o=document.createElement('option');o.value=entry.name;o.textContent=entry.name+' · '+entry.habitat;choices.add(o);
        }
        last=p?.id??'';
      }
      status.textContent=(p?.name??'未指定生态档案')+' · '+life.month+'月 · 附近 '+life.count+' 只';
    },
  }],
} satisfies GameModule;
