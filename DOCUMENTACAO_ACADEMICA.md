# DrawBattle: documentação acadêmica da aplicação multiplayer de desenho e adivinhação

**Natureza do documento:** relatório técnico e manual de execução  
**Versão da aplicação:** 1.0.0  
**Data de revisão:** 13 de outubro de 2026  
**Idioma da aplicação:** português brasileiro

## Resumo

Este documento apresenta a organização, o funcionamento e os procedimentos de execução do DrawBattle, uma aplicação web multiplayer de desenho e adivinhação. Em cada turno, um participante representa uma palavra por meio de desenhos, enquanto os demais enviam palpites. A solução utiliza React e TypeScript na interface, Canvas para o desenho, Node.js e Express no servidor, Socket.IO para comunicação em tempo real e Prisma com SQLite para persistência de resultados. O servidor concentra a validação das ações, o controle de tempo, a distribuição privada das palavras e o cálculo da pontuação. São descritos a arquitetura, o ciclo de uma partida, o modelo de dados, os mecanismos de reconexão, os testes e as instruções de instalação. O documento também orienta o acesso por outros computadores da rede local e explicita os limites da implementação atual.

**Palavras-chave:** aplicação web; jogo multiplayer; desenho; comunicação em tempo real; Socket.IO; persistência.

## Sumário

