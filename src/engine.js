import { ATTRIBUTE_LABELS, CLUBS, clubById, createProfile, groupForPosition, overallFromAttributes } from './data.js';

const copy = value => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const opposite = team => team === 'home' ? 'away' : 'home';
const validId = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
const STATS_KEYS = ['goals', 'assists', 'shots', 'shotsOnTarget', 'passes', 'passesCompleted', 'dribbles', 'dribblesCompleted', 'tackles', 'tacklesWon', 'saves', 'shotsFaced', 'goalsConceded', 'penaltiesSaved', 'successfulExits', 'yellowCards', 'redCards', 'decisions', 'successfulActions'];
export const STAT_LABELS = {
  goals: 'Gols', assists: 'Assistências', shots: 'Finalizações', shotsOnTarget: 'No alvo', passes: 'Passes tentados',
  passesCompleted: 'Passes certos', dribbles: 'Dribles tentados', dribblesCompleted: 'Dribles completos',
  tackles: 'Desarmes tentados', tacklesWon: 'Desarmes certos', saves: 'Defesas', shotsFaced: 'Chutes no alvo enfrentados',
  goalsConceded: 'Gols sofridos', penaltiesSaved: 'Pênaltis defendidos', successfulExits: 'Saídas bem-sucedidas',
  yellowCards: 'Cartões amarelos', redCards: 'Cartões vermelhos', decisions: 'Decisões', successfulActions: 'Ações bem-sucedidas',
};
export const emptyStats = () => Object.fromEntries(STATS_KEYS.map(key => [key, 0]));
const teamStats = () => ({ shots: 0, shotsOnTarget: 0, passes: 0, passesCompleted: 0 });
// The goal net extends just beyond the normalized field (goal lines at x=0 and x=1).
const validPoint = point => point && Number.isFinite(point.x) && point.x >= -0.04 && point.x <= 1.04
  && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1;
const validAnimation = animation => animation && ['shot', 'pass', 'dribble', 'tackle', 'save'].includes(animation.kind)
  && ['home', 'away'].includes(animation.team) && ['user', 'ai'].includes(animation.actor)
  && ['goal', 'saved', 'miss', 'success', 'fail', 'foul'].includes(animation.outcome)
  && validPoint(animation.from) && validPoint(animation.to)
  && Number.isFinite(animation.duration) && animation.duration > 0 && animation.duration <= 10;
const validEffect = effect => effect && ['shot', 'pass', 'dribble', 'tackle'].includes(effect.type)
  && (effect.type !== 'shot' || ['home', 'away'].includes(effect.team)
    && ['goal', 'saved', 'miss'].includes(effect.outcome) && typeof effect.shooter === 'string')
  && (effect.type === 'shot' || typeof effect.success === 'boolean');
const consistentStats = stats => stats && stats.goals <= stats.shotsOnTarget && stats.shotsOnTarget <= stats.shots
  && stats.passesCompleted <= stats.passes && stats.dribblesCompleted <= stats.dribbles
  && stats.tacklesWon <= stats.tackles && stats.shotsFaced === stats.saves + stats.goalsConceded;

function normalizeProfile(value) {
  if (!value || typeof value !== 'object' || typeof value.name !== 'string' || !CLUBS.some(club => club.id === value.club)) {
    throw new Error('O arquivo não contém um atleta válido.');
  }
  const player = createProfile(value);
  player.id = typeof value.id === 'string' ? value.id.slice(0, 100) : player.id;
  player.attributes = Object.fromEntries(Object.keys(ATTRIBUTE_LABELS).map(key => [key, clamp(finite(value.attributes?.[key], player.attributes[key]), 1, 99)]));
  player.overall = overallFromAttributes(player.attributes, player.position);
  for (const key of ['trust', 'morale', 'fitness']) player[key] = clamp(finite(value[key], player[key]), 0, 100);
  player.xp = Math.max(0, finite(value.xp));
  return player;
}

