# Cofre: briefing do produto

Documento de referência da Fase 0. Descreve o que o produto é, para quem, o que ele
não é, como está organizado e em que ordem vai ser construído. As decisões técnicas
ficam nos registros em `docs/adr`.

## Em uma frase

Cofre é um painel de finanças pessoais que você hospeda onde quiser, com espaços
separados para o seu dinheiro e para o dinheiro que você divide com outras pessoas.

## Para quem

1. Quem já tentou planilha e desistiu porque manter a planilha virou um segundo
   trabalho.
2. Quem não quer entregar login do banco para um aplicativo de terceiro.
3. Quem divide contas com alguém (casal, família, república) e hoje resolve isso em
   conversa de mensagem, perdendo o histórico.
4. Quem gosta de entender a própria vida financeira com gráfico e número, não só com
   saldo do extrato.

## O problema

Os aplicativos populares de finanças pedem duas coisas em troca: os seus dados e uma
assinatura. Eles guardam o seu histórico no servidor deles, decidem quando desligar o
serviço e raramente separam bem o que é seu do que é do casal ou da casa. As planilhas
resolvem a privacidade e falham em tudo o mais: não avisam de vencimento, não importam
extrato, não projetam o mês que vem e quebram quando duas pessoas mexem juntas.

O Cofre fica no meio: a profundidade de um aplicativo bom, com os dados no lugar que
você escolher e o código aberto para qualquer um auditar.

## Princípios

1. **Seus dados, sua infraestrutura.** Nada sai do dispositivo ou do seu servidor sem
   uma ação explícita sua, e a tela avisa quando isso vai acontecer.
2. **Simples por fora, completo por dentro.** A complexidade mora no código. Na tela,
   a tarefa mais comum tem o caminho mais curto.
3. **Registrar um gasto precisa ser rápido a ponto de virar hábito.** Se registrar dói,
   o resto do produto não existe.
4. **O número precisa dizer alguma coisa.** Todo gráfico tem um título que afirma o
   que aconteceu e oferece a tabela equivalente.
5. **Errar é barato.** Desfazer no lugar de confirmar, sempre que possível.
6. **Nunca lançar no espaço errado.** A interface deixa evidente, o tempo todo, onde o
   registro vai cair.
7. **Educação, não recomendação.** Simuladores e projeções são ferramentas de estudo.
   O produto não indica investimento.

## Como o produto se organiza

1. **Espaço.** Recorte do dinheiro. Toda pessoa tem um espaço pessoal, privado e não
   compartilhável. Espaços compartilhados têm membros, papéis e divisão de despesas.
   Cada espaço tem nome, cor e ícone.
2. **Conta.** Onde o dinheiro está: corrente, poupança, dinheiro em espécie, cartão de
   crédito, vale refeição, investimento, conta em outra moeda.
3. **Lançamento.** Receita, despesa ou transferência. Pode ser parcelado, dividido
   entre categorias, dividido entre pessoas, previsto ou efetivado.
4. **Categoria e prioridade.** Categoria diz onde o dinheiro foi. Prioridade diz o
   quanto aquilo era necessário: essencial, importante, desejável ou supérfluo.
5. **Recorrência.** O que se repete: aluguel, assinatura, salário.
6. **Orçamento e meta.** Quanto você combinou de gastar e quanto combinou de guardar.
7. **Acerto de contas.** O saldo entre membros de um espaço compartilhado e o registro
   de quando ele foi zerado.

## Modos de uso

| modo | onde os dados ficam | para quem |
| --- | --- | --- |
| Navegador | no próprio dispositivo, em OPFS | quem quer testar em um clique, e a demo pública |
| Servidor próprio | SQLite ou PostgreSQL em casa ou numa VPS | quem já tem servidor e quer sincronizar com outras pessoas |
| Nuvem | PostgreSQL gerenciado, frontend hospedado | quem não quer manter servidor |
| Desktop | SQLite local, aplicativo instalado | quem quer um aplicativo de verdade, offline |

Migrar de um modo para outro é exportação e importação, sem perda.

## Papéis dentro de um espaço

| papel | pode |
| --- | --- |
| dono | tudo, inclusive apagar o espaço e transferir a posse |
| administrador | tudo, menos apagar o espaço e transferir a posse |
| editor | registrar, editar e apagar lançamentos, contas, metas e orçamentos |
| leitor | somente visualizar |
| registrador | apenas criar lançamentos e ver os próprios, pensado para filhos e para quem ajuda com a casa |

## O que o Cofre não é

1. Não é agregador bancário. Não pede senha do seu banco e não usa Open Finance por
   enquanto. A entrada de dados é por importação de arquivo, por leitura de fatura ou
   pelo registro manual rápido.
2. Não é consultor de investimentos. Não indica ativo, não promete rentabilidade.
3. Não é serviço hospedado por mim. É código que você roda.
4. Não coleta métrica de uso, não tem conta obrigatória e não tem plano pago.

## Cenários que guiam as telas

1. **Andrei, sozinho.** Almoçou fora, pega o celular na fila do caixa e registra em
   três segundos: valor, categoria sugerida, conta certa, pronto.
