const app = require('./server');
const { rebuildAll } = require('./server');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

(async () => {
    try {
        console.log('Iniciando reconstrução estática na inicialização do servidor...');
        await rebuildAll();
        console.log('Reconstrução estática concluída. Iniciando servidor HTTP...');
    } catch (error) {
        console.error('Erro ao reconstruir páginas estáticas na inicialização:', error);
    }

    app.listen(PORT, HOST, () => {
        console.log(`Servidor iniciado em http://${HOST}:${PORT}`);
    });
})();
