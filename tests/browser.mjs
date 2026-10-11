import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Exercise public browser flows against the same static server used by npm run dev.
// No app internals or test hooks are needed. Fixtures use the public save format.
const root = fileURLToPath(new URL('../', import.meta.url));
const port = 4183;
const base = `http://127.0.0.1:${port}`;
const saveKey = 'football-life-brasil:v1';
const screenshotDir = process.env.QA_SCREENSHOT_DIR || path.resolve(root, '../work');
const failures = [];
const contexts = [];
let browser;
let serverOutput = '';
const server = spawn(process.execPath, ['scripts/server.mjs'], {
  cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', chunk => { serverOutput += chunk; });
server.stderr.on('data', chunk => { serverOutput += chunk; });
server.on('error', error => failures.push(`Servidor: ${error.message}`));

async function ready() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Servidor encerrou: ${serverOutput}`);
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(400) });
      if (response.ok) return;
    } catch { /* The child process may still be binding the port. */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Servidor não ficou pronto: ${serverOutput}`);
}

async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', error => failures.push(`JavaScript: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') failures.push(`Console: ${message.text()}`);
  });
  page.on('requestfailed', request => {
    const reason = request.failure()?.errorText || 'unknown';
    // A reload can intentionally cancel its own old document request.
    if (reason === 'net::ERR_ABORTED' && request.isNavigationRequest()) return;
    failures.push(`Requisição: ${request.url()} (${reason})`);
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('.page-title').waitFor();
  return page;
}

async function navigate(page, target) {
  await page.locator(`.nav [data-page="${target}"]`).click();
  await page.locator(`.nav [data-page="${target}"][aria-current="page"]`).waitFor();
}

async function saved(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
}

async function canvasInfo(page, selector) {
  return page.locator(selector).evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let colored = 0;
    let skinPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue;
      colored++;
      if (data[i] === 201 && data[i + 1] === 140 && data[i + 2] === 88) skinPixels++;
      if (i % 64 === 0) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    }
    return { width: canvas.width, height: canvas.height, colored, skinPixels, colors: colors.size, image: canvas.toDataURL() };
  });
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(screenshotDir, `qa-${name}.png`), fullPage: true, animations: 'disabled' });
}

async function noOverflow(page, description) {
  const sizes = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  assert.ok(sizes.document <= sizes.viewport + 1, `${description}: overflow ${sizes.document}px > ${sizes.viewport}px`);
}

function consistentResult(result) {
  const s = result.stats;
  assert.ok(s.goals <= s.shotsOnTarget && s.shotsOnTarget <= s.shots, 'finalizações e gols precisam conferir');
  assert.ok(s.passesCompleted <= s.passes && s.dribblesCompleted <= s.dribbles && s.tacklesWon <= s.tackles);
  assert.equal(s.shotsFaced, s.saves + s.goalsConceded);
  assert.equal(result.eventLog.filter(event => event.type === 'goal').length, result.score.home + result.score.away,
    'cada gol do placar precisa de um lance registrado');
  for (const team of ['home', 'away']) {
    assert.ok(result.score[team] <= result.teamStats[team].shotsOnTarget);
    assert.ok(result.teamStats[team].shotsOnTarget <= result.teamStats[team].shots);
  }
}

async function advanceToDecision(page) {
  if (await page.locator('.decision-choice').count()) return;
  await page.locator('#next-button').click();
  // Skipping advances quiet time and still displays every intervening animation.
  await page.waitForFunction(() => document.querySelector('.decision-choice') || document.querySelector('.end-summary'), null, { timeout: 20_000 });
  assert.equal(await page.locator('.end-summary').count(), 0, 'esperava uma decisão antes do apito final');
}

async function finishThroughControls(page) {
  for (let guard = 0; guard < 60; guard++) {
    const state = await page.evaluate(() => ({
      choices: document.querySelectorAll('.decision-choice').length,
      finished: Boolean(document.querySelector('.end-summary')),
      animating: Boolean(document.querySelector('.decision-empty')?.textContent.includes('acontecendo')),
    }));
    if (state.finished) return;
    if (state.choices) {
      await page.locator('.decision-choice').first().click();
    } else if (state.animating) {
      await page.waitForFunction(() => !document.querySelector('.decision-empty')?.textContent.includes('acontecendo'), null, { timeout: 15_000 });
    } else {
      try {
        await page.locator('#next-button').click({ timeout: 500 });
      } catch (error) {
        // A rendered playing frame can become a decision during click actionability checks.
        if (!await page.locator('.decision-choice, .end-summary').count()) throw error;
      }
    }
  }
  throw new Error('Os controles não conseguiram concluir a partida.');
}