/** A deterministic event simulation. Effects become authoritative only after the animation finishes. */
export class Match {
  constructor(profile, { seed = Date.now(), homeId = profile.club, awayId = CLUBS.find(club => club.id !== homeId)?.id } = {}) {
    this.profile = normalizeProfile(profile);
    if (!CLUBS.some(club => club.id === homeId) || !CLUBS.some(club => club.id === awayId) || homeId === awayId) {
      throw new Error('Escolha dois clubes diferentes da demonstração.');
    }
    if (![homeId, awayId].includes(profile.club)) throw new Error('Seu clube precisa participar da partida.');
    this.version = 1;
    this.id = `match-${finite(seed, 1).toString(36)}-${this.profile.id}`;
    this.homeId = homeId;
    this.awayId = awayId;
    this.userTeam = profile.club === homeId ? 'home' : 'away';
    this.seed = (finite(seed, 1) >>> 0) || 1;
    this.rngState = this.seed;
    this.minute = 0;
    this.score = { home: 0, away: 0 };
    this.phase = 'playing';
    this.pending = null;
    this.animation = null;
    this.eventLog = [];
    this.stats = emptyStats();
    this.teamStats = { home: teamStats(), away: teamStats() };
    this.started = this.profile.trust >= 58 && this.profile.fitness >= 70;
    this.entryMinute = this.started ? 0 : 55;
    this.onPitch = this.started;
    this.decisionTimes = this.started ? [9, 21, 33, 46, 59, 71, 83] : [58, 66, 75, 84];
    this.decisionIndex = 0;
    this.aiTimes = [5, 14, 26, 37, 44, 52, 62, 70, 79, 88];
    this.aiIndex = 0;
    this.actionQueue = [];
    this.animationEffects = null;
    this.simulated = false;
    this._log(this.started ? 'Você começa entre os titulares.' : 'Você acompanha do banco. Entrada prevista aos 55 minutos.', 'info');
  }

  _random() {
    let x = this.rngState;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.rngState = x >>> 0;
    return this.rngState / 4294967296;
  }

  _log(text, type = 'info') {
    this.eventLog.unshift({ minute: Math.floor(this.minute), text, type });
    if (this.eventLog.length > 100) this.eventLog.length = 100;
  }

  _attribute(key) { return this.profile.attributes[key] || 55; }
  _direction(team = this.userTeam) { return team === 'home' ? 1 : -1; }
  _point(x, y = 0.5, team = this.userTeam) { return { x: team === 'home' ? x : 1 - x, y }; }
  _club(team) { return clubById(team === 'home' ? this.homeId : this.awayId); }
  _actor(team) {
    const candidates = this._club(team).roster.filter(player => groupForPosition(player.position) === 'attack');
    return candidates[Math.floor(this._random() * candidates.length)];
  }

