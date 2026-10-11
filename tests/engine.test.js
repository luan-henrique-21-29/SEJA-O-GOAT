import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUBS, POSITIONS, createProfile, overallFromAttributes } from '../src/data.js';
import { Match, createCareer, applyResult, trainCareer, validateCareer } from '../src/engine.js';

const player = (position = 'ATA', fields = {}) => createProfile({ name: 'João Teste', club: 'flamengo', position, ...fields });
const completeAnimation = match => {
  let guard = 0;
  while (match.phase === 'animating' && guard++ < 100) match.update(0.5);
  assert.ok(guard < 100, 'a animação deve terminar');
};
const nextPending = match => {
  let guard = 0;
  while (!['decision', 'finished'].includes(match.phase) && guard++ < 100) {
    if (match.phase === 'animating') completeAnimation(match);
    else match.nextDecision();
  }
  assert.ok(guard < 100);
  return match.pending;
};
const statisticalIntegrity = result => {
  const stats = result.stats;
  assert.ok(stats.goals <= stats.shotsOnTarget);
  assert.ok(stats.shotsOnTarget <= stats.shots);
  assert.ok(stats.passesCompleted <= stats.passes);
  assert.ok(stats.dribblesCompleted <= stats.dribbles);
  assert.ok(stats.tacklesWon <= stats.tackles);
  assert.equal(stats.shotsFaced, stats.saves + stats.goalsConceded);
  assert.ok(stats.assists <= result.score[result.club === result.homeId ? 'home' : 'away']);
  for (const team of ['home', 'away']) {
    assert.ok(result.score[team] <= result.teamStats[team].shotsOnTarget);
    assert.ok(result.teamStats[team].shotsOnTarget <= result.teamStats[team].shots);
  }
  assert.equal(result.eventLog.filter(event => event.type === 'goal').length, result.score.home + result.score.away);
};

