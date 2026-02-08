Painel de Ajuda - TopPlay
home (store): ajuda.tplay21.in 
painel: ajuda.tplay21.in/painel
pagina de apps: ajuda.tplay21.in
pagina de video tutoriais: ajuda.tplay21.in/tutorial


No painel deve ser possivel criar paginas como a do template para aplicativos com informações de download e instalação para diferentes dispositivos, assim como tutoriais em video, fortos da interface, logo do app etc, seguindo as boas praticas de design.
na home nós vamos ter uma especie de loja de apps (com os apps que forem configurados pra ficar visiveis nela)

Sistema usa hospedagem compartilhada da hostinger;
o intuito é ter um sistema robusto e seguro, com alta performance, para que os usuários possam ter uma boa experiência ao usar o painel. E assim facilitar o uso de forma intuitiva e amigável.

Sem conteúdo genéricos!

Sempre pense em duas coisas:
1. Código (pode trocar inteiro).
2. Dados de produção (devem ser reaproveitados).
Trate data/apps.json e public/uploads/ como banco de dados .

Garanta que o repositório NÃO versiona os dados de produção:

- Em .gitignore (no seu repositório), certifique-se de ter:
data/apps.json
public/uploads/
public/apps/