  _makePending() {
    const group = groupForPosition(this.profile.position);
    const index = this.decisionIndex++;
    const pressure = 0.1 + this._random() * 0.25;
    const y = [0.48, 0.31, 0.62, 0.46, 0.7, 0.36, 0.54][index % 7];
    const fatigue = Math.max(0, this.minute - this.entryMinute) / (400 + this._attribute('stamina') * 6);
    const condition = (this.profile.fitness - 85) * 0.001;
    const rivalQuality = (this._club(opposite(this.userTeam)).quality - 80) * 0.002;
    const anglePenalty = Math.abs(y - 0.5) * 0.28;
    const chance = (attribute, base, modifier = 0) => clamp(base + (this._attribute(attribute) - 60) * 0.006
      - pressure * 0.12 - fatigue + condition - rivalQuality + modifier, 0.08, 0.94);
    let title, description, kind, from, to, options;
    if (group === 'keeper') {
      title = ['Frente a frente', 'Chute na área', 'Ataque pelo corredor', 'Última barreira'][index % 4];
      description = 'O atacante prepara a finalização. Escolha como proteger o gol.';
      kind = 'save'; from = this._point(0.24, y); to = this._point(0.035, 0.5);
      options = [
        { id: 'react', label: 'Ficar no gol e reagir', detail: 'Reflexos e posicionamento. Menor exposição.', chance: chance('reflexes', 0.67), kind: 'save' },
        { id: 'rush', label: 'Sair e fechar o ângulo', detail: 'Saída do gol. Pode chegar antes do chute.', chance: chance('oneOnOnes', 0.63, index % 2 === 0 ? 0.06 : -0.04), kind: 'save' },
        { id: 'left', label: 'Antecipar o canto esquerdo', detail: 'Mergulho. Arriscado se o chute vier do outro lado.', chance: chance('diving', 0.54, index % 2 === 0 ? 0.05 : -0.03), kind: 'save' },
        { id: 'right', label: 'Antecipar o canto direito', detail: 'Mergulho. Arriscado se o chute vier do outro lado.', chance: chance('diving', 0.54, index % 2 === 1 ? 0.05 : -0.03), kind: 'save' },
      ];
    } else if (group === 'defense') {
      title = ['Cobertura na defesa', 'Um contra um', 'Perigo na entrada da área', 'Última linha'][index % 4];
      description = 'O adversário avança. Uma recuperação pode iniciar o contra-ataque.';
      kind = 'tackle'; from = this._point(0.28, y); to = this._point(0.38, y + 0.06);
      options = [
        { id: 'tackle', label: 'Desarmar em pé', detail: 'Desarme e tempo de reação. Risco moderado.', chance: chance('tackling', 0.67), kind: 'tackle' },
        { id: 'cover', label: 'Fechar o espaço', detail: 'Marcação. Protege a área com menos risco de falta.', chance: chance('marking', 0.75), kind: 'tackle' },
        { id: 'slide', label: 'Dar carrinho', detail: 'Mais agressivo. Uma entrada atrasada pode gerar cartão.', chance: chance('tackling', 0.6), kind: 'tackle' },
        { id: 'intercept', label: 'Antecipar o passe', detail: 'Posicionamento. Se errar, abre um corredor.', chance: chance('positioning', 0.64), kind: 'tackle' },
      ];
    } else if (group === 'midfield') {
      title = ['Espaço entre as linhas', 'Transição rápida', 'Organize o ataque', 'Passe que rompe a defesa'][index % 4];
      description = 'Você recebe no meio. Escolha o ritmo e a direção da próxima jogada.';
      kind = 'pass'; from = this._point(0.56, y); to = this._point(0.76, 0.5);
      options = [
        { id: 'short', label: 'Passe curto seguro', detail: 'Mantém a posse e encontra apoio próximo.', chance: chance('passing', 0.83), kind: 'pass' },
        { id: 'through', label: 'Lançamento em profundidade', detail: 'Visão e passe. Pode deixar um companheiro na cara do gol.', chance: chance('vision', 0.63), kind: 'pass' },
        { id: 'switch', label: 'Virar o jogo', detail: 'Passe longo para o lado livre. Menos pressão na recepção.', chance: chance('passing', 0.72), kind: 'pass' },
        { id: 'carry', label: 'Avançar conduzindo', detail: 'Drible e controle. Arrisque ganhar terreno.', chance: chance('dribbling', 0.65), kind: 'dribble' },
        { id: 'longshot', label: 'Chutar de longe', detail: 'Finalização à distância. Menor chance de gol.', chance: chance('finishing', 0.17, -anglePenalty), kind: 'shot' },
      ];
    } else {
      title = ['Chance na entrada da área', 'Ataque em velocidade', 'Defensor se aproxima', 'Hora de decidir'][index % 4];
      description = 'Você recebe perto da área. O marcador fecha o espaço e um companheiro pede a bola.';
      const attackX = [0.78, 0.72, 0.83, 0.76][index % 4];
      const distanceModifier = (attackX - 0.77) * 0.65;
      kind = 'shot'; from = this._point(attackX, y); to = this._point(0.965, 0.5);
      options = [
        { id: 'placed', label: 'Chutar colocado', detail: 'Busca o canto com precisão. Depende de finalização e ângulo.', chance: chance('finishing', 0.34, distanceModifier - anglePenalty), kind: 'shot' },
        { id: 'power', label: 'Chutar com força', detail: 'Mais potência, maior risco de sair do alvo.', chance: chance('strength', 0.28, distanceModifier * 0.5 - anglePenalty), kind: 'shot' },
        { id: 'dribble', label: 'Driblar o marcador', detail: 'Pode ganhar espaço, mas perder a bola inicia o contra-ataque.', chance: chance('dribbling', 0.65), kind: 'dribble' },
        { id: 'assist', label: 'Servir o companheiro', detail: 'Passe decisivo. Assistência somente se a jogada terminar em gol.', chance: chance('passing', 0.72), kind: 'pass' },
        { id: 'hold', label: 'Proteger e esperar apoio', detail: 'Controle de bola. Opção segura para manter a posse.', chance: chance('control', 0.82), kind: 'dribble' },
      ];
    }
    this.pending = { id: `decision-${index}`, title, description, kind, from, to, context: { pressure, distance: Math.abs(to.x - from.x), angle: Math.abs(y - 0.5), fatigue }, options };
    this.phase = 'decision';
  }

  _startAction(action) {
    this.animation = { ...action.animation, elapsed: 0 };
    this.animationEffects = action.effects;
    this.phase = 'animating';
  }

  _shotAction(team, { actor = 'ai', actorName, from, chance = 0.19, assist = false, forcedOutcome = null } = {}) {
    const outcome = forcedOutcome || (this._random() < chance ? 'goal' : this._random() < 0.68 ? 'saved' : 'miss');
    const shooter = actorName || this._actor(team).name;
    return {
      animation: {
        kind: 'shot', team, actor, actorName: shooter,
        from: from || this._point(0.79, 0.34 + this._random() * 0.32, team),
        to: this._point(outcome === 'goal' ? 1.025 : 0.965, outcome === 'miss' ? (this._random() < 0.5 ? 0.31 : 0.69) : 0.47 + this._random() * 0.06, team),
        duration: outcome === 'goal' ? 2.1 : 1.8, elapsed: 0, outcome,
      },
      effects: { type: 'shot', team, userShot: actor === 'user', assist, shooter, outcome },
    };
  }

