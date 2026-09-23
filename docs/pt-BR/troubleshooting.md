# Problemas

As falhas que acontecem de verdade, e o que cada uma quer dizer.

## O servidor não sobe

### `the configuration is not complete`

Ele diz qual configuração e por quê. A mais comum é o `COFRE_SECRET` faltando ou com
menos de 32 caracteres. Isso é deliberado: um segredo faltando para o processo em vez de
aparecer como um erro estranho três requisições depois.

### `COFRE_TURNSTILE_SECRET is set without COFRE_TURNSTILE_SITE_KEY`

Ou o contrário. As duas ou nenhuma. Com só o segredo, todo login seria recusado por um
captcha que ninguém viu, e com só a chave do site as pessoas resolveriam um quebra
cabeça que nada confere. Preencha as duas, ou esvazie as duas.

### `Cannot find package '@cofre/...'`

Um container construído a partir de uma imagem incompleta. O estágio de execução copia o
`package.json` e o `src` de cada pacote que o servidor importa, e o Node lê o TypeScript
direto, então um pacote faltando não é um build que falha, é um container que sobe e
morre. Reconstrua com `docker compose build --no-cache`.

### SQLite é um recurso experimental

É um aviso, não um erro, no Node 22. Os scripts já passam a flag. O Node 24 não diz
nada.

## Ninguém continua logado

**A causa mais provável de longe: a interface e o servidor estão em sites diferentes.**

Se a interface está num endereço e o seu servidor em outro, e os dois não são o mesmo
domínio, o cookie de sessão só viaja quando é escrito para isso, e um navegador só
guarda um cookie desses em https. Confira as três coisas:

1. O `COFRE_WEB_ORIGIN` é o endereço de onde a interface é realmente servida.
2. O `COFRE_PUBLIC_URL` começa com `https://`.
3. O certificado é de verdade, não autoassinado.

O sintoma é exato: entrar funciona, e a chamada seguinte volta `401`. Se você serve a
interface pelo mesmo container, o problema não é este.

Segunda possibilidade: o `COFRE_SECRET` mudou. Isso desconecta todo mundo, por desenho.

## O login é recusado

### `{"error": "proofRequired"}`

O portão na frente da senha não foi respondido. A interface faz isso sozinha, então ver
isto significa ou alguém que não é a interface, ou um desafio que venceu enquanto o
formulário ficou aberto. Recarregar a página resolve o segundo caso.

### `{"error": "captchaRequired"}`

O Turnstile está ligado e a Cloudflare não aceitou a resposta. Confira se o segredo
pertence à mesma chave de site, e se o servidor consegue alcançar a Cloudflare.

### Tentativas demais

Cinco tentativas de entrar por minuto e cinco contas novas por hora, por endereço.
**Atrás de um proxy sem `COFRE_CLIENT_IP_HEADER`, todo mundo conta como um só**, então o
erro de uma pessoa tranca todas. Preencha com o cabeçalho que o seu proxy usa.

## O modo navegador

### A tela diz que o banco está ocupado

O mecanismo que persiste no navegador toma o arquivo com exclusividade, então uma
segunda aba não consegue abrir. Feche a outra aba. Dizer isso é muito melhor do que
abrir um banco vazio, que pareceria exatamente com perder tudo.

### Ele diz que os dados não estão sendo guardados

O navegador não concedeu armazenamento persistente, o que significa que ele pode limpar
o banco sob pressão. Guardar a página na tela inicial costuma render a concessão.
Exporte um backup de qualquer forma.

### Sumiu tudo depois de limpar os dados de navegação

No modo navegador o banco é o armazenamento do site. Limpar os dados do site apaga ele,
e não existe cópia em lugar nenhum, porque nada nunca foi enviado a lugar nenhum. É a
troca que este modo faz. Exporte em Dados, Exportar tudo, antes de mexer nisso.

### Um endereço de dentro do aplicativo responde 404

Uma hospedagem de arquivos que não conhece as rotas. O build leva o `404.html`, que é a
própria página, e a maioria das hospedagens manda ele. Se a sua não manda, aponte todo
endereço que não seja um arquivo para `index.html`. Há exemplo de Nginx, de Caddy e de
Netlify em [Publicar](deploy.md).

### Uma versão antiga fica aparecendo

O service worker serve o que guardou. Todo build tem um nome de cache novo e o antigo é
apagado quando o worker novo assume, então isso se resolve na segunda carga. Para
forçar: abra a página, limpe os dados do site, carregue de novo. Note que no modo
navegador isso também apaga o banco, então exporte antes.

## Importar um extrato

### O leitor não achou lançamento nenhum

O arquivo tem um formato que o leitor não conhece, ou é um PDF feito de imagens em vez
de texto. O leitor de PDF lê texto e não reconhece fotografias dele.

### Todos os valores estão com o sinal trocado

O leitor mantém o sinal que o extrato usa, de propósito, porque virar o sinal antes de a
pessoa olhar é como um crédito vira um débito. A tela de revisão é onde isso se corrige,
e a correção fica guardada para aquele formato de arquivo.

### Os mesmos lançamentos entraram duas vezes

A tela de revisão compara o que o espaço já tem em volta dos dias que o arquivo cobre e
marca as repetições. Se foram gravados assim mesmo, selecione na lista e remova a
seleção numa ação só.

## Sincronização

### `{"error": "profileBelongsToAnAccount"}`

Um aparelho tentou escrever lançamentos em nome de alguém que tem conta naquele
servidor. Isso é recusado por desenho: é a regra que impede um membro de um espaço
compartilhado de colocar palavras na boca de outro. Entre como aquela pessoa naquele
aparelho.

### Entradas foram recusadas sem erro

A resposta de uma sincronização traz `refused`, a contagem de entradas que não foram
gravadas porque quem chamou não podia falar pelo autor delas. É a mesma regra, contada
em vez de lançada.

### Um espaço chegou mas não tem nada dentro

Um espaço é adotado na chegada só quando não tem ninguém. Um espaço que já tem membros
pertence a eles, e empurrar para dentro dele exige ser um deles.

## Desenvolvimento

### O `pnpm check` falha na regra de escrita

Um hífen, um travessão ou um traço em texto escrito para pessoas. Use vírgula, dois
pontos, ponto, parênteses, ou reescreva. Dentro de um trecho de código ou do destino de
um link é permitido. A mensagem diz o arquivo e a coluna.

### O `pnpm check` falha nas traduções

Uma chave existe num idioma e não no outro, ou o nome do produto foi escrito em vez de
ser deixado para o `{{app}}`. Os dois idiomas têm que ter as mesmas chaves.

### O Biome reclama de uma função chamada `useAlgumaCoisa`

O Biome trata qualquer nome começado por `use` como um hook do React e aplica as regras
de hooks a ele. Renomeie.

### Um teste passa aqui e falha na CI

A CI roda no Node 22 e no Node 24. A causa de sempre é alguma coisa que se comporta
diferente no SQLite que vem com cada um.
