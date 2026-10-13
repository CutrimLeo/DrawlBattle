# Implantação

## Processo Node.js

Use Node.js 22.12 ou superior. Prepare dependências, banco e build na pasta do projeto:

```bash
npm ci
npm run db:setup
npm run build
npm start
```

Em produção, `npm start` executa o backend compilado com `NODE_ENV=production`. O Express entrega a interface compilada, os endpoints HTTP e Socket.IO na mesma porta; o Vite não é necessário.

Configure:

```dotenv
DATABASE_URL="file:/caminho/persistente/drawbattle.db"
HOST=0.0.0.0
PORT=3001
CLIENT_ORIGIN=https://seu-dominio.example
```

No Windows, use um caminho absoluto com barras, por exemplo `file:C:/dados/drawbattle.db`. Caminhos relativos do Prisma são resolvidos em relação ao schema. O diretório do banco precisa existir e ser gravável.

Aplique as migrations em cada implantação antes de iniciar o processo. Faça backup antes de alterar o schema:

```bash
npm run db:migrate
npm run db:seed
```

Os scripts de bootstrap e os testes executam a migration com `RUST_LOG=info`, inclusive quando o processo herdou outro nível de logs. Isso contorna uma falha de migração SQLite relacionada ao nível de logs, [reportada no repositório do Prisma](https://github.com/prisma/orm/issues/29355). As migrations continuam sendo aplicadas pelo Prisma.

## Docker

O Dockerfile inclui build, Prisma Client, migrações e startup. O entrypoint aplica migrations, executa o seed idempotente e inicia o servidor.

```bash
docker build -t drawbattle .
docker run --rm -p 3001:3001 -v drawbattle-data:/data -e CLIENT_ORIGIN=http://localhost:3001 drawbattle
```

Acesse http://localhost:3001. O container usa `HOST=0.0.0.0`, `NODE_ENV=production` e `DATABASE_URL=file:/data/drawbattle.db`. O volume `drawbattle-data` conserva resultados após recriar o container. Para um domínio público, altere `CLIENT_ORIGIN` para a origem HTTPS correspondente.

## Proxy e WebSocket

Configure o proxy reverso para encaminhar HTTP e fazer upgrade de WebSocket em `/socket.io/`. Exemplo de trecho Nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 90s;
}
```

Sirva o domínio com HTTPS e mantenha a origem permitida exatamente igual ao endereço do frontend. Para expor a interface separadamente, configure `VITE_API_URL` antes do build e ajuste `CLIENT_ORIGIN` no backend.

## Operação

- Verifique `GET /api/health` após subir o servidor.
- Guarde o SQLite em armazenamento persistente e inclua o arquivo em backups consistentes.
- Execute uma instância de Node.js. Não configure várias réplicas sem distribuir estado, sessões e timers.
- Um reinício interrompe salas ativas. Resultados já persistidos permanecem disponíveis em `/api/leaderboard`.
- Defina recursos de CPU/memória conforme o número de salas e monitore os logs.
- Para jogar pela rede local, rode `npm run start:lan`, compartilhe o endereço Wi-Fi/Ethernet mostrado e mantenha o computador ligado. No Windows, `scripts/enable-lan-firewall.ps1` permite a porta 3001 apenas ao Node e a origens da sub-rede pela interface selecionada. Veja as instruções no README.

Os comandos de testes e a verificação manual de três jogadores estão no [README](../README.md).