  choose(optionId) {
    if (this.phase !== 'decision' || !this.pending) return false;
    const option = this.pending.options.find(item => item.id === optionId);
    if (!option) return false;
    const pending = this.pending;
    const success = this._random() < option.chance;
    this.pending = null;
    this.stats.decisions++;
    if (option.kind === 'shot') {
      const outcome = success ? 'goal' : this._random() < (option.id === 'power' ? 0.48 : 0.73) ? 'saved' : 'miss';
      this._startAction(this._shotAction(this.userTeam, { actor: 'user', actorName: this.profile.name, from: pending.from, forcedOutcome: outcome }));
    } else if (option.kind === 'save') {
      const outcome = success ? 'saved' : 'goal';
      this._startAction({
        animation: { kind: 'save', from: pending.from, to: success ? pending.to : this._point(-0.025, 0.47 + this._random() * 0.06), team: this.userTeam, actor: 'user', actorName: this.profile.name, duration: 2, outcome, optionId },
        effects: { type: 'shot', team: opposite(this.userTeam), userShot: false, shooter: this._actor(opposite(this.userTeam)).name, outcome, exit: success && optionId === 'rush' },
      });
    } else if (option.kind === 'pass') {
      const creative = ['through', 'assist'].includes(optionId);
      const to = creative ? this._point(0.85, 0.51) : optionId === 'switch' ? this._point(0.66, pending.from.y > 0.5 ? 0.22 : 0.78) : this._point(0.61, pending.from.y + 0.1);
      this._startAction({
        animation: { kind: 'pass', from: pending.from, to, team: this.userTeam, actor: 'user', actorName: this.profile.name, duration: 1.7, outcome: success ? 'success' : 'fail' },
        effects: { type: 'pass', success, creative, to, team: this.userTeam },
      });
    } else if (option.kind === 'dribble') {
      this._startAction({
        animation: { kind: 'dribble', from: pending.from, to: this._point(optionId === 'hold' ? 0.72 : 0.84, pending.from.y + (success ? 0.07 : -0.05)), team: this.userTeam, actor: 'user', actorName: this.profile.name, duration: 1.9, outcome: success ? 'success' : 'fail' },
        effects: { type: 'dribble', success, hold: optionId === 'hold', from: pending.from },
      });
    } else {
      const foul = !success && this._random() < (optionId === 'slide' ? 0.6 : optionId === 'cover' ? 0.04 : 0.18);
      this._startAction({
        animation: { kind: 'tackle', from: pending.from, to: pending.to, team: this.userTeam, actor: 'user', actorName: this.profile.name, duration: 1.7, outcome: success ? 'success' : foul ? 'foul' : 'fail', optionId },
        effects: { type: 'tackle', success, foul, optionId },
      });
    }
    return true;
  }

  _commitAction() {
    const effect = this.animationEffects;
    if (!effect) return;
    if (effect.type === 'shot') {
      const onTarget = effect.outcome !== 'miss';
      this.teamStats[effect.team].shots++;
      if (onTarget) this.teamStats[effect.team].shotsOnTarget++;
      if (effect.userShot) {
        this.stats.shots++;
        if (onTarget) this.stats.shotsOnTarget++;
        if (effect.outcome === 'goal') { this.stats.goals++; this.stats.successfulActions++; }
      }
      if (groupForPosition(this.profile.position) === 'keeper' && this.onPitch && effect.team !== this.userTeam && onTarget) {
        this.stats.shotsFaced++;
        if (effect.outcome === 'saved') { this.stats.saves++; this.stats.successfulActions++; }
        else this.stats.goalsConceded++;
        if (effect.exit) this.stats.successfulExits++;
      }
      if (effect.outcome === 'goal') {
        this.score[effect.team]++;
        if (effect.assist) this.stats.assists++;
        this._log(`GOL! ${effect.shooter} marca para ${this._club(effect.team).name}.${effect.assist ? ' Assistência sua!' : ''}`, 'goal');
      } else if (effect.outcome === 'saved') this._log(`${effect.shooter} finaliza no alvo. ${effect.team !== this.userTeam && this.profile.position === 'GOL' && this.onPitch ? 'Você faz a defesa!' : 'O goleiro defende.'}`, 'save');
      else this._log(`${effect.shooter} finaliza para fora.`, 'shot');
    } else if (effect.type === 'pass') {
      this.stats.passes++; this.teamStats[this.userTeam].passes++;
      if (effect.success) {
        this.stats.passesCompleted++; this.stats.successfulActions++; this.teamStats[this.userTeam].passesCompleted++;
        this._log(effect.creative ? 'Seu passe rompe a marcação. O companheiro prepara o chute!' : 'Passe certo. O time mantém a posse.', 'pass');
        if (effect.creative) this.actionQueue.push(this._shotAction(this.userTeam, { from: effect.to, chance: 0.31, assist: true }));
      } else this._log('Passe interceptado. A defesa recupera a bola.', 'turnover');
    } else if (effect.type === 'dribble') {
      // Protecting possession is not recorded as a completed dribble.
      if (!effect.hold) { this.stats.dribbles++; if (effect.success) this.stats.dribblesCompleted++; }
      if (effect.success) {
        this.stats.successfulActions++;
        this._log(effect.hold ? 'Você protege a bola e encontra apoio.' : 'Drible completo! Você ganha terreno.', 'dribble');
        if (!effect.hold && this._random() < 0.4) {
          this.actionQueue.push(this._shotAction(this.userTeam, { actor: 'user', actorName: this.profile.name, from: this.animation.to, chance: 0.39 }));
        }
      } else {
        this._log('O marcador recupera a bola. Contra-ataque adversário.', 'turnover');
        if (this._random() < 0.35) this.actionQueue.push(this._shotAction(opposite(this.userTeam), { chance: 0.17 }));
      }
    } else if (effect.type === 'tackle') {
      // Closing space is a marking action, not a tackle.
      if (effect.optionId !== 'cover') { this.stats.tackles++; if (effect.success) this.stats.tacklesWon++; }
      if (effect.success) { this.stats.successfulActions++; this._log(effect.optionId === 'cover' ? 'Boa cobertura! O atacante recua e perde o espaço.' : 'Você recupera a bola e interrompe o ataque.', 'tackle'); }
      else if (effect.foul) {
        const booked = effect.optionId === 'slide' && this._random() < 0.65;
        if (booked) {
          this.stats.yellowCards++;
          if (this.stats.yellowCards >= 2) { this.stats.redCards = 1; this.onPitch = false; this.exitMinute = this.minute; this.decisionIndex = this.decisionTimes.length; }
        }
        this._log(booked ? this.stats.redCards ? 'Segunda advertência: você é expulso.' : 'Entrada atrasada. Falta e cartão amarelo.' : 'Você comete falta. O adversário tem uma bola parada.', 'foul');
        this.actionQueue.push(this._shotAction(opposite(this.userTeam), { chance: 0.12 }));
      } else {
        this._log('O atacante passa pela marcação e prepara a finalização.', 'turnover');
        this.actionQueue.push(this._shotAction(opposite(this.userTeam), { chance: 0.23 }));
      }
    }
    this.animationEffects = null;
  }

