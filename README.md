# Minecraft + Programação: Fazendeiro Robô e Parkour Aleatório

Dois projetos em **JavaScript** para o **Minecraft Bedrock**, feitos com a **Script API** (`@minecraft/server`). A ideia é a mesma dos cursos de programação com Minecraft: ensinar lógica de programação com algo que a criança já gosta de jogar.

| Projeto | Tipo | O que ensina |
|---|---|---|
| [Fazendeiro Robô v2](fazendeiro-robo/) | Ferramenta de automação | laços, funções, condições, estados |
| [Parkour Aleatório](parkour-aleatorio/) | Jogo | aleatoriedade, sementes, dificuldade progressiva |

Em `fazendeiro-robo/educacao-v1/` fica a primeira versão da fazenda, feita em **Python (MakeCode) para o Minecraft Education**. Ela serve de comparação: a v1 colhia tudo, a v2 aprendeu a olhar a planta antes.

---

## O que você precisa

- Minecraft **Bedrock Edition** (Windows, celular ou console).
- Cheats ligados no mundo (para usar comandos).
- Os pacotes **ativados no mundo** (passo que costuma ser esquecido).
- Não precisa ligar "Beta APIs": os projetos usam só a API estável (`@minecraft/server` **2.11.0**).

## Como instalar

