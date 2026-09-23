# Configuração

Só o servidor lê alguma coisa disto. O modo navegador não lê ambiente nenhum: tudo o
que ele precisa é escolhido na tela e fica naquele navegador.

Copie o `.env.example`, que é comentado linha por linha, para `.env`. Ele é lido uma vez
no boot e conferido antes de qualquer coisa começar, então uma configuração faltando ou
contraditória para o processo em vez de aparecer como um erro estranho três requisições
depois.

## Cada variável

### `COFRE_SECRET`

**Obrigatória. No mínimo 32 caracteres.** Assina os cookies de sessão. Sem ela ninguém
continua logado, e com uma fraca qualquer um forja uma sessão.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Trocá la desconecta todo mundo. Nunca comite.

### `COFRE_DATABASE`

Onde os dados ficam. Padrão `./data/cofre.db`.

| valor | o que acontece |
| --- | --- |
| um caminho terminado em `.db` | SQLite, um arquivo. Certo para um servidor em casa |
| `postgres://usuario:senha@host:5432/nome` | PostgreSQL, com row level security em cima |

A linha de boot diz qual banco está em uso, com a senha retirada do endereço antes de
ser impressa.

### `COFRE_PORT`

Onde a API escuta. Padrão 4321.

### `COFRE_WEB_ORIGIN`

De onde a interface é servida. A API aceita requisições de outra origem vindas daqui e
de `COFRE_PUBLIC_URL`, e monta os links de convite com isto.

**É esta que decide como o cookie de sessão é escrito.** Se for um site diferente de
`COFRE_PUBLIC_URL`, o cookie é escrito para viajar entre os dois, e o servidor precisa
responder em https para um navegador guardá lo. Veja
[Autenticação](authentication.md).

### `COFRE_PUBLIC_URL`

O endereço em que este servidor responde, visto de fora. Atrás de um proxy, é o
endereço público, não a porta dentro do container.

### `COFRE_STATIC_DIR`

Onde está a interface compilada, quando o mesmo processo a serve. O container define
como `/app/apps/server/public`. Deixe vazio durante o desenvolvimento, quando o Vite
serve a interface.

Com ela definida, todo endereço que não é um arquivo cai na página, porque as rotas
vivem no navegador. Todo endereço que começa com `/api` não cai.

### `COFRE_CLIENT_IP_HEADER`

O nome do cabeçalho que um proxy reverso preenche com o endereço de quem realmente
chamou, por exemplo `x-forwarded-for`.

**Deixe vazio quando não houver nada na frente.** Um cabeçalho que qualquer um pode
preencher é um cabeçalho sobre o qual qualquer um pode mentir, e acreditar nele sem
proxy na frente deixa quem chama trocar de endereço aparente a cada tentativa. Com proxy
e sem isto, todo mundo atrás dele conta como um só e o limite não protege ninguém.

### `COFRE_PROOF_BITS`

Quanto trabalho quem chama faz antes de este servidor ler uma senha, em zeros à
esquerda. Padrão 18, cerca de um segundo num navegador. Vinte é quatro vezes o custo,
dezesseis é um quarto. Zero desliga, que é para quem tem o próprio portão na frente. O
máximo é 26.

### `COFRE_TURNSTILE_SITE_KEY` e `COFRE_TURNSTILE_SECRET`

Um widget Turnstile da Cloudflare em cima daquele trabalho. Desligado a menos que as
duas estejam preenchidas.

**As duas ou nenhuma, e o servidor se recusa a subir com uma só.** Com só o segredo,
todo login é recusado por um captcha que ninguém viu. Com só a chave do site, as
pessoas resolvem um quebra cabeça que nada confere.

A chave do site é pública por definição: é com ela que o widget é desenhado. O segredo
nunca sai do servidor.

### `NODE_ENV`

`production` num servidor. Em `test` o limite de tentativas fica desligado e a prova de
trabalho cai para oito bits, para que uma suíte não gaste minutos provando uma
aritmética que tem teste próprio.

## O que o container repassa

O `compose.yaml` repassa toda configuração opcional, preenchida ou não, então o que
chega para uma que ninguém preencheu é uma string vazia. Um valor vazio é lido como uma
configuração que ninguém definiu, em todos os casos, então uma linha em branco no `.env`
se comporta como uma linha ausente.

## Limites que não são configuração

Escritos em código de propósito, onde podem ser lidos ao lado do que protegem.

| limite | onde | valor |
| --- | --- | --- |
| corpo da requisição | `apps/server/src/app.ts` | 25MB |
| lançamentos numa importação | o mesmo | 3000 |
| entradas num push de sincronização | o mesmo | 2000 |
| lançamentos numa edição em massa | o mesmo | 500 |
| tentativas de entrar | `apps/server/src/auth.ts` | 5 por minuto |
| contas novas | o mesmo | 5 por hora |
| qualquer outra coisa | o mesmo | 60 por minuto |
