# ⚽ Football Life Brasil

Jogo de futebol 2D para navegador, com modo carreira de jogador, partidas vistas de cima e decisões durante os lances. Desenvolvido no repositório `jogo-do-dino`.

## O que esta versão entrega

Esta é uma demonstração jogável das **fases 1 e 2** do projeto: criação e personalização do jogador, escolha entre Flamengo e Palmeiras, atributos, treino, amistosos com decisões, evolução, estatísticas e salvamento local. Os amistosos podem ser repetidos para desenvolver a carreira; esta versão não possui calendário de campeonato. O jogo foi feito em JavaScript, HTML e CSS; o campo e os atletas são desenhados em Canvas.

A referência de futebol brasileiro é **2025**. Os nomes e informações usados no protótipo não representam uma base oficial ou atualizada da temporada 2026. As equipes usam identidade visual simplificada desenhada para o jogo; o projeto não inclui escudos oficiais, fotos de atletas ou músicas licenciadas. Não há vínculo com clubes, federações ou competições.

A fonte **Barlow Condensed**, de The Barlow Project Authors, é distribuída localmente sob a **SIL Open Font License 1.1**. A licença e o aviso de copyright acompanham os arquivos em [assets/fonts/OFL.txt](assets/fonts/OFL.txt). Os efeitos sonoros são sintetizados pelo navegador.

## Rodar localmente

Requer **Node.js 22** e npm. Na pasta do repositório:

```bash
npm ci
npm run dev
```

Abra **http://localhost:4173**. O servidor escuta em `0.0.0.0`; para limitar o acesso ao próprio computador, use `HOST=127.0.0.1 npm run dev`. Para outra porta, use `PORT=8080 npm run dev`.

O jogo deve ser aberto pelo servidor, pois usa módulos JavaScript. Abrir `index.html` diretamente pelo gerenciador de arquivos pode bloquear os módulos.

## Como jogar

1. Crie seu jogador e escolha um dos dois clubes da demonstração.
2. Consulte os atributos, faça uma sessão de treino entre partidas e entre em campo. O atleta começa como reserva, com entrada aos 55 minutos, e pode conquistar a titularidade com confiança e condição física suficientes.
3. Durante a partida, escolha entre as ações oferecidas em cada lance, clicando nas opções ou usando as teclas **1 a 5**. As opções dependem da posição do atleta.
4. Ajuste a velocidade para **1x, 2x ou 4x**, pause quando quiser ou use **Próxima decisão** para avançar pelos lances mantendo as animações. **Simular restante** ativa o assistente de decisões; **Assumir decisões** devolve o controle ao jogador.
5. Confira o resultado e a evolução do jogador. Ative ou desative o som conforme preferir.
6. Use **Exportar** para baixar o save em JSON e **Importar** para restaurar um save válido.

O jogador é controlado por decisões na interface. Não é necessário usar as teclas de movimento de um jogo de ação.

As estatísticas de partida mostram a atuação atual ou a última partida. Nesta demonstração, os filtros de ciclo, clube e carreira abrangem os mesmos amistosos, pois ainda não há transferências nem troca de temporada.

## Saves e privacidade

A carreira e a partida em andamento são salvas no `localStorage` do navegador. Ao retornar, use **Continuar partida** na central para retomar o jogo salvo. O jogo não envia saves para um servidor, não exige conta e não inclui telemetria. Limpar os dados do site, mudar de navegador ou usar uma sessão privada pode apagar ou separar o save. Exporte um backup antes de limpar o navegador.

Um save exportado inclui os dados da carreira e o nome escolhido pelo jogador. Guarde e compartilhe esse arquivo apenas quando desejar. A hospedagem pode manter registros técnicos de acesso próprios; esses registros não são criados pelo jogo.

## Revisão e build

```bash
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

Os testes unitários verificam regras e persistência; os testes de navegador verificam o fluxo jogável. O build gera `dist/` apenas com `index.html`, `src/` e `assets/`, sem testes, dependências ou arquivos temporários. Para conferir essa versão:

```bash
node scripts/server.mjs --dist
```

O workflow **Verificar jogo** executa os testes e o build a cada push e pull request, incluindo uma revisão automatizada no Chromium.

## Publicar no GitHub Pages

1. No GitHub, abra **Settings → Pages** do repositório.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Abra **Actions → Publicar no GitHub Pages → Run workflow**.
4. Selecione a branch que contém o jogo e execute o workflow.
5. Ao concluir, a etapa de deploy exibe o endereço publicado. Para este repositório, o endereço esperado é `https://luan-henrique-21-29.github.io/jogo-do-dino/`.

A publicação é **manual**: um push executa a verificação, mas não inicia o deploy. Os caminhos dos recursos são relativos para funcionar também na pasta do repositório no GitHub Pages.

## Próximas fases

O campeonato brasileiro completo com **20 clubes e 38 rodadas**, calendário real, elencos completos, transferências entre todos os clubes, contratos e histórico de temporadas faz parte do roadmap e **não está implementado nesta demonstração**. Também permanecem como próximas etapas o aprofundamento da inteligência dos jogadores, mais eventos de carreira, mais animações e revisão de acessibilidade.

## Arquivos principais

- `index.html`: entrada do jogo.
- `src/`: interface, regras de carreira, simulação e renderização.
- `assets/`: ícone e fonte local com sua licença.
- `tests/`: verificação das regras e do fluxo no navegador.
- `scripts/`: servidor local e build sem dependências em tempo de execução.
- `.github/workflows/`: verificação automática e publicação manual.
