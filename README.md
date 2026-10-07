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
2. Em **SQL Editor**, rode `supabase/schema.sql` e depois as migrações `supabase/migracao-002-admissao.sql` e `supabase/migracao-003-financeiro.sql`, nessa ordem.
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
