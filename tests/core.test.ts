import { describe, expect, it } from 'vitest';
import { appraise, decodeCore, encodeCore, summarizeDungeon } from '../src/game/core';
import { generateDungeon } from '../src/game/dungeon';

describe('코어 코드', () => {
  it('encode→decode 왕복은 시드를 보존한다', () => {
    for (const seed of [0, 1, 777, 0xffffffff, 20260810]) {
      const code = encodeCore(seed);
      expect(decodeCore(code)).toBe(seed >>> 0);
    }
  });

  it('코드는 SC1 접두를 가진다', () => {
    expect(encodeCore(777).startsWith('SC1-')).toBe(true);
  });

  it('손상된 코드는 거부한다 (체크섬)', () => {
    const code = encodeCore(777);
    // 시드 부분 한 글자 변조
    const parts = code.split('-');
    const tampered = `${parts[0]}-${parts[1].slice(0, -1)}${parts[1].endsWith('0') ? '1' : '0'}-${parts[2]}`;
    expect(decodeCore(tampered)).toBeNull();
  });

  it('형식이 다른 문자열은 거부한다', () => {
    for (const bad of ['', 'hello', 'SC1-', 'SC2-1f-abcd', 'SC1-zzzz-0000', '  ']) {
      expect(decodeCore(bad)).toBeNull();
    }
  });

  it('공백·소문자 입력을 관대하게 받는다', () => {
    const code = encodeCore(12345);
    expect(decodeCore(` ${code.toLowerCase()} `)).toBe(12345);
  });
});

describe('던전 요약·감정', () => {
  it('요약은 실제 생성 결과와 일치한다', () => {
    const seed = 4242;
    const d = generateDungeon(seed);
    const s = summarizeDungeon(seed);
    expect(s.biome).toBe(d.biome);
    expect(s.enemyCount).toBe(d.enemies.length);
    expect(s.totalGold).toBe(d.enemies.reduce((a, e) => a + e.drop.gold, 0));
    const items = d.enemies.filter((e) => e.drop.item).map((e) => e.drop.item!);
    expect(s.items).toEqual(items);
  });

  it('감정가는 결정론적이고 양수다', () => {
    expect(appraise(999)).toBe(appraise(999));
    expect(appraise(999)).toBeGreaterThan(0);
  });
});
