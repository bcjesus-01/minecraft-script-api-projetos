# ==============================================================
#  AGENTE FAZENDEIRO  --  Minecraft Education (MakeCode, Python)
# ==============================================================
#  Um robo (o Agente) que prepara o terreno, planta, espera e
#  colhe uma fazenda de trigo sozinho!
#
#  COMANDOS (aperte T para abrir o chat do Minecraft):
#    ajuda                   mostra a lista de comandos
#    fazenda FAIXAS TAMANHO  prepara o terreno e planta trigo
#                            exemplo: fazenda 3 6
#    colher                  colhe tudo e planta de novo
#    auto CICLOS SEGUNDOS    fazendeiro automatico (espera, colhe, repete)
#                            exemplo: auto 3 60
#
#  COMO A FAZENDA E DESENHADA (vista de cima):
#
#        agua  ~ ~ ~ ~ ~ ~ ~ ~ ~     <- agua no norte
#              A C A A C A A C A     A = canteiro (planta aqui)
#              A C A A C A A C A     C = corredor (o agente anda aqui)
#              A C A A C A A C A
#        agua  ~ ~ ~ ~ ~ ~ ~ ~ ~     <- agua no sul
#
#  Cada FAIXA tem 3 colunas: [canteiro][corredor][canteiro].
#  O agente anda pelo corredor e cuida dos dois lados ao mesmo tempo.
# ==============================================================


# ---------- CONSTANTES (valores que nunca mudam) ----------
PLANTAR = 1               # "modo" para plantar
COLHER = 2                # "modo" para colher
MAX_FAIXAS = 4            # no maximo 4 faixas (12 colunas de largura)
MAX_TAMANHO = 8           # no maximo 8 casas de comprimento (a agua alcanca 4)
SEMENTES_POR_FAIXA = 32   # sementes que o agente leva em cada faixa


# ---------- MEMORIA DO AGENTE (variaveis que mudam) ----------
fazenda_pronta = False    # ja existe uma fazenda construida?
ocupado = False           # o agente esta trabalhando agora?
faixas = 2                # quantas faixas tem a fazenda
tamanho = 5               # quantas casas cada faixa tem de comprimento
origem_x = 0              # onde o jogador estava quando criou a fazenda
origem_y = 0
origem_z = 0


# ==============================================================
#  FERRAMENTAS PEQUENAS (funcoes que ajudam as outras)
# ==============================================================

def limitar(valor, minimo, maximo):
    # Trava um numero entre um minimo e um maximo.
    # Assim ninguem consegue pedir uma fazenda gigante e travar o jogo.
    return Math.max(minimo, Math.min(maximo, Math.floor(valor)))


def x_do_corredor(numero_faixa):
    # Em qual coluna (x) fica o corredor de cada faixa.
    # A fazenda comeca 2 blocos ao lado do jogador, e cada faixa ocupa 3 colunas.
    return origem_x + 2 + numero_faixa * 3 + 1


def total_de_canteiros():
    # 2 lados por casa do corredor
    return faixas * tamanho * 2


def contar_trigo():
    # Soma o que o agente carrega, do espaco 2 ao 27.
    # (O espaco 1 fica so com sementes.)
    soma = 0
    for espaco in range(2, 28):
        soma += agent.get_item_count(espaco)
    return soma


def esperar(segundos):
    # Espera contando, e avisa no chat a cada 10 segundos.
    faltam = segundos
    while faltam > 0:
        if faltam % 10 == 0:
            player.say("Faltam " + str(faltam) + " segundos para a colheita...")
        loops.pause(1000)
        faltam -= 1


def festa():
    # Comemoracao: chovem galinhas em cima da fazenda!
    x_centro = origem_x + 2 + Math.floor(faixas * 3 / 2)
    for i in range(6):
        mobs.spawn(CHICKEN, world(x_centro, origem_y + 6, origem_z + 1))


# ==============================================================
#  PASSO 1: PREPARAR O TERRENO
# ==============================================================

def preparar_terreno():
    x_inicio = origem_x + 2
    x_fim = origem_x + 2 + faixas * 3 - 1
    z_norte = origem_z                   # linha de agua do norte
    z_sul = origem_z + tamanho + 1       # linha de agua do sul

    # 1) Limpa o ar: tira mato, flores e arvores do caminho do agente
    blocks.fill(AIR,
        world(x_inicio, origem_y, z_norte),
        world(x_fim, origem_y + 2, z_sul),
        FillOperation.Replace)

    # 2) Chao de terra (o trigo so cresce em terra arada)
    blocks.fill(DIRT,
        world(x_inicio, origem_y - 1, z_norte),
        world(x_fim, origem_y - 1, z_sul),
        FillOperation.Replace)

    # 3) Duas linhas de agua, uma em cada ponta, para molhar o solo.
    #    A agua molha ate 4 blocos de distancia.
    blocks.fill(WATER,
        world(x_inicio, origem_y - 1, z_norte),
        world(x_fim, origem_y - 1, z_norte),
        FillOperation.Replace)
    blocks.fill(WATER,
        world(x_inicio, origem_y - 1, z_sul),
        world(x_fim, origem_y - 1, z_sul),
        FillOperation.Replace)


