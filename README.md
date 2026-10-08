# Site da BIMCORE — bimcore.com.br

Site institucional, área do cooperado e área interna da coordenação.
HTML, CSS e JavaScript puros: não precisa de compilação. Login e banco de dados no Supabase (plano gratuito).

## Estrutura

| Arquivo | O que é |
|---|---|
| `index.html` | Site público, com formulário de contato |
| `entrar.html` | Login, cadastro de novos cooperados e recuperação de senha |
| `painel.html` | Área do cooperado: comunicados, lançamento de horas, documentos, perfil |
| `interno.html` | Área da coordenação: cooperados, projetos, produção (IEO), comunicados, documentos, mensagens |
| `assets/js/config.js` | **Único arquivo a configurar**: endereço e chave do Supabase |
| `supabase/schema.sql` | Tabelas e regras de segurança do banco |
| `.htaccess` | HTTPS obrigatório, página 404 e cache (Hostinger) |

## Modo demonstração

Com `config.js` vazio, tudo funciona com dados de exemplo guardados no navegador:

- Coordenação: `coordenacao@bimcore.demo` / `demo1234`
- Cooperado: `cooperado@bimcore.demo` / `demo1234`

## Ligar o banco real (uma vez)

1. Em supabase.com, crie o projeto `bimcore` (região São Paulo).
2. Em **SQL Editor**, rode `supabase/schema.sql` e depois as migrações `supabase/migracao-002-admissao.sql` `supabase/migracao-003-financeiro.sql` `supabase/migracao-004-planilha-financeira.sql` `supabase/migracao-005-vinculo-automatico.sql` `supabase/migracao-006-pix-e-abatimento.sql`, `supabase/migracao-007-sistema-financeiro.sql` `supabase/migracao-008-retiradas.sql` `supabase/migracao-009-enquadramento.sql` e `supabase/migracao-010-experiencia-interna.sql`, nessa ordem.
3. Em **Authentication > URL Configuration**, coloque `https://bimcore.com.br` em *Site URL* e adicione `https://bimcore.com.br/**` em *Redirect URLs*.
4. Em **Project Settings > API**, copie *Project URL* e *anon public key* para `assets/js/config.js`.
5. Publique os arquivos, cadastre-se em `bimcore.com.br/entrar.html` e rode no SQL Editor:

```sql
update public.perfis set papel = 'coordenacao', status = 'ativo'
where email = 'bimcorecooperativa@gmail.com';
```

## Publicar na Hostinger

Envie todo o conteúdo desta pasta (inclusive o `.htaccess`) para `public_html` pelo Gerenciador de Arquivos do hPanel.

## Regras de acesso

- Quem quer entrar envia uma **solicitação de admissão** (área, formação, registro, experiência, motivação). Ela fica **em análise** e só vê a tela de acompanhamento. A coordenação avalia na aba *Solicitações de admissão*: chamar para conversa, aprovar ou não aprovar, com parecer interno.
- Cooperado ativo lê comunicados, documentos e projetos, e vê e lança apenas as próprias horas.
- Coordenação vê e gerencia tudo. Cooperados não conseguem mudar o próprio papel ou status (bloqueado no banco).
- Mensagens do site podem ser enviadas por qualquer visitante, mas só a coordenação lê.
- **Financeiro:** a tesouraria (coordenação ou cooperado com a marcação *Tesouraria*) baixa a planilha modelo em *Área interna > Financeiro*, atualiza os valores e envia de volta. Cada cooperado vê só a própria posição em *Minha conta*. Um envio errado pode ser desfeito no histórico.

## Financeiro (tesouraria)

1. Na área interna → **Financeiro**, a tesoureira envia a planilha completa (`.xlsx`).
2. O site lê a aba **Posição** (identifica o cooperado pelo e-mail ou pelo nome; quem ainda não tem cadastro recebe os valores automaticamente ao se cadastrar), as abas mensais `AAAA-MM`, **Pagamentos**, **Resumo** e a data de fechamento em **Parâmetros**.
3. Ao confirmar, o arquivo enviado passa a ser a **planilha atual**: o botão "Baixar planilha atual" sempre entrega a última versão enviada, que serve de base para a próxima atualização.
4. Cada cooperado vê em **Minha conta** apenas a própria posição, aportes e contribuições mês a mês.

