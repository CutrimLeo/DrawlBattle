# DrawBattle

Jogo de desenho e adivinhação em português com React, Canvas e um servidor Socket.IO real. Cada sala mantém seus jogadores, desenhos, turnos, chat e ranking; o servidor controla as palavras, os acertos, a pontuação e o tempo.

Para uma apresentação acadêmica do projeto, com resumo, objetivos, arquitetura, regras e manual de execução, consulte a [documentação acadêmica](DOCUMENTACAO_ACADEMICA.md).

## Executar localmente

Requisitos: Node.js 22.12 ou superior e npm. No terminal, entre nesta pasta:

```bash
npm install
npm run db:setup
npm run dev
```

O comando `db:setup` prepara o arquivo `.env`, gera o Prisma Client, aplica as migrations SQLite e cadastra o banco de palavras. A interface fica em **http://localhost:5173** e o backend em **http://localhost:3001**.

Também é possível iniciar os processos separadamente:

```bash
npm run dev:server
npm run dev:client
```

Se precisar configurar portas ou origem, use [`.env.example`](.env.example) como referência. Reinicie o servidor após alterar `.env`; variáveis `VITE_*` são lidas pelo Vite no início ou durante o build.

## Jogar com amigos na rede local

No computador que hospeda o jogo, execute:

```bash
npm run start:lan
```

Esse comando compila a interface e o servidor, escuta em todas as interfaces de rede e mostra os endereços disponíveis. Os amigos devem estar no mesmo Wi-Fi ou rede local e abrir o endereço de Wi-Fi/Ethernet exibido (por exemplo, http://192.168.5.98:3001), criar ou entrar usando o código da sala. Mantenha o terminal aberto enquanto jogam; Ctrl+C encerra o servidor. O IP pode mudar quando o computador reconecta à rede.

No Windows, se o firewall bloquear a conexão, abra PowerShell como administrador na pasta do projeto e execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\enable-lan-firewall.ps1 -InterfaceAlias 'Wi-Fi'
```

A regra permite apenas TCP na porta 3001 para o executável Node, pela interface indicada e com origem na sub-rede local. Ela funciona também quando o perfil de Wi-Fi está definido como público, sem mudar a categoria da rede. Para Ethernet, substitua o nome da interface.

Para desenvolvimento, npm run dev também aceita http://IP-DO-COMPUTADOR:5173; esse modo usa o proxy para o backend. O comando start:lan oferece uma única porta para jogar. Os botões de código e convite também copiam em HTTP na rede local, usando cópia por seleção quando a Clipboard API não está disponível.

## Experimentar com três jogadores

1. Abra três abas em http://localhost:5173; navegadores ou contextos independentes também funcionam.
2. No primeiro, informe um apelido e avatar e crie uma sala. Copie o código exibido no cabeçalho.
3. Nos outros dois, informe apelidos distintos, cole o código e clique em entrar.
4. O administrador escolhe a quantidade e duração das rodadas e inicia a partida.
5. O desenhista seleciona uma das três palavras. Só ele recebe as opções e a palavra secreta.
6. Desenhe no canvas e envie palpites pelo chat dos outros jogadores. Desenhos, mensagens e pontos devem aparecer nas três telas imediatamente.
7. Quando todos acertam, ou o prazo termina, o próximo jogador desenha. Cada rodada completa percorre todos os participantes.
8. Ao terminar, confira o ranking e clique em jogar novamente.

O token de sessão é mantido em sessionStorage, separado por aba. O perfil e o tema usam localStorage; preencha um apelido em cada aba para representar jogadores diferentes. Evite duplicar uma aba já conectada, pois o navegador pode copiar sua sessão. Uma queda breve restaura o mesmo jogador e o desenho da sala. O prazo de tolerância é controlado pelo servidor.

## Controles e regras

- Apenas o desenhista pode usar lápis, borracha, cores, espessura, limpar, desfazer e refazer.
- O host pode mudar configurações no lobby, iniciar/reiniciar e remover participantes.
- Salas aceitam 2–12 jogadores; rodadas duram 15–180 segundos; partidas têm 1–10 rodadas completas.
- Acertos desconsideram caixa, acentos e espaços repetidos. A pontuação considera tempo, dificuldade e ordem; o desenhista ganha um bônus por acerto.
- Mensagens têm até 200 caracteres. Quem já acertou fica impedido de conversar durante o restante do turno para proteger a resposta.
- O timer deriva de um deadline do servidor; relógios e mensagens do navegador não podem estender a rodada.
- A palavra é revelada aos demais apenas no encerramento do turno.
- Os resultados concluídos alimentam o ranking persistente; uma partida ativa vive na memória do processo.

## Verificação

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
# Opcional: validar o build servido em produção
npm run test:e2e:production
```

`npm test` executa testes unitários e testes de integração usando sockets reais e SQLite temporário com migrations reais. O teste E2E usa três contextos Chromium independentes contra o frontend e backend, sem substituir respostas do jogo. A configuração Playwright inicia os servidores automaticamente quando necessário. Há também uma checagem de tema e layout em celular. Para testar o build servido pelo Express, rode `npm run build` e `npm run test:e2e:production`. `npm run test:watch` e `npm run test:e2e:ui` oferecem modos interativos.

Os testes de integração cobrem criação e entrada, três jogadores, desenho/undo/redo/clear, chat, palavra privada, acertos, pontuação, deadline do servidor e aviso de dez segundos, reconexão por token, remoção após tolerância, transferência de host, isolamento entre salas, entrada tardia, encerramento, persistência, reinício, proteção contra spam e rejeição de mensagens inválidas ou não autorizadas. Os testes unitários cobrem pontuação, normalização, palavras e limites Zod.

## Organização

```text
client/                 React, rotas, Zustand, canvas e estilos Tailwind
server/                 Express, Socket.IO, validação e autorização
server/game/            salas, turnos, pontuação e palavras
server/persistence/     repositório Prisma dos resultados
shared/types.ts         contratos TypeScript usados nas duas pontas
prisma/                 schema, migrations e seed
tests/                  Vitest com clientes reais
tests/e2e/              Playwright com três navegadores
docs/                   contratos, arquitetura e implantação
```

Confira [a verificação realizada](docs/verification.md).

Consulte [os eventos WebSocket](docs/websocket.md), [a arquitetura e seus limites](docs/architecture.md) e [a implantação](docs/deployment.md).

## Endpoints HTTP

| Endpoint | Resposta |
|---|---|
| `GET /api/health` ou `GET /health` | Saúde do processo e estatísticas de conexão |
| `GET /api/stats` | Número de jogadores online e salas ativas |
| `GET /api/leaderboard` | Até 20 usuários ordenados pela pontuação acumulada |

Durante o desenvolvimento, o Vite encaminha `/api` e `/socket.io` para a porta 3001. Em produção, o backend serve o build da interface e os mesmos endpoints.

## Persistência e limites

SQLite guarda usuários, palavras, partidas concluídas, resultados e estatísticas acumuladas. Faça backup do arquivo do banco. Salas ativas, tokens de reconexão, histórico de desenhos e timers não sobrevivem à reinicialização do processo.

Esta implementação funciona em **uma instância de Node.js**. O cliente reconecta automaticamente, mas reiniciar o servidor encerra as partidas ativas. Para múltiplas instâncias, será necessário mover o estado e os tokens para armazenamento compartilhado, coordenar os timers e instalar um adaptador Socket.IO, como o de Redis. Há detalhes em [arquitetura](docs/architecture.md).