1. Gere o pacote de cada projeto (veja [Gerando o `.mcpack`](#gerando-o-mcpack)) ou baixe os arquivos `.mcpack` da aba **Releases**.
2. Abra o arquivo `.mcpack` com duplo clique. O Minecraft importa o pacote.
3. Crie um mundo **Plano (Flat)** com cheats ligados.
4. Em **Editar mundo → Pacotes de comportamento**, ative o pacote.
5. Entre no mundo. Uma mensagem verde de boas-vindas aparece no chat.

> Dica: ligue **Configurações → Criador → Content Log GUI**. Se algo der errado, o erro aparece na tela.

---

## 1. Fazendeiro Robô v2

Um robô (um *armor stand*) que **constrói uma fazenda, planta, e colhe só o trigo que está maduro**.

### Comandos

| Comando | O que faz |
|---|---|
| `/scriptevent fazendeiro:ajuda` | lista os comandos |
| `/scriptevent fazendeiro:fazenda 3 6` | prepara o terreno e planta (3 faixas, 6 casas cada) |
| `/scriptevent fazendeiro:turbo` | faz o trigo crescer rápido (demonstração) |
| `/scriptevent fazendeiro:colher` | uma volta de colheita |
| `/scriptevent fazendeiro:auto` | colhe volta após volta |
| `/scriptevent fazendeiro:parar` | o robô descansa |

Sem números, `fazenda` usa 2 faixas de 5 casas. Os limites são 4 faixas e 8 casas.

### Como a fazenda é desenhada

```
agua  ~ ~ ~ ~ ~ ~ ~ ~ ~
      A C A A C A A C A     A = canteiro (onde o trigo cresce)
      A C A A C A A C A     C = corredor (onde o robô anda)
agua  ~ ~ ~ ~ ~ ~ ~ ~ ~
```

Cada **faixa** tem 3 colunas: `[canteiro][corredor][canteiro]`. O robô anda pelo corredor e cuida dos dois lados ao mesmo tempo. A água nas duas pontas molha o solo (alcance de 4 blocos, por isso o comprimento máximo é 8).

### Decisões de projeto

- **Colhe só o que está maduro.** A Script API lê o estágio de crescimento do trigo (`growth`, de 0 a 7). O robô só colhe no estágio 7 e deixa o resto crescer.
- **O robô anda de verdade**, de casa em casa, para dar para ver o trabalho. Um relógio (`system.runInterval`) dispara um passo a cada 0,3 s.
- **Faixas em zigue-zague.** As faixas alternam o sentido (norte→sul, depois sul→norte) para o robô não andar à toa.
- **Travas de segurança.** Os números digitados são limitados a um mínimo e um máximo, e o código recria o robô se ele sumir.

---

## 2. Parkour Aleatório

Um parkour de plataformas no céu, **inventado na hora**.

### Comandos

| Comando | O que faz |
|---|---|
| `/scriptevent parkour:ajuda` | lista os comandos |
| `/scriptevent parkour:iniciar` | começa um percurso (15 plataformas, dificuldade 2) |
| `/scriptevent parkour:iniciar 20 3 777` | 20 plataformas, dificuldade 3, semente 777 |
| `/scriptevent parkour:sair` | volta para o chão |
| `/scriptevent parkour:limpar` | apaga as plataformas |

Limites: de 6 a 40 plataformas e dificuldade de 1 a 3.

### Como funciona

- **Semente.** O computador não sorteia de verdade: usa uma fórmula. Com o mesmo número inicial (a semente), sai sempre a mesma sequência. Assim, a semente 777 gera sempre o mesmo parkour, e um amigo joga o seu percurso.
- **Dificuldade progressiva.** No nível 3, as plataformas começam com 3×3 e encolhem até 1×1, e os pulos ficam mais longos.
- **Pulos sempre possíveis.** O código nunca deixa mais de 3 blocos de ar entre plataformas, o pulo para cima é sempre mais curto e pulos longos são quase retos.
- **Plataformas sob demanda.** Só as 4 à frente do jogador existem. Isso evita construir em áreas não carregadas e dá o efeito de o caminho aparecer enquanto você anda.
- **Checkpoints e placar.** Uma plataforma dourada a cada 5. Se você cair, volta para a última. A barra de ação mostra fase, quedas e tempo, e no final há uma medalha: **ouro** (nenhuma queda), **prata** (até 3) ou **bronze**.

---

## Conceitos de programação em cada projeto

| Conceito | Onde aparece |
|---|---|
| Variáveis e constantes | `MAX_FAIXAS`, `estado`, `MAX_PLATAFORMAS` |
| Laços (`for`, laço dentro de laço) | percorrer faixas e casas; construir cada plataforma |
| Condições (`if`) | colher só se `growth === 7`; voltar ao checkpoint se cair |
| Funções | cada receita é uma função pequena (`plantar`, `colherSeEstiverMaduro`) |
| Eventos | comandos do chat (`scriptEventReceive`) e o relógio do jogo |
| Listas | a rota do robô; a lista de plataformas |
| Aleatoriedade e semente | geração do percurso do parkour |
| Estado | o que o robô e o jogo "lembram" entre um passo e outro |

---

## Estrutura do repositório

```
.
├── README.md
├── fazendeiro-robo/
│   ├── manifest.json
│   ├── scripts/main.js
│   └── educacao-v1/
│       └── agente_fazendeiro.py     # versão 1 (Minecraft Education, MakeCode Python)
└── parkour-aleatorio/
    ├── manifest.json
    └── scripts/main.js
```

## Gerando o `.mcpack`

Um `.mcpack` é uma pasta compactada em `.zip` com o `manifest.json` **na raiz**. Dentro de cada projeto (`fazendeiro-robo/` ou `parkour-aleatorio/`):

```bash
zip -r ../FazendeiroRobo_v2.mcpack manifest.json scripts
```

No Windows, selecione `manifest.json` e a pasta `scripts`, compacte em `.zip` e troque a extensão para `.mcpack`.

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| Os comandos não fazem nada | Confira se o pacote está **ativado no mundo** e se aparece a mensagem verde de boas-vindas. |
| Erro sobre a versão do módulo | Troque o número em `dependencies` do `manifest.json` pela versão que a mensagem de erro indicar. |
| O mundo mostra a versão antiga | Desative o pacote no mundo, apague-o em "Meus pacotes" e importe de novo (aumente `version` no `manifest.json`). |
| Quer ver os erros | Ligue **Configurações → Criador → Content Log GUI**. |

## Como a lógica foi validada

A lógica de cada projeto foi testada com um simulador da API em Node.js, sem abrir o jogo. O simulador confere, entre outras coisas: se todos os canteiros são plantados, se o robô só colhe trigo maduro, se todos os pulos do parkour são possíveis (em milhares de percursos) e se a mesma semente gera o mesmo percurso.

## Autor

**Bruno Cardoso de Jesus**, graduando de Ciência da Computação na UESC. [GitHub](https://github.com/bcjesus-01)

Projeto feito para um processo seletivo de Tutor de Programação para crianças, com foco em explicar lógica de forma simples, passo a passo e divertida.