async function run(name, task) {
  const started = Date.now();
  await task();
  console.log(`✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

try {
  await ready();
  await mkdir(screenshotDir, { recursive: true });
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true, args: ['--no-sandbox'],
  });
  const page = await newPage();
  let completedCareer;
  let backup;

  await run('Criação: validação, clubes, camisa livre e prévia personalizada', async () => {
    const initial = await canvasInfo(page, '#creator-avatar');
    assert.ok(initial.colored > initial.width * initial.height * .1 && initial.colors > 50 && initial.skinPixels > 100,
      `a prévia deve conter um atleta desenhado, além do fundo (${initial.width}×${initial.height}, ${initial.colored} pixels, ${initial.colors} cores, ${initial.skinPixels} pixels de pele)`);
    await page.locator('[name="name"]').fill('A');
    await page.locator('button[type="submit"]').click();
    assert.equal(await saved(page), null);
    assert.equal(await page.locator('[name="name"]').evaluate(input => input.validity.tooShort), true);
    await page.locator('[name="name"]').fill('   ');
    await page.locator('button[type="submit"]').click();
    assert.equal(await saved(page), null);
    await page.locator('[name="name"]').fill('Rafael dos Santos');
    await page.locator('[name="shirtName"]').fill('SANTOS');
    await page.locator('[name="nickname"]').fill('Rafa');
    await page.locator('[name="age"]').fill('23');
    await page.locator('button[type="submit"]').click();
    assert.equal(await saved(page), null);
    await page.locator('[name="age"]').fill('19');
    await page.locator('[name="height"]').fill('183');
    await page.locator('[name="weight"]').fill('78');
    await page.locator('[name="foot"]').selectOption('left');
    const clubs = await page.evaluate(async () => (await import('/src/data.js')).CLUBS.map(club => ({ id: club.id, numbers: club.roster.map(player => player.number) })));
    for (const club of clubs) {
      await page.locator('[name="club"]').selectOption(club.id);
      const available = await page.locator('#shirt-number option').evaluateAll(options => options.map(option => Number(option.value)));
      assert.ok(available.includes(99));
      assert.ok(club.numbers.every(number => !available.includes(number)), `${club.id}: nenhuma camisa ocupada pode ser escolhida`);
      assert.equal(available.length, 99 - new Set(club.numbers).size);
    }
    await page.locator('[name="club"]').selectOption('flamengo');
    await page.locator('[name="number"]').selectOption('99');
    await page.locator('[name="position"]').selectOption('ATA');
    await page.locator('[name="secondaryPosition"]').selectOption('PE');
    await page.locator('[data-action="creator-tab"][data-tab="appearance"]').click();
    await page.locator('[name="skin"]').fill('#8d5d3f');
    await page.locator('[name="hairStyle"]').selectOption('mohawk');
    await page.locator('[name="hairColor"]').fill('#b25b2c');
    await page.locator('[name="face"]').selectOption('square');
    await page.locator('[name="beard"]').selectOption('full');
    await page.locator('[name="boots"]').fill('#4488ff');
    await page.locator('[name="accessory"]').selectOption('wrist');
    const personalized = await canvasInfo(page, '#creator-avatar');
    assert.notEqual(personalized.image, initial.image, 'aparência deve alterar o desenho');
    assert.equal(await page.locator('#preview-name').textContent(), 'SANTOS');
    assert.match(await page.locator('#preview-position').textContent(), /ATA.*19 ANOS.*99/);
    await screenshot(page, 'creation-desktop');
    await page.locator('button[type="submit"]').click();
    await page.locator('.hero').waitFor();
    const career = await saved(page);
    assert.equal(career.profile.name, 'Rafael dos Santos');
    assert.equal(career.profile.club, 'flamengo');
    assert.equal(career.profile.number, 99);
    assert.equal(career.profile.position, 'ATA');
    assert.equal(career.profile.secondaryPosition, 'PE');
    assert.equal(career.profile.skin, '#8d5d3f');
    assert.equal(career.profile.accessory, 'wrist');
    assert.equal(career.profile.foot, 'left');
    assert.ok(career.profile.overall >= 60 && career.profile.overall <= 70);
    assert.equal(career.totals.games, 0);
    await navigate(page, 'player');
    assert.match(await page.locator('.user-row').textContent(), /99.*Rafael dos Santos.*ATA/s);
    assert.ok((await canvasInfo(page, '#athlete-avatar')).colors > 50);
    await noOverflow(page, 'perfil desktop');
  });

  await run('Treino: progresso gradual e uma sessão entre partidas', async () => {
    await navigate(page, 'overview');
    const before = await saved(page);
    await page.locator('[data-action="train"][data-focus="attack"]').click();
    const after = await saved(page);
    assert.equal(after.trainingLog.length, 1);
    assert.equal(after.trainingAvailable, false);
    assert.equal(after.profile.xp, before.profile.xp + 8);
    assert.ok(after.profile.attributes.finishing > before.profile.attributes.finishing);
    assert.ok(after.profile.attributes.finishing - before.profile.attributes.finishing < 1);
    assert.ok(await page.locator('[data-action="train"]').first().isDisabled());
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await saved(page)).trainingLog.length, 1);
    assert.ok(await page.locator('[data-action="train"]').first().isDisabled());
  });

  await run('Partida: relógio, velocidade, pausa e decisão salva no recarregamento', async () => {
    await page.locator('.hero [data-action="start-match"]').click();
    await page.locator('#pitch-canvas').waitFor();
    const field = await canvasInfo(page, '#pitch-canvas');
    assert.ok(field.colored > 40_000 && field.colors > 100, 'campo e jogadores devem aparecer no canvas');
    await page.locator('[data-speed="4"]').click();
    assert.ok(await page.locator('[data-speed="4"]').evaluate(button => button.classList.contains('active')));
    await page.waitForFunction(() => Number(document.querySelector('#minute').textContent.replace("'", '')) >= 1);
    await page.locator('#pause-button').click();
    assert.equal(await page.locator('#pause-button').getAttribute('aria-label'), 'Continuar partida');
    const pausedMinute = await page.locator('#minute').textContent();
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#minute').textContent(), pausedMinute, 'pausa deve congelar o relógio');
    await navigate(page, 'overview');
    assert.ok(await page.locator('[data-action="train"]').first().isDisabled(), 'treino não pode ocorrer durante a partida');
    await page.locator('.hero [data-action="start-match"]').click();
    await advanceToDecision(page);
    const decision = (await saved(page)).currentMatch;
    assert.equal(decision.phase, 'decision');
    assert.equal(decision.onPitch, true);
    assert.equal(decision.minute, 58);
    assert.equal(decision.stats.decisions, 0);
    assert.equal(await page.locator('#next-button').isDisabled(), true);
    const title = await page.locator('.decision-head h3').textContent();
    const choices = await page.locator('.decision-choice strong').allTextContents();
    await screenshot(page, 'decision-desktop');
    await page.waitForTimeout(300);
    assert.equal((await saved(page)).currentMatch.minute, decision.minute, 'decisão deve aguardar o jogador');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.hero [data-action="start-match"]').click();
    assert.equal(await page.locator('.decision-head h3').textContent(), title);
    assert.deepEqual(await page.locator('.decision-choice strong').allTextContents(), choices);
    assert.equal(await page.locator('#score').textContent(), `${decision.score.home} : ${decision.score.away}`);
  });

  await run('Ação: animação recuperada, resultado real e finalização sem duplicar', async () => {
    const decision = (await saved(page)).currentMatch;
    await page.locator('[data-choice="placed"]').click();
    await page.locator('#pause-button').click();
    await navigate(page, 'settings');
    const animationSave = await saved(page);
    assert.equal(animationSave.currentMatch.phase, 'animating');
    assert.equal(animationSave.currentMatch.stats.decisions, 1);
    assert.deepEqual(animationSave.currentMatch.score, decision.score, 'placar muda ao terminar a animação');
    assert.equal(animationSave.currentMatch.stats.shots, 0);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await saved(page)).currentMatch.phase, 'animating');
    await navigate(page, 'overview');
    await page.locator('.hero [data-action="start-match"]').click();
    await page.locator('[data-speed="4"]').click();
    await page.waitForFunction(() => !document.querySelector('.decision-empty')?.textContent.includes('acontecendo'), { timeout: 8000 });
    await page.locator('#pause-button').click();
    await navigate(page, 'settings');
    const committed = (await saved(page)).currentMatch;
    assert.equal(committed.stats.shots, 1, 'chute só conta uma vez após recuperar a animação');
    assert.equal(committed.stats.decisions, 1);
    assert.ok(committed.stats.goals <= 1);
    await navigate(page, 'match');
    await finishThroughControls(page);
    const finished = await saved(page);
    assert.equal(finished.history.length, 1);
    assert.equal(finished.totals.games, 1);
    assert.equal(finished.matchNumber, 1);
    assert.equal(finished.currentMatch, null);
    assert.equal(finished.trainingAvailable, true);
    consistentResult(finished.history[0]);
    assert.equal(finished.history[0].stats.decisions, 4);
    assert.equal(await page.locator('#score').textContent(), `${finished.history[0].score.home} : ${finished.history[0].score.away}`);
    assert.equal(await page.locator('#pause-button').isDisabled(), true);
    await screenshot(page, 'final-desktop');
    const xp = finished.profile.xp;
    await page.locator('[data-action="finish-match"]').click();
    assert.equal((await saved(page)).profile.xp, xp);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await saved(page)).totals.games, 1);
    assert.equal((await saved(page)).history.length, 1);
    await page.locator('[data-action="train"][data-focus="physical"]').click();
    assert.equal((await saved(page)).trainingLog.length, 2, 'uma partida concluída libera a próxima sessão');
    await navigate(page, 'stats');
    for (const scope of ['match', 'season', 'club', 'career']) {
      await page.locator(`[data-scope="${scope}"]`).click();
      assert.equal(await page.locator(`[data-scope="${scope}"]`).getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('.history-item').count(), 1);
    }
    completedCareer = await saved(page);
  });

  await run('Simulação: jogadas visíveis, novo histórico e estatísticas da última partida', async () => {
    await navigate(page, 'overview');
    await page.locator('.hero [data-action="start-match"]').click();
    await page.locator('[data-speed="4"]').click();
    await page.locator('#simulate-button').click();
    assert.equal(await page.locator('#simulate-button').textContent(), 'Assumir decisões');
    assert.equal(await page.locator('.end-summary').count(), 0, 'a simulação precisa mostrar as jogadas antes do resultado');
    await page.locator('#simulate-button').click();
    assert.equal(await page.locator('#simulate-button').textContent(), 'Simular restante');
    await page.locator('#simulate-button').click();
    await page.locator('.end-summary').waitFor({ timeout: 35_000 });
    const finished = await saved(page);
    assert.equal(finished.totals.games, 2);
    assert.equal(finished.history.length, 2);
    assert.equal(finished.history[0].simulated, true);
    assert.notEqual(finished.history[0].id, completedCareer.history[0].id);
    consistentResult(finished.history[0]);
    const newest = finished.history[0];
    await page.locator('[data-action="finish-match"]').click();
    assert.equal(await page.locator('.history-item .result-pill').textContent(), `${newest.score.home} — ${newest.score.away}`,
      'o último capítulo deve mostrar a partida mais recente');
    await navigate(page, 'stats');
    await page.locator('[data-scope="match"]').click();
    const goals = await page.locator('.stat-line').filter({ has: page.locator('span', { hasText: /^Gols$/ }) }).locator('b').textContent();
    assert.equal(Number(goals), newest.stats.goals, 'a aba Partida deve usar o resultado mais recente');
    assert.equal(await page.locator('.history-item .result-pill').first().textContent(), `${newest.score.home} — ${newest.score.away}`,
      'o histórico deve começar pela partida mais recente');
    completedCareer = await saved(page);
  });

  await run('Configurações: som, download, backups inválidos e restauração', async () => {
    await navigate(page, 'settings');
    await page.locator('[data-action="sound"]').click();
    assert.equal(await page.locator('[data-action="sound"]').textContent(), 'ATIVADOS');
    await page.reload({ waitUntil: 'networkidle' });
    await navigate(page, 'settings');
    assert.equal(await page.locator('[data-action="sound"]').textContent(), 'ATIVADOS');
    await page.locator('[data-action="sound"]').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-action="export"]').click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^football-life-santos-backup\.json$/);
    backup = await readFile(await download.path(), 'utf8');
    assert.deepEqual(JSON.parse(backup), completedCareer);
    for (const [name, contents] of [
      ['broken.json', '{bad json'],
      ['foreign.json', JSON.stringify({ version: 999, profile: {} })],
      ['tampered.json', JSON.stringify({ ...completedCareer, totals: { ...completedCareer.totals, goals: completedCareer.totals.goals + 100 } })],
      ['oversize.json', ' '.repeat(3 * 1024 * 1024 + 1)],
    ]) {
      await page.locator('#import-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(contents) });
      await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Não foi possível importar:'));
      assert.deepEqual(await saved(page), completedCareer, `${name}: falha de importação não pode alterar a carreira`);
    }
    await page.locator('[data-action="reset"]').click();
    await page.locator('dialog').waitFor();
    await page.locator('[data-dialog="cancel"]').click();
    assert.deepEqual(await saved(page), completedCareer, 'cancelar nova carreira deve manter o progresso');
    await page.locator('[data-action="reset"]').click();
    await page.locator('[data-dialog="confirm"]').click();
    assert.equal(await saved(page), null);
    await page.locator('#creator-form').waitFor();
    await navigate(page, 'settings');
    assert.equal(await page.locator('[data-action="export"]').isDisabled(), true);
    await page.locator('#import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await page.locator('.hero').waitFor();
    assert.deepEqual(await saved(page), completedCareer);
    await page.reload({ waitUntil: 'networkidle' });
    assert.deepEqual(await saved(page), completedCareer);
  });

  await run('Posições: quatro grupos com decisões e efeitos no navegador', async () => {
    const roles = [['GOL', 'react', 'saves'], ['ZAG', 'tackle', 'tackles'], ['MC', 'short', 'passes'], ['ATA', 'placed', 'shots']];
    for (const [position, choice, stat] of roles) {
      const rolePage = await newPage();
      const fixture = await rolePage.evaluate(async ({ position, key }) => {
        const { createProfile, groupForPosition, POSITIONS } = await import('/src/data.js');
        const { Match, createCareer } = await import('/src/engine.js');
        const profile = createProfile({ name: `Teste ${position}`, shirtName: position, position, club: 'palmeiras', number: 99 });
        const career = createCareer(profile);
        const match = new Match(profile, { seed: 1700, homeId: 'flamengo', awayId: 'palmeiras' });
        for (let guard = 0; guard < 100 && match.phase !== 'decision'; guard++) {
          if (match.phase === 'animating') match.update(.5, 4);
          else match.nextDecision();
        }
        career.currentMatch = match.toJSON();
        localStorage.setItem(key, JSON.stringify(career));
        return { group: groupForPosition(position), score: match.score, options: match.pending.options.map(option => option.id),
          groups: [...new Set(POSITIONS.map(item => item.group))] };
      }, { position, key: saveKey });
      assert.equal(fixture.groups.length, 4);
      assert.ok(fixture.options.includes(choice));
      await rolePage.reload({ waitUntil: 'networkidle' });
      await rolePage.locator('.hero [data-action="start-match"]').click();
      assert.equal(await rolePage.locator('#live-role').textContent(), position);
      assert.match(await rolePage.locator('#pitch-status').textContent(), /EM CAMPO/);
      assert.equal(await rolePage.locator('#score').textContent(), `${fixture.score.home} : ${fixture.score.away}`);
      await rolePage.locator('[data-speed="4"]').click();
      // The same 1–5 keyboard shortcuts presented in the UI must choose a real option.
      const choiceIndex = fixture.options.indexOf(choice) + 1;
      await rolePage.keyboard.press(String(choiceIndex));
      await rolePage.waitForFunction(() => document.querySelector('.decision-empty')?.textContent.includes('acontecendo'));
      await rolePage.waitForFunction(() => !document.querySelector('.decision-empty')?.textContent.includes('acontecendo'));
      await rolePage.locator('#pause-button').click();
      await navigate(rolePage, 'settings');
      const after = (await saved(rolePage)).currentMatch;
      assert.equal(after.stats.decisions, 1);
      if (position === 'GOL') assert.ok(after.stats.shotsFaced >= 1);
      else assert.equal(after.stats[stat], 1, `${position}: a escolha precisa produzir uma ação registrada`);
      assert.equal(after.stats.shotsFaced, after.stats.saves + after.stats.goalsConceded);
      await navigate(rolePage, 'match');
      await screenshot(rolePage, `role-${position.toLowerCase()}`);
      await rolePage.context().close();
    }
  });

  await run('Celular 390×844: criação, navegação e jogo sem overflow', async () => {
    const mobile = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await noOverflow(mobile, 'criação mobile');
    await screenshot(mobile, 'creation-mobile');
    await mobile.locator('[data-action="creator-tab"][data-tab="appearance"]').click();
    await noOverflow(mobile, 'aparência mobile');
    await mobile.locator('button[type="submit"]').click();
    await mobile.locator('.hero').waitFor();
    for (const target of ['overview', 'player', 'match', 'stats', 'settings']) {
      await navigate(mobile, target);
      await noOverflow(mobile, `${target} mobile`);
    }
    await mobile.locator('#import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await mobile.locator('.hero').waitFor();
    await screenshot(mobile, 'overview-mobile');
    await mobile.locator('.hero [data-action="start-match"]').click();
    await mobile.locator('[data-speed="4"]').click();
    await advanceToDecision(mobile);
    await noOverflow(mobile, 'decisão mobile');
    assert.equal(await mobile.locator('.decision-choice').count(), 5);
    await mobile.locator('.decision-choice').first().click();
    await screenshot(mobile, 'match-mobile');
    for (const target of ['overview', 'player', 'match', 'stats', 'settings']) {
      await navigate(mobile, target);
      await noOverflow(mobile, `${target} mobile com partida salva`);
    }
  });

  await run('Recuperação: save ilegível e armazenamento indisponível', async () => {
    const corrupted = await newPage();
    await corrupted.evaluate(key => localStorage.setItem(key, '{broken'), saveKey);
    await corrupted.reload({ waitUntil: 'networkidle' });
    await corrupted.locator('#creator-form').waitFor();
    await corrupted.waitForFunction(() => document.querySelector('#toast').textContent.includes('salvamento não pôde ser lido'));
    await corrupted.context().close();
    const unavailableContext = await browser.newContext();
    contexts.push(unavailableContext);
    await unavailableContext.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new DOMException('Storage denied', 'SecurityError'); };
      Storage.prototype.setItem = () => { throw new DOMException('Storage denied', 'SecurityError'); };
    });
    const unavailable = await unavailableContext.newPage();
    unavailable.on('pageerror', error => failures.push(`JavaScript sem storage: ${error.message}`));
    await unavailable.goto(base, { waitUntil: 'networkidle' });
    await unavailable.locator('button[type="submit"]').click();
    await unavailable.locator('.hero').waitFor();
    assert.match(await unavailable.locator('#save-status').textContent(), /backup/);
    await navigate(unavailable, 'settings');
    assert.equal(await unavailable.locator('[data-action="export"]').isDisabled(), false,
      'backup deve continuar disponível quando o navegador não permite salvar');
    const downloadPromise = unavailable.waitForEvent('download');
    await unavailable.locator('[data-action="export"]').click();
    const download = await downloadPromise;
    assert.equal(JSON.parse(await readFile(await download.path(), 'utf8')).profile.name, 'Lucas Silva');
    await unavailable.context().close();
  });

  assert.deepEqual(failures, [], 'o navegador não deve registrar erros inesperados');
  console.log(`\nBrowser QA passou. Capturas: ${screenshotDir}/qa-*.png`);
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => server.once('exit', resolve)),
      new Promise(resolve => setTimeout(() => { server.kill('SIGKILL'); resolve(); }, 2000)),
    ]);
  }
  if (failures.length) console.error('Erros do navegador:', failures.join('\n'));
}