1. [Introdução](#1-introdução)
2. [Objetivos e escopo](#2-objetivos-e-escopo)
3. [Fundamentação técnica](#3-fundamentação-técnica)
4. [Arquitetura e organização do projeto](#4-arquitetura-e-organização-do-projeto)
5. [Funcionamento da aplicação](#5-funcionamento-da-aplicação)
6. [Modelagem e persistência dos dados](#6-modelagem-e-persistência-dos-dados)
7. [Comunicação entre cliente e servidor](#7-comunicação-entre-cliente-e-servidor)
8. [Validação, segurança e limitações](#8-validação-segurança-e-limitações)
9. [Instalação e execução](#9-instalação-e-execução)
10. [Manual de utilização](#10-manual-de-utilização)
11. [Verificação e solução de problemas](#11-verificação-e-solução-de-problemas)
12. [Considerações finais](#12-considerações-finais)
13. [Referências](#13-referências)

## 1. Introdução

Jogos de desenho e adivinhação exigem que participantes em computadores distintos acompanhem a mesma partida. Desenhos, mensagens, tempo restante e pontuação precisam ser distribuídos durante a interação. Além da interface, isso demanda regras comuns, identificação das sessões e tratamento de desconexões.

O DrawBattle atende a esse cenário por meio de salas independentes e comunicação orientada a eventos. Um computador executa o servidor, e os participantes acessam a interface pelo navegador. O uso na rede local permite jogar com amigos conectados ao mesmo Wi-Fi ou à mesma rede cabeada.

A elaboração deste relatório segue uma abordagem descritiva, baseada na leitura do código-fonte, dos scripts e dos registros de verificação do projeto. As características apresentadas correspondem à implementação existente. Os resultados de testes citados são os registrados em [Verificação da entrega](docs/verification.md); não representam um estudo de desempenho ou uma avaliação com usuários.

## 2. Objetivos e escopo

### 2.1 Objetivo geral

Disponibilizar um jogo web de desenho e adivinhação com múltiplos participantes, regras controladas pelo servidor e atualização das interfaces durante a partida.

### 2.2 Objetivos específicos

- Permitir a criação e a entrada em salas por código ou convite.
- Organizar os participantes em turnos de desenho.
- Compartilhar traços, mensagens e pontuação em tempo real.
- Restringir a palavra secreta ao desenhista até o encerramento do turno.
- Recuperar uma sessão após uma desconexão breve.
- Registrar partidas concluídas e estatísticas no banco de dados.
- Oferecer interface simples, temas claro e escuro e adaptação a telas pequenas.
- Permitir a execução local e o acesso por outros dispositivos da mesma rede.

### 2.3 Escopo implementado

A aplicação funciona com uma instância de Node.js. Não há cadastro com senha, autenticação de contas, hospedagem pública configurada ou coordenação entre múltiplos servidores. O participante é identificado por uma sessão de jogo e por um apelido.

## 3. Fundamentação técnica

### 3.1 Modelo cliente-servidor

O cliente apresenta os controles e transmite intenções, como iniciar uma partida, desenhar ou enviar um palpite. O servidor verifica a ação e distribui o estado resultante. Essa divisão evita que cada navegador estabeleça suas próprias regras de tempo e pontuação.

### 3.2 Comunicação em tempo real

Socket.IO fornece comunicação bidirecional por eventos e recursos de reconexão. Embora possa utilizar WebSocket como transporte, acrescenta um protocolo próprio; uma conexão WebSocket pura não substitui um cliente Socket.IO. Essa distinção é descrita na [introdução oficial do Socket.IO](https://socket.io/docs/v4/).

Neste projeto, o cliente utiliza Socket.IO com transporte WebSocket. O servidor aceita WebSocket e polling, mas o cliente atual solicita apenas WebSocket. Portanto, o suporte a polling no servidor não constitui um mecanismo de fallback ativo na interface atual.

### 3.3 Tecnologias empregadas

As versões abaixo são as declaradas em [package.json](package.json).

| Tecnologia | Versão | Responsabilidade |
|---|---|---|
| React | 19.1.1 | Composição da interface |
| TypeScript | 5.9.3 | Tipagem do cliente, servidor e contratos |
| Vite | 7.3.7 | Servidor de desenvolvimento e build da interface |
| Tailwind CSS | 4.3.3 | Estilos e adaptação do layout |
| Zustand | 5.0.8 | Estado da aplicação no navegador |
| Express | 4.22.3 | Rotas HTTP e entrega da interface em produção |
| Socket.IO | 4.8.1 | Eventos de jogo entre servidor e navegadores |
| Zod | 3.25.76 | Validação das mensagens recebidas |
| Prisma | 6.19.3 | Acesso ao banco e migrations |
| SQLite | Conforme biblioteca utilizada | Banco persistido em arquivo local |
| Vitest | 4.1.11 | Testes unitários e de integração |
| Playwright | 1.56.0 | Testes no navegador |

A área de desenho usa a API Canvas, que permite desenhar por programação no navegador, conforme a [documentação da MDN](https://developer.mozilla.org/pt-BR/docs/Web/API/Canvas_API). O Vite organiza o desenvolvimento e a compilação da interface, funções descritas em seu [guia oficial](https://vite.dev/guide/). O SQLite é um banco incorporado à aplicação e dispensa um serviço de banco separado, conforme a [descrição oficial](https://www.sqlite.org/about.html).

## 4. Arquitetura e organização do projeto

### 4.1 Visão geral

~~~mermaid
flowchart LR
    A["Navegadores dos jogadores<br/>React, Zustand e Canvas"]
    B["Servidor Node.js<br/>Express e Socket.IO"]
    C["GameManager<br/>salas, palavras, turnos e pontos"]
    D["Estado em memória<br/>sessões, traços e temporizadores"]
    E["Repositório Prisma"]
    F[("SQLite<br/>resultados e estatísticas")]

    A <-->|HTTP e eventos Socket.IO| B
    B --> C
    C <--> D
    C --> E
    B -->|consultas HTTP| E
    E <--> F
~~~

**Figura 1 — Arquitetura lógica da aplicação.**  
**Fonte:** elaboração a partir de [server/app.ts](server/app.ts), [GameManager](server/game/manager.ts) e [repositório de persistência](server/persistence/repository.ts).

O `GameManager` mantém a autoridade sobre a partida. A interface recebe um retrato do estado da sala, denominado `RoomSnapshot`, adaptado ao jogador destinatário. Assim, os dados públicos podem ser compartilhados sem incluir a palavra secreta para quem deve adivinhá-la.

Em desenvolvimento, Vite e backend executam em portas distintas. Em produção, Express entrega o build da interface e atende HTTP e Socket.IO na mesma porta.

### 4.2 Estrutura de diretórios

~~~text
drawbattle/
├── client/                 Interface React, rotas, Canvas e estilos
│   └── src/
│       ├── components/     Componentes visuais e área de desenho
│       ├── lib/            Utilitários, incluindo cópia para clipboard
│       └── state/          Estado e conexão Socket.IO
├── server/
│   ├── app.ts              Configuração HTTP e Socket.IO
│   ├── index.ts            Inicialização do servidor
│   ├── validation.ts       Regras Zod dos eventos
│   ├── game/               Salas, palavras, tempo e pontuação
│   └── persistence/        Repositório de resultados
├── shared/types.ts         Contratos compartilhados
├── prisma/                 Modelos, migrations e seed
├── scripts/                Preparação, execução e firewall
├── tests/                  Testes unitários e de integração
│   └── e2e/                Testes de navegador
├── docs/                   Documentação complementar
├── .env.example            Modelo de configuração
├── package.json            Dependências e comandos
└── DOCUMENTACAO_ACADEMICA.md
~~~

## 5. Funcionamento da aplicação

### 5.1 Entrada e criação de salas

Na página inicial, o usuário informa um apelido e seleciona um avatar. Ele pode criar uma sala ou entrar em uma existente. A criação gera um identificador interno e um código público de seis caracteres. O criador torna-se o administrador da sala, também chamado de `host`.

O código identifica a sala e permite o ingresso dos demais jogadores. O convite reúne o endereço da aplicação e o código no formato `/?room=CODIGO`. Para outro computador, esse endereço precisa conter o IP do computador anfitrião.

### 5.2 Configuração da partida

O administrador define a capacidade da sala, a duração dos turnos e o número de rodadas. As regras de validação do servidor são:

| Parâmetro | Padrão | Limites aceitos pelo servidor |
|---|---|---|
| Capacidade da sala | 8 jogadores | 2 a 12 |
| Duração de desenho por turno | 80 segundos | 15 a 180 segundos |
| Quantidade de rodadas | 3 | 1 a 10 |

A interface oferece um conjunto de opções dentro desses limites; não apresenta necessariamente todos os valores que o servidor aceita. São necessários ao menos dois jogadores conectados para iniciar.

Uma **rodada** corresponde a um ciclo dos desenhistas definidos no início da partida. Um **turno** corresponde à vez de um jogador desenhar. Por exemplo, três jogadores e duas rodadas resultam em seis turnos programados, desde que todos permaneçam disponíveis.

### 5.3 Ciclo de estados

~~~mermaid
stateDiagram-v2
    [*] --> lobby
    lobby --> choosing: administrador inicia
    choosing --> drawing: palavra escolhida ou prazo de 15 s
    choosing --> round_end: saída ou desconexão do desenhista
    drawing --> round_end: prazo, acertos ou interrupção
    round_end --> choosing: próximo turno após 4 s
    round_end --> finished: sequência encerrada
    finished --> choosing: administrador inicia nova partida
~~~

**Figura 2 — Ciclo principal de uma partida.**  
**Fonte:** [server/game/manager.ts](server/game/manager.ts).

As etapas têm os seguintes significados:

1. **Espera (`lobby`):** entrada de jogadores e configuração.
2. **Escolha (`choosing`):** o desenhista recebe três opções privadas e dispõe de 15 segundos. Sem escolha, o servidor seleciona a primeira opção.
3. **Desenho (`drawing`):** o desenhista representa a palavra e os demais enviam palpites.
4. **Encerramento do turno (`round_end`):** a palavra é revelada e o resultado do turno é informado. O intervalo normal até o próximo turno é de quatro segundos.
5. **Resultado (`finished`):** classificação final e possibilidade de uma nova partida.

O turno pode terminar pelo tempo, quando todos os jogadores elegíveis acertam ou por uma interrupção prevista nas regras, como a saída do desenhista. A perda de participantes também pode encerrar a partida antecipadamente.

### 5.4 Seleção e privacidade das palavras

O catálogo contém 240 palavras distribuídas em 16 categorias, com dificuldades fácil, média e difícil. O sorteio utiliza o catálogo TypeScript de [server/game/words.ts](server/game/words.ts).

Durante a escolha, somente o desenhista recebe as opções. Durante o desenho, somente ele recebe a palavra secreta. Os demais recebem informações como categoria, dificuldade, tamanho e representação por lacunas. A palavra é revelada no encerramento do turno.

### 5.5 Desenho compartilhado

Somente o desenhista pode enviar traços ou usar limpar, desfazer e refazer. Há lápis, borracha, seleção de cor e controle de espessura.

Os pontos dos traços utilizam coordenadas normalizadas entre zero e um. Cada navegador converte essas coordenadas para sua área de desenho, permitindo representar o mesmo conteúdo em tamanhos de tela distintos. O servidor valida e retransmite os traços, além de conservar um histórico limitado para desfazer e refazer. Quem entra durante a partida recebe o desenho atual no estado da sala.

### 5.6 Chat, palpites e pontuação

Mensagens e palpites aceitam até 200 caracteres. Durante o desenho, o chat do desenhista é bloqueado. Quem já acertou também fica impedido de conversar no restante do turno para reduzir a divulgação da resposta.

A comparação de palpites ignora diferenças de maiúsculas, acentos, espaços externos e espaços repetidos. Hífens e pontuação continuam relevantes.

O cálculo implementado em [server/game/scoring.ts](server/game/scoring.ts) é:

~~~text
r = limitar(1 − tempoDecorrido / duraçãoDoTurno, 0, 1)

pontos = arredondar(
    (100 + 300 × r + máximo(0, 60 − 15 × ordemDoAcerto)) × fator
)
~~~

O fator vale 1 para palavras fáceis, 1,25 para médias e 1,5 para difíceis. A ordem do acerto começa em zero. Assim, o primeiro acerto de uma palavra fácil na metade do tempo vale 310 pontos. A cada acerto, o desenhista recebe `arredondar(50 × fator)`: 50, 63 ou 75 pontos.

A classificação da partida ordena por pontuação, depois por quantidade de acertos e, em empate nesses critérios, pelo nome do jogador.

### 5.7 Tempo, entrada tardia e reconexão

O servidor estabelece os prazos e encerra os turnos. O navegador exibe o tempo restante com base nos horários recebidos, sem definir a duração efetiva da partida.

O token de sessão fica em `sessionStorage`, por aba. Perfil e tema ficam em `localStorage`. Uma queda breve permite recuperar o mesmo participante dentro da tolerância de 20 segundos, desde que o servidor continue ativo e a sessão seja válida.

A desconexão do desenhista encerra seu turno imediatamente. A reconexão não reabre esse turno. Se o administrador desconectar, a administração passa a outro participante conectado, sem retorno automático ao anterior.

Quem entra após o início pode adivinhar e pontuar. Como a sequência de desenhistas é definida no início, esse jogador passa a desenhar na próxima partida. Reiniciar o processo do servidor elimina as sessões e as partidas ativas.

## 6. Modelagem e persistência dos dados

### 6.1 Entidades

O esquema está definido em [prisma/schema.prisma](prisma/schema.prisma).

| Entidade | Dados principais | Finalidade |
|---|---|---|
| `User` | ID, nome, avatar, pontos, acertos, partidas e vitórias | Estatísticas por identidade de jogador |
| `Match` | Sala, horários, duração, turnos e configurações | Registro de partida concluída |
| `MatchResult` | Jogador, partida, pontuação, acertos e posição | Resultado individual por partida |
| `Word` | ID, texto, categoria e dificuldade | Catálogo cadastrado pelo seed |

~~~mermaid
erDiagram
    User ||--o{ MatchResult : possui
    Match ||--o{ MatchResult : inclui
    User {
        string id PK
        string name
        int totalScore
        int correctGuesses
        int matchesPlayed
        int wins
    }
    Match {
        string id PK
        string roomCode
        datetime startedAt
        datetime finishedAt
        int completedTurns
    }
    MatchResult {
        string id PK
        string matchId FK
        string playerId FK
        int score
        int correctGuesses
        int rank
    }
    Word {
        string id PK
        string text UK
        string category
        string difficulty
    }
~~~

**Figura 3 — Modelo de persistência simplificado.**  
**Fonte:** [prisma/schema.prisma](prisma/schema.prisma).

### 6.2 Momento da gravação

Ao concluir uma partida, o repositório grava a partida, os resultados individuais e as estatísticas em uma transação. O identificador da partida evita registrar novamente o mesmo resultado.

A sala passa ao estado `finished` e pode apresentar a classificação antes de a gravação terminar. O evento `game:finish` é enviado após o sucesso da persistência. Uma falha de gravação é informada como erro e registrada pelo servidor.

O ranking persistente retorna até 20 registros, ordenados por pontuação acumulada e, depois, por vitórias. Como não há contas, criar uma nova identidade de jogador gera outro ID; o apelido sozinho não reúne automaticamente todas as partidas de uma pessoa.

### 6.3 Separação entre memória e banco

Salas ativas, tokens, desenhos e temporizadores permanecem em memória. Partidas concluídas e estatísticas permanecem no SQLite.

O seed cadastra o catálogo de palavras no banco, mas o sorteio atual lê a lista TypeScript. Alterar apenas a tabela `Word` não modifica as palavras sorteadas. Essa integração pode ser ampliada em uma evolução do sistema.

Com a configuração padrão, o banco fica em `prisma/dev.db`. Para preservar os resultados, faça backup do arquivo com o servidor encerrado, antes de substituir ou mover o banco. O pacote de código-fonte não inclui o banco nem o arquivo `.env`.

## 7. Comunicação entre cliente e servidor

### 7.1 Eventos e confirmação

As mensagens seguem um envelope com `type`, `requestId`, `timestamp` e `payload`. Exemplo didático:

~~~json
{
  "type": "chat:message",
  "requestId": "exemplo-001",
  "timestamp": 1791900000000,
  "payload": {
    "text": "Bom jogo!"
  }
}
~~~

A mensagem é enviada pelo evento Socket.IO correspondente. O servidor valida o conteúdo e responde com uma confirmação, ou `ack`, indicando sucesso ou erro. O horário enviado pelo cliente não controla o prazo do jogo.

| Grupo | Exemplos de eventos | Utilização |
|---|---|---|
| Sala | `room:create`, `room:join`, `room:leave`, `room:settings` | Entrada, saída e configuração |
| Administração | `player:kick`, `game:start` | Remoção e início de partida |
| Palavra | `game:word_select`, `game:word_options` | Escolha privada |
| Desenho | `draw:stroke`, `draw:clear`, `draw:undo`, `draw:redo` | Sincronização do Canvas |
| Palpites e chat | `guess:submit`, `chat:message`, `guess:correct` | Mensagens e acertos |
| Estado e resultado | `room:state`, `score:update`, `game:finish` | Estado da sala e classificação |
| Sessão e falhas | `session:restored`, `error` | Reconexão e comunicação de erros |

Os contratos completos e a direção de cada evento estão em [docs/websocket.md](docs/websocket.md).

### 7.2 Endpoints HTTP

| Rota | Função |
|---|---|
| `GET /api/health` ou `GET /health` | Indicar a saúde do processo e estatísticas |
| `GET /api/stats` | Informar jogadores conectados em salas e salas ativas |
| `GET /api/leaderboard` | Consultar até 20 registros do ranking persistente |

O endpoint de saúde permite verificar se o processo responde; ele não substitui um teste completo da interface, do banco e de uma partida.

## 8. Validação, segurança e limitações

O servidor valida o formato e os limites dos eventos com Zod. Também verifica a participação na sala e as permissões de administrador ou desenhista. Pontos, acertos e tempo são determinados no servidor.

A implementação aplica limitação de frequência, sanitização de texto, restrições de tamanho dos traços, configuração de origem e cabeçalhos HTTP por Helmet. Esses mecanismos reduzem ações inválidas e abuso, sem constituir uma garantia de segurança para qualquer cenário de implantação.

As principais limitações são:

- Execução em uma única instância Node.js, com estado ativo em memória.
- Ausência de recuperação de partidas após reinício ou falha do processo.
- Ausência de autenticação de contas e de identidade permanente de pessoa.
- Acesso LAN dependente da rede, do firewall e das permissões do roteador.
- HTTP local sem criptografia; publicação na internet exigiria configuração própria de HTTPS e infraestrutura.
- Dockerfile fornecido, com execução em Docker não verificada neste ambiente.
- Redis e distribuição entre múltiplas instâncias previstos como evolução, sem implementação atual.

Detalhes adicionais estão em [docs/architecture.md](docs/architecture.md) e [docs/deployment.md](docs/deployment.md).

## 9. Instalação e execução

### 9.1 Requisitos

No computador que hospedará o jogo, são necessários:

- Node.js 22.12 ou superior e npm.
- Os arquivos do projeto e acesso à internet para instalar dependências.
- Um navegador atualizado.
- Acesso de entrada à porta 3001 na rede local, quando houver outros computadores.

Os demais participantes precisam apenas de navegador e conexão com a mesma rede. Não precisam instalar Node.js ou copiar o projeto.

Confira as versões no terminal:

~~~powershell
node --version
npm --version
~~~

### 9.2 Preparação inicial

Abra o terminal na pasta `drawbattle`, onde está `package.json`. Se estiver na pasta imediatamente anterior, execute:

~~~powershell
cd .\drawbattle
npm install
npm run db:setup
~~~

Se o terminal já estiver na pasta do projeto, omita o comando `cd`.

O comando `db:setup`:

1. Copia `.env.example` para `.env`, caso este arquivo ainda não exista.
2. Gera o Prisma Client.
3. Aplica as migrations existentes.
4. Cadastra as palavras pelo seed.

Execute essa preparação antes do primeiro uso. Nas execuções seguintes, mantenha o banco existente para conservar os resultados. Para uma instalação reproduzível a partir do `package-lock.json`, também existe a opção `npm ci` no lugar de `npm install`.

### 9.3 Variáveis de ambiente

O arquivo de referência é [.env.example](.env.example):

~~~dotenv
DATABASE_URL="file:./dev.db"
PORT=3001
HOST=0.0.0.0
CLIENT_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
# VITE_API_URL=http://localhost:3001
~~~

| Variável | Significado |
|---|---|
| `DATABASE_URL` | Caminho do SQLite; o caminho relativo padrão é resolvido a partir de `prisma/` |
| `PORT` | Porta HTTP e Socket.IO do backend |
| `HOST` | Interface de escuta; `0.0.0.0` permite receber conexões pelas interfaces de rede |
| `CLIENT_ORIGIN` | Origens adicionais autorizadas, separadas por vírgulas |
| `VITE_API_URL` | Endereço explícito do backend, quando necessário |

No fluxo padrão, mantenha `VITE_API_URL` comentada: o cliente utiliza a mesma origem ou o proxy do Vite. Defini-la como `localhost` faz um navegador de outro computador procurar o servidor naquele próprio computador.

Reinicie os processos após alterar `.env`. Variáveis `VITE_*` utilizadas em produção exigem novo build. A porta do proxy de desenvolvimento está definida como 3001 em [client/vite.config.ts](client/vite.config.ts); alterar somente `PORT` exige ajustar também esse proxy.

### 9.4 Desenvolvimento

~~~powershell
npm run dev
~~~

Abra [http://localhost:5173](http://localhost:5173). O backend executa na porta 3001. O Vite encaminha `/api` e `/socket.io` para o backend. Mantenha o terminal aberto; `Ctrl+C` encerra a execução.

### 9.5 Produção local

~~~powershell
npm run build
npm start
~~~

Abra [http://localhost:3001](http://localhost:3001). O build gera a interface em `client/dist` e o servidor em `dist/server`. Nesse modo, Express entrega os arquivos da interface e os serviços na mesma porta.

### 9.6 Acesso por IP local

Após a preparação inicial, execute no computador anfitrião:

~~~powershell
npm run start:lan
~~~

Esse comando compila o projeto, força a escuta em `0.0.0.0` e mostra endereços de rede disponíveis. Escolha o endereço da interface Wi-Fi ou Ethernet utilizada pelos amigos, evitando interfaces virtuais.

Um exemplo de endereço é:

~~~text
http://192.168.5.98:3001
~~~

Esse IP foi utilizado no ambiente de verificação e pode ser diferente em outro computador ou após uma reconexão. Utilize o IP exibido no seu terminal. `0.0.0.0` é um endereço de escuta do servidor; não é o endereço a compartilhar com os jogadores.

Todos devem estar na mesma rede. O anfitrião também deve abrir a página pelo IP local ao copiar o convite, para que o link contenha um endereço acessível aos amigos. O servidor deve permanecer ligado durante a partida.

| Modo | Comando de início | Endereço padrão da interface |
|---|---|---|
| Desenvolvimento | `npm run dev` | `http://localhost:5173` |
| Produção local | `npm start`, após build | `http://localhost:3001` |
| Rede local | `npm run start:lan` | `http://IP-DO-ANFITRIAO:3001` |

### 9.7 Firewall do Windows

Caso o Windows bloqueie o acesso pela rede, abra PowerShell **como administrador**, na pasta do projeto, e execute:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\enable-lan-firewall.ps1 -InterfaceAlias 'Wi-Fi'
~~~

O script permite entrada TCP na porta 3001 para o executável Node, pela interface indicada e com origem restrita à sub-rede local. Para Ethernet, substitua `Wi-Fi` pelo nome da interface. Se o backend usar outra porta, acrescente `-Port NUMERO` ao comando.

A necessidade de privilégio administrativo decorre da alteração da regra do firewall. A instalação e a execução normal do jogo não exigem esse procedimento quando a rede já permite o acesso.

## 10. Manual de utilização

### 10.1 Iniciar uma partida

1. O anfitrião executa o servidor e abre o endereço da aplicação.
2. Cada participante informa apelido e avatar na página inicial.
3. Um participante cria a sala e compartilha o código ou o convite.
4. Os demais entram com o código, ou acessam o convite e confirmam seu perfil.
5. O administrador ajusta as configurações e inicia com ao menos dois jogadores conectados.
6. O desenhista seleciona uma das três palavras e utiliza o Canvas.
7. Os outros enviam palpites pelo chat, acompanhando tempo e pontuação.
8. Após o último turno, todos conferem a classificação. O administrador pode iniciar outra partida.

### 10.2 Compartilhamento e controles

Os botões de copiar código e convite tentam a Clipboard API. Em HTTP local, quando ela não está disponível, há uma alternativa por seleção e cópia acionada pelo clique. A interface informa falhas caso o navegador restrinja também essa alternativa. A cópia e a colagem reais são cobertas por teste de navegador.

Lápis, borracha, cores, espessura, limpar, desfazer e refazer ficam disponíveis ao desenhista. O administrador controla as configurações permitidas e pode remover participantes. Cada usuário pode alternar entre tema claro e escuro.

### 10.3 Experimentar no mesmo computador

Abra três abas novas ou navegadores independentes. Crie uma sala no primeiro e entre nos demais com apelidos distintos. Evite duplicar uma aba já conectada, pois o navegador pode copiar seu `sessionStorage` e representar a mesma sessão.

Em caso de recarga ou queda breve, aguarde a reconexão automática. Se a tolerância expirar, entre novamente na sala como uma nova sessão, se houver capacidade.

## 11. Verificação e solução de problemas

### 11.1 Procedimentos de teste

Na pasta do projeto:

~~~powershell
npm run typecheck
npm run lint
npm test
npm run build
~~~

Para preparar e executar os testes de navegador:

~~~powershell
npx playwright install chromium
npm run test:e2e
~~~

Para verificar o build servido por Express:

~~~powershell
npm run build
npm run test:e2e:production
~~~

O teste de produção precisa da porta 3001 livre, pois inicia seu próprio servidor. Encerre previamente a sua execução do jogo com `Ctrl+C`, em um momento sem jogadores. O teste padrão usa a porta 5173 e pode reutilizar um servidor de desenvolvimento existente.

### 11.2 Cobertura e evidências

| Categoria | O que verifica |
|---|---|
| Tipos e lint | Contratos TypeScript e regras estáticas |
| Unitários | Pontuação, normalização, catálogo e validação |
| Integração | Sockets reais, regras, isolamento de salas, reconexão e SQLite temporário |
| E2E multiplayer | Três contextos Chromium, chat, desenho, sigilo, acertos, resultado e reinício |
| E2E interface | Responsividade e temas |
| E2E clipboard | Código e convite conferidos por colagem real, sem mock do clipboard |

O registro de 13/10/2026 informa aprovação de 15 testes Vitest, sendo cinco unitários e dez de integração, além da aprovação dos três testes E2E após os ajustes de clipboard e aparência. A execução em produção também foi verificada em etapas anteriores. Consulte [docs/verification.md](docs/verification.md) para o contexto e os limites dessas evidências.

A elaboração deste documento não executa novamente os testes nem altera o comportamento do jogo. Os testes E2E criam partidas completas, que podem produzir registros no banco do servidor utilizado. Prefira um ambiente próprio para testes quando for necessário separar esses resultados dos jogos dos usuários.

### 11.3 Problemas frequentes

| Sintoma | Causa provável e procedimento |
|---|---|
| `node` ou `npm` não reconhecido | Instalar Node.js compatível e abrir um novo terminal |
| Comando não encontra `package.json` | Entrar na pasta `drawbattle` |
| Erro de Prisma Client ou tabela ausente | Executar `npm run db:setup` e conferir `DATABASE_URL` |
| Erro de migration sem detalhe | Usar `npm run db:migrate`; o script configura o log necessário ao Prisma utilizado |
| `EADDRINUSE` ou porta ocupada | Encerrar uma execução anterior do projeto pelo seu terminal ou configurar outra porta |
| Página não abre em outro computador | Conferir IP, porta, servidor ativo, mesma rede e regra do firewall |
| Rede de convidados não permite acesso | Verificar isolamento entre dispositivos no roteador ou usar uma rede que permita comunicação local |
| Página abre, mas não conecta ao jogo | Conferir `VITE_API_URL`, origem autorizada e acesso a WebSocket |
| Desenvolvimento falha após mudar `PORT` | Atualizar também o destino do proxy do Vite |
| Convite contém `localhost` | Abrir pelo IP local antes de copiar o convite |
| Duas abas representam o mesmo jogador | Abrir uma nova aba a partir da página inicial, sem duplicar a sessão existente |
| Não é possível iniciar | Verificar se há dois jogadores conectados e se a ação é feita pelo administrador |
| Cópia de convite falha | Conferir o aviso da interface, restrições do navegador e tentar uma versão atualizada |
| Partida desapareceu após reinício | O estado ativo era mantido em memória; criar uma nova sala |
| Visualização antiga após atualizar | Recarregar a página; em produção, gerar novo build |

## 12. Considerações finais

O DrawBattle reúne interface web, desenho compartilhado, comunicação por eventos e persistência de resultados em uma aplicação executável localmente. A centralização das regras no servidor mantém uma referência comum para palavras, permissões, turnos e pontuação. O modo de rede local permite compartilhar uma partida por meio do IP do computador anfitrião.

A implementação atual atende ao uso com uma instância de servidor. Evoluções possíveis incluem autenticação de contas, uso do catálogo diretamente do banco, recuperação de partidas, coordenação de múltiplas instâncias e implantação pública com HTTPS. Essas possibilidades são propostas de continuidade e não funcionalidades já disponíveis.

## 13. Referências

### 13.1 Documentação técnica consultada

SOCKET.IO. **Introduction — documentação 4.x**. Disponível em: [https://socket.io/docs/v4/](https://socket.io/docs/v4/). Acesso em: 13 out. 2026.

VITE. **Getting Started**. Disponível em: [https://vite.dev/guide/](https://vite.dev/guide/). Acesso em: 13 out. 2026.

MDN WEB DOCS. **Canvas — APIs da Web**. Disponível em: [https://developer.mozilla.org/pt-BR/docs/Web/API/Canvas_API](https://developer.mozilla.org/pt-BR/docs/Web/API/Canvas_API). Acesso em: 13 out. 2026.

SQLITE. **About SQLite**. Disponível em: [https://www.sqlite.org/about.html](https://www.sqlite.org/about.html). Acesso em: 13 out. 2026.

### 13.2 Fontes internas do projeto

DRAWBATTLE. **Código-fonte e documentação técnica**, versão 1.0.0, 2026.

- [Dependências e comandos](package.json).
- [Contratos compartilhados](shared/types.ts) e [validação de entrada](server/validation.ts).
- [Gerenciamento de partidas](server/game/manager.ts) e [cálculo de pontuação](server/game/scoring.ts).
- [Esquema do banco](prisma/schema.prisma) e [repositório de persistência](server/persistence/repository.ts).
- [Guia rápido](README.md), [arquitetura](docs/architecture.md), [eventos](docs/websocket.md), [implantação](docs/deployment.md) e [evidências de verificação](docs/verification.md).
