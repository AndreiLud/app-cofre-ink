# Publicar

Escolha o modo e leia só aquela seção. Não precisa do resto.

| quero | vá para |
| --- | --- |
| usar no meu navegador, sem servidor nenhum | [Só o navegador](#so_o_navegador) |
| deixar um endereço público para outras pessoas usarem | [Só o navegador](#so_o_navegador) |
| usar no celular | [Só o navegador](#so_o_navegador) |
| um servidor meu, com contas e espaços compartilhados | [Um servidor seu](#um_servidor_seu) |

O Cofre Ink é um endereço que você abre no navegador, e nada além disso. No celular, o
próprio navegador oferece guardar na tela inicial, e a partir daí ele abre pelo ícone,
sem internet, com os mesmos dados. Não existe aplicativo para instalar de loja nenhuma.

## O que precisa estar instalado

1. **Node 22 ou mais novo.** No Node 22 o servidor roda com `--experimental-sqlite`,
   que os scripts já passam sozinhos. No Node 24 não precisa de nada.
2. **pnpm 12 ou mais novo.** `corepack enable` basta, já que a versão exata está
   declarada em `packageManager`.
3. **Git**, para clonar.

```bash
pnpm install
pnpm dev        # a interface na 5174, e a API ao lado dela
```

A interface é o produto inteiro e não precisa de mais nada. A API se recusa a subir sem
o `COFRE_SECRET`, e nada lê o `.env` fora do Docker, então exporte ele no terminal antes
se quiser o modo servidor localmente. O modo navegador nunca pede.

<a id="so_o_navegador"></a>

## Só o navegador

O banco de dados fica dentro do navegador da própria pessoa, num arquivo SQLite no
armazenamento daquele site. Não existe servidor, não existe conta e nada sai do
aparelho. É também o jeito de publicar uma demonstração: são arquivos estáticos, e
qualquer hospedagem serve, inclusive as gratuitas.

### Aqui não tem senha, e por quê

Duas consequências, e as duas importam.

**A boa: o endereço pode ser público sem expor nada seu.** Cada pessoa que abrir recebe
um Cofre Ink vazio dentro do navegador dela. Não existe banco de dados compartilhado
para alguém entrar, porque não existe banco de dados nenhum no servidor. O que está
publicado são arquivos estáticos, os mesmos para todo mundo.

**O preço: quem abrir o seu navegador vê os seus dados**, porque não há senha para
pedir. Quem protege é o que já protege a máquina: a senha do computador, o perfil do
navegador, o bloqueio do celular.

Uma senha aqui seria cadeado em porta de vidro. O arquivo do banco está no
armazenamento do site, e qualquer pessoa com o aparelho na mão e o console aberto lê
ele de qualquer jeito. Proteger de verdade seria cifrar o arquivo com uma chave
derivada de uma frase, e o Cofre Ink ainda não faz isso. Enquanto não fizer, este guia
prefere dizer a verdade a vender uma tranca que não tranca.

Se você quer senha de verdade, é [um servidor seu](#um_servidor_seu).

### Compilar

```bash
pnpm build
```

O resultado fica em `apps/web/dist`. É só isso: copie essa pasta para onde quiser.

A aplicação responde a vários endereços (`/lancamentos`, `/importar`, e assim por
diante) e uma hospedagem de arquivos não conhece nenhum deles. O build escreve um
`404.html` que é a própria página, então uma hospedagem que não acha nada manda a
aplicação e o roteador lê o endereço. A maioria funciona sem configuração nenhuma.

### Netlify, Vercel e parecidos

Comando de build `pnpm build`, pasta publicada `apps/web/dist`. O `_headers` já está lá
dentro e não precisa de configuração.

A Netlify e a Cloudflare Pages leem um arquivo `_redirects`, que diz a mesma coisa que o
`404.html` acima, mas com status 200 em vez de 404. O build não escreve um, porque a
Cloudflare Workers analisa esse arquivo e recusa a única regra que ele teria. Se você
publicar numa dessas duas e quiser o 200, adicione um arquivo `_redirects` na pasta
publicada com esta linha dentro:

```
/*    /index.html   200
```

### Cloudflare Workers

A Workers publica a partir de um arquivo de configuração, e não de dois campos num
painel, e esse arquivo é o `wrangler.jsonc` na raiz deste repositório. Não há código de
Worker dentro dele: isto é uma pasta de arquivos, então a Cloudflare serve os arquivos e
responde qualquer endereço que não seja um deles com a própria página.

O build também está declarado nesse arquivo, então o `wrangler deploy` compila antes de
enviar e o painel não precisa de comando de build nenhum. Um clone deste repositório
publica do mesmo jeito, que é o motivo de isso morar aqui.

Uma coisa não está neste repositório e não tem como estar: **o `name` precisa ser o
nome do Worker** a que o repositório está conectado. Com um nome diferente, um deploy
cria em silêncio um segundo Worker e o endereço continua apontando para o primeiro.

### GitHub Pages

O Pages serve um projeto de dentro de uma pasta
(`https://usuario.github.io/app-cofre-ink/`), então o build precisa saber disso:

```bash
pnpm --filter @cofre/web exec vite build --base=/app-cofre-ink/
node scripts/buildServiceWorker.mjs
node scripts/copyFallback.mjs
```

Publique `apps/web/dist`. Com um domínio próprio apontado para o Pages, a pasta some do
endereço e aí vale o `pnpm build` normal.

Existe um workflow para isso em `.github/workflows/demo.yml`, que roda só quando alguém
aperta o botão na aba Actions.

### O cabeçalho que a página não consegue mandar sozinha

A página já traz as próprias regras de segurança dentro dela, e elas funcionam em
qualquer hospedagem. Só uma não funciona vindo de dentro da página, e é a que impede o
Cofre Ink de ser aberto dentro de um quadro em outro site, que é como se engana alguém a
clicar no lugar errado.

Por isso o build leva um arquivo `_headers`, que a Cloudflare e a Netlify leem e
aplicam:

```
/*
  X-Frame-Options: DENY
```

O servidor do Cofre Ink manda o cabeçalho sozinho. Uma hospedagem que não lê nem esse
arquivo nem o servidor, como Nginx ou Caddy, se configura à mão, como abaixo.

### Nginx

```nginx
server {
    root /var/www/cofre;
    index index.html;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Os arquivos com um código no nome nunca mudam.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Caddy

```caddyfile
cofre.seudominio.com {
    root * /var/www/cofre
    try_files {path} /index.html
    file_server
    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
    }
}
```

### Uma pasta na sua máquina

Para ver o build localmente, sem publicar nada:

```bash
pnpm --filter @cofre/web exec vite preview --port 5174
```

<a id="um_servidor_seu"></a>

## Um servidor seu

Contas, convites e espaços compartilhados de verdade. Uma máquina sua, um Raspberry Pi,
uma máquina virtual barata, o que você tiver.

### Sem clonar nada

Toda versão publica uma imagem, construída para Intel e para ARM, então um Raspberry Pi
roda a mesma:

```bash
docker run -d --name cofre -p 4321:4321 -v cofre:/data \
  -e COFRE_SECRET=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))") \
  -e COFRE_PUBLIC_URL=https://seu.endereco \
  -e COFRE_WEB_ORIGIN=https://seu.endereco \
  ghcr.io/andreilud/app-cofre-ink:latest
```

Fixe a versão em vez de seguir o `latest` se quiser decidir quando atualizar. [O
changelog](../../CHANGELOG.md) diz o que mudou em cada uma.

### A partir do código

```bash
cp .env.example .env
```

Preencha `COFRE_SECRET`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Essa é a única linha que precisa ser preenchida. Todo o resto do arquivo está
comentado, e uma linha comentada cai no padrão que o container já carrega.

**No momento em que o servidor for alcançável por algo que não seja `localhost`,
ajuste os dois endereços para o real.** Eles estão comentados no exemplo exatamente por
isso: o que estiver no `.env` vence o `compose.yaml`, então um valor deixado ali sem
querer é um valor que passa por cima do container.

```
COFRE_WEB_ORIGIN=https://cofre.suacasa.com
COFRE_PUBLIC_URL=https://cofre.suacasa.com
```

O `COFRE_WEB_ORIGIN` é de onde a interface é servida, e a API recusa requisição que não
venha dele nem do endereço do próprio servidor. O `COFRE_PUBLIC_URL` é onde este
servidor responde, visto de fora.
O container serve a própria interface, então numa máquina só os dois são o mesmo
endereço. No padrão, os dois são `http://localhost:4321`, que está certo enquanto você
experimenta na máquina em que ele roda e está errado no instante em que outra pessoa
precisa alcançar: todo link de convite é montado com o primeiro deles.

```bash
docker compose up -d
```

A interface e a API sobem juntas, na porta 4321 por padrão. Os dados ficam num volume
chamado `cofreData`, que sobrevive a uma atualização da imagem, e o container escreve em
`/data/cofre.db`. A linha de boot diz qual arquivo foi aberto, e vale ler uma vez: um
caminho que não começa com `/data` é um banco dentro do container, que uma atualização
apaga.

### PostgreSQL no lugar do SQLite

São três coisas para descomentar, e deixar uma de fora para o arquivo inteiro em vez de
metade dele: o Compose recusa um projeto em que um serviço monta um volume que ninguém
declara.

1. O serviço `database` no `compose.yaml`.
2. O volume `cofrePostgres`, no fim do mesmo arquivo. É esse que passa batido, porque
   fica longe do serviço que o usa.
3. O `POSTGRES_PASSWORD` no `.env`, que é a senha com que o banco é criado.

Depois aponte o servidor para ele, no mesmo `.env`:

```
POSTGRES_PASSWORD=alguma coisa longa
COFRE_DATABASE=postgres://cofre:${POSTGRES_PASSWORD}@database:5432/cofre
```

O Compose expande isso, então a senha é escrita uma vez só e as duas não têm como
divergir.

O host é `database`, o nome do serviço, porque é nisso que o endereço resolve de dentro
da rede que o Compose cria. Não é `localhost`, que lá dentro é o container perguntando
para si mesmo.

Repare que a receita de backup mais abaixo copia o volume `cofreData`, que neste caminho
não tem nada. Um PostgreSQL se copia com `pg_dump`, ou pela própria interface, em Dados,
que funciona igual com qualquer banco embaixo.

### Como é a primeira visita

O endereço serve a interface, e a interface ainda não sabe que está falando com o seu
servidor, então ela abre na pergunta que faz para todo mundo:
**Como você quer usar o Cofre Ink?**

Escolha **Sincronizar entre os meus aparelhos**, depois **Ver as duas formas**, depois
**Um servidor meu**. Ele pede o **Endereço do servidor**, que é o endereço que você
acabou de digitar, e o **Conectar** aponta este navegador para lá. A escolha fica
guardada, então a pergunta é feita uma vez só.

### A senha do primeiro acesso

Não existe senha padrão, e não existe senha escrita em lugar nenhum. Depois que este
navegador está apontado para o seu servidor, o servidor ainda não tem ninguém, a tela
diz isso e abre já em criar acesso: você escolhe o email e a senha ali, naquele momento.
Ela é guardada cifrada no banco do seu servidor e mais nada a conhece.

O `COFRE_SECRET` não é a sua senha. Ele assina os cookies de sessão, e trocá lo só
desconecta quem estiver conectado.

Quem abrir o endereço depois disso vê a tela de entrar. **Cadastrar continua aberto**,
ou seja, quem chegar ao endereço pode criar uma conta. A conta nova nasce vazia e não vê
nada do que é seu, mas se o seu endereço é público e você quer que só quem for convidado
entre, deixe o Cofre Ink atrás de uma autenticação do proxy ou de uma rede privada.

### Atrás de um proxy

Preencha `COFRE_CLIENT_IP_HEADER` com o cabeçalho que o seu proxy usa, normalmente
`x-forwarded-for`. Sem isso, o limite de tentativas de entrar conta o mundo inteiro como
se fosse uma pessoa só.

### Usar a interface publicada com o seu servidor

Se você usar a interface de app.cofre.ink em vez da que o seu container serve, duas
coisas precisam ser verdade ou ninguém continua logado:

1. O `COFRE_WEB_ORIGIN` é aquele endereço.
2. O seu servidor responde em **https**, com certificado de verdade.

Para o navegador são dois sites diferentes, e um cookie de sessão só viaja entre sites
diferentes quando é marcado para isso, o que um navegador só guarda em https. Servir a
interface pelo próprio container dispensa tudo isso.

### Fazer backup

O arquivo do banco está dentro do volume. Com o container parado:

```bash
docker compose stop
docker run --rm -v cofre_cofreData:/data -v ${PWD}:/saida alpine tar czf /saida/cofre.tar.gz /data
docker compose start
```

Também dá para exportar tudo pela própria interface, em Dados, que gera um arquivo que
qualquer instalação do Cofre Ink lê de volta.

## Onde ficam os dados

| modo | onde |
| --- | --- |
| navegador | armazenamento do site, no perfil daquele navegador |
| guardado na tela inicial | o mesmo armazenamento, do mesmo navegador |
| servidor seu | o arquivo SQLite ou o PostgreSQL que você apontou |

Nos dois primeiros, limpar os dados do site apaga o banco. Exporte um backup antes de
mexer nisso, em Dados, Exportar tudo.

O Cofre Ink não precisa de manutenção. O histórico que ele usa para sincronizar é
compactado sozinho, no máximo uma vez por dia, e nenhum lançamento seu muda com isso:
some só a versão intermediária de linhas com mais de trinta dias, que nada no produto
lê. No servidor isso acontece de hora em hora, no navegador logo depois que a primeira
tela aparece.

## Uma demonstração pública

O build do navegador já é uma: é estático, não fala com servidor nenhum, e o primeiro
acesso oferece preencher com dados de exemplo, que vêm marcados. Publique
`apps/web/dist` em qualquer lugar da primeira seção.

Uma coisa antes de divulgar o endereço: cada visitante cria o próprio banco no próprio
navegador. Ninguém vê os dados de ninguém, e ninguém consegue apagar os dados de outro.
Não existe nada para moderar.
