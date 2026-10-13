# Contratos WebSocket

O transporte principal é WebSocket via Socket.IO em `/socket.io`. Frontend e servidor compartilham [`shared/types.ts`](../shared/types.ts). Eventos de aplicação usam o mesmo envelope:

```json
{
  "type": "chat:message",
  "requestId": "4fde830a-07fb-4e04-a08a-2d5f76190d9e",
  "timestamp": 1791892800000,
  "payload": { "text": "Parece um animal!" }
}
```

O nome do evento Socket.IO deve corresponder a `type`. `requestId` identifica a ação; o cliente usa UUID. O timestamp do cliente é metadado: o servidor determina deadlines, turnos e pontuação usando seu próprio relógio. Eventos emitidos pelo servidor recebem timestamp do servidor.

Cada ação aceita um callback de confirmação do Socket.IO. A resposta também é um envelope, cujo payload contém `{ "ok": true }` e eventuais dados; falhas retornam `{ "ok": false, "error": "...", "code": "..." }`. Nunca considere uma alteração concluída antes da confirmação/atualização de estado. O servidor também pode emitir `error`.

## Criar, entrar e reconectar

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  transports: ['websocket'],
  auth: savedToken ? { sessionToken: savedToken } : {},
});

socket.emit('room:create', {
  type: 'room:create',
  requestId: crypto.randomUUID(),
  timestamp: Date.now(),
  payload: { name: 'Ana', avatar: 'fox', roomName: 'Sala da turma' },
}, (ack) => {
  if (ack.payload.ok) {
    // Guarde o token em armazenamento privado deste jogador.
    savedToken = ack.payload.sessionToken;
    socket.auth = { sessionToken: savedToken };
  }
});
```

Tokens expirados ou forjados são rejeitados em `connect_error`; o cliente apaga a sessão inválida e reconecta para permitir uma nova entrada.

Criação e entrada retornam `{ ok, sessionToken, roomCode, playerId }`. O token identifica a sessão de jogo, sem conta ou senha. Trate-o como credencial e não compartilhe. Em uma nova conexão, informe `auth.sessionToken` para recuperar o jogador existente dentro do período de tolerância. O servidor emite `session:restored` e o estado individualizado, incluindo o desenho atual.

## Cliente → servidor

| Evento | Payload | Permissão e efeito |
|---|---|---|
| `room:create` | `{name, avatar, roomName?, settings?}` | Cria sala e sessão; configurações opcionais parciais |
| `room:join` | `{name, avatar, code}` | Entra por código de seis caracteres, respeitando capacidade |
| `room:leave` | `{}` | Remove a própria participação |
| `room:state` | `{}` | Solicita snapshot da própria sala |
| `room:settings` | Configurações parciais | Somente host; lobby/entre partidas |
| `player:kick` | `{playerId}` | Somente host; remove participante |
| `game:start` | `{}` | Somente host; inicia/reinicia com participantes suficientes |
| `game:word_select` | `{wordId}` | Somente desenhista em seleção; ID de uma das opções |
| `draw:stroke` | Stroke abaixo | Somente desenhista, durante o turno |
| `draw:clear` | `{}` | Somente desenhista; limpa canvas |
| `draw:undo` | `{}` | Somente desenhista; desfaz último traço |
| `draw:redo` | `{}` | Somente desenhista; refaz último traço |
| `chat:message` | `{text}` | Mensagem/palpite com até 200 caracteres |
| `guess:submit` | `{text}` | Palpite explícito; mesma validação do chat |

Configurações: `maxPlayers` 2–12, `roundDuration` 15–180 segundos e `rounds` 1–10. `rounds` é o número de ciclos completos; cada jogador desenha uma vez por ciclo. Nomes têm 1–24 caracteres e nomes de sala 1–40.

Um `Stroke` contém:

```json
{
  "id": "a307c9e3-74b2-4c67-8f41-aaafdd199607",
  "points": [{"x": 0.25, "y": 0.4}, {"x": 0.27, "y": 0.42}],
  "color": "#8B5CF6",
  "brushSize": 6,
  "tool": "pencil"
}
```

Coordenadas são números finitos entre 0 e 1. Um traço aceita 1–2048 pontos; a cor é hexadecimal de seis dígitos; espessura 1–50; ferramenta `pencil` ou `eraser`. A normalização mantém o desenho proporcional em canvases de dimensões diferentes. IDs permitem identificar traços. A sala efetiva vem da sessão autorizada.

## Servidor → cliente

| Evento | Finalidade |
|---|---|
| `room:state` | Snapshot completo e individualizado da sala |
| `player:joined` | Entrada de participante |
| `player:left` | Saída/remoção de participante |
| `player:disconnect` | Participante temporariamente desconectado |
| `player:kicked` | `{reason}`; avisa somente o jogador removido pelo host |
| `game:round_start` | Seleção/início de um turno |
| `game:word_options` | `{options, endsAt}`; **somente desenhista** |
| `game:round_end` | Encerramento do turno e revelação da palavra |
| `draw:stroke` | Traço aprovado retransmitido à sala |
| `draw:clear` | Limpeza aprovada |
| `draw:undo` | Atualização de desfazer |
| `draw:redo` | Atualização de refazer |
| `chat:message` | Mensagem de chat ou aviso |
| `guess:correct` | Acerto aprovado, sem divulgar resposta ativa |
| `score:update` | `{players, ranking}` atualizados |
| `game:finish` | `{ranking, stats, matchId}` após persistência |
| `server:stats` | Número de conexões/jogadores e salas |
| `session:restored` | Identidade recuperada após reconexão |
| `error` | Falha de validação, permissão ou ação |

Snapshots contêm identificação da sala, configurações, jogadores, host, fase, turno, deadlines, traços, chat, eventos e ranking. `phase` é `lobby`, `choosing`, `drawing`, `round_end` ou `finished`.

## Palavra privada e timer

`secretWord` e `wordOptions` são incluídos no snapshot **apenas para o desenhista**. Demais jogadores recebem dicas, tamanho, categoria e dificuldade; `revealedWord` aparece após encerrar o turno. Palpites corretos viram avisos de acerto sem reproduzir o texto da resposta. Jogadores que acertaram e o desenhista não podem usar o chat para divulgar a palavra ativa.

O cliente calcula a contagem regressiva a partir de `endsAt` e `serverTime`. O servidor encerra o turno independentemente de abas em segundo plano, desconexões ou mudanças no relógio do navegador. Se o desenhista não selecionar a palavra antes de `choiceEndsAt`, o servidor escolhe uma opção.

## Erros e isolamento

Payloads são validados com Zod antes de executar ações. Campos privilegiados como pontuação, turno e deadlines não são aceitos em ações de clientes. Limites de mensagens, traços e frequência são aplicados no servidor. Eventos não autenticados, palavra inválida e desenho fora do turno são rejeitados.

Um socket só opera sobre sua participação atual; informar um código/ID de outra sala não concede acesso. Broadcasts são restritos à sala, e snapshots privados são enviados por jogador. O evento nativo de desconexão do Socket.IO inicia o período de tolerância e origina o aviso `player:disconnect`; não há ação de cliente que possa desconectar outro jogador.
