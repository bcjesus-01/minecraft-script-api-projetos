// ==============================================================
//  FAZENDEIRO ROBO v2  --  Minecraft Bedrock (Script API, JavaScript)
// ==============================================================
//  Um robo (um armor stand) que constroi uma fazenda, planta, e
//  colhe SO o trigo que esta maduro de verdade.
//
//  A v1 (Minecraft Education) colhia tudo, maduro ou nao.
//  A v2 aprendeu a olhar a planta antes de colher.
//
//  COMANDOS (digite no chat, com a barra na frente):
//    /scriptevent fazendeiro:ajuda
//    /scriptevent fazendeiro:fazenda 3 6    (3 faixas, 6 casas)
//    /scriptevent fazendeiro:turbo          (faz o trigo crescer rapido)
//    /scriptevent fazendeiro:colher         (uma volta de colheita)
//    /scriptevent fazendeiro:auto           (colhe volta apos volta)
//    /scriptevent fazendeiro:parar          (manda o robo descansar)
//
//  DESENHO DA FAZENDA (vista de cima):
//        agua  ~ ~ ~ ~ ~ ~ ~ ~ ~
//              A C A A C A A C A     A = canteiro, C = corredor
//              A C A A C A A C A
//        agua  ~ ~ ~ ~ ~ ~ ~ ~ ~
// ==============================================================

import { world, system, BlockPermutation } from "@minecraft/server";

// ---------- CONSTANTES (valores que nunca mudam) ----------
const MAX_FAIXAS = 4;          // no maximo 4 faixas
const MAX_TAMANHO = 8;         // no maximo 8 casas (a agua molha ate 4 blocos)
const TICKS_POR_PASSO = 6;     // o robo da 1 passo a cada 6 ticks (0,3 s)
const TICKS_ENTRE_VOLTAS = 200; // no modo auto, descansa 10 s entre voltas
const CRESCIMENTO_MAXIMO = 7;  // trigo maduro = estagio 7 (vai de 0 a 7)
const TAG_ROBO = "fazendeiro_robo";

// ---------- MEMORIA DO ROBO (coisas que mudam) ----------
const estado = {
  pronta: false,        // ja existe uma fazenda?
  emServico: false,     // o robo esta trabalhando?
  turbo: false,         // crescimento magico ligado?
  dimensao: null,
  ox: 0, oy: 0, oz: 0,  // onde o jogador estava: a fazenda nasce aqui
  faixas: 2,
  tamanho: 5,
  robo: null,           // o armor stand
  rota: [],             // lista de passos que o robo vai dar
  indice: 0,            // em qual passo ele esta
  modo: "plantar",      // "plantar" ou "colher"
  repetir: false,       // true no modo auto
  esperaTicks: 0,
  colhidos: 0,
  verdes: 0,
};

// ==============================================================
//  FERRAMENTAS PEQUENAS
// ==============================================================

function dizer(texto) {
  world.sendMessage(texto);
}

// Trava um numero entre um minimo e um maximo (e usa um padrao se vier vazio).
function limitar(valor, minimo, maximo, padrao) {
  if (!Number.isFinite(valor) || valor === 0) valor = padrao;
  return Math.max(minimo, Math.min(maximo, Math.floor(valor)));
}

function bloco(x, y, z) {
  return estado.dimensao.getBlock({ x: x, y: y, z: z });
}

function colocar(x, y, z, tipo) {
  const b = bloco(x, y, z);
  if (b) b.setType(tipo);
}

// Em qual coluna (x) fica o corredor de cada faixa.
// Cada faixa tem 3 colunas: [canteiro][corredor][canteiro].
function xDoCorredor(numeroFaixa) {
  return estado.ox + 2 + numeroFaixa * 3 + 1;
}

// Lista com todos os canteiros da fazenda (onde o trigo cresce).
function todosOsCanteiros() {
  const lista = [];
  for (let k = 0; k < estado.faixas; k++) {
    for (let j = 0; j < estado.tamanho; j++) {
      const z = estado.oz + 1 + j;
      lista.push({ x: xDoCorredor(k) - 1, z: z });
      lista.push({ x: xDoCorredor(k) + 1, z: z });
    }
  }
  return lista;
}

// ==============================================================
//  PASSO 1: PREPARAR O TERRENO
// ==============================================================

function prepararTerreno() {
  const x1 = estado.ox + 2;
  const x2 = x1 + estado.faixas * 3 - 1;
  const zNorte = estado.oz;                     // linha de agua do norte
  const zSul = estado.oz + estado.tamanho + 1;  // linha de agua do sul
  const y = estado.oy;

  for (let x = x1; x <= x2; x++) {
    for (let z = zNorte; z <= zSul; z++) {
      // 1) limpa o ar: tira mato, flores e arvores
      colocar(x, y, z, "minecraft:air");
      colocar(x, y + 1, z, "minecraft:air");
      colocar(x, y + 2, z, "minecraft:air");
      // 2) chao de terra
      colocar(x, y - 1, z, "minecraft:dirt");
    }
    // 3) duas linhas de agua, uma em cada ponta, para molhar o solo
    colocar(x, y - 1, zNorte, "minecraft:water");
    colocar(x, y - 1, zSul, "minecraft:water");
  }
}