As planilhas financeiras ficam no bucket privado `financeiro` do Supabase — nunca as coloque neste repositório (ele é público).

### Pix e abatimento com aportes

- Em **Minha conta**, o cooperado com valor em aberto escolhe quanto pagar e o site gera o QR code / Pix copia e cola (chave CNPJ 66.004.522/0001-70, BTG). Depois de pagar, ele clica em **Já fiz o Pix** (comprovante opcional).
- A tesouraria vê os Pix em **Financeiro → Pix aguardando confirmação**, confere no extrato e confirma ou recusa. Confirmado, o valor sai do em aberto na hora.
- Quem tem aportes pode usá-los, sozinho, só para integralizar as quotas iniciais. O limite é validado no banco (`abater_com_aportes`).
- Ao clicar em **Baixar planilha atual**, os lançamentos confirmados entram na aba **Lançamentos do site**. A tesoureira abre no Excel, salva e envia de volta; o site recusa o arquivo se ele não foi recalculado e marca os lançamentos como incorporados.
- Bibliotecas locais em `assets/vendor/`: qrcode-generator 1.4.4 e ExcelJS 4.4.0 (MIT).

### Sistema financeiro (etapa 1)

Com `fin_parametros.modo = 'sistema'` (migração 007), a tesouraria lança tudo em **Financeiro**: despesas (cobradas ou não), pagamentos e aportes, contribuições mensais, integralizações e o cadastro financeiro de cada cooperado (mesmo sem conta no site). O site calcula a posição pelo Estatuto com a mesma lógica da planilha (`Fin.calcular` em `assets/js/financeiro.js`) e exporta tudo para Excel. Pix confirmados e abatimentos entram sozinhos como lançamentos. Os dados financeiros ficam só no Supabase, nunca neste repositório.

### Sistema financeiro (etapa 2)

Migração 008. Aba **Fechamento do mês**: a tesouraria informa horas (ou puxa de "Minhas horas"), dias, 13º e férias pagos; o site calcula retirada pelo valor-hora da categoria (art. 8º), INSS até o teto, contribuição de 1,5%, FIC (5,5% sobre o mês anterior + voluntário), provisões de 13º e férias, auxílios e líquido. Aba **Cooperativa**: movimento mensal, custo de operação, INSS patronal e apuração das sobras (reserva, FATES, FEI, rateio por horas). Todos os percentuais e a tabela salarial ficam em **Configurações**. Cálculo conferido célula a célula com a planilha.

### Enquadramento automático (art. 8º, IV e V)

Migração 009. Em **Minha experiência**, o cooperado envia formações (diploma/registro) e experiências com comprovantes. A coordenação ou a tesouraria valida em **Financeiro → Cadastro → Experiência** (o banco impede validar o próprio registro). O site soma só os períodos validados ligados à formação usada na cooperativa (técnico: conta a prática anterior ao diploma; superior: só depois do diploma — ambos configuráveis) e define a categoria mês a mês: até 5 anos Júnior, 6–10 Pleno, 11+ Sênior (teto). Coordenador só com designação formal e mais de 10 anos. A progressão é automática.

Experiência na BIMCORE (migração 010): conta sozinha pelas horas lançadas (ou do fechamento) desde a admissão. Mês de referência = dias úteis × 6 h (sem fins de semana, feriados nacionais, Sexta-feira Santa, Carnaval, Corpus Christi e os feriados estaduais/municipais configurados: 20/01, 06/02 e 23/04 por padrão). Cada mês vale no máximo 1 mês de experiência; 11 meses fecham 1 ano (recesso). Períodos já cobertos por experiência externa validada não contam em dobro.
