# Instalar e publicar o Cofre Ink

Este documento é o passo a passo de cada jeito de rodar o Cofre Ink. Não precisa ler tudo:
escolha o seu caso e leia só aquela seção.

| quero | vá para |
| --- | --- |
| usar no meu navegador, sem servidor nenhum | [Só o navegador](#só-o-navegador) |
| deixar um endereço público para outras pessoas usarem | [Só o navegador](#só-o-navegador) |
| usar no celular | [Só o navegador](#só-o-navegador) |
| um servidor meu, com contas e espaços compartilhados | [Servidor seu](#servidor-seu) |

O Cofre Ink é um endereço que você abre no navegador, e nada além disso. No celular, o
próprio navegador oferece guardar na tela inicial, e a partir daí ele abre pelo ícone e
sem internet, com os mesmos dados. Não existe aplicativo para instalar de loja nenhuma.

## O que precisa estar instalado

Para qualquer coisa que envolva compilar o código:

1. Node 22 ou mais novo. No Node 22 o servidor roda com `--experimental-sqlite`, que os
   scripts já passam sozinhos. No Node 24 não precisa de nada.
2. pnpm 12 ou mais novo, instalado com `npm install -g pnpm`.
3. Git, para clonar.

Depois de clonar:

```bash
pnpm install
```

Para desenvolver, com a interface e o servidor recarregando sozinhos:

```bash
pnpm dev
```

## Só o navegador

Este é o modo em que o banco de dados fica dentro do navegador da pessoa, num arquivo
SQLite guardado no armazenamento do site. Não existe servidor, não existe conta e nada
sai do aparelho. É também o jeito de publicar uma demonstração: são arquivos estáticos,
qualquer hospedagem serve, inclusive as gratuitas.

### Aqui não tem senha, e por quê

Neste modo não existe login. Duas consequências, e as duas importam.

A primeira é boa: **o endereço pode ser público sem expor nada seu**. Cada pessoa que
abrir recebe um Cofre Ink vazio, dentro do navegador dela. Não existe banco de dados
compartilhado para alguém entrar, porque não existe banco de dados nenhum no servidor.
O que está publicado são arquivos estáticos, os mesmos para todo mundo.

A segunda é o preço disso: **quem abrir o seu navegador vê os seus dados**, porque não
há senha para pedir. Quem protege é o que já protege a máquina: a senha do computador,
o perfil do navegador, o bloqueio do celular.

Uma senha aqui seria cadeado em porta de vidro. O arquivo do banco está no
armazenamento do site, e qualquer pessoa com o aparelho na mão e o console do navegador
aberto lê ele de qualquer jeito. Proteger de verdade seria cifrar o arquivo com uma
chave derivada de uma frase, e é uma coisa que o Cofre Ink ainda não faz. Enquanto não
fizer, o guia prefere dizer a verdade a vender uma tranca que não tranca.

Se você quer senha de verdade, é o modo [Servidor seu](#servidor-seu).

```bash
pnpm build
```

O resultado fica em `apps/web/dist`. É só isso: copie essa pasta para onde quiser.

A aplicação responde a vários endereços (`/lancamentos`, `/importar`, e assim por
diante) e uma hospedagem de arquivos não conhece nenhum deles. O build já resolve isso
dos dois jeitos que as hospedagens entendem: escreve um `404.html` que é a própria
página, e leva um arquivo `_redirects`. Na prática, a maioria das hospedagens funciona
sem configuração.

### Netlify, Cloudflare Pages, Vercel e parecidos

Comando de build `pnpm build`, pasta publicada `apps/web/dist`. O `_redirects` já está
lá dentro.

### GitHub Pages

O GitHub Pages serve um projeto dentro de uma pasta (`https://usuario.github.io/open-cofre/`),
então o build precisa saber disso:

```bash
pnpm --filter @cofre/web exec vite build --base=/open-cofre/
node scripts/buildServiceWorker.mjs
node scripts/copyFallback.mjs
```

Publique `apps/web/dist`. Com um domínio próprio apontado para o Pages, a pasta some do
endereço e aí vale o `pnpm build` normal.

### Um cabeçalho que vale a pena adicionar

A página já traz as próprias regras de segurança dentro dela, e elas funcionam em
qualquer hospedagem. Só uma não funciona vindo de dentro da página, e é a que impede o
Cofre Ink de ser aberto dentro de um quadro em outro site, que é como se engana alguém a
clicar no lugar errado. Se a sua hospedagem deixa você adicionar um cabeçalho, adicione
este:

```
X-Frame-Options: DENY
```

O servidor do Cofre Ink já manda esse cabeçalho sozinho. Isto aqui é só para quando você
publica a pasta de arquivos em outro lugar.

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

## Servidor seu

Este é o modo com contas, convites e espaços compartilhados de verdade. Uma máquina sua,
um Raspberry Pi, uma máquina virtual barata, o que você tiver.

```bash
cp .env.example .env
```

Abra o `.env` e preencha `COFRE_SECRET`. Ele assina os cookies de sessão, então precisa
ser longo e aleatório:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Ajuste também `COFRE_WEB_ORIGIN` e `COFRE_PUBLIC_URL` para o endereço real, senão os
convites saem apontando para `localhost`. Depois:

```bash
docker compose up -d
```

A interface e a API sobem juntas, na porta 4321 por padrão. Os dados ficam num volume
chamado `cofreData`, que sobrevive a uma atualização da imagem.

### A senha do primeiro acesso

Não existe senha padrão, e não existe senha escrita em lugar nenhum. Quando você abre o
endereço pela primeira vez, o servidor ainda não tem ninguém, a tela diz isso e abre já
em criar acesso: você escolhe o email e a senha ali, naquele momento. Ela é guardada
cifrada no banco de dados do seu servidor e mais nada a conhece.

O `COFRE_SECRET` do `.env` não é a sua senha. Ele assina os cookies de sessão, e trocá lo
só desconecta quem estiver conectado.

Quem abrir o endereço depois disso vê a tela de entrar. **Cadastrar continua aberto**, ou
seja, quem chegar ao endereço pode criar uma conta. A conta nova nasce vazia e não vê
nada do que é seu, mas se o seu endereço é público e você quer que só quem for convidado
entre, deixe o Cofre Ink atrás de uma autenticação do proxy ou de uma rede privada.

### O que segura um robô

Três coisas, e cada uma pega o que a anterior deixa passar.

A primeira é o **limite por endereço**: cinco tentativas de entrar por minuto e cinco
contas novas por hora. Isso para uma máquina e não para mil, e só funciona se o
`COFRE_CLIENT_IP_HEADER` estiver preenchido quando houver proxy na frente.

A segunda é o **cálculo antes da senha**, e é a que não dá para contornar com mais
endereços. O servidor entrega um desafio, o navegador procura um número que faça o hash
começar com uma quantidade de zeros, e só então a senha é lida. Achar custa um instante;
conferir custa um hash. Quem tenta mil senhas paga mil instantes. O `COFRE_PROOF_BITS`
controla quanto: dezoito é o padrão, cada bit a mais dobra o custo, zero desliga.

Nada disso sai do seu servidor e ninguém precisa ler letras tortas numa imagem.

A terceira é opcional e é a única que fala com gente de fora: o **Turnstile da
Cloudflare**. Preencha `COFRE_TURNSTILE_SITE_KEY` e `COFRE_TURNSTILE_SECRET` e o widget
aparece na tela de entrar, somando ao cálculo em vez de substituir. Vem desligado de
propósito: ligar significa contar à Cloudflare o endereço de todo mundo que abre a sua
tela de entrar, e essa é uma escolha sua e não um padrão herdado.

O reCAPTCHA do Google não está aqui pelo mesmo motivo, com o agravante de que ele existe
para reconhecer a pessoa entre visitas. Se você quiser mesmo assim, é uma troca do
endereço e do formato da resposta em `apps/server/src/gate.ts`.

Para usar PostgreSQL no lugar do SQLite, descomente o serviço `database` no
`compose.yaml` e aponte `COFRE_DATABASE` para ele.

Se houver um proxy na frente (Nginx, Caddy, Traefik), preencha `COFRE_CLIENT_IP_HEADER`
com o cabeçalho que ele usa. Sem isso, o limite de tentativas de entrar conta o mundo
inteiro como se fosse uma pessoa só.

### Fazer backup

O arquivo do banco está dentro do volume. Com o container parado:

```bash
docker compose stop
docker run --rm -v cofre_cofreData:/data -v ${PWD}:/saida alpine tar czf /saida/cofre.tar.gz /data
docker compose start
```

Também dá para exportar tudo pela própria interface, em Dados, que gera um arquivo que
qualquer instalação do Cofre Ink consegue ler de volta.

## Onde ficam os dados

| modo | onde |
| --- | --- |
| navegador | armazenamento do site, no perfil daquele navegador |
| instalado pelo navegador | o mesmo armazenamento, do mesmo navegador |
| servidor seu | o arquivo SQLite ou o PostgreSQL que você apontou |

Nos dois primeiros, limpar os dados do site apaga o banco. Exporte um backup antes de
mexer nisso, em Dados, Exportar tudo.

O Cofre Ink não precisa de nenhuma manutenção. O histórico que ele usa para sincronizar é
compactado sozinho, no máximo uma vez por dia, e nenhum lançamento seu muda com isso:
some só a versão intermediária de linhas com mais de trinta dias, que nada no produto
lê. No servidor isso acontece de hora em hora, no navegador logo depois que a primeira
tela aparece.

## Uma demonstração pública

O build do navegador já serve: é estático, não fala com servidor nenhum e o primeiro
acesso oferece preencher com dados de exemplo, que vem marcado. Publique `apps/web/dist`
em qualquer lugar da primeira seção.

Vale lembrar de uma coisa antes de divulgar o endereço: cada visitante cria o próprio
banco no próprio navegador. Ninguém vê os dados de ninguém, e ninguém consegue apagar os
dados de outro. Não existe nada para moderar.