  _finishAnimation() {
    this._commitAction();
    this.animation = null;
    if (this.actionQueue.length) this._startAction(this.actionQueue.shift());
    else this.phase = 'playing';
  }

  _enterIfNeeded() {
    if (!this.onPitch && !this.stats.redCards && this.minute >= this.entryMinute) {
      this.onPitch = true;
      this._log(`Você entra em campo aos ${this.entryMinute} minutos!`, 'substitution');
    }
  }

  _nextTime() {
    return Math.min(this.decisionTimes[this.decisionIndex] ?? Infinity, this.aiTimes[this.aiIndex] ?? Infinity,
      !this.onPitch && !this.stats.redCards && this.minute < this.entryMinute ? this.entryMinute : Infinity, 90);
  }

  _processTime() {
    this._enterIfNeeded();
    if (this.minute >= 90) { this.minute = 90; this.phase = 'finished'; this._log('Fim de jogo. Sua atuação foi registrada.', 'final'); return; }
    if (this.minute >= (this.decisionTimes[this.decisionIndex] ?? Infinity) && this.onPitch) { this._makePending(); return; }
    if (this.minute >= (this.aiTimes[this.aiIndex] ?? Infinity)) {
      this.aiIndex++;
      const homeQuality = this._club('home').quality;
      const awayQuality = this._club('away').quality;
      const team = this._random() < homeQuality / (homeQuality + awayQuality) ? 'home' : 'away';
      this._startAction(this._shotAction(team, { chance: 0.17 + (this._club(team).quality - 80) * 0.005 }));
    }
  }

  update(dtSeconds, speed = 1) {
    if (this.phase === 'finished' || this.phase === 'decision') return;
    // Clamp time stalls so returning from another tab cannot skip an entire visual event.
    const dt = clamp(finite(dtSeconds), 0, 0.5);
    const rate = clamp(finite(speed, 1), 0.25, 4);
    if (this.phase === 'animating') {
      this.animation.elapsed = Math.min(this.animation.duration, this.animation.elapsed + dt * Math.min(rate, 2));
      if (this.animation.elapsed >= this.animation.duration) this._finishAnimation();
      return;
    }
    this.minute = Math.min(this.minute + dt * rate * 0.5, this._nextTime());
    this._processTime();
  }

  /** Skip quiet match time, but stop at each animation before any result can be committed. */
  nextDecision() {
    if (this.phase !== 'playing') return false;
    this.minute = this._nextTime();
    this._processTime();
    return true;
  }

