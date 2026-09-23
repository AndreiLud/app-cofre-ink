# Autenticação

## O modo navegador não tem, de propósito

Não existe conta, não existe senha e nada trafega pela rede. O banco é um arquivo
naquele navegador, alcançável por quem estiver com ele na mão. Isso é dito com todas as
letras na porta de entrada, em vez de escondido, porque a versão honesta deste modo é:
**quem abrir o seu navegador vê os seus dados.**

Um endereço público não expõe nada. Cada pessoa que abre recebe um Cofre Ink vazio
dentro do navegador dela, e quem publicou não lê nada.

Mais de uma pessoa pode usar um navegador. Os perfis são separados, cada um com os
próprios espaços, e trocar é um item de menu. Isso é separação, não segurança: nada
impede uma pessoa de trocar para outro perfil.

## O modo servidor

A identidade pertence ao Better Auth. O Cofre Ink mantém a própria linha em `users` em
passo com ele, porque todo espaço e todo lançamento apontam para aquela linha.

**Email e senha**, com no mínimo dez caracteres. Este projeto não envia email nenhum, e
é por isso que a verificação de endereço está desligada: pedir a alguém que confirme um
endereço para o qual ninguém consegue entregar trancaria a pessoa fora dos próprios
dados.

**Sem OAuth e sem provedor de identidade de terceiros.** Não há nada para configurar, e
ninguém fora do servidor fica sabendo quem entrou.

### O que guarda a porta

Três coisas, nesta ordem.

1. **Um limite por endereço.** Cinco tentativas de entrar por minuto, cinco contas
   novas por hora, sessenta de qualquer outra coisa. Está escrito com todas as letras em
   `apps/server/src/auth.ts`, onde pode ser lido e mudado, em vez de ficar num padrão
   que depende de a biblioteca achar que está em produção.
2. **Um cálculo antes da senha, na frente das duas rotas que valem a pena atacar.**
   Antes de ler uma senha, o servidor pede a quem chamou que encontre um hash com uma
   quantidade de zeros à esquerda. Dezoito bits é cerca de um segundo num navegador e
   cerca de um segundo em cada tentativa de qualquer coisa testando senhas em massa. O
   limite acima conta por endereço, e quem ataca consegue mais endereços. Este aqui não
   se contorna assim. O desafio é assinado pelo servidor e carrega o próprio prazo,
   então o servidor não guarda estado nenhum para ele, e um sal já gasto não pode ser
   gasto duas vezes.
3. **Opcionalmente, um widget Turnstile da Cloudflare**, desligado a menos que as duas
   chaves estejam preenchidas. Vem desligado porque é um terceiro sendo informado do
   endereço de todo mundo que abre a tela de entrar de um servidor privado. Isso é uma
   escolha, não uma herança.

Atrás de um proxy reverso, nomeie o cabeçalho que ele preenche em
`COFRE_CLIENT_IP_HEADER`. Sem isso, todo mundo atrás daquele proxy conta como um só e o
limite não protege ninguém. Ele nunca é presumido, porque um cabeçalho que qualquer um
pode preencher é um cabeçalho sobre o qual qualquer um pode mentir.

### O cookie de sessão

Assinado com `COFRE_SECRET`, `httpOnly`, e o servidor define o resto a partir de onde a
interface mora.

**Quando a interface e o servidor são o mesmo site**, o cookie é Lax, que é o que torna
uma sessão imune a ser montada a partir da página de outra pessoa.

**Quando eles são sites genuinamente diferentes**, que é o que acontece se você usar a
interface publicada em app.cofre.ink com um servidor seu, o cookie é escrito para
viajar. Um navegador não guarda um cookie desses sem certificado, então o servidor tem
que responder em https. Em http puro nada muda, porque um cookie marcado como seguro num
servidor http é descartado na chegada, o que é uma falha pior do que a que ele estaria
corrigindo.

O mesmo host e um subdomínio dele contam como o mesmo site. Veja `cookiePolicy` em
`apps/server/src/auth.ts`.

### Convites

Um convite é um token, um papel e opcionalmente um endereço a que se destinava.
Qualquer um com o link pode ler o que ele oferece antes de ter conta, que é o que
permite ver a que se está sendo convidado antes de se cadastrar. Aceitar exige estar
logado.

## Mudar de modo

O modo navegador e o modo servidor guardam dados de verdade, e uma pessoa pode ir de um
para o outro. O caminho é exportar e restaurar, ou sincronizar: quem está logado vira
dono do que chega, e de mais nada.