// ==============================================================
//  PASSO 2: AS "RECEITAS" DE UM CANTEIRO
// ==============================================================

// Ara a terra e planta uma semente (estagio 0).
function plantar(x, z) {
  const y = estado.oy;
  const chao = bloco(x, y - 1, z);
  try {
    // terra arada e bem molhada, para nao voltar a ser terra comum
    chao.setPermutation(BlockPermutation.resolve("minecraft:farmland", { moisturized_amount: 7 }));
  } catch (e) {
    chao.setType("minecraft:farmland"); // plano B se o nome do estado mudou
  }
  bloco(x, y, z).setPermutation(BlockPermutation.resolve("minecraft:wheat", { growth: 0 }));
}

// Olha a planta ANTES de colher. Devolve: "colhido", "verde" ou "vazio".
function colherSeEstiverMaduro(x, z) {
  const y = estado.oy;
  const b = bloco(x, y, z);

  if (b.typeId !== "minecraft:wheat") {
    plantar(x, z);                // casa vazia: planta uma semente
    return "vazio";
  }

  const estagio = b.permutation.getState("growth");
  if (estagio >= CRESCIMENTO_MAXIMO) {
    // "destroy" faz o trigo e as sementes cairem no chao, como se fosse colhido
    estado.dimensao.runCommand("setblock " + x + " " + y + " " + z + " air destroy");
    plantar(x, z);                // planta de novo: a fazenda nunca para
    return "colhido";
  }
  return "verde";                 // ainda nao esta pronto: deixa crescer
}

// ==============================================================
//  PASSO 3: A ROTA DO ROBO
// ==============================================================

// Monta a lista de passos. As faixas alternam o sentido (norte->sul,
// depois sul->norte...) para o robo nunca andar a toa.
function montarRota() {
  const rota = [];
  for (let k = 0; k < estado.faixas; k++) {
    const indices = [];
    for (let j = 0; j < estado.tamanho; j++) indices.push(j);
    if (k % 2 === 1) indices.reverse();   // faixas impares: volta pelo outro lado

    for (const j of indices) {
      const z = estado.oz + 1 + j;
      const xc = xDoCorredor(k);
      rota.push({
        x: xc,
        z: z,
        lados: [{ x: xc - 1, z: z }, { x: xc + 1, z: z }],
      });
    }
  }
  return rota;
}

function criarRobo() {
  const d = estado.dimensao;
  // remove robos antigos, para nao ficar um monte de robos parados
  for (const velho of d.getEntities({ type: "minecraft:armor_stand", tags: [TAG_ROBO] })) {
    velho.remove();
  }
  const r = d.spawnEntity("minecraft:armor_stand", {
    x: estado.ox + 2.5, y: estado.oy, z: estado.oz + 1.5,
  });
  r.nameTag = "Robo Fazendeiro";
  r.addTag(TAG_ROBO);
  try {
    r.runCommand("replaceitem entity @s slot.armor.head 0 iron_helmet");
  } catch (e) { /* enfeite: se falhar, tudo bem */ }
  estado.robo = r;
}

function moverRobo(passo) {
  const destino = { x: passo.x + 0.5, y: estado.oy, z: passo.z + 0.5 };
  try {
    estado.robo.teleport(destino);
  } catch (e) {
    criarRobo();                  // o robo sumiu? cria outro e continua
    estado.robo.teleport(destino);
  }
}

function executarPasso(passo) {
  moverRobo(passo);
  for (const lado of passo.lados) {
    if (estado.modo === "plantar") {
      plantar(lado.x, lado.z);
    } else {
      const resultado = colherSeEstiverMaduro(lado.x, lado.z);
      if (resultado === "colhido") estado.colhidos++;
      if (resultado === "verde") estado.verdes++;
    }
  }
}

function iniciarRota(modo, repetir) {
  estado.rota = montarRota();
  estado.indice = 0;
  estado.modo = modo;
  estado.repetir = repetir;
  estado.colhidos = 0;
  estado.verdes = 0;
  estado.esperaTicks = 0;
  estado.emServico = true;
}

function terminarVolta() {
  if (estado.modo === "plantar") {
    dizer("§aFazenda plantada! Digite §e/scriptevent fazendeiro:turbo §apara acelerar o trigo.");
    estado.emServico = false;
    return;
  }
  dizer("§6Volta terminada: §acolhi " + estado.colhidos + " §7e deixei " + estado.verdes + " crescendo.");
  if (estado.repetir) {
    estado.indice = 0;
    estado.colhidos = 0;
    estado.verdes = 0;
    estado.esperaTicks = TICKS_ENTRE_VOLTAS;
  } else {
    estado.emServico = false;
  }
}

