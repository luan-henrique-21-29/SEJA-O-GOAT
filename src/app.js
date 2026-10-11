import { CLUBS, POSITIONS, ATTRIBUTE_LABELS, DATA_META, clubById, createProfile, groupForPosition } from './data.js';
import { Match, createCareer, applyResult, trainCareer, validateCareer } from './engine.js';
import { PitchRenderer, drawAvatar } from './pitch.js';

const SAVE_KEY = 'football-life-brasil:v1';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icons = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>',
  pitch: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 4v16M2 9h4v6H2m20-6h-4v6h4"/><circle cx="12" cy="12" r="3"/>',
  stats: '<path d="M4 20V12m8 8V4m8 16V8M2 21h20"/>',
  settings: '<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 2 4 3-1 3 1 2-4 3-2-1-3 2-2-2-3-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  trophy: '<path d="M7 3h10v5a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 13v7m-5 1h10"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.bolt}</svg>`;
const crest = (club, big = false) => `<span class="crest ${big ? 'big' : ''}" aria-label="Símbolo alternativo ${escape(club.name)}" style="background:${club.pattern === 'stripes' ? `repeating-linear-gradient(0deg,${club.colors.primary} 0,${club.colors.primary} 8px,${club.colors.secondary} 8px,${club.colors.secondary} 16px)` : club.colors.primary};color:#fff">${club.short}</span>`;
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const fmt = (value, digits = 0) => numeric(value).toLocaleString('pt-BR', {maximumFractionDigits:digits, minimumFractionDigits:digits});
let career = null;
let match = null;
let renderer = null;
let page = 'overview';
let statsScope = 'career';
let speed = 1;
let paused = false;
let autoRest = false;
let skipToDecision = false;
let soundEnabled = false;
let storageAvailable = true;
let lastSaved = 0;
let frameRefresh = 0;
let uiMatchKey = '';
let audioContext;
let toastTimeout;
let creatorDraft = {name:'Lucas Silva',shirtName:'SILVA',nickname:'Lucas',nationality:'Brasil',age:18,height:178,weight:72,foot:'right',number:99,club:'flamengo',position:'ATA',secondaryPosition:'SA',skin:'#c98c58',face:'oval',hairStyle:'short',hairColor:'#211812',beard:'none',boots:'#b6f14b',accessory:'none'};
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    career = validateCareer(JSON.parse(raw));
    if (career.currentMatch) match = Match.fromJSON(career.currentMatch);
  }
  soundEnabled = localStorage.getItem(`${SAVE_KEY}:sound`) === 'true';
} catch (error) {
  if (error instanceof DOMException) storageAvailable = false;
  else setTimeout(() => toast('O salvamento não pôde ser lido. Importe um backup ou comece outra carreira.'), 500);
}

function toast(text) {
  clearTimeout(toastTimeout);
  $('#toast').textContent = text;
  $('#toast').classList.add('show');
  toastTimeout = setTimeout(() => $('#toast').classList.remove('show'), 4200);
}
function save() {
  if (!career) return;
  career.currentMatch = match && match.phase !== 'finished' ? match.toJSON() : null;
  lastSaved = performance.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(career));
    storageAvailable = true;
    lastSaved = performance.now();
  } catch {
    if (storageAvailable) toast('Não foi possível salvar neste navegador. Exporte um backup nas configurações.');
    storageAvailable = false;
  }
  updateSaveStatus();
}
function updateSaveStatus() {
  const el = $('#save-status');
  if (el) el.innerHTML = `<span class="dot" style="${storageAvailable ? '' : 'background:#e1a067'}"></span>${storageAvailable ? (career ? 'Progresso salvo' : 'Salvamento automático') : 'Use backup de carreira'}`;
}
function tone(type = 'click') {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    void audioContext.resume();
    const frequencies = type === 'goal' ? [392,494,587,784] : type === 'decision' ? [440,660] : [350];
    frequencies.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      const time = audioContext.currentTime + index * .09;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(.035, time + .015);
      gain.gain.exponentialRampToValueAtTime(.001, time + .16);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(time); oscillator.stop(time + .18);
    });
  } catch { /* Audio is optional in browsers without Web Audio. */ }
}
const metric = (label, value, note = '', unit = '') => `<div class="metric"><div class="metric-label">${escape(label)}${icon('stats')}</div><strong>${escape(value)}${unit ? `<em>${escape(unit)}</em>` : ''}</strong><small>${escape(note)}</small></div>`;
const heading = (eyebrow, title, text, chip = '') => `<div class="page-heading"><div><div class="eyebrow"><span class="dot"></span>${escape(eyebrow)}</div><h1 class="page-title">${escape(title)}</h1><p>${escape(text)}</p></div>${chip ? `<span class="chip">${escape(chip)}</span>` : ''}</div>`;
function fixture(home, away) {
  return `<div class="fixture"><div class="fixture-team">${crest(home,true)}<span>${home.name}</span></div><div class="fixture-vs">VS<small>DEMONSTRAÇÃO</small></div><div class="fixture-team">${crest(away,true)}<span>${away.name}</span></div></div>`;
}
function bar(label, value, style = '') {
  return `<div class="status-row"><span>${label}</span><b>${fmt(value)}%</b></div><div class="progress ${style}"><span style="width:${Math.min(100,Math.max(0,numeric(value)))}%"></span></div>`;
}
function render() {
  renderer?.destroy(); renderer = null;
  const nav = [['overview','home','Central'],['player','user','Meu atleta'],['match','pitch','Dia de jogo'],['stats','stats','Estatísticas'],['settings','settings','Configurações']];
  const active = !career && page !== 'settings' ? 'player' : page;
  const label = nav.find(item => item[0] === active)?.[2] || 'Central';
  $('#app').innerHTML = `<div class="shell"><aside class="sidebar"><a class="brand" href="#" data-action="nav" data-page="overview" aria-label="Football Life Brasil"><span class="brand-symbol">F</span><span class="brand-name">FOOTBALL LIFE<small>BRASIL</small></span></a><div class="sidebar-label">MODO CARREIRA</div><nav class="nav" aria-label="Menu principal">${nav.map(([id,ico,text])=>`<button data-action="nav" data-page="${id}" class="${active===id?'active':''}" ${active===id?'aria-current="page"':''}>${icon(ico)}<span>${text}</span></button>`).join('')}</nav><div class="sidebar-bottom"><div class="edition"><strong>O JOGO É SEU.</strong><small>Cada escolha escreve uma história.</small><br><span class="chip lime">DEMO JOGÁVEL · V0.1</span></div></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">Football Life Brasil ${icon('chevron')} <b>${label}</b></div><div class="top-actions"><span class="save-status" id="save-status"></span><div class="user-mini"><span>${escape(career?.profile.nickname || 'Nova promessa')}</span><span class="mini-avatar">${escape((career?.profile.nickname || 'FL').slice(0,2).toUpperCase())}</span></div></div></header><div class="page" id="page-content">${!career && page !== 'settings' ? creatorHTML() : page === 'overview' ? overviewHTML() : page === 'player' ? playerHTML() : page === 'match' ? matchHTML() : page === 'stats' ? statsHTML() : settingsHTML()}</div><footer class="footer"><span>FOOTBALL LIFE BRASIL · MODO CARREIRA JOGADOR</span><span>DEMO COM 2 CLUBES · BASE DE REFERÊNCIA 2025</span></footer></main></div>`;
  updateSaveStatus();
  if (!career && page !== 'settings') initCreator();
  else if (page === 'overview' || page === 'player') drawAvatar($('#athlete-avatar'), career.profile, clubById(career.profile.club), {transparentBackground:true});
  else if (page === 'match' && $('#pitch-canvas')) initMatchRenderer();
}

