import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, CheckCheck, Clock3, Copy, Crown, DoorOpen, ExternalLink, Info, LoaderCircle, MessageCircle, Moon, Pencil, Play, Send, Settings2, ShieldCheck, Sparkles, Sun, Trophy, Users, Wifi, WifiOff, X } from 'lucide-react';
import type { ChatMessage, Player, RoomSnapshot } from '../../shared/types';
import { action, connectGame, enterRoom, leaveRoom, sendEvent, useGame } from './state/game';
import { Avatar, AvatarPicker } from './components/Avatar';
import { DrawingCanvas } from './components/DrawingCanvas';
import { copyText } from './lib/clipboard';

function Brand() {
  return <Link to="/" className="brand" aria-label="DrawBattle início"><span className="brand-icon"><Pencil size={23} strokeWidth={2.4} /></span><span>draw<span className="brand-secondary">battle</span></span></Link>;
}
function Header({ room }: { room?: RoomSnapshot }) {
  const { theme, setTheme, connected, onlinePlayers } = useGame();
  return <header className="site-header"><div className="header-inner"><Brand />
    <div className="header-right">{!room && <span className="live-pill"><span className={'status-dot ' + (!connected ? 'offline' : '')} />{onlinePlayers === null ? 'Conectando...' : <><strong>{onlinePlayers}</strong> online</>}</span>}
      {room && <span className={'connection-state ' + (!connected ? 'reconnecting' : '')}>{connected ? <Wifi size={15} /> : <WifiOff size={15} />}{connected ? 'Conectado' : 'Reconectando'}</span>}
      <button type="button" className="icon-button theme-button" onClick={setTheme} aria-label={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'} title={theme === 'light' ? 'Modo escuro' : 'Modo claro'}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button>
    </div>
  </div></header>;
}
function ErrorToast() {
  const { error, dismissError } = useGame();
  if (!error) return null;
  return <div className="toast" role="alert"><Info size={20} /><span>{error}</span><button type="button" aria-label="Fechar aviso" onClick={dismissError}><X size={17} /></button></div>;
}
export default function App() {
  const theme = useGame((state) => state.theme);
  useEffect(() => { connectGame(); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return <><ErrorToast /><AppContent /></>;
}
function AppContent() {
  const { pathname } = useLocation();
  return pathname.startsWith('/room/') ? <Room /> : <Home />;
}
export function Home() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { code: routeCode } = useParams();
  const invitationCode = (routeCode || params.get('room') || '').trim().toUpperCase();
  const { profile, setProfile, busy, connected, room, identity, activeRooms } = useGame();
  const [code, setCode] = useState(invitationCode);
  const [formError, setFormError] = useState('');
  useEffect(() => { setCode(invitationCode); setFormError(''); }, [invitationCode]);
  useEffect(() => {
    if (room && identity && (!invitationCode || room.code === invitationCode)) {
      navigate('/room/' + room.code, { replace: true });
    }
  }, [room, identity, invitationCode, navigate]);
  async function submit(type: 'room:create' | 'room:join') {
    if (useGame.getState().busy) return;
    setFormError('');
    if (profile.name.trim().length < 2) { setFormError('Seu apelido precisa ter pelo menos 2 letras.'); return; }
    const targetCode = (invitationCode || code).trim().toUpperCase();
    if (type === 'room:join' && !/^[A-Z0-9]{6}$/.test(targetCode)) { setFormError('Digite o código de 6 caracteres da sala para entrar.'); return; }
    useGame.setState({ busy: true });
    try {
      const currentIdentity = useGame.getState().identity;
      if (type === 'room:join' && currentIdentity) {
        if (currentIdentity.roomCode === targetCode) { navigate('/room/' + targetCode); return; }
        await leaveRoom();
      }
      const roomCode = await enterRoom(type, targetCode);
      navigate('/room/' + roomCode);
    } catch { /* Server feedback appears in the toast. */ }
    finally { useGame.setState({ busy: false }); }
  }
  return <div className="home-page"><Header />
    <main className="home-main">
      <section className="entry-card" aria-labelledby="entry-heading">
        <div className="entry-heading"><h1 id="entry-heading">{invitationCode ? 'Entrar na sala' : 'Vamos jogar?'}</h1><p>{invitationCode ? 'Você foi convidado para a sala ' + invitationCode + '.' : 'Desenhe e adivinhe palavras com seus amigos.'}</p></div>
        <form onSubmit={(event) => { event.preventDefault(); void submit(invitationCode ? 'room:join' : 'room:create'); }}>
          <label className="field-label" htmlFor="nickname">Seu apelido</label>
          <div className="input-wrap nickname-wrap"><Avatar avatar={profile.avatar} small /><input id="nickname" data-testid="nickname-input" autoComplete="nickname" maxLength={24} placeholder="Digite seu apelido" value={profile.name} onChange={(event) => setProfile({ name: event.target.value })} aria-describedby={formError ? 'form-error' : undefined} /></div>
          <div className="field-label avatar-label">Avatar</div><AvatarPicker value={profile.avatar} onChange={(avatar) => setProfile({ avatar })} />
          {formError && <p id="form-error" className="form-error" role="alert">{formError}</p>}
          {invitationCode && <><label className="field-label" htmlFor="room-code-input">Código da sala do convite</label><div className="input-wrap code-wrap invite-code"><input id="room-code-input" data-testid="room-code-input" value={invitationCode} readOnly /></div>{identity && identity.roomCode !== invitationCode && <p className="entry-note">Ao entrar, você sairá da sala {identity.roomCode}.</p>}</>}
          <button data-testid={invitationCode ? 'join-room' : 'create-room'} type="submit" className="button button-primary create-button" disabled={busy || !connected}>{busy && <LoaderCircle className="spin" size={18} />}{invitationCode ? 'Entrar na sala' : 'Criar sala'}</button>
        </form>
        {!invitationCode && <><div className="divider"><span />ou entre em uma sala<span /></div>
          <form onSubmit={(event) => { event.preventDefault(); void submit('room:join'); }}>
            <label className="field-label" htmlFor="room-code-input">Código da sala</label>
            <div className="join-fields"><div className="input-wrap code-wrap"><input id="room-code-input" data-testid="room-code-input" autoComplete="off" maxLength={6} placeholder="Ex.: ABC123" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></div><button data-testid="join-room" type="submit" className="button button-secondary" disabled={busy || !connected}>Entrar</button></div>
          </form>
        </>}
        <p className="entry-note">Sem cadastro · 2 a 12 jogadores</p>
      </section>
    </main>
    <footer className="home-footer"><span>{activeRooms === null ? 'Conectando às salas...' : activeRooms + (activeRooms === 1 ? ' sala ativa' : ' salas ativas')}</span></footer>
  </div>;
}
function useCountdown(endsAt: number | null) {
  const offset = useGame((state) => state.clockOffset);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 200); return () => window.clearInterval(timer); }, []);
  return endsAt ? Math.max(0, Math.ceil((endsAt - (now + offset)) / 1000)) : 0;
}
function Room() {
  const { code } = useParams();
  const requestedCode = (code || '').trim().toUpperCase();
  const navigate = useNavigate();
  const { room, identity, connected, connecting } = useGame();
  const [leaving, setLeaving] = useState(false);
  if (!identity || identity.roomCode !== requestedCode) return <Home />;
  if (!room || room.code !== requestedCode) return <div className="room-page"><Header /><div className="loading-room"><LoaderCircle size={32} className="spin" /><h2>{connecting ? 'Voltando para a sua sala...' : 'Preparando a sua sala...'}</h2><p>Sincronizando jogadores, desenhos e palpites.</p></div></div>;
  const me = room.players.find((player) => player.id === identity.playerId);
  const host = room.hostId === identity.playerId;
  async function leave() { setLeaving(true); try { await leaveRoom(); navigate('/'); } catch { setLeaving(false); } }
  return <div className="room-page"><Header room={room} />
    {!connected && <div className="reconnect-banner" role="status"><LoaderCircle size={15} className="spin" />Reconectando ao servidor. Seu lugar na sala está guardado.</div>}
    <main className="room-main"><div className="room-titlebar"><div><div className="eyebrow-small">SALA PRIVADA</div><h1>{room.name}</h1></div><div className="room-actions"><RoomCode code={room.code} /><button type="button" className="button button-quiet leave-button" aria-label="Sair da sala" title="Sair da sala" disabled={leaving} onClick={() => void leave()}><DoorOpen size={17} /><span>Sair da sala</span></button></div></div>
      <div className="game-layout">
        <PlayersPanel room={room} meId={identity.playerId} host={host} />
        <section className="game-center" aria-label="Partida"><RoundHeader room={room} meId={identity.playerId} /><DrawingCanvas room={room} canDraw={connected && room.phase === 'drawing' && room.drawerId === identity.playerId} overlay={<GameOverlay room={room} meId={identity.playerId} host={host} />} />
          {room.phase === 'lobby' && <LobbySettings room={room} host={host} />}
          <div className="round-footer"><span><Info size={14} />{room.phase === 'lobby' ? 'Compartilhe o código e espere os amigos chegarem.' : room.drawerId === identity.playerId ? 'Desenhe a palavra sem escrever letras ou números.' : me?.guessed ? 'Boa! Você acertou. Espere o próximo turno.' : 'Mande seu palpite no chat. Quanto mais rápido, mais pontos!'}</span><span><ShieldCheck size={14} /> Sala privada</span></div>
        </section>
        <ChatPanel room={room} me={me} />
      </div>
    </main><footer className="room-footer"><span className="footer-brand">drawbattle<span>.</span></span><span>A melhor parte é jogar junto.</span><span><Wifi size={12} />Sincronizado em tempo real</span></footer>
  </div>;
}
function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (await copyText(code)) {
      setCopied(true); window.setTimeout(() => setCopied(false), 1800);
    } else {
      useGame.setState({ error: 'Não foi possível copiar automaticamente. Código da sala: ' + code });
    }
  }
  return <button type="button" className="room-code-button" onClick={() => void copy()} aria-label={'Copiar código da sala ' + code}><span className="code-label">CÓDIGO DA SALA</span><strong data-testid="room-code">{code}</strong>{copied ? <Check size={16} /> : <Copy size={16} />}<span className="copy-hint">{copied ? 'Copiado!' : 'Copiar'}</span></button>;
}
function PlayersPanel({ room, meId, host }: { room: RoomSnapshot; meId: string; host: boolean }) {
  const players = [...room.players].sort((a, b) => b.score - a.score);
  async function copyInvite() {
    const invite = new URL('/', window.location.origin);
    invite.searchParams.set('room', room.code);
    const inviteUrl = invite.href;
    if (await copyText(inviteUrl)) {
      useGame.setState({ error: 'Link da sala copiado! Compartilhe com a galera.' });
    } else {
      useGame.setState({ error: 'Não foi possível copiar automaticamente. Convite: ' + inviteUrl });
    }
  }
  return <aside className="panel players-panel"><div className="panel-heading"><h2><Users size={17} />A galera</h2><span className="count-pill">{room.players.length}/{room.settings.maxPlayers}</span></div>
    <div className="player-list" data-testid="player-list">{players.map((player, index) => <div className={'player-row ' + (player.id === meId ? 'is-me ' : '') + (!player.connected ? 'is-offline ' : '') + (player.id === room.drawerId ? 'is-drawer' : '')} data-testid="player-row" key={player.id}><span className="player-position">{index === 0 && room.phase !== 'lobby' ? <Trophy size={14} /> : index + 1}</span><div className="player-avatar"><Avatar avatar={player.avatar} />{player.guessed && <span className="avatar-check"><Check size={11} /></span>}</div><div className="player-meta"><span className="player-name">{player.name}{player.id === meId && <small>você</small>}</span><span className="player-status">{player.isHost ? <><Crown size={11} /> Host</> : player.id === room.drawerId ? <><Pencil size={11} /> Desenhando</> : !player.connected ? 'Reconectando...' : player.guessed ? 'Acertou!' : room.phase === 'lobby' ? 'Pronto para jogar' : 'No palpite'}</span></div><span className="player-score">{player.score.toLocaleString('pt-BR')}<small>pts</small></span>{host && player.id !== meId && <button type="button" className="kick-button" aria-label={'Remover ' + player.name + ' da sala'} title={'Remover ' + player.name} onClick={() => void action('player:kick', { playerId: player.id })}><X size={12} /></button>}</div>)}</div>
    {room.phase === 'lobby' && <div className="friends-note"><h3>Convide seus amigos</h3><p>Até {room.settings.maxPlayers} jogadores na sala.</p><button type="button" className="text-button" onClick={() => void copyInvite()}>Copiar convite<ExternalLink size={13} /></button></div>}
    <div className="players-bottom"><span className="status-dot" />{room.players.filter((player) => player.connected).length} jogadores conectados</div>
  </aside>;
}
function RoundHeader({ room, meId }: { room: RoomSnapshot; meId: string }) {
  const deadline = room.phase === 'choosing' ? room.choiceEndsAt : room.endsAt;
  const seconds = useCountdown(deadline);
  const drawer = room.players.find((player) => player.id === room.drawerId);
  const duration = room.phase === 'choosing' ? 15 : room.settings.roundDuration;
  const progress = Math.min(100, seconds / duration * 100);
  return <div className="round-header"><div className="round-top"><span className="round-number"><span className="round-icon"><Pencil size={15} /></span>{room.phase === 'lobby' ? 'Vamos começar?' : room.phase === 'finished' ? 'Partida concluída' : 'Rodada ' + room.round + ' de ' + room.settings.rounds}</span><span className={'timer ' + (seconds <= 10 && room.phase === 'drawing' ? 'timer-urgent' : '')}><Clock3 size={16} />{room.phase === 'lobby' ? room.settings.roundDuration + 's por turno' : room.phase === 'finished' ? 'Bom jogo!' : seconds + 's'}</span></div>
    <div className="word-area">{room.phase === 'drawing' ? <><span className="word-caption">{room.drawerId === meId ? 'SUA PALAVRA' : (drawer?.name || 'Alguém') + ' ESTÁ DESENHANDO'}</span><strong className={'word-display ' + (room.drawerId !== meId ? 'word-hint' : '')} data-testid={room.drawerId === meId ? 'secret-word' : 'word-hint'}>{room.secretWord || room.wordHint}</strong><span className="category-label">{room.category}{room.wordLength ? ' · ' + room.wordLength + ' letras' : ''}</span></> : <><span className="word-caption">{room.phase === 'lobby' ? 'SUA PARTIDA' : room.phase === 'choosing' ? (drawer?.name || 'O desenhista') + ' ESTÁ ESCOLHENDO' : room.phase === 'round_end' ? 'ESSE DESENHO ERA...' : 'TODO TRAÇO VALEU A PENA'}</span><strong className="word-display">{room.phase === 'round_end' ? room.revealedWord : room.phase === 'lobby' ? 'Aguardando jogadores' : room.phase === 'choosing' ? 'Uma nova ideia vem aí...' : 'Olha só esse placar!'}</strong></>}</div>
    {room.phase !== 'lobby' && room.phase !== 'finished' && <div className={'timer-progress ' + (seconds <= 10 && room.phase === 'drawing' ? 'urgent' : '')}><span style={{ width: progress + '%' }} /></div>}
  </div>;
}
function GameOverlay({ room, meId, host }: { room: RoomSnapshot; meId: string; host: boolean }) {
  const connected = useGame((state) => state.connected);
  if (room.phase === 'drawing') return null;
  if (room.phase === 'finished') return <div className="results-overlay"><span className="result-trophy"><Trophy size={35} /></span><div className="eyebrow-small">UM APLAUSO PARA A GALERA!</div><h2>{room.ranking[0]?.name || 'A galera'} levou essa!</h2><p>Cada traço rendeu uma boa história.</p><div className="results-ranking">{room.ranking.map((player, index) => <div key={player.id}><span className="result-position">{index + 1}</span><Avatar avatar={player.avatar} small /><strong>{player.name}</strong><span>{player.correctGuesses} acerto{player.correctGuesses !== 1 ? 's' : ''}</span><b>{player.score} <small>pts</small></b></div>)}</div>{room.stats && <div className="match-stats"><span><strong>{room.stats.correctGuesses}</strong> acertos</span><span><strong>{room.stats.completedTurns}</strong> desenhos</span><span><strong>{Math.max(1, Math.round(room.stats.durationMs / 60000))}</strong> min de diversão</span></div>}{host ? <button data-testid="restart-game" type="button" className="button button-primary" disabled={!connected || room.players.filter((player) => player.connected).length < 2} onClick={() => void action('game:start')}><Play size={17} />Jogar de novo</button> : <span className="waiting-label"><LoaderCircle className="spin" size={15} />Aguardando o host para jogar de novo</span>}</div>;
  if (room.phase === 'choosing' && room.drawerId === meId) return <div className="word-choice-overlay"><span className="overlay-icon"><Pencil size={27} /></span><div className="eyebrow-small">A VEZ É SUA!</div><h2>O que você vai desenhar?</h2><p>Escolha uma palavra. Ela é segredo só seu.</p><div className="word-options">{room.wordOptions?.map((word, index) => <button key={word.id} type="button" data-testid={'word-option-' + index} data-word={word.text} className="word-option" disabled={!connected} onClick={() => void action('game:word_select', { wordId: word.id })}><span><strong>{word.text}</strong><small>{word.category}</small></span><span className={'difficulty difficulty-' + word.difficulty}>{word.difficulty === 'easy' ? 'Fácil' : word.difficulty === 'medium' ? 'Médio' : 'Difícil'}</span><ArrowRight size={18} /></button>)}</div></div>;
  if (room.phase === 'round_end') return <div className="round-end-overlay"><span className="overlay-icon"><CheckCheck size={30} /></span><div className="eyebrow-small">DESENHO ENCERRADO</div><h2>A palavra era <span>{room.revealedWord}</span></h2><p>{room.players.filter((player) => player.guessed).length} jogador(es) acertaram esse palpite.</p><span className="waiting-label"><LoaderCircle className="spin" size={15} />Preparando o próximo desenho...</span></div>;
  if (room.phase === 'choosing') {
    const drawer = room.players.find((player) => player.id === room.drawerId);
    return <div className="waiting-overlay"><Avatar avatar={drawer?.avatar || 'fox'} /><h2>{drawer?.name} está escolhendo!</h2><p>A próxima obra de arte já vem.<br />Prepare o seu melhor palpite.</p><span className="waiting-label"><LoaderCircle className="spin" size={15} />Uma palavra, muitas possibilidades</span></div>;
  }
  const ready = room.players.filter((player) => player.connected).length >= 2;
  return <div className="lobby-overlay"><span className="overlay-icon"><Pencil size={26} /></span><h2>Pronto para jogar?</h2><p>Convide os amigos e comece a partida.</p>{host ? <button data-testid="start-game" type="button" className="button button-primary" disabled={!ready || !connected} onClick={() => void action('game:start')}><Play size={17} fill="currentColor" />{ready ? 'Começar partida' : 'Aguardando jogadores'}</button> : <span className="waiting-label"><LoaderCircle className="spin" size={15} />Aguardando o host começar a partida</span>}<small>{host ? ready ? 'Ajuste as configurações abaixo antes de começar.' : 'O jogo começa com pelo menos 2 jogadores.' : 'Enquanto isso, diga um oi no chat.'}</small></div>;
}
function LobbySettings({ room, host }: { room: RoomSnapshot; host: boolean }) {
  return <section className="lobby-settings" aria-label="Configurações da partida"><div className="settings-heading"><Settings2 size={16} /><strong>Do seu jeito</strong><span>{host ? 'Configure a partida' : 'Configurações do host'}</span></div><div className="settings-fields"><label>Jogadores<select aria-label="Limite de jogadores" disabled={!host} value={room.settings.maxPlayers} onChange={(event) => void action('room:settings', { maxPlayers: Number(event.target.value) })}>{Array.from({ length: 11 }, (_, index) => index + 2).map((n) => <option key={n} value={n}>{n} pessoas</option>)}</select></label><label>Tempo por desenho<select aria-label="Duração da rodada" disabled={!host} value={room.settings.roundDuration} onChange={(event) => void action('room:settings', { roundDuration: Number(event.target.value) })}>{[30, 60, 80, 120, 180].map((n) => <option value={n} key={n}>{n} segundos</option>)}</select></label><label>Rodadas<select data-testid="settings-rounds" aria-label="Quantidade de rodadas" disabled={!host} value={room.settings.rounds} onChange={(event) => void action('room:settings', { rounds: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} rodada{n !== 1 ? 's' : ''}</option>)}</select></label></div></section>;
}
function ChatItem({ message, meId }: { message: ChatMessage; meId?: string }) {
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(message.timestamp);
  if (message.kind === 'system') return <div className="chat-system" data-testid="chat-message"><span>{message.text}</span><time dateTime={new Date(message.timestamp).toISOString()}>{time}</time></div>;
  if (message.kind === 'correct') return <div className="chat-correct" data-testid="chat-message"><CheckCheck size={17} /><div><strong>{message.text}</strong><time dateTime={new Date(message.timestamp).toISOString()}>{time}</time></div></div>;
  return <div className={'chat-item ' + (message.playerId === meId ? 'my-message' : '')} data-testid="chat-message"><Avatar avatar={message.avatar || 'fox'} small /><div className="chat-content"><div className="chat-meta"><strong>{message.name}</strong><time dateTime={new Date(message.timestamp).toISOString()}>{time}</time></div><p>{message.text}</p></div></div>;
}
function ChatPanel({ room, me }: { room: RoomSnapshot; me?: Player }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const connected = useGame((state) => state.connected);
  const endRef = useRef<HTMLDivElement>(null);
  const lastMessage = room.chat.at(-1)?.id;
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [lastMessage]);
  const locked = room.phase === 'drawing' && (room.drawerId === me?.id || !!me?.guessed);
  const isGuess = room.phase === 'drawing' && !locked;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!text.trim() || locked || sending) return;
    setSending(true);
    try { await sendEvent(isGuess ? 'guess:submit' : 'chat:message', { text: text.trim() }); setText(''); } catch { /* The store shows the server feedback. */ } finally { setSending(false); }
  }
  return <aside className="panel chat-panel"><div className="panel-heading"><h2><MessageCircle size={17} />Chat & palpites</h2><span className="chat-live"><span className="status-dot" />ao vivo</span></div><div className="chat-tip"><Sparkles size={14} />{room.phase === 'lobby' ? 'Dê um oi para a galera!' : 'Digite a palavra que você está vendo.'}</div>
    <div className="chat-messages" role="log" aria-label="Mensagens da sala" aria-live="polite">{room.chat.length ? room.chat.map((message) => <ChatItem key={message.id} message={message} meId={me?.id} />) : <div className="empty-chat"><MessageCircle size={29} /><p>A conversa começa<br />com um simples oi.</p></div>}<div ref={endRef} /></div>
    <form className="chat-form" onSubmit={(event) => void submit(event)}><div className="chat-input-wrap"><input data-testid="chat-input" aria-label={isGuess ? 'Seu palpite' : 'Mensagem para a sala'} maxLength={200} autoComplete="off" placeholder={locked ? me?.guessed ? 'Você acertou! Aguarde...' : 'Sua vez de desenhar...' : isGuess ? 'Qual é o seu palpite?' : 'Mande um oi...'} value={text} disabled={locked || !connected} onChange={(event) => setText(event.target.value)} /><button type="submit" data-testid="chat-send" aria-label="Enviar mensagem ou palpite" disabled={locked || !connected || !text.trim() || sending}>{sending ? <LoaderCircle size={18} className="spin" /> : <Send size={18} />}</button></div><div className="chat-input-footer"><span>{locked ? 'O segredo está seguro com você.' : 'Enter para enviar'}</span><span>{text.length}/200</span></div></form>
  </aside>;
}