2. **Casal dividindo a casa.** Ana ganha mais que João, e eles combinaram dividir as
   contas da casa proporcional à renda. O mercado entra no espaço Casa, a divisão é
   calculada sozinha, e no fim do mês o app diz quem paga quanto para quem, com um
   botão para registrar o Pix do acerto.
3. **República de quatro pessoas.** Cada um registra o que pagou, todos veem o mesmo
   painel, ninguém precisa confiar na memória de ninguém.
4. **Começo do mês.** A pessoa abre o painel e vê quanto pode gastar por dia até o fim
   do mês, o que vence nos próximos dias e se a regra de guardar dinheiro foi
   cumprida.

## Sinais de que deu certo

1. Registrar um gasto novo leva menos de cinco segundos no celular.
2. Importar um extrato de banco leva menos de um minuto, inclusive na primeira vez.
3. O painel responde as quatro perguntas de abertura sem rolar a tela.
4. Uma pessoa que nunca viu o app consegue criar um espaço compartilhado e convidar
   alguém sem ler documentação.
5. Eu uso o app todo dia com as minhas contas reais.

## Ordem de construção

Cada fase termina com lint, tipos, testes, build, screenshots revisadas e um resumo.
Fases grandes vêm divididas em blocos, e cada bloco tem a sua própria revisão.

**Fase 1. Fundação.**
Bloco A: prova de conceito do SQLite no navegador com OPFS servido pelo GitHub Pages,
monorepo, integração contínua, verificador da regra de escrita, design system com os
tokens da direção Papel e tinta.
Bloco B: modelo de dados já preparado para sincronização, camada de repositórios com
os adaptadores de navegador, servidor e PostgreSQL, suíte de integração única e testes
de permissão em todos eles.
Bloco C: autenticação, espaços, papéis, convites, onboarding curto, internacionalização
e a casca do aplicativo com paleta de comandos.

**Fase 2.** Contas e carteiras, lançamentos, cartão de crédito com fatura, compra
parcelada, transferência, registro rápido, busca com filtros.

**Fase 3.** Categorias, subcategorias, prioridade dos gastos, regras automáticas que
aprendem com correções, recorrências, contas fixas e calendário financeiro.

**Fase 4.** Orçamento em quatro métodos, regra de pagar a si mesmo primeiro, metas de
economia, divisão de despesas, acerto de contas e alertas.

**Fase 5.** Painel inicial, visão consolidada, fluxo de caixa, Sankey, patrimônio
líquido, mapa de calor, comparações e relatórios.

**Fase 6.** Importação de CSV, OFX, QIF, XLSX e JSON, exportação e backup, migração
entre modos e o motor de sincronização entre membros. Além do servidor próprio, a
cópia pode viver num arquivo que a pessoa move, numa pasta WebDAV, no Dropbox ou no
Google Drive, e os lançamentos podem ser espelhados numa planilha do Google. Cada lugar
diz na tela o que custa. O registro 0017 explica o porquê de cada escolha.

**Fase 7.** Reconhecimento de fatura e comprovante, em camadas, do texto do PDF ao
modelo de linguagem opcional com chave do próprio usuário. As duas primeiras camadas
estão prontas e são as que resolvem a maioria dos documentos: o leitor de PDF e o
reconhecedor com grau de confiança por linha. O modelo de linguagem continua opcional e
não entrou: nenhum dado sai do aparelho sem que a pessoa mande.

**Fase 8.** Projeções de 1 a 36 meses, cenários, simulador de hipóteses, carteira de
investimentos, comparação com CDI, Selic e IPCA, juros compostos e independência
financeira.

**Fase 9.** Aplicativo desktop com Tauri, PWA instalável, publicação da demo e guias
de implantação dos quatro modos.

**Fase 10.** Auditoria de acessibilidade, revisão de todos os textos, desempenho,
README, LEIAME, screenshots e o GIF de abertura.

## Riscos e como reduzo cada um

| risco | tamanho | o que faço |
| --- | --- | --- |
| SQLite no navegador não funcionar bem no GitHub Pages | alto | é a primeira tarefa da Fase 1, antes de qualquer tela. Plano B documentado no registro 0002 |
| Motor de sincronização próprio consumir tempo demais | alto | o modelo de dados nasce pronto na Fase 1, o motor só entra na Fase 6, e até lá o app funciona sem ele |
| Escopo grande demais e nada terminado | alto | cada fase entrega algo usável de ponta a ponta, e a demo pública sobe já na Fase 1 |
| Leitura de fatura acertar pouco | médio | pipeline em camadas, tela de revisão com nível de confiança e nunca importação silenciosa |
| Interface densa demais na direção Papel e tinta | médio | revisão de acessibilidade e de densidade ao fim de cada bloco de interface |
| Manter quatro modos de implantação | médio | uma suíte de integração só, rodando em todos os adaptadores, e guias testados de verdade |

## Registros de decisão

Os detalhes técnicos e as alternativas descartadas estão em `docs/adr`, do 0001 ao
0017.
