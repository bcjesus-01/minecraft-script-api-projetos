// ==============================================================
//  PARKOUR ALEATORIO  --  Minecraft Bedrock (Script API, JavaScript)
// ==============================================================
//  Um parkour no ceu que e INVENTADO na hora, com:
//    - plataformas que nascem so quando voce chega perto
//    - dificuldade que sobe: as plataformas ficam menores e os
//      pulos mais longos
//    - checkpoint a cada 5 plataformas (se cair, volta pra ele)
//    - SEMENTE: a mesma semente sempre gera o MESMO percurso,
//      entao um amigo pode jogar o seu parkour!
//    - contador de quedas, cronometro e medalha no final
//
//  COMANDOS (digite no chat, com a barra na frente):
//    /scriptevent parkour:ajuda
//    /scriptevent parkour:iniciar              (percurso padrao)
//    /scriptevent parkour:iniciar 20 3 777     (20 plataformas, dificuldade 3, semente 777)
//    /scriptevent parkour:sair                 (volta para o chao)
//    /scriptevent parkour:limpar               (apaga as plataformas)
// ==============================================================

import { world, system } from "@minecraft/server";

// ---------- CONSTANTES (valores que nunca mudam) ----------
const MIN_PLATAFORMAS = 6;
const MAX_PLATAFORMAS = 40;
const ALTURA_INICIAL = 10;       // o parkour comeca 10 blocos acima de voce
const A_CADA_CHECKPOINT = 5;     // um checkpoint a cada 5 plataformas
const ANTECEDENCIA = 4;          // quantas plataformas nascem na frente de voce
const LARGURA_DO_CORREDOR = 10;  // o percurso nao se afasta mais que isso dos lados
const TICKS_POR_RODADA = 4;      // o jogo "olha" o jogador a cada 4 ticks (0,2 s)

const BLOCO_INICIO = "minecraft:lime_concrete";
const BLOCO_CHECKPOINT = "minecraft:gold_block";
const BLOCO_FIM = "minecraft:emerald_block";
const BLOCOS_COMUNS = [
  "minecraft:red_concrete",
  "minecraft:orange_concrete",
  "minecraft:yellow_concrete",
  "minecraft:light_blue_concrete",
  "minecraft:purple_concrete",
  "minecraft:pink_concrete",
];

// ---------- MEMORIA DO JOGO (coisas que mudam) ----------
export const estado = {
  ativo: false,
  jogadorId: null,
  dimensao: null,
  plataformas: [],      // todas as plataformas do percurso
  construidas: -1,      // ate qual plataforma ja foi construida
  atual: 0,             // em qual plataforma o jogador esta
  checkpoint: 0,        // qual plataforma e o checkpoint atual
  quedas: 0,
  ticks: 0,
  semente: 0,
  retorno: null,        // onde o jogador estava antes de comecar
};

