import { describe, expect, it } from 'vitest';
import { applySecondaryPromotion, findKeyConflicts, gateRightActions, ND_HOLD_S, resolveArbiter, type CandidateBinding } from '../../src/game/modcar/arbiter';

describe('ND unified interaction arbiter (zero key conflicts K1-K13)', () => {
  it('K1/K1b: repair kit over loose or mounted engine offers ONLY hold-LMB repair (never pick up or detach)', () => {
    const res = resolveArbiter({
      mode: 'foot',
      target: [{ id: 'kit.repair', key: 'LMB', hold: true, holdS: ND_HOLD_S.repair, text: '修理 <b>发动机</b>' }],
      held: [{ id: 'kit.hint', key: 'LMB', hold: true, holdS: ND_HOLD_S.repair, text: '修理 <b>发动机</b>' }],
      extra: [
        { id: 'held.throw', key: 'Q', text: '投掷' },
        { id: 'held.place', key: 'R', text: '摆放' },
      ],
    });
    expect(res.byKey.get('LMB')?.id).toBe('kit.repair');
    expect(res.center).toHaveLength(1);
    expect(res.center[0].keys).toEqual(['LMB']);
    expect(res.center[0].hold).toBe(true);
    // Held-item duplicate on LMB is withheld from the right list because target claimed LMB
    expect(res.right.map((a) => a.keys)).toEqual([['Q'], ['R']]);
    expect(findKeyConflicts(res.center, res.right)).toEqual([]);
  });

  it('K2: printed photo at a car door promotes stick override cleanly without opening the door', () => {
    const res = resolveArbiter({
      mode: 'foot',
      target: [
        { id: 'photo.stick', key: 'LMB', text: '贴上' },
        { id: 'photo.roll', key: 'Wheel', text: '转 90°' },
      ],
      held: [{ id: 'photo.look', key: 'RMB', hold: true, text: '看' }],
      extra: [
        { id: 'held.throw', key: 'Q', text: '投掷' },
        { id: 'held.place', key: 'R', text: '摆放' },
      ],
    });
    expect(res.byKey.get('LMB')?.id).toBe('photo.stick');
    expect(res.byKey.get('Wheel')?.id).toBe('photo.roll');
    expect(res.byKey.get('RMB')?.id).toBe('photo.look');
    expect(findKeyConflicts(res.center, res.right)).toEqual([]);
  });

  it('K3/K4: functional vehicle parts (door, front seat) separate LMB tap function from hold-E detach', () => {
    const door = resolveArbiter({
      mode: 'foot',
      target: [
        { id: 'door.toggle', key: 'LMB', text: '打开 <b>车门</b>' },
        { id: 'part.detach', key: 'E', secondarySlot: true, hold: true, holdS: ND_HOLD_S.detach, text: '拆下 <b>车门</b>' },
      ],
    });
    expect(door.promotedSecondary).toBe(false);
    expect(door.byKey.get('LMB')?.id).toBe('door.toggle');
    expect(door.byKey.get('LMB')?.hold).toBe(false);
    expect(door.byKey.get('E')?.id).toBe('part.detach');
    expect(door.byKey.get('E')?.hold).toBe(true);
    expect(findKeyConflicts(door.center, door.right)).toEqual([]);

    const seat = resolveArbiter({
      mode: 'foot',
      target: [
        { id: 'seat.enter', key: 'LMB', text: '上车' },
        { id: 'part.detach', key: 'E', secondarySlot: true, hold: true, holdS: ND_HOLD_S.detach, text: '拆下 <b>座椅</b>' },
      ],
    });
    expect(seat.promotedSecondary).toBe(false);
    expect(seat.byKey.get('LMB')?.id).toBe('seat.enter');
    expect(seat.byKey.get('E')?.id).toBe('part.detach');
    expect(findKeyConflicts(seat.center, seat.right)).toEqual([]);
  });

  it('ND secondary promotion: non-functional mounted part & empty slot promote E to LMB', () => {
    const engine = resolveArbiter({
      mode: 'foot',
      target: [{ id: 'part.detach', key: 'E', secondarySlot: true, hold: true, holdS: ND_HOLD_S.detach, text: '拆下 <b>发动机</b>' }],
    });
    expect(engine.promotedSecondary).toBe(true);
    expect(engine.byKey.get('LMB')?.id).toBe('part.detach');
    expect(engine.byKey.get('LMB')?.hold).toBe(true);
    expect(engine.byKey.has('E')).toBe(false);

    const slot = resolveArbiter({
      mode: 'foot',
      target: [{ id: 'slot.attach', key: 'E', secondarySlot: true, hold: true, holdS: ND_HOLD_S.attach, text: '装上 <b>轮胎</b>' }],
      extra: [
        { id: 'held.throw', key: 'Q', text: '投掷' },
        { id: 'held.place', key: 'R', text: '摆放' },
      ],
    });
    expect(slot.promotedSecondary).toBe(true);
    expect(slot.byKey.get('LMB')?.id).toBe('slot.attach');
    expect(slot.byKey.get('LMB')?.holdS).toBe(0.35);
    expect(findKeyConflicts(slot.center, slot.right)).toEqual([]);
  });

  it('K5/K6: loose wheel with tyre & appliance with use separate LMB tap from hold-E secondary', () => {
    const wheel = resolveArbiter({
      mode: 'foot',
      target: [
        { id: 'loose.take', key: 'LMB', text: '拿起 <b>车轮</b>' },
        { id: 'loose.detachSub', key: 'E', secondarySlot: true, hold: true, holdS: ND_HOLD_S.detach, text: '拆下轮胎' },
      ],
    });
    expect(wheel.promotedSecondary).toBe(false);
    expect(wheel.byKey.get('LMB')?.id).toBe('loose.take');
    expect(wheel.byKey.get('E')?.id).toBe('loose.detachSub');
    expect(findKeyConflicts(wheel.center, wheel.right)).toEqual([]);

    const stove = resolveArbiter({
      mode: 'foot',
      target: [
        { id: 'device.use', key: 'LMB', text: '点火' },
        { id: 'device.grab', key: 'E', secondarySlot: true, hold: true, holdS: ND_HOLD_S.grab, text: '拿起 <b>炉子</b>' },
      ],
    });
    expect(stove.byKey.get('LMB')?.id).toBe('device.use');
    expect(stove.byKey.get('E')?.id).toBe('device.grab');
    expect(findKeyConflicts(stove.center, stove.right)).toEqual([]);
  });

  it('K7: flashlight separates E toggle from LMB focus (and RMB stays eye zoom)', () => {
    const res = resolveArbiter({
      mode: 'foot',
      held: [
        { id: 'light.toggle', key: 'E', text: '打开' },
        { id: 'light.focus', key: 'LMB', hold: true, text: '聚光' },
      ],
      extra: [
        { id: 'held.throw', key: 'Q', text: '投掷' },
        { id: 'held.place', key: 'R', text: '摆放' },
      ],
    });
    expect(res.byKey.get('E')?.id).toBe('light.toggle');
    expect(res.byKey.get('LMB')?.id).toBe('light.focus');
    expect(res.byKey.has('RMB')).toBe(false);
    expect(findKeyConflicts(res.center, res.right)).toEqual([]);

    // When aiming at a door while holding flashlight: door LMB + hold-E detach suppress flashlight LMB + E!
    const atDoor = resolveArbiter({
      mode: 'foot',
      target: [
        { id: 'door.toggle', key: 'LMB', text: '打开 <b>车门</b>' },
        { id: 'part.detach', key: 'E', secondarySlot: true, hold: true, holdS: ND_HOLD_S.detach, text: '拆下 <b>车门</b>' },
      ],
      held: [
        { id: 'light.toggle', key: 'E', text: '打开' },
        { id: 'light.focus', key: 'LMB', hold: true, text: '聚光' },
      ],
      extra: [
        { id: 'held.throw', key: 'Q', text: '投掷' },
        { id: 'held.place', key: 'R', text: '摆放' },
      ],
    });
    expect(atDoor.byKey.get('LMB')?.id).toBe('door.toggle');
    expect(atDoor.byKey.get('E')?.id).toBe('part.detach');
    expect(atDoor.right.map((a) => a.keys)).toEqual([['Q'], ['R']]);
    expect(findKeyConflicts(atDoor.center, atDoor.right)).toEqual([]);
  });

  it('K8-K13: placement and driving modes have zero duplicate keys', () => {
    const place = resolveArbiter({
      mode: 'place',
      extra: [
        { id: 'place.put', key: 'LMB', text: '放下' },
        { id: 'place.turn', key: 'Q', extraKeys: ['E'], text: '旋转' },
        { id: 'place.freeTurn', key: 'RMB', hold: true, text: '自由转' },
        { id: 'place.dist', key: 'Wheel', text: '距离' },
        { id: 'place.cancel', key: 'R', text: '取消' },
      ],
    });
    expect(findKeyConflicts(place.center, place.right)).toEqual([]);

    const seat = resolveArbiter({
      mode: 'seat',
      target: [{ id: 'cab.handbrake', key: 'LMB', text: '松开 <b>手刹</b>' }],
      extra: [
        { id: 'drive.throttle', key: 'W', text: '油门' },
        { id: 'drive.brake', key: 'S', text: '刹车 / 倒车' },
        { id: 'drive.handbrake', key: 'Space', text: '手刹' },
        { id: 'drive.ignition', key: 'I', text: '点火 / 熄火' },
        { id: 'drive.lights', key: 'T' as never, text: '车灯' },
        { id: 'drive.wipers', key: 'K', text: '雨刷' },
        { id: 'drive.cabinLight', key: 'U' as never, text: '车内灯' },
        { id: 'drive.horn', key: 'H', hold: true, text: '喇叭' },
        { id: 'drive.view', key: 'V', text: '换视角' },
        { id: 'drive.exit', key: 'Q', hold: true, holdS: ND_HOLD_S.stand, text: '下车' },
      ],
    });
    expect(findKeyConflicts(seat.center, seat.right)).toEqual([]);
  });

  it('gateRightActions hides held actions whose key is claimed by target', () => {
    const center = [{ keys: ['LMB' as const], text: '打开 <b>车门</b>' }];
    const right = [
      { keys: ['LMB' as const], hold: true, text: '聚光' },
      { keys: ['E' as const], text: '打开' },
      { keys: ['Q' as const], text: '投掷' },
    ];
    const gated = gateRightActions(center, right);
    expect(gated.map((a) => a.keys)).toEqual([['E'], ['Q']]);
    expect(findKeyConflicts(center, gated)).toEqual([]);
  });

  it('applySecondaryPromotion leaves targets untouched when LMB is already present', () => {
    const cands: CandidateBinding[] = [
      { id: 'a', key: 'LMB', text: '开' },
      { id: 'b', key: 'E', secondarySlot: true, hold: true, text: '拆' },
    ];
    const { list, promoted } = applySecondaryPromotion(cands);
    expect(promoted).toBe(false);
    expect(list[1].key).toBe('E');
  });
});
