# Verificação da entrega

Executada em 13/10/2026, Windows, Node.js 25.2.0. O projeto declara Node.js 22.12 ou superior.

| Verificação | Resultado |
|---|---|
| npm run db:setup | Prisma Client gerado, migration SQLite aplicada, 240 palavras cadastradas |
| npm run typecheck | Frontend, backend e testes sem erros de tipos |
| npm run lint | Sem erros |
| npm test | 15 testes passaram: 5 unitários e 10 integração com sockets e SQLite reais |
| npm run build | Frontend e servidor compilados |
| npm run test:e2e | 2 testes passaram: partida com 3 navegadores e interface responsiva/tema |
| npm run test:e2e:production | Os mesmos 2 testes passaram com npm start/Express e build real |
| npm audit | 0 vulnerabilidades conhecidas no conjunto instalado |

A partida E2E cria três contextos Chromium independentes, verifica chat, sigilo da palavra, mudança dos pixels do canvas em outros navegadores, palpites, pontos, recarga/reconexão, resultado e reinício. Capturas de tela de desktop, tema escuro e celular foram inspecionadas. O Chromium instalado no ambiente foi usado por meio da variável opcional PLAYWRIGHT_CHROMIUM_EXECUTABLE; em outra máquina, npx playwright install chromium prepara o navegador padrão.

Os testes de integração aplicam migrations reais em bancos temporários e conferem a persistência de jogadores, partidas e ranking. Nenhum evento do jogo recebe uma resposta substituta. Os prazos reduzidos usados nessas suítes são parâmetros do servidor de teste.

O ZIP de fonte exclui banco SQLite, .env, node_modules, caches, builds e resultados de QA. O banco local conserva as partidas criadas durante os testes; o seed contém apenas o catálogo de palavras.

Limites: Dockerfile fornecido, sem execução de Docker neste ambiente; hospedagem pública e múltiplas instâncias/Redis não foram implantadas. A execução local e o modo de produção de uma instância Node.js foram verificados.

## Acesso pela rede local

Em 13/10/2026, a aplicação foi testada em HTTP pelo endereço Wi-Fi 192.168.5.98. A partida com três contextos Chromium passou na porta 3001; convite, tema e responsividade também passaram. O modo de produção de start-lan foi testado separadamente na porta 3002, com os dois testes E2E passando. Build e lint passaram após os ajustes de IDs, clipboard e CSP para HTTP.

O firewall do Windows recebeu a regra Codex-DrawBattle-LAN-3001, habilitada apenas para TCP3001 do Node pela interface Wi-Fi, com RemoteAddress=LocalSubnet. O serviço atual na porta 3001 foi preservado e sua saúde foi verificada pelo IP Wi-Fi. Os testes usaram este computador com seu endereço de rede; não houve acesso a outro computador para confirmar configuração do roteador.

## Cópia de código e convite

A falha foi reproduzida no IP HTTP: os dois botões mantinham um marcador anterior na área de transferência. A correção usa Clipboard API quando disponível e cópia por seleção dentro da ação do usuário no acesso HTTP. A área temporária de seleção é removida e o foco é restaurado. O teste específico confere código, convite e código novamente por colagem real com Ctrl+V, sem mockar a área de transferência. O teste de responsividade também exige sucesso e confere o link colado, evitando aceitar um simples aviso de falha.

## Aparência simplificada

A página inicial passou a usar um formulário central compacto, título menor, texto curto e paleta neutra. Decorações de apresentação foram removidas; a sala de espera e os controles também receberam estilos discretos. O contraste dos botões e mensagens de erro foi ajustado no tema escuro.

Build, TypeScript e lint passaram. Os três testes E2E existentes passaram pelo IP local: cópia/colagem real, partida com três navegadores e responsividade/tema. Capturas de desktop e celular foram inspecionadas. Uma verificação adicional em320px confirmou ausência de overflow na Home e acesso às três opções de palavra por rolagem. O botão móvel de sair recebeu um nome acessível.
