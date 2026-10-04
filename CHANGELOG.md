# Changelog

Every release, what changed in it, and what to do about it if you are running this.

Versions follow semantic versioning. The first number changes when something that worked
breaks, the second when something is added, the third when something is corrected.

## 2.0.0

Released on 3 October 2026. A whole audit of 1.2.0 and 1.2.1 found about seventy faults that
the tests had walked past, ten of them a wrong number on the screen, and this release corrects
every one with a test that fails against the code before it. It also adds what the audit
showed was missing: several cards dealt with in the order they fall due, an invoice paid with
another card or in parts, plans of up to 48 parts, a reader that knows an invoice from a
statement, the list of a whole year, series that change from the next time on, holdings that
are products, and the version on the screen. It is a major version because a page and a
server of 2.0.0 no longer write to a page or a server of 1.x, and because a backup of 2.0.0
is refused by 1.x.

> **If you are updating from 1.x, read this.**
>
> **What reads differently.** Every one of these is the old reading being wrong.
>
> 1. **A record dated ahead counts on its day, by itself.** The promises 1.1.0 to 1.2.1 wrote
>    become facts the first time 2.0.0 opens, whatever their day, and count from it. One whose
>    day has already gone, which the overview listed as late, counts as having happened on that
>    day and leaves the late list: if it did not happen, delete it. Promises from 1.0, and
>    promises brought back from a file, stay promises, and the overview lists them to be
>    answered at once.
> 2. **A card invoice is a bill on its due day.** A payment counts from the day it was made,
>    what was paid beyond an invoice passes to the next one, a card written down with a debt
>    carries it as an invoice, and a transfer out of a credit card is a purchase on its
>    invoice. The check up reads the money in the accounts less what the cards owe.
> 3. **A benefit card counts from the day its allowance counts from**, its allowance counts in
>    a report only once it has landed, a change of allowance applies from the next landing,
>    a top up adds to it, and the benefit is income on every screen that reads income: the
>    overview, the month screen, the twelve months, the flow, the check up and the paper.
>    What is spent on it is out of every reading of the household's money.
> 4. **Money put aside in a savings account is out of what is left to spend this month.**
> 5. **A plan has at most 48 parts.** The line of one text read up to 99 and the core and the
>    server took 420. More is refused with a sentence, never cut. A plan written before with
>    more parts goes on being read, changed and restored as it is.
> 6. **What somebody owes in a shared space counts from the day of each record**, and dividing
>    a part of a plan divides the whole plan.
> 7. **A series is written whenever the application opens, in every space,** and no longer only
>    when the calendar is open. A series from before keeps writing from the first day of the
>    month it was written down in. Its screen moved to Records, Recorrentes.
>
> **What a holding becomes.** A holding is now a product: a caixinha, a CDB, a share, a
> Tesouro. One from before 2.0.0 is listed as what it was, a fixed income one under fixed
> income, priced at the price it carries, and "Você tem" for money left at a broker does not
> change. To give an old holding a product, open its menu, choose Edit and pick the product.
>
> **What you need to do.**
>
> 1. **Update the server and every open page together.** A page of 2.0.0 in front of a server
>    of 1.x reads everything and writes nothing, and says so on every screen. A device of 1.x
>    is refused when it exchanges changes with a server of 2.0.0.
> 2. **Take a copy of the server before updating**, in a folder outside the clone. A copy made
>    from the interface does not carry the accounts people sign in with. The guide on
>    [updating](docs/en/deploy.md#updating) has the commands for each way of installing, and the
>    data screen of 2.0.0 shows the ones for yours.
> 3. **A server installed with `compose.yaml` from this repository built its own image until
>    now, and from 2.0.0 runs the published one**, `ghcr.io/andreilud/app-cofre-ink:2`, with the
>    same `docker compose up -d` and the same volume, `cofre_cofreData`. Building from the
>    source is `compose.build.yaml`, added to the first file. `:2` follows version 2 and never
>    reaches a version 3: changing `COFRE_TAG` in `.env` is how a new major is chosen.
> 4. **Whoever follows `latest` with `docker run` gets 2.0.0, with its migrations, on the next
>    pull.** Pin `:1.2.1` to stay on 1.x, or take the copy first. From now on `latest` names
>    only the highest version published.
> 5. **There is no going back over a migrated database.** From 2.0.0 on, a version older than
>    the one that migrated a database refuses to start over it, and says to run that version or
>    to restore the copy. A version of 1.x does not know how to refuse: started over a database
>    2.0.0 migrated, it starts without a word and writes rows 2.0.0 reads differently. Going
>    back is always restoring the copy taken before the update and running the version before
>    over it.
> 6. **A backup written by 2.0.0 is refused by 1.x**, which says it is newer, instead of
>    quietly losing what 2.0.0 writes.
> 7. **A saved filter keeps the month it was saved with.** One saved before 2.0.0 opens on its
>    month; save it again on "this month" to have it follow the calendar.
>
> **Se você está atualizando da 1.x, leia isto.**
>
> **O que lê diferente.** Em todos os casos, a leitura antiga é que estava errada.
>
> 1. **Um lançamento com data adiante conta no dia dele, sozinho.** As promessas que a 1.1.0 a
>    1.2.1 escreveram viram fatos na primeira vez que a 2.0.0 abre, qualquer que seja o dia
>    delas, e contam a partir dele. Uma cujo dia já passou, que o Painel listava como atrasada,
>    conta como acontecida naquele dia e sai dos atrasados: se não aconteceu, apague. Promessas
>    da 1.0, e promessas trazidas de um arquivo, continuam promessas, e o Painel lista elas para
>    responder de uma vez.
> 2. **Uma fatura de cartão é uma conta no dia do vencimento.** Um pagamento conta do dia em
>    que foi feito, o que se pagou além de uma fatura passa para a seguinte, um cartão
>    cadastrado com dívida leva essa dívida como uma fatura, e uma transferência que sai de um
>    cartão de crédito é uma compra na fatura dele. O diagnóstico lê o dinheiro das contas
>    menos o que os cartões devem.
> 3. **Um cartão de benefício conta a partir do dia em que o valor mensal conta**, o valor
>    mensal entra num relatório só depois de cair, uma mudança dele vale do próximo crédito em
>    diante, uma recarga soma, e o benefício é renda em toda tela que lê renda: o Painel, a
>    tela O mês, os doze meses, o fluxo, o diagnóstico e o PDF. O que se gasta nele fica fora
>    de toda leitura do dinheiro da casa.
> 4. **O dinheiro guardado numa poupança fica fora do que ainda dá para gastar no mês.**
> 5. **Um plano tem no máximo 48 parcelas.** O lançamento rápido lia até 99, e o núcleo e o
>    servidor aceitavam 420. Mais que isso é recusado com uma frase, nunca cortado. Um plano
>    gravado antes com mais parcelas continua sendo lido, mudado e restaurado como está.
> 6. **O que alguém deve num espaço compartilhado conta a partir do dia de cada lançamento**, e
>    dividir uma parcela divide o plano inteiro.
> 7. **Uma série é escrita sempre que o aplicativo abre, em todo espaço,** e não mais só com o
>    calendário aberto. Uma série de antes continua escrevendo a partir do primeiro dia do mês
>    em que foi cadastrada. A tela dela foi para Lançamentos, Recorrentes.
>
> **O que uma aplicação vira.** Uma aplicação agora é um produto: uma caixinha, um CDB, uma
> ação, um Tesouro. Uma de antes da 2.0.0 aparece como era, uma de renda fixa em renda fixa,
> pelo preço que ela tem, e o "Você tem" de quem deixa dinheiro na corretora não muda. Para dar
> um produto a uma aplicação antiga, abra o menu dela, escolha Editar e escolha o produto.
>
> **O que você precisa fazer.**
>
> 1. **Atualize o servidor e toda página aberta juntos.** Uma página da 2.0.0 diante de um
>    servidor da 1.x lê tudo e não grava nada, e diz isso em toda tela. Um aparelho da 1.x é
>    recusado quando troca mudanças com um servidor da 2.0.0.
> 2. **Tire uma cópia do servidor antes de atualizar**, numa pasta fora do clone. A cópia feita
>    pela tela não leva as contas de acesso. O guia de [atualizar](docs/pt-BR/deploy.md#atualizar)
>    tem os comandos de cada jeito de instalar, e a tela Dados da 2.0.0 mostra os do seu.
> 3. **Um servidor instalado com o `compose.yaml` deste repositório construía a própria imagem
>    até agora, e da 2.0.0 em diante roda a publicada**, `ghcr.io/andreilud/app-cofre-ink:2`,
>    com o mesmo `docker compose up -d` e o mesmo volume, `cofre_cofreData`. Construir a partir
>    do código é o `compose.build.yaml`, somado ao primeiro arquivo. A `:2` segue a versão 2 e
>    nunca chega numa versão 3: trocar `COFRE_TAG` no `.env` é como se escolhe uma versão maior
>    nova.
> 4. **Quem segue `latest` com `docker run` recebe a 2.0.0, com as migrações, no próximo pull.**
>    Fixe `:1.2.1` para ficar na 1.x, ou tire a cópia antes. Daqui em diante `latest` aponta só
>    para a maior versão publicada.
> 5. **Não há volta sobre um banco migrado.** Da 2.0.0 em diante, uma versão mais velha que a
>    que migrou o banco se recusa a subir sobre ele, e diz para subir aquela versão ou restaurar
>    a cópia. Uma versão 1.x não sabe recusar: subida sobre um banco que a 2.0.0 migrou, ela
>    sobe calada e grava linhas que a 2.0.0 lê de outro jeito. Voltar é sempre restaurar a cópia
>    feita antes da atualização e subir a versão anterior sobre ela.
> 6. **Um backup escrito pela 2.0.0 é recusado pela 1.x**, que diz que ele é mais novo, em vez
>    de perder calada o que a 2.0.0 grava.
> 7. **Um filtro salvo guarda o mês com que foi salvo.** Um salvo antes da 2.0.0 abre no mês
>    dele; salve de novo em "este mês" para ele acompanhar o calendário.

### Added

**Several cards, in the order they are dealt with.** The overview, the invoices and the month
screen order cards by what falls due first, add three or more into one line with each one
behind it, and say which card made each purchase on an invoice that two plastics share. The
invoices open on the most urgent card, and the card and the month are in the address, so going
back goes back. A second plastic is added to an invoice that exists, a card put away that
still owes goes on being counted, and a card is asked for its days before anything is charged
to it. Registry 0058.

**An invoice paid three ways**, on one dialog: from an account, at once or in part, including
a payment scheduled for a day before it falls due; with another card, at once or in parts,
with what that card charges beyond the invoice written as a cost; or split with the bank, with
an entry and a tax charged apart. The last two are undone whole while no invoice of their parts
was paid, and lock what they wrote meanwhile. Registry 0063.

**Plans of up to 48 parts on any money out**, typed as the whole or as each part, on the form
and on one line (`48x de 99,90`), and a purchase begun before Cofre written from the part after
the ones already paid ("Já paguei 10"). The check up reads every part ahead, and the months
ahead say what runs past them. Registry 0064.

**Only money out and money in on the form, and moving money between your accounts as a door
of its own**, from the accounts screen, from each account, from a benefit card (a top up), from
the saving rule and from each goal. A record that was really money moved becomes the move it
was, from its menu, and joins the same move written on the other account. Registry 0057.

**A benefit card that says what is on it today**, a refund of a purchase on it, and the
history of its allowance. Registries 0053 to 0056.

**A reader that knows what a document is.** It tells an invoice from a statement and the bank
from what only one of them prints, reads the sign of each line by the kind of document,
checks the document against its own total, reads a part printed on an invoice as a plan and
finds it again, pairs a refund with its purchase, knows the lines of a split invoice and of
another card, reads a statement in PDF with its debit and credit columns and the card it paid,
says how each line is already here, and takes a whole import back in one go. Registries 0065
and 0066.

**The list of a whole year, or of every month**, grouped by month, with what the whole list
adds up to and not only the page, the months ahead in a closed group, and the period in the
address. Registry 0067.

**What repeats has a screen**, under Records, one writer that runs for every space, a card,
"Repete" on the form, and a change that applies from the next time on as a chain, never
rewriting what was written. Registry 0068.

**Holdings that are products**, from a catalog of seventeen, each asking only its own fields;
a caixinha, a poupança, a CDB, an LCI or an LCA at the CDI, and the Tesouro Selic, estimated
from the daily rates of the Banco Central and said up to which day; money put in, taken out
with the tax said, and income, each moving money from or to an account; a goal or the saving
rule kept in one holding; and each holding against the CDI. Registry 0069.

**The version on the screen**, under the danger zone, and on a server a button that asks GitHub
which version was published last, only when pressed, with the notes and the commands that
update the copy for the way it was installed. Registry 0061.

**The month on paper day by day**, with each benefit card in it.

### Changed

**Five sections again**, with planning and reports in one. Registry 0070.

**One rule for what falls due**: a card invoice is a bill on its due day on the overview, on the
check up and in its sentences, and the reserve is the money in the accounts less what the
cards owe. Registry 0071.

**A month that has gone reads as it stood on its last day**, on paper and on the check up: its
holdings, its cards and the day it counts as over. Registry 0062.

**A record dated ahead is a fact that counts on its day**, which is decision 3 of 1.1.0 done at
last. Registry 0050. And a repair that travels: what a release before wrote and this one reads
differently is put right through the change log when a space opens and after rows arrive, on
every device. Registries 0051 and 0059.

**The compose file runs the published image on the line of 2**, `latest` names only the highest
version, and every update starts with a copy outside the clone. See the note above.

**A backup is version 2**, refused by 1.x.

**The demonstration shows more of what is there**: a second card on a cycle of its own with a
plan in six, a second plastic on the first card, the subscription as a series, and a caixinha,
a CDB, an ETF and a real estate fund among the holdings.

### Fixed

On cards and invoices: a payment counted from the day of the invoice instead of its own; every
invoice before the one on screen was marked paid; the opening balance of an old card counted
nowhere; a transfer out of a credit card was not a purchase on its invoice; an overpayment
stayed where it was; a record moved invoice when nothing that decides its invoice changed; a
corrected closing day moved purchases that did not belong; a part of a plan moved alone; an
invoice was overdue on its due day; on a server, the payment the month screen wrote lost the
invoice it paid, and those already written are repaired; a month or a day that does not exist,
such as a thirteenth month of 2026, was accepted and broke every reading of the space's invoices, and one already
written is cleared.

On benefit cards: the day of the allowance could be left empty; the allowance counted in
reports before it landed; spending before the card was written down was ignored, so the
demonstration said R$ 900,00 of R$ 900,00 after a lunch of R$ 56,00; a change of allowance
rewrote the months already gone; a top up by Pix vanished; an old income on a card was counted
twice; the accounts screen showed its balance instead of what is on it; the line said there was
no allowance to a logger, and to everybody while the members loaded; its spending was in the
readings of the household's money.

On the form and the line of text: money in stayed on the card the form opened on; instalments
were offered only on a credit card; a card put away lost its purchases; a record could not turn
from money out to money in; "it did not happen" took a record away without asking; ticking a
promise off against the bank left it a promise; an account could be renamed to nothing; the
line read cards wrong and put income on a card.

On the overview, the month screen and the paper: the saving rule was said to be missing while
it loaded; a logger's figures included the household's holdings; "Todos" priced only the open
space's holdings and added different currencies; the month screen said things the month did
not hold; four sentences about cards and accounts sent people the wrong way; money in another
currency was added as typed in the limits, the saving rule, the check up and the month screen;
the paper printed keys instead of words, a sign on what went out, and a limit without its
category's name.

On accessibility: no message was announced, the focus fell to the page after confirming late
records, fifteen links held a button, and the overview was marked as the current section on
three screens that are not it.

On a server: the status of an answer was read after its body, so a proxy's error page reached
the screen as a fault in reading it; an opening balance could be typed on the edit of a new
card; changing the currency of an empty space left its accounts in the old one; a database a
newer version migrated was opened in silence.

In the demonstration, the rent and the bills were looked up by names the starting categories
do not have, so the file of September opened with R$ 1.693,00 nobody had sorted.

Found while this release was being checked: a Tesouro Selic of three units was worth the price
of one, because a price typed for a holding estimated from an index was read as the whole of
it; the form of a new holding, opened before the accounts arrived, chose a new account in a
space that had one; and the invoice screen, opened with no card in the address, moved to
another card the moment the one on it was paid. From before 2.0.0, the same reading found
that the month screen described what it writes as it wrote it in 1.1.0 and its two links
lost the month on the screen; that in "Todos" the button that says a record happened
followed the role in the open space; that a credit account was made even when its card was
then refused, so saving again made a second one; and that the state of an invoice and its
due day ran together with no comma. All of them are corrected.

### For the record

The notes of 1.2.1, which the release page shows as its tag carried them, named the role
Registrador in the English of the code, where it is the logger, and said the sentence about a
missing allowance was gone for everybody, which it was not until this release. Both are
corrected in the section of 1.2.1 below, and here.

## 1.2.1

Released on 2 October 2026, hours after 1.2.0 and for one reason: the report written about
1.2.0 was audited against the repository before it was handed over, and the audit found four
things wrong in the code rather than in the report. All four were shipped by 1.2.0.

**What the month went on was summed in whatever currency each purchase was written in.** It is
the same fault 1.2.0 took out of the card invoice, written again in the module added in the same
release: a month holding a dinner in dollars and a market in reais came back as a number in no
currency at all, with the currency of the space printed beside it. It sums the figure worked out
at the rate of each day now, like every other total.

**A benefit card told a logger that its allowance was not filled in.** The model answers
nothing about a benefit card to somebody who only sees their own records, on purpose, and the row
read that silence as a missing allowance. It is the exact harm the line at the top of the same
screen avoids by drawing nothing at all. That row now draws nothing either, and nothing while the
answer is still on its way.

(Corrected in 2.0.0: it did not end there. The overview decided by the role in the space that
was open, so in "Todos" a card from a space where somebody is a logger still said it, and the
sentence still showed while the member list was being read. 2.0.0 decides by the role in the
space of the card itself, and says nothing until that role is known.)

**A sentence about limits could not appear in the case it was written for.** When every limit of a
month is on a category, none of them can see a typed total, so none is ever near breaking, so the
warning that carried the sentence was never drawn and the silence read as safety. The sentence
stands on its own now when a month has typed numbers and no limit able to see them.

**The share on each line of the ranking said "of what is sorted"** while being measured against a
total that includes the line for money nobody sorted. The words changed rather than the
arithmetic, because the line for unsorted money is deliberate.

Also: the check up and the month screen share the constant for when a month is far enough along
to be compared, and now share the comparison too. They differed on the twenty fourth of a month
of thirty days, the one day four fifths of a month falls on exactly, and on no day of the others.
(Corrected in 2.0.0: this said one day a month.)

Registries 0041, 0048 and 0049 carried four claims the same audit refuted, about what the probes
prove, which flows run on the fixed day, what registry 0023 says, and how many records three
numbers write. All four are corrected.

## 1.2.0

Released on 2 October 2026. The release that finished 1.1.0.

1.1.0 shipped with a list of what it had not done, written down rather than quietly carried.
This is that list, worked through, plus six things the working through found on its way past
and one that found itself: the day after the tag, one conformance case and at least eight
browser flows of 1.1.0 were red with nobody having touched a line of the code, because they had
been written against the day they were run on. Registry 0048 tells it.

Every correction here but three carries a test that fails against the code before it, and each
of those was run against that code to prove it. The three are the gate of the button that
deletes a record, the line of a benefit card in the list of accounts, and the invoice holding a
purchase with no rate, whose branch only a restore can reach. (Corrected in 2.0.0: this said
every correction, and the report of this release named the three.)

> **If you are updating from 1.1.0, four figures will read differently.**
>
> **Se você está atualizando da 1.1.0, quatro números vão ler diferente.**
>
> All four are the old readings being wrong rather than the new ones.
>
> 1. **The months ahead will usually read lower in their first month.** The projection opens
>    at the money you have today, which already holds everything that happened this month, and
>    then charged the month a whole usual month of spending and of income on top of it. The
>    first month now counts only the days still to come.
> 2. **A card invoice is a figure in your own currency.** It was summed in whatever currency
>    each purchase was written in and labelled with the currency of the card's account, so an
>    invoice holding a purchase abroad was a number in no currency at all, and that number was
>    going into what is left to spend this month.
> 3. **What is left of a card's limit replaces the limit**, on the invoice screen, which used
>    to print the limit itself with nothing taken off it.
> 4. **A benefit card in the list of accounts shows what is on it**, which is worked out, and
>    not the balance of its records, which for a benefit card is roughly the negative of what
>    has been eaten.
>
> Nothing is asked of you and nothing is converted.

### Added

**A month of three numbers says something back.** Somebody who will not keep a ledger types
what came in, what went out and what the card charged, and the screen answered with those
three numbers and their difference. It now reads the month against the middle of the closed
months before it, ranks what the month went on, with the money nobody sorted as a line of its
own, and says which limits the month has broken or is close to breaking. (Corrected in 2.0.0:
this said the ranking held only what carries a category, and only the broken limits.) The
comparison waits: a month three days old has spent
almost nothing, and a screen that calls that thrift tells a household it is winning on the
third and leaves it to find out on the thirtieth.

**A week of late promises is answered in one go.** The overdue block had two buttons per row
and nothing over the block. Every record still stays on the day it was promised for, so a bill
stays in the month and in the limit it belongs to, and the dialog says so before it writes.

**A filtered list of records is an address.** The seven filters live in the address now, so a
narrowed list can be linked to, bookmarked, reloaded and handed to the other person in the
space. The overview already had a link per account pointing at that screen, carrying the
account, and the screen read nothing at all.

**A voucher says when the next allowance lands**, and a card that does not keep what is left
says that instead, because the neutral sentence would be a comfortable lie about a transport
card.

**A way into the statement import from the records screen**, which offered three ways to type
a record in and none to read a file.

### Changed

**The habit of the month you are in counts only the days still to come.** See the note above.

**A card invoice is summed in the currency of the space**, from each purchase at the rate
written down with it, which is what every other total in this application does. An invoice
holding a purchase in another currency with no rate for the day prints no total at all and
says why, rather than printing one that quietly leaves that purchase out, and it is in no
figure on the overview while it says it. (Corrected in 2.0.0: not every other total did. The
limits, the saving rule, the invoices and the instalments the check up reads, and what the
month screen says was written one at a time, still added amounts as they were typed until
2.0.0.)

**A control on a screen names the call it makes**, not the permission behind it. The permission
is read from one table, and every row of that table is proved against the running repositories
by the permission probes, on all three engines.

### Fixed

**A card invoice past its due day is something to answer.** The list of bills had one bound,
the far end, so a bill that fell due three months ago passed the only test there was and was
drawn under the heading saying it is due in the next days, with a date already gone beside it.
A household whose one overdue thing was a card invoice saw no block for it at all.

**Every invoice that closed and was not paid is a bill of its own.** The model answered with
the newest, so a household two invoices behind saw one of them while the headroom of the card
counted both, and the invisible one was the older debt.

**The invoice screen says what is left of the limit.** It printed the raw limit with nothing
taken off it, so the figure somebody checks before paying at a till was the wrong one, on the
screen whose only subject is that card.

**A benefit card in the list of accounts shows what is on it.**

**The habit of a projection is read from whole months.** The month on paper for September, made
on the eleventh, reads the months ahead from October, and counted September, eleven days old,
among the months its habit is the middle of, as a cheap month that dragged the habit down.
(Corrected in 2.0.0: this said the habit came from September alone.)

**Saying a promise did not happen asks for the permission it needs**, which is the delete one
and not the update one. It agreed with the refusal behind it by accident, because the two hold
the same roles today.

**An account form that writes a card's opening invoice does it through a rule in the core**
rather than seven lines inside a screen. (Corrected in 2.0.0: this entry also listed the month
screen saying which invoice it pays, which 1.1.0 did.)

### Fixed in the suite, which is where this release started

**The browser suite runs on one fixed day.** One conformance case and at least eight browser
flows of 1.1.0 passed on the thirtieth of September and failed on the first of October without
a line of code changing (corrected in 2.0.0: this said three tests): a series never
writes a record for a month before the one it was written down in, so "six days ago" produced
no overdue promise at all in the first days of a month. A test that is red with no cause is
worse than a test that is missing, because it teaches whoever reads the suite that red is
weather.

**The translation check refuses two more things**: a sentence quoting another with `$t()` where
the quoted key does not exist, and a key no source file asks for. The second found fourteen,
removed here.

**The sweep of 1.1.0 got the tests it was missing**, where no new harness was needed: what an
address is in the cloud package, which role only ever sees what it wrote, and the whole path of
the invoice a card is written down with.

## 1.1.0

Released on 30 September 2026. A large release, and the first one that changes what a figure
means rather than only correcting one. It answers a question this application had never
really answered, which is what a credit card is: until now a purchase on a card took the
money out of the bank on the afternoon of the purchase, and the invoice was a filter over
records rather than a thing with a state. It also gives the overview four figures on one
line, turns a benefit card into the allowance it actually is, lets a whole instalment plan be
corrected at once, and puts the whole month into one file the browser writes.

Then, before the tag, the reading of 1.0.5 was turned on this release, four times over and
with instructions to refute rather than to agree: the money and the arithmetic, the
permissions and what a logger reads, the interface and both languages, and every sentence
this release had written about itself. It found forty six things and it was right about most
of them, including four figures the release had newly opened to somebody who may not see
them, two sums that added a foreign currency as though it were the local one, a card whose
headroom took its instalments off twice, and five sentences in the registries that described
code this release had not actually written. All of it is below.

> **If you are updating from 1.0.x, read this.**
>
> **Se você está atualizando da 1.0.x, leia isto.**
>
> Your file is carried across and nothing is deleted. Four things will read differently
> afterwards, and all four are the old readings being wrong rather than the new ones.
>
> 1. **What you have, and what you owe, are two figures now.** The overview used to take a
>    card invoice off the one number at the top, so the money in the bank looked smaller
>    than it was and a card with nothing on it looked like money. What you have is the
>    current accounts, the savings, the cash and the investments. The cards and the benefit
>    cards are on their own lines under it.
> 2. **A subscription charged to a credit card reaches its invoice.** Writing a series never
>    worked out which invoice it belonged to, so every record a series had written on a card
>    was on no invoice at all and the card showed less than it would charge. The upgrade
>    repairs those rows, so an invoice of yours may be larger than it was yesterday. That
>    number was always what the bank was going to ask for.
> 3. **The months ahead count the invoices, and the balance they start from is the one the
>    overview shows.** The projection counted only records still waiting to be confirmed,
>    which a card purchase never is, so nothing your cards were about to charge was in it.
>    It also treated paying an invoice as money that had not moved, so it opened over by
>    every invoice you had ever paid. Both are corrected, and the months ahead will usually
>    read lower than they did.
> 4. **A benefit card needs its monthly allowance written down.** VR, VA, VT, culture and
>    mobility are an amount that lands on a day each month and is spent down, and nothing is
>    written when it lands, so what is left has to be worked out from the allowance. Until
>    you fill it in, the card says so instead of guessing. What you typed as the opening
>    balance of that card keeps counting: it is what was on the card the day you wrote it
>    down, and it is the starting point of the sum.
>
> Nothing is converted. Four things are asked of you, which this note used to say were none
> (corrected in 2.0.0):
>
> 1. **Mark the old invoices as paid.** Every invoice from before 1.1.0 opens as unpaid, because
>    nothing ever said it had been paid. Under Faturas, the button that marks the earlier
>    invoices as paid ("Marcar as 3 faturas anteriores como pagas", with the number it found)
>    writes one payment for each, on its due day, out of the account you choose.
> 2. **Write down the monthly allowance of each benefit card, and its day**, under Contas, in
>    the edit of the card.
> 3. **Answer the late records.** What release 1.0 wrote as a promise and nobody confirmed is at
>    the top of Painel as late: "Aconteceu" and "Não aconteceu" answer one, and "Confirmar os 3",
>    with the number there is, answers all of them at once.
> 4. **If you run a server, update the server and the browser together.** The browser of 1.1.0
>    sends fields a server of 1.0 does not know and drops.
>
> **Em português:**
>
> Seu arquivo vem junto e nada é apagado. Quatro coisas vão ler diferente depois, e nas quatro
> a leitura antiga é que estava errada.
>
> 1. **O que você tem e o que você deve são dois números agora.** O Painel tirava a fatura do
>    cartão do número de cima, então o dinheiro no banco parecia menor do que era e um cartão
>    sem nada parecia dinheiro. O que você tem são as contas correntes, as poupanças, o dinheiro
>    e os investimentos. Os cartões e os cartões de benefício ficam em linhas próprias embaixo.
> 2. **Uma assinatura no cartão de crédito chega à fatura dela.** Uma recorrência nunca dizia em
>    que fatura caía, então tudo o que uma recorrência lançou num cartão ficava fora de qualquer
>    fatura, e o cartão mostrava menos do que ia cobrar. A atualização conserta esses
>    lançamentos, então uma fatura sua pode ficar maior do que era ontem. Esse número sempre foi
>    o que o banco ia cobrar.
> 3. **Os próximos meses contam as faturas, e começam do saldo que o Painel mostra.** A projeção
>    contava só lançamentos esperando confirmação, o que uma compra no cartão nunca é, então nada
>    do que os cartões iam cobrar estava nela. Ela também tratava pagar uma fatura como dinheiro
>    que não se mexeu, e abria acima por toda fatura já paga. As duas coisas foram corrigidas, e
>    os próximos meses em geral vão ler mais baixo.
> 4. **Um cartão de benefício precisa do valor mensal anotado.** VR, VA, VT, cultura e mobilidade
>    são um valor que cai num dia de cada mês e vai sendo gasto, e nada é lançado quando ele cai,
>    então o que sobra tem de ser calculado a partir desse valor. Enquanto ele não está anotado,
>    o cartão diz isso em vez de adivinhar. O que você digitou como saldo de abertura desse
>    cartão continua contando: é o que havia nele no dia em que você o cadastrou, e é o ponto de
>    partida da conta.
>
> Nada é convertido. Quatro coisas são pedidas de você, que esta nota dizia serem nenhuma
> (corrigido na 2.0.0):
>
> 1. **Marque as faturas antigas como pagas.** Toda fatura de antes da 1.1.0 abre como não paga,
>    porque nada dizia que ela tinha sido paga. Em Faturas, o botão que marca as faturas
>    anteriores como pagas ("Marcar as 3 faturas anteriores como pagas", com o número que ele
>    achou) lança um pagamento para cada uma, no dia do vencimento, da conta que você escolher.
> 2. **Anote o valor mensal de cada cartão de benefício, e o dia em que ele cai**, em Contas, na
>    edição do cartão.
> 3. **Responda os atrasados.** O que a versão 1.0 lançou como previsto e ninguém confirmou
>    aparece no alto do Painel como atrasado: "Aconteceu" e "Não aconteceu" respondem um, e
>    "Confirmar os 3", com o número que houver, responde todos de uma vez.
> 4. **Se você usa um servidor, atualize o servidor e o navegador juntos.** O navegador da 1.1.0
>    manda campos que um servidor da 1.0 não conhece e descarta.

### Added

**Where every card stands, on the overview.** A panel of its own, one block per card, side by
side on a wide screen: what the open invoice will charge, the day it closes and how many days
that is, the day it falls due, the invoice before it when that one closed and is still owed,
what the instalments will charge after this one, and how much of the limit is left. Every one
of those figures was already worked out and none of them reached a screen. The buttons lead to
that card's own invoice, which the address can now name.

**The invoice is a thing with a state, and it can be paid.** An invoice of a card has a
month, a day it closes, a day it falls due, what it charged, what has been paid against it
and what is left, and it is open, partly paid, paid or in credit. Paying it is a transfer
into the card marked with the invoice it pays, with the amount you type rather than the
amount it says, because paying part of one is a thing people do and the card does not refuse
it. What is left stays on that invoice with no interest added: this application does not
model revolving credit and says so on the screen rather than inventing a number. A payment
that names no invoice, which is what a transfer made by hand or brought in from a statement
is, pays down the oldest invoice still owing, which is what a bank does with it.

**A purchase on the wrong invoice can be moved**, one invoice earlier or later, and every
part of an instalment plan moves with it. Banks close a day either side of what any
application expects, and a purchase on the closing day is the one that lands in the wrong
month. Moved by hand, it stays where it was put: working the invoice out again from the
closing day would send it straight back.

**The overview answers the four questions it promises**, in four figures on one line: what
you have, what is left to spend this month, what falls due in the next days and whether what
you planned is being put aside. Under them, one line per card and one per benefit card,
what is late, what falls due with a card invoice as one bill, the month so far, the saving
and the goals, and where the money is with every account linking to its own records.

**A benefit card is an allowance with a day on it.** An amount, the day of the month it
lands, and whether what is left carries into the next period or is taken back. VR and VA are
one pot and carry by default; VT is topped back up and does not. The money on a benefit card
goes one way: it refuses a transfer out, because a fare card does not hand money back, and it
refuses a record of income, because the monthly allowance is the credit and writing it down
again would count it twice. A transfer into one is taken, because cards like Caju and Flash
accept a top up by Pix and that is money that really moved.

**One field for what a record was paid with.** Card and account were two fields asking one
question, and answering the first without the second wrote a purchase onto no card. It opens
on the last way you paid, on this device and in this space.

**A whole instalment plan can be corrected from one part onwards.** This part, or this part
and the ones after it, and never the ones behind: what already happened happened under the
name and at the price it happened at. A name written over a plan keeps each part's number.
The day is not one of the things it changes, because each part falls on its own.

**The whole month in one file.** A page of its own at `/relatorio`, which the browser saves
as a PDF: the month in three numbers, the cards, the categories, the priorities, the last
twelve months, the limits, the saving and the goals, the check up, the months ahead and the
investments. Every figure has a table it can be read from, so the file works with a screen
reader. A month that has gone is read as it stood on its last day. Nothing leaves the device
to make it.

**A card is written down with nothing on it.** The form asked for an opening balance on a
credit card and on a benefit card, under the sentence "how much is in this account today",
which is the wrong question for both: what is on a credit card is its invoice, and what is on
a benefit card is the allowance less what was eaten. The field is gone from both, and the
model refuses a number there rather than trusting the screen. A card written down by an
earlier release keeps what it has, and that number can still be corrected, which is how it
keeps counting. (Corrected in 2.0.0: the model allowed it and no screen asked for it on a
credit card. Since 2.0.0 the edit of such a card has the field "Dívida de quando foi
cadastrado".)

**An account can be corrected**: its name, where it is, its opening balance, the closing day,
the due day and the limit of a credit card, and the allowance of a benefit card. Deleting one says how many records are charged to it first.
What is already on a card invoice can be written down when the card is, as one record dated
today, because the cycle of a card you already own started before you got here.

**How much you can still spend this month**, which is what you can spend now, plus what is
still coming in, less what falls due and what you still mean to put aside.

### Changed

**The day says whether a record happened.** There was a tickbox asking whether it had
happened yet, beside a field that had already been given the day, which is two answers to
one question. A day that has not come has not happened, so the day decides and the form says
what the day you chose means.

**A record counts on the day it happens.** A purchase in six parts is six records written as
facts, five of them dated in months to come, and all six used to leave the balance on the
afternoon of the purchase while the same five were also counted as still to come next door.

**One definition of what counts as money**, in `packages/core`, which three screens used to
each have their own version of. What somebody has, what they can spend this afternoon, what
they owe on the cards and what is left on the benefit cards are four named questions now,
and every screen asks one of them by name instead of writing a filter of its own.

**The currency of a space is not a setting to be changed.** It is settled by the first
record, which the model has always held; the picker is switched off once the space counts in
one, and it says why instead of refusing after you press save.

**Accounts is a section of its own** in the navigation, with the wallet mark, and Settings
opens on Categories.

**The first part of a month ahead is called what it is:** already certain, which is the bills
written down for that month and the card invoices falling due in it.

### Fixed

**A record in another currency is added up in the currency of the space.** The total under
the list of records, three sums on the calendar and the division of a bill between people all
read the amount as written and labelled the answer with the space currency, so a dinner of
forty dollars in a household counting in reais went in as forty. Every one of them reads the
figure that was worked out at the rate of the day, which was already stored beside it. A
holding is stored in the currency of the space rather than in reais whatever the space says.

**A logger reads what they wrote wherever a figure is made of records.** 1.0.5 said this was
true of every screen; a series and a holding were outside it, and both are now written down
in registry 0041 as things that stay outside on purpose. The reports and the budget say whose
figures they are, which only the overview and the projection did, and the consolidated
overview says it about the spaces being added rather than about the one that happens to be
open.

**A refusal is drawn where the person is looking.** Handing a space over was offered where it
could not be done, the automatic backup said nothing about an address it could not use, a
series drew its refusal twice, and the file picker drew a refused file somewhere else on the
screen. Erasing a space with the backup on and the address half typed asked nothing at all
and left the backup running; it says what will happen to the copy now.

**One set of sentences for a refused invitation.** The invitation screen had a second set for
the same refusals, so a used link said one thing there and another thing everywhere else. It
reads the one translator now, like every other failure. A callout for a failure that screen
cannot be showing is gone, and so is a sentence nobody reads.

**A sentence that says whose job something is waits for the member list.** Until it arrives
every answer is no, so an owner was told for a moment that making an account, a rule or a
card belongs to whoever runs the space.

**A refusal names the button that is on the screen.** Leaving a space pointed at a button
called something else; it quotes the button's own words now, so the two cannot drift.

**A failure nobody can explain to a person leaves a trace.** A server that crashed reached
the screen as "I could not finish that" and wrote nothing anywhere. A statement a cloud
database refuses is a failure with the name of the place on it, like every other destination,
instead of a plain error carrying the raw text of somebody else's server.

**The share weights are sent only to the division that reads them.** Dividing evenly or by
income shipped a full map of weights nobody had seen.

**A list is cut at the end that was asked for.** A caller that wanted what falls due next
took the newest twenty and then sorted them the other way round, which showed the twenty
furthest away and dropped the bills due tomorrow. On a server the route then dropped the
order and the offset on the floor, so browser mode was right and server mode was not.

### Fixed by the sweep before the tag

**The overview counted the wrong bill, twice, and in the wrong currency.** Four faults in one
band of figures. Only the invoice still taking purchases was counted, so from the closing day
to the end of the month the bill the household actually owed was in no figure on the screen,
and what was left to spend read high by the whole of it. A planned purchase on a card was
counted as itself and again inside its invoice. In the every space view the money came from
every space and the bills from whichever one was open, under a heading that says it is about
all of them. And what is still coming in and still going out added the amounts as they were
typed, which is the very thing this release took out of every other total.

**An invoice, an allowance, a count of records and a month closed to somebody who only sees
their own records.** Four figures this release added, each made of every record on an account
whoever wrote it, each asking for a permission every role holds. The invoice screen closes
and says why, the benefit line is not drawn, the count counts what the asker can see, and the
allowance of a benefit card counts as nothing in a month made of one person's records rather
than being folded into it whole. Registry 0041 now holds all of them.

**A benefit card no longer pays an allowance in months it did not exist in.** The allowance
was multiplied by the landings of whatever range was asked for, so a card written down in
September credited a household eight hundred a month back to the beginning of its records,
and went on crediting one that had been archived. It counts from the period the card was
written down in, which is the period the first lunches on it belong to as well.

**A month ahead counts every record the opening balance has not.** Cutting the opening at
today was right and left a hole beside it: a record dated in a month ahead and written as a
fact is not planned, so the later parts of a purchase in six, and a month filled in from the
month screen before it arrived, appeared in no figure anywhere. The projection also opens
with the prices somebody typed for what is invested, which is what the overview shows, rather
than with what was paid into the broker.

**A card's headroom takes the instalments still to come off once.** They were subtracted as
what is owed and again as what is charged later, so a limit of five thousand with nine hundred
in three parts reported three thousand five hundred left instead of four thousand one hundred.

**Moving purchases between invoices is all of them or none.** Both doors moved the rows one
at a time, so a plan with one part ticked off against the bank, or a card with one in the
window, moved what came before it and then refused, leaving a purchase split between two
invoices with nothing saying how far it got.

**An instalment plan is corrected in the space it is in.** The mark of a plan is not renamed
when a backup is restored into a second space, so two spaces can hold two plans under one
mark, and asking the permission once on the first part found was asking about one space and
writing both.

**The closing day, the due day and the limit of a card can be corrected.** Registry 0045 said
they could and the model took four fields. The closing day is the one on that form most likely
to have been a guess, every invoice of the card is worked out from it, and banks move it.

**A callout with no words in it.** Two new screens titled their refusals with a key that
exists in neither language, so a failure came back headed `rules.somethingWentWrong`. One
sentence started with a day that was never passed to it. An empty account was described in
Portuguese as holding one record. Four sentences wrote the product name out instead of asking
for it. The printed file gave the day it was made and the months of its tables in the shape
the database keeps them in rather than the shape somebody reads. The
benefit line was always in reais. Three figures shared three columns at any width. Nine
sentences nobody reads are gone.

**The registries say what the code does.** Five sentences this release wrote about itself
were ahead of it: the first of the three parts of a month ahead, the list of what a logger
reads whole, a permission a logger does not have, where the projection starts from, and the
three fields of a card. Each one is either corrected or is now true because the code caught
up. The ten routes this release added are in both guides, and so are the four columns and the
three migrations.

**No card is no card, in a browser and on a server alike.** Found by the browser tests and
not by the reading, which is the right way round for this one: the one field that asks what a
record was paid with carries the card and the account together, and for an account with no
card at all it was handing back a card named by the empty half. The repository has always read
an empty identifier as no card and the route refused it as one too short, so the same record
was written in a browser and refused on a server. Both halves are corrected, and the two modes
now answer the same thing whatever reaches them.

**The file is called what it says it is called.** The month on paper names the document, which
is the only say a page has over the name a browser suggests when somebody chooses Save as PDF,
and the shell was writing its own name over it the moment the space arrived. So the file came
out called "Pessoal | Cofre Ink". It only did that in a build: React in development runs an
effect, undoes it and runs it again, which happened to leave the page holding the name, and
the browser test ran against the dev server and passed. Found by opening the built
application and looking at the tab. The test for it runs against the build now.

**A caption said `{{month}}` out loud.** One table on the printed file asked for a sentence
without the month that sentence is written around. Both languages held the same sentence with
the same name in it, so nothing in the build could see it. The check over the two languages
now refuses a sentence a screen asks for without the names it needs, which is the fifth thing
it refuses and the only one that catches a sentence that is right in the file and wrong on the
screen.

**The month screen names the invoice it pays.** It wrote its payment with no invoice on it,
so it fell through to the rule for a payment nobody explained and paid down the oldest invoice
still owing. Somebody filling in three months out of order had each payment land on a month it
was not about.

**A benefit card written down today is not empty.** The allowance of the period somebody is
standing in counts when nothing was typed as the opening balance, which is every card written
down since the form stopped asking for one. A card added on the twentieth used to read as
holding nothing until the fifth of the next month.

**The file for paper prints no keys and no nameless rows.** Money nobody sorted had an empty
first cell against two thirds of a month, and spending with no priority on it was a row headed
with the name of a translation key. The screen next door has had a sentence for each of them
all along. Looking at the pictures of the release is what found these, which is what the
pictures are for.

**The answer fits its column on a telephone.** The band is two figures across at that width
and an amount does not wrap, so the headline ran into the one beside it.

**The migrations are checked against a database that has money in it.** Comparing an empty
database with the described schema says nothing about the one thing a release can break for
somebody: their own file, written by the release before. The suite builds the database 1.0.5
left, fills it with the rows 1.0.5 wrote, upgrades it for real and reads the whole thing back
on every engine.

## 1.0.5

Released on 29 September 2026. The site session read the guide against the code at 1.0.4
and brought what the three origins of that release had not reached. Then, before the tag,
the same reading was turned on this release's own sentences, with instructions to refute
them, and it refuted six and found fault with fourteen more. What that found is in here
too, including a fix of 1.0.5 that had hidden the very thing it set out to show.

> **If you typed a quantity of an investment with three decimal places, check it.**
>
> A quantity went through the reader built for money, and money has a rule that three
> digits after a lone separator are a thousands mark, because nobody writes a third decimal
> place on an amount. A quantity is not money: an eighth of a unit, written 0.125 or 0,125,
> was stored as a hundred and twenty five units, and so was every quantity with exactly
> three digits after a single separator. The repository then multiplied that by the unit
> price, so one mistyped fraction moved the worth of the whole space. Open Investimentos
> and look at the quantities.

### Fixed

**A fraction of a unit is a fraction.** The reader takes the thousands rule as an option
now, money keeps it and a quantity does not, and both are tested at both scales, which
nothing was.

**The automatic run says when it cannot even build a place.** 1.0.4 taught the destinations
to refuse an address that is not one, and put that refusal in the constructor, which the run
called outside its try. So the whole run rejected with nobody holding it: no sentence, no
time recorded, nothing in the console, and a panel still saying Active. The deeper half is
that the question was asked too late, so a line of text that is not an address counted as a
complete place and armed the backup against it. The same rule the destinations use now
answers whether a place is ready, while the person is still looking at the field.

**The two addresses a service hands you are taken as they are**: `libsql://name.turso.io`,
which is what Turso shows, and the host on its own, which is what the hint asks for. Both
were refused with a sentence blaming the connection.

**The fields of a folder go back to the folder.** 1.0.4 split the places apart and read
what it found at face value, so a browser that had hit the 1.0.3 fault came up with the
folder's address and application password filed under the database, and the folder blank.

**Every refusal has a sentence.** Eighteen rules the model can refuse with had none in
either language, so an expired invitation, a personal space that takes no members and an
owner who has to hand the space over before leaving all arrived as "I could not finish
that". The check that keeps the two languages in step now walks the rules the model throws
and refuses a name with no sentence.

**A sentence is about the thing it is about.** A share of a division went through a reader
that turned a comma into nothing readable and answered with the sentence about an amount,
inside a dialog that holds no amounts; a percentage and a quantity borrowed the same one.
Three screens threw a plain error carrying an already translated sentence, which is the one
shape the translator cannot read, so it showed the generic one. And a coding defect that
threw a TypeError was reported as a connection that failed, on an application that in
browser mode has nothing to connect to.

**A failure is shown where the person is looking.** Archiving or deleting from a row wrote
into a callout only a dialog drew, and the three forms of the budget screen and the price
form drew theirs behind the open dialog. Both halves are corrected, and so is the fix
itself: the guard written for it read a name no screen declares, which resolved to the
browser's own `window.open` and was therefore never true, so the sentence was drawn nowhere
at all. There is a test now.

**The controls that stayed outside the one question.** The empty state of the records list,
deleting a card, three empty states with no account, a row of the danger zone, the calendar
writing the series forward, and the door that brings a file back, which writes whole spaces
and asked nothing.

**A logger sees what they wrote, wherever a figure is made of records.** The list, the
reports, the budget and the import held that rule; the balances, the projection, the
savings, the goals and the whole of the diagnosis did not. Where a figure belongs to the
space rather than to a person, an opening balance or what a recurring bill will owe, it
counts as nothing for them rather than being mixed in. The overview and the projection say
whose the figures are, and the diagnosis closes to them, because every threshold behind its
verdict was written for a household. What stays outside the rule is written down in registry
0041, and that list was two entries short when this release shipped, which 1.1.0 corrected.

**One currency in one panel.** The settled list was drawn in the currency each settlement
was written in while the balances above it used the current one, and the division added
amounts as written rather than in the base currency. A space keeps the currency its first
record was written in; correcting it while the space is empty still works.

**A space can be handed to somebody else.** The model has always been able to; no route and
no screen could reach it, while two texts promised it and an owner who tried to leave their
own space was told to hand it over first.

**Removing an instalment plan asks whose it is**, and whether it was ticked off against the
bank, which every other delete path asks. A holding of zero units at zero each is refused.
Writing an amount back into a field uses the minor units of its own currency.

### Changed

**The table of what each role may do is printed from the matrix**, in both guides and both
languages, and the build refuses one that no longer matches. Written by hand, it held eleven
of the thirty five permissions with nothing saying it was a summary.

**The English spelling of one word.** The project writes colour and recognise and never the
other forms, so it is British, and instalment was split down the middle.

## 1.0.4

Released on 28 September 2026. The site session read the guide against the code again, at
1.0.3, and this time it did not bring a list of cases: it brought three families, and asked
for the origin of each rather than the examples. Which role may do what, what a failure
says, and how an amount is read. Every case it found was real.

> **If you typed a limit, a savings rule, a goal or an investment price using a period for
> the cents, check it.**
>
> The reader on those screens deleted every period before looking, so 1000.50 was saved as
> a hundred thousand and 1,000.00 as one real, while the hint under the field said a comma
> or a period would do. The same reader decided the quantities on the investments screen,
> so ten and a half units of a fund were stored as a hundred and five. Nothing was
> corrected for you, because guessing which of those was meant would be worse. Open
> Orçamento and Investimentos and look at the numbers.
>
> **If you had a WebDAV folder set up and then pressed Continuar under "Um banco na
> nuvem", or changed the place in the list, look at the backup panel.** The fields of the
> folder were carried over into the database, so every run sent your application password
> to the folder's address and failed. Each place keeps its own fields now.
>
> Not yours, though: 1.0.4 split the places apart and read what it found at face value, so
> if you had hit that, the folder's address and password ended up filed under the database
> and the folder came up blank. 1.0.5 puts them back where they belong, on the way in.

### Fixed

**What a role may do is asked in one place.** Three screens read the member list and wrote
their own lists of roles; every other screen that writes offered everything to everybody
and let the model refuse it afterwards, in a sentence written for whoever wrote the code.
The lists had already drifted from the matrix nobody was reading. Every control on every
screen that writes now names the permission the repository behind it asks for, so a button
and the refusal behind it cannot disagree. Accounts, categories, budgets, goals, the
savings rule, rules, recurrences, investments, scenarios, spaces, the danger zone, the
import, the records and the one button on the overview.

An unknown role counts as no. Two screens read it as yes, on the strength of a comment
that was not true: creating a space writes a member row for whoever made it, including the
personal one, so a missing role means the list has not arrived or this person is not here.

Importing is nothing but writing records, so a role that writes none of them is told so
instead of being walked through a file, mapping the columns and marking the repeats, and
refused at the end.

**A failure says what happened.** Twenty one places turned an error into words and they
disagreed: nine printed the model's own English, one answered "your role does not allow
that" to everything including a dropped connection, one said the amount could not be read
whatever had gone wrong. Fourteen writes had no handler at all and thirteen of those failed
in silence, among them the quick entry and its undo, archiving and deleting an account,
deleting a whole instalment plan, and marking something as paid on the overview. On a
server it was worse than a bad guess: a rule of the model arrives there in a different
shape, so every check for one was dead code and a genuine rule read as a refusal.

**An amount is read one way.** There were four readers. Two deleted every period before
looking, one read a period and nothing else and turned the Brazilian thousands form into
NaN, and none of the three said anything when they could not read what was typed. On the
investments screen that meant a word, or an amount with its currency symbol still on it,
became zero, and a holding sat there worth nothing with nobody told. The budget refused a
limit of nothing all along, so it never stored one. Writing an amount back had the same
spread: three places put a comma in whatever language was speaking.

**A logger reads their own rows on the import screen too.** The query that marks what looks
familiar in a file filtered on the space alone, so it read back up to five thousand records
of the whole space, with their descriptions and their amounts, for the one role that is
meant to see only what it wrote.

**A destination has to be somewhere else.** A blank address, or a path with no host on it,
is resolved against the address this application is served from, and every one of those
calls carries a credential. Erasing a space with the address blanked out sent a DELETE
there with the application password in the header, and the 404 counted as the copy having
been erased while it sat untouched in the folder. Restoring had the same hole.

**A place that no longer exists is cleared when the application opens**, which is what the
1.0.3 notes promised. It happened on a read of the settings, and the only screen that read
them was the data screen.

### Changed

**The backup panel says what is happening and what was asked for**, which are two facts
that can disagree, and says so plainly when they do. Switching it off no longer needs a
complete place, so a missing field cannot leave a backup on with the only way out greyed
out. The panel reads the settings again whenever they change, wherever they change.

**When the copy has already gone and the erasure then fails**, the dialog says that, and
says the next run writes the copy again.

**Who owes whom reads as a sentence.** "You owes" and "You is owed" were what an English
reader saw on their own row, which is the row they were certain to read. So was "João pays
You", a capitalised pronoun in the middle of a sentence, in both languages.

## 1.0.3

Released on 28 September 2026. The session that keeps the cofre.ink site read the guide
against the code again, at 1.0.2, and found twenty four things. Several of them were
leftovers of the 1.0.2 fixes themselves, including the worst one, which is mine.

> **If you had picked "a server of yours" as the place for the automatic backup, read
> this.**
>
> 1.0.2 said you would find the backup off. Only the name of the place was dropped, so
> the panel said Active beside None configured, offered to schedule it, and hid the one
> button that could have switched it off. Your server address, your email and the
> password you typed into that panel were still in this browser too. All of it goes now,
> the first time you open the application. Your data was never touched.

### Fixed

**A backup with nowhere to write said it was on.** The place and the switch were two
things that could disagree, and they did. The switch is derived from the place now, a
place that no longer exists takes everything of itself away, and picking a name from the
list no longer arms the run: it waits until there is an address and a secret to use,
instead of failing on every pass until they are typed in.

**Erasing a space reached the destination only after the space was already gone here.** A
place that could not be reached at that moment left the space erased on this device, the
backup still on, and the place still holding the whole of it, so the next run brought the
emptied space back. That is the exact thing the question in that dialog was added to
prevent. The copy goes first now, and a place that refuses stops everything with nothing
lost.

**The browser backup leaked into server mode.** Three readers of its settings did not look
at the mode, so the erase dialog offered to delete a file named after a space of the
server, and the panel at the top could say the backup was active in a place nothing was
writing to. The database of the browser was also never put down when the mode changed, so
the thing that backs up on every change kept running the local file against the
identifiers of the server's spaces until the page was reloaded.

**The door that leads to a database erased a WebDAV that was already set up**, address,
user and application password, and left the backup on against nothing.

**A file that is not even JSON showed the complaint of the parser**, in English, on a
Portuguese screen. So did a backup with the right marker and no list of spaces.

**A role was offered things it would be refused.** Inviting, marking a payment, undoing
one, editing, deleting, dividing, sorting everything like this one and ticking off against
the bank were all drawn for everybody and turned down by the model afterwards, in a
sentence written for whoever wrote the code. Undoing a payment failed in complete silence.
The section that says who owes whom stays for everybody, because reading it is not
settling it: what goes for a Viewer and a Logger are the two buttons inside it.

**The month screen counted a household month twice.** A Logger only ever sees the records
they wrote, so that screen looked empty to them even when somebody else had already
written the month, and saving wrote a second set carrying the same three marks, which
nothing refuses. The space then counted the month twice everywhere. That screen is about
the month of the whole household, so it closes to a Logger, who writes through the list as
before.

**The monthly income** was drawn in Brazilian formatting in the English interface, filled
the field with a comma for the cents in both languages, complained about an unreadable
number on the section behind the open dialog, and was hidden from whoever may not set it
under a sentence saying it had never been given, about people who had given it.

### Changed

**Fifteen sentences that were not quite true**, including "You pays João", three hints and
an error message telling an English reader to write the cents after a comma, and two lists
of what the import reads that left out JSON.

**What brings a copy back, said honestly.** Nothing in the interface reads a copy out of a
destination this browser does not already hold. The front door and the troubleshooting
both said a new device brings that copy back, and it does not. They now say what does: a
file you downloaded, and for a WebDAV folder, the file you can fetch from your own cloud
by hand. From an online database there is no path through the interface today.

## 1.0.2

Released on 28 September 2026. The session that keeps the cofre.ink site read every
sentence of the guide against the code while updating it for 1.0.0 and 1.0.1, and wrote
down what did not match. Thirty five things. Every one of them was real, five of them not
quite as described, and this is all of them.

> **If you had picked "a server of yours" as the place for the automatic backup, read
> this.**
>
> It is not one of the places any more, and it never worked: it was skipped by the thing
> that runs on every change, so the panel said it was on and nothing ever left the
> browser. You will find the backup off and no place chosen, with your data untouched.
> Pick a WebDAV folder or an online database, or use your server the way a server is
> used, by running in server mode. Registry 0040 says why.

### Fixed

**Erasing a space undid itself.** With the automatic backup on, an erasure left no
deletion marks, so the copy in the folder was ahead and the next run brought the whole
space back, called it a success and said nothing. The confirmation now asks: the copy goes
with the space, or it stays and the backup is switched off, because a place still holding
the space puts it back within seconds.

**A month of ordinary use made the backup ask a question with no answer.** The change log
folds itself after thirty days and the place keeps every entry it was ever sent, so this
device ends up holding fewer than the place does. The comparison counted every one of
those as something missing, so the first record typed after the first fold reported that
both sides had moved. Keeping both did not help: what it was missing was what it had
decided to stop keeping.

**Changing where the data lives lost the person.** Going back to the first question and
choosing this browser again made a new person every time, and the spaces of the one before
stayed in the file with no screen that reached them. It comes back to the same person,
which is what opening the application normally always did.

**A restore of several spaces could be refused half way through.** Each space is its own
transaction and the permission was asked for inside the loop, so a file of five whose
fourth was refused left three of them written and showed only the refusal. Every refusal
happens before the first write now.

**Replacing the copy after a restore used the wrong identifiers**, the ones in the file
rather than the ones the restore wrote, and threw a raw English sentence after the restore
had already happened.

**A file that is not a backup said nothing.** It opened the confirmation with no space in
it and a button that could not be pressed. The three refusals have words now, in both
languages, and they are said when the file is read.

**A Viewer was offered buttons that refuse.** The save button on the month screen, and the
menu that changes a role or removes somebody, which also failed in silence because the
only place a problem was drawn was inside a dialog that was closed.

**The spreadsheet handed a Logger every record of the space.** The list of records has
always narrowed to the rows a Logger wrote; this is the same space through another door
and now narrows the same way.

**The monthly income read 4500.00 as four hundred and fifty thousand** in the English
interface, because it stripped every dot by hand instead of handing it to the reader every
other amount on screen goes through, which decides the decimal mark from the last
separator in what was typed.

**The count after erasing a space** counted the change log and the invitations, so
somebody who had written a hundred records was told four hundred had gone.

**The automatic backup set itself off.** Backing up by hand, testing the connection,
writing the spreadsheet and handing over a CSV all started a second run four seconds
later, against a place with nothing new to hear.

**The name of a destination was glued to a preposition**, so Portuguese read "Falha ao
conectar ao Uma pasta WebDAV" and English "Could not connect to A WebDAV folder".

### Changed

**A server of yours is not a place the automatic backup writes.** See the warning above.

**Fourteen sentences that named something that is gone.** Three sent somebody to Members,
which became a section of Spaces. Two talked about turning syncing on. One promised that
what is written comes with you when the mode changes. One offered the statement importer a
backup it cannot read. One told an English reader that cards are added in "Nova conta".
The screen that writes a month said all of it lands on the last day of the month, which
was never true of the card one. And the four guides still sent somebody to Data, Backups
and copies, Save a copy.

**The sentences under Viewer and Logger** say what those roles actually do: a Viewer does
change one thing, their own monthly income, and a Logger writes any kind of record and not
only spending.

**Whoever is holding the screen is called "you"** on the division and the settling up too,
in the language the screen is speaking.

## 1.0.1

Released on 28 September 2026. What an audit of 1.0.0 found the morning after it went
out. One of the five is money on a screen and the rest are a screen that could write a
record twice, a sentence in the wrong language, and a pile of figures in the documents
that had stopped being true.

> **If you used the month screen on 1.0.0, read this.**
>
> It charged the card invoice and never paid it. Your total was right the whole time and
> your two accounts were not: the account your wages arrive in kept the invoice it really
> handed over, and the card kept a debt nobody settled. Nothing is repaired on its own.
> Open each month you wrote on that screen and press save again, and the payment is
> written where it belongs.

### Fixed

**The card the month screen charges is now also paid.** An invoice is charged to the card
and then paid from the account, and only the first half was written. So every month the
current account climbed by the whole invoice and the card sank by the same amount. The
two errors are equal and opposite, which is why the total always looked right and why
nothing caught it.

A fourth record is written from the same number, and nothing new is asked: a transfer out
of the chosen account on the day that invoice falls due, which for a card that closes late
in the month is the month after. An invoice that has not fallen due yet is written as
planned rather than settled, so it counts in what is coming rather than in what is there.
Registry 0039 has the reasoning, including why paying the card is not a fourth field.

**A save that failed half way through wrote a second copy when it was tried again.** The
screen only went back to look at what it had written when the save worked, so after a
failure it still believed it had written nothing, and pressing the button again wrote
another copy of whatever had already landed. It reads them again either way now.

**The month screen looked for its own records in a page of days.** It asked for a range
wide enough to hold all of them and read what came back, which in a busy space is a page
that the records can fall off the end of. A record it could not see would have been
written a second time. It asks for them by the mark they carry instead, which is an exact
question, and the filter for that is in the repository, the route and the client alike.

**The English amount example was written in Brazilian.** The one message that appears
after somebody has already mistyped an amount told them to write it like 2.500,00, which
in English reads as two and a half.

### Changed

**The figures and the lists in the documents.** The README counted thirty three decision
records and there are thirty nine, and it repeated the test counts of 0.1.1 unchanged. It
also still offered a file as a place a copy can live, which is the thing 1.0.0 took away.
The only install command in this file pinned 0.1.1, and now reads `latest`. And the
picture the README opens with was taken before the rename, so it showed a wordmark reading
Cofre.

### What is worth knowing before you rely on it

Unchanged from 1.0.0, and worth repeating here rather than leaving in a section three
releases down:

1. **The statement readers have never seen a real bank statement.** They are built from
   the formats and tested against files written for the tests. Expect to correct a column
   mapping the first time, and expect the correction to be remembered.
2. **A copy in a WebDAV folder has only been tested against a stand in**, never against a
   real Nextcloud.
3. **Turnstile has never been tested against the real Cloudflare service**, only against a
   double. The proof of work in front of the sign in has, and it is the one that is on by
   default.
4. **In browser mode there is no password.** The address can be public without exposing
   anything of yours, and whoever opens your browser sees your data. Both are true at the
   same time and the front door says so.

## 1.0.0

Released on 27 September 2026. The first version this project calls finished: everything
it promises works, and two screens that were in the way are gone.

There is a shorter way in. The front door asks the one question that cannot be changed
afterwards, where the data lives, and then shows the application with money in it. And
there is a copy that keeps itself, which is the thing a personal finance application is
asked for most and is the last thing this one was missing.

> **If you are updating from 0.1.1, read this.**
>
> Three things that worked are gone, and one of them may be in use.
>
> **A file the person carries is no longer a sync destination.** Two browsers with no
> server between them used to agree by carrying a packed `cofre_sync_*.json.gz` back and
> forth, merging record by record. That is gone. They exchange a backup instead, which
> moves a money life across and adds what is missing, but does not merge two people
> editing the same record at once. Whoever needs that runs a server, which is what a
> server is for. Any `.json.gz` you already have is still read by Restore from a file.
>
> **A browser holds one person.** The profiles of a device, switching between them and
> renaming yourself are gone. If you made a second profile on a machine, that person and
> their spaces are still in the database and nothing was deleted, but the application
> will not offer to become them again: open their backup, or use a second browser
> profile from now on.
>
> **The form behind the door is gone.** Nothing is asked. What it used to ask is made
> with a default and corrected in one screen.

### Removed

**The form at the door, and the profiles of a device.** A name, an email, a currency and
a space name asked before anybody had seen anything, plus a menu that offered to rename
you, to become somebody else on this machine, or to make room for them. The door asks
one question now. A second person on the same machine uses a second browser profile,
which separates more than this ever did. Registry 0037 has the reasoning.

**The members screen.** Not the members: the screen. Who is in a space, with which role
and what they said they earn, the invitation and the settling up are a section of the
spaces screen now, under the list, for whichever space is open. Nothing was dropped in
the move.

### Fixed

**A backup that could not be brought back.** Two files leave this application and both
hold a whole space: the backup, which is the rows, and the file kept for syncing, which
is the change log two devices exchange. Only the first one could be restored, the second
one was offered a few lines below it under words that sounded the same, and somebody
whose device was gone was told to go back to it and export a backup there.

Bringing a file back now reads both. A log folds into the rows it describes, so the sync
file comes home through the same door, with every rule of a restore unchanged. The
refusal that remains, a personal space of another device meeting the personal space that
is here, is said with the file in hand instead of after the whole log has been written,
and it names the door that does work.

**A whole space could be poured into one that somebody else runs.** Restoring into a
space that already exists asked for no permission at all, so a member who could only
read a shared space could put a file into it. It now asks for the role that exporting a
space asks for, which is the same decision in the other direction.

**Dividing by shares could hand each share to the wrong person.** The shares travelled
as a list in the order the screen reads people, which is by name, and were applied in
the order the space holds them, which is by when they arrived. The two agree only by
luck. A share now travels with the identifier of the person it was typed for.

**Somebody in two shared spaces could not divide anything.** The dialog offered
everybody from every space the person is in, and the model refused a division with
somebody who is not in the space the expense is in, which is right. The dialog now
offers the people of the space that is open, on the division, on who paid, and on the
settle up.

**The days an invoice said it covered, for two closing days.** Under the invoice total
there is a line reading "Compras de X a Y". A card that closes on the first was told its
September invoice ran to the last day of September, when every one of those days is on
the invoice after: that invoice is the whole of August. A card that closes on the thirty
first was told its March invoice began on the twenty eighth of February, a day that is on
the February one, because February has no thirty first for anything to close on. Both
ends are now the days that really land on the invoice they name. Only the sentence was
wrong, and no purchase was ever put on the wrong invoice.

### Added

**A month in three numbers, for whoever will not keep a ledger.** A screen beside the
list, in the records section. It asks for a month and three amounts: what came in, what
went out apart from the card, and what the card invoice came to. That is all the bank and
the card tell somebody without being asked, and it is enough for the balance, the trend,
the check up and the projection to work.

What it writes are three ordinary records, so nothing else in the application had to
change: they are in the list, they count everywhere, the card one is on the invoice of
that month, and any of the three can be opened and corrected like any other record.
Typing the same month again corrects those three instead of writing three more, and
clearing a field takes its record away. Before the fields, the screen says how many
records the month already holds and what they add up to, because somebody who writes a
few by hand and then types the whole month has counted those few twice. Registry 0038 has
the reasoning.

What it does not give is anything that needs a category or a day.

**A backup that keeps itself up to date.** Pick one place, an online database or a WebDAV
folder, test the connection, and turn it on. It covers every space at once, and after that
it runs on every change once the typing stops, plus whichever of two you asked for: when
the application opens, and every so often. A server of yours was offered here too in
1.0.0 and 1.0.1, and 1.0.2 took it out: see that section.

It reads the place before it writes to it, and compares by which entries each side holds
rather than by a date, because two devices that each wrote one record are both newer than
the other. When both sides wrote since they last agreed it stops and asks rather than
choosing, because choosing there means throwing somebody's records away. Keeping both
loses nothing and is offered first. The two answers that do lose something hand you a
file of the side that is going before it goes, so restoring it is the way to undo.

Bringing a file back while it is on asks whether the file should become the copy as well.

### Changed

**A copy is made by a person or by a machine, and the screen has one panel for each.**
The file somebody carries stopped being a destination: a destination is somewhere this
application can reach by itself, and a folder in a downloads directory is somewhere a
person goes. What that costs is that two browsers with no server between them used to
agree by carrying a packed log back and forth, and now they exchange a backup instead,
which moves a money life across but does not merge two people editing at once.

**Backup and copies are one section of the data screen.** Saving a copy took the space
that happened to be open, and the file with every space was hidden under a line about
taking the data to another program. There is one button now. It writes one file, named
`cofre_backup_YYYYMMDD.json`, with whichever spaces were ticked, all of them ticked to
start with, and a space somebody may not copy is shown unticked with the reason. Files
written by earlier versions are still read.

Bringing a file back lists the spaces inside it, all ticked, and brings back the ticked
ones. Reading a statement in is a panel of its own, because it is not a backup. The last
copy saved now reads the oldest among the spaces, because the question behind that line
is whether the data is safe.

## 0.1.1

Released on 26 September 2026. Four things that were wrong on the path the guide
describes, and the interface now opens in the language of wherever it is.

### Fixed

**The example environment kept the data inside the container.** Following the guide
exactly (`cp .env.example .env`, fill `COFRE_SECRET`, `docker compose up -d`) wrote the
database to `./data/cofre.db` instead of to the named volume, because Compose reads
`.env` and the value in it won over the one in `compose.yaml`. The database was inside
the container, so **recreating the container deleted it**, which is what an update does.
The same mechanism sent every invitation link to port 5174, which nothing answers.

Both lines are commented out now, so the container's own defaults apply: `/data/cofre.db`
inside the volume, and `http://localhost:4321`.

> **If you already run a server, read this before you update.**
>
> Look at the boot log:
>
> ```bash
> docker compose logs | grep "storing data"
> ```
>
> If it says `/data/cofre.db`, nothing is wrong and nothing is needed.
>
> **If it says `./data/cofre.db`, your data is inside the container and the copy in the
> volume does not have it.** Before touching anything, open the interface, go to Data and
> export every space. Then correct the `.env`, comparing it against the new
> `.env.example`, bring the container up again and restore what you exported. Do not run
> `docker compose down` or pull a new image first: recreating the container is what
> removes the file.

**The PostgreSQL path could not be followed as written.** Four places said to uncomment
the database service. The service mounts a volume declared in a separate comment at the
bottom of the file, and Compose refuses a whole project where a service mounts a volume
nothing declares, so the documented steps brought nothing up. It is four things now,
said as four: the service, the wait described below, the volume, and
`POSTGRES_PASSWORD`, which the example never mentioned either. The guides also say that
the host is the name of the service and not `localhost`, and that the backup recipe
copies a volume that holds nothing on this path.

**On that same path the first boot could die with `connect ECONNREFUSED`.** PostgreSQL
starts, writes its own files, restarts itself once and only then opens the socket, so a
server that connected the moment the container appeared was refused. The restart policy
brought it back seconds later, which is why it looked like it worked, but a fresh
install failed the first time and said something frightening while doing it. The
database now carries a healthcheck that asks the database itself rather than watching a
port, and the server waits for it.

**A server that would not start pointed at a file nothing reads.** The error said to copy
`.env.example` to `.env` and fill it in. Only Compose reads that file. Started any other
way, the person did exactly what they were told and got the same error. It now says both
cases and which is which.

**The guides promised the API was running after `pnpm dev`.** It is not: the API stops on
its own configuration, because the secret has no default and nothing outside Docker reads
a file to find one. The interface, which is the whole product, comes up and needs
nothing. That is what they say now, with the one line that brings the other half up.

### Changed

**The interface opens in the language of wherever the device is.** It opened in
Portuguese for everybody. Now the first of four answers wins: the `lang` parameter of the
address, the choice this browser holds, the zone of the device (Brazil in Portuguese,
anywhere else in English), and Portuguese when the device will not say. Nothing is asked
of any service, so it behaves the same offline, in a container and on any host. The
button in the header still has the last word, and a language guessed from the clock is
never written down as a choice. The reasoning is in
[decision record 0034](docs/adr/0034_which_language_opens.md).

**The donate link goes to the page in the language being read.**

### Added

Where to donate, in the README and behind the Sponsor button on the repository, which
offers GitHub Sponsors and PayPal.

## 0.1.0

Written on 23 September 2026 and never released: it was never tagged, so there is no
release and no image carrying that number, and 0.1.1 above is the first one there is.
The section is kept because it says what the product is rather than what changed in it,
which is worth reading once and is not worth writing twice.

### What it does

**Records.** Accounts, cards with a real invoice cycle, instalments, transfers, planned
and settled. A whole record written on one line: `market 42.90 yesterday nubank 3x`.

**Sorting.** Categories two levels deep, spending priority, and rules that sort by
themselves and learn from a correction.

**Repeating.** Series that write their own records, and a calendar of what falls due.

**Planning.** Limits per category or per priority, a save first rule, goals with a date,
and a projection of the next months built from what is already written, what repeats,
and what an ordinary month looks like.

**Sharing.** A space has members with roles. An expense splits evenly, by share or by
income, and a settle up says who owes whom, once.

**Reading a statement.** CSV, OFX, QIF, XLSX and JSON, plus a PDF reader written by hand
for card invoices and receipts. Nothing is written before you have seen it.

**Saying something back.** Findings over your own records, each one carrying the figures
it was made from. Nothing about what to buy or where to put money.

**Leaving.** Export as JSON or as a spreadsheet, restore anywhere, keep a copy in a file,
a WebDAV folder, an online database or a Google spreadsheet. Two devices agree by
exchanging a change log, over a server or through a file somebody carries.

**Offline.** The whole interface is kept by a service worker, so it opens on a train.

### The three ways to run it

1. In the browser alone, with the database inside that browser and nothing over the
   network.
2. With a server of your own, as one container carrying the API and the interface.
3. With a cloud you pay for, keeping a copy where you choose.

### What is worth knowing before you rely on it

1. **The statement readers have never seen a real bank statement.** They are built from
   the formats and tested against files written for the tests. Expect to correct a
   column mapping the first time, and expect the correction to be remembered.
2. **A copy in a WebDAV folder has only been tested against a stand in**, never against
   a real Nextcloud.
3. **Turnstile has never been tested against the real Cloudflare service**, only against
   a double. The proof of work in front of the sign in has, and it is the one that is on
   by default.
4. **In browser mode there is no password.** The address can be public without exposing
   anything of yours, and whoever opens your browser sees your data. Both of those are
   true at the same time and the front door says so.

### Installing

The interface is a folder of static files that any host will serve. The server is one
container:

```bash
docker run -d -p 4321:4321 -v cofre:/data -e COFRE_SECRET=... ghcr.io/andreilud/app-cofre-ink:latest
```

The full guide is in [docs/en/deploy.md](docs/en/deploy.md), and in
[Portuguese](docs/pt-BR/deploy.md).