  /** Explicit instant simulation. The result and event log report every committed action. */
  simulateRest() {
    if (this.phase === 'finished') return this.result();
    this.simulated = true;
    this._log('Simulação do restante iniciada. Confira o resultado e as jogadas no relatório.', 'info');
    let guard = 0;
    while (this.phase !== 'finished' && guard++ < 500) {
      if (this.phase === 'decision') {
        const options = this.pending.options;
        // Prefer safe actions, with limited variation; no arbitrary goals or career stats.
        const preferred = options.slice().sort((a, b) => b.chance - a.chance);
        const chosen = this._random() < 0.72 ? preferred[0] : options[Math.floor(this._random() * options.length)];
        this.choose(chosen.id);
      } else if (this.phase === 'animating') {
        this.animation.elapsed = this.animation.duration;
        this._finishAnimation();
      } else this.nextDecision();
    }
    if (guard >= 500) throw new Error('A simulação não conseguiu concluir esta partida.');
    return this.result();
  }

  rating() {
    const stats = this.stats;
    const positive = stats.goals * 1.05 + stats.assists * 0.7 + stats.saves * 0.18 + stats.tacklesWon * 0.2 + stats.passesCompleted * 0.08 + stats.dribblesCompleted * 0.13;
    const mistakes = (stats.passes - stats.passesCompleted) * 0.13 + (stats.dribbles - stats.dribblesCompleted) * 0.15 + (stats.tackles - stats.tacklesWon) * 0.1 + stats.goalsConceded * 0.35 + stats.yellowCards * 0.25 + stats.redCards * 0.8;
    return Math.round(clamp(6.1 + positive - mistakes, 3, 10) * 10) / 10;
  }

  result() {
    if (this.phase !== 'finished') return null;
    const minutes = Math.max(0, Math.floor((this.exitMinute ?? 90) - this.entryMinute));
    const cleanSheet = this.profile.position === 'GOL' && minutes > 0 && this.stats.goalsConceded === 0;
    return {
      id: this.id, homeId: this.homeId, awayId: this.awayId, score: copy(this.score), minute: 90,
      playerName: this.profile.name, club: this.profile.club, position: this.profile.position, started: this.started,
      minutes, rating: this.rating(), xp: 20 + this.stats.successfulActions * 5 + this.stats.goals * 10 + this.stats.assists * 8,
      stats: copy(this.stats), teamStats: copy(this.teamStats), cleanSheet, simulated: this.simulated,
      eventLog: copy(this.eventLog), overall: this.profile.overall,
    };
  }

  toJSON() { return copy({ ...this }); }

  static fromJSON(data) {
    if (!data || data.version !== 1 || !['playing', 'decision', 'animating', 'finished'].includes(data.phase)) throw new Error('A partida salva está inválida ou usa outra versão.');
    const match = new Match(normalizeProfile(data.profile), { seed: data.seed, homeId: data.homeId, awayId: data.awayId });
    const allowed = ['id', 'rngState', 'minute', 'score', 'phase', 'pending', 'animation', 'eventLog', 'stats', 'teamStats', 'started', 'entryMinute', 'onPitch', 'decisionTimes', 'decisionIndex', 'aiTimes', 'aiIndex', 'actionQueue', 'animationEffects', 'simulated', 'exitMinute'];
    for (const key of allowed) if (data[key] !== undefined) match[key] = copy(data[key]);
    const invalidStats = !data.stats || STATS_KEYS.some(key => !Number.isInteger(data.stats[key]) || data.stats[key] < 0) || !consistentStats(data.stats);
    const invalidSchedule = !Array.isArray(match.decisionTimes) || !Array.isArray(match.aiTimes)
      || [...match.decisionTimes, ...match.aiTimes].some(time => !Number.isFinite(time) || time < 0 || time > 90)
      || !Number.isInteger(match.decisionIndex) || !Number.isInteger(match.aiIndex)
      || match.decisionIndex < 0 || match.decisionIndex > match.decisionTimes.length || match.aiIndex < 0 || match.aiIndex > match.aiTimes.length
      || [match.decisionTimes, match.aiTimes].some(times => times.some((time, index) => index > 0 && time <= times[index - 1]))
      || (match.decisionTimes[match.decisionIndex] ?? Infinity) < match.minute || (match.aiTimes[match.aiIndex] ?? Infinity) < match.minute
      || (match.decisionTimes[match.decisionIndex - 1] ?? 0) > match.minute || (match.aiTimes[match.aiIndex - 1] ?? 0) > match.minute;
    const invalidState = !validId(match.id) || !Number.isFinite(match.minute) || match.minute < 0 || match.minute > 90
      || match.exitMinute != null && (!Number.isFinite(match.exitMinute) || match.exitMinute < match.entryMinute || match.exitMinute > match.minute)
      || !match.score || ['home', 'away'].some(team => !Number.isInteger(match.score[team]) || match.score[team] < 0 || match.score[team] > 30)
      || ![0, 55].includes(match.entryMinute) || typeof match.onPitch !== 'boolean' || typeof match.started !== 'boolean'
      || match.started !== (match.entryMinute === 0) || match.onPitch && match.minute < match.entryMinute
      || !Array.isArray(match.actionQueue) || !Array.isArray(match.eventLog)
      || !Number.isInteger(match.rngState) || match.rngState < 0 || match.rngState > 4294967295
      || match.actionQueue.some(action => !validAnimation(action?.animation) || !validEffect(action?.effects))
      || match.eventLog.some(event => !event || !Number.isFinite(event.minute) || event.minute < 0 || event.minute > 90 || typeof event.text !== 'string' || typeof event.type !== 'string');
    if (invalidState || invalidStats || invalidSchedule) throw new Error('Os dados da partida salva estão corrompidos.');
    if (match.phase === 'decision' && (!match.pending || typeof match.pending.title !== 'string' || typeof match.pending.description !== 'string'
      || !validPoint(match.pending.from) || !validPoint(match.pending.to)
      || !Array.isArray(match.pending.options) || !match.pending.options.length
      || match.pending.options.some(option => !option || typeof option.id !== 'string' || !/^[a-z]+$/.test(option.id) || typeof option.label !== 'string'
        || !['shot', 'pass', 'dribble', 'tackle', 'save'].includes(option.kind) || !Number.isFinite(option.chance) || option.chance < 0 || option.chance > 1))) throw new Error('A decisão salva está incompleta.');
    if (match.phase === 'animating' && (!validAnimation(match.animation) || !validEffect(match.animationEffects)
      || !Number.isFinite(match.animation.elapsed) || match.animation.elapsed < 0 || match.animation.elapsed > match.animation.duration)) throw new Error('A animação salva está incompleta.');
    if (match.phase !== 'animating' && (match.animation !== null || match.animationEffects !== null || match.actionQueue.length)
      || match.phase !== 'decision' && match.pending !== null
      || match.phase === 'finished' && match.minute !== 90) throw new Error('O estado da partida salva está inconsistente.');
    if (!match.teamStats || ['home', 'away'].some(team => !match.teamStats[team]
      || Object.keys(teamStats()).some(key => !Number.isInteger(match.teamStats[team][key]) || match.teamStats[team][key] < 0)
      || match.teamStats[team].shotsOnTarget > match.teamStats[team].shots || match.teamStats[team].passesCompleted > match.teamStats[team].passes
      || match.score[team] > match.teamStats[team].shotsOnTarget)) throw new Error('As estatísticas dos clubes estão corrompidas.');
    return match;
  }
}