# ==============================================================
#  PASSO 2: A "RECEITA" DE UM CANTEIRO
# ==============================================================

def cuidar_canteiro(modo, lado):
    # "lado" e LEFT (esquerda) ou RIGHT (direita) do agente.
    if modo == PLANTAR:
        agent.till(lado)         # ara a terra com a enxada
        agent.place(lado)        # planta a semente
    else:
        agent.destroy(lado)      # colhe o trigo
        agent.collect_all()      # pega o que caiu no chao
        agent.place(lado)        # planta de novo (a fazenda nunca para!)


# ==============================================================
#  PASSO 3: ANDAR PELO CORREDOR
# ==============================================================

def percorrer_faixa(numero_faixa, modo):
    # Atalho: o agente se teletransporta para o comeco do corredor.
    # Assim ele nunca pisa nas plantas.
    agent.teleport(world(x_do_corredor(numero_faixa), origem_y, origem_z + 1), SOUTH)
    agent.set_item(SEEDS, SEMENTES_POR_FAIXA, 1)
    agent.set_slot(1)

    # Laco: repete uma vez para cada casa do corredor
    for passo in range(tamanho):
        cuidar_canteiro(modo, LEFT)      # canteiro da esquerda
        cuidar_canteiro(modo, RIGHT)     # canteiro da direita
        if passo < tamanho - 1:          # na ultima casa nao precisa andar
            agent.move(FORWARD, 1)


def percorrer_fazenda(modo):
    # Laco dentro de laco: para cada faixa, percorre o corredor dela.
    for numero_faixa in range(faixas):
        percorrer_faixa(numero_faixa, modo)
    agent.teleport_to_player()           # o agente volta para perto de voce


def plantar_tudo():
    player.say("Plantando " + str(total_de_canteiros()) + " canteiros... la vamos nos!")
    percorrer_fazenda(PLANTAR)
    player.say("Fazenda plantada! Agora e esperar o trigo crescer.")


def colher_tudo():
    player.say("Hora da colheita!")
    percorrer_fazenda(COLHER)
    player.say("Trigo na mochila do agente: " + str(contar_trigo()))


# ==============================================================
#  COMANDOS DO CHAT
# ==============================================================

def on_ajuda():
    player.say("=== AGENTE FAZENDEIRO ===")
    player.say("fazenda 3 6  -> 3 faixas de 6 casas")
    player.say("colher       -> colhe e planta de novo")
    player.say("auto 3 60    -> 3 colheitas, 60 s de espera")
player.on_chat("ajuda", on_ajuda)


def on_fazenda(num1, num2):
    global ocupado
    global fazenda_pronta
    global faixas
    global tamanho
    global origem_x
    global origem_y
    global origem_z

    if ocupado:
        player.say("Calma! O agente ainda esta trabalhando.")
        return
    ocupado = True

    # Se o jogador nao digitou numeros, usamos valores padrao
    if num1 == 0:
        num1 = 2
    if num2 == 0:
        num2 = 5
    faixas = limitar(num1, 1, MAX_FAIXAS)
    tamanho = limitar(num2, 1, MAX_TAMANHO)

    # Guarda onde o jogador esta: e aqui que a fazenda nasce
    origem_x = Math.floor(player.position().get_value(Axis.X))
    origem_y = Math.floor(player.position().get_value(Axis.Y))
    origem_z = Math.floor(player.position().get_value(Axis.Z))

    preparar_terreno()
    fazenda_pronta = True
    plantar_tudo()
    ocupado = False
player.on_chat("fazenda", on_fazenda)


def on_colher():
    global ocupado
    if not fazenda_pronta:
        player.say("Ainda nao tem fazenda! Digite: fazenda")
        return
    if ocupado:
        player.say("Calma! O agente ainda esta trabalhando.")
        return
    ocupado = True
    colher_tudo()
    festa()
    ocupado = False
player.on_chat("colher", on_colher)


def on_auto(num1, num2):
    global ocupado
    if not fazenda_pronta:
        player.say("Ainda nao tem fazenda! Digite: fazenda")
        return
    if ocupado:
        player.say("Calma! O agente ainda esta trabalhando.")
        return
    ocupado = True

    ciclos = num1
    if ciclos == 0:
        ciclos = 3
    ciclos = limitar(ciclos, 1, 20)

    segundos = num2
    if segundos == 0:
        segundos = 60
    segundos = limitar(segundos, 5, 600)

    for ciclo in range(ciclos):
        player.say("Ciclo " + str(ciclo + 1) + " de " + str(ciclos))
        esperar(segundos)
        colher_tudo()

    player.say("Fim do expediente! O agente merece uma festa.")
    festa()
    ocupado = False
player.on_chat("auto", on_auto)


# Mensagem de boas-vindas quando o programa comeca
player.say("Agente Fazendeiro pronto! Digite: ajuda")
