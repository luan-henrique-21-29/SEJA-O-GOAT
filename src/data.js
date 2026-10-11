// Base local de referência 2025. Amostra real; não representa elenco oficial de 2026.
export const DATA_META = {
  referenceSeason: 2025,
  updatedAt: '2026-10-11',
  label: 'Elencos de referência 2025 · amostra local',
  note: 'Nomes e números de referência de 2025. Escudos alternativos e uniformes desenhados; esta demonstração não usa marcas oficiais licenciadas.',
};

export const CLUBS = [
  {
    id: 'flamengo', name: 'Flamengo', short: 'FLA', city: 'Rio de Janeiro', stadium: 'Maracanã',
    colors: { primary: '#c92535', secondary: '#191c22', shorts: '#f8fafb' }, pattern: 'stripes', quality: 85,
    roster: [
      { name: 'Agustín Rossi', number: 1, position: 'GOL' },
      { name: 'Matheus Cunha', number: 25, position: 'GOL' },
      { name: 'Guillermo Varela', number: 2, position: 'LD' },
      { name: 'Léo Ortiz', number: 3, position: 'ZAG' },
      { name: 'Léo Pereira', number: 4, position: 'ZAG' },
      { name: 'Danilo', number: 13, position: 'ZAG' },
      { name: 'Alex Sandro', number: 26, position: 'LE' },
      { name: 'Ayrton Lucas', number: 6, position: 'LE' },
      { name: 'Erick Pulgar', number: 5, position: 'VOL' },
      { name: 'Jorginho', number: 21, position: 'VOL' },
      { name: 'Evertton Araújo', number: 52, position: 'VOL' },
      { name: 'Nicolás de la Cruz', number: 18, position: 'MC' },
      { name: 'Gerson', number: 8, position: 'MC' },
      { name: 'Giorgian de Arrascaeta', number: 10, position: 'MEI' },
      { name: 'Luiz Araújo', number: 7, position: 'PD' },
      { name: 'Everton', number: 11, position: 'PE' },
      { name: 'Gonzalo Plata', number: 50, position: 'PD' },
      { name: 'Michael', number: 30, position: 'PE' },
      { name: 'Pedro', number: 9, position: 'ATA' },
      { name: 'Bruno Henrique', number: 27, position: 'ATA' },
      { name: 'Wallace Yan', number: 64, position: 'SA' },
    ],
  },
  {
    id: 'palmeiras', name: 'Palmeiras', short: 'PAL', city: 'São Paulo', stadium: 'Allianz Parque',
    colors: { primary: '#087e50', secondary: '#f4faf6', shorts: '#f8fafb' }, pattern: 'solid', quality: 83,
    roster: [
      { name: 'Weverton', number: 21, position: 'GOL' },
      { name: 'Marcelo Lomba', number: 14, position: 'GOL' },
      { name: 'Marcos Rocha', number: 2, position: 'LD' },
      { name: 'Agustín Giay', number: 4, position: 'LD' },
      { name: 'Mayke', number: 12, position: 'LD' },
      { name: 'Gustavo Gómez', number: 15, position: 'ZAG' },
      { name: 'Murilo', number: 26, position: 'ZAG' },
      { name: 'Micael', number: 13, position: 'ZAG' },
      { name: 'Joaquín Piquerez', number: 22, position: 'LE' },
      { name: 'Vanderlan', number: 6, position: 'LE' },
      { name: 'Aníbal Moreno', number: 5, position: 'VOL' },
      { name: 'Richard Ríos', number: 8, position: 'MC' },
      { name: 'Emiliano Martínez', number: 32, position: 'VOL' },
      { name: 'Lucas Evangelista', number: 30, position: 'MC' },
      { name: 'Raphael Veiga', number: 23, position: 'MEI' },
      { name: 'Maurício', number: 18, position: 'MEI' },
      { name: 'Felipe Anderson', number: 7, position: 'PD' },
      { name: 'Facundo Torres', number: 17, position: 'PE' },
      { name: 'Estêvão', number: 41, position: 'PD' },
      { name: 'Paulinho', number: 10, position: 'SA' },
      { name: 'José Manuel López', number: 42, position: 'ATA' },
      { name: 'Vitor Roque', number: 9, position: 'ATA' },
    ],
  },
];

export const POSITIONS = [
  { id: 'GOL', label: 'Goleiro', group: 'keeper' },
  { id: 'ZAG', label: 'Zagueiro', group: 'defense' },
  { id: 'LD', label: 'Lateral direito', group: 'defense' },
  { id: 'LE', label: 'Lateral esquerdo', group: 'defense' },
  { id: 'VOL', label: 'Volante', group: 'midfield' },
  { id: 'MC', label: 'Meio-campista', group: 'midfield' },
  { id: 'MEI', label: 'Meia ofensivo', group: 'midfield' },
  { id: 'PD', label: 'Ponta direita', group: 'attack' },
  { id: 'PE', label: 'Ponta esquerda', group: 'attack' },
  { id: 'SA', label: 'Segundo atacante', group: 'attack' },
  { id: 'ATA', label: 'Centroavante', group: 'attack' },
];

