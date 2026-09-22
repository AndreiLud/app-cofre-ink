# Instalar, publicar e empacotar o Cofre

Este documento é o passo a passo de cada jeito de rodar o Cofre. Não precisa ler tudo:
escolha o seu caso e leia só aquela seção.

| quero | vá para |
| --- | --- |
| usar no meu navegador, sem servidor nenhum | [Só o navegador](#só-o-navegador) |
| deixar um endereço público para outras pessoas usarem | [Só o navegador](#só-o-navegador) |
| um servidor meu, com contas e espaços compartilhados | [Servidor seu](#servidor-seu) |
| o Cofre no celular | [No celular](#no-celular) |
| um programa de verdade, com ícone e janela | [Aplicativo de computador](#aplicativo-de-computador) |

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

### Nginx

```nginx
server {
    root /var/www/cofre;
    index index.html;

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
qualquer instalação do Cofre consegue ler de volta.

## No celular

O Cofre é instalável direto do navegador, e depois disso é um aplicativo: ícone na tela
inicial, sem barra de endereço, e abre sem internet. Os dados são os mesmos do navegador
em que foi instalado.

**Android, Chrome ou Edge.** Abra o endereço, e a própria tela de ajustes do Cofre
oferece o botão de instalar quando o navegador avisa que dá. Se você dispensou o aviso,
use o menu do navegador, Adicionar à tela inicial.

**iPhone, Safari.** Não existe botão: toque em compartilhar e depois em Adicionar à Tela
de Início. O Cofre explica isso na tela quando detecta um iPhone.

Depois de instalado, ele abre sem conexão nenhuma. Isso é testado a cada build, em
`apps/web/e2e/installable.spec.ts`: o teste corta a rede e recarrega a página.

Existe também um aplicativo nativo, para Android e iOS, feito do mesmo código. Ele está
na seção seguinte, junto com o de computador, porque é o mesmo projeto.

## Aplicativo de computador

`apps/desktop` embrulha exatamente este mesmo build numa janela do sistema, com Tauri 2.
Não existe segunda interface nem segundo banco de dados: é o mesmo SQLite, guardado
agora na pasta deste aplicativo em vez de ficar num perfil de navegador.

### O que falta instalar

O restante do repositório não precisa de nada além do Node. Esta parte precisa:

1. **Rust**, por [rustup.rs](https://rustup.rs).
2. **Windows:** as ferramentas de compilação da Microsoft, com os componentes MSVC e o
   SDK do Windows. O instalador está em
   [aka.ms/vs/17/release/vs_BuildTools.exe](https://aka.ms/vs/17/release/vs_BuildTools.exe).
   O WebView2 já vem no Windows 11.
3. **Linux:** `libwebkit2gtk-4.1-dev`, `librsvg2-dev`, `build-essential`, `curl`,
   `wget`, `file`, `libxdo-dev`, `libssl-dev`, `libayatana-appindicator3-dev`.
4. **macOS:** as ferramentas de linha de comando do Xcode (`xcode-select --install`).

Para conferir o que está faltando na sua máquina:

```bash
pnpm --filter @cofre/desktop exec tauri info
```

### Rodar e empacotar

```bash
pnpm --filter @cofre/desktop app
pnpm --filter @cofre/desktop app:build
```

O primeiro abre a janela com a interface recarregando sozinha, igual ao `pnpm dev`. O
segundo gera o instalador do seu sistema, dentro de
`apps/desktop/src-tauri/target/release/bundle`.

### Android

Além do Rust, precisa do Android Studio com o SDK e o NDK, de um JDK 17 ou mais novo, e
das variáveis `ANDROID_HOME` e `NDK_HOME` apontando para eles.

```bash
pnpm --filter @cofre/desktop android:start
pnpm --filter @cofre/desktop android
pnpm --filter @cofre/desktop android:build
```

O primeiro comando cria o projeto Android em `apps/desktop/src-tauri/gen/android`, que
não fica no repositório justamente porque é gerado.

### iOS

Só em um Mac, com Xcode instalado e uma conta de desenvolvedor da Apple para assinar.

```bash
pnpm --filter @cofre/desktop ios:start
pnpm --filter @cofre/desktop ios
pnpm --filter @cofre/desktop ios:build
```

### O que não foi compilado aqui

Sendo direto: o `apps/desktop` foi escrito numa máquina sem Rust, sem as ferramentas da
Microsoft e sem o SDK do Android. A configuração foi validada pela própria ferramenta do
Tauri, que a lê e recusa qualquer campo que não exista, e os ícones foram decodificados
pelo próprio Windows. A compilação não foi feita e portanto não foi verificada.

Se a janela abrir vazia na primeira vez, o lugar para olhar é a linha `csp` em
`apps/desktop/src-tauri/tauri.conf.json`: ela é a única coisa ali que pode bloquear o
carregamento da página sem dar erro visível.

Uma coisa não funciona dentro do aplicativo e a tela avisa: entrar no Dropbox ou no
Google Drive. Esses serviços só devolvem a pessoa para um endereço que começa com
`http`, e o aplicativo instalado tem um endereço próprio. Conecte o serviço uma vez pelo
navegador, ou use um arquivo, um WebDAV ou um servidor seu, que funcionam ali do mesmo
jeito.

## Onde ficam os dados

| modo | onde |
| --- | --- |
| navegador | armazenamento do site, no perfil daquele navegador |
| instalado do navegador | o mesmo armazenamento, do mesmo navegador |
| aplicativo de computador | pasta de dados do aplicativo, no seu usuário |
| aplicativo de celular | pasta de dados do aplicativo, no aparelho |
| servidor seu | o arquivo SQLite ou o PostgreSQL que você apontou |

Nos quatro primeiros, limpar os dados do site apaga o banco. Exporte um backup antes de
mexer nisso, em Dados, Exportar tudo.

## Uma demonstração pública

O build do navegador já serve: é estático, não fala com servidor nenhum e o primeiro
acesso oferece preencher com dados de exemplo, que vem marcado. Publique `apps/web/dist`
em qualquer lugar da primeira seção.

Vale lembrar de uma coisa antes de divulgar o endereço: cada visitante cria o próprio
banco no próprio navegador. Ninguém vê os dados de ninguém, e ninguém consegue apagar os
dados de outro. Não existe nada para moderar.
