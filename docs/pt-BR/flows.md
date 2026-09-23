# Fluxos

O que acontece de verdade, nos caminhos que importam.

## Chegar pela primeira vez

A porta de entrada faz uma pergunta: usar só este navegador, ou conectar a um servidor.

**Só o navegador.** Um perfil é criado na hora com um nome padrão, um espaço pessoal é
criado, o conjunto inicial de categorias é escrito, e a pessoa recebe a oferta de dados
de demonstração, que ela pode recusar. Nada é perguntado. Nem email, nem senha, nem
nome até ela querer trocar o que ganhou. A escolha é lembrada, então a porta não
aparece de novo.

**Um servidor.** O endereço é digitado. A interface pergunta àquele servidor se ele já
tem alguém. Um servidor sem ninguém abre em criar a primeira conta, em vez de abrir
numa caixa de senha que não dá para preencher. Um servidor com gente abre em entrar.

De qualquer jeito, o que vem depois é o mesmo produto, porque as telas não sabem qual
sessão estão segurando.

## Escrever um lançamento

Três caminhos de entrada, todos caindo no mesmo método de repositório.

1. **O formulário.** Todos os campos, para o lançamento que precisa deles.
2. **Uma linha de texto.** `mercado 42,90 ontem nubank 3x` vira uma despesa de 42,90 em
   mercado, com a data de ontem, no cartão Nubank, em três parcelas. O leitor está no
   `packages/core`, é puro, e é a coisa mais testada do repositório. O que ele não
   conseguiu ler fica em branco, em vez de ser adivinhado.
3. **Um arquivo.** Veja a próxima seção.

Na entrada, as regras rodam. Uma regra casa um texto e define uma categoria, uma
prioridade ou uma conta. As regras são ordenadas e a primeira que casa vence. Uma
correção ensina a regra que errou.

Uma compra parcelada escreve todas as parcelas de uma vez, compartilhando um
identificador de grupo, para que o conjunto inteiro possa ser removido como uma coisa
só.

Um lançamento num cartão de crédito é colocado na fatura a que pertence, decidida pelo
dia de fechamento da conta e não pelo mês do calendário.

## Ler um extrato

```
arquivo -> leitor -> lançamentos -> revisão -> gravado
```

1. **O leitor** é escolhido pelo que o arquivo é: CSV, OFX, QIF, XLSX, JSON, ou o
   leitor de PDF escrito à mão para faturas de cartão e comprovantes.
2. **A conta é adivinhada**, e a tela diz por que adivinhou aquilo: o nome do arquivo,
   uma instituição no texto, um número de cartão.
3. **As colunas ficam guardadas por formato de arquivo**, então o mesmo banco é mapeado
   uma vez.
4. **As repetições são encontradas** comparando o que já existe no espaço em volta dos
   dias que o arquivo cobre.
5. **Nada é gravado até alguém ver.** A revisão é uma tela, não uma caixa de confirmar.

## Dividir uma despesa

Um espaço compartilhado tem membros. Uma despesa pode ser dividida igual, por cota, ou
proporcional à renda declarada. A divisão escreve linhas dizendo quem deve qual parte
daquela despesa.

A tela de acerto soma tudo e diz quem deve para quem, uma vez só, no menor número de
pagamentos. Registrar um pagamento fecha aquela parte. Nada é movido entre contas: o
produto registra o que aconteceu entre pessoas, ele não finge ser um banco.

## Dois aparelhos combinando

A sincronização é uma ida e volta. Um aparelho manda as entradas que escreveu desde a
última vez, e pede tudo o que não viu.

```
aparelho                              servidor
  |  o que escreveu, e um carimbo       |
  | ----------------------------------> |
  |                                     |  aplica o que quem chamou pode escrever
  |  tudo desde aquele carimbo          |
  | <---------------------------------- |
```

As regras que tornam isso seguro:

1. **Um aparelho só pode escrever em nome próprio**, ou em nome de um perfil local que
   não pertence a conta nenhuma. Qualquer coisa que diga ter sido escrita por alguém que
   tem conta ali é recusada. É essa a regra que impede um membro de um espaço
   compartilhado de colocar palavras na boca de outro.
2. **A ordem vem do relógio lógico**, não do relógio de parede de nenhuma das máquinas.
3. **Um espaço que o servidor nunca viu pode chegar num push**, e é adotado por quem o
   empurrou, mas só se não tiver ninguém dentro. Um espaço que já tem membros pertence a
   eles.

Existe também um caminho sem servidor nenhum: um arquivo levado de um aparelho ao
outro, carregando o mesmo histórico de alterações.

## Levar tudo embora

**Exportar.** Tudo em JSON, ou em planilha, por espaço ou inteiro.

**Backup e restauração.** O JSON restaura em qualquer lugar, numa instalação nova ou ao
lado do que já existe. Quem restaura vira dono do que restaurou e de mais nada.

**Uma cópia que mora em algum lugar.** Um arquivo, uma pasta WebDAV, um banco de dados
online, ou uma planilha do Google como espelho. Todos são alcançados pelo navegador,
com credenciais que ficam naquele navegador. O servidor nunca as tem e nunca os chama.

**Apagar.** Duas portas separadas, porque fazem coisas diferentes. Apagar um espaço
esvazia ele e o remove se for compartilhado. Apagar tudo remove todo espaço que esta
conta possui e deixa os que ela apenas integra. As duas dizem exatamente o que vão
fazer, com as contagens, antes de fazer.

## O que os números dizem de volta

O diagnóstico lê os lançamentos da própria casa e relata o que encontrou, do mais
pesado ao mais leve. Um veredito, quatro sinais vitais, um plano com um mês em cada
passo, a tendência contra os meses anteriores, o que os cartões já comprometeram, o que
acontece se a renda parar, quais meses do ano são mais caros, e quanto custa deixar
dinheiro parado diante da inflação.

Todo achado carrega, dentro da frase, as contas que o produziram, para que possa ser
conferido em vez de acreditado.

Ele nunca diz o que comprar, onde colocar dinheiro, ou qual investimento é melhor. Essa
linha é deliberada e está no
[registro 0029](../adr/0029_four_signs_and_a_verdict.md).