export const ATTRIBUTE_LABELS = {
  speed: 'Velocidade', acceleration: 'Aceleração', finishing: 'Finalização', passing: 'Passe',
  vision: 'Visão de jogo', dribbling: 'Drible', control: 'Controle', marking: 'Marcação',
  tackling: 'Desarme', strength: 'Força', stamina: 'Resistência', reflexes: 'Reflexos',
  positioning: 'Posicionamento', diving: 'Mergulho', handling: 'Defesa de chutes',
  oneOnOnes: 'Saída do gol', kicking: 'Jogo com os pés', distribution: 'Reposição', composure: 'Segurança',
};

export function clubById(id) { return CLUBS.find(club => club.id === id) || CLUBS[0]; }
export function groupForPosition(id) { return POSITIONS.find(position => position.id === id)?.group || 'attack'; }
const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
const numeric = (value, fallback, min, max) => clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, min, max);
const clean = (value, fallback, max = 40) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) || fallback;
const color = (value, fallback) => /^#[\da-f]{6}$/i.test(String(value)) ? String(value) : fallback;
const choose = (value, list, fallback) => list.includes(value) ? value : fallback;

export function overallFromAttributes(attributes, position = 'ATA') {
  const group = groupForPosition(position);
  const keys = group === 'keeper' ? ['reflexes', 'positioning', 'diving', 'handling', 'oneOnOnes', 'kicking', 'distribution', 'composure']
    : group === 'defense' ? ['speed', 'marking', 'tackling', 'strength', 'stamina', 'positioning', 'passing']
      : group === 'midfield' ? ['passing', 'vision', 'control', 'dribbling', 'stamina', 'speed']
        : ['finishing', 'speed', 'acceleration', 'dribbling', 'control', 'positioning'];
  return Math.round(keys.reduce((total, key) => total + numeric(attributes?.[key], 60, 1, 99), 0) / keys.length);
}

export function createProfile(form = {}) {
  const position = choose(form.position, POSITIONS.map(item => item.id), 'ATA');
  const group = groupForPosition(position);
  const base = Object.fromEntries(Object.keys(ATTRIBUTE_LABELS).map(key => [key, 55]));
  const specialties = {
    attack: { speed: 67, acceleration: 68, finishing: 64, passing: 58, vision: 57, dribbling: 64, control: 65, stamina: 64, positioning: 63 },
    midfield: { speed: 62, acceleration: 62, passing: 67, vision: 65, dribbling: 63, control: 66, marking: 59, tackling: 58, stamina: 67, positioning: 61 },
    defense: { speed: 62, acceleration: 60, passing: 59, control: 59, marking: 67, tackling: 65, strength: 67, stamina: 64, positioning: 65 },
    keeper: { reflexes: 67, positioning: 63, diving: 65, handling: 64, oneOnOnes: 62, kicking: 58, distribution: 60, composure: 63, strength: 62, stamina: 61 },
  };
  const attributes = { ...base, ...specialties[group] };
  const club = clubById(form.club);
  const requestedNumber = Math.round(numeric(form.number, 99, 1, 99));
  const available = Array.from({ length: 99 }, (_, index) => index + 1).filter(number => !club.roster.some(player => player.number === number));
  const number = available.includes(requestedNumber) ? requestedNumber : available[available.length - 1];
  const name = clean(form.name, 'Lucas Silva');
  return {
    id: `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name, shirtName: clean(form.shirtName, name.split(' ').at(-1).toUpperCase(), 15),
    nickname: clean(form.nickname, name.split(' ')[0], 20), nationality: clean(form.nationality, 'Brasil', 30),
    age: Math.round(numeric(form.age, 18, 16, 22)), height: Math.round(numeric(form.height, 178, 150, 210)),
    weight: Math.round(numeric(form.weight, 72, 45, 110)), foot: choose(form.foot, ['right', 'left', 'both'], 'right'),
    number, club: club.id, position, secondaryPosition: choose(form.secondaryPosition, ['', ...POSITIONS.map(item => item.id)], ''),
    skin: color(form.skin, '#c98c58'), hairStyle: choose(form.hairStyle, ['short', 'curly', 'buzz', 'long', 'bald', 'mohawk'], 'short'),
    hairColor: color(form.hairColor, '#211812'), beard: choose(form.beard, ['none', 'stubble', 'full'], 'none'),
    boots: color(form.boots, '#b5ff51'), accessory: choose(form.accessory, ['none', 'wrist', 'sleeves'], 'none'),
    face: choose(form.face, ['oval', 'round', 'square'], 'oval'), attributes,
    overall: overallFromAttributes(attributes, position), trust: 42, morale: 75, fitness: 96, xp: 0,
  };
}