// ==============================================================
//  SORTEIO COM SEMENTE
// ==============================================================
// O computador nao sorteia de verdade: ele usa uma formula. Se voce
// comeca a formula do mesmo numero (a semente), sai sempre a mesma
// sequencia. Por isso a mesma semente gera o mesmo parkour.
function criarSorteio(semente) {
  let s = semente >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sorteia um numero inteiro entre minimo e maximo (inclusive).
function inteiroEntre(sorteio, minimo, maximo) {
  return minimo + Math.floor(sorteio() * (maximo - minimo + 1));
}

function limitar(valor, minimo, maximo, padrao) {
  if (!Number.isFinite(valor) || valor === 0) valor = padrao;
  return Math.max(minimo, Math.min(maximo, Math.floor(valor)));
}

// ==============================================================
//  AS REGRAS DA DIFICULDADE
//  "fracao" vai de 0 (comeco) ate 1 (fim): o jogo fica mais dificil.
// ==============================================================

function tamanhoDaPlataforma(dificuldade, fracao) {
  if (dificuldade === 1) return 3;
  if (dificuldade === 2) return fracao < 0.35 ? 3 : 2;
  return fracao < 0.25 ? 3 : (fracao < 0.6 ? 2 : 1);
}

// Quantos blocos de ar podem existir entre uma plataforma e a proxima.
// Maximo 3: e o que da para pular correndo.
function folgaMaxima(dificuldade, fracao) {
  if (dificuldade === 1) return 2;
  if (dificuldade === 2) return fracao < 0.5 ? 2 : 3;
  return 3;
}

function deslocamentoMaximo(dificuldade, fracao) {
  if (dificuldade === 1) return 1;
  if (dificuldade === 2) return fracao < 0.5 ? 1 : 2;
  return 2;
}

function chanceDeSubir(dificuldade) {
  return dificuldade === 1 ? 0.25 : (dificuldade === 2 ? 0.4 : 0.5);
}

function limitarValor(valor, minimo, maximo) {
  return Math.max(minimo, Math.min(maximo, valor));
}

// ==============================================================
//  PASSO 1: INVENTAR O PERCURSO (so numeros, ainda sem blocos)
// ==============================================================
// Cada plataforma e um "canto" (x, y, z) mais um tamanho.
// O percurso sempre anda para o Sul (z aumenta).

export function gerarPercurso(inicio, quantidade, dificuldade, semente) {
  const sorteio = criarSorteio(semente);
  const lista = [];

  lista.push({ x: inicio.x, y: inicio.y, z: inicio.z, tamanho: 3, tipo: "inicio", bloco: BLOCO_INICIO });

  for (let i = 1; i < quantidade; i++) {
    const anterior = lista[i - 1];
    const fracao = i / (quantidade - 1);
    const ultima = (i === quantidade - 1);
    const checkpoint = (!ultima && i % A_CADA_CHECKPOINT === 0);

    // plataformas de descanso (checkpoint e final) sao sempre grandes
    const tamanho = (ultima || checkpoint) ? 3 : tamanhoDaPlataforma(dificuldade, fracao);

    // 1) quanto de ar entre as duas plataformas
    let folga = inteiroEntre(sorteio, 1, folgaMaxima(dificuldade, fracao));

    // 2) a proxima plataforma sobe 1 bloco? (nao na ultima: o final fica no mesmo nivel)
    let sobe = (!ultima && sorteio() < chanceDeSubir(dificuldade)) ? 1 : 0;
    if (sobe === 1) folga = Math.min(folga, 2);   // pular para cima e mais dificil: pulo mais curto

    // 3) quanto ela se desloca para o lado
    const maxLado = deslocamentoMaximo(dificuldade, fracao);
    let x = anterior.x + inteiroEntre(sorteio, -maxLado, maxLado);
    x = limitarValor(x, inicio.x - LARGURA_DO_CORREDOR, inicio.x + LARGURA_DO_CORREDOR);

    // 4) regra de seguranca: pulo longo (folga 3) tem que ser quase reto
    if (folga >= 3) {
      x = limitarValor(x, anterior.x - tamanho + 1, anterior.x + anterior.tamanho - 1);
    } else {
      x = limitarValor(x, anterior.x - tamanho - 1, anterior.x + anterior.tamanho + 1);
    }

    let tipo = "comum";
    let bloco = BLOCOS_COMUNS[inteiroEntre(sorteio, 0, BLOCOS_COMUNS.length - 1)];
    if (checkpoint) { tipo = "checkpoint"; bloco = BLOCO_CHECKPOINT; }
    if (ultima) { tipo = "fim"; bloco = BLOCO_FIM; }

    lista.push({
      x: x,
      y: anterior.y + sobe,
      z: anterior.z + anterior.tamanho + folga,
      tamanho: tamanho,
      tipo: tipo,
      bloco: bloco,
    });
  }
  return lista;
}

// ==============================================================
//  PASSO 2: CONSTRUIR AS PLATAFORMAS (so quando o jogador se aproxima)
// ==============================================================

function colocarBloco(x, y, z, tipo) {
  try {
    const b = estado.dimensao.getBlock({ x: x, y: y, z: z });
    if (b) b.setType(tipo);
  } catch (e) { /* lugar ainda nao carregado: ignora */ }
}

function construirPlataforma(p, tipoDeBloco) {
  for (let dx = 0; dx < p.tamanho; dx++) {
    for (let dz = 0; dz < p.tamanho; dz++) {
      colocarBloco(p.x + dx, p.y, p.z + dz, tipoDeBloco || p.bloco);
    }
  }
}

function apagarTudo() {
  for (let i = 0; i <= estado.construidas; i++) {
    construirPlataforma(estado.plataformas[i], "minecraft:air");
  }
  estado.construidas = -1;
}

// Ponto onde o jogador fica de pe, no meio da plataforma.
function centroDe(p) {
  return {
    x: p.x + p.tamanho / 2,
    y: p.y + 1,
    z: p.z + p.tamanho / 2,
  };
}

// O jogador esta em cima desta plataforma?
function estaEmCima(p, loc) {
  return loc.x >= p.x && loc.x <= p.x + p.tamanho &&
         loc.z >= p.z && loc.z <= p.z + p.tamanho &&
         loc.y >= p.y + 0.9 && loc.y <= p.y + 2.6;
}

// ==============================================================
//  PASSO 3: O JOGO
// ==============================================================

function acharJogador() {
  for (const j of world.getPlayers()) {
    if (j.id === estado.jogadorId) return j;
  }
  return null;
}

function mostrarPlacar(jogador) {
  const total = estado.plataformas.length - 1;
  const segundos = Math.floor(estado.ticks / 20);
  try {
    jogador.onScreenDisplay.setActionBar(
      "§eFase " + estado.atual + "/" + total +
      "  §cQuedas: " + estado.quedas +
      "  §bTempo: " + segundos + "s"
    );
  } catch (e) { /* enfeite */ }
}

function tocar(jogador, som) {
  try { jogador.playSound(som); } catch (e) { /* enfeite */ }
}

function medalha(quedas) {
  if (quedas === 0) return "§6OURO (nenhuma queda!)";
  if (quedas <= 3) return "§7PRATA";
  return "§cBRONZE";
}

function vitoria(jogador) {
  estado.ativo = false;
  const segundos = Math.floor(estado.ticks / 20);
  const resumo = "Tempo: " + segundos + "s  |  Quedas: " + estado.quedas;
  try {
    jogador.onScreenDisplay.setTitle("§aVITORIA!", { subtitle: resumo });
  } catch (e) { /* enfeite */ }
  world.sendMessage("§a=== VITORIA! ===");
  world.sendMessage("§f" + resumo);
  world.sendMessage("§fMedalha: " + medalha(estado.quedas));
  world.sendMessage("§7Para jogar este mesmo percurso de novo: semente " + estado.semente);
  tocar(jogador, "random.levelup");
  // fogos de artificio (enfeite: se falhar, tudo bem)
  const fim = centroDe(estado.plataformas[estado.plataformas.length - 1]);
  for (let i = 0; i < 3; i++) {
    try {
      estado.dimensao.spawnEntity("minecraft:fireworks_rocket", { x: fim.x + i - 1, y: fim.y, z: fim.z });
    } catch (e) { /* enfeite */ }
  }
}

function voltarAoCheckpoint(jogador) {
  estado.quedas++;
  jogador.teleport(centroDe(estado.plataformas[estado.checkpoint]));
  try { jogador.clearVelocity(); } catch (e) { /* enfeite */ }
  tocar(jogador, "note.bass");
  world.sendMessage("§cOps! Voce caiu. Voltando para o checkpoint... (quedas: " + estado.quedas + ")");
}

function chegouNaPlataforma(jogador, indice) {
  estado.atual = indice;
  const p = estado.plataformas[indice];
  if (p.tipo === "checkpoint") {
    estado.checkpoint = indice;
    tocar(jogador, "random.orb");
    world.sendMessage("§6Checkpoint salvo! (fase " + indice + ")");
  } else if (p.tipo === "fim") {
    vitoria(jogador);
  } else {
    tocar(jogador, "random.click");
  }
}

function rodada() {
  if (!estado.ativo) return;
  const jogador = acharJogador();
  if (!jogador) { estado.ativo = false; return; }

  estado.ticks += TICKS_POR_RODADA;
  const ultimo = estado.plataformas.length - 1;

  // 1) faz nascer as plataformas que estao na frente do jogador
  const alvo = Math.min(estado.atual + ANTECEDENCIA, ultimo);
  while (estado.construidas < alvo) {
    estado.construidas++;
    construirPlataforma(estado.plataformas[estado.construidas]);
  }

  const loc = jogador.location;

  // 2) o jogador chegou numa plataforma mais adiante?
  for (let i = estado.atual + 1; i <= Math.min(estado.atual + 2, ultimo); i++) {
    if (estaEmCima(estado.plataformas[i], loc)) {
      chegouNaPlataforma(jogador, i);
      break;
    }
  }
  if (!estado.ativo) return;   // acabou de ganhar

  // 3) caiu? (ficou 3 blocos abaixo do checkpoint)
  if (loc.y < estado.plataformas[estado.checkpoint].y - 3) {
    voltarAoCheckpoint(jogador);
  }

  mostrarPlacar(jogador);
}

system.runInterval(() => {
  try {
    rodada();
  } catch (e) {
    estado.ativo = false;
    world.sendMessage("§cOps! O parkour travou: " + e);
  }
}, TICKS_POR_RODADA);

// ==============================================================
//  COMANDOS DO CHAT  (/scriptevent parkour:...)
// ==============================================================

function comandoAjuda() {
  world.sendMessage("§e=== PARKOUR ALEATORIO ===");
  world.sendMessage("§f/scriptevent parkour:iniciar §7- comeca um percurso novo");
  world.sendMessage("§f/scriptevent parkour:iniciar 20 3 777 §7- 20 plataformas, dificuldade 3, semente 777");
  world.sendMessage("§f/scriptevent parkour:sair §7- volta para o chao");
  world.sendMessage("§f/scriptevent parkour:limpar §7- apaga as plataformas");
}

function comandoIniciar(jogador, numeros) {
  if (estado.ativo) {
    world.sendMessage("§eJa tem um parkour rolando! Use parkour:sair primeiro.");
    return;
  }
  apagarTudo();   // limpa o percurso anterior, se houver

  const quantidade = limitar(numeros[0], MIN_PLATAFORMAS, MAX_PLATAFORMAS, 15);
  const dificuldade = limitar(numeros[1], 1, 3, 2);
  const semente = (Number.isFinite(numeros[2]) && numeros[2] !== 0)
    ? Math.floor(numeros[2])
    : Math.floor(Math.random() * 100000) + 1;

  const loc = jogador.location;
  const inicio = {
    x: Math.floor(loc.x) - 1,
    y: Math.floor(loc.y) + ALTURA_INICIAL,
    z: Math.floor(loc.z) - 1,
  };

  estado.dimensao = jogador.dimension;
  estado.jogadorId = jogador.id;
  estado.plataformas = gerarPercurso(inicio, quantidade, dificuldade, semente);
  estado.semente = semente;
  estado.retorno = { x: loc.x, y: loc.y, z: loc.z };
  estado.construidas = -1;
  estado.atual = 0;
  estado.checkpoint = 0;
  estado.quedas = 0;
  estado.ticks = 0;

  // constroi as primeiras plataformas e leva o jogador para o comeco
  for (let i = 0; i <= Math.min(ANTECEDENCIA, quantidade - 1); i++) {
    estado.construidas = i;
    construirPlataforma(estado.plataformas[i]);
  }
  jogador.teleport(centroDe(estado.plataformas[0]));
  try { jogador.clearVelocity(); } catch (e) { /* enfeite */ }

  estado.ativo = true;
  world.sendMessage("§aParkour pronto! " + quantidade + " plataformas, dificuldade " + dificuldade +
    ", semente " + semente + ". Boa sorte!");
}

function comandoSair() {
  const jogador = acharJogador();
  if (jogador && estado.retorno) {
    jogador.teleport(estado.retorno);
    try { jogador.clearVelocity(); } catch (e) { /* enfeite */ }
  }
  estado.ativo = false;
  world.sendMessage("§7Voce saiu do parkour.");
}

function comandoLimpar() {
  if (estado.ativo) { world.sendMessage("§eUse parkour:sair antes de limpar."); return; }
  apagarTudo();
  world.sendMessage("§7Plataformas apagadas.");
}

system.afterEvents.scriptEventReceive.subscribe((evento) => {
  if (!evento.id.startsWith("parkour:")) return;

  const comando = evento.id.split(":")[1];
  const numeros = evento.message.trim().split(/\s+/).map(Number);
  const jogador = evento.sourceEntity;

  try {
    if (comando === "ajuda") {
      comandoAjuda();
    } else if (comando === "iniciar") {
      if (!jogador) { world.sendMessage("§cDigite esse comando no chat, em pessoa."); return; }
      comandoIniciar(jogador, numeros);
    } else if (comando === "sair") {
      comandoSair();
    } else if (comando === "limpar") {
      comandoLimpar();
    } else {
      world.sendMessage("§cNao conheco esse comando. Digite /scriptevent parkour:ajuda");
    }
  } catch (e) {
    world.sendMessage("§cOps! Deu erro: " + e);
  }
});

// system.run espera o mundo estar pronto antes de falar no chat
system.run(() => {
  world.sendMessage("§aParkour Aleatorio carregado! Digite §e/scriptevent parkour:ajuda");
});