export function createCareer(profile) {
  return {
    version: 1, mode: 'demo', season: 2026, profile: normalizeProfile(profile), matchNumber: 0,
    history: [], totals: { ...emptyStats(), games: 0, starts: 0, minutes: 0, ratingSum: 0, cleanSheets: 0 },
    trainingAvailable: true, trainingLog: [], timeline: [{ type: 'arrival', text: `Você chegou ao ${clubById(profile.club).name} como jovem promessa.`, match: 0 }],
    currentMatch: null, initialOverall: profile.overall,
  };
}

export function applyResult(career, result) {
  if (!result || result.minute !== 90 || !result.id || !result.stats) throw new Error('Conclua a partida antes de registrar o resultado.');
  if (career.history.some(match => match.id === result.id)) return career;
  if (result.club !== career.profile.club) throw new Error('O resultado pertence a outro clube.');
  const next = copy(career);
  next.matchNumber++;
  next.history.unshift(copy(result));
  for (const key of STATS_KEYS) next.totals[key] += finite(result.stats[key]);
  next.totals.games++;
  next.totals.starts += result.started ? 1 : 0;
  next.totals.minutes += result.minutes;
  next.totals.ratingSum += result.rating;
  next.totals.cleanSheets += result.cleanSheet ? 1 : 0;
  next.profile.xp += result.xp;
  next.profile.trust = clamp(next.profile.trust + (result.rating >= 6.5 ? 5 : result.rating >= 6 ? 2 : -3) - (result.stats.redCards ? 5 : 0), 0, 100);
  next.profile.morale = clamp(next.profile.morale + (result.rating - 6) * 2, 0, 100);
  next.profile.fitness = clamp(next.profile.fitness - result.minutes * 0.18 + 15, 50, 100);
  // Modest technical gains: a fraction of a point, linked to actual positive actions.
  if (result.stats.goals) next.profile.attributes.finishing = clamp(next.profile.attributes.finishing + 0.12, 1, 99);
  if (result.stats.passesCompleted) next.profile.attributes.passing = clamp(next.profile.attributes.passing + 0.08, 1, 99);
  if (result.stats.saves) next.profile.attributes.reflexes = clamp(next.profile.attributes.reflexes + 0.1, 1, 99);
  if (result.stats.tacklesWon) next.profile.attributes.tackling = clamp(next.profile.attributes.tackling + 0.1, 1, 99);
  next.profile.overall = overallFromAttributes(next.profile.attributes, next.profile.position);
  if (career.profile.trust < 58 && next.profile.trust >= 58) next.timeline.unshift({ type: 'opportunity', text: 'Você conquistou a confiança do treinador e poderá começar como titular.', match: next.matchNumber });
  next.trainingAvailable = true;
  next.currentMatch = null;
  return next;
}