test('profile normalizes age, measurements, personalization and available shirt numbers', () => {
  const profile = player('MC', { age: 70, height: 500, weight: -1, number: 9, skin: 'bad', name: '<João>\u0000' });
  assert.equal(profile.age, 22);
  assert.equal(profile.height, 210);
  assert.equal(profile.weight, 45);
  assert.equal(profile.name, 'João');
  assert.match(profile.skin, /^#[0-9a-f]{6}$/i);
  assert.ok(!CLUBS[0].roster.some(member => member.number === profile.number));
  assert.ok(profile.overall >= 55 && profile.overall <= 70);
  assert.equal(profile.overall, overallFromAttributes(profile.attributes, 'MC'));
  assert.equal(POSITIONS.length, 11);
  assert.ok(CLUBS.every(club => new Set(club.roster.map(member => member.number)).size === club.roster.length));
});

test('reserve watches from bench and receives four meaningful decisions after entering at 55', () => {
  const match = new Match(player(), { seed: 37 });
  assert.equal(match.onPitch, false);
  assert.equal(match.entryMinute, 55);
  const observed = [];
  while (match.phase !== 'finished') {
    const pending = nextPending(match);
    if (!pending) break;
    assert.ok(match.onPitch);
    observed.push(match.minute);
    assert.equal(match.choose('invalid'), false);
    match.choose('placed');
    completeAnimation(match);
  }
  assert.deepEqual(observed, [58, 66, 75, 84]);
  assert.equal(match.result().minutes, 35);
  assert.equal(match.result().stats.decisions, 4);
  statisticalIntegrity(match.result());
});

test('starter receives seven decisions across the full match', () => {
  const profile = player(); profile.trust = 70;
  const match = new Match(profile, { seed: 19 });
  assert.equal(match.started, true);
  const result = match.simulateRest();
  assert.equal(result.minutes, 90);
  assert.equal(result.stats.decisions, 7);
  assert.equal(result.simulated, true);
});

test('goals and shot statistics commit only once the shot animation finishes', () => {
  const match = new Match(player(), { seed: 5 });
  nextPending(match);
  match.pending.options.find(option => option.id === 'placed').chance = 1;
  const before = structuredClone(match.score);
  const oldShots = match.stats.shots;
  match.choose('placed');
  assert.equal(match.animation.outcome, 'goal');
  assert.ok(match.animation.to.x > 1, 'a bola deve atravessar a linha e entrar na rede');
  assert.deepEqual(match.score, before);
  assert.equal(match.stats.shots, oldShots);
  match.update(0.5);
  assert.deepEqual(match.score, before);
  completeAnimation(match);
  assert.equal(match.score.home, before.home + 1);
  assert.equal(match.stats.goals, 1);
  assert.equal(match.stats.shots, oldShots + 1);
  match.update(0.1);
  assert.equal(match.score.home, before.home + 1);
});

test('next-decision skip stops at a visible AI shot before any goal is committed', () => {
  const match = new Match(player(), { seed: 12 });
  match.nextDecision();
  assert.equal(match.minute, 5);
  assert.equal(match.phase, 'animating');
  assert.deepEqual(match.score, { home: 0, away: 0 });
  assert.equal(match.nextDecision(), false);
  completeAnimation(match);
  assert.equal(match.teamStats.home.shots + match.teamStats.away.shots, 1);
});

test('assist requires a completed pass followed by a valid animated goal', () => {
  const match = new Match(player(), { seed: 22 });
  nextPending(match);
  match.pending.options.find(option => option.id === 'assist').chance = 1;
  match.choose('assist');
  assert.equal(match.stats.passes, 0);
  assert.equal(match.stats.assists, 0);
  while (match.animation?.kind === 'pass') match.update(0.5);
  assert.equal(match.stats.passesCompleted, 1);
  assert.equal(match.animation.kind, 'shot');
  assert.equal(match.stats.assists, 0);
  // Force a deterministic goal in the second stage; the pass itself never scores.
  const before = match.score.home;
  match.animation.outcome = 'goal';
  match.animation.to.x = 1.025;
  match.animationEffects.outcome = 'goal';
  completeAnimation(match);
  assert.equal(match.stats.assists, 1);
  assert.equal(match.stats.goals, 0);
  assert.equal(match.score.home, before + 1);
});

test('an intercepted creative pass never records an assist or teammate shot', () => {
  const match = new Match(player(), { seed: 31 });
  nextPending(match);
  const shotsBefore = match.teamStats.home.shots;
  match.pending.options.find(option => option.id === 'assist').chance = 0;
  match.choose('assist');
  completeAnimation(match);
  assert.equal(match.stats.assists, 0);
  assert.equal(match.stats.passes, 1);
  assert.equal(match.stats.passesCompleted, 0);
  assert.equal(match.teamStats.home.shots, shotsBefore);
});

test('positions receive distinct actions and outcomes', () => {
  const roles = { ATA: ['placed', 'dribble', 'assist'], MC: ['short', 'through', 'longshot'], ZAG: ['tackle', 'cover', 'slide'], GOL: ['react', 'rush', 'left'] };
  for (const [position, ids] of Object.entries(roles)) {
    const match = new Match(player(position), { seed: 71 });
    nextPending(match);
    for (const id of ids) assert.ok(match.pending.options.some(option => option.id === id));
    assert.ok(match.pending.options.every(option => option.chance >= 0 && option.chance <= 1));
    match.choose(ids[0]);
    assert.equal(match.phase, 'animating');
    assert.equal(match.animation.actor, 'user');
    assert.equal(match.animation.team, 'home');
    statisticalIntegrity(match.simulateRest());
  }
});

test('goalkeeper saves require shots on target and conceded goals cancel clean sheets', () => {
  const match = new Match(player('GOL'), { seed: 6 });
  nextPending(match);
  const facedBefore = match.stats.shotsFaced;
  match.pending.options.find(option => option.id === 'react').chance = 1;
  match.choose('react');
  assert.equal(match.stats.shotsFaced, facedBefore);
  completeAnimation(match);
  assert.equal(match.stats.shotsFaced, facedBefore + 1);
  assert.ok(match.stats.saves > 0);
  nextPending(match);
  match.pending.options.find(option => option.id === 'react').chance = 0;
  match.choose('react');
  completeAnimation(match);
  const result = match.simulateRest();
  assert.ok(result.stats.goalsConceded > 0);
  assert.equal(result.cleanSheet, false);
  statisticalIntegrity(result);
});

test('two cautions produce a dismissal and no subsequent decisions', () => {
  const match = new Match(player('ZAG'), { seed: 7 });
  nextPending(match);
  match.stats.yellowCards = 1;
  match.pending.options.find(option => option.id === 'slide').chance = 0;
  // Deterministically choose a late slide and a second caution.
  match._random = () => 0.1;
  match.choose('slide');
  completeAnimation(match);
  assert.equal(match.stats.redCards, 1);
  assert.equal(match.onPitch, false);
  const decisions = match.stats.decisions;
  const result = match.simulateRest();
  assert.equal(result.stats.decisions, decisions);
  assert.equal(result.minutes, 3);
});

test('goals conceded before a reserve goalkeeper enters are excluded from their personal record', () => {
  const match = new Match(player('GOL', { club: 'palmeiras' }), { seed: 51, homeId: 'flamengo', awayId: 'palmeiras' });
  match.aiTimes = [5];
  match._random = () => 0;
  match.nextDecision();
  assert.equal(match.animation.outcome, 'goal');
  assert.ok(match.animation.to.x > 1);
  completeAnimation(match);
  assert.equal(match.score.home, 1);
  assert.equal(match.stats.goalsConceded, 0);
  const result = match.simulateRest();
  assert.equal(result.stats.goalsConceded, 0);
  assert.equal(result.cleanSheet, true);
  assert.equal(result.stats.saves, 4);
  statisticalIntegrity(result);
});

test('saved midway through an animation resumes deterministically and cannot count the same goal twice', () => {
  const match = new Match(player(), { seed: 91 });
  nextPending(match);
  match.pending.options.find(option => option.id === 'placed').chance = 1;
  match.choose('placed'); match.update(0.5);
  const restored = Match.fromJSON(match.toJSON());
  assert.deepEqual(restored.toJSON(), match.toJSON());
  assert.deepEqual(restored.simulateRest(), match.simulateRest());
});

test('save at a decision restores options, schedule and deterministic random state', () => {
  const match = new Match(player('MC', { club: 'palmeiras' }), { seed: 81, homeId: 'flamengo', awayId: 'palmeiras' });
  nextPending(match);
  assert.equal(match.userTeam, 'away');
  const restored = Match.fromJSON(JSON.parse(JSON.stringify(match)));
  assert.deepEqual(restored.pending, match.pending);
  assert.deepEqual(restored.simulateRest(), match.simulateRest());
});

test('corrupted or incompatible match saves are rejected with a useful error', () => {
  const match = new Match(player(), { seed: 88 });
  const data = match.toJSON();
  assert.throws(() => Match.fromJSON({ ...data, version: 999 }), /versão/);
  assert.throws(() => Match.fromJSON({ ...data, minute: -1 }), /corrompidos/);
  assert.throws(() => Match.fromJSON({ ...data, score: { home: -1, away: 0 } }), /corrompidos/);
  assert.throws(() => Match.fromJSON({ ...data, phase: 'decision', pending: null }), /incompleta/);
  assert.throws(() => Match.fromJSON({ ...data, phase: 'animating', animation: null }), /incompleta/);
  assert.throws(() => Match.fromJSON({ ...data, actionQueue: [{ animation: { kind: 'invalid' } }] }), /corrompidos/);
  assert.throws(() => Match.fromJSON({ ...data, pending: { options: [] } }), /inconsistente/);
  assert.throws(() => Match.fromJSON({ ...data, teamStats: { home: {}, away: {} } }), /corrompidas/);
  assert.throws(() => Match.fromJSON({ ...data, minute: 70, onPitch: true }), /corrompidos/);
  assert.throws(() => Match.fromJSON({ ...data, id: { match: 1 } }), /corrompidos/);
  assert.throws(() => Match.fromJSON({ ...data, id: ' ' }), /corrompidos/);
  assert.throws(() => Match.fromJSON({ ...data, exitMinute: 'not-a-number' }), /corrompidos/);
});

test('career records only actual match totals, keeps history and applies each result once', () => {
  const career = createCareer(player());
  const result = new Match(career.profile, { seed: 41 }).simulateRest();
  const next = applyResult(career, result);
  assert.equal(career.matchNumber, 0, 'input remains immutable');
  assert.equal(next.matchNumber, 1);
  assert.equal(next.totals.games, 1);
  assert.equal(next.totals.goals, result.stats.goals);
  assert.equal(next.totals.saves, result.stats.saves);
  assert.equal(next.totals.minutes, result.minutes);
  assert.equal(applyResult(next, result), next);
  assert.deepEqual(validateCareer(JSON.parse(JSON.stringify(next))), next);
  assert.throws(() => validateCareer({ ...next, totals: { ...next.totals, goals: 1000 } }), /não corresponde/);
  const invalidHistory = structuredClone(next);
  invalidHistory.history[0].xp = '<img src=x>';
  assert.throws(() => validateCareer(invalidHistory), /inválida/);
  invalidHistory.history[0].xp = result.xp;
  invalidHistory.history[0].id = { match: 1 };
  assert.throws(() => validateCareer(invalidHistory), /inválida/);
});

test('career imports restore an active match with the same athlete snapshot', () => {
  const career = createCareer(player('GOL'));
  const match = new Match(career.profile, { seed: 442 });
  nextPending(match);
  career.currentMatch = match.toJSON();
  assert.deepEqual(validateCareer(career), career);
  const invalid = structuredClone(career);
  invalid.currentMatch.profile.position = 'ATA';
  assert.throws(() => validateCareer(invalid), /não corresponde/);
  const unsafe = structuredClone(career);
  unsafe.currentMatch.pending.options[0].id = 'react" onclick="alert(1)';
  assert.throws(() => validateCareer(unsafe), /incompleta/);
});

test('one modest training session per match cannot rapidly inflate overall', () => {
  let career = createCareer(player());
  const before = career.profile.overall;
  const finishing = career.profile.attributes.finishing;
  career = trainCareer(career, 'attack');
  assert.equal(career.profile.attributes.finishing, finishing + 0.3);
  assert.equal(career.trainingAvailable, false);
  assert.equal(trainCareer(career, 'attack'), career);
  for (let index = 0; index < 10; index++) {
    career = applyResult(career, new Match(career.profile, { seed: 100 + index }).simulateRest());
    career = trainCareer(career, 'attack');
  }
  assert.ok(career.profile.overall - before <= 3);
  assert.equal(career.totals.games, 10);
  assert.equal(career.trainingLog.length, 11);
  validateCareer(career);
});

test('full-match multi-seed regression keeps event and statistical invariants across every role', () => {
  for (const position of POSITIONS.map(item => item.id)) {
    for (let seed = 1; seed <= 24; seed++) {
      const profile = player(position);
      if (seed % 2 === 0) profile.trust = 60;
      const match = new Match(profile, { seed });
      const result = match.simulateRest();
      statisticalIntegrity(result);
      assert.ok(result.rating >= 3 && result.rating <= 10);
      assert.ok(result.score.home + result.score.away < 15);
      assert.equal(result.stats.decisions, result.started ? 7 : 4);
      assert.ok(result.eventLog.some(event => event.type === 'final'));
    }
  }
});