// ==============================================================
//  O "CORACAO" DO ROBO: um relogio que dispara a cada poucos ticks
// ==============================================================

system.runInterval(() => {
  if (!estado.emServico) return;
  try {
    if (estado.esperaTicks > 0) {
      estado.esperaTicks -= TICKS_POR_PASSO;
      return;
    }
    if (estado.indice >= estado.rota.length) {
      terminarVolta();
      return;
    }
    executarPasso(estado.rota[estado.indice]);
    estado.indice++;
  } catch (e) {
    estado.emServico = false;
    dizer("§cOps! O robo travou: " + e);
  }
}, TICKS_POR_PASSO);

// Crescimento magico: a cada meio segundo, todo trigo cresce 1 estagio.
system.runInterval(() => {
  if (!estado.turbo) return;
  try {
    let aindaCrescendo = 0;
    for (const c of todosOsCanteiros()) {
      const b = bloco(c.x, estado.oy, c.z);
      if (b && b.typeId === "minecraft:wheat") {
        const g = b.permutation.getState("growth");
        if (g < CRESCIMENTO_MAXIMO) {
          b.setPermutation(BlockPermutation.resolve("minecraft:wheat", { growth: g + 1 }));
          aindaCrescendo++;
        }
      }
    }
    if (aindaCrescendo === 0) {
      estado.turbo = false;
      dizer("§aO trigo esta todo maduro! Pode colher.");
    }
  } catch (e) {
    estado.turbo = false;
    dizer("§cOps! O turbo travou: " + e);
  }
}, 10);

// ==============================================================
//  COMANDOS DO CHAT  (/scriptevent fazendeiro:...)
// ==============================================================

function comandoAjuda() {
  dizer("§e=== ROBO FAZENDEIRO v2 ===");
  dizer("§f/scriptevent fazendeiro:fazenda 3 6 §7- 3 faixas de 6 casas");
  dizer("§f/scriptevent fazendeiro:turbo §7- trigo cresce rapido");
  dizer("§f/scriptevent fazendeiro:colher §7- uma volta de colheita");
  dizer("§f/scriptevent fazendeiro:auto §7- colhe volta apos volta");
  dizer("§f/scriptevent fazendeiro:parar §7- robo descansa");
}

function comandoFazenda(jogador, numeros) {
  if (estado.emServico) {
    dizer("§eCalma! O robo ainda esta trabalhando.");
    return;
  }
  estado.faixas = limitar(numeros[0], 1, MAX_FAIXAS, 2);
  estado.tamanho = limitar(numeros[1], 1, MAX_TAMANHO, 5);
  estado.dimensao = jogador.dimension;
  estado.ox = Math.floor(jogador.location.x);
  estado.oy = Math.floor(jogador.location.y);
  estado.oz = Math.floor(jogador.location.z);

  prepararTerreno();
  criarRobo();
  estado.pronta = true;
  estado.turbo = false;
  dizer("§aTerreno pronto! O robo vai plantar " + (estado.faixas * estado.tamanho * 2) + " canteiros.");
  iniciarRota("plantar", false);
}

function comandoColher(repetir) {
  if (!estado.pronta) {
    dizer("§eAinda nao tem fazenda! Digite /scriptevent fazendeiro:fazenda");
    return;
  }
  if (estado.emServico) {
    dizer("§eCalma! O robo ainda esta trabalhando.");
    return;
  }
  dizer(repetir ? "§6Modo automatico ligado! (/scriptevent fazendeiro:parar para parar)"
                : "§6Hora da colheita!");
  iniciarRota("colher", repetir);
}

system.afterEvents.scriptEventReceive.subscribe((evento) => {
  if (!evento.id.startsWith("fazendeiro:")) return;

  const comando = evento.id.split(":")[1];
  const numeros = evento.message.trim().split(/\s+/).map(Number);
  const jogador = evento.sourceEntity;

  try {
    if (comando === "ajuda") {
      comandoAjuda();
    } else if (comando === "fazenda") {
      if (!jogador) { dizer("§cDigite esse comando no chat, em pessoa."); return; }
      comandoFazenda(jogador, numeros);
    } else if (comando === "turbo") {
      if (!estado.pronta) { dizer("§eAinda nao tem fazenda!"); return; }
      estado.turbo = true;
      dizer("§dCrescimento magico ligado!");
    } else if (comando === "colher") {
      comandoColher(false);
    } else if (comando === "auto") {
      comandoColher(true);
    } else if (comando === "parar") {
      estado.emServico = false;
      dizer("§7O robo foi descansar.");
    } else {
      dizer("§cNao conheco esse comando. Digite /scriptevent fazendeiro:ajuda");
    }
  } catch (e) {
    dizer("§cOps! Deu erro: " + e);
  }
});

// system.run espera o mundo estar pronto antes de falar no chat
system.run(() => {
  dizer("§aRobo Fazendeiro v2 carregado! Digite §e/scriptevent fazendeiro:ajuda");
});