const TRAINING = {
  attack: { label: 'Finalização e controle', keys: ['finishing', 'control'] },
  passing: { label: 'Passe e visão', keys: ['passing', 'vision'] },
  defense: { label: 'Marcação e desarme', keys: ['marking', 'tackling'] },
  keeper: { label: 'Reflexos e posicionamento', keys: ['reflexes', 'positioning'] },
  physical: { label: 'Velocidade e resistência', keys: ['speed', 'stamina'] },
};
export const TRAINING_FOCUSES = Object.entries(TRAINING).map(([id, value]) => ({ id, label: value.label }));
export function trainCareer(career, focus) {
  if (!TRAINING[focus]) throw new Error('Escolha um treino disponível.');
  if (!career.trainingAvailable || career.currentMatch) return career;
  const next = copy(career);
  for (const key of TRAINING[focus].keys) next.profile.attributes[key] = Math.round(clamp(next.profile.attributes[key] + 0.3, 1, 99) * 100) / 100;
  next.profile.overall = overallFromAttributes(next.profile.attributes, next.profile.position);
  next.profile.xp += 8;
  next.trainingAvailable = false;
  next.trainingLog.unshift({ focus, label: TRAINING[focus].label, match: next.matchNumber, gain: 0.3 });
  return next;
}

export function validateCareer(data) {
  if (!data || data.version !== 1 || data.mode !== 'demo' || !Array.isArray(data.history) || !data.totals) throw new Error('Este arquivo não é um save compatível do Football Life Brasil.');
  const profile = normalizeProfile(data.profile);
  if (!Number.isInteger(data.matchNumber) || data.matchNumber < 0 || data.history.length !== data.matchNumber) throw new Error('O histórico e o número de partidas não conferem.');
  if (!Array.isArray(data.trainingLog) || !Array.isArray(data.timeline) || typeof data.trainingAvailable !== 'boolean') throw new Error('Os dados de evolução do save estão incompletos.');
  if ([...STATS_KEYS, 'games', 'starts', 'minutes', 'ratingSum', 'cleanSheets'].some(key => !Number.isFinite(data.totals[key]) || data.totals[key] < 0)) throw new Error('As estatísticas da carreira estão corrompidas.');
  const ids = new Set();
  const rebuilt = { ...emptyStats(), games: 0, starts: 0, minutes: 0, ratingSum: 0, cleanSheets: 0 };
  for (const result of data.history) {
    if (!validId(result?.id) || ids.has(result.id) || result.club !== profile.club || result.position !== profile.position || result.minute !== 90 || !result.stats || !result.score
      || !Number.isInteger(result.minutes) || result.minutes < 0 || result.minutes > 90 || typeof result.started !== 'boolean'
      || !Number.isFinite(result.rating) || result.rating < 3 || result.rating > 10
      || !Number.isFinite(result.xp) || result.xp < 0) throw new Error('Há uma partida inválida no histórico.');
    ids.add(result.id);
    if (STATS_KEYS.some(key => !Number.isInteger(result.stats[key]) || result.stats[key] < 0) || !consistentStats(result.stats)
      || !CLUBS.some(club => club.id === result.homeId) || !CLUBS.some(club => club.id === result.awayId) || result.homeId === result.awayId
      || ![result.homeId, result.awayId].includes(result.club)
      || result.cleanSheet !== (result.position === 'GOL' && result.minutes > 0 && result.stats.goalsConceded === 0)
      || result.stats.goals + result.stats.assists > result.score[result.club === result.homeId ? 'home' : 'away']
      || ['home', 'away'].some(team => !Number.isInteger(result.score[team]) || result.score[team] < 0)) throw new Error('Há estatísticas inválidas no histórico.');
    for (const key of STATS_KEYS) rebuilt[key] += result.stats[key];
    rebuilt.games++; rebuilt.starts += result.started ? 1 : 0; rebuilt.minutes += result.minutes; rebuilt.ratingSum += result.rating; rebuilt.cleanSheets += result.cleanSheet ? 1 : 0;
  }
  if (Object.keys(rebuilt).some(key => Math.abs(rebuilt[key] - data.totals[key]) > 0.0001)) throw new Error('O total da carreira não corresponde às partidas salvas.');
  const next = copy(data);
  next.profile = profile;
  next.season = 2026;
  next.initialOverall = clamp(finite(data.initialOverall, profile.overall), 1, 99);
  if (next.currentMatch) {
    const match = Match.fromJSON(next.currentMatch);
    if (JSON.stringify(match.profile) !== JSON.stringify(profile)) throw new Error('A partida salva não corresponde ao atleta desta carreira.');
    next.currentMatch = match.toJSON();
  }
  return next;
}

export { overallFromAttributes };