const options = (items, selected) => items.map(item => {
  const [value,label] = Array.isArray(item) ? item : [item,item];
  return `<option value="${escape(value)}" ${String(value)===String(selected)?'selected':''}>${escape(label)}</option>`;
}).join('');
const field = (label,name,html,full = false) => `<label class="field ${full?'full':''}">${label}${html}</label>`;
const input = (label,name,type='text',extra='') => field(label,name,`<input name="${name}" type="${type}" value="${escape(creatorDraft[name])}" ${extra}>`);
const select = (label,name,items) => field(label,name,`<select name="${name}">${options(items,creatorDraft[name])}</select>`);
function creatorHTML() {
  return `${heading('O primeiro capítulo','SUA CARREIRA COMEÇA AQUI.','Escolha sua camisa. Crie seu atleta. Conquiste o seu lugar.','FASE 1 + PARTIDA JOGÁVEL')}<div class="creation"><form class="panel creator-form" id="creator-form"><div class="form-tabs" role="tablist" aria-label="Personalização"><button type="button" class="form-tab active" data-action="creator-tab" data-tab="identity" role="tab" aria-selected="true">01 &nbsp; Identidade e clube</button><button type="button" class="form-tab" data-action="creator-tab" data-tab="appearance" role="tab" aria-selected="false">02 &nbsp; Aparência</button></div><div id="identity-fields"><div class="form-section">QUEM VAI ENTRAR EM CAMPO?</div><div class="form-grid">${input('Nome e sobrenome','name','text','required minlength="3" maxlength="40" autocomplete="name"')}${input('Nome na camisa','shirtName','text','required maxlength="15"')}${input('Apelido','nickname','text','maxlength="20"')}${input('Nacionalidade','nationality','text','required maxlength="30"')}${input('Idade · 16 a 22 anos','age','number','min="16" max="22" required')}${select('Pé dominante','foot',[['right','Direito'],['left','Esquerdo'],['both','Ambidestro']])}${input('Altura · cm','height','number','min="150" max="210" required')}${input('Peso · kg','weight','number','min="45" max="110" required')}</div><div class="form-section">SUA PRIMEIRA OPORTUNIDADE</div><div class="form-grid">${select('Clube inicial','club',CLUBS.map(c=>[c.id,c.name]))}${field('Número da camisa · disponíveis','number','<select name="number" id="shirt-number"></select>')}${select('Posição principal','position',POSITIONS.map(p=>[p.id,`${p.id} · ${p.label}`]))}${select('Posição secundária','secondaryPosition',[['','Sem posição secundária'],...POSITIONS.map(p=>[p.id,`${p.id} · ${p.label}`])])}</div><p class="info-note">Dois clubes nesta demonstração. Números ocupados no elenco de referência ficam indisponíveis. Seu atleta começa como reserva e ganha espaço com boas atuações.</p></div><div id="appearance-fields" class="hidden"><div class="form-section">SEU ESTILO, DENTRO E FORA DE CAMPO</div><div class="form-grid">${input('Tom de pele','skin','color')}${select('Formato do rosto','face',[['oval','Oval'],['round','Redondo'],['square','Quadrado']])}${select('Estilo do cabelo','hairStyle',[['short','Curto'],['curly','Cacheado'],['buzz','Raspado'],['long','Comprido'],['bald','Sem cabelo'],['mohawk','Moicano']])}${input('Cor do cabelo','hairColor','color')}${select('Barba','beard',[['none','Sem barba'],['stubble','Por fazer'],['full','Cheia']])}${input('Cor das chuteiras','boots','color')}${select('Acessórios','accessory',[['none','Sem acessórios'],['wrist','Munhequeiras'],['sleeves','Manga comprida']])}</div><p class="info-note">A prévia atualiza enquanto você personaliza. O mesmo atleta aparecerá no campo com seu número e uniforme.</p></div><div class="form-bottom"><span class="form-note">Um jovem talento. Muitas possibilidades.<br>O próximo capítulo depende de você.</span><button class="primary" type="submit">COMEÇAR MINHA CARREIRA ${icon('arrow')}</button></div></form><aside class="creator-preview"><div class="eyebrow">PRÉVIA DO ATLETA</div><div class="rating-badge" id="preview-overall">64<small>OVERALL</small></div><canvas id="creator-avatar" width="520" height="660" aria-label="Prévia desenhada do seu atleta"></canvas><div class="preview-meta"><h2 id="preview-name">SILVA</h2><p id="preview-position">ATA · 18 ANOS · CAMISA 99</p><span class="chip lime" id="preview-club">FLAMENGO · JOVEM PROMESSA</span></div></aside></div>`;
}
function initCreator() {
  const form = $('#creator-form');
  form.addEventListener('invalid',event=>{
    if($('#identity-fields').contains(event.target)) {
      document.querySelectorAll('.form-tab').forEach(tab=>{const active=tab.dataset.tab==='identity';tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));});
      $('#identity-fields').classList.remove('hidden');$('#appearance-fields').classList.add('hidden');
    }
  },true);
  function updateNumber() {
    const club = clubById(form.elements.club.value);
    const unavailable = new Set(club.roster.map(p=>p.number));
    $('#shirt-number').innerHTML = options(Array.from({length:99},(_,i)=>i+1).filter(n=>!unavailable.has(n)),creatorDraft.number);
    if (!$('#shirt-number').value) $('#shirt-number').value='99';
  }
  function update() {
    creatorDraft = {...creatorDraft,...Object.fromEntries(new FormData(form))};
    const profile = createProfile(creatorDraft);
    drawAvatar($('#creator-avatar'),profile,clubById(profile.club),{transparentBackground:true});
    $('#preview-overall').innerHTML = `${profile.overall}<small>OVERALL</small>`;
    $('#preview-name').textContent=profile.shirtName;
    $('#preview-position').textContent=`${profile.position} · ${profile.age} ANOS · CAMISA ${profile.number}`;
    $('#preview-club').textContent=`${clubById(profile.club).name.toUpperCase()} · JOVEM PROMESSA`;
  }
  updateNumber(); update();
  form.addEventListener('input', event=>{ if(event.target.name==='club') updateNumber(); update(); });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const name = form.elements.name.value.trim();
    if(name.length<3){form.elements.name.setCustomValidity('Digite seu nome e sobrenome.');form.elements.name.reportValidity();return;}
    form.elements.name.setCustomValidity('');
    if(!form.checkValidity()){toast('Confira os campos de identidade antes de continuar.');return;}
    career=createCareer(createProfile(Object.fromEntries(new FormData(form))));
    match=null;page='overview';save();render();toast('Bem-vindo ao clube. Sua história começa agora.');tone('click');
  });
  form.elements.name.addEventListener('input',()=>form.elements.name.setCustomValidity(''));
}
function overviewHTML() {
  const p=career.profile, club=clubById(p.club), away=CLUBS.find(c=>c.id!==p.club), t=career.totals;
  const keeper=groupForPosition(p.position)==='keeper';
  return `${heading('Centro da carreira',`BEM-VINDO, ${p.nickname}.`,'O talento abre a porta. Suas escolhas conquistam o campo.',`CARREIRA DEMO · ${career.matchNumber+1}º JOGO`)}<div class="grid grid-main"><section class="hero"><span class="hero-number">${p.number}</span><div class="hero-copy"><div class="eyebrow">${club.name.toUpperCase()} · ${p.position} · ${p.age} ANOS</div><h1>DA PROMESSA<br>À <span>HISTÓRIA.</span></h1><p>Sua camisa pesa. Sua jornada está só começando. Mostre o que você pode fazer.</p><button class="primary" data-action="start-match">${match&&match.phase!=='finished'?'CONTINUAR PARTIDA':'ENTRAR EM CAMPO'} ${icon('arrow')}</button><div class="hero-footer"><small><b>${p.overall}</b> OVERALL</small><small><b>#${p.number}</b> ${escape(p.shirtName)}</small><small><b>${p.trust>=58 && p.fitness>=70?'TITULAR':'RESERVA'}</b> STATUS</small></div></div><div class="hero-avatar"><canvas id="athlete-avatar" width="520" height="660" aria-label="Seu atleta desenhado"></canvas></div></section><section class="panel"><div class="panel-title"><h2>Seu próximo desafio</h2><span class="chip lime">AMISTOSO</span></div>${fixture(club,away)}<div class="fixture-info"><span>${icon('pitch').replace('<svg','<svg style="width:12px;height:12px;vertical-align:middle"')} ${club.stadium}</span><span>90 minutos · decisões ao vivo</span></div><button class="secondary wide" data-action="start-match">${match&&match.phase!=='finished'?'RETOMAR JOGO SALVO':'IR PARA A PARTIDA'} ${icon('play')}</button></section></div><div class="metric-row">${metric('Overall',p.overall,'Evolução gradual', 'OVR')}${metric('Partidas',t.games||0,'A sua trajetória em campo')}${metric(keeper?'Defesas':'Gols',keeper?t.saves:t.goals,keeper?'Finalizações defendidas':'Bolas na rede')}${metric('Nota média',t.games?fmt(t.ratingSum/t.games,1):'—','Atuações registradas')}</div><div class="grid grid-3"><section class="panel"><div class="panel-title"><h2>Seu espaço no elenco</h2>${icon('user')}</div>${bar('Confiança do treinador',p.trust)}${bar('Moral',p.morale,'blue')}${bar('Condição física',p.fitness,'orange')}<p class="info-note">${p.trust>=58 && p.fitness>=70?'Você conquistou a titularidade. Mantenha boas atuações para seguir no time.':'Comece no banco e prepare-se para entrar aos 55 minutos. A confiança chega com boas decisões.'}</p></section><section class="panel"><div class="panel-title"><h2>Treino da semana</h2><span class="chip">${career.trainingAvailable?'DISPONÍVEL':'CONCLUÍDO'}</span></div>${trainingHTML()}<p class="info-note">Uma sessão entre partidas. Pequenos ganhos que constroem uma grande carreira.</p></section><section class="panel"><div class="panel-title"><h2>Sua missão em campo</h2><span class="chip lime">${p.position}</span></div><div class="mini-pitch"><span class="position-dot" style="left:${keeper?8:groupForPosition(p.position)==='defense'?30:groupForPosition(p.position)==='midfield'?52:77}%"></span></div><p class="muted" style="font-size:11px">${roleDescription(p.position)}</p><button class="text-button" data-action="nav" data-page="player">Conhecer meu atleta ${icon('arrow')}</button></section></div>${career.history.length?`<section class="panel section-gap"><div class="panel-title"><h2>O último capítulo</h2><button class="text-button" data-action="nav" data-page="stats">Ver trajetória ${icon('arrow')}</button></div>${historyHTML(career.history.slice(0,1))}</section>`:''}`;
}
function trainingHTML() {
  const group=groupForPosition(career.profile.position);
  const choices=group==='keeper'?[['keeper','Trabalho de goleiro','Reflexos, posicionamento e defesa'],['passing','Jogo com os pés','Passe e reposição']]:group==='defense'?[['defense','Leitura defensiva','Marcação e desarme'],['passing','Construção de jogo','Passe, visão e controle']]:[['attack','Finalização e controle','Precisão na hora de decidir'],['passing','Passe e visão','Conecte o time em campo']];
  return [...choices,['physical','Preparação física','Velocidade e resistência']].map(([id,title,desc])=>`<button class="training-option" data-action="train" data-focus="${id}" ${!career.trainingAvailable||(match&&match.phase!=='finished')?'disabled':''}>${icon(id==='physical'?'bolt':'target')}<span><strong>${title}</strong><small>${desc}</small></span><span>${icon('chevron')}</span></button>`).join('');
}
function roleDescription(position) {
  return ({attack:'Ataque os espaços. Drible ou finalize no momento certo. Cada oportunidade importa.',midfield:'Leia o jogo. Encontre um companheiro e escolha quando acelerar a jogada.',defense:'Proteja a área. Acompanhe, intercepte e escolha a hora certa de desarmar.',keeper:'Feche o ângulo. Leia a finalização e reaja para manter sua meta segura.'})[groupForPosition(position)];
}
function playerHTML() {
  const p=career.profile,club=clubById(p.club);
  const keys=groupForPosition(p.position)==='keeper'?['reflexes','positioning','diving','handling','oneOnOnes','kicking','distribution','composure']:['speed','acceleration','finishing','passing','vision','dribbling','control','marking','tackling','strength','stamina'];
  return `${heading('Perfil do jogador','SUA CAMISA. SEU NOME.','Uma promessa com identidade própria. Um atleta em evolução.')}<div class="grid grid-main"><section class="panel"><div class="panel-title"><h2>Atributos do atleta</h2><span class="chip lime">${p.overall} OVR</span></div><div class="attribute-grid">${keys.map(key=>`<div class="attribute"><div class="status-row"><span>${ATTRIBUTE_LABELS[key]}</span><b>${fmt(p.attributes[key])}</b></div><div class="progress"><span style="width:${p.attributes[key]}%"></span></div></div>`).join('')}</div><div class="stats-list section-gap">${[['Nome',p.name],['Nacionalidade',p.nationality],['Posição principal',p.position],['Posição secundária',p.secondaryPosition||'—'],['Idade',`${p.age} anos`],['Altura / peso',`${p.height} cm / ${p.weight} kg`],['Pé dominante',{right:'Direito',left:'Esquerdo',both:'Ambidestro'}[p.foot]],['Experiência',`${fmt(p.xp)} XP`]].map(([label,value])=>`<div class="stat-line"><span>${label}</span><b>${escape(value)}</b></div>`).join('')}</div><p class="info-note">Os atributos sobem aos poucos com treinos e atuações. O desempenho em campo muda a confiança do treinador.</p></section><section class="creator-preview" style="position:relative;top:0"><div class="eyebrow">${club.name.toUpperCase()}</div><div class="rating-badge">${p.overall}<small>OVERALL</small></div><canvas id="athlete-avatar" width="520" height="660" aria-label="Seu atleta personalizado"></canvas><div class="preview-meta"><h2>${escape(p.shirtName)}</h2><p>#${p.number} · ${p.position} · ${p.age} ANOS</p><span class="chip lime">${p.trust>=58 && p.fitness>=70?'TITULAR':'JOVEM PROMESSA'}</span></div></section></div><section class="panel section-gap"><div class="panel-title"><h2>Seu vestiário · ${club.name}</h2><span class="chip">REFERÊNCIA 2025</span></div><div style="overflow:auto"><table class="roster"><thead><tr><th>NÚMERO</th><th>ATLETA</th><th>POSIÇÃO</th></tr></thead><tbody><tr class="user-row"><td>${p.number}</td><td>${escape(p.name)} <span class="chip lime">VOCÊ</span></td><td>${p.position}</td></tr>${club.roster.map(player=>`<tr><td>${player.number}</td><td>${escape(player.name)}</td><td>${player.position}</td></tr>`).join('')}</tbody></table></div><p class="info-note">${DATA_META.note}</p></section>`;
}
function matchHTML() {
  if(!match) return `${heading('Dia de jogo','É HORA DE MOSTRAR SEU FUTEBOL.','Partida 2D com decisões que alteram o que acontece no campo.')}<section class="panel">${fixture(clubById(career.profile.club),CLUBS.find(c=>c.id!==career.profile.club))}<div style="text-align:center"><p class="muted">${roleDescription(career.profile.position)}</p><button class="primary" data-action="start-match">COMEÇAR PARTIDA ${icon('play')}</button><p class="info-note">Jogue a 1x, 2x ou 4x. Pule até a próxima decisão quando quiser.</p></div></section>`;
  const home=clubById(match.homeId),away=clubById(match.awayId);
  return `${heading('Ao vivo · demonstração','O SEU MOMENTO É AGORA.',`${home.stadium} · ${career.profile.position} · ${career.profile.shirtName}`,match.phase==='finished'?'FIM DE JOGO':'PARTIDA INTERATIVA')}<div class="match-layout"><div><section class="match-stage"><div class="match-scoreboard"><span class="team-label">${crest(home)}${home.short}</span><span class="score" id="score">${match.score.home} : ${match.score.away}</span><span class="team-label">${away.short}${crest(away)}</span><span class="match-time" id="minute">${Math.floor(match.minute)}'</span></div><div class="canvas-wrap"><canvas id="pitch-canvas" aria-label="Campo de futebol 2D animado"></canvas><span class="pitch-label"><span class="dot"></span>FLB TV · ${home.stadium.toUpperCase()}</span><span class="pitch-user-label" id="pitch-status"></span></div><div class="match-controls"><div class="control-group"><button class="control" data-action="pause" aria-label="Pausar partida" id="pause-button">${icon('pause')}</button>${[1,2,4].map(s=>`<button class="control ${s===speed?'active':''}" data-action="speed" data-speed="${s}" aria-label="Velocidade ${s} vezes">${s}x</button>`).join('')}</div><div class="control-group"><button class="control" data-action="next" id="next-button">Próxima decisão ${icon('chevron')}</button><button class="control" data-action="simulate" id="simulate-button">Simular restante</button><button class="control ${soundEnabled?'active':''}" data-action="sound" aria-label="${soundEnabled?'Desativar':'Ativar'} sons" id="sound-button">${icon('volume')}</button></div></div></section><div id="decision-area" aria-live="polite"></div></div><aside class="match-side"><section class="panel"><div class="panel-title"><h2>Seu desempenho</h2><span class="chip lime" id="live-role">${career.profile.position}</span></div><div class="live-stats" id="live-stats"></div><p class="info-note" id="bench-status"></p></section><section class="panel"><div class="panel-title"><h2>Do campo</h2><span class="dot"></span></div><div class="commentary-log" id="event-log" aria-label="Lances da partida"></div></section></aside></div>`;
}
function initMatchRenderer() {
  uiMatchKey='';frameRefresh=0;
  renderer=new PitchRenderer($('#pitch-canvas'),{profile:career.profile,home:clubById(match.homeId),away:clubById(match.awayId),onFrame:dt=>{
    if(!paused && match.phase!=='finished') {
      const priorScore=match.score.home+match.score.away;
      if(skipToDecision && match.phase==='playing') match.nextDecision();
      match.update(dt,autoRest?4:speed);
      if(match.phase==='decision'&&!autoRest || match.phase==='finished') skipToDecision=false;
      if(autoRest && match.phase==='decision') {
        const best=[...match.pending.options].sort((a,b)=>b.chance-a.chance)[0];
        match.choose(best.id);
      }
      if(match.score.home+match.score.away>priorScore) tone('goal');
    }
    frameRefresh+=dt;
    if(frameRefresh>.12 || uiMatchKey!==`${match.phase}:${match.pending?.id||''}`) {refreshMatchUI();frameRefresh=0;}
    if(performance.now()-lastSaved>2200 && match.phase!=='finished') save();
  }});
  renderer.setMatch(match);renderer.start();refreshMatchUI();
}
function refreshMatchUI() {
  if(!$('#score')||!match) return;
  $('#score').textContent=`${match.score.home} : ${match.score.away}`;
  $('#minute').textContent=`${Math.floor(match.minute)}'`;
  const entered=match.onPitch;
  $('#pitch-status').textContent=`#${career.profile.number} ${career.profile.shirtName} · ${match.phase==='finished'?'FIM DE JOGO':match.stats.redCards?'EXPULSO':entered?'EM CAMPO':'NO BANCO'}`;
  $('#bench-status').textContent=match.stats.redCards?'Você foi expulso e acompanha o restante da partida.':entered?'Boas escolhas constroem uma boa atuação.':`Acompanhe o jogo do banco. Sua entrada está prevista para os ${match.entryMinute} minutos.`;
  const s=match.stats, keeper=groupForPosition(career.profile.position)==='keeper';
  $('#live-stats').innerHTML=(keeper?[['Defesas',s.saves],['Gols sofridos',s.goalsConceded],['No alvo enfrentadas',s.shotsFaced],['Decisões',s.decisions]]:[['Gols',s.goals],['Assistências',s.assists],['Passes certos',s.passesCompleted],['Decisões',s.decisions]]).map(([label,value])=>`<div class="live-stat"><strong>${fmt(value)}</strong><small>${label}</small></div>`).join('');
  $('#event-log').innerHTML=match.eventLog.slice(0,8).map(e=>`<div class="log-item ${e.type==='goal'?'goal':''}"><time>${Math.floor(e.minute)}'</time><span>${escape(e.text)}</span></div>`).join('');
  const key=`${match.phase}:${match.pending?.id||''}`;
  if(uiMatchKey!==key) {
    uiMatchKey=key;
    if(match.phase==='decision') {
      const p=match.pending;
      $('#decision-area').innerHTML=`<section class="decision-panel"><div class="decision-head"><div class="decision-icon">${icon('bolt')}</div><div><div class="eyebrow">${Math.floor(match.minute)}' · SUA DECISÃO</div><h3>${escape(p.title)}</h3><p>${escape(p.description)}</p></div></div><div class="decision-options">${p.options.map((o,i)=>`<button class="decision-choice" data-action="choose" data-choice="${escape(o.id)}"><span class="choice-key">${i+1}</span><span><strong>${escape(o.label)}</strong><small>${escape(o.detail)} · ${Math.round(o.chance*100)}% de êxito</small></span></button>`).join('')}</div></section>`;
      tone('decision');save();
    } else if(match.phase==='finished') {
      const result=match.result();
      career=applyResult(career,result);save();
      $('#decision-area').innerHTML=`<section class="end-summary"><div class="eyebrow" style="justify-content:center">APITO FINAL</div><h2>MAIS UM CAPÍTULO ESCRITO.</h2><p>Sua atuação entrou para a carreira. O próximo desafio já está esperando.</p><div class="metric-row">${metric('Sua nota',fmt(result.rating,1))}${metric('Experiência',`+${result.xp}`)}</div><button class="primary" data-action="finish-match">VOLTAR À CENTRAL ${icon('arrow')}</button><button class="text-button" data-action="nav" data-page="stats" style="margin-left:15px">Ver estatísticas</button></section>`;
    } else $('#decision-area').innerHTML=`<div class="decision-empty">${match.phase==='animating'?'Sua escolha está acontecendo no campo. Acompanhe a jogada.':autoRest?'Assistente ativo. As decisões serão resolvidas pelos seus atributos.':paused?'Partida pausada. Continue quando estiver pronto.':'Acompanhe o jogo. Você decide nos momentos que importam.'}</div>`;
  }
  $('#pause-button').innerHTML=icon(paused?'play':'pause');
  $('#pause-button').setAttribute('aria-label',paused?'Continuar partida':'Pausar partida');
  $('#next-button').disabled=match.phase==='decision'||match.phase==='finished';
  $('#simulate-button').disabled=match.phase==='finished';
  $('#simulate-button').textContent=autoRest?'Assumir decisões':'Simular restante';
  $('#pause-button').disabled=match.phase==='finished';
}
function statsHTML() {
  const keeper=groupForPosition(career.profile.position)==='keeper';
  const history=career.history;
  let t=career.totals;
  let title='Carreira completa';
  if(statsScope==='match') {
    const r=match?.phase==='finished'?match.result():match?{stats:match.stats,minutes:Math.max(0,Math.floor((match.exitMinute??match.minute)-match.entryMinute)),started:match.started,rating:0}:history[0];
    t=r?{...r.stats,games:match?.phase!=='finished'&&match?0:1,starts:r.started?1:0,minutes:r.minutes,ratingSum:r.rating,cleanSheets:r.cleanSheet?1:0}:{};title=match&&match.phase!=='finished'?'Partida atual':'Última partida';
  } else if(statsScope==='club') title=`Clube atual · ${clubById(career.profile.club).name}`;
  else if(statsScope==='season') title=`Ciclo de demonstração · ${career.season}`;
  const avg=t.games?fmt(t.ratingSum/t.games,1):'—';
  const lines=keeper?[
    ['Jogos',t.games],['Titularidades',t.starts],['Minutos',t.minutes],['Clean Sheets',t.cleanSheets],['Defesas',t.saves],['Média de defesas',t.games?fmt(t.saves/t.games,2):'—'],['Finalizações no alvo enfrentadas',t.shotsFaced],['Gols sofridos',t.goalsConceded],['Média de gols sofridos',t.games?fmt(t.goalsConceded/t.games,2):'—'],['Percentual de defesas',t.shotsFaced?`${fmt(100*t.saves/t.shotsFaced,1)}%`:'—'],['Pênaltis defendidos',t.penaltiesSaved],['Saídas do gol certas',t.successfulExits],['Nota média',avg]
  ]:[['Jogos',t.games],['Titularidades',t.starts],['Minutos',t.minutes],['Gols',t.goals],['Assistências',t.assists],['Finalizações',t.shots],['No alvo',t.shotsOnTarget],['Passes certos',t.passesCompleted],['Precisão dos passes',t.passes?`${fmt(100*t.passesCompleted/t.passes,1)}%`:'—'],['Dribles completos',t.dribblesCompleted],['Desarmes',t.tacklesWon],['Cartões amarelos',t.yellowCards],['Cartões vermelhos',t.redCards],['Nota média',avg]];
  return `${heading('Números que contam uma história','ESTATÍSTICAS DA CARREIRA.','Cada número nasce de uma ação registrada em campo.')}<div class="tabs" role="tablist" aria-label="Período das estatísticas">${[['match','Partida'],['season','Ciclo atual'],['club','Clube'],['career','Carreira']].map(([id,label])=>`<button role="tab" aria-selected="${statsScope===id}" class="${statsScope===id?'active':''}" data-action="stats-scope" data-scope="${id}">${label}</button>`).join('')}</div><div class="metric-row">${metric('Jogos',fmt(t.games))}${metric(keeper?'Clean Sheets':'Gols',fmt(keeper?t.cleanSheets:t.goals))}${metric(keeper?'Defesas':'Assistências',fmt(keeper?t.saves:t.assists))}${metric('Nota média',avg)}</div><section class="panel"><div class="panel-title"><h2>${title}</h2><span class="chip lime">${career.profile.position} · ${escape(career.profile.shirtName)}</span></div><div class="stats-list">${lines.map(([label,value])=>`<div class="stat-line"><span>${label}</span><b>${escape(value===undefined?'0':typeof value==='number'?fmt(value):value)}</b></div>`).join('')}</div><p class="info-note">Nesta demonstração, ciclo, clube e carreira abrangem as mesmas partidas amistosas. Campeonato de 38 rodadas e transferências fazem parte das próximas etapas.</p></section><section class="panel section-gap"><div class="panel-title"><h2>Histórico de partidas</h2><small>${history.length} registros</small></div>${history.length?historyHTML(history):`<div class="empty-state">${icon('trophy')}<p>A sua história ainda tem a primeira página em branco.<br>Jogue uma partida para registrar sua estreia.</p><button class="text-button" data-action="start-match">Ir para o campo ${icon('arrow')}</button></div>`}</section>`;
}
function historyHTML(history) {
  return history.map(r=>`<div class="history-item">${crest(clubById(r.club))}<div><strong>${clubById(r.homeId).short} × ${clubById(r.awayId).short}</strong><small>Amistoso · ${r.minutes} min · Nota ${fmt(r.rating,1)} · +${fmt(r.xp)} XP</small></div><span class="result-pill">${r.score.home} — ${r.score.away}</span></div>`).join('');
}
function settingsHTML() {
  return `${heading('Deixe o jogo do seu jeito','SEU JOGO, SUAS ESCOLHAS.','Cuide da sua carreira e personalize a experiência.')}<div class="grid grid-2"><section class="panel"><div class="panel-title"><h2>Preferências</h2>${icon('settings')}</div><div class="setting-row"><div><strong>Sons de jogo</strong><small>Sinais de decisão e comemoração de gols.</small></div><button class="secondary" data-action="sound">${soundEnabled?'ATIVADOS':'DESATIVADOS'}</button></div><div class="setting-row"><div><strong>Salvamento automático</strong><small>Seu progresso fica neste navegador.</small></div><span class="chip lime">${storageAvailable?'ATIVO':'INDISPONÍVEL'}</span></div><div class="settings-actions"><button class="secondary" data-action="export" ${!career?'disabled':''}>${icon('download')} EXPORTAR CARREIRA</button><button class="secondary" data-action="import">IMPORTAR BACKUP</button></div><p class="info-note">O backup inclui o atleta, os atributos, as partidas, o histórico e uma partida em andamento. Seus dados ficam no dispositivo; não há conta online ou sincronização.</p><input type="file" id="import-file" accept="application/json,.json" class="hidden"><div class="setting-row"><div><strong>Começar uma nova história</strong><small>Exporte um backup para guardar a carreira atual.</small></div><button class="danger" data-action="reset" ${!career?'disabled':''}>NOVA CARREIRA</button></div></section><section class="panel"><div class="panel-title"><h2>Sobre esta demonstração</h2><span class="chip lime">V0.1</span></div><p class="settings-text">Football Life Brasil é um jogo de carreira de jogador com futebol 2D e decisões interativas. Esta primeira versão reúne criação do atleta, duas equipes, partida animada, ações por posição, treinos, estatísticas e salvamento.</p><div class="club-card">${crest(CLUBS[0])}${crest(CLUBS[1])}<span><strong>Flamengo e Palmeiras</strong><small>Elencos de referência 2025</small></span></div><p class="settings-text">Os símbolos são alternativos e os uniformes são desenhados. A base local usa nomes reais de referência de 2025 e não representa os elencos oficiais de 2026.</p><p class="info-note">Próximas etapas: base verificada de 2026 com os 20 clubes, calendário de 38 rodadas, transferências, contratos e histórico de temporadas. Não há campeonato completo nesta demonstração.</p><a class="text-button" href="https://github.com/luan-henrique-21-29/jogo-do-dino" target="_blank" rel="noopener noreferrer">Código e documentação ${icon('arrow')}</a></section></div>`;
}
function startMatch() {
  if(!career){page='player';render();return;}
  if(match?.phase==='finished') match=null;
  if(!match) match=new Match(career.profile,{seed:Math.floor(Math.random()*2147483646)+1,homeId:career.profile.club,awayId:CLUBS.find(c=>c.id!==career.profile.club).id});
  page='match';paused=false;autoRest=false;skipToDecision=false;save();render();tone('click');
}
function confirmReset() {
  const dialog=document.createElement('dialog');
  dialog.innerHTML='<h2>Uma nova carreira?</h2><p>A carreira salva neste navegador será substituída. Exporte um backup primeiro se quiser guardar sua história.</p><div class="settings-actions"><button class="secondary" data-dialog="cancel">VOLTAR</button><button class="danger" data-dialog="confirm">COMEÇAR DE NOVO</button></div>';
  document.body.append(dialog);dialog.showModal();
  dialog.addEventListener('click',event=>{
    const action=event.target.closest('[data-dialog]')?.dataset.dialog;
    if(!action)return;
    if(action==='confirm') {
      renderer?.destroy();match=null;career=null;page='player';
      try{localStorage.removeItem(SAVE_KEY);}catch{}
      render();toast('Pronto para escrever uma nova história.');
    }
    dialog.close();
  });
  dialog.addEventListener('close',()=>dialog.remove());
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');
  if(!button||button.disabled)return;
  const action=button.dataset.action;
  if(action==='nav'){event.preventDefault();save();page=button.dataset.page;render();window.scrollTo(0,0);}
  else if(action==='creator-tab') {
    document.querySelectorAll('.form-tab').forEach(tab=>{const active=tab===button;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));});
    $('#identity-fields').classList.toggle('hidden',button.dataset.tab!=='identity');
    $('#appearance-fields').classList.toggle('hidden',button.dataset.tab!=='appearance');
  }
  else if(action==='start-match')startMatch();
  else if(action==='train'){
    const next=trainCareer(career,button.dataset.focus);
    if(next!==career){career=next;save();render();toast('Treino concluído. Um pequeno passo para o seu próximo nível.');tone('click');}
  }
  else if(action==='choose'){
    paused=false;match.choose(button.dataset.choice);save();refreshMatchUI();tone('click');
  }
  else if(action==='speed'){
    speed=Number(button.dataset.speed);document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===speed));
  }
  else if(action==='pause'){
    paused=!paused;uiMatchKey='';refreshMatchUI();
  }
  else if(action==='next'){
    paused=false;skipToDecision=true;match.nextDecision();save();refreshMatchUI();
  }
  else if(action==='simulate'){
    autoRest=!autoRest;paused=false;if(autoRest)match.simulated=true;
    if(autoRest&&match.phase==='decision')match.choose([...match.pending.options].sort((a,b)=>b.chance-a.chance)[0].id);
    skipToDecision=autoRest;if(autoRest)match.nextDecision();uiMatchKey='';refreshMatchUI();
  }
  else if(action==='finish-match'){
    career=applyResult(career,match.result());match=null;page='overview';autoRest=false;save();render();
  }
  else if(action==='stats-scope'){
    statsScope=button.dataset.scope;render();
  }
  else if(action==='sound'){
    soundEnabled=!soundEnabled;try{localStorage.setItem(`${SAVE_KEY}:sound`,String(soundEnabled));}catch{}
    if(page==='settings')render();
    else{button.classList.toggle('active',soundEnabled);button.setAttribute('aria-label',soundEnabled?'Desativar sons':'Ativar sons');}
    tone('decision');
  }
  else if(action==='export'){
    save();const blob=new Blob([JSON.stringify(career,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`football-life-${career.profile.shirtName.toLowerCase().replace(/[^\w-]/g,'')}-backup.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup da carreira exportado.');
  }
  else if(action==='import')$('#import-file').click();
  else if(action==='reset')confirmReset();
});
document.addEventListener('change',async event=>{
  if(event.target.id!=='import-file')return;
  const file=event.target.files[0];if(!file)return;
  try{
    if(file.size>3*1024*1024)throw new Error('O backup excede o limite de 3 MB.');
    const imported=validateCareer(JSON.parse(await file.text()));
    const importedMatch=imported.currentMatch?Match.fromJSON(imported.currentMatch):null;
    career=imported;match=importedMatch;paused=false;autoRest=false;page='overview';save();render();toast('Carreira importada. Bem-vindo de volta.');
  }catch(error){toast(`Não foi possível importar: ${error.message}`);event.target.value='';}
});
document.addEventListener('keydown',event=>{
  if(page!=='match'||match?.phase!=='decision'||event.ctrlKey||event.metaKey||event.altKey||['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
  const option=match.pending.options[Number(event.key)-1];
  if(option){event.preventDefault();match.choose(option.id);paused=false;save();refreshMatchUI();tone('click');}
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){paused=true;save();if(page==='match'){uiMatchKey='';refreshMatchUI();}}
});
window.addEventListener('pagehide',save);
render();
