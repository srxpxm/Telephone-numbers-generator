/*
 * Генератор номеров и оценка красоты.
 *  - rollRarity(): бросок редкости по таблице вероятностей класса карты;
 *  - analyze(): независимая функция оценки красоты (0–100) и поиска шаблонов;
 *  - generate(): подбирает уникальный номер, чьи цифры действительно соответствуют выпавшей редкости.
 * Все номера вымышленные: префикс +000 не используется в реальной телефонии.
 */
(function (NT) {
  'use strict';
  const C = NT.CONFIG;
  const U = NT.util;
  const P = C.beauty.points;
  const N = 9; // цифр после префикса

  const RARITY_IDS = C.rarities.map((r) => r.id);
  const rarityIndex = (id) => RARITY_IDS.indexOf(id);

  const FAMILIES = {
    repeat: 'Повторы', sequence: 'Последовательности', rhythm: 'Чередования',
    pairs: 'Пары', mirror: 'Зеркальные', ending: 'Окончания', plain: 'Обычные',
  };

  const prestige = (digit) => C.beauty.digitPrestige[digit] || 0;

  function format(body) {
    let i = 0;
    const parts = [];
    for (const len of C.number.groups) { parts.push(body.slice(i, i + len)); i += len; }
    return C.number.prefix + ' ' + parts.join(' ');
  }

  function tierFromScore(score) {
    for (let i = C.rarities.length - 1; i >= 0; i--) {
      if (score >= C.rarities[i].minScore) return C.rarities[i].id;
    }
    return RARITY_IDS[0];
  }

  /* ================= Оценка красоты ================= */

  function longestSequence(d) {
    let up = 1, down = 1;
    for (let s = 0; s < d.length; s++) {
      // восходящая (0 после 9 трактуется как «10» и завершает серию: 7890)
      let v = d[s], len = 1;
      for (let i = s + 1; i < d.length; i++) {
        const want = v + 1;
        if (want <= 9 && d[i] === want) { v = want; len++; }
        else if (want === 10 && d[i] === 0) { len++; break; }
        else break;
      }
      if (len > up) up = len;
      // нисходящая (0 перед 9 трактуется как «10»: 0987)
      v = (d[s] === 0 && s + 1 < d.length && d[s + 1] === 9) ? 10 : d[s];
      len = 1;
      for (let i = s + 1; i < d.length; i++) {
        const want = v - 1;
        if (want >= 0 && d[i] === want) { v = want; len++; } else break;
      }
      if (len > down) down = len;
    }
    return { up, down, best: Math.max(up, down) };
  }

  function longestStep(d, step) {
    let best = 1, cur = 1;
    for (let i = 1; i < d.length; i++) {
      cur = (d[i] - d[i - 1] === step) ? cur + 1 : 1;
      if (cur > best) best = cur;
    }
    return best;
  }

  function isSeqArr(a) {
    const s = longestSequence(a);
    return s.best >= a.length;
  }

  function computeAnalysis(body) {
    const d = [];
    for (let i = 0; i < body.length; i++) d.push(body.charCodeAt(i) - 48);
    const found = [];
    const add = (id, family, label, digit) => {
      const pts = P[id];
      if (pts > 0) found.push({ id, family, label, points: pts, digit: digit == null ? null : digit });
    };

    const counts = new Array(10).fill(0);
    d.forEach((x) => counts[x]++);
    let maxCount = 0, dom = d[0];
    for (let i = 0; i < 10; i++) {
      if (counts[i] > maxCount || (counts[i] === maxCount && counts[i] > 0 && prestige(i) > prestige(dom))) {
        maxCount = counts[i]; dom = i;
      }
    }
    const distinct = counts.reduce((a, c) => a + (c > 0 ? 1 : 0), 0);

    let bestRun = 1, runDigit = d[0], cur = 1;
    for (let i = 1; i < N; i++) {
      cur = d[i] === d[i - 1] ? cur + 1 : 1;
      if (cur > bestRun || (cur === bestRun && prestige(d[i]) > prestige(runDigit))) { bestRun = cur; runDigit = d[i]; }
    }

    /* --- Повторы --- */
    if (maxCount === 9) {
      add('mono9', 'repeat', 'Монолит: все цифры «' + dom + '»', dom);
    } else {
      if (bestRun >= 8) add('run8', 'repeat', 'Серия из ' + bestRun + ' цифр «' + runDigit + '»', runDigit);
      else if (bestRun === 7) add('run7', 'repeat', 'Серия из 7 цифр «' + runDigit + '»', runDigit);
      else if (bestRun === 6) add('run6', 'repeat', 'Серия из 6 цифр «' + runDigit + '»', runDigit);
      else if (bestRun === 5) add('run5', 'repeat', 'Серия из 5 цифр «' + runDigit + '»', runDigit);
      else if (bestRun === 4) add('run4', 'repeat', 'Серия из 4 цифр «' + runDigit + '»', runDigit);
      else if (bestRun === 3) add('run3', 'repeat', 'Тройка «' + runDigit + runDigit + runDigit + '»', runDigit);

      if (maxCount === 8) add('count8', 'repeat', 'Почти монолит: 8 цифр «' + dom + '»', dom);
      else if (maxCount === 7) add('count7', 'repeat', '7 одинаковых цифр «' + dom + '»', dom);
      else if (maxCount === 6) add('count6', 'repeat', '6 одинаковых цифр «' + dom + '»', dom);
      else if (maxCount === 5) add('count5', 'repeat', '5 одинаковых цифр «' + dom + '»', dom);
      else if (maxCount === 4) add('count4', 'repeat', '4 одинаковые цифры «' + dom + '»', dom);

      if (distinct === 2) add('twoDistinct', 'repeat', 'Всего две разные цифры', dom);
      else if (distinct === 3) add('threeDistinct', 'repeat', 'Всего три разные цифры', dom);
      else if (distinct === 4) add('fourDistinct', 'repeat', 'Всего четыре разные цифры', dom);

      const g1 = d[0] === d[1];
      const g2 = d[2] === d[3] && d[3] === d[4];
      const g3 = d[5] === d[6] && d[6] === d[7] && d[7] === d[8];
      if (g1 && g2 && g3) add('blocks3', 'repeat', 'Блочный номер: каждая группа из одной цифры', d[8]);
      else if (g2 && g3 && d[4] !== d[5]) add('blocks2', 'repeat', 'Двойной блок ' + d[2] + d[2] + d[2] + ' ' + d[8] + d[8] + d[8] + d[8], d[8]);
    }

    /* --- Последовательности --- */
    const sq = longestSequence(d);
    const dir = sq.up >= sq.down ? 'восходящая' : 'нисходящая';
    if (sq.best >= 9) add('seq9', 'sequence', 'Полная ' + dir + ' последовательность');
    else if (sq.best === 8) add('seq8', 'sequence', 'Последовательность из 8 цифр (' + dir + ')');
    else if (sq.best === 7) add('seq7', 'sequence', 'Последовательность из 7 цифр (' + dir + ')');
    else if (sq.best === 6) add('seq6', 'sequence', 'Последовательность из 6 цифр (' + dir + ')');
    else if (sq.best === 5) add('seq5', 'sequence', 'Последовательность из 5 цифр (' + dir + ')');
    else if (sq.best === 4) add('seq4', 'sequence', 'Лесенка из 4 цифр (' + dir + ')');
    if (Math.max(longestStep(d, 2), longestStep(d, -2)) >= 5) add('step2', 'sequence', 'Арифметическая прогрессия с шагом 2');

    /* --- Ритм: чередования и повторы блоков --- */
    let bestAlt = 1, ca = 1;
    for (let i = 1; i < N; i++) {
      if (d[i] === d[i - 1]) ca = 1;
      else if (ca >= 2 && d[i] === d[i - 2]) ca++;
      else ca = 2;
      if (ca > bestAlt) bestAlt = ca;
    }
    if (bestAlt >= 9) add('alt9', 'rhythm', 'Идеальное чередование ABABABABA');
    else if (bestAlt === 8) add('alt8', 'rhythm', 'Чередование из 8 цифр');
    else if (bestAlt === 7) add('alt7', 'rhythm', 'Чередование из 7 цифр');
    else if (bestAlt === 6) add('alt6', 'rhythm', 'Чередование ABABAB');
    else if (bestAlt === 5) add('alt5', 'rhythm', 'Чередование ABABA');
    else if (bestAlt === 4) add('alt4', 'rhythm', 'Чередование ABAB');

    let p3 = true;
    for (let i = 3; i < N; i++) if (d[i] !== d[i - 3]) { p3 = false; break; }
    const tripleSame = d[0] === d[1] && d[1] === d[2];
    if (p3 && !tripleSame) add('period3', 'rhythm', 'Тройной ритм ABCABCABC');
    else {
      for (let s = 0; s + 6 <= N; s++) {
        if (d[s] === d[s + 3] && d[s + 1] === d[s + 4] && d[s + 2] === d[s + 5] &&
            !(d[s] === d[s + 1] && d[s + 1] === d[s + 2])) {
          add('period3part', 'rhythm', 'Повтор тройки ' + d[s] + d[s + 1] + d[s + 2] + '-' + d[s] + d[s + 1] + d[s + 2]);
          break;
        }
      }
    }
    if (maxCount < 9 && d[0] === d[5] && d[1] === d[6] && d[2] === d[7] && d[3] === d[8]) {
      add('blockRepeat', 'rhythm', 'Повтор блока: первые 4 цифры = последние 4');
    }

    /* --- Пары --- */
    const isPair = (s) => s + 1 < N && d[s] === d[s + 1];
    let bestPairs = 0, pairStart = 0;
    for (let s = 0; s < N - 1; s++) {
      let k = 0;
      while (s + 2 * k + 1 < N && d[s + 2 * k] === d[s + 2 * k + 1] && (k === 0 || d[s + 2 * k] !== d[s + 2 * k - 1])) k++;
      if (k > bestPairs) { bestPairs = k; pairStart = s; }
    }
    if (bestPairs >= 4) add('pairs4', 'pairs', 'Четыре пары подряд AABBCCDD');
    else if (bestPairs === 3) {
      const a = d[pairStart], b = d[pairStart + 2], c = d[pairStart + 4];
      if ((b - a === 1 && c - b === 1) || (a - b === 1 && b - c === 1)) add('pairLadder', 'pairs', 'Парная лесенка ' + a + a + b + b + c + c);
      else add('pairs3', 'pairs', 'Три пары подряд AABBCC');
    } else if (bestPairs === 2) add('pairs2', 'pairs', 'Две пары подряд AABB');

    let mp = 0;
    for (let s = 0; s + 8 <= N; s++) {
      if (isPair(s) && isPair(s + 2) && isPair(s + 4) && isPair(s + 6) && d[s] === d[s + 4] && d[s + 2] === d[s + 6] && d[s] !== d[s + 2]) { mp = 8; break; }
    }
    if (!mp) {
      for (let s = 0; s + 6 <= N; s++) {
        if (isPair(s) && isPair(s + 2) && isPair(s + 4) && d[s] === d[s + 4] && d[s] !== d[s + 2]) { mp = 6; break; }
      }
    }
    if (mp === 8) add('mirrorPairs8', 'pairs', 'Повтор пар AABBAABB');
    else if (mp === 6) add('mirrorPairs6', 'pairs', 'Повтор пар AABBAA');

    /* --- Зеркальные --- */
    const isPal = (a, b) => { while (a < b) { if (d[a] !== d[b]) return false; a++; b--; } return true; };
    const allSame = (a, b) => { for (let i = a + 1; i <= b; i++) if (d[i] !== d[a]) return false; return true; };
    if (maxCount < 9 && isPal(0, 8)) add('pal9', 'mirror', 'Палиндром: читается одинаково в обе стороны');
    else if (isPal(2, 8) && !allSame(2, 8)) add('tailPal7', 'mirror', 'Зеркальные последние 7 цифр');
    else if (isPal(4, 8) && !allSame(4, 8)) add('tailPal5', 'mirror', 'Зеркальное окончание из 5 цифр');
    else if (d[5] === d[8] && d[6] === d[7] && d[5] !== d[6]) add('tailABBA', 'mirror', 'Зеркальное окончание ABBA');

    /* --- Окончания --- */
    const t = d.slice(5);
    const tailStr = t.join('');
    if (maxCount < 9) {
      if (t[0] === t[1] && t[1] === t[2] && t[2] === t[3]) add('tail4', 'ending', 'Красивое окончание ' + tailStr, t[0]);
      else if (t[1] === t[2] && t[2] === t[3]) add('tail3', 'ending', 'Окончание на три «' + t[3] + '»', t[3]);
      else if (t[2] === 0 && t[3] === 0) add('tail00', 'ending', 'Круглое окончание «00»', 0);
      if (isSeqArr(t)) add('tailSeq4', 'ending', 'Окончание-лесенка ' + tailStr);
      if (t[0] === t[1] && t[2] === t[3] && t[0] !== t[2]) add('tailAABB', 'ending', 'Парное окончание ' + tailStr);
      if (counts[0] >= 5) add('round5', 'ending', 'Круглый номер: ' + counts[0] + ' нулей', 0);
      else if (counts[0] === 4) add('round4', 'ending', 'Четыре нуля в номере', 0);
    }

    /* --- Итоговая оценка --- */
    const byFamily = {};
    for (const f of found) {
      const curBest = byFamily[f.family];
      if (!curBest || f.points > curBest.points) byFamily[f.family] = f;
    }
    const tops = Object.values(byFamily).sort((a, b) => b.points - a.points);
    const primary = tops[0] || null;
    const W = C.beauty.secondaryWeights;
    let secondary = 0;
    for (let i = 1; i < tops.length && i - 1 < W.length; i++) secondary += tops[i].points * W[i - 1];
    secondary = Math.min(C.beauty.secondaryCap, secondary);

    let bonus = 0;
    if (primary && (primary.family === 'repeat' || primary.family === 'ending') && primary.digit != null) bonus += prestige(primary.digit);
    const lucky = counts[7] + counts[8] >= 5;
    if (lucky) bonus += C.beauty.luckyBonus;

    const raw = (primary ? primary.points : 0) + secondary + bonus;
    const score = U.clamp(Math.round(raw), 0, 100);
    const family = primary && primary.points >= 25 ? primary.family : 'plain';

    const patterns = found
      .slice()
      .sort((a, b) => b.points - a.points)
      .map((f) => ({ id: f.id, label: f.label, family: f.family, points: f.points }));
    if (lucky) patterns.push({ id: 'lucky', label: 'Много счастливых 7 и 8', family: 'bonus', points: C.beauty.luckyBonus });

    return {
      score, rarity: tierFromScore(score), family,
      primary: primary ? primary.id : null,
      primaryLabel: primary ? primary.label : 'Случайная комбинация',
      patterns, distinct, maxCount,
    };
  }

  const cache = new Map();
  /** Публичная функция оценки номера (детерминированная, с кешем). */
  function analyze(body) {
    if (typeof body !== 'string' || !/^\d{9}$/.test(body)) throw new Error('Некорректный номер: ' + body);
    let res = cache.get(body);
    if (!res) {
      res = computeAnalysis(body);
      if (cache.size > 8000) cache.clear();
      cache.set(body, res);
    }
    return res;
  }

  /* ================= Шаблоны генерации ================= */
  let R = U.random; // текущий источник случайности (подменяется в generate)
  const rd = () => Math.floor(R() * 10);
  function rdNot() {
    const ex = Array.prototype.slice.call(arguments);
    let x;
    do { x = rd(); } while (ex.indexOf(x) !== -1);
    return x;
  }
  const rnd9 = () => { const a = []; for (let i = 0; i < N; i++) a.push(rd()); return a; };
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const coin = () => R() < 0.5;

  function seqDigits(len) {
    const start = ri(0, 11 - len); // допускаем «…890»
    const arr = [];
    for (let i = 0; i < len; i++) arr.push((start + i) % 10);
    if (start + len - 1 > 10) return seqDigits(len);
    return coin() ? arr : arr.reverse();
  }
  function placeRun(len) {
    const a = rnd9();
    const x = rd();
    const pos = ri(0, N - len);
    for (let i = 0; i < len; i++) a[pos + i] = x;
    if (pos > 0 && a[pos - 1] === x) a[pos - 1] = rdNot(x);
    if (pos + len < N && a[pos + len] === x) a[pos + len] = rdNot(x);
    return a;
  }
  function placeCount(k) {
    const x = rd();
    const a = [];
    for (let i = 0; i < N; i++) a.push(rdNot(x));
    const idx = U.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], R).slice(0, k);
    idx.forEach((i) => { a[i] = x; });
    return a;
  }
  function placeSeq(len) {
    const a = rnd9();
    const s = seqDigits(len);
    const pos = ri(0, N - len);
    s.forEach((v, i) => { a[pos + i] = v; });
    return a;
  }
  function placeAlt(len) {
    const a = rnd9();
    const x = rd(), y = rdNot(x);
    const pos = ri(0, N - len);
    for (let i = 0; i < len; i++) a[pos + i] = i % 2 === 0 ? x : y;
    return a;
  }
  function fromDigits(k) {
    const set = U.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], R).slice(0, k);
    const a = [];
    for (let i = 0; i < N; i++) a.push(set[Math.floor(R() * k)]);
    return a;
  }
  function pairChain(k, ladder) {
    const a = rnd9();
    const pos = ri(0, N - 2 * k);
    let prev = -1;
    let base = rd();
    const dirUp = coin();
    for (let j = 0; j < k; j++) {
      let x;
      if (ladder) { x = dirUp ? base + j : base - j; if (x < 0 || x > 9) return pairChain(k, ladder); }
      else x = rdNot(prev);
      a[pos + 2 * j] = x; a[pos + 2 * j + 1] = x; prev = x;
    }
    return a;
  }
  function mirrorPairs(len) {
    const a = rnd9();
    const x = rd(), y = rdNot(x);
    const pos = ri(0, N - len);
    const pat = len === 8 ? [x, x, y, y, x, x, y, y] : [x, x, y, y, x, x];
    pat.forEach((v, i) => { a[pos + i] = v; });
    return a;
  }
  function palindrome9(lucky) {
    const a = new Array(N);
    for (let i = 0; i < 5; i++) { const v = lucky && coin() ? (coin() ? 7 : 8) : rd(); a[i] = v; a[N - 1 - i] = v; }
    return a;
  }

  const TEMPLATES = [
    // Uncommon
    { id: 'u_run4', tier: 'uncommon', family: 'repeat', make: () => placeRun(4) },
    { id: 'u_count5', tier: 'uncommon', family: 'repeat', make: () => placeCount(5) },
    { id: 'u_three', tier: 'uncommon', family: 'repeat', make: () => fromDigits(3) },
    { id: 'u_seq5', tier: 'uncommon', family: 'sequence', make: () => placeSeq(5) },
    { id: 'u_step2', tier: 'uncommon', family: 'sequence', make: () => { const a = rnd9(); let s = coin() ? [1, 3, 5, 7, 9] : [0, 2, 4, 6, 8]; if (coin()) s = s.reverse(); const p = ri(0, 4); s.forEach((v, i) => { a[p + i] = v; }); return a; } },
    { id: 'u_alt5', tier: 'uncommon', family: 'rhythm', make: () => placeAlt(5) },
    { id: 'u_tail3', tier: 'uncommon', family: 'ending', make: () => { const a = rnd9(); const x = rd(); a[6] = a[7] = a[8] = x; a[5] = rdNot(x); return a; } },
    { id: 'u_tailseq', tier: 'uncommon', family: 'ending', make: () => { const a = rnd9(); seqDigits(4).forEach((v, i) => { a[5 + i] = v; }); return a; } },
    { id: 'u_round', tier: 'uncommon', family: 'ending', make: () => { const a = rnd9(); U.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], R).slice(0, 5).forEach((i) => { a[i] = 0; }); return a; } },
    { id: 'u_tailpal5', tier: 'uncommon', family: 'mirror', make: () => { const a = rnd9(); const x = rd(), y = rd(), z = rd(); [x, y, z, y, x].forEach((v, i) => { a[4 + i] = v; }); return a; } },
    // Rare
    { id: 'r_run5', tier: 'rare', family: 'repeat', make: () => placeRun(5) },
    { id: 'r_count6', tier: 'rare', family: 'repeat', make: () => placeCount(6) },
    { id: 'r_seq6', tier: 'rare', family: 'sequence', make: () => placeSeq(6) },
    { id: 'r_tail4', tier: 'rare', family: 'ending', make: () => { const a = rnd9(); const x = rd(); a[5] = a[6] = a[7] = a[8] = x; a[4] = rdNot(x); return a; } },
    { id: 'r_pairs3', tier: 'rare', family: 'pairs', make: () => pairChain(3, false) },
    { id: 'r_ladder', tier: 'rare', family: 'pairs', make: () => pairChain(3, true) },
    { id: 'r_mpairs6', tier: 'rare', family: 'pairs', make: () => mirrorPairs(6) },
    { id: 'r_block', tier: 'rare', family: 'rhythm', make: () => { const a = rnd9(); for (let i = 0; i < 4; i++) a[5 + i] = a[i]; return a; } },
    { id: 'r_p3part', tier: 'rare', family: 'rhythm', make: () => { const a = rnd9(); const p = ri(0, 3); for (let i = 0; i < 3; i++) a[p + 3 + i] = a[p + i]; return a; } },
    { id: 'r_alt6', tier: 'rare', family: 'rhythm', make: () => placeAlt(6) },
    { id: 'r_pal7', tier: 'rare', family: 'mirror', make: () => { const a = rnd9(); for (let i = 0; i < 3; i++) a[8 - i] = a[2 + i]; return a; } },
    { id: 'r_pal9', tier: 'rare', family: 'mirror', make: () => palindrome9(false) },
    // Epic
    { id: 'e_run6', tier: 'epic', family: 'repeat', make: () => placeRun(6) },
    { id: 'e_count7', tier: 'epic', family: 'repeat', make: () => placeCount(7) },
    { id: 'e_two', tier: 'epic', family: 'repeat', make: () => fromDigits(2) },
    { id: 'e_blocks2', tier: 'epic', family: 'ending', make: () => { const a = rnd9(); const x = rd(), y = rdNot(x); a[2] = a[3] = a[4] = x; a[5] = a[6] = a[7] = a[8] = y; if (a[1] === x) a[1] = rdNot(x); return a; } },
    { id: 'e_seq7', tier: 'epic', family: 'sequence', make: () => placeSeq(7) },
    { id: 'e_alt7', tier: 'epic', family: 'rhythm', make: () => placeAlt(7) },
    { id: 'e_alt8', tier: 'epic', family: 'rhythm', make: () => placeAlt(8) },
    { id: 'e_pairs4', tier: 'epic', family: 'pairs', make: () => pairChain(4, false) },
    { id: 'e_mpairs8', tier: 'epic', family: 'pairs', make: () => mirrorPairs(8) },
    { id: 'e_pal9l', tier: 'epic', family: 'mirror', make: () => palindrome9(true) },
    // Legendary
    { id: 'l_run7', tier: 'legendary', family: 'repeat', make: () => placeRun(7) },
    { id: 'l_blocks3', tier: 'legendary', family: 'repeat', make: () => { const x = rd(), y = rd(), z = rd(); return [x, x, y, y, y, z, z, z, z]; } },
    { id: 'l_seq8', tier: 'legendary', family: 'sequence', make: () => placeSeq(8) },
    { id: 'l_alt9', tier: 'legendary', family: 'rhythm', make: () => placeAlt(9) },
    { id: 'l_period3', tier: 'legendary', family: 'rhythm', make: () => { const x = rd(), y = rd(), z = rd(); return [x, y, z, x, y, z, x, y, z]; } },
    { id: 'l_count7t', tier: 'legendary', family: 'ending', make: () => { const x = rd(); const a = []; for (let i = 0; i < N; i++) a.push(rdNot(x)); a[5] = a[6] = a[7] = a[8] = x; U.shuffle([0, 1, 2, 3, 4], R).slice(0, 3).forEach((i) => { a[i] = x; }); return a; } },
    // Mythic
    { id: 'm_mono', tier: 'mythic', family: 'repeat', make: () => { const x = rd(); return [x, x, x, x, x, x, x, x, x]; } },
    { id: 'm_run8', tier: 'mythic', family: 'repeat', make: () => placeRun(8) },
    { id: 'm_count8', tier: 'mythic', family: 'repeat', make: () => placeCount(8) },
    { id: 'm_seq9', tier: 'mythic', family: 'sequence', make: () => seqDigits(9) },
    { id: 'm_blocks3p', tier: 'mythic', family: 'ending', make: () => { const p = [0, 7, 8, 9]; const x = U.pick(p, R), y = U.pick(p, R), z = U.pick(p, R); return [x, x, y, y, y, z, z, z, z]; } },
  ];
  const COMMON_TEMPLATE = { id: 'c_random', tier: 'common', family: 'plain', make: rnd9 };

  /** Детерминированный перебор структурных кандидатов на случай исчерпания редких шаблонов. */
  function structuredCandidates() {
    const out = [];
    for (let x = 0; x < 10; x++) {
      out.push(String(x).repeat(9));
      for (let y = 0; y < 10; y++) {
        if (y === x) continue;
        out.push(String(x).repeat(8) + y, y + String(x).repeat(8));
        for (let p = 1; p < 8; p++) { const a = new Array(9).fill(x); a[p] = y; out.push(a.join('')); }
        out.push([x, y, x, y, x, y, x, y, x].join(''));
        for (let z = 0; z < 10; z++) {
          out.push([x, x, y, y, y, z, z, z, z].join(''));
          out.push([x, y, z, x, y, z, x, y, z].join(''));
        }
      }
    }
    for (let s = 0; s <= 2; s++) {
      const a = []; for (let i = 0; i < 9; i++) a.push((s + i) % 10);
      out.push(a.join(''), a.slice().reverse().join(''));
    }
    return out;
  }

  /* ================= Публичный API ================= */

  function validateProbabilities() {
    const problems = [];
    for (const cls of C.classes) {
      let sum = 0;
      for (const id of RARITY_IDS) {
        const p = cls.probabilities[id];
        if (typeof p !== 'number' || !isFinite(p) || p < 0) problems.push(cls.name + ': некорректная вероятность ' + id);
        sum += p || 0;
      }
      if (Math.abs(sum - 100) > 1e-6) problems.push(cls.name + ': сумма вероятностей = ' + sum.toFixed(4) + '% (ожидалось 100%)');
    }
    return { ok: problems.length === 0, problems };
  }

  function rollRarity(classId, rnd) {
    const cls = C.classes.find((c) => c.id === classId);
    if (!cls) throw new Error('Неизвестный класс карты: ' + classId);
    const r = (rnd || U.random)() * 100;
    let acc = 0;
    for (const id of RARITY_IDS) {
      acc += cls.probabilities[id] || 0;
      if (r < acc) return id;
    }
    return RARITY_IDS[0];
  }

  /**
   * Генерация номера заданной редкости.
   * isTaken(body) — проверка уникальности (номер не выдавался ранее).
   */
  function generateForRarity(target, formFactor, isTaken, rnd) {
    R = rnd || U.random;
    const taken = isTaken || (() => false);
    const bias = (C.formFactors[formFactor] || C.formFactors.sim).familyBias;
    const pool = target === 'common' ? [COMMON_TEMPLATE] : TEMPLATES.filter((t) => t.tier === target);
    const tryTemplate = (tpl) => {
      const body = tpl.make().join('');
      if (body.length !== N || taken(body)) return null;
      const a = analyze(body);
      return a.rarity === target ? { body, analysis: a, rarity: target, template: tpl.id } : null;
    };
    for (let i = 0; i < 400; i++) {
      const tpl = U.weightedPick(pool, (t) => bias[t.family] || 1, R);
      const res = tryTemplate(tpl);
      if (res) return res;
    }
    const all = TEMPLATES.concat([COMMON_TEMPLATE]);
    for (let i = 0; i < 3000; i++) {
      const res = tryTemplate(U.pick(all, R));
      if (res) return res;
    }
    const cands = U.shuffle(structuredCandidates(), R);
    for (const body of cands) {
      if (taken(body)) continue;
      const a = analyze(body);
      if (a.rarity === target) return { body, analysis: a, rarity: target, template: 'structured' };
    }
    const idx = rarityIndex(target);
    if (idx > 0) return generateForRarity(RARITY_IDS[idx - 1], formFactor, taken, rnd);
    // Практически недостижимо: 10^9 комбинаций
    for (;;) {
      const body = rnd9().join('');
      if (!taken(body)) { const a = analyze(body); return { body, analysis: a, rarity: a.rarity, template: 'fallback' }; }
    }
  }

  function generate(classId, formFactor, isTaken, rnd) {
    const rolled = rollRarity(classId, rnd);
    const res = generateForRarity(rolled, formFactor, isTaken, rnd);
    res.rolled = rolled;
    return res;
  }

  NT.gen = {
    FAMILIES, RARITY_IDS, rarityIndex, format, tierFromScore, analyze,
    validateProbabilities, rollRarity, generate, generateForRarity, TEMPLATES,
  };
})(window.NT = window.NT || {});